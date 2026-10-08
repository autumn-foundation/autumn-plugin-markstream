# ADR 0002: SSE protocol and safe defaults

- Status: accepted
- Date: 2026-10-08
- Applies to: autumn-plugin-markstream 0.1.0

## Context

- LLM output arrives in chunks. The page must show the text as it grows.
- axum writes a lone `\r` in SSE data as a line break. A browser removes
  one space after `data:`. Raw text chunks do not round-trip.
- A browser does not dispatch an SSE event with an empty data buffer.
- `EventSource` reconnects after a closed connection. The server then
  sends the stream again, and the page shows the text two times.
- Model output and user input can hold raw HTML. markstream's default
  HTML policy is `safe`.

## Decision

- Four events: `chunk`, `replace`, `done`, `error`.
- `chunk` and `replace` carry a JSON string. `done` and `error` carry
  `null`.
- `try_stream_events` skips empty chunks. It sends exactly one `done` or
  `error`, at the end. `error` has no details.
- The init module closes the `EventSource` on `done` and on each `error`
  event. It does not reconnect.
- The default HTML policy is `escape`. `trusted` needs two opt-ins: the
  container attribute and a page meta tag (`markstream_allow_trusted()`).
  Without the meta tag, the init module uses `safe`. Injected markup that
  keeps `data-*` attributes then cannot ask for raw HTML.
- `data-markstream-src` must have the same origin as the page.
- The init module does not mount a container inside a mounted container
  or inside rendered Markdown. It checks each element just before its
  mount, and it skips elements that are not in the document.
- Rendered Markdown goes in a `<div hx-disable>`. htmx then ignores `hx-*`
  attributes in it, also in an htmx history copy.
- The source `<pre>` stays in the container (hidden) and follows the text.
  An htmx history copy then mounts again with its text.

## Consequences

- Each string round-trips. A property test checks this with a spec-based
  SSE parser.
- A reference model and a property test check the event order.
- A dropped connection shows the error state. Resume is not supported.
- Pages that need raw HTML must opt in.
