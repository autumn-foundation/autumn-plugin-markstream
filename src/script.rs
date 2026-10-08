//! Head tags: the module script, module preloads and stylesheets.
//!
//! Put [`markstream_head()`] in the page `<head>`. It writes:
//!
//! 1. The stylesheets ([`markstream_stylesheet()`]).
//! 2. One `<link rel="modulepreload">` for each module that loads before
//!    the init module runs ([`markstream_preloads()`]). The browser fetches
//!    them in parallel and checks each `integrity` hash.
//! 3. The init module script ([`markstream_script()`]).
//!
//! Each tag has an SRI hash that Autumn computes from the embedded bytes.
//! There is no inline script and no import map.

use autumn_web::{Markup, html};

use crate::assets::{CORE_JS, INIT_JS, MARKSTREAM_ASSETS, MARKSTREAM_CSS, PLUGIN_CSS};
use crate::vendored::EAGER_MODULES;

/// Writes all markstream head tags: styles, preloads, then the script.
///
/// ```rust
/// use autumn_plugin_markstream::markstream_head;
/// use autumn_web::html;
///
/// let head = html! { head { (markstream_head()) } }.into_string();
/// assert!(head.contains(r#"type="module""#));
/// ```
#[must_use]
pub fn markstream_head() -> Markup {
    html! {
        (markstream_stylesheet())
        (markstream_preloads())
        (markstream_script())
    }
}

/// Writes the `<script type="module">` tag for the init module.
///
/// Module scripts run after the document is parsed, in order.
#[must_use]
pub fn markstream_script() -> Markup {
    html! {
        @if let Some(init) = MARKSTREAM_ASSETS.get(INIT_JS) {
            script type="module" src=(init.url()) integrity=(init.integrity())
                crossorigin="anonymous" {}
        }
    }
}

/// Writes one `<link rel="modulepreload">` for each eager module.
///
/// The `href` is the plain URL, because relative imports resolve to it.
/// The browser then uses the preloaded and checked module.
#[must_use]
pub fn markstream_preloads() -> Markup {
    let paths = std::iter::once(CORE_JS).chain(EAGER_MODULES.iter().copied());
    html! {
        @for asset in paths.filter_map(|p| MARKSTREAM_ASSETS.get(p)) {
            link rel="modulepreload" href=(asset.plain_url())
                integrity=(asset.integrity()) crossorigin="anonymous";
        }
    }
}

/// Writes the `<link rel="stylesheet">` tags: markstream, then the plugin.
#[must_use]
pub fn markstream_stylesheet() -> Markup {
    html! {
        (MARKSTREAM_ASSETS.stylesheet_tag(MARKSTREAM_CSS))
        (MARKSTREAM_ASSETS.stylesheet_tag(PLUGIN_CSS))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets::{CORE_JS, INIT_JS, MARKSTREAM_ASSETS, MARKSTREAM_CSS, PLUGIN_CSS};
    use crate::vendored::EAGER_MODULES;

    fn asset(path: &str) -> &'static autumn_web::assets::PluginAsset {
        MARKSTREAM_ASSETS.get(path).expect("bundled")
    }

    #[test]
    fn script_is_one_module_tag_with_sri_and_hashed_url() {
        let html = markstream_script().into_string();
        let init = asset(INIT_JS);
        assert_eq!(
            html,
            format!(
                r#"<script type="module" src="{}" integrity="{}" crossorigin="anonymous"></script>"#,
                init.url(),
                init.integrity()
            )
        );
    }

    #[test]
    fn preloads_cover_core_and_each_eager_module_at_plain_urls() {
        let html = markstream_preloads().into_string();
        let mut paths = vec![CORE_JS];
        paths.extend(EAGER_MODULES);
        assert_eq!(
            html.matches(r#"rel="modulepreload""#).count(),
            paths.len(),
            "{html}"
        );
        for path in paths {
            let a = asset(path);
            let tag = format!(
                r#"<link rel="modulepreload" href="{}" integrity="{}" crossorigin="anonymous">"#,
                a.plain_url(),
                a.integrity()
            );
            assert!(html.contains(&tag), "missing {tag}");
        }
    }

    #[test]
    fn stylesheet_links_both_files_with_sri() {
        let html = markstream_stylesheet().into_string();
        for path in [MARKSTREAM_CSS, PLUGIN_CSS] {
            let a = asset(path);
            assert!(html.contains(&format!(r#"href="{}""#, a.url())), "{html}");
            assert!(
                html.contains(&format!(r#"integrity="{}""#, a.integrity())),
                "{html}"
            );
        }
        let vendored_at = html
            .find(asset(MARKSTREAM_CSS).url())
            .expect("vendored css");
        let plugin_at = html.find(asset(PLUGIN_CSS).url()).expect("plugin css");
        assert!(vendored_at < plugin_at, "plugin styles must win: {html}");
    }

    #[test]
    fn head_has_styles_then_preloads_then_the_script() {
        let html = markstream_head().into_string();
        let css = html.find("stylesheet").expect("css");
        let preload = html.find("modulepreload").expect("preload");
        let script = html.find("<script").expect("script");
        assert!(css < preload && preload < script, "{html}");
        assert_eq!(html.matches("<script").count(), 1, "{html}");
        assert!(html.contains("></script>"), "no inline script body: {html}");
        assert!(!html.contains("importmap"), "{html}");
    }
}
