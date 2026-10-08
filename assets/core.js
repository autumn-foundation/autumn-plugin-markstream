/* Pure helpers for the markstream init module.
 *
 * This module has no DOM access, so node tests can import it.
 * Keep the attribute names and values in lockstep with src/markstream.rs.
 */

/** Container attributes. The Rust `Markstream` builder writes them. */
export const ATTR = Object.freeze({
  root: "data-markstream",
  html: "data-markstream-html",
  mode: "data-markstream-mode",
  theme: "data-markstream-theme",
  typewriter: "data-markstream-typewriter",
  maxLiveNodes: "data-markstream-max-live-nodes",
  src: "data-markstream-src",
});

/** The init module sets these attributes. */
export const MOUNTED = "data-markstream-mounted";
export const STATE = "data-markstream-state";

const HTML_POLICIES = ["escape", "safe", "trusted"];
const MODES = ["docs", "chat", "minimal"];
const THEMES = ["light", "dark"];

/** Stream event types. They match src/sse.rs. */
export const EVENTS = Object.freeze(["chunk", "replace", "done", "error"]);

function oneOf(value, allowed) {
  return allowed.includes(value) ? value : null;
}

/** The page opt-in for the "trusted" HTML policy (a meta tag name). */
export const ALLOW_TRUSTED = "markstream-allow-trusted";

/**
 * Reads the container options.
 * `getAttr(name)` returns the attribute value or null.
 * `prefersDark` is the user's `prefers-color-scheme: dark` result.
 * `allowTrusted` is true when the page opts in to "trusted". Without it,
 * "trusted" becomes "safe": injected markup cannot ask for raw HTML.
 * Unknown values fall back to safe values.
 */
export function readOptions(getAttr, prefersDark, { allowTrusted = false } = {}) {
  const theme = oneOf(getAttr(ATTR.theme), THEMES);
  const nodes = getAttr(ATTR.maxLiveNodes);
  const parsed = nodes !== null && /^\d+$/.test(nodes) ? Number(nodes) : null;
  const src = getAttr(ATTR.src);
  let htmlPolicy = oneOf(getAttr(ATTR.html), HTML_POLICIES) ?? "escape";
  if (htmlPolicy === "trusted" && !allowTrusted) {
    htmlPolicy = "safe";
  }
  return {
    htmlPolicy,
    mode: oneOf(getAttr(ATTR.mode), MODES),
    isDark: theme === null ? Boolean(prefersDark) : theme === "dark",
    typewriter: getAttr(ATTR.typewriter) === "true",
    maxLiveNodes: parsed,
    src: src ? src : null,
  };
}

/**
 * Resolves `src` against `baseHref`. Returns the absolute URL when it has
 * the same origin and an http(s) scheme, else null.
 */
export function sameOriginUrl(src, baseHref) {
  if (!src) {
    return null;
  }
  try {
    const url = new URL(src, baseHref);
    const base = new URL(baseHref);
    const web = url.protocol === "http:" || url.protocol === "https:";
    return web && url.origin === base.origin ? url.href : null;
  } catch {
    return null;
  }
}

