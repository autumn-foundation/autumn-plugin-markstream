//! The typed [`Markstream`] builder.
//!
//! A [`Markstream`] value renders one container. The init module finds the
//! container and mounts markstream on it.
//!
//! # Attributes
//!
//! You can also write these attributes by hand:
//!
//! - `data-markstream`: marks the container. Required.
//! - `class="markstream"`: the plugin styles need it.
//! - `data-markstream-html="escape|safe|trusted"`: the HTML policy for raw
//!   HTML in the Markdown. Missing or unknown values mean `escape`.
//! - `data-markstream-mode="docs|chat|minimal"`: the render mode.
//! - `data-markstream-theme="light|dark"`: the color theme. Missing means
//!   the user's `prefers-color-scheme`.
//! - `data-markstream-typewriter="true"`: animate new text.
//! - `data-markstream-max-live-nodes="0"`: the maximum number of live
//!   nodes. `0` keeps all nodes live.
//! - `data-markstream-src="/url"`: read Server-Sent Events from this URL.
//!   See [`crate::sse`].
//!
//! The Markdown source goes in a child `<pre class="markstream-source">`.
//! Users without JavaScript see this source.

use maud::{Markup, Render, html};

/// Each `data-markstream-*` attribute name. `assets/core.js` reads the same
/// names. A test keeps the two lists the same.
#[cfg(test)]
pub(crate) const ATTRIBUTES: [&str; 7] = [
    "data-markstream",
    "data-markstream-html",
    "data-markstream-mode",
    "data-markstream-theme",
    "data-markstream-typewriter",
    "data-markstream-max-live-nodes",
    "data-markstream-src",
];

/// The markstream render mode (`mode` prop).
///
/// `Mode` has no default. Without [`Markstream::mode`], markstream uses its
/// own default mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum Mode {
    /// Document layout.
    Docs,
    /// Chat message layout.
    Chat,
    /// Minimal layout.
    Minimal,
}

impl Mode {
    /// The attribute value.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Docs => "docs",
            Self::Chat => "chat",
            Self::Minimal => "minimal",
        }
    }
}

/// What markstream does with raw HTML in the Markdown (`htmlPolicy` prop).
///
/// The default is [`HtmlPolicy::Escape`]. Use it for user input and model
/// output.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum HtmlPolicy {
    /// Show raw HTML as text. The safe default.
    #[default]
    Escape,
    /// Keep an allowlist of tags and attributes.
    Safe,
    /// Keep all raw HTML except `<script>`. Use only for Markdown that you
    /// wrote. The page head must also hold [`markstream_allow_trusted()`].
    /// Without it, the browser uses [`HtmlPolicy::Safe`].
    Trusted,
}

impl HtmlPolicy {
    /// The attribute value.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Escape => "escape",
            Self::Safe => "safe",
            Self::Trusted => "trusted",
        }
    }
}

/// Name of the meta tag that allows [`HtmlPolicy::Trusted`] on a page.
pub const ALLOW_TRUSTED_META: &str = "markstream-allow-trusted";

/// Writes the meta tag that allows [`HtmlPolicy::Trusted`] on this page.
///
/// Put it in the page `<head>`. Without it, the init module uses
/// [`HtmlPolicy::Safe`] for `trusted` containers. Injected markup then
/// cannot ask for raw HTML.
#[must_use]
pub fn markstream_allow_trusted() -> Markup {
    html! { meta name=(ALLOW_TRUSTED_META) content="true"; }
}

/// The color theme.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum Theme {
    /// Follow the user's `prefers-color-scheme`. The default.
    #[default]
    Auto,
    /// Light colors.
    Light,
    /// Dark colors.
    Dark,
}

impl Theme {
    /// The theme name. The builder writes no attribute for [`Theme::Auto`].
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }

    const fn attr(self) -> Option<&'static str> {
        match self {
            Self::Auto => None,
            other => Some(other.as_str()),
        }
    }
}

/// One markstream container: Markdown, an optional stream URL and options.
///
/// ```rust
/// use autumn_plugin_markstream::{Markstream, Mode};
/// use autumn_web::html;
///
/// let page = html! {
///     (Markstream::new("# Hello\n\nSome *Markdown*."))
///     (Markstream::stream("/chat/42/stream").mode(Mode::Chat))
/// };
/// assert!(page.into_string().contains("data-markstream-src"));
/// ```
#[derive(Debug, Clone, Default, PartialEq, Eq)]
#[must_use]
pub struct Markstream {
    content: String,
    src: Option<String>,
    mode: Option<Mode>,
    html_policy: HtmlPolicy,
    theme: Theme,
    typewriter: bool,
    max_live_nodes: Option<u32>,
    id: Option<String>,
    class: Option<String>,
}

