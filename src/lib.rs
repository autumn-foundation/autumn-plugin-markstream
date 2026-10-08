//! markstream for Autumn: render and stream Markdown with Maud and htmx.

mod assets;
mod markstream;
mod plugin;
mod script;
pub mod sse;
#[cfg(test)]
mod test_support;
mod vendored;

pub use assets::{ASSETS_NAMESPACE, MARKSTREAM_ASSETS, MARKSTREAM_VERSION, VUE_VERSION};
pub use markstream::{HtmlPolicy, Markstream, Mode, Theme};
pub use plugin::{MarkstreamPlugin, PLUGIN_NAME};
pub use script::{markstream_head, markstream_preloads, markstream_script, markstream_stylesheet};
