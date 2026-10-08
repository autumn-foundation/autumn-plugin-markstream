//! The markstream asset bundle, embedded at compile time.
//!
//! The bundle holds three plugin files and the vendored markstream tree:
//!
//! - `init.js`: the module that mounts markstream on `[data-markstream]`.
//! - `core.js`: pure helpers for `init.js`.
//! - `markstream.css`: plugin styles (source fallback, states).
//! - `vendor/`: markstream-vue, Vue (runtime build), the parser, the core
//!   and floating-ui. `scripts/vendor.py` makes this tree.
//!
//! `scripts/vendor.py` rewrites each bare import (`"vue"`) to a relative
//! path. The browser then resolves each import with no import map. An
//! import map is an inline script, and the default Autumn CSP blocks it.
//!
//! Autumn serves each file under `/static/_plugins/markstream/` at a hashed
//! URL (`immutable`) and at a plain URL (`must-revalidate`). Relative
//! imports resolve to the plain URLs. Autumn does not serve
//! `assets/manifest.json` or `assets/licenses/`.

use autumn_web::assets::PluginAssets;

use crate::vendored::vendored_files;

/// URL namespace of the bundle: `/static/_plugins/markstream/`.
pub const ASSETS_NAMESPACE: &str = "markstream";

/// Logical path of the init module.
pub(crate) const INIT_JS: &str = "init.js";

/// Logical path of the pure helper module.
pub(crate) const CORE_JS: &str = "core.js";

/// Logical path of the plugin stylesheet.
pub(crate) const PLUGIN_CSS: &str = "markstream.css";

/// Logical path of the vendored markstream stylesheet.
pub(crate) const MARKSTREAM_CSS: &str = "vendor/markstream-vue/index.css";

/// Logical path of the vendored markstream entry module.
#[cfg(test)]
pub(crate) const MARKSTREAM_ENTRY: &str = "vendor/markstream-vue/index.js";

/// Vendored markstream-vue version.
pub const MARKSTREAM_VERSION: &str = "2.0.16";

/// Vendored Vue version (runtime ESM build).
pub const VUE_VERSION: &str = "3.5.43";

