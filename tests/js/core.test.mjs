// Unit tests for assets/core.js. Run: node --test tests/js/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTR,
  decodeData,
  highlight,
  initialState,
  readOptions,
  reduce,
  rendererProps,
  sameOriginUrl,
} from "../../assets/core.js";

const attrs = (map) => (name) => (name in map ? map[name] : null);

test("attribute names match the Rust builder", () => {
  assert.deepEqual(Object.values(ATTR).sort(), [
    "data-markstream",
    "data-markstream-html",
    "data-markstream-max-live-nodes",
    "data-markstream-mode",
    "data-markstream-src",
    "data-markstream-theme",
    "data-markstream-typewriter",
  ]);
});

test("readOptions: safe defaults", () => {
  assert.deepEqual(readOptions(attrs({}), false), {
    htmlPolicy: "escape",
    mode: null,
    isDark: false,
    typewriter: false,
    maxLiveNodes: null,
    src: null,
  });
});

test("readOptions: reads each attribute", () => {
  const o = readOptions(
    attrs({
      "data-markstream-html": "safe",
      "data-markstream-mode": "chat",
      "data-markstream-theme": "dark",
      "data-markstream-typewriter": "true",
      "data-markstream-max-live-nodes": "0",
      "data-markstream-src": "/s",
    }),
    false,
  );
  assert.deepEqual(o, {
    htmlPolicy: "safe",
    mode: "chat",
    isDark: true,
    typewriter: true,
    maxLiveNodes: 0,
    src: "/s",
  });
});

test("readOptions: unknown values fall back to safe values", () => {
  const o = readOptions(
    attrs({
      "data-markstream-html": "TRUSTED",
      "data-markstream-mode": "weird",
      "data-markstream-theme": "light",
      "data-markstream-typewriter": "yes",
      "data-markstream-max-live-nodes": "-3",
      "data-markstream-src": "",
    }),
    true,
  );
  assert.equal(o.htmlPolicy, "escape");
  assert.equal(o.mode, null);
  assert.equal(o.isDark, false, "explicit light wins over prefers-dark");
  assert.equal(o.typewriter, false);
  assert.equal(o.maxLiveNodes, null);
  assert.equal(o.src, null);
});

test("readOptions: auto theme follows prefers-color-scheme", () => {
  assert.equal(readOptions(attrs({}), true).isDark, true);
  assert.equal(readOptions(attrs({ "data-markstream-theme": "dark" }), false).isDark, true);
});

test("decodeData: JSON strings only", () => {
  assert.equal(decodeData('" a\\r\\n"'), " a\r\n");
  assert.equal(decodeData("null"), null);
  assert.equal(decodeData("42"), null);
  assert.equal(decodeData("{"), null);
  assert.equal(decodeData(undefined), null);
});

test("initialState: static is final, stream is open", () => {
  assert.deepEqual(initialState("x", false), { content: "x", final: true, status: "done" });
  assert.deepEqual(initialState("", true), { content: "", final: false, status: "streaming" });
});

test("reduce: chunks append, replace replaces, done finishes", () => {
  let s = initialState("A", true);
  s = reduce(s, "chunk", "b");
  s = reduce(s, "chunk", " c");
  assert.equal(s.content, "Ab c");
  s = reduce(s, "replace", "new");
  assert.deepEqual(s, { content: "new", final: false, status: "streaming" });
  s = reduce(s, "done", null);
  assert.deepEqual(s, { content: "new", final: true, status: "done" });
});

test("reduce: nothing changes after done or error", () => {
  const done = reduce(initialState("x", true), "done", null);
  assert.equal(reduce(done, "chunk", "y"), done);
  assert.equal(reduce(done, "error", null), done);
  const failed = reduce(initialState("x", true), "error", null);
  assert.deepEqual(failed, { content: "x", final: true, status: "error" });
  assert.equal(reduce(failed, "done", null), failed);
});

test("reduce: bad chunk data fails the stream", () => {
  const s = reduce(initialState("x", true), "chunk", null);
  assert.equal(s.status, "error");
  assert.equal(s.final, true);
});

test("reduce: unknown event types are ignored", () => {
  const s = initialState("x", true);
  assert.equal(reduce(s, "message", "y"), s);
});

test("reduce: reset opens a new stream", () => {
  const done = initialState("old", false);
  assert.deepEqual(reduce(done, "reset", "new"), { content: "new", final: false, status: "streaming" });
  assert.deepEqual(reduce(done, "reset", null), { content: "", final: false, status: "streaming" });
});