impl Markstream {
    /// Renders static Markdown.
    pub fn new(markdown: impl Into<String>) -> Self {
        Self {
            content: markdown.into(),
            ..Self::default()
        }
    }

    /// Streams Markdown from the Server-Sent Events at `url`.
    ///
    /// Make the events with [`crate::sse::markstream_sse`].
    pub fn stream(url: impl Into<String>) -> Self {
        Self::default().stream_from(url)
    }

    /// Streams more Markdown from `url` after the current content.
    ///
    /// The URL must have the same origin as the page. An empty URL means
    /// no stream.
    pub fn stream_from(mut self, url: impl Into<String>) -> Self {
        self.src = Some(url.into());
        self
    }

    /// Sets the render mode. Without this call, markstream uses its own
    /// default mode.
    pub const fn mode(mut self, mode: Mode) -> Self {
        self.mode = Some(mode);
        self
    }

    /// Sets the HTML policy. The default is [`HtmlPolicy::Escape`].
    pub const fn html_policy(mut self, policy: HtmlPolicy) -> Self {
        self.html_policy = policy;
        self
    }

    /// Sets the color theme. The default is [`Theme::Auto`].
    pub const fn theme(mut self, theme: Theme) -> Self {
        self.theme = theme;
        self
    }

    /// Animates new text when `on` is `true`.
    pub const fn typewriter(mut self, on: bool) -> Self {
        self.typewriter = on;
        self
    }

    /// Sets the maximum number of live nodes. `0` keeps all nodes live.
    pub const fn max_live_nodes(mut self, nodes: u32) -> Self {
        self.max_live_nodes = Some(nodes);
        self
    }

    /// Sets the container `id`.
    pub fn id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Adds CSS classes to the container. It always has `markstream`.
    pub fn class(mut self, class: impl Into<String>) -> Self {
        self.class = Some(class.into());
        self
    }
}

