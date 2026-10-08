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

/**
 * Reads the container options.
 * `getAttr(name)` returns the attribute value or null.
 * `prefersDark` is the user's `prefers-color-scheme: dark` result.
 * Unknown values fall back to safe values.
 */
export function readOptions(getAttr, prefersDark) {
  const theme = oneOf(getAttr(ATTR.theme), THEMES);
  const nodes = getAttr(ATTR.maxLiveNodes);
  const parsed = nodes !== null && /^\d+$/.test(nodes) ? Number(nodes) : null;
  const src = getAttr(ATTR.src);
  return {
    htmlPolicy: oneOf(getAttr(ATTR.html), HTML_POLICIES) ?? "escape",
    mode: oneOf(getAttr(ATTR.mode), MODES),
    isDark: theme === null ? Boolean(prefersDark) : theme === "dark",
    typewriter: getAttr(ATTR.typewriter) === "true",
    maxLiveNodes: parsed,
    src: src ? src : null,
  };
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

/** The props for the markstream `MarkdownRender` component. */
export function rendererProps(options, state) {
  const props = {
    content: state.content,
    final: state.final,
    htmlPolicy: options.htmlPolicy,
    isDark: options.isDark,
    typewriter: options.typewriter,
    // No syntax highlighter is vendored. Plain <pre> blocks load no chunk.
    renderCodeBlocksAsPre: true,
  };
  if (options.mode !== null) {
    props.mode = options.mode;
  }
  if (options.maxLiveNodes !== null) {
    props.maxLiveNodes = options.maxLiveNodes;
  }
  return props;
}
