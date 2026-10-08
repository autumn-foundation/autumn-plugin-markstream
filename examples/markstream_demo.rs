//! markstream demo: static Markdown, a live stream, and htmx swaps.
//!
//! ```sh
//! cargo run --example markstream_demo
//! ```
//!
//! Open <http://127.0.0.1:3000>. The page shows:
//!
//! 1. A static Markdown document.
//! 2. A Markdown answer that streams over Server-Sent Events.
//! 3. An "Ask again" button. htmx adds a new streaming answer. The init
//!    module mounts it after the swap.
//!
//! Set `MARKSTREAM_DEMO_DELAY_MS` to change the delay between chunks.
//! All JS and CSS are external files: the default CSP blocks inline code.

use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

use autumn_plugin_markstream::sse::markstream_sse;
use autumn_plugin_markstream::{Markstream, MarkstreamPlugin, Mode, markstream_head};
use autumn_web::assets::asset_url;
use autumn_web::reexports::axum::extract::Path;
use autumn_web::reexports::axum::response::IntoResponse;
use autumn_web::{Markup, html};
use futures_util::stream;

static STATIC: autumn_web::include_dir::Dir = autumn_web::embed_static!();
static ASKED: AtomicU32 = AtomicU32::new(0);

const GUIDE: &str = "# Static Markdown\n\n\
This block is **server-rendered** source. The init module mounts markstream \
on it.\n\n\
- Lists\n- `inline code`\n- [Links](https://markstream.simonhe.me)\n\n\
| Feature | Status |\n|---|---|\n| Tables | yes |\n| Raw HTML | escaped |\n\n\
<b>This raw HTML shows as text.</b>\n\n\
```rust\nfn main() {\n    println!(\"hello\");\n}\n```\n";

const ANSWERS: [&str; 2] = [
    "## Streaming answer\n\nThe server sends this text in **small chunks**. \
     Each chunk is a JSON string in an SSE `chunk` event.\n\n\
     1. The browser adds each chunk.\n2. markstream parses the text again.\n\
     3. A `done` event marks the text final.\n\n> No reconnect, no double text.\n",
    "### Another answer\n\nhtmx swapped this container in. The init module \
     found it on `htmx:load` and opened its stream.\n\n```text\nchunk → chunk → done\n```\n",
];

#[autumn_web::main]
async fn main() {
    autumn_web::app()
        .plugin(MarkstreamPlugin::new())
        .embedded_static(&STATIC)
        .routes(autumn_web::routes![index, ask, answer])
        .run()
        .await;
}

fn layout(content: &Markup) -> Markup {
    html! {
        (maud::DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                meta name="viewport" content="width=device-width, initial-scale=1";
                title { "markstream demo" }
                // htmx must not inject its indicator <style>: CSP nonce mode
                // blocks inline styles.
                meta name="htmx-config" content=r#"{"includeIndicatorStyles":false}"#;
                link rel="stylesheet" href=(asset_url("css/demo.css"));
                (markstream_head())
                script src=(asset_url("js/htmx.min.js")) defer {}
            }
            body { main { (content) } }
        }
    }
}

#[autumn_web::get("/")]
async fn index() -> Markup {
    layout(&html! {
        h1 { "autumn-plugin-markstream" }
        section {
            (Markstream::new(GUIDE).mode(Mode::Docs).id("static-doc"))
        }
        section {
            h2 { "Live stream" }
            (Markstream::stream("/answer/0").mode(Mode::Chat).id("live"))
        }
        section {
            button id="ask" hx-get="/ask" hx-target="#answers" hx-swap="beforeend" { "Ask again" }
            div id="answers" {}
        }
    })
}

/// htmx partial: one new streaming answer.
#[autumn_web::get("/ask")]
async fn ask() -> Markup {
    let n = ASKED.fetch_add(1, Ordering::Relaxed);
    html! {
        div class="answer" {
            (Markstream::stream(format!("/answer/{}", n + 1))
                .mode(Mode::Chat)
                .id(format!("answer-{n}")))
        }
    }
}

/// SSE: one answer, sent word by word.
#[autumn_web::get("/answer/{n}")]
async fn answer(Path(n): Path<usize>) -> impl IntoResponse {
    let delay = std::env::var("MARKSTREAM_DEMO_DELAY_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(40);
    let text = ANSWERS[n % ANSWERS.len()];
    let chunks = stream::unfold(text.split_inclusive(' '), move |mut words| async move {
        let word = words.next()?;
        tokio::time::sleep(Duration::from_millis(delay)).await;
        Some((word, words))
    });
    markstream_sse(chunks)
}