impl Render for Markstream {
    fn render(&self) -> Markup {
        let class = self
            .class
            .as_ref()
            .map_or_else(|| "markstream".to_owned(), |c| format!("markstream {c}"));
        let src = self.src.as_deref().filter(|s| !s.is_empty());
        let streaming = src.map(|_| "true");
        html! {
            div class=(class)
                id=[self.id.as_deref()]
                data-markstream=""
                data-markstream-html=(self.html_policy.as_str())
                data-markstream-mode=[self.mode.map(Mode::as_str)]
                data-markstream-theme=[self.theme.attr()]
                data-markstream-typewriter=[self.typewriter.then_some("true")]
                data-markstream-max-live-nodes=[self.max_live_nodes]
                data-markstream-src=[src]
                aria-live=[streaming.map(|_| "polite")]
                aria-busy=[streaming]
            {
                pre class="markstream-source" { (self.content) }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{js_array, js_object_values, js_string};

    const CORE_JS: &str = include_str!("../assets/core.js");

    fn render(m: &Markstream) -> String {
        m.render().into_string()
    }

    #[test]
    fn static_markdown_renders_escaped_source_with_safe_defaults() {
        let html = render(&Markstream::new("# Hi\n\n- a"));
        assert_eq!(
            html,
            "<div class=\"markstream\" data-markstream=\"\" data-markstream-html=\"escape\">\
             <pre class=\"markstream-source\"># Hi\n\n- a</pre></div>"
        );
    }

    #[test]
    fn markdown_cannot_break_out_of_the_fallback() {
        let html = render(&Markstream::new("</pre><script>alert(1)</script>&"));
        assert!(!html.contains("<script>"), "{html}");
        assert!(html.contains("&lt;/pre&gt;&lt;script&gt;"), "{html}");
        assert!(html.contains("&amp;"), "{html}");
    }

    #[test]
    fn attribute_values_cannot_break_out() {
        let html = render(
            &Markstream::stream("/s?a=1&b=\"><script>")
                .id("x\"onmouseover=\"y")
                .class("c\"><b>"),
        );
        assert!(
            !html.contains("<script>") && !html.contains("<b>"),
            "{html}"
        );
        assert!(!html.contains("\"onmouseover"), "{html}");
        assert!(
            html.contains("data-markstream-src=\"/s?a=1&amp;b=&quot;&gt;&lt;script&gt;\""),
            "{html}"
        );
    }

    #[test]
    fn stream_sets_source_url_and_live_region() {
        let html = render(&Markstream::stream("/chat/1"));
        assert!(html.contains(r#"data-markstream-src="/chat/1""#), "{html}");
        assert!(html.contains(r#"aria-live="polite""#), "{html}");
        assert!(html.contains(r#"aria-busy="true""#), "{html}");
        assert!(
            html.contains(r#"<pre class="markstream-source"></pre>"#),
            "{html}"
        );
    }

    #[test]
    fn stream_from_keeps_initial_content() {
        let html = render(&Markstream::new("Hello").stream_from("/s"));
        assert!(html.contains(">Hello</pre>"), "{html}");
        assert!(html.contains(r#"data-markstream-src="/s""#), "{html}");
    }

    #[test]
    fn options_map_to_data_attributes() {
        let html = render(
            &Markstream::new("x")
                .mode(Mode::Chat)
                .html_policy(HtmlPolicy::Trusted)
                .theme(Theme::Dark)
                .typewriter(true)
                .max_live_nodes(0)
                .id("answer")
                .class("prose wide"),
        );
        for want in [
            r#"class="markstream prose wide""#,
            r#"id="answer""#,
            r#"data-markstream-mode="chat""#,
            r#"data-markstream-html="trusted""#,
            r#"data-markstream-theme="dark""#,
            r#"data-markstream-typewriter="true""#,
            r#"data-markstream-max-live-nodes="0""#,
        ] {
            assert!(html.contains(want), "missing {want}: {html}");
        }
    }

    #[test]
    fn defaults_omit_optional_attributes() {
        let html = render(&Markstream::new("x").typewriter(false));
        for absent in [
            "mode",
            "theme",
            "typewriter",
            "max-live-nodes",
            "src",
            " id=",
            "aria-",
        ] {
            assert!(!html.contains(absent), "{absent} in {html}");
        }
        assert_eq!(Markstream::default(), Markstream::new(""));
    }

    #[test]
    fn enum_values_match_markstream_props() {
        assert_eq!(
            [Mode::Docs, Mode::Chat, Mode::Minimal].map(Mode::as_str),
            ["docs", "chat", "minimal"]
        );
        assert_eq!(
            [HtmlPolicy::Escape, HtmlPolicy::Safe, HtmlPolicy::Trusted].map(HtmlPolicy::as_str),
            ["escape", "safe", "trusted"]
        );
        assert_eq!(
            [Theme::Light, Theme::Dark].map(Theme::as_str),
            ["light", "dark"]
        );
        assert_eq!(HtmlPolicy::default(), HtmlPolicy::Escape);
        assert_eq!(Theme::default(), Theme::Auto);
    }

    fn sorted(mut v: Vec<String>) -> Vec<String> {
        v.sort_unstable();
        v
    }

    #[test]
    fn rust_and_js_agree_on_attribute_names() {
        let full = render(
            &Markstream::stream("/s")
                .mode(Mode::Chat)
                .theme(Theme::Dark)
                .typewriter(true)
                .max_live_nodes(1),
        );
        let re = regex::Regex::new(r"(data-markstream[-a-z]*)=").expect("regex");
        let rendered = sorted(re.captures_iter(&full).map(|c| c[1].to_owned()).collect());
        let js = sorted(js_object_values(CORE_JS, "ATTR"));
        assert_eq!(rendered, js);
        assert_eq!(sorted(ATTRIBUTES.map(str::to_owned).to_vec()), js);
    }

    #[test]
    fn rust_and_js_agree_on_attribute_values() {
        let names = |v: &[&str]| v.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
        assert_eq!(
            js_array(CORE_JS, "MODES"),
            names(&[Mode::Docs, Mode::Chat, Mode::Minimal].map(Mode::as_str))
        );
        assert_eq!(
            js_array(CORE_JS, "HTML_POLICIES"),
            names(
                &[HtmlPolicy::Escape, HtmlPolicy::Safe, HtmlPolicy::Trusted]
                    .map(HtmlPolicy::as_str)
            )
        );
        assert_eq!(
            js_array(CORE_JS, "THEMES"),
            names(&[Theme::Light, Theme::Dark].map(Theme::as_str))
        );
        assert_eq!(js_string(CORE_JS, "ALLOW_TRUSTED"), ALLOW_TRUSTED_META);
    }

    #[test]
    fn an_empty_stream_url_renders_a_static_container() {
        let html = render(&Markstream::stream("").stream_from(""));
        assert!(!html.contains("data-markstream-src"), "{html}");
        assert!(!html.contains("aria-busy"), "{html}");
    }

    #[test]
    fn allow_trusted_meta_names_the_js_opt_in() {
        assert_eq!(
            markstream_allow_trusted().into_string(),
            format!(r#"<meta name="{ALLOW_TRUSTED_META}" content="true">"#)
        );
    }
}
