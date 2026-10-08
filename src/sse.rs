//! Server-Sent Events that stream Markdown into a [`Markstream`](crate::Markstream).
//!
//! # Protocol
//!
//! | Event | Data | Effect in the browser |
//! |---|---|---|
//! | `chunk` | JSON string | Add the text to the end. |
//! | `replace` | JSON string | Replace all text. |
//! | `done` | `null` | Mark the text final. Close the stream. |
//! | `error` | `null` | Mark the text final and failed. Close the stream. |
//!
//! The data is JSON, so each string round-trips: leading spaces, `\r`,
//! `\n` and Unicode stay the same. `done` and `error` carry `null`,
//! because a browser does not dispatch an event with no data.
//!
//! The browser does not reconnect. A reconnect would start the stream
//! again and show the text two times. A stream that stops before `done`
//! shows the error state.
//!
//! ```rust,no_run
//! use autumn_plugin_markstream::sse::markstream_sse;
//! use futures_util::stream;
//!
//! # fn handler() -> impl autumn_web::reexports::axum::response::IntoResponse {
//! markstream_sse(stream::iter(["# Title\n", "Some ", "*text*."]))
//! # }
//! ```

use std::convert::Infallible;

use autumn_web::sse::{Event, Sse};
use futures_util::{Stream, StreamExt as _, stream};

/// Event name: add text.
pub const EVENT_CHUNK: &str = "chunk";
/// Event name: replace all text.
pub const EVENT_REPLACE: &str = "replace";
/// Event name: the stream is complete.
pub const EVENT_DONE: &str = "done";
/// Event name: the stream failed.
pub const EVENT_ERROR: &str = "error";

/// One markstream event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamEvent {
    /// Add this text to the end.
    Chunk(String),
    /// Replace all text with this text.
    Replace(String),
    /// The stream is complete.
    Done,
    /// The stream failed. The event has no details.
    Error,
}

impl StreamEvent {
    /// Makes a [`StreamEvent::Chunk`].
    pub fn chunk(text: impl Into<String>) -> Self {
        Self::Chunk(text.into())
    }

    /// Makes a [`StreamEvent::Replace`].
    pub fn replace(text: impl Into<String>) -> Self {
        Self::Replace(text.into())
    }

    /// The SSE event name.
    #[must_use]
    pub const fn name(&self) -> &'static str {
        match self {
            Self::Chunk(_) => EVENT_CHUNK,
            Self::Replace(_) => EVENT_REPLACE,
            Self::Done => EVENT_DONE,
            Self::Error => EVENT_ERROR,
        }
    }

    /// The SSE data: a JSON string, or `null`.
    #[must_use]
    pub fn data(&self) -> String {
        match self {
            Self::Chunk(text) | Self::Replace(text) => {
                serde_json::Value::String(text.clone()).to_string()
            }
            Self::Done | Self::Error => "null".to_owned(),
        }
    }
}

impl From<StreamEvent> for Event {
    fn from(event: StreamEvent) -> Self {
        Self::default().event(event.name()).data(event.data())
    }
}

/// Turns text chunks into markstream events.
///
/// It skips empty chunks and sends [`StreamEvent::Done`] at the end.
pub fn stream_events<S, T>(chunks: S) -> impl Stream<Item = StreamEvent>
where
    S: Stream<Item = T>,
    T: Into<String>,
{
    try_stream_events(chunks.map(Ok::<T, Infallible>))
}

/// Turns fallible text chunks into markstream events.
///
/// It skips empty chunks. At the first `Err` it sends [`StreamEvent::Error`]
/// and stops. Else it sends [`StreamEvent::Done`] at the end. Exactly one of
/// `Done` and `Error` comes, and it comes last. The error value does not go
/// to the client. Log it before this function if you need it.
pub fn try_stream_events<S, T, E>(chunks: S) -> impl Stream<Item = StreamEvent>
where
    S: Stream<Item = Result<T, E>>,
    T: Into<String>,
{
    stream::unfold(Some(Box::pin(chunks)), |state| async move {
        let mut chunks = state?;
        loop {
            match chunks.next().await {
                Some(Ok(text)) => {
                    let text = text.into();
                    if !text.is_empty() {
                        return Some((StreamEvent::Chunk(text), Some(chunks)));
                    }
                }
                Some(Err(_)) => return Some((StreamEvent::Error, None)),
                None => return Some((StreamEvent::Done, None)),
            }
        }
    })
}

/// Makes an SSE response from text chunks.
///
/// Use it as the handler response for a [`Markstream::stream`] URL. It
/// sends keep-alive comments every 15 seconds.
///
/// [`Markstream::stream`]: crate::Markstream::stream
pub fn markstream_sse<S, T>(chunks: S) -> Sse<impl Stream<Item = Result<Event, Infallible>>>
where
    S: Stream<Item = T> + Send + 'static,
    T: Into<String> + 'static,
{
    try_markstream_sse(chunks.map(Ok::<T, Infallible>))
}

