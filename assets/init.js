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
 * markstream:error. It sends markstream:ready on document.
 * Global API: window.AutumnMarkstream.
 */
import { createApp, h, shallowRef } from "./vendor/vue/vue.runtime.esm-browser.prod.js";
import MarkdownRender, {
  disableD2,
  disableInfographic,
  disableKatex,
  disableMermaid,
  setCustomComponents,
} from "./vendor/markstream-vue/index.js";
import {
  ALLOW_TRUSTED,
  ATTR,
  CUSTOM_ID,
  EVENTS,
  MOUNTED,
  STATE,
  decodeData,
  highlight,
  initialState,
  readOptions,
  reduce,
  rendererProps,
  sameOriginUrl,
} from "./core.js";

// Optional peers are not vendored. Turn them off: markstream then shows
// the source and logs no warnings. A page can load KaTeX as a global.
disableMermaid();
disableD2();
disableInfographic();
if (!globalThis.katex) {
  disableKatex();
}

/**
 * The "code_block" component: a plain <pre><code> with token spans.
 * It uses classes only (no inline style), so the default CSP allows it.
 * Text goes through Vue text nodes, so code is never parsed as HTML.
 */
const CodeBlock = {
  name: "AutumnCodeBlock",
  props: { node: { type: Object, required: true }, isDark: Boolean },
  setup(props) {
    return () => {
      const node = props.node ?? {};
      const lang = String(node.language ?? "").trim().split(/\s/)[0].toLowerCase();
      const code = String(node.code ?? node.raw ?? "");
      const children = highlight(code, lang).map((token) =>
        token.type === "plain" ? token.text : h("span", { class: "ms-tok-" + token.type }, token.text),
      );
      return h(
        "pre",
        { class: "markstream-code" + (props.isDark ? " is-dark" : ""), "data-language": lang || null },
        [h("code", { class: lang ? "language-" + lang : null }, children)],
      );
    };
  },
};
setCustomComponents(CUSTOM_ID, { code_block: CodeBlock });

const SELECTOR = "[" + ATTR.root + "]";
const RENDER = "markstream-render";
const handles = new WeakMap();

function prefersDark() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** True when the page head opts in to the "trusted" HTML policy. */
function trustedAllowed() {
  return document.head !== null && document.head.querySelector('meta[name="' + ALLOW_TRUSTED + '"]') !== null;
}

function emit(el, name, detail) {
  el.dispatchEvent(new CustomEvent("markstream:" + name, { bubbles: true, detail }));
}

/**
 * Keeps the source <pre> and adds a fresh render target.
 * It removes old rendered output, for example from an htmx history copy.
 * `hx-disable` stops htmx from running hx-* attributes in the Markdown.
 */
function prepare(el) {
  let source = el.querySelector(":scope > pre.markstream-source");
  if (source === null) {
    source = document.createElement("pre");
    source.className = "markstream-source";
    el.prepend(source);
  }
  for (const child of Array.from(el.children)) {
    if (child !== source) {
      child.remove();
    }
  }
  const target = document.createElement("div");
  target.className = RENDER;
  target.setAttribute("hx-disable", "");
  el.append(target);
  return { source, target };
}

/** Mounts markstream on `el` and returns its handle. */
function mount(el) {
  const existing = handles.get(el);
  if (existing) {
    return existing;
  }
  const options = readOptions((name) => el.getAttribute(name), prefersDark(), {
    allowTrusted: trustedAllowed(),
  });
  const { source, target } = prepare(el);
  const state = shallowRef(initialState(source.textContent, options.src !== null));
  const app = createApp({ render: () => h(MarkdownRender, rendererProps(options, state.value)) });
  let events = null;
  let active = true;

  function close() {
    if (events !== null) {
      events.close();
      events = null;
    }
  }

  function show(next) {
    el.setAttribute(STATE, next.status);
    el.setAttribute("aria-busy", String(next.status === "streaming"));
  }

  function apply(type, text) {
    if (!active) {
      return;
    }
    const before = state.value;
    const next = reduce(before, type, text);
    if (next === before) {
      return;
    }
    state.value = next;
    // The source keeps the text, so an htmx history copy can mount again.
    source.textContent = next.content;
    show(next);
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
    /** Closes the SSE stream. Sets the text to `text` (default "") and
     *  marks it as not final. It opens no connection. */
    reset(text = "") {
      close();
      apply("reset", String(text));
    },
    /** The current text. */
    content: () => state.value.content,
    /** "streaming", "done" or "error". */
    status: () => state.value.status,
    /** Closes the stream and removes markstream. The source shows again. */
    unmount() {
      if (!active) {
        return;
      }
      active = false;
      close();
      app.unmount();
      handles.delete(el);
      el.removeAttribute(MOUNTED);
      el.removeAttribute("aria-busy");
    },
  });

  handles.set(el, handle);
  el.setAttribute(MOUNTED, "");
  show(state.value);
  app.mount(target);

  emit(el, "mount", { status: state.value.status });
  if (options.src !== null) {
    const url = sameOriginUrl(options.src, document.baseURI);
    try {
      if (url === null) {
        throw new TypeError("markstream: src must be a same-origin URL");
      }
      events = new EventSource(url);
      for (const type of EVENTS) {
        // "error" also fires when the connection fails or closes early.
        events.addEventListener(type, (e) => apply(type, decodeData(e.data)));
      }
    } catch {
      apply("error", null);
    }
  }
  return handle;
}

/** True when `el` is inside a mounted container or rendered Markdown. */
function nested(el) {
  const parent = el.parentElement;
  return parent !== null && parent.closest("[" + MOUNTED + "], ." + RENDER) !== null;
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
    // Check each element just before its mount: an earlier mount can
    // remove it. Rendered Markdown must not start a container or stream.
    if (!handles.has(el) && el.isConnected && !nested(el)) {
      try {
        mount(el);
      } catch (err) {
        console.error("markstream: mount failed", err);
      }
    }
  }
}

function unmountTarget(e) {
  const target = e.detail && e.detail.target;
  const handle = target ? handles.get(target) : undefined;
  if (handle && e.detail.shouldSwap !== false) {
    handle.unmount();
  }
}

document.addEventListener("htmx:load", (e) => scan(e.detail && e.detail.elt));
// A swap into a container replaces its children: unmount it first.
document.addEventListener("htmx:beforeSwap", unmountTarget);
document.addEventListener("htmx:oobBeforeSwap", unmountTarget);
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
