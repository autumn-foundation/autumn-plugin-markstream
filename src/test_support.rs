//! Test helpers: SRI hashes and an ES module import scanner.

use base64::Engine as _;
use regex::Regex;
use sha2::{Digest as _, Sha384};
use std::sync::LazyLock;

/// Computes the `sha384` SRI of `bytes`.
pub fn sri(bytes: &[u8]) -> String {
    format!(
        "sha384-{}",
        base64::engine::general_purpose::STANDARD.encode(Sha384::digest(bytes))
    )
}

/// One import in a module: the specifier and the import kind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Import {
    /// The specifier text, for example `./a.js` or `vue`.
    pub spec: String,
    /// `true` for `import(...)`.
    pub dynamic: bool,
}

static SPEC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:\bfrom|\bimport)\s*(\(?)\s*["']([^"'\s]+)["']"#).expect("valid regex")
});

/// Finds each `from "x"`, `import "x"` and `import("x")` in `source`.
///
/// Lines that start with `//`, `/*` or `*` are comments. The scanner skips
/// them, so examples in doc comments do not count.
pub fn imports(source: &str) -> Vec<Import> {
    source
        .lines()
        .filter(|line| {
            let line = line.trim_start();
            !(line.starts_with("//") || line.starts_with("/*") || line.starts_with('*'))
        })
        .flat_map(|line| {
            SPEC.captures_iter(line).map(|c| Import {
                spec: c[2].to_owned(),
                dynamic: !c[1].is_empty(),
            })
        })
        .collect()
}

/// Resolves a relative `spec` against the logical path `from`.
pub fn resolve(from: &str, spec: &str) -> String {
    let mut parts: Vec<&str> = from.split('/').collect();
    parts.pop();
    for seg in spec.split('/') {
        match seg {
            "." | "" => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    parts.join("/")
}

#[test]
fn scanner_finds_static_dynamic_and_bare_imports() {
    let found =
        imports(r#"import{a}from"./a.js";export*from'../b.js';import"vue";import("./c.js")"#);
    let specs: Vec<_> = found.iter().map(|i| (i.spec.as_str(), i.dynamic)).collect();
    assert_eq!(
        specs,
        [
            ("./a.js", false),
            ("../b.js", false),
            ("vue", false),
            ("./c.js", true)
        ]
    );
}

#[test]
fn scanner_skips_comment_lines() {
    let source =
        "//#region linkify\n\t* import { L } from 'linkify-it'\n/* import 'x' */\nimport\"./y.js\"";
    let specs: Vec<_> = imports(source).into_iter().map(|i| i.spec).collect();
    assert_eq!(specs, ["./y.js"]);
}

#[test]
fn resolve_handles_dot_segments() {
    assert_eq!(resolve("vendor/a/b.js", "./c.js"), "vendor/a/c.js");
    assert_eq!(resolve("vendor/a/u/b.js", "../../v/x.js"), "vendor/v/x.js");
    assert_eq!(resolve("init.js", "./vendor/x.js"), "vendor/x.js");
}

/// One dispatched Server-Sent Event: `(event type, data)`.
pub type Dispatched = (String, String);

/// Parses an SSE body as the WHATWG HTML spec says a browser does.
///
/// It splits lines on CRLF, LF or CR. It drops comments. It does not
/// dispatch an event with an empty data buffer.
pub fn parse_sse(body: &str) -> Vec<Dispatched> {
    let mut out = Vec::new();
    let (mut event, mut data) = (String::new(), String::new());
    let normalized = body.replace("\r\n", "\n").replace('\r', "\n");
    for line in normalized.split('\n') {
        if line.is_empty() {
            if !data.is_empty() {
                data.pop();
                let name = if event.is_empty() {
                    "message".to_owned()
                } else {
                    event.clone()
                };
                out.push((name, std::mem::take(&mut data)));
            }
            event.clear();
            data.clear();
            continue;
        }
        if line.starts_with(':') {
            continue;
        }
        let (field, value) = line
            .split_once(':')
            .map_or((line, ""), |(f, v)| (f, v.strip_prefix(' ').unwrap_or(v)));
        match field {
            "event" => value.clone_into(&mut event),
            "data" => {
                data.push_str(value);
                data.push('\n');
            }
            _ => {}
        }
    }
    out
}

#[test]
fn sse_parser_follows_the_spec() {
    let body = ": keep-alive\n\nevent: chunk\ndata:  a\ndata: b\r\n\nevent: done\n\ndata: x\n\n";
    assert_eq!(
        parse_sse(body),
        [
            ("chunk".to_owned(), " a\nb".to_owned()),
            ("message".to_owned(), "x".to_owned())
        ]
    );
}
