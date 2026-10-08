# Plan 0001: Markstream plugin for Autumn 0.8

- Status: accepted
- Date: 2026-10-08
- Applies to: autumn-plugin-markstream 0.1.0, autumn-web 0.8.0

## Goal

Render Markdown in an Autumn page with
[markstream-vue](https://github.com/Simon-He95/markstream-vue).
Stream Markdown from the server (for example, LLM output) into the page.
Use no npm, no bundler and no inline script.

## Facts from research

- markstream ships ESM only. It has no UMD, IIFE or custom element.
- markstream-vue 2.0.16 imports three bare specifiers: `vue`,
  `stream-markdown-parser` and `markstream-core`.
- Each of these has a self-contained browser ESM file.
- The Vue runtime build has no `eval` and no `new Function`.
- Autumn's default CSP is `script-src 'self'`. An import map is an
  inline script, so the default CSP blocks it.
- Autumn 0.8 serves plugin files with `PluginAssets`. Each file gets a
  hashed URL, a plain URL, an `ETag` and an SRI hash.
- axum writes a lone `\r` in SSE data as a line break. Raw text chunks
  do not round-trip.

## Brainstorm

1. Vendor markstream-vue and its dependencies into the crate.
2. Rewrite bare imports to relative paths when we vendor. Then we need
   no import map.
3. Serve the tree as one `PluginAssets` bundle.
4. Give a typed Rust builder, `Markstream`, that writes `data-markstream-*`
   attributes. A small init module reads them and mounts the renderer.
5. Show the Markdown source in a `<pre>` before the script runs. Users
   without JavaScript can read it.
6. Stream with Server-Sent Events. Rust helpers make the events.
7. Send each chunk as a JSON string. JSON keeps every character.
8. Mount again after htmx swaps. Unmount and close the stream when htmx
   removes the element.
9. Give a JS API (`window.AutumnMarkstream`) for other transports, for
   example WebSocket.
10. Use `<link rel="modulepreload">` with `integrity` for the large
    modules. The browser then fetches them in parallel and checks them.

## Reverse brainstorm: how can this plugin fail?

| How to make it fail | Countermeasure |
|---|---|
| Ship an import map inline. The CSP blocks it. | Rewrite imports. A test finds each bare specifier. |
| Forget a lazy chunk. A code block then fails to load. | A test walks the module graph. Each relative import must resolve in the bundle. |
| Use the Vue compiler build. The CSP blocks `new Function`. | Use the runtime build. A test finds `eval(` and `new Function`. |
| Render model output as trusted HTML. This causes XSS. | The default `htmlPolicy` is `escape`. `Trusted` is an explicit opt-in. |
| Send raw text in SSE. Leading spaces and `\r` change. | Send JSON strings. A property test checks the round trip. |
| Let `EventSource` reconnect. The stream then starts again and the text doubles. | Close the source on error. Show the error state. |
| Send error details to the client. This leaks data. | The `error` event has no details. |
| Send `done` two times, or a chunk after `done`. | A reference model and a property test check the event order. |
| Mount the same element two times after an htmx swap. | Mark mounted elements. Skip marked elements. |
| Keep a stream open after htmx removes the element. | Close it on `htmx:beforeCleanupElement`. |
| Let vendored bytes drift from upstream. | The manifest keeps upstream and served SHA-384 pins. A test checks them. |
| Serve the manifest or licenses. | Bundle files by an explicit list. A test checks the list. |

## Six thinking hats

- **White (facts):** ESM only. About 1.7 MB raw. 34 files. MIT licenses.
  Releases are frequent. Chunk names change between versions.
- **Red (feeling):** Users want "it just works" in one line. Raw Markdown
  in a `<pre>` before the script runs is honest and readable.
- **Black (risk):** A large unminified parser (850 KB). No syntax
  highlighting: code blocks render as plain `<pre>`. No Mermaid or KaTeX by default.
  Rewritten files differ from upstream, so we pin two hashes. Only the
  entry and the preloaded modules have SRI checks.
- **Yellow (value):** LLM chat UIs in Autumn with no JS toolchain. The
  htmx flow stays the same. The SSE helpers make the server side small.
- **Green (ideas):** Server-side fallback HTML. KaTeX and Mermaid as
  opt-in features. WebSocket helper. Minify the parser. Keep these for
  later (see "Limits" in the README).
- **Blue (process):** TDD for each slice (red, green, refactor). The
  order is: assets, plugin, head tags, builder, SSE, init module, example,
  browser test, docs, CI.

## Decisions

- Vendor markstream-vue 2.0.16, Vue 3.5.43 runtime ESM,
  stream-markdown-parser 1.2.18, markstream-core 2.0.16 and
  floating-ui 1.8.0 (`scripts/vendor.py`).
- Rewrite bare specifiers to relative paths. Do not use an import map
  (ADR 0001).
- Leave optional peers (`katex`, `mermaid`, `stream-diffs`,
  `@terrastruct/d2`) bare. markstream catches the failed import and
  shows the source. The init module turns them off to stop warnings.
- Default `htmlPolicy` is `escape` (ADR 0002).
- SSE protocol: `chunk`, `replace`, `done`, `error`. Data is a JSON
  string (ADR 0002).
- Verus is not available in this environment. The proxy blocks GitHub
  release downloads. The stream event order has a reference model and
  property tests instead.

## Acceptance criteria

1. `MarkstreamPlugin` installs one `PluginAssets` bundle (namespace
   `markstream`) through `AppBuilder::plugin_assets`. The routes pass
   `plugin_conformance`.
2. The crate vendors pinned upstream files. `assets/manifest.json` keeps
   the version, source URL, upstream SHA-384 and served SHA-384 of each
   file. Tests check the pins.
3. The bundle needs no import map. Each relative import resolves in the
   bundle. Only the optional peers stay bare.
4. Served JavaScript has no `eval(` and no `new Function`. It runs under
   the default CSP.
5. `markstream_head()` writes the module script, the module preloads and
   the stylesheets. The script and stylesheet tags use hashed URLs. The
   preload tags use plain URLs. Each tag has an SRI hash.
6. The `Markstream` builder renders static Markdown. The escaped source
   shows without JavaScript. Typed options map to `data-markstream-*`
   attributes. The default HTML policy is `escape`.
7. Streaming: `Markstream::stream(url)` and the SSE helpers send `chunk`,
   `replace`, `done` and `error` events. Each string round-trips. `done`
   comes one time, at the end. `error` has no details.
8. The init module mounts on load and after htmx swaps. It unmounts and
   closes the stream on htmx cleanup. It does not reconnect. It sends DOM
   events. It gives `window.AutumnMarkstream`.
9. A browser test shows rendered HTML and a completed stream in headless
   Chromium.
10. `examples/markstream_demo.rs` shows static, streaming and htmx use.
11. Docs: README, ADRs, CLAUDE.md and this plan. Text uses ASD-STE100
    style.
12. Quality gates: `cargo fmt` and clippy (pedantic, nursery) give no
    warnings. Production code has no `unwrap`. CI runs. Line coverage is
    85% or more.

## TDD slices

| Slice | Red test | Green code |
|---|---|---|
| Assets | bundle list, pins, graph, no bare imports, no eval | `assets.rs`, `vendor.py` |
| Plugin | routes, cache, 404, conformance | `plugin.rs` |
| Head tags | module script, preloads, SRI | `script.rs` |
| Builder | attributes, escape, defaults, lockstep with JS | `markstream.rs` |
| SSE | event shape, JSON round trip, order model | `sse.rs` |
| Init module | `node --test` on pure helpers | `assets/core.js`, `assets/init.js` |
| Browser | headless Chromium test | example app |

## Review outcomes

Four review agents read the code: security, correctness, API and docs,
tests and CI. We fixed each confirmed finding with a test first:

| Finding | Fix | Test |
|---|---|---|
| htmx history copy blanks containers | Keep the source `<pre>`; mount into a child `div` | e2e "history copy" |
| History copy runs `hx-*` in Markdown | `hx-disable` on the render `div` | e2e "cannot run htmx" |
| Detached elements mount after an earlier mount | Check `isConnected` and nesting just before each mount | e2e "history copy" |
| `data-markstream-html="trusted"` as an injection gadget | Page meta opt-in, else `safe` | node + e2e |
| Any `src` opens a stream | Same-origin `http(s)` only | node + e2e |
| innerHTML swap into a container leaks the stream | Unmount on `htmx:beforeSwap` | e2e "close open streams" |
| Bad `src` stops later mounts | `try`/`catch`; error state | e2e "fail only their own" |
| `reset()` keeps the SSE open | Close first | e2e |
| Stale handle still acts | `active` flag | e2e |
| `aria-busy` stays `true` | Set on mount; no `src` for `""` | Rust + e2e |
| Lockstep tests check substrings only | Parse the JS arrays | Rust |
| SSE test parser dispatches at EOF | Drop the unterminated event | Rust |
| Vendor script trusts the CDN | npm tarball sha512 check, path guard | Python |
| Nonce CSP untested | e2e nonce mode; htmx indicator styles off | e2e |