/** Decodes SSE data: a JSON string gives the string, else null. */
export function decodeData(data) {
  try {
    const value = JSON.parse(data);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** The first state. A static container is final. A stream is open. */
export function initialState(content, streaming) {
  return streaming
    ? { content, final: false, status: "streaming" }
    : { content, final: true, status: "done" };
}

/**
 * Applies one event to a state and returns the next state.
 * `text` is the decoded text, or null.
 * - After "done" or "error", only "reset" changes the state.
 * - A "chunk" or "replace" with null text fails the stream.
 * - Unknown types return the same state.
 */
export function reduce(state, type, text) {
  if (type === "reset") {
    return initialState(text ?? "", true);
  }
  if (state.status !== "streaming") {
    return state;
  }
  switch (type) {
    case "chunk":
    case "replace":
      if (text === null) {
        return { content: state.content, final: true, status: "error" };
      }
      return {
        content: type === "chunk" ? state.content + text : text,
        final: false,
        status: "streaming",
      };
    case "done":
    case "error":
      return { content: state.content, final: true, status: type };
    default:
      return state;
  }
}

/** The markstream custom-component scope of this plugin. */
export const CUSTOM_ID = "autumn-markstream";

/** The props for the markstream `MarkdownRender` component. */
export function rendererProps(options, state) {
  const props = {
    content: state.content,
    final: state.final,
    htmlPolicy: options.htmlPolicy,
    isDark: options.isDark,
    typewriter: options.typewriter,
    // init.js maps "code_block" to its own component for this id.
    customId: CUSTOM_ID,
  };
  if (options.mode !== null) {
    props.mode = options.mode;
  }
  if (options.maxLiveNodes !== null) {
    props.maxLiveNodes = options.maxLiveNodes;
  }
  return props;
}

// --- Syntax highlighting -------------------------------------------------

/** Longest code that highlight() tokenizes. Longer code stays plain. */
export const HIGHLIGHT_LIMIT = 100000;

const C_KEYWORDS =
  "as async await break case catch class const continue crate default defer do else enum export extends " +
  "extern fn for from func function go if impl import in interface let loop match mod move mut new null " +
  "nil package private protected pub public ref return self static struct super switch this throw trait " +
  "true false try type typeof undefined union unsafe use var void where while yield";
const PY_KEYWORDS =
  "and as assert async await break class continue def del elif else except finally for from global if " +
  "import in is lambda None nonlocal not or pass raise return True False try while with yield";
const SH_KEYWORDS =
  "case do done elif else esac fi for function if in select then until while export local return";
const SQL_KEYWORDS =
  "select from where insert into values update set delete create table drop alter join left right inner " +
  "outer on group by order having limit and or not null as distinct union primary key index";
const DATA_KEYWORDS = "true false null";

const FAMILIES = {
  c: { keywords: C_KEYWORDS, line: ["//"], block: true, hash: false },
  python: { keywords: PY_KEYWORDS, line: ["#"], block: false, hash: true },
  shell: { keywords: SH_KEYWORDS, line: ["#"], block: false, hash: true },
  sql: { keywords: SQL_KEYWORDS, line: ["--"], block: true, hash: false, ci: true },
  data: { keywords: DATA_KEYWORDS, line: [], block: false, hash: false },
  yaml: { keywords: DATA_KEYWORDS, line: ["#"], block: false, hash: true },
};
const LANGUAGE_FAMILY = {};
for (const [family, names] of Object.entries({
  c: "c cpp c++ h hpp cs csharp java js jsx javascript ts tsx typescript rust rs go kotlin swift scala php dart css scss",
  python: "py python rb ruby",
  shell: "sh bash zsh shell console",
  sql: "sql",
  data: "json jsonc json5",
  yaml: "yaml yml toml ini",
})) {
  for (const name of names.split(" ")) {
    LANGUAGE_FAMILY[name] = family;
  }
}

const WORD_START = /[A-Za-z_$]/;
const WORD_CHAR = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;
const NUMBER_CHAR = /[0-9A-Za-z_.]/;

/**
 * Splits `code` into `{ type, text }` tokens for the language `lang`.
 * `type` is "plain", "keyword", "string", "number" or "comment".
 * - The tokens join back to `code` exactly.
 * - An unknown language gets strings, numbers and C comments, no keywords.
 * - Code longer than HIGHLIGHT_LIMIT is one plain token.
 * - No input throws.
 */
export function highlight(code, lang) {
  const text = String(code ?? "");
  if (text === "") {
    return [];
  }
  if (text.length > HIGHLIGHT_LIMIT) {
    return [{ type: "plain", text }];
  }
  const name = String(lang ?? "").trim().toLowerCase();
  const known = Object.hasOwn(LANGUAGE_FAMILY, name);
  const family = FAMILIES[known ? LANGUAGE_FAMILY[name] : "c"];
  const keywords = known ? new Set(family.keywords.split(" ")) : new Set();
  const out = [];
  let plain = "";
  let i = 0;

  const flush = () => {
    if (plain !== "") {
      out.push({ type: "plain", text: plain });
      plain = "";
    }
  };
  const push = (type, end) => {
    flush();
    out.push({ type, text: text.slice(i, end) });
    i = end;
  };
  const lineEnd = (from) => {
    const at = text.indexOf("\n", from);
    return at === -1 ? text.length : at;
  };

  while (i < text.length) {
    const ch = text[i];
    const marker = family.line.find((m) => text.startsWith(m, i));
    if (marker !== undefined) {
      push("comment", lineEnd(i));
    } else if (family.block && text.startsWith("/*", i)) {
      const at = text.indexOf("*/", i + 2);
      push("comment", at === -1 ? text.length : at + 2);
    } else if (ch === '"' || ch === "'" || (ch === "`" && family === FAMILIES.c)) {
      let j = i + 1;
      while (j < text.length && text[j] !== ch && !(text[j] === "\n" && ch !== "`")) {
        j += text[j] === "\\" ? 2 : 1;
      }
      push("string", Math.min(j < text.length && text[j] === ch ? j + 1 : j, text.length));
    } else if (DIGIT.test(ch) && !WORD_CHAR.test(text[i - 1] ?? " ")) {
      let j = i + 1;
      while (j < text.length && NUMBER_CHAR.test(text[j])) {
        j += 1;
      }
      push("number", j);
    } else if (WORD_START.test(ch)) {
      let j = i + 1;
      while (j < text.length && WORD_CHAR.test(text[j])) {
        j += 1;
      }
      const word = text.slice(i, j);
      if (keywords.has(family.ci ? word.toLowerCase() : word)) {
        push("keyword", j);
      } else {
        plain += word;
        i = j;
      }
    } else {
      plain += ch;
      i += 1;
    }
  }
  flush();
  return out;
}