test("reduce: matches a model over random event sequences", () => {
  const types = ["chunk", "replace", "done", "error", "message"];
  let seed = 7;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  for (let run = 0; run < 500; run++) {
    let s = initialState("", true);
    let content = "";
    let status = "streaming";
    for (let i = 0; i < 12; i++) {
      const type = types[rand(types.length)];
      const text = rand(5) === 0 ? null : String(rand(100));
      s = reduce(s, type, text);
      if (status !== "streaming") continue;
      if (type === "chunk" || type === "replace") {
        if (text === null) status = "error";
        else content = type === "chunk" ? content + text : text;
      } else if (type === "done" || type === "error") {
        status = type;
      }
    }
    assert.deepEqual(s, { content, final: status !== "streaming", status });
  }
});

test("rendererProps: maps options and state to markstream props", () => {
  const options = readOptions(attrs({ "data-markstream-mode": "docs", "data-markstream-max-live-nodes": "5" }), false);
  assert.deepEqual(rendererProps(options, initialState("# x", true)), {
    content: "# x",
    final: false,
    htmlPolicy: "escape",
    isDark: false,
    typewriter: false,
    customId: "autumn-markstream",
    mode: "docs",
    maxLiveNodes: 5,
  });
  const bare = rendererProps(readOptions(attrs({}), false), initialState("", false));
  assert.equal("mode" in bare, false);
  assert.equal("maxLiveNodes" in bare, false);
});

test("readOptions: trusted needs the page opt-in, else safe", () => {
  const get = attrs({ "data-markstream-html": "trusted" });
  assert.equal(readOptions(get, false).htmlPolicy, "safe");
  assert.equal(readOptions(get, false, { allowTrusted: false }).htmlPolicy, "safe");
  assert.equal(readOptions(get, false, { allowTrusted: true }).htmlPolicy, "trusted");
});

test("sameOriginUrl: only same-origin http(s) URLs", () => {
  const base = "https://app.example/page/1";
  assert.equal(sameOriginUrl("/answer/1", base), "https://app.example/answer/1");
  assert.equal(sameOriginUrl("answer?x=1", base), "https://app.example/page/answer?x=1");
  assert.equal(sameOriginUrl("https://app.example/s", base), "https://app.example/s");
  assert.equal(sameOriginUrl("https://evil.example/s", base), null);
  assert.equal(sameOriginUrl("//evil.example/s", base), null);
  assert.equal(sameOriginUrl("javascript:alert(1)", base), null);
  assert.equal(sameOriginUrl("http://exa mple.com/", base), null);
  assert.equal(sameOriginUrl("", base), null);
  assert.equal(sameOriginUrl(null, base), null);
});

test("highlight: tokens rejoin to the exact source", () => {
  const code = 'fn main() {\n    // hi\n    let s = "a\\"b"; let n = 0x1F + 2.5;\n}\n';
  const tokens = highlight(code, "rust");
  assert.equal(tokens.map((t) => t.text).join(""), code);
});

test("highlight: classifies keyword, string, number, comment", () => {
  const kinds = Object.fromEntries(
    highlight('let s = "x"; // c\nn = 42', "js").map((t) => [t.text, t.type]),
  );
  assert.equal(kinds["let"], "keyword");
  assert.equal(kinds['"x"'], "string");
  assert.equal(kinds["42"], "number");
  assert.equal(kinds["// c"], "comment");
});

test("highlight: hash comments only for hash languages", () => {
  assert.equal(highlight("# c", "python")[0].type, "comment");
  assert.equal(highlight("# c", "rust")[0].type, "plain");
});

test("highlight: unknown language and empty input are safe", () => {
  assert.deepEqual(highlight("", "rust"), []);
  const tokens = highlight("if x", "no-such-lang");
  assert.equal(tokens.map((t) => t.text).join(""), "if x");
  assert.ok(tokens.every((t) => t.type === "plain" || t.type === "string" || t.type === "number" || t.type === "comment"));
});

test("highlight: unterminated string and comment end at the input end", () => {
  const a = highlight('"abc', "js");
  assert.deepEqual(a, [{ type: "string", text: '"abc' }]);
  const b = highlight("/* abc", "js");
  assert.deepEqual(b, [{ type: "comment", text: "/* abc" }]);
});

test("highlight: very long input falls back to plain", () => {
  const big = "let x;\n".repeat(20000);
  assert.deepEqual(highlight(big, "js"), [{ type: "plain", text: big }]);
});
