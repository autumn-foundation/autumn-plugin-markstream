//! [`MarkstreamPlugin`]: installs the markstream assets in an Autumn app.
//!
//! The plugin gives [`MARKSTREAM_ASSETS`] to Autumn's
//! `AppBuilder::plugin_assets` seam. It adds no other routes and reads no
//! configuration.

use std::borrow::Cow;

use autumn_web::app::AppBuilder;
use autumn_web::plugin::Plugin;

use crate::assets::MARKSTREAM_ASSETS;

/// The plugin name in Autumn diagnostics.
pub const PLUGIN_NAME: &str = "autumn-plugin-markstream";

/// Installs the markstream assets in an Autumn app.
///
/// ```rust,no_run
/// use autumn_plugin_markstream::MarkstreamPlugin;
///
/// # async fn run() {
/// autumn_web::app()
///     .plugin(MarkstreamPlugin::new())
///     .run()
///     .await;
/// # }
/// ```
///
/// Then put [`markstream_head`](crate::markstream_head) in the page head
/// and render Markdown with [`Markstream`](crate::Markstream).
#[derive(Debug, Default, Clone, Copy)]
#[must_use]
pub struct MarkstreamPlugin;

impl MarkstreamPlugin {
    /// Makes the plugin.
    pub const fn new() -> Self {
        Self
    }
}

impl Plugin for MarkstreamPlugin {
    fn name(&self) -> Cow<'static, str> {
        Cow::Borrowed(PLUGIN_NAME)
    }

    fn build(self, app: AppBuilder) -> AppBuilder {
        app.plugin_assets(&MARKSTREAM_ASSETS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets::{CORE_JS, INIT_JS, MARKSTREAM_ASSETS, MARKSTREAM_ENTRY, PLUGIN_CSS};
    use autumn_web::assets::{PLUGIN_ASSETS_ROUTE_MARKER, asset_url};
    use autumn_web::plugin_conformance::{ConformanceConfig, run_conformance};
    use autumn_web::route_listing::{RouteClassification, RouteSource};
    use autumn_web::test::{TestApp, TestClient};

    const JS: &str = "text/javascript; charset=utf-8";
    const IMMUTABLE: &str = "public, max-age=31536000, immutable";
    const REVALIDATE: &str = "public, max-age=0, must-revalidate";

    fn client() -> TestClient {
        TestApp::new().plugin(MarkstreamPlugin::new()).build()
    }

    #[tokio::test]
    async fn init_module_serves_at_its_hashed_url() {
        let response = client().get(&MARKSTREAM_ASSETS.url(INIT_JS)).send().await;
        response
            .assert_ok()
            .assert_header("content-type", JS)
            .assert_header("cache-control", IMMUTABLE);
        assert!(response.text().contains("./core.js"));
    }

    #[tokio::test]
    async fn relative_imports_resolve_to_plain_urls_that_serve() {
        let client = client();
        for path in [
            CORE_JS,
            MARKSTREAM_ENTRY,
            "vendor/vue/vue.runtime.esm-browser.prod.js",
        ] {
            let plain = format!("/static/_plugins/markstream/{path}");
            let response = client.get(&plain).send().await;
            response
                .assert_ok()
                .assert_header("content-type", JS)
                .assert_header("cache-control", REVALIDATE);
            let etag = response.header("etag").expect("etag").to_owned();
            client
                .get(&plain)
                .header("if-none-match", &etag)
                .send()
                .await
                .assert_status(304);
        }
    }

    #[tokio::test]
    async fn stylesheets_serve() {
        let client = client();
        for path in [PLUGIN_CSS, "vendor/markstream-vue/index.css"] {
            client
                .get(&MARKSTREAM_ASSETS.url(path))
                .send()
                .await
                .assert_ok()
                .assert_header("content-type", "text/css; charset=utf-8");
        }
    }

    #[tokio::test]
    async fn provenance_and_unknown_paths_are_not_found() {
        let client = client();
        for path in [
            "/static/_plugins/markstream/manifest.json",
            "/static/_plugins/markstream/licenses/vue.LICENSE",
            "/static/_plugins/markstream/init.00000000.js",
            "/static/_plugins/markstream/vendor/markstream-vue/tailwind.js",
            "/static/_plugins/markstream/../manifest.json",
        ] {
            client.get(path).send().await.assert_status(404);
        }
    }

    #[tokio::test]
    async fn asset_url_resolves_the_installed_bundle() {
        let _client = client();
        assert_eq!(
            asset_url(&format!("_plugins/markstream/{INIT_JS}")),
            MARKSTREAM_ASSETS.url(INIT_JS)
        );
    }

    #[test]
    fn bundle_routes_are_public_plugin_routes() {
        let app = autumn_web::app().plugin(MarkstreamPlugin::new());
        let infos = app.plugin_route_infos().expect("route infos");
        let routes: Vec<_> = infos
            .iter()
            .filter(|i| i.path.starts_with("/static/_plugins/markstream/"))
            .collect();
        assert_eq!(routes.len(), MARKSTREAM_ASSETS.iter().count() * 2);
        for info in routes {
            assert_eq!(info.method, "GET");
            assert_eq!(info.classification, RouteClassification::Public);
            assert_eq!(info.middleware, [PLUGIN_ASSETS_ROUTE_MARKER]);
            assert_eq!(info.source, RouteSource::Plugin(PLUGIN_NAME.to_owned()));
        }
    }

    #[test]
    fn plugin_passes_conformance() {
        let app = autumn_web::app().plugin(MarkstreamPlugin::new());
        let infos = app.plugin_route_infos().expect("route infos");
        let report = run_conformance(&ConformanceConfig::new(PLUGIN_NAME), &infos);
        assert!(report.passed(), "{}", report.to_text_report());
    }

    #[tokio::test]
    async fn installing_the_plugin_twice_is_harmless() {
        let client = TestApp::new()
            .plugin(MarkstreamPlugin::new())
            .plugin(MarkstreamPlugin::new())
            .build();
        client
            .get(&MARKSTREAM_ASSETS.url(INIT_JS))
            .send()
            .await
            .assert_ok();
    }
}
