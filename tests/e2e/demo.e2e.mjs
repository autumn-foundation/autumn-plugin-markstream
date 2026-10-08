// Browser test: runs the demo app and checks it in headless Chromium.
//
// Run: cargo build --example markstream_demo && node tests/e2e/demo.e2e.mjs
// Needs the `playwright` package (local or on NODE_PATH) and Chromium.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const BIN = process.env.DEMO_BIN ?? "target/debug/examples/markstream_demo";

function freePort() {
  return new Promise((resolve) => {
    const srv = createServer().listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitUp(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("demo did not start");
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(BIN, [], {
  env: { ...process.env, AUTUMN_SERVER__PORT: String(port), MARKSTREAM_DEMO_DELAY_MS: "5" },
  stdio: ["ignore", "ignore", "inherit"],
});

let browser;
const checks = [];
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log("ok -", name);
}

try {
  await waitUp(base + "/");
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const page = await browser.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(String(e)));
  const response = await page.goto(base + "/");
  await page.evaluate(() =>
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error("CSP violation: " + e.violatedDirective + " " + e.blockedURI),
    ),
  );

  await check("default CSP is strict", async () => {
    const csp = response.headers()["content-security-policy"] ?? "";
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-eval/);
  });

  await check("static Markdown renders as HTML", async () => {
    const doc = page.locator('#static-doc[data-markstream-mounted][data-markstream-state="done"]');
    await doc.waitFor({ timeout: 10000 });
    await doc.locator("h1", { hasText: "Static Markdown" }).waitFor();
    assert.equal(await doc.locator("table").count(), 1);
    assert.equal(await doc.locator("strong", { hasText: "server-rendered" }).count(), 1);
    assert.equal(await doc.locator("pre.markstream-source").count(), 0, "fallback replaced");
  });

  await check("raw HTML is escaped by default", async () => {
    const doc = page.locator("#static-doc");
    assert.equal(await doc.locator("b").count(), 0);
    assert.match(await doc.innerText(), /<b>This raw HTML shows as text\.<\/b>/);
  });

  await check("SSE stream completes once", async () => {
    const live = page.locator('#live[data-markstream-state="done"]');
    await live.waitFor({ timeout: 15000 });
    assert.equal(await live.getAttribute("aria-busy"), "false");
    // markstream reveals text smoothly, so the DOM can lag "done".
    await live.locator("blockquote", { hasText: "No reconnect" }).waitFor({ timeout: 15000 });
    await live.locator("h2", { hasText: "Streaming answer" }).waitFor();
    assert.equal(await live.locator("ol li").count(), 3);
    assert.equal(await live.locator("blockquote").count(), 1);
    const text = await live.innerText();
    assert.equal(text.split("small chunks").length - 1, 1, "no double text");
  });

  await check("htmx swaps mount and stream", async () => {
    await page.click("#ask");
    await page.locator('#answer-0[data-markstream-state="done"]').waitFor({ timeout: 15000 });
    await page.locator("#answer-0 h3", { hasText: "Another answer" }).waitFor({ timeout: 15000 });
    await page.click("#ask");
    await page.locator('#answer-1[data-markstream-state="done"]').waitFor({ timeout: 15000 });
  });

  await check("an early close shows the error state and does not reconnect", async () => {
    let hits = 0;
    await page.route("**/broken", (route) => {
      hits++;
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'event: chunk\ndata: "partial"\n\n',
      });
    });
    const events = await page.evaluate(async () => {
      const el = document.createElement("div");
      el.id = "broken";
      el.setAttribute("data-markstream", "");
      el.setAttribute("data-markstream-src", "/broken");
      document.body.append(el);
      const seen = [];
      el.addEventListener("markstream:error", (e) => seen.push(e.detail.content));
      window.AutumnMarkstream.scan(document.body);
      await new Promise((r) => setTimeout(r, 4000));
      return seen;
    });
    assert.deepEqual(events, ["partial"]);
    assert.equal(hits, 1, "EventSource must not reconnect");
    assert.equal(await page.locator("#broken").getAttribute("data-markstream-state"), "error");
  });

  await check("the JS API drives a custom transport", async () => {
    const result = await page.evaluate(() => {
      const h = window.AutumnMarkstream.get(document.getElementById("live"));
      h.reset("# One");
      h.append("\n\nTwo");
      const mid = h.status();
      h.finish();
      h.append(" ignored");
      return [mid, h.status(), h.content()];
    });
    assert.deepEqual(result, ["streaming", "done", "# One\n\nTwo"]);
    await page.locator("#live h1", { hasText: "One" }).waitFor({ timeout: 15000 });
  });

  await check("rendered Markdown cannot start a nested stream", async () => {
    let hits = 0;
    await page.route("**/nested", (route) => {
      hits++;
      route.abort();
    });
    await page.evaluate(async () => {
      const el = document.createElement("div");
      el.id = "trusted";
      el.setAttribute("data-markstream", "");
      el.setAttribute("data-markstream-html", "trusted");
      const pre = document.createElement("pre");
      pre.className = "markstream-source";
      pre.textContent = '<div data-markstream data-markstream-src="/nested">x</div>\n';
      el.append(pre);
      document.body.append(el);
      window.AutumnMarkstream.scan(document.body);
      await new Promise((r) => setTimeout(r, 500));
      window.AutumnMarkstream.scan(document.body);
      await new Promise((r) => setTimeout(r, 500));
    });
    // The trusted HTML did render the inner container. It stays unmounted.
    const inner = page.locator("#trusted [data-markstream-src='/nested']");
    assert.ok((await inner.count()) >= 1, "trusted HTML renders the div");
    assert.equal(await page.locator("#trusted [data-markstream-mounted]").count(), 0);
    assert.equal(hits, 0);
  });

  await check("htmx cleanup unmounts the container", async () => {
    const left = await page.evaluate(() => {
      const el = document.getElementById("answer-0");
      // A real swap: htmx cleans up the old children first.
      window.htmx.swap("#answers", "<p>gone</p>", { swapStyle: "innerHTML" });
      return [window.AutumnMarkstream.get(el), el.hasAttribute("data-markstream-mounted")];
    });
    assert.deepEqual(left, [null, false]);
  });

  await check("no console errors, warnings or CSP violations", async () => {
    // The only allowed message is the favicon 404 of the demo.
    const real = problems.filter((p) => !/favicon/.test(p));
    assert.deepEqual(real, []);
  });

  console.log(`\n${checks.length} browser checks passed`);
} finally {
  await browser?.close();
  server.kill();
}
