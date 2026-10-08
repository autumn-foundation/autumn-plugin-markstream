//! markstream for Autumn: render and stream Markdown with Maud and htmx.
//!
//! Add [`MarkstreamPlugin`] to the app. Put [`markstream_head()`] in the page
//! head. Render Markdown with [`Markstream`], and stream it with
//! [`sse::markstream_sse`]:
//!
//! ```rust,no_run
//! use autumn_plugin_markstream::sse::{markstream_sse, stream};
//! use autumn_plugin_markstream::{Markstream, MarkstreamPlugin, Mode, markstream_head};
//! use autumn_web::prelude::*;
//!
//! #[get("/")]
//! async fn index() -> Markup {
//!     html! {
//!         html {
//!             head { (markstream_head()) }
//!             body {
//!                 (Markstream::new("# Hello\n\nSome *Markdown*."))
//!                 (Markstream::stream("/answer").mode(Mode::Chat))
//!             }
//!         }
//!     }
//! }
//!
//! #[get("/answer")]
//! async fn answer() -> impl IntoResponse {
//!     markstream_sse(stream::iter(["## Answer\n", "Some ", "*text*."]))
//! }
//!
//! # async fn run() {
//! autumn_web::app()
//!     .plugin(MarkstreamPlugin::new())
//!     .routes(routes![index, answer])
//!     .run()
//!     .await;
//! # }
//! ```
//!
//! The crate vendors markstream-vue [`MARKSTREAM_VERSION`] and Vue
//! [`VUE_VERSION`] (runtime build). Autumn serves them from memory under
//! `/static/_plugins/markstream/`. The page needs no inline script and no
//! import map, so the default Autumn CSP works.
//!
//! # Limits
//!
//! - Syntax highlighting is light: keywords, strings, numbers and comments for
//!   common languages. It is not Monaco or Shiki.
//! - No Mermaid, D2 or infographic. These blocks show their source.
//! - No KaTeX unless the page loads KaTeX as a global (`window.katex`).
//! - The browser does not reconnect a stream. A dropped stream shows the
//!   error state.

mod assets;
mod markstream;
mod plugin;
mod script;
pub mod sse;
#[cfg(test)]
mod test_support;
mod vendored;

pub use assets::{ASSETS_NAMESPACE, MARKSTREAM_ASSETS, MARKSTREAM_VERSION, VUE_VERSION};
pub use markstream::{
    ALLOW_TRUSTED_META, HtmlPolicy, Markstream, Mode, Theme, markstream_allow_trusted,
};
pub use plugin::{MarkstreamPlugin, PLUGIN_NAME};
pub use script::{markstream_head, markstream_preloads, markstream_script, markstream_stylesheet};

/// Compiles the README code blocks as doctests.
#[doc = include_str!("../README.md")]
#[cfg(doctest)]
pub struct ReadmeDoctests;