/// Makes an SSE response from fallible text chunks.
///
/// See [`try_stream_events`] for the error rules.
pub fn try_markstream_sse<S, T, E>(chunks: S) -> Sse<impl Stream<Item = Result<Event, Infallible>>>
where
    S: Stream<Item = Result<T, E>> + Send + 'static,
    T: Into<String> + 'static,
    E: 'static,
{
    let events = try_stream_events(chunks).map(|event| Ok(Event::from(event)));
    Sse::new(events).keep_alive(autumn_web::sse::keep_alive())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::parse_sse;
    use autumn_web::reexports::axum::{self, response::IntoResponse as _};
    use autumn_web::sse::Event;
    use futures_util::stream;
    use proptest::prelude::*;

    /// Reference model: the events for `items`, in order.
    fn model(items: &[Result<String, ()>]) -> Vec<StreamEvent> {
        let mut out = Vec::new();
        for item in items {
            match item {
                Ok(s) if s.is_empty() => {}
                Ok(s) => out.push(StreamEvent::Chunk(s.clone())),
                Err(()) => {
                    out.push(StreamEvent::Error);
                    return out;
                }
            }
        }
        out.push(StreamEvent::Done);
        out
    }

    fn block_on<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(f)
    }

    /// The events a browser dispatches for the response that `make`
    /// builds. `make` runs in the runtime: keep-alive needs a reactor.
    fn wire<R: axum::response::IntoResponse>(make: impl FnOnce() -> R) -> Vec<(String, String)> {
        let body = block_on(async move {
            axum::body::to_bytes(make().into_response().into_body(), usize::MAX).await
        })
        .expect("body");
        parse_sse(std::str::from_utf8(&body).expect("utf-8"))
    }

    #[test]
    fn event_names_and_payloads() {
        let cases = [
            (StreamEvent::chunk("a"), "chunk", r#""a""#),
            (StreamEvent::replace("b\n"), "replace", r#""b\n""#),
            (StreamEvent::Done, "done", "null"),
            (StreamEvent::Error, "error", "null"),
        ];
        for (event, name, data) in cases {
            assert_eq!(event.name(), name);
            assert_eq!(event.data(), data);
        }
        assert_eq!(
            [EVENT_CHUNK, EVENT_REPLACE, EVENT_DONE, EVENT_ERROR],
            ["chunk", "replace", "done", "error"]
        );
    }

    #[test]
    fn each_event_dispatches_in_a_browser() {
        // An empty data buffer does not dispatch. `done` must carry data.
        let events = [
            StreamEvent::chunk(""),
            StreamEvent::Done,
            StreamEvent::Error,
        ];
        let body = stream::iter(events.map(|e| Ok::<_, std::convert::Infallible>(e.into())));
        let got = wire(|| axum::response::sse::Sse::new(body));
        let names: Vec<_> = got.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, ["chunk", "done", "error"]);
    }

    #[test]
    fn errors_stop_the_stream_and_hide_details() {
        let items = stream::iter([Ok("a"), Err("db password is hunter2"), Ok("b")]);
        let got = block_on(try_stream_events(items).collect::<Vec<_>>());
        assert_eq!(got, [StreamEvent::chunk("a"), StreamEvent::Error]);
        let body = wire(|| {
            try_markstream_sse(stream::iter([
                Ok::<_, String>("a"),
                Err("hunter2".to_owned()),
            ]))
        });
        assert_eq!(body.last().map(|(n, _)| n.as_str()), Some("error"));
        assert!(body.iter().all(|(_, d)| !d.contains("hunter2")), "{body:?}");
    }

    #[tokio::test]
    async fn sse_response_has_event_stream_type() {
        let response = markstream_sse(stream::iter(["x"])).into_response();
        assert_eq!(response.headers()["content-type"], "text/event-stream");
    }

    proptest! {
        #[test]
        fn events_match_the_model(items in prop::collection::vec(
            prop_oneof![4 => any::<String>().prop_map(Ok), 1 => Just(Err(()))], 0..12)
        ) {
            let got = block_on(try_stream_events(stream::iter(items.clone())).collect::<Vec<_>>());
            prop_assert_eq!(&got, &model(&items));
            let terminal = got.iter().filter(|e| matches!(e, StreamEvent::Done | StreamEvent::Error)).count();
            prop_assert_eq!(terminal, 1);
            prop_assert!(matches!(got.last(), Some(StreamEvent::Done | StreamEvent::Error)));
        }

        #[test]
        fn chunks_round_trip_through_the_wire(chunks in prop::collection::vec(any::<String>(), 0..8)) {
            let input = chunks.clone();
            let got = wire(move || markstream_sse(stream::iter(input)));
            let mut text = String::new();
            for (name, data) in &got[..got.len() - 1] {
                prop_assert_eq!(name, "chunk");
                let s: String = serde_json::from_str(data).expect("JSON string");
                text.push_str(&s);
            }
            prop_assert_eq!(got.last().map(|(n, _)| n.as_str()), Some("done"));
            prop_assert_eq!(text, chunks.concat());
        }

        #[test]
        fn replace_round_trips(s in any::<String>()) {
            let event = StreamEvent::replace(s.clone());
            let got = wire(move || axum::response::sse::Sse::new(stream::iter([
                Ok::<_, std::convert::Infallible>(Event::from(event)),
            ])));
            prop_assert_eq!(got.len(), 1);
            let back: String = serde_json::from_str(&got[0].1).expect("JSON");
            prop_assert_eq!(back, s);
        }
    }
}
