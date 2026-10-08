// Browser test: runs the demo app and checks it in headless Chromium.
//
// Run: cargo build --example markstream_demo && node tests/e2e/demo.e2e.mjs
// Set CSP_NONCE=1 to run the demo with Autumn's CSP nonce mode.
// Needs the `playwright` package (local or on NODE_PATH) and Chromium.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const BIN = resolve(process.env.DEMO_BIN ?? "target/debug/examples/markstream_demo");
const NONCE = process.env.CSP_NONCE === "1";
const MANIFEST = JSON.parse(readFileSync("assets/manifest.json", "utf8"));

function freePort() {
  return new Promise((done) => {
    const srv = createServer().listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => done(port));
    });
  });
}

async function waitUp(url, server) {
  let exited = null;
  server.on("exit", (code) => (exited = code));
  for (let i = 0; i < 150; i++) {
    if (exited !== null) throw new Error(`demo exited with code ${exited}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("demo did not start");
}

/** Adds a container to the page and scans it. Runs in the browser. */
function addContainer({ id, attrs = {}, source = null }) {
  const el = document.createElement("div");
  el.id = id;
  el.className = "markstream";
  el.setAttribute("data-markstream", "");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (source !== null) {
    const pre = document.createElement("pre");
    pre.className = "markstream-source";
    pre.textContent = source;
    el.append(pre);
  }
  document.body.append(el);
  window.AutumnMarkstream.scan(document.body);
}

const cwd = mkdtempSync(join(tmpdir(), "markstream-e2e-"));
if (NONCE) writeFileSync(join(cwd, "autumn.toml"), "[security.headers.csp_nonce]\nenabled = true\n");
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(BIN, [], {
  cwd,
  env: { ...process.env, AUTUMN_SERVER__PORT: String(port), MARKSTREAM_DEMO_DELAY_MS: "5" },
  stdio: ["ignore", "ignore", "inherit"],
});

let browser;
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("ok -", name);
}

try {
  await waitUp(base + "/", server);
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const page = await browser.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(String(e)));
  await page.addInitScript({ content: `window.__add = ${addContainer.toString()};` });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error("CSP violation: " + e.violatedDirective + " " + e.blockedURI + " " + (e.target && e.target.outerHTML ? e.target.outerHTML.slice(0, 80) : "") + " " + e.sourceFile + ":" + e.lineNumber),
    );
    // Count EventSource connections and close() calls.
    window.__es = { opened: [], closed: 0 };
    const Native = window.EventSource;
    window.EventSource = class extends Native {
      constructor(url, init) {
        super(url, init);
        window.__es.opened.push(String(url));
      }
      close() {
        window.__es.closed++;
        super.close();
      }
    };
  });
  const response = await page.goto(base + "/");

  await check("CSP is strict" + (NONCE ? " (nonce mode)" : ""), async () => {
    const csp = response.headers()["content-security-policy"] ?? "";
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    if (NONCE) assert.match(csp, /style-src 'self' 'nonce-/);
  });

  await check("every bundled module resolves with no import map", async () => {
    const urls = Object.keys(MANIFEST.files)
      .filter((p) => p.endsWith(".js"))
      .concat(["core.js"])
      .map((p) => `/static/_plugins/markstream/${p}`);
    const failed = await page.evaluate(async (urls) => {
      const results = await Promise.allSettled(urls.map((u) => import(u)));
      return results.flatMap((r, i) => (r.status === "rejected" ? [urls[i] + ": " + r.reason] : []));
    }, urls);
    assert.deepEqual(failed, []);
  });

  await check("static Markdown renders as HTML", async () => {
    const doc = page.locator('#static-doc[data-markstream-mounted][data-markstream-state="done"]');
    await doc.waitFor({ timeout: 10000 });
    await doc.locator("h1", { hasText: "Static Markdown" }).waitFor();
    assert.equal(await doc.locator("table").count(), 1);
    assert.equal(await doc.locator("strong", { hasText: "server-rendered" }).count(), 1);
    assert.equal(await doc.locator("pre.markstream-source").isVisible(), false, "source hidden");
    assert.equal(await doc.locator(".markstream-render[hx-disable]").count(), 1);
  });

  await check("code blocks have syntax highlighting", async () => {
    const doc = page.locator("#static-doc");
    await doc.locator("pre.markstream-code code .ms-tok-keyword").first().waitFor({ timeout: 10000 });
    assert.ok((await doc.locator("pre.markstream-code .ms-tok-string").count()) >= 1);
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
    // markstream shows text smoothly, so the DOM can follow "done" later.
    await live.locator("blockquote", { hasText: "No reconnect" }).waitFor({ timeout: 15000 });
    await live.locator("h2", { hasText: "Streaming answer" }).waitFor();
    assert.equal(await live.locator("ol li").count(), 3);
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

  await check("replace and a server error event reach the page", async () => {
    await page.route("**/replace-then-error", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'event: chunk\ndata: "a"\n\nevent: replace\ndata: "# Replaced"\n\nevent: error\ndata: null\n\n',
      }),
    );
    await page.evaluate(addContainer, { id: "rte", attrs: { "data-markstream-src": "/replace-then-error" } });
    await page.locator('#rte[data-markstream-state="error"]').waitFor({ timeout: 10000 });
    await page.locator("#rte h1", { hasText: "Replaced" }).waitFor({ timeout: 10000 });
    assert.equal(await page.evaluate(() => window.AutumnMarkstream.get(document.getElementById("rte")).content()), "# Replaced");
  });

  await check("an early close shows the error state and does not reconnect", async () => {
    let hits = 0;
    await page.route("**/broken", (route) => {
      hits++;
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'retry: 50\nevent: chunk\ndata: "partial"\n\n',
      });
    });
    await page.evaluate(addContainer, { id: "broken", attrs: { "data-markstream-src": "/broken" } });
    await page.locator('#broken[data-markstream-state="error"]').waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
    assert.equal(hits, 1, "EventSource must not reconnect");
    assert.equal(await page.evaluate(() => window.AutumnMarkstream.get(document.getElementById("broken")).content()), "partial");
  });

  await check("bad and cross-origin src fail only their own container", async () => {
    let evil = 0;
    await page.route("https://evil.example/**", (route) => {
      evil++;
      route.abort();
    });
    await page.evaluate(addContainer, { id: "bad", attrs: { "data-markstream-src": "http://exa mple.com/" } });
    await page.evaluate(addContainer, { id: "evil", attrs: { "data-markstream-src": "https://evil.example/s" } });
    await page.evaluate(addContainer, { id: "after", source: "# After" });
    assert.equal(await page.locator("#bad").getAttribute("data-markstream-state"), "error");
    assert.equal(await page.locator("#evil").getAttribute("data-markstream-state"), "error");
    await page.locator("#after h1", { hasText: "After" }).waitFor({ timeout: 10000 });
    assert.equal(evil, 0);
  });

  await check("options reach markstream (theme, typewriter)", async () => {
    await page.evaluate(addContainer, {
      id: "opts",
      source: "# Opts",
      attrs: { "data-markstream-theme": "dark", "data-markstream-typewriter": "true" },
    });
    await page.locator("#opts .markstream-vue.dark").waitFor({ timeout: 10000 });
    await page.locator('#opts h1[typewriter="true"]').waitFor({ timeout: 10000 });
  });

  await check("safe policy strips handlers; trusted needs the page opt-in", async () => {
    const md = 'x <img src="data:," onerror="1"> <u style="color:red">u</u>\n';
    await page.evaluate(addContainer, { id: "safe", source: md, attrs: { "data-markstream-html": "safe" } });
    await page.evaluate(addContainer, { id: "t1", source: md, attrs: { "data-markstream-html": "trusted" } });
    await page.locator("#safe img").waitFor({ state: "attached", timeout: 10000 });
    assert.equal(await page.locator("#safe img[onerror]").count(), 0);
    await page.locator("#t1 img").waitFor({ state: "attached", timeout: 10000 });
    assert.equal(await page.locator("#t1 u").count(), 0, "no opt-in: trusted acts as safe");
    await page.evaluate(() => {
      const meta = document.createElement("meta");
      meta.name = "markstream-allow-trusted";
      meta.content = "true";
      document.head.append(meta);
    });
    await page.evaluate(addContainer, { id: "t2", source: md, attrs: { "data-markstream-html": "trusted" } });
    await page.locator("#t2 u").waitFor({ state: "attached", timeout: 10000 });
  });

  await check("rendered Markdown cannot start a stream or run htmx", async () => {
    let hits = 0;
    await page.route(/\/(nested|pwn)$/, (route) => {
      hits++;
      route.abort();
    });
    const md =
      '<div data-markstream data-markstream-src="/nested">x</div>\n\n<div hx-get="/pwn" hx-trigger="load">y</div>\n';
    await page.evaluate(addContainer, { id: "inj", source: md, attrs: { "data-markstream-html": "trusted" } });
    const inner = page.locator("#inj [data-markstream-src='/nested']");
    await inner.first().waitFor({ state: "attached", timeout: 10000 });
    await page.evaluate(() => {
      window.AutumnMarkstream.scan(document.body);
      window.htmx.process(document.body);
    });
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#inj [data-markstream-mounted]").count(), 0);
    assert.equal(hits, 0);
  });

  await check("an htmx history copy mounts again with its text", async () => {
    // htmx history saves innerHTML (with rendered output) and swaps it back.
    const restored = await page.evaluate(async () => {
      const copy = document.createElement("section");
      copy.innerHTML = document.getElementById("inj").outerHTML.replace('id="inj"', 'id="inj-copy"');
      document.body.append(copy);
      window.htmx.process(copy);
      window.AutumnMarkstream.scan(copy);
      await new Promise((r) => setTimeout(r, 300));
      return window.__es.opened.filter((u) => u.endsWith("/nested")).length;
    });
    assert.equal(restored, 0, "no stream from the stale rendered output");
    const copy = page.locator("#inj-copy");
    assert.equal(await copy.locator(":scope > .markstream-render").count(), 1, "old render removed");
    assert.equal(await copy.locator("[data-markstream-mounted]").count(), 0);
    await copy.locator("[data-markstream-src='/nested']").first().waitFor({ state: "attached", timeout: 10000 });
  });

  await check("unmount, reset and swaps close open streams", async () => {
    await page.route("**/slow*", () => {}); // never answers: the stream stays open
    const out = await page.evaluate(async () => {
      const closed = () => window.__es.closed;
      for (const id of ["slow1", "slow2", "slow3"]) {
        window.__add({ id, attrs: { "data-markstream-src": "/" + id } });
      }
      const result = {};
      let n = closed();
      // 1. An outerHTML swap of the container (htmx cleanup).
      window.htmx.swap("#slow1", "<p>gone</p>", { swapStyle: "outerHTML" });
      result.outer = closed() - n;
      n = closed();
      // 2. An innerHTML swap into the container (a real htmx request).
      const slow2 = document.getElementById("slow2");
      await window.htmx.ajax("GET", "/ask", { target: "#slow2", swap: "innerHTML" });
      result.inner = closed() - n;
      result.innerHandle = window.AutumnMarkstream.get(slow2);
      n = closed();
      // 3. reset() closes the SSE stream.
      const el = document.getElementById("slow3");
      const h = window.AutumnMarkstream.get(el);
      h.reset("# Own");
      result.reset = closed() - n;
      // 4. A handle does nothing after unmount.
      h.unmount();
      let events = 0;
      el.addEventListener("markstream:done", () => events++);
      h.reset("x");
      h.finish();
      result.stale = [events, el.getAttribute("data-markstream-state")];
      return result;
    });
    assert.deepEqual(out, {
      outer: 1,
      inner: 1,
      innerHandle: null,
      reset: 1,
      stale: [0, "streaming"],
    });
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
    // Allowed: the demo favicon 404 and the aborted test routes. In nonce
    // mode the CSP also blocks the style attribute of the trusted test
    // markup (<u style>): that is the CSP doing its job.
    const uStyle = (p) => NONCE && /style-src-attr inline <u style="color:red">/.test(p);
    // Chrome logs one "Refused to apply inline style" line per blocked style.
    let refusals = problems.filter(uStyle).length;
    const expected = (p) => {
      if (/favicon|ERR_FAILED|status of 404/.test(p) || uStyle(p)) return true;
      if (/^Refused to apply inline style/.test(p) && refusals > 0) {
        refusals--;
        return true;
      }
      return false;
    };
    const real = problems.filter((p) => !expected(p));
    assert.deepEqual(real, []);
  });

  console.log(`\n${passed} browser checks passed${NONCE ? " (CSP nonce mode)" : ""}`);
} finally {
  await browser?.close();
  server.kill();
}
