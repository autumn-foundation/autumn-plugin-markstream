# autumn-plugin-markstream

Render and stream Markdown in [Autumn](https://autumn-web.app) apps with
[markstream](https://markstream.simonhe.me). Use Maud, htmx and
Server-Sent Events. You need no npm, no bundler and no inline script.

The crate vendors markstream-vue 2.0.16 and Vue 3.5.43 (runtime build).
Autumn serves the files from memory.

## Quickstart

1. Add the plugin:

   ```rust
   use autumn_plugin_markstream::MarkstreamPlugin;

   autumn_web::app()
       .plugin(MarkstreamPlugin::new())
       .run()
       .await;
   ```

2. Put the head tags in your layout:

   ```rust
   use autumn_plugin_markstream::markstream_head;
   use autumn_web::{Markup, html};

   fn layout(content: Markup) -> Markup {
       html! {
           html {
               head { (markstream_head()) }
               body { (content) }
           }
       }
   }
   ```

3. Render Markdown:

   ```rust
   use autumn_plugin_markstream::{Markstream, Mode};

   html! { (Markstream::new("# Hello\n\nSome *Markdown*.").mode(Mode::Docs)) }
   ```

## Streaming

Point a container at an SSE URL. Send the Markdown in chunks:

```rust
use autumn_plugin_markstream::sse::markstream_sse;
use autumn_plugin_markstream::{Markstream, Mode};
use futures_util::stream;

#[get("/")]
async fn page() -> Markup {
    layout(html! { (Markstream::stream("/answer").mode(Mode::Chat)) })
}

#[get("/answer")]
async fn answer() -> impl IntoResponse {
    markstream_sse(stream::iter(["# Title\n", "Some ", "*text*."]))
}
```

Use `try_markstream_sse` for a stream of `Result`s. An `Err` sends an
`error` event with no details and stops the stream.

### Protocol

| Event | Data | Effect |
|---|---|---|
| `chunk` | JSON string | Add the text to the end. |
| `replace` | JSON string | Replace all text. |
| `done` | `null` | Mark the text final. Close the stream. |
| `error` | `null` | Mark the text final and failed. Close the stream. |

- The data is JSON. Spaces, `\r`, `\n` and Unicode stay the same.
- The browser does not reconnect. A stream that stops before `done` shows
  the error state.
- Build your own events with `StreamEvent` and `Event::from(event)`.

## htmx

The init module mounts each new container after an htmx swap
(`htmx:load`). It closes the stream and unmounts the container on
`htmx:beforeCleanupElement`. A partial can return a streaming container:

```rust
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
| `.max_live_nodes(n)` | `data-markstream-max-live-nodes` | integer | markstream default |
| `::stream(url)`, `.stream_from(url)` | `data-markstream-src` | URL | none |
| `.id(s)`, `.class(s)` | `id`, `class` | text | `class="markstream"` |

- Unknown attribute values fall back to safe values.
- The Markdown source is in `<pre class="markstream-source">`. Users
  without JavaScript see this source.
- The init module sets `data-markstream-mounted`,
  `data-markstream-state` (`streaming`, `done`, `error`) and `aria-busy`.

## JavaScript API

The init module sends these DOM events. They bubble:
`markstream:mount`, `markstream:done`, `markstream:error`.
It sends `markstream:ready` on `document`.

`window.AutumnMarkstream` gives:

- `scan(root)`: mount each container in `root`.
- `mount(el)`: mount one container. It returns a handle.
- `get(el)`: the handle, or `null`.

A handle has `append(text)`, `replace(text)`, `finish()`, `fail()`,
`reset(text)`, `content()`, `status()` and `unmount()`. Use it with other
transports, for example WebSocket:

```js
const h = AutumnMarkstream.get(document.getElementById("answer"));
h.reset();
socket.onmessage = (e) => h.append(e.data);
socket.onclose = () => h.finish();
```

## Security

- The default HTML policy is `escape`. Raw HTML in the Markdown shows as
  text. Use `HtmlPolicy::Trusted` only for Markdown that you wrote.
- The init module does not mount a container inside rendered Markdown.
  Markdown cannot open a new stream.
- The head tags have SRI hashes. The init module and each eager module
  (`<link rel="modulepreload">`) are checked. Lazy chunks load from the
  same origin with no hash.
- The served JavaScript has no `eval` and no `new Function`. It works with
  the default Autumn CSP (`script-src 'self'`).

## Demo

```sh
cargo run --example markstream_demo
```

Open <http://127.0.0.1:3000>. The page shows static Markdown, a live
stream and htmx swaps.

## How it works

- `scripts/vendor.py` downloads pinned files from jsDelivr. It rewrites
  each bare import (`"vue"`) to a relative path. It writes
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
cargo build --example markstream_demo
node tests/e2e/demo.e2e.mjs                 # headless Chromium
```

## Limits

- No syntax highlighting. Code blocks render as plain `<pre>`.
- No Mermaid, D2 or infographic. These blocks show their source.
- No KaTeX unless the page loads KaTeX as a global (`window.katex`).
- markstream reveals text smoothly. The DOM can lag the `done` event.
- The init module unmounts on htmx cleanup only. Other DOM removal keeps
  the stream open until `done`.
- The vendored parser is not minified (850 KB raw).

## License

Apache-2.0. Vendored files are MIT. See `assets/licenses/`.