/// The plugin asset bundle.
///
/// [`MarkstreamPlugin`](crate::MarkstreamPlugin) installs it. Use it
/// directly only to make URLs or tags:
///
/// ```rust
/// use autumn_plugin_markstream::MARKSTREAM_ASSETS;
///
/// let url = MARKSTREAM_ASSETS.url("init.js");
/// assert!(url.starts_with("/static/_plugins/markstream/init."), "{url}");
/// ```
pub static MARKSTREAM_ASSETS: PluginAssets = PluginAssets::from_files(
    ASSETS_NAMESPACE,
    vendored_files![
        (INIT_JS, include_bytes!("../assets/init.js")),
        (CORE_JS, include_bytes!("../assets/core.js")),
        (PLUGIN_CSS, include_bytes!("../assets/markstream.css")),
    ],
);

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{imports, resolve, sri};
    use crate::vendored::{EAGER_MODULES, VENDORED};
    use regex::Regex;

    const OPTIONAL_PEERS: &[&str] = &[
        "katex",
        "katex/dist/contrib/mhchem",
        "mermaid",
        "stream-diffs/markstream",
        "@terrastruct/d2",
    ];

    fn manifest() -> serde_json::Value {
        serde_json::from_str(include_str!("../assets/manifest.json")).expect("valid manifest")
    }

    fn has_ext(path: &str, ext: &str) -> bool {
        std::path::Path::new(path)
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case(ext))
    }

    fn js_files() -> impl Iterator<Item = &'static autumn_web::assets::PluginAsset> {
        MARKSTREAM_ASSETS
            .iter()
            .filter(|a| has_ext(a.logical_path(), "js"))
    }

    fn text(asset: &autumn_web::assets::PluginAsset) -> &str {
        std::str::from_utf8(asset.bytes()).expect("utf-8 source")
    }

    #[test]
    fn bundle_holds_plugin_files_and_vendored_files_only() {
        let files: Vec<&str> = MARKSTREAM_ASSETS
            .iter()
            .map(autumn_web::assets::PluginAsset::logical_path)
            .collect();
        let mut expected: Vec<&str> = VENDORED.to_vec();
        expected.extend([CORE_JS, INIT_JS, PLUGIN_CSS]);
        expected.sort_unstable();
        assert_eq!(files, expected);
        assert!(
            !files
                .iter()
                .any(|f| f.contains("manifest") || f.contains("licenses"))
        );
        assert_eq!(MARKSTREAM_ASSETS.namespace(), ASSETS_NAMESPACE);
        assert_eq!(
            MARKSTREAM_ASSETS.mount_path(),
            "/static/_plugins/markstream"
        );
    }

    #[test]
    fn manifest_lists_each_vendored_file_and_pins_its_bytes() {
        let manifest = manifest();
        let pinned = manifest["files"].as_object().expect("files map");
        let mut names: Vec<&str> = pinned.keys().map(String::as_str).collect();
        names.sort_unstable();
        assert_eq!(names, VENDORED);
        for (path, pin) in pinned {
            let asset = MARKSTREAM_ASSETS.get(path).expect("pinned file is bundled");
            assert_eq!(pin["integrity"], sri(asset.bytes()), "{path} drifted");
            assert_eq!(asset.integrity(), sri(asset.bytes()));
            if pin["rewritten"] == false {
                assert_eq!(pin["integrity"], pin["upstream_integrity"], "{path}");
            }
        }
    }

    #[test]
    fn manifest_agrees_with_version_constants() {
        let pinned = manifest()["files"].clone();
        let version = |path: &str| pinned[path]["version"].as_str().map(str::to_owned);
        assert_eq!(
            version("vendor/markstream-vue/index.js").as_deref(),
            Some(MARKSTREAM_VERSION)
        );
        assert_eq!(
            version("vendor/vue/vue.runtime.esm-browser.prod.js").as_deref(),
            Some(VUE_VERSION)
        );
    }

    #[test]
    fn each_relative_import_resolves_inside_the_bundle() {
        for asset in js_files() {
            for import in imports(text(asset)) {
                if import.spec.starts_with('.') {
                    let target = resolve(asset.logical_path(), &import.spec);
                    assert!(
                        MARKSTREAM_ASSETS.get(&target).is_some(),
                        "{} imports missing {target}",
                        asset.logical_path()
                    );
                }
            }
        }
    }

    #[test]
    fn only_optional_peers_stay_bare_and_only_as_dynamic_imports() {
        for asset in js_files() {
            for import in imports(text(asset)) {
                if import.spec.starts_with('.') {
                    continue;
                }
                assert!(
                    import.dynamic && OPTIONAL_PEERS.contains(&import.spec.as_str()),
                    "{} has a bare import {import:?}; it needs an import map",
                    asset.logical_path()
                );
            }
        }
    }

    #[test]
    fn served_javascript_has_no_eval_and_no_function_constructor() {
        let banned = Regex::new(r"\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(\s*['\x22]")
            .expect("regex");
        for asset in js_files() {
            assert!(
                !banned.is_match(text(asset)),
                "{} needs 'unsafe-eval'",
                asset.logical_path()
            );
        }
    }

    #[test]
    fn eager_modules_are_the_static_closure_of_the_entry() {
        let mut seen: Vec<String> = Vec::new();
        let mut queue = vec![MARKSTREAM_ENTRY.to_owned()];
        while let Some(path) = queue.pop() {
            if seen.contains(&path) {
                continue;
            }
            let asset = MARKSTREAM_ASSETS.get(&path).expect("bundled");
            for import in imports(text(asset)) {
                if !import.dynamic && import.spec.starts_with('.') {
                    queue.push(resolve(&path, &import.spec));
                }
            }
            seen.push(path);
        }
        seen.sort_unstable();
        assert_eq!(seen, EAGER_MODULES);
    }

    #[test]
    fn plugin_modules_import_only_bundle_files() {
        for path in [INIT_JS, CORE_JS] {
            let asset = MARKSTREAM_ASSETS.get(path).expect("bundled");
            for import in imports(text(asset)) {
                assert!(import.spec.starts_with("./"), "{path}: {import:?}");
            }
        }
    }

    #[test]
    fn content_types_match_the_files() {
        for asset in MARKSTREAM_ASSETS.iter() {
            let want = if has_ext(asset.logical_path(), "css") {
                "text/css; charset=utf-8"
            } else {
                "text/javascript; charset=utf-8"
            };
            assert_eq!(asset.content_type(), want, "{}", asset.logical_path());
        }
    }

    #[test]
    fn urls_are_fingerprinted_under_the_plugin_mount() {
        for asset in MARKSTREAM_ASSETS.iter() {
            let path = asset.logical_path();
            assert_eq!(
                asset.plain_url(),
                format!("/static/_plugins/markstream/{path}")
            );
            let (stem, ext) = path.rsplit_once('.').expect("extension");
            let hash = asset
                .url()
                .strip_prefix(&format!("/static/_plugins/markstream/{stem}."))
                .and_then(|rest| rest.strip_suffix(&format!(".{ext}")))
                .expect("fingerprinted form");
            assert_eq!(hash.len(), 8);
            assert!(hash.bytes().all(|b| b.is_ascii_hexdigit()));
        }
    }
}
