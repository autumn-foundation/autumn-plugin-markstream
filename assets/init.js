/* Autumn markstream plugin: the init module.
 *
 * It mounts markstream on each [data-markstream] container:
 * - on load,
 * - after each htmx swap ("htmx:load").
 * It unmounts a container and closes its stream on
 * "htmx:beforeCleanupElement".
 *
 * A container with data-markstream-src reads Server-Sent Events.
 * The protocol is in src/sse.rs. The module does not reconnect: a
 * reconnect starts the stream again and shows the text two times.
 *
 * DOM events (they bubble): markstream:mount, markstream:done,
 * markstream:error. Global API: window.AutumnMarkstream.
 */
import { createApp, h, shallowRef } from "./vendor/vue/vue.runtime.esm-browser.prod.js";
import MarkdownRender, {
  disableD2,
  disableInfographic,
  disableKatex,
  disableMermaid,
} from "./vendor/markstream-vue/index.js";
import {
  ATTR,
  EVENTS,
  MOUNTED,
  STATE,
  decodeData,
  initialState,
  readOptions,
  reduce,
  rendererProps,
} from "./core.js";

// Optional peers are not vendored. Turn them off: markstream then shows
// the source and logs no warnings. A page can load KaTeX as a global.
disableMermaid();
disableD2();
disableInfographic();
if (!globalThis.katex) {
  disableKatex();
}

const SELECTOR = "[" + ATTR.root + "]";
const handles = new WeakMap();

function prefersDark() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function emit(el, name, detail) {
  el.dispatchEvent(new CustomEvent("markstream:" + name, { bubbles: true, detail }));
}

/** Mounts markstream on `el` and returns its handle. */
function mount(el) {
  const existing = handles.get(el);
  if (existing) {
    return existing;
  }
  const options = readOptions((name) => el.getAttribute(name), prefersDark());
  const source = el.querySelector(":scope > pre.markstream-source");
  const state = shallowRef(initialState(source ? source.textContent : "", options.src !== null));
  const app = createApp({ render: () => h(MarkdownRender, rendererProps(options, state.value)) });
  let events = null;

  function close() {
    if (events !== null) {
      events.close();
      events = null;
    }
  }

  function apply(type, text) {
    const before = state.value;
    const next = reduce(before, type, text);
    if (next === before) {
      return;
    }
    state.value = next;
    el.setAttribute(STATE, next.status);
    el.setAttribute("aria-busy", String(next.status === "streaming"));
    if (next.status !== "streaming") {
      close();
      emit(el, next.status, { content: next.content });
    }
  }

  const handle = Object.freeze({
    /** Adds text to the end of an open stream. */
    append: (text) => apply("chunk", String(text)),
    /** Replaces all text of an open stream. */
    replace: (text) => apply("replace", String(text)),
    /** Marks the text final. */
    finish: () => apply("done", null),
    /** Marks the text final and failed. */
    fail: () => apply("error", null),
    /** Opens a new stream with `text` (default ""). */
    reset: (text = "") => apply("reset", String(text)),
    /** The current text. */
    content: () => state.value.content,
    /** "streaming", "done" or "error". */
    status: () => state.value.status,
    /** Closes the stream and removes markstream from `el`. */
    unmount() {
      close();
      app.unmount();
      handles.delete(el);
      el.removeAttribute(MOUNTED);
    },
  });

  handles.set(el, handle);
  el.setAttribute(MOUNTED, "");
  el.setAttribute(STATE, state.value.status);
  app.mount(el);

  if (options.src !== null) {
    events = new EventSource(options.src);
    for (const type of EVENTS) {
      // "error" also fires when the connection fails or closes early.
      events.addEventListener(type, (e) => apply(type, decodeData(e.data)));
    }
  }
  emit(el, "mount", { status: state.value.status });
  return handle;
}

/** True when `el` is inside a mounted container (rendered content). */
function nested(el) {
  const parent = el.parentElement;
  return parent !== null && parent.closest("[" + MOUNTED + "]") !== null;
}

/** Mounts each container in `root` (and `root` itself). */
function scan(root) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return;
  }
  const found = Array.from(root.querySelectorAll(SELECTOR));
  if (typeof root.matches === "function" && root.matches(SELECTOR)) {
    found.unshift(root);
  }
  for (const el of found) {
    // Rendered Markdown must not start a new container or stream.
    if (!handles.has(el) && !nested(el)) {
      mount(el);
    }
  }
}

document.addEventListener("htmx:load", (e) => scan(e.detail && e.detail.elt));
document.addEventListener("htmx:beforeCleanupElement", (e) => {
  const handle = e.detail && e.detail.elt ? handles.get(e.detail.elt) : undefined;
  if (handle) {
    handle.unmount();
  }
});

window.AutumnMarkstream = Object.freeze({
  mount,
  scan,
  get: (el) => handles.get(el) ?? null,
});

scan(document);
document.dispatchEvent(new CustomEvent("markstream:ready"));
