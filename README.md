# autumn-plugin-markstream

Render and stream Markdown in [Autumn](https://autumn-web.app) apps with
[markstream](https://markstream.simonhe.me). Use Maud, htmx and
Server-Sent Events. You need no npm, no bundler and no inline script.

The crate vendors markstream-vue 2.0.16 and Vue 3.5.43 (runtime build).
Autumn serves the files from memory.

## Quickstart

Add the plugin, put the head tags in the layout, and render Markdown:

```rust,no_run
use autumn_plugin_markstream::{Markstream, MarkstreamPlugin, Mode, markstream_head};
use autumn_web::prelude::*;

fn layout(content: Markup) -> Markup {
    html! {
        html {
            head { (markstream_head()) }
            body { (content) }
        }
    }
}

#[get("/")]
async fn index() -> Markup {
    layout(html! { (Markstream::new("# Hello\n\nSome *Markdown*.").mode(Mode::Docs)) })
}

#[autumn_web::main]
async fn main() {
    autumn_web::app()
        .plugin(MarkstreamPlugin::new())
        .routes(routes![index])
        .run()
        .await;
}
```

## Streaming

Point a container at an SSE URL. Send the Markdown in chunks:

```rust,no_run
use autumn_plugin_markstream::sse::{markstream_sse, stream};
use autumn_plugin_markstream::{Markstream, Mode};
use autumn_web::prelude::*;

#[get("/chat")]
async fn chat() -> Markup {
    html! { (Markstream::stream("/answer").mode(Mode::Chat)) }
}

#[get("/answer")]
async fn answer() -> impl IntoResponse {
    markstream_sse(stream::iter(["# Title\n", "Some ", "*text*."]))
}
```

`sse::stream` and `sse::Stream` come from `futures-util`. Any
`Stream<Item = T>` with `T: Into<String>` works. Use `try_markstream_sse`
for a stream of `Result`s. An `Err` sends an `error` event with no details
and stops the stream.

### Protocol

| Event | Data | Effect |
|---|---|---|
| `chunk` | JSON string | Add the text to the end. |
| `replace` | JSON string | Replace all text. |
| `done` | `null` | Mark the text final. Close the stream. |
| `error` | `null` | Mark the text final and failed. Close the stream. |

- The data is JSON. Spaces, `\r`, `\n` and Unicode stay the same.
- The init module closes the stream and does not reconnect. A stream that
  stops before `done` shows the error state.
- To make your own events, use `sse::StreamEvent` and
  `autumn_web::sse::Event::from(event)`.

## htmx

The init module mounts each new container after an htmx swap
(`htmx:load`). It closes the stream and unmounts the container on
`htmx:beforeCleanupElement`. A partial can return a streaming container:

```rust,no_run
use autumn_plugin_markstream::{Markstream, Mode};
use autumn_web::prelude::*;

#[get("/ask")]
async fn ask() -> Markup {
    html! { (Markstream::stream("/answer").mode(Mode::Chat)) }
}
```

```html
<button hx-get="/ask" hx-target="#answers" hx-swap="beforeend">Ask</button>
```

## Builder and attributes

| Builder | Attribute | Values | Default |
|---|---|---|---|
| (always) | `data-markstream` | marker | required |
| `.html_policy(p)` | `data-markstream-html` | `escape`, `safe`, `trusted` | `escape` |
| `.mode(m)` | `data-markstream-mode` | `docs`, `chat`, `minimal` | markstream default |
| `.theme(t)` | `data-markstream-theme` | `light`, `dark` | `prefers-color-scheme` |
| `.typewriter(true)` | `data-markstream-typewriter` | `true` | off |
| `.max_live_nodes(n)` | `data-markstream-max-live-nodes` | maximum live nodes (`0`: all) | markstream default |
| `::stream(url)`, `.stream_from(url)` | `data-markstream-src` | URL | none |
| `.id(s)`, `.class(s)` | `id`, `class` | text | `class="markstream"` (the plugin styles need it) |

- Unknown attribute values fall back to safe values.
- `trusted` needs `markstream_allow_trusted()` in the page head.
- The Markdown source is in `<pre class="markstream-source">`. Users
  without JavaScript see this source.
- The init module sets `data-markstream-mounted`,
  `data-markstream-state` (`streaming`, `done`, `error`) and `aria-busy`.

## JavaScript API

The init module sends these DOM events. They bubble.

| Event | `detail` |
|---|---|
| `markstream:mount` | `{ status }` |
| `markstream:done` | `{ content }` |
| `markstream:error` | `{ content }` |

It sends `markstream:ready` on `document`.

`window.AutumnMarkstream` gives:

- `scan(root)`: mount each container in `root`. It skips containers inside
  rendered Markdown.
- `mount(el)`: mount one container. It returns a handle. It does not do
  the nested check.
- `get(el)`: the handle, or `null`.

A handle has these functions:

- `append(text)`, `replace(text)`: change the text of an open stream.
- `finish()`, `fail()`: mark the text final (`done` or `error`).
- `reset(text)`: set the text and mark it as not final. It opens no
  connection.
- `content()`, `status()`: read the state.
- `unmount()`: close the stream and remove markstream. The `<pre>` source
  shows again.

`append`, `replace`, `finish` and `fail` do nothing after `done` or
`error`. Call `reset` first. Use a handle with other transports, for
example WebSocket:

```js
const h = AutumnMarkstream.get(document.getElementById("answer"));
h.reset();
socket.onmessage = (e) => h.append(e.data);
socket.onclose = () => h.finish();
```

## Security

- The default HTML policy is `escape`. Raw HTML in the Markdown shows as
  text.
- `safe` removes event handlers (`on*`), `<script>` and `<iframe>`. It
  keeps other attributes, for example `hx-*` and `data-*`.
- `trusted` keeps all raw HTML except `<script>`. Use it only for Markdown
  that you wrote. The page head must hold `markstream_allow_trusted()`.
  Without this meta tag, the init module uses `safe`. Injected markup with
  `data-markstream-html="trusted"` then gets no raw HTML.
- Rendered Markdown goes in a `<div hx-disable>`. htmx ignores `hx-*`
  attributes in it, also after an htmx history restore.
- The init module does not mount a container inside rendered Markdown.
  Markdown cannot open a new stream.
- `data-markstream-src` must have the same origin as the page. Else the
  container shows the error state and opens no connection.
- The head tags have SRI hashes. The browser checks the init module and
  each eager module (`<link rel="modulepreload">`). Lazy modules load from
  the same origin with no hash. Use `markstream_head()`:
  `markstream_script()` alone checks only the init module.
- The served JavaScript has no `eval` and no `new Function`. It works with
  the default Autumn CSP (`script-src 'self'`).

## Demo

```sh
cargo run --example markstream_demo
```

Open <http://127.0.0.1:3000>. The page shows static Markdown, a live
stream and htmx swaps.

## How it works

- `scripts/vendor.py` downloads the pinned npm tarballs and checks each
  one against the registry sha512. It rewrites each bare import (`"vue"`)
  to a relative path. It writes
  `assets/manifest.json` and `src/vendored.rs`.
- The bundle `MARKSTREAM_ASSETS` holds the vendored tree, `init.js`,
  `core.js` and `markstream.css`. `MarkstreamPlugin` installs it through
  `AppBuilder::plugin_assets`.
- Files serve under `/static/_plugins/markstream/` at a hashed URL
  (`immutable`) and a plain URL (`must-revalidate`). Relative imports
  resolve to the plain URLs.
- Decisions: [`docs/adr/`](docs/adr/). Plan: [`docs/planning/`](docs/planning/).

To update markstream, change the versions in `scripts/vendor.py`. Then run
`python3 scripts/vendor.py` and `cargo test`.

## Tests

```sh
cargo test                                  # Rust unit tests and doctests
node --test tests/js/*.test.mjs             # init module logic
python3 -m unittest scripts/test_vendor.py  # vendoring script
cargo build --example markstream_demo
node tests/e2e/demo.e2e.mjs                 # headless Chromium
CSP_NONCE=1 node tests/e2e/demo.e2e.mjs     # same, CSP nonce mode
```

## Limits

- Syntax highlighting is light: keywords, strings, numbers and comments for
  common languages. It is not Monaco or Shiki.
- No Mermaid, D2 or infographic. These blocks show their source.
- No KaTeX unless the page loads KaTeX as a global (`window.katex`).
- markstream shows new text smoothly. The DOM can show the last text
  after the `done` event.
- The init module unmounts on htmx swaps and cleanup only. Other DOM
  removal keeps the stream open until `done`.
- The vendored parser is not minified (850 KB raw).

## License

Apache-2.0. Vendored files are MIT. See `assets/licenses/`.
