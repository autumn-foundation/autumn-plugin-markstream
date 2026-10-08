//#region \0@oxc-project+runtime@0.95.0/helpers/typeof.js
function _typeof(o) {
	"@babel/helpers - typeof";
	return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
		return typeof o$1;
	} : function(o$1) {
		return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
	}, _typeof(o);
}

//#endregion
//#region \0@oxc-project+runtime@0.95.0/helpers/toPrimitive.js
function toPrimitive(t, r) {
	if ("object" != _typeof(t) || !t) return t;
	var e = t[Symbol.toPrimitive];
	if (void 0 !== e) {
		var i = e.call(t, r || "default");
		if ("object" != _typeof(i)) return i;
		throw new TypeError("@@toPrimitive must return a primitive value.");
	}
	return ("string" === r ? String : Number)(t);
}

//#endregion
//#region \0@oxc-project+runtime@0.95.0/helpers/toPropertyKey.js
function toPropertyKey(t) {
	var i = toPrimitive(t, "string");
	return "symbol" == _typeof(i) ? i : i + "";
}

//#endregion
//#region \0@oxc-project+runtime@0.95.0/helpers/defineProperty.js
function _defineProperty(e, r, t) {
	return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
		value: t,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[r] = t, e;
}

//#endregion
//#region \0@oxc-project+runtime@0.95.0/helpers/objectSpread2.js
function ownKeys(e, r) {
	var t = Object.keys(e);
	if (Object.getOwnPropertySymbols) {
		var o = Object.getOwnPropertySymbols(e);
		r && (o = o.filter(function(r$1) {
			return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
		})), t.push.apply(t, o);
	}
	return t;
}
function _objectSpread2(e) {
	for (var r = 1; r < arguments.length; r++) {
		var t = null != arguments[r] ? arguments[r] : {};
		r % 2 ? ownKeys(Object(t), !0).forEach(function(r$1) {
			_defineProperty(e, r$1, t[r$1]);
		}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r$1) {
			Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
		});
	}
	return e;
}

//#endregion
//#region src/diff-preview.ts
function createDiffMatchCache() {
	return {
		original: [],
		modified: [],
		matches: [],
		originalLines: /* @__PURE__ */ new Set(),
		modifiedLines: /* @__PURE__ */ new Set()
	};
}
function isLinePrefix(prefix, lines) {
	if (prefix.length === 0 || prefix.length > lines.length) return false;
	for (let index = 0; index < prefix.length; index++) if (prefix[index] !== lines[index]) return false;
	return true;
}
function reseedMatchCache(cache, original, modified, matches) {
	cache.original = original;
	cache.modified = modified;
	cache.matches = matches;
	cache.originalLines = new Set(original);
	cache.modifiedLines = new Set(modified);
}
const DIFF_HEADER_PREFIXES = [
	"diff ",
	"index ",
	"--- ",
	"+++ ",
	"@@ "
];
const NO_NEWLINE_METADATA = "\\ No newline at end of file";
const TRAILING_NEWLINE_RE = /\r\n$|\n$|\r$/;
const SOURCE_LINE_SPLIT_RE = /\r\n|\n|\r/;
const ENDS_WITH_NEWLINE_RE = /(?:\r\n|\n|\r)$/;
function displaySource(source, loading) {
	const value = String(source !== null && source !== void 0 ? source : "");
	return loading ? value : value.replace(TRAILING_NEWLINE_RE, "");
}
function splitSource(source, loading) {
	const value = displaySource(source, loading);
	return value ? value.split(SOURCE_LINE_SPLIT_RE) : [];
}
/**
* Incremental variant of `splitSource`. When the new display source is a pure
* append of the previously split one (and the loading flag is unchanged), only
* the last cached line plus the appended tail need a fresh split — earlier line
* strings are reused by reference, keeping per-frame cost proportional to the
* appended tail instead of the whole document. Any other change (replacement,
* shrink, loading flip) falls back to a full re-split and reseeds the cache.
*/
function splitSourceCached(source, loading, cache, side) {
	const value = displaySource(source, loading);
	const splitKey = side === "original" ? "originalSplit" : "modifiedSplit";
	const previous = cache[splitKey];
	if (previous && loading === previous.loading && value.startsWith(previous.source)) {
		var _previous$lines$at;
		if (value === "") {
			cache[splitKey] = {
				source: "",
				loading,
				lines: []
			};
			return [];
		}
		const tail = value.slice(previous.source.length);
		if (tail === "") return previous.lines;
		const endsWithCr = previous.source.endsWith("\r");
		const fresh = (endsWithCr ? previous.source.slice(-1) + tail : ((_previous$lines$at = previous.lines.at(-1)) !== null && _previous$lines$at !== void 0 ? _previous$lines$at : "") + tail).split(SOURCE_LINE_SPLIT_RE);
		const lines$1 = endsWithCr ? previous.lines.slice(0, -1).concat(fresh.slice(1)) : previous.lines.slice(0, -1).concat(fresh);
		cache[splitKey] = {
			source: value,
			loading,
			lines: lines$1
		};
		return lines$1;
	}
	const lines = value ? value.split(SOURCE_LINE_SPLIT_RE) : [];
	cache[splitKey] = {
		source: value,
		loading,
		lines
	};
	return lines;
}
function normalizeLanguage(language) {
	var _String$split$;
	return ((_String$split$ = String(language !== null && language !== void 0 ? language : "").split(/\s+/g)[0]) === null || _String$split$ === void 0 || (_String$split$ = _String$split$.split(":")[0]) === null || _String$split$ === void 0 ? void 0 : _String$split$.toLowerCase().replace(/[^\w-]/g, "")) || "plaintext";
}
function isBlank(code) {
	return String(code !== null && code !== void 0 ? code : "").trim().length === 0;
}
function makeLine(code, kind, key, number, preserveBlankKind = false) {
	const empty = isBlank(code);
	return {
		code,
		empty,
		key,
		kind: empty && kind !== "hunk" && kind !== "spacer" && !preserveBlankKind ? "context" : kind,
		number
	};
}
function shouldPreserveBlankKind(lines, index) {
	return !isBlank(lines[index]) || index < lines.length - 1;
}
function isRemovedLine(line) {
	return line.startsWith("-") && !line.startsWith("---");
}
function isAddedLine(line) {
	return line.startsWith("+") && !line.startsWith("+++");
}
function hasDiffHeaders(lines) {
	return lines.some((line) => DIFF_HEADER_PREFIXES.some((prefix) => line.startsWith(prefix)));
}
function normalizeDiffBody(body, headers) {
	return !headers && body.startsWith(" ") && !body.startsWith("  ") ? ` ${body}` : body;
}
function hasFinalNewline(source) {
	return ENDS_WITH_NEWLINE_RE.test(String(source !== null && source !== void 0 ? source : ""));
}
function createMetadataLine(key, metadataKind) {
	return _objectSpread2(_objectSpread2({}, makeLine("No newline at end of file", "metadata", key, "")), {}, { metadataKind });
}
function appendInlineSourceMetadata(lines, originalSource, modifiedSource) {
	const originalMissing = String(originalSource !== null && originalSource !== void 0 ? originalSource : "").length > 0 && !hasFinalNewline(originalSource);
	const modifiedMissing = String(modifiedSource !== null && modifiedSource !== void 0 ? modifiedSource : "").length > 0 && !hasFinalNewline(modifiedSource);
	if (!originalMissing && !modifiedMissing) return lines;
	if (originalMissing) lines.push(createMetadataLine("inline-no-newline-original", "removed"));
	if (modifiedMissing) lines.push(createMetadataLine("inline-no-newline-modified", "added"));
	return lines;
}
function isExplicitDiffLanguage(language, raw) {
	var _String$split$0$trim, _String$split$2;
	if (normalizeLanguage(language) === "diff") return true;
	const firstLine = (_String$split$0$trim = (_String$split$2 = String(raw !== null && raw !== void 0 ? raw : "").split(/\r?\n/, 1)[0]) === null || _String$split$2 === void 0 ? void 0 : _String$split$2.trim()) !== null && _String$split$0$trim !== void 0 ? _String$split$0$trim : "";
	return /^`{3,}\s*diff(?:\s|$)|^~{3,}\s*diff(?:\s|$)/.test(firstLine);
}
function hasPatchLines(lines, language, raw) {
	const hasRemoved = lines.some((line) => isRemovedLine(line));
	const hasAdded = lines.some((line) => isAddedLine(line));
	return hasRemoved && hasAdded || isExplicitDiffLanguage(language, raw) && (hasRemoved || hasAdded);
}
function computeMatches(original, modified, cache) {
	if (cache && isLinePrefix(cache.original, original) && isLinePrefix(cache.modified, modified)) {
		const deltaOriginal = original.slice(cache.original.length);
		const deltaModified = modified.slice(cache.modified.length);
		if (deltaOriginal.every((line) => !cache.modifiedLines.has(line)) && deltaModified.every((line) => !cache.originalLines.has(line))) {
			const matches$1 = cache.matches.concat(computeLcs(deltaOriginal, deltaModified).map((match) => ({
				originalIndex: match.originalIndex + cache.original.length,
				modifiedIndex: match.modifiedIndex + cache.modified.length
			})));
			for (const line of deltaOriginal) cache.originalLines.add(line);
			for (const line of deltaModified) cache.modifiedLines.add(line);
			cache.original = original;
			cache.modified = modified;
			cache.matches = matches$1;
			return matches$1;
		}
	}
	const matches = computeLcs(original, modified);
	if (cache) reseedMatchCache(cache, original, modified, matches);
	return matches;
}
function computeLcs(original, modified) {
	var _lineIds$get;
	const prefix = [];
	let start = 0;
	while (start < original.length && start < modified.length && original[start] === modified[start]) {
		prefix.push({
			originalIndex: start,
			modifiedIndex: start
		});
		start++;
	}
	const suffix = [];
	let originalEnd = original.length - 1;
	let modifiedEnd = modified.length - 1;
	while (originalEnd >= start && modifiedEnd >= start && original[originalEnd] === modified[modifiedEnd]) {
		suffix.push({
			originalIndex: originalEnd,
			modifiedIndex: modifiedEnd
		});
		originalEnd--;
		modifiedEnd--;
	}
	suffix.reverse();
	const originalLength = originalEnd - start + 1;
	const modifiedLength = modifiedEnd - start + 1;
	if (originalLength <= 0 || modifiedLength <= 0) return prefix.concat(suffix);
	if ((originalLength + 1) * (modifiedLength + 1) > 15e5) return prefix.concat(suffix);
	const lineIds = /* @__PURE__ */ new Map();
	const modifiedIds = new Uint32Array(modifiedLength);
	for (let j = 0; j < modifiedLength; j++) {
		const line = modified[start + j];
		let id = lineIds.get(line);
		if (id === void 0) {
			id = lineIds.size + 1;
			lineIds.set(line, id);
		}
		modifiedIds[j] = id;
	}
	const originalIds = new Uint32Array(originalLength);
	for (let i = 0; i < originalLength; i++) originalIds[i] = (_lineIds$get = lineIds.get(original[start + i])) !== null && _lineIds$get !== void 0 ? _lineIds$get : 0;
	const columns = modifiedLength + 1;
	const scores = new Uint32Array((originalLength + 1) * (modifiedLength + 1));
	for (let originalIndex$1 = originalLength - 1; originalIndex$1 >= 0; originalIndex$1--) for (let modifiedIndex$1 = modifiedLength - 1; modifiedIndex$1 >= 0; modifiedIndex$1--) {
		const scoreIndex = originalIndex$1 * columns + modifiedIndex$1;
		if (originalIds[originalIndex$1] === modifiedIds[modifiedIndex$1]) scores[scoreIndex] = scores[(originalIndex$1 + 1) * columns + modifiedIndex$1 + 1] + 1;
		else scores[scoreIndex] = Math.max(scores[(originalIndex$1 + 1) * columns + modifiedIndex$1], scores[originalIndex$1 * columns + modifiedIndex$1 + 1]);
	}
	const middle = [];
	let originalIndex = 0;
	let modifiedIndex = 0;
	while (originalIndex < originalLength && modifiedIndex < modifiedLength) if (original[start + originalIndex] === modified[start + modifiedIndex]) {
		middle.push({
			originalIndex: start + originalIndex,
			modifiedIndex: start + modifiedIndex
		});
		originalIndex++;
		modifiedIndex++;
	} else if (scores[(originalIndex + 1) * columns + modifiedIndex] >= scores[originalIndex * columns + modifiedIndex + 1]) originalIndex++;
	else modifiedIndex++;
	return prefix.concat(middle, suffix);
}
const PATCH_HEADER_PREFIXES = [
	"diff ",
	"index ",
	"--- ",
	"+++ "
];
function isPatchHeaderLine(line, headers) {
	return headers && PATCH_HEADER_PREFIXES.some((prefix) => line.startsWith(prefix));
}
function buildInlinePatchPreviewLines(lines) {
	const result = [];
	let originalLine = 1;
	let modifiedLine = 1;
	const headers = hasDiffHeaders(lines);
	for (const [index, raw] of lines.entries()) if (raw === NO_NEWLINE_METADATA) {
		var _result$at;
		const previousKind = (_result$at = result.at(-1)) === null || _result$at === void 0 ? void 0 : _result$at.kind;
		const metadataKind = previousKind === "removed" || previousKind === "added" ? previousKind : "context";
		result.push(createMetadataLine(`inline-no-newline-${index}`, metadataKind));
	} else if (isPatchHeaderLine(raw, headers)) continue;
	else if (raw.startsWith("@@")) {
		const match = raw.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
		if (match) {
			originalLine = Number(match[1]);
			modifiedLine = Number(match[2]);
		}
		result.push(makeLine(raw, "hunk", `inline-hunk-${index}`, ""));
	} else if (isRemovedLine(raw)) result.push(makeLine(normalizeDiffBody(raw.slice(1), headers), "removed", `inline-removed-${index}`, originalLine++, true));
	else if (isAddedLine(raw)) result.push(makeLine(normalizeDiffBody(raw.slice(1), headers), "added", `inline-added-${index}`, modifiedLine++, true));
	else {
		const code = headers && raw.startsWith(" ") ? raw.slice(1) : raw;
		result.push(makeLine(code, "context", `inline-context-${index}`, modifiedLine));
		originalLine++;
		modifiedLine++;
	}
	return result;
}
function buildInlineSourcePreviewLines(originalSource, modifiedSource, loading, cache) {
	const original = cache ? splitSourceCached(originalSource, loading, cache, "original") : splitSource(originalSource, loading);
	const modified = cache ? splitSourceCached(modifiedSource, loading, cache, "modified") : splitSource(modifiedSource, loading);
	const matches = computeMatches(original, modified, cache);
	if (matches.length > 0) {
		const result$1 = [];
		let originalIndex = 0;
		let modifiedIndex = 0;
		for (const match of matches) {
			while (originalIndex < match.originalIndex) {
				result$1.push(makeLine(original[originalIndex], "removed", `inline-removed-source-${originalIndex}`, originalIndex + 1, shouldPreserveBlankKind(original, originalIndex)));
				originalIndex++;
			}
			while (modifiedIndex < match.modifiedIndex) {
				result$1.push(makeLine(modified[modifiedIndex], "added", `inline-added-source-${modifiedIndex}`, modifiedIndex + 1, shouldPreserveBlankKind(modified, modifiedIndex)));
				modifiedIndex++;
			}
			result$1.push(makeLine(modified[match.modifiedIndex], "context", `inline-context-source-${match.originalIndex}-${match.modifiedIndex}`, match.modifiedIndex + 1));
			originalIndex = match.originalIndex + 1;
			modifiedIndex = match.modifiedIndex + 1;
		}
		while (originalIndex < original.length) {
			result$1.push(makeLine(original[originalIndex], "removed", `inline-removed-source-${originalIndex}`, originalIndex + 1, shouldPreserveBlankKind(original, originalIndex)));
			originalIndex++;
		}
		while (modifiedIndex < modified.length) {
			result$1.push(makeLine(modified[modifiedIndex], "added", `inline-added-source-${modifiedIndex}`, modifiedIndex + 1, shouldPreserveBlankKind(modified, modifiedIndex)));
			modifiedIndex++;
		}
		return result$1;
	}
	const result = [];
	let start = 0;
	let originalEnd = original.length - 1;
	let modifiedEnd = modified.length - 1;
	while (start <= originalEnd && start <= modifiedEnd && original[start] === modified[start]) {
		result.push(makeLine(modified[start], "context", `inline-prefix-${start}`, start + 1));
		start++;
	}
	const suffix = [];
	while (originalEnd >= start && modifiedEnd >= start && original[originalEnd] === modified[modifiedEnd]) {
		suffix.unshift(makeLine(modified[modifiedEnd], "context", `inline-suffix-${modifiedEnd}`, modifiedEnd + 1));
		originalEnd--;
		modifiedEnd--;
	}
	for (let index = start; index <= originalEnd; index++) result.push(makeLine(original[index], "removed", `inline-removed-source-${index}`, index + 1, shouldPreserveBlankKind(original, index)));
	for (let index = start; index <= modifiedEnd; index++) result.push(makeLine(modified[index], "added", `inline-added-source-${index}`, index + 1, shouldPreserveBlankKind(modified, index)));
	return result.concat(suffix);
}
function buildSideBySideSourcePreviewPanes(originalSource, modifiedSource, loading, hideUnchangedRegions, cache) {
	const originalSourceLines = cache ? splitSourceCached(originalSource, loading, cache, "original") : splitSource(originalSource, loading);
	const modifiedSourceLines = cache ? splitSourceCached(modifiedSource, loading, cache, "modified") : splitSource(modifiedSource, loading);
	const matches = computeMatches(originalSourceLines, modifiedSourceLines, cache);
	const originalLines = [];
	const modifiedLines = [];
	let originalIndex = 0;
	let modifiedIndex = 0;
	let blockIndex = 0;
	const appendChangedBlock = (originalEnd, modifiedEnd) => {
		const rowCount = Math.max(originalEnd - originalIndex, modifiedEnd - modifiedIndex);
		for (let offset = 0; offset < rowCount; offset++) {
			const nextOriginalIndex = originalIndex + offset;
			const nextModifiedIndex = modifiedIndex + offset;
			originalLines.push(nextOriginalIndex < originalEnd ? makeLine(originalSourceLines[nextOriginalIndex], "removed", `original-changed-${blockIndex}-${nextOriginalIndex}`, nextOriginalIndex + 1, shouldPreserveBlankKind(originalSourceLines, nextOriginalIndex)) : makeLine("", "spacer", `original-spacer-${blockIndex}-${offset}`, ""));
			modifiedLines.push(nextModifiedIndex < modifiedEnd ? makeLine(modifiedSourceLines[nextModifiedIndex], "added", `modified-changed-${blockIndex}-${nextModifiedIndex}`, nextModifiedIndex + 1, shouldPreserveBlankKind(modifiedSourceLines, nextModifiedIndex)) : makeLine("", "spacer", `modified-spacer-${blockIndex}-${offset}`, ""));
		}
		originalIndex = originalEnd;
		modifiedIndex = modifiedEnd;
		blockIndex++;
	};
	for (const match of matches) {
		appendChangedBlock(match.originalIndex, match.modifiedIndex);
		originalLines.push(makeLine(originalSourceLines[match.originalIndex], "context", `original-context-${match.originalIndex}-${match.modifiedIndex}`, match.originalIndex + 1));
		modifiedLines.push(makeLine(modifiedSourceLines[match.modifiedIndex], "context", `modified-context-${match.originalIndex}-${match.modifiedIndex}`, match.modifiedIndex + 1));
		originalIndex = match.originalIndex + 1;
		modifiedIndex = match.modifiedIndex + 1;
	}
	appendChangedBlock(originalSourceLines.length, modifiedSourceLines.length);
	const originalMissing = String(originalSource !== null && originalSource !== void 0 ? originalSource : "").length > 0 && !hasFinalNewline(originalSource);
	const modifiedMissing = String(modifiedSource !== null && modifiedSource !== void 0 ? modifiedSource : "").length > 0 && !hasFinalNewline(modifiedSource);
	if (originalMissing || modifiedMissing) {
		originalLines.push(originalMissing ? createMetadataLine("original-no-newline", "removed") : makeLine("", "spacer", "original-no-newline-spacer", ""));
		modifiedLines.push(modifiedMissing ? createMetadataLine("modified-no-newline", "added") : makeLine("", "spacer", "modified-no-newline-spacer", ""));
	}
	return collapseDiffPanes([{
		key: "original",
		className: "markstream-pre__diff-pane--original",
		lines: originalLines
	}, {
		key: "modified",
		className: "markstream-pre__diff-pane--modified",
		lines: modifiedLines
	}], hideUnchangedRegions);
}
function resolveCollapseOptions(value) {
	var _options$contextLineC, _options$minimumLineC;
	if (value == null || value === false) return null;
	const options = value === true ? {} : value;
	if (options.enabled === false) return null;
	return {
		contextLineCount: Math.max(0, Math.floor((_options$contextLineC = options.contextLineCount) !== null && _options$contextLineC !== void 0 ? _options$contextLineC : 2)),
		minimumLineCount: Math.max(1, Math.floor((_options$minimumLineC = options.minimumLineCount) !== null && _options$minimumLineC !== void 0 ? _options$minimumLineC : 4))
	};
}
function collapseDiffPanes(panes, hideUnchangedRegions) {
	var _panes$;
	const options = resolveCollapseOptions(hideUnchangedRegions);
	if (!options || panes.length < 1 || panes.length > 2) return panes;
	if (panes.length === 2 && panes[0].lines.length !== panes[1].lines.length) return panes;
	const original = panes[0].lines;
	const modified = (_panes$ = panes[1]) === null || _panes$ === void 0 ? void 0 : _panes$.lines;
	let sourceLineCount = original.length;
	while (sourceLineCount > 0 && panes.every((pane) => pane.lines[sourceLineCount - 1].kind === "metadata")) sourceLineCount--;
	const isUnchangedRow = (lineIndex) => original[lineIndex].kind === "context" && (modified === void 0 || modified[lineIndex].kind === "context" && original[lineIndex].code === modified[lineIndex].code);
	const collapsedRanges = [];
	let index = 0;
	while (index < sourceLineCount) {
		const start = index;
		while (index < sourceLineCount && isUnchangedRow(index)) index++;
		const end = index;
		if (end - start >= options.minimumLineCount) {
			const hiddenStart = start + (start === 0 ? 0 : options.contextLineCount);
			const isTerminalRange = end === sourceLineCount;
			const hiddenEnd = end - (isTerminalRange ? 0 : options.contextLineCount);
			if (hiddenEnd - hiddenStart >= options.minimumLineCount) collapsedRanges.push({
				start: hiddenStart,
				end: isTerminalRange ? original.length : hiddenEnd,
				count: isTerminalRange ? sourceLineCount - hiddenStart : hiddenEnd - hiddenStart,
				first: hiddenStart === 0,
				last: isTerminalRange
			});
		}
		if (index === start) index++;
	}
	if (!collapsedRanges.length) return panes;
	return panes.map((pane, paneIndex) => {
		const lines = [];
		let sourceIndex = 0;
		for (const range of collapsedRanges) {
			lines.push(...pane.lines.slice(sourceIndex, range.start));
			lines.push({
				code: paneIndex === 0 ? `${range.count} unmodified lines` : "",
				kind: "collapsed",
				empty: false,
				key: `${pane.key}-collapsed-${range.start}-${range.end}`,
				number: "",
				collapsedFirst: range.first,
				collapsedLast: range.last
			});
			sourceIndex = range.end;
		}
		lines.push(...pane.lines.slice(sourceIndex));
		return _objectSpread2(_objectSpread2({}, pane), {}, { lines });
	});
}
function buildDiffPreviewPanes(options) {
	const loading = options.loading === true;
	const inline = options.inline === true;
	const codeLines = splitSource(options.code, loading);
	const originalCode = options.originalCode;
	const updatedCode = options.updatedCode;
	const hasSourcePair = originalCode != null || updatedCode != null;
	if (inline) return collapseDiffPanes([{
		key: "inline",
		className: "markstream-pre__diff-pane--inline",
		lines: hasSourcePair ? appendInlineSourceMetadata(buildInlineSourcePreviewLines(originalCode, updatedCode, loading, options.matchCache), originalCode, updatedCode) : buildInlinePatchPreviewLines(codeLines)
	}], options.hideUnchangedRegions);
	if (!hasPatchLines(codeLines, options.language, options.raw) && hasSourcePair) return buildSideBySideSourcePreviewPanes(originalCode, updatedCode, loading, options.hideUnchangedRegions, options.matchCache);
	const { original, modified } = buildSplitPatchPanes(codeLines);
	return collapseDiffPanes([{
		key: "original",
		className: "markstream-pre__diff-pane--original",
		lines: original.map((line, index) => _objectSpread2(_objectSpread2({}, line), {}, {
			key: `original-${index}`,
			number: line.kind === "metadata" || line.kind === "spacer" ? "" : line.number
		}))
	}, {
		key: "modified",
		className: "markstream-pre__diff-pane--modified",
		lines: modified.map((line, index) => _objectSpread2(_objectSpread2({}, line), {}, {
			key: `modified-${index}`,
			number: line.kind === "metadata" || line.kind === "spacer" ? "" : line.number
		}))
	}], options.hideUnchangedRegions);
}
function readHunkStart(line) {
	const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
	return match ? {
		original: Number(match[1]),
		modified: Number(match[2])
	} : void 0;
}
/**
* Parse a patch into side-by-side panes. Removed/added runs are grouped and
* row-aligned with spacer rows, patch line numbers are tracked from hunk
* headers, and git file metadata headers (`diff --git`, `index`, `---`, `+++`)
* are dropped instead of painted as numbered context rows.
*/
function buildSplitPatchPanes(lines) {
	const original = [];
	const modified = [];
	const headers = hasDiffHeaders(lines);
	let originalNumber = 1;
	let modifiedNumber = 1;
	let previousKind = "context";
	let index = 0;
	while (index < lines.length) {
		const raw = lines[index];
		if (raw === NO_NEWLINE_METADATA) {
			if (previousKind === "removed") {
				original.push(createMetadataLine("original-patch-no-newline", "removed"));
				modified.push(makeLine("", "spacer", "", ""));
			} else if (previousKind === "added") {
				original.push(makeLine("", "spacer", "", ""));
				modified.push(createMetadataLine("modified-patch-no-newline", "added"));
			} else {
				original.push(createMetadataLine("original-patch-no-newline", "context"));
				modified.push(createMetadataLine("modified-patch-no-newline", "context"));
			}
			index++;
			continue;
		}
		if (isPatchHeaderLine(raw, headers)) {
			index++;
			continue;
		}
		if (raw.startsWith("@@")) {
			const start = readHunkStart(raw);
			if (start) {
				originalNumber = start.original;
				modifiedNumber = start.modified;
			}
			original.push(makeLine(raw, "hunk", "", ""));
			modified.push(makeLine(raw, "hunk", "", ""));
			previousKind = "context";
			index++;
			continue;
		}
		if (isRemovedLine(raw) || isAddedLine(raw)) {
			const removed = [];
			const added = [];
			while (index < lines.length && (isRemovedLine(lines[index]) || isAddedLine(lines[index]))) {
				if (isRemovedLine(lines[index])) {
					removed.push(normalizeDiffBody(lines[index].slice(1), headers));
					previousKind = "removed";
				} else {
					added.push(normalizeDiffBody(lines[index].slice(1), headers));
					previousKind = "added";
				}
				index++;
			}
			const count = Math.max(removed.length, added.length);
			for (let offset = 0; offset < count; offset++) {
				original.push(offset < removed.length ? makeLine(removed[offset], "removed", "", originalNumber++, true) : makeLine("", "spacer", "", ""));
				modified.push(offset < added.length ? makeLine(added[offset], "added", "", modifiedNumber++, true) : makeLine("", "spacer", "", ""));
			}
			continue;
		}
		const code = headers && raw.startsWith(" ") ? raw.slice(1) : raw;
		original.push(makeLine(code, "context", "", originalNumber++));
		modified.push(makeLine(code, "context", "", modifiedNumber++));
		previousKind = "context";
		index++;
	}
	return {
		original,
		modified
	};
}

//#endregion
//#region src/pan-gesture.ts
function createPanGesture(options) {
	const { getTranslate, setTranslate, canStart, onActiveChange } = options;
	let pointerId = null;
	let startPointer = {
		x: 0,
		y: 0
	};
	let startTranslate = {
		x: 0,
		y: 0
	};
	function stop(e) {
		const endedPointerId = e === null || e === void 0 ? void 0 : e.pointerId;
		if (endedPointerId != null && endedPointerId !== pointerId) return;
		if (pointerId == null) return;
		pointerId = null;
		if (typeof window !== "undefined") {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", stop);
			window.removeEventListener("pointercancel", stop);
			window.removeEventListener("blur", stop);
		}
		onActiveChange === null || onActiveChange === void 0 || onActiveChange(false);
	}
	function onMove(event) {
		if (pointerId == null || event.pointerId !== pointerId) return;
		if (event.buttons === 0) {
			stop();
			return;
		}
		setTranslate({
			x: startTranslate.x + (event.clientX - startPointer.x),
			y: startTranslate.y + (event.clientY - startPointer.y)
		});
	}
	function start(event) {
		if (event.button !== 0 || pointerId != null) return;
		if (canStart && !canStart(event)) return;
		event.preventDefault();
		pointerId = event.pointerId;
		startPointer = {
			x: event.clientX,
			y: event.clientY
		};
		startTranslate = getTranslate();
		if (typeof window === "undefined") {
			pointerId = null;
			return;
		}
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", stop);
		window.addEventListener("pointercancel", stop);
		window.addEventListener("blur", stop);
		onActiveChange === null || onActiveChange === void 0 || onActiveChange(true);
	}
	return {
		start,
		stop,
		isActive: () => pointerId != null
	};
}

//#endregion
//#region src/resolve-streaming-text-state.ts
/**
* Resolve the next streaming text state given previous content.
* This is the basic variant used by all frameworks for simple
* append-detection during streaming updates.
*/
function resolveStreamingTextState({ nextContent, previousContent, typewriterEnabled }) {
	if (!typewriterEnabled) return {
		settledContent: nextContent,
		streamedDelta: "",
		appended: false
	};
	if (nextContent === previousContent) return {
		settledContent: nextContent,
		streamedDelta: "",
		appended: false
	};
	if (previousContent && nextContent.startsWith(previousContent) && nextContent.length > previousContent.length) return {
		settledContent: previousContent,
		streamedDelta: nextContent.slice(previousContent.length),
		appended: true
	};
	return {
		settledContent: nextContent,
		streamedDelta: "",
		appended: false
	};
}
/**
* Resolve the next streaming text state given the current render state
* and an optional persisted content snapshot (e.g. from a shared stream
* state map). This variant handles:
* - React StrictMode replay (preserves active delta when rendered content
*   matches but the stream render version has not changed)
* - Stream version resets (settles the delta when the version changes)
* - Fallback to the basic resolver for all other cases
*/
function resolveStreamingTextUpdate({ nextContent, persistedContent, currentState, typewriterEnabled, streamRenderVersionChanged = false }) {
	const renderedContent = `${currentState.settledContent}${currentState.streamedDelta}`;
	if (!typewriterEnabled) return {
		settledContent: nextContent,
		streamedDelta: "",
		appended: false
	};
	if (currentState.streamedDelta && renderedContent === nextContent) {
		if (streamRenderVersionChanged) return {
			settledContent: renderedContent,
			streamedDelta: "",
			appended: false
		};
		return {
			settledContent: currentState.settledContent,
			streamedDelta: currentState.streamedDelta,
			appended: false
		};
	}
	return resolveStreamingTextState({
		nextContent,
		previousContent: persistedContent !== null && persistedContent !== void 0 ? persistedContent : renderedContent,
		typewriterEnabled
	});
}

//#endregion
//#region \0@oxc-project+runtime@0.95.0/helpers/asyncToGenerator.js
function asyncGeneratorStep(n, t, e, r, o, a, c) {
	try {
		var i = n[a](c), u = i.value;
	} catch (n$1) {
		e(n$1);
		return;
	}
	i.done ? t(u) : Promise.resolve(u).then(r, o);
}
function _asyncToGenerator(n) {
	return function() {
		var t = this, e = arguments;
		return new Promise(function(r, o) {
			var a = n.apply(t, e);
			function _next(n$1) {
				asyncGeneratorStep(a, r, o, _next, _throw, "next", n$1);
			}
			function _throw(n$1) {
				asyncGeneratorStep(a, r, o, _next, _throw, "throw", n$1);
			}
			_next(void 0);
		});
	};
}

//#endregion
//#region src/shiki-language.ts
const sharedHighlightRegistrationStates = /* @__PURE__ */ new WeakMap();
function getHighlightRegistrationState(registerHighlight) {
	let state = sharedHighlightRegistrationStates.get(registerHighlight);
	if (!state) {
		state = {
			inFlight: /* @__PURE__ */ new Map(),
			completed: /* @__PURE__ */ new Set(),
			registeredAllLangs: false,
			registeredThemes: [],
			registeredLangs: [],
			tail: Promise.resolve()
		};
		sharedHighlightRegistrationStates.set(registerHighlight, state);
	}
	return state;
}
function appendUnique(base, incoming) {
	if (!(incoming === null || incoming === void 0 ? void 0 : incoming.length)) return [...base];
	const next = [...base];
	const seen = new Set(next);
	for (const value of incoming) if (!seen.has(value)) {
		seen.add(value);
		next.push(value);
	}
	return next;
}
function hasAnyRegisterValues(opts) {
	var _opts$themes, _opts$langs;
	return Boolean(((_opts$themes = opts.themes) === null || _opts$themes === void 0 ? void 0 : _opts$themes.length) || ((_opts$langs = opts.langs) === null || _opts$langs === void 0 ? void 0 : _opts$langs.length));
}
function hasAllValues(registered, requested) {
	if (!(requested === null || requested === void 0 ? void 0 : requested.length)) return true;
	const registeredSet = new Set(registered);
	return requested.every((value) => registeredSet.has(value));
}
function hasAllLangValues(state, requested) {
	if (!(requested === null || requested === void 0 ? void 0 : requested.length)) return true;
	if (state.registeredAllLangs) return true;
	return hasAllValues(state.registeredLangs, requested);
}
function isRegistrationCovered(state, opts) {
	return hasAnyRegisterValues(opts) && hasAllValues(state.registeredThemes, opts.themes) && hasAllLangValues(state, opts.langs);
}
function getCumulativeRegisterOptions(state, opts) {
	if (!hasAnyRegisterValues(opts)) return opts;
	const nextThemes = appendUnique(state.registeredThemes, opts.themes);
	const nextLangs = state.registeredAllLangs ? [] : appendUnique(state.registeredLangs, opts.langs);
	return _objectSpread2(_objectSpread2({}, nextThemes.length ? { themes: nextThemes } : {}), nextLangs.length ? { langs: nextLangs } : {});
}
const SHIKI_LANGUAGE_ALIAS_MAP = {
	"plain": "plaintext",
	"text": "plaintext",
	"txt": "plaintext",
	"js": "javascript",
	"mjs": "javascript",
	"cjs": "javascript",
	"ts": "typescript",
	"mts": "typescript",
	"cts": "typescript",
	"golang": "go",
	"py": "python",
	"rb": "ruby",
	"rs": "rust",
	"kt": "kotlin",
	"kts": "kotlin",
	"md": "markdown",
	"yml": "yaml",
	"sh": "shellscript",
	"bash": "shellscript",
	"zsh": "shellscript",
	"shell": "shellscript",
	"shellscript": "shellscript",
	"ps": "powershell",
	"ps1": "powershell",
	"pwsh": "powershell",
	"c++": "cpp",
	"c#": "csharp",
	"cs": "csharp",
	"objc": "objective-c",
	"objectivec": "objective-c",
	"objective-c": "objective-c",
	"objectivecpp": "objective-cpp",
	"objective-c++": "objective-cpp",
	"objective-cpp": "objective-cpp"
};
function getLanguageBaseToken(rawLang) {
	var _firstToken$split$0$t, _firstToken$split$;
	const trimmed = String(rawLang !== null && rawLang !== void 0 ? rawLang : "").trim();
	if (!trimmed) return "";
	const [firstToken = ""] = trimmed.split(/\s+/);
	return (_firstToken$split$0$t = (_firstToken$split$ = firstToken.split(":")[0]) === null || _firstToken$split$ === void 0 ? void 0 : _firstToken$split$.trim().toLowerCase()) !== null && _firstToken$split$0$t !== void 0 ? _firstToken$split$0$t : "";
}
function normalizeShikiLanguage(rawLang) {
	var _SHIKI_LANGUAGE_ALIAS;
	const token = getLanguageBaseToken(rawLang);
	return (_SHIKI_LANGUAGE_ALIAS = SHIKI_LANGUAGE_ALIAS_MAP[token]) !== null && _SHIKI_LANGUAGE_ALIAS !== void 0 ? _SHIKI_LANGUAGE_ALIAS : token;
}
function getShikiLanguageMatchKey(rawLang) {
	return normalizeShikiLanguage(rawLang);
}
function getShikiLangs(langs) {
	if (!Array.isArray(langs)) return void 0;
	const normalized = langs.filter((lang) => typeof lang === "string").map((lang) => normalizeShikiLanguage(lang)).filter(Boolean);
	const unique = Array.from(new Set(normalized)).sort();
	return unique.length > 0 ? unique : void 0;
}
function getShikiThemes(themes) {
	if (!Array.isArray(themes)) return void 0;
	const unique = [];
	const seen = /* @__PURE__ */ new Set();
	for (const theme of themes) {
		if (typeof theme !== "string") continue;
		const normalized = theme.trim();
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		unique.push(normalized);
	}
	return unique.length > 0 ? unique : void 0;
}
function getShikiThemesKey(themes) {
	var _getShikiThemes$join, _getShikiThemes;
	return (_getShikiThemes$join = (_getShikiThemes = getShikiThemes(themes)) === null || _getShikiThemes === void 0 ? void 0 : _getShikiThemes.join("\0")) !== null && _getShikiThemes$join !== void 0 ? _getShikiThemes$join : "";
}
function getShikiRendererOptions(themes, langs) {
	return getRegisterHighlightOptions(themes, langs);
}
function getRegisterHighlightOptions(themes, langs) {
	const shikiThemes = getShikiThemes(themes);
	const shikiLangs = getShikiLangs(langs);
	return _objectSpread2(_objectSpread2({}, (shikiThemes === null || shikiThemes === void 0 ? void 0 : shikiThemes.length) ? { themes: shikiThemes } : {}), (shikiLangs === null || shikiLangs === void 0 ? void 0 : shikiLangs.length) ? { langs: shikiLangs } : {});
}
function getHighlightRegistrationKey(themes, langs) {
	var _getShikiLangs$join, _getShikiLangs;
	return `${getShikiThemesKey(themes)}\u0000\u0000${(_getShikiLangs$join = (_getShikiLangs = getShikiLangs(langs)) === null || _getShikiLangs === void 0 ? void 0 : _getShikiLangs.join("\0")) !== null && _getShikiLangs$join !== void 0 ? _getShikiLangs$join : ""}`;
}
function getRuntimeShikiRegistrationConfig(themes, langs, options = {
	hasRegisterHighlight: true,
	hasCreateRenderer: true
}) {
	var _rendererOptions$lang;
	const registerOptions = getRegisterHighlightOptions(themes, langs);
	const rendererOptions = _objectSpread2({}, registerOptions);
	const ignoredLangs = Boolean(((_rendererOptions$lang = rendererOptions.langs) === null || _rendererOptions$lang === void 0 ? void 0 : _rendererOptions$lang.length) && options.hasCreateRenderer && !options.hasRegisterHighlight);
	if (ignoredLangs) {
		delete registerOptions.langs;
		delete rendererOptions.langs;
	}
	return {
		key: getHighlightRegistrationKey(rendererOptions.themes, rendererOptions.langs),
		registerOptions,
		rendererOptions,
		ignoredLangs
	};
}
function registerHighlightOnce(_x) {
	return _registerHighlightOnce.apply(this, arguments);
}
function _registerHighlightOnce() {
	_registerHighlightOnce = _asyncToGenerator(function* (registerHighlight, opts = {}, key) {
		if (!registerHighlight) return "ready";
		const normalizedOpts = getRegisterHighlightOptions(opts.themes, opts.langs);
		const normalizedKey = getHighlightRegistrationKey(normalizedOpts.themes, normalizedOpts.langs);
		const registrationKey = key && key === normalizedKey ? key : normalizedKey;
		const state = getHighlightRegistrationState(registerHighlight);
		if (state.completed.has(registrationKey)) return "ready";
		if (isRegistrationCovered(state, normalizedOpts)) {
			state.completed.add(registrationKey);
			return "ready";
		}
		const cached = state.inFlight.get(registrationKey);
		if (cached) return cached;
		const task = state.tail.catch(() => {}).then(() => {
			if (state.completed.has(registrationKey) || isRegistrationCovered(state, normalizedOpts)) {
				state.completed.add(registrationKey);
				return "ready";
			}
			const cumulativeOptions = getCumulativeRegisterOptions(state, normalizedOpts);
			const cumulativeKey = getHighlightRegistrationKey(cumulativeOptions.themes, cumulativeOptions.langs);
			if (state.completed.has(cumulativeKey) || isRegistrationCovered(state, cumulativeOptions)) {
				state.completed.add(registrationKey);
				state.completed.add(cumulativeKey);
				return "ready";
			}
			return Promise.resolve(registerHighlight(cumulativeOptions)).then(() => {
				if (!hasAnyRegisterValues(cumulativeOptions)) state.registeredAllLangs = true;
				else {
					state.registeredThemes = cumulativeOptions.themes ? [...cumulativeOptions.themes] : state.registeredThemes;
					state.registeredLangs = cumulativeOptions.langs ? [...cumulativeOptions.langs] : state.registeredLangs;
				}
				state.completed.add(cumulativeKey);
				return "ready";
			});
		}).then(() => {
			state.completed.add(registrationKey);
			return "ready";
		}).finally(() => {
			if (state.inFlight.get(registrationKey) === task) state.inFlight.delete(registrationKey);
		});
		state.inFlight.set(registrationKey, task);
		state.tail = task.catch(() => {});
		return task;
	});
	return _registerHighlightOnce.apply(this, arguments);
}

//#endregion
//#region src/smooth-stream-controller.ts
function toPositiveFiniteNumber(value, fallback, min = 1) {
	const normalized = Number(value);
	return Number.isFinite(normalized) ? Math.max(min, normalized) : fallback;
}
function toNonNegativeFiniteNumber(value, fallback) {
	const normalized = Number(value);
	return Number.isFinite(normalized) ? Math.max(0, normalized) : fallback;
}
/**
* Default minimum pending chars before `burstInitialContent` reveals
* everything fence-safely in one commit (~2 KB of source, well above typical
* streaming chunk sizes).
*/
const BURST_REVEAL_THRESHOLD_CHARS = 2048;
/**
* Animation frames never run in hidden tabs, so the reveal loop falls back to
* this timer cadence while the document is hidden. Browsers clamp background
* timers (typically to 1s), but the stream keeps rendering instead of freezing
* until the tab becomes visible again.
*/
const HIDDEN_TICK_MS = 200;
function now() {
	return typeof performance !== "undefined" ? performance.now() : Date.now();
}
var SmoothMarkdownStreamControllerImpl = class {
	constructor(options = {}, notify) {
		this.source = "";
		this.visible = "";
		this.done = false;
		this.paused = false;
		this.listeners = /* @__PURE__ */ new Set();
		this.rafId = 0;
		this.timerId = null;
		this.visibilityListener = null;
		this.startedAt = 0;
		this.lastTick = 0;
		this.charBudget = 0;
		this.hasStarted = false;
		this.destroyed = false;
		this.fenceScanOffset = 0;
		this.fenceLineStart = 0;
		this.fenceLineState = "candidate";
		this.fenceIndent = 0;
		this.fenceMarker = "";
		this.fenceMarkerLength = 0;
		this.activeFenceMarker = "";
		this.activeFenceLength = 0;
		this.blockedRevealEnd = 0;
		this.atomicRevealRanges = [];
		this.atomicRevealRangeIndex = 0;
		this.getSnapshot = () => ({
			source: this.source,
			visible: this.visible,
			done: this.done,
			paused: this.paused,
			pendingChars: this.pendingChars,
			caughtUp: this.caughtUp,
			final: this.final
		});
		this.subscribe = (listener) => {
			if (this.destroyed) return () => {};
			this.listeners.add(listener);
			return () => {
				this.listeners.delete(listener);
			};
		};
		this.enqueue = (chunk) => {
			if (this.destroyed || !chunk) return;
			if (this.done) this.done = false;
			const hadSource = this.source.length > 0;
			const wasIdle = this.pendingChars <= 0;
			const wasRevealBlocked = this.isRevealBlocked();
			this.source += chunk;
			this.scanAppendedSource();
			if (wasIdle || wasRevealBlocked && !this.isRevealBlocked()) {
				const t = now();
				this.startedAt = hadSource && this.hasStarted ? t - this.normalizedStartDelayMs : t;
				this.lastTick = t;
				this.charBudget = 0;
			}
			this.hasStarted = true;
			this.emit();
			this.ensureLoop();
		};
		this.finish = (finishOptions = {}) => {
			var _finishOptions$flush;
			if (this.destroyed) return;
			this.done = true;
			this.releaseTrailingFenceCandidate();
			if ((_finishOptions$flush = finishOptions.flush) !== null && _finishOptions$flush !== void 0 ? _finishOptions$flush : this.flushOnFinish) {
				this.visible = this.source;
				this.discardConsumedAtomicRanges();
				this.charBudget = 0;
				this.currentCps = this.minCharsPerSecond;
				this.cancelLoop();
				this.emit();
				return;
			}
			this.emit();
			this.ensureLoop();
		};
		this.flush = () => {
			if (this.destroyed) return;
			this.releaseTrailingFenceCandidate();
			this.visible = this.source;
			this.discardConsumedAtomicRanges();
			this.charBudget = 0;
			this.currentCps = this.minCharsPerSecond;
			this.cancelLoop();
			this.emit();
		};
		this.reset = (initialMarkdown = "", options$1) => {
			if (this.destroyed) return;
			this.cancelLoop();
			if (options$1 === null || options$1 === void 0 ? void 0 : options$1.prefixKnown) {
				this.source = initialMarkdown;
				this.scanAppendedSource();
			} else if (initialMarkdown.startsWith(this.source)) {
				this.source = initialMarkdown;
				this.scanAppendedSource();
			} else {
				this.resetFenceScanner();
				this.source = initialMarkdown;
				this.scanAppendedSource();
			}
			const revealableEnd = this.getRevealableEnd();
			this.visible = revealableEnd >= this.source.length ? this.source : this.source.slice(0, revealableEnd);
			this.discardConsumedAtomicRanges();
			this.done = false;
			this.paused = false;
			this.hasStarted = false;
			this.startedAt = 0;
			this.lastTick = 0;
			this.charBudget = 0;
			this.currentCps = this.minCharsPerSecond;
			this.emit();
		};
		this.pause = () => {
			if (this.destroyed) return;
			if (this.paused) return;
			this.paused = true;
			this.cancelLoop();
			this.emit();
		};
		this.resume = () => {
			if (this.destroyed) return;
			if (!this.paused) return;
			this.paused = false;
			const t = now();
			this.lastTick = t;
			this.startedAt || (this.startedAt = t);
			this.emit();
			this.ensureLoop();
		};
		this.destroy = () => {
			if (this.destroyed) return;
			this.destroyed = true;
			this.cancelLoop();
			this.detachVisibilityListener();
			this.listeners.clear();
		};
		this.dispose = () => {
			this.destroy();
		};
		this.tick = (timestamp) => {
			this.rafId = 0;
			this.timerId = null;
			if (this.destroyed) return;
			if (this.paused) return;
			if (!this.hasRevealableChars()) {
				this.startedAt = 0;
				this.lastTick = 0;
				this.charBudget = 0;
				this.currentCps = this.minCharsPerSecond;
				return;
			}
			if (timestamp - this.startedAt < this.normalizedStartDelayMs) {
				this.ensureLoop();
				return;
			}
			const burstPending = this.pendingChars;
			if (this.burstInitialContent && burstPending >= this.burstRevealThresholdChars) {
				const revealableEnd = this.getRevealableEnd();
				if (this.visible.length < revealableEnd) {
					this.visible = revealableEnd >= this.source.length ? this.source : this.source.slice(0, revealableEnd);
					this.charBudget = 0;
					this.currentCps = this.minCharsPerSecond;
					this.emit();
				}
				this.ensureLoop();
				return;
			}
			const minFrameMs = 1e3 / Math.max(1, this.maxCommitFps);
			const dt = Math.min(100, Math.max(0, timestamp - this.lastTick));
			if (dt < minFrameMs) {
				this.ensureLoop();
				return;
			}
			this.lastTick = timestamp;
			const pending = this.pendingChars;
			const latencyMs = pending > this.normalizedCatchUpThreshold ? this.normalizedCatchUpLatencyMs : this.normalizedTargetLatencyMs;
			const targetCps = clamp(pending / Math.max(.001, latencyMs / 1e3), this.minCharsPerSecond, this.maxCharsPerSecond);
			this.currentCps += (targetCps - this.currentCps) * .2;
			this.charBudget += this.currentCps * (dt / 1e3);
			if (this.charBudget < 1) {
				this.ensureLoop();
				return;
			}
			const desiredCount = Math.min(Math.floor(this.charBudget), this.maxCharsPerCommit);
			const nextSlice = this.takeNextRevealSlice(desiredCount);
			if (nextSlice.text) {
				this.visible += nextSlice.text;
				this.charBudget = Math.max(0, this.charBudget - nextSlice.graphemeCount);
				this.emit();
			}
			this.ensureLoop();
		};
		this.handleVisibilityChange = () => {
			if (this.destroyed) return;
			if (this.isDocumentHidden()) {
				this.cancelLoop();
				this.ensureLoop();
				return;
			}
			if (this.timerId != null || !this.rafId) {
				this.cancelLoop();
				this.ensureLoop();
			}
		};
		const { minCharsPerSecond: rawMinCps = 40, maxCharsPerSecond: rawMaxCps = 1e3, targetLatencyMs: rawTargetLatencyMs = 900, catchUpLatencyMs: rawCatchUpLatencyMs = 350, catchUpThreshold: rawCatchUpThreshold = 600, maxCommitFps: rawMaxFps = 30, startDelayMs: rawStartDelayMs = 80, maxCharsPerCommit: rawMaxChars = 80, flushOnFinish = false, burstInitialContent = false, burstRevealThresholdChars = BURST_REVEAL_THRESHOLD_CHARS } = options;
		this.minCharsPerSecond = toPositiveFiniteNumber(rawMinCps, 40, 1);
		this.maxCharsPerSecond = Math.max(this.minCharsPerSecond, toPositiveFiniteNumber(rawMaxCps, 1e3, 1));
		this.normalizedTargetLatencyMs = toPositiveFiniteNumber(rawTargetLatencyMs, 900, 1);
		this.normalizedCatchUpLatencyMs = toPositiveFiniteNumber(rawCatchUpLatencyMs, 350, 1);
		this.normalizedCatchUpThreshold = toNonNegativeFiniteNumber(rawCatchUpThreshold, 600);
		this.normalizedStartDelayMs = toNonNegativeFiniteNumber(rawStartDelayMs, 80);
		this.maxCommitFps = Math.trunc(toPositiveFiniteNumber(rawMaxFps, 30, 1));
		this.maxCharsPerCommit = Math.trunc(toPositiveFiniteNumber(rawMaxChars, 80, 1));
		this.flushOnFinish = flushOnFinish;
		this.burstInitialContent = burstInitialContent === true;
		this.burstRevealThresholdChars = Math.max(1, Math.trunc(toPositiveFiniteNumber(burstRevealThresholdChars, BURST_REVEAL_THRESHOLD_CHARS, 1)));
		this.segmenter = createGraphemeSegmenter();
		if (notify) this.listeners.add(notify);
		this.currentCps = this.minCharsPerSecond;
	}
	attachVisibilityListener() {
		if (this.visibilityListener || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
		this.visibilityListener = this.handleVisibilityChange;
		document.addEventListener("visibilitychange", this.visibilityListener);
	}
	detachVisibilityListener() {
		if (!this.visibilityListener || typeof document === "undefined" || typeof document.removeEventListener !== "function") return;
		document.removeEventListener("visibilitychange", this.visibilityListener);
		this.visibilityListener = null;
	}
	get pendingChars() {
		return Math.max(0, this.source.length - this.visible.length);
	}
	get caughtUp() {
		return this.pendingChars === 0;
	}
	get final() {
		return this.done && this.caughtUp;
	}
	resetFenceScanner() {
		this.fenceScanOffset = 0;
		this.fenceLineStart = 0;
		this.fenceLineState = "candidate";
		this.fenceIndent = 0;
		this.fenceMarker = "";
		this.fenceMarkerLength = 0;
		this.activeFenceMarker = "";
		this.activeFenceLength = 0;
		this.blockedRevealEnd = 0;
		this.atomicRevealRanges.length = 0;
		this.atomicRevealRangeIndex = 0;
	}
	scanAppendedSource(terminal = false) {
		while (this.fenceScanOffset < this.source.length) {
			const character = this.source[this.fenceScanOffset];
			if (character === "\r") {
				if (this.fenceScanOffset + 1 >= this.source.length && !terminal) break;
				if (this.source[this.fenceScanOffset + 1] === "\n") {
					const lineEnd = this.fenceScanOffset + 2;
					this.completeFenceLine(lineEnd);
					this.fenceScanOffset = lineEnd;
					continue;
				}
			}
			if (character === "\n") {
				const lineEnd = this.fenceScanOffset + 1;
				this.completeFenceLine(lineEnd);
				this.fenceScanOffset = lineEnd;
				continue;
			}
			this.consumeFenceCharacter(character);
			this.fenceScanOffset++;
		}
		this.updateFenceRevealBlock();
	}
	consumeFenceCharacter(character) {
		if (this.fenceLineState === "normal") return;
		if (this.fenceLineState === "opening") {
			if (this.fenceMarker === "`" && character === "`") this.fenceLineState = "normal";
			return;
		}
		if (this.fenceLineState === "closing") {
			if (character !== " " && character !== "	") this.fenceLineState = "normal";
			return;
		}
		if (!this.fenceMarker) {
			if (character === " " && this.fenceIndent < 3) {
				this.fenceIndent++;
				return;
			}
			if (character === "`" || character === "~") {
				this.fenceMarker = character;
				this.fenceMarkerLength = 1;
				return;
			}
			this.fenceLineState = "normal";
			return;
		}
		if (character === this.fenceMarker) {
			this.fenceMarkerLength++;
			return;
		}
		if (this.activeFenceMarker) {
			this.fenceLineState = this.fenceMarker === this.activeFenceMarker && this.fenceMarkerLength >= this.activeFenceLength && (character === " " || character === "	") ? "closing" : "normal";
			return;
		}
		this.fenceLineState = this.fenceMarkerLength >= 3 ? "opening" : "normal";
	}
	completeFenceLine(lineEnd) {
		const markerOnlyLine = this.fenceLineState === "candidate" && this.fenceMarkerLength >= 3;
		if (!this.activeFenceMarker && (this.fenceLineState === "opening" || markerOnlyLine)) {
			this.atomicRevealRanges.push({
				start: this.fenceLineStart,
				end: lineEnd
			});
			this.activeFenceMarker = this.fenceMarker;
			this.activeFenceLength = this.fenceMarkerLength;
		} else if (this.activeFenceMarker) {
			if (this.fenceMarker === this.activeFenceMarker && this.fenceMarkerLength >= this.activeFenceLength && (this.fenceLineState === "closing" || markerOnlyLine)) {
				this.activeFenceMarker = "";
				this.activeFenceLength = 0;
			}
		}
		this.fenceLineStart = lineEnd;
		this.fenceLineState = "candidate";
		this.fenceIndent = 0;
		this.fenceMarker = "";
		this.fenceMarkerLength = 0;
		this.blockedRevealEnd = 0;
	}
	updateFenceRevealBlock() {
		this.blockedRevealEnd = !this.activeFenceMarker && (this.fenceLineState === "opening" || this.fenceLineState === "candidate" && (this.fenceIndent > 0 || this.fenceMarkerLength > 0)) ? this.fenceLineStart + 1 : 0;
	}
	releaseTrailingFenceCandidate() {
		this.scanAppendedSource(true);
		if (!this.blockedRevealEnd) return;
		if ((this.fenceLineState === "opening" || this.fenceLineState === "candidate" && this.fenceMarkerLength >= 3) && this.source.length > this.fenceLineStart) this.atomicRevealRanges.push({
			start: this.fenceLineStart,
			end: this.source.length
		});
		this.fenceLineState = "normal";
		this.blockedRevealEnd = 0;
	}
	isRevealBlocked() {
		return this.blockedRevealEnd !== 0;
	}
	getRevealableEnd() {
		return this.blockedRevealEnd ? Math.min(this.source.length, this.blockedRevealEnd - 1) : this.source.length;
	}
	hasRevealableChars() {
		return this.visible.length < this.getRevealableEnd();
	}
	takeNextRevealSlice(desiredCount) {
		this.discardConsumedAtomicRanges();
		const revealableEnd = this.getRevealableEnd();
		if (this.visible.length >= revealableEnd) return {
			text: "",
			graphemeCount: 0
		};
		const atomicRange = this.atomicRevealRanges[this.atomicRevealRangeIndex];
		if (atomicRange && this.visible.length >= atomicRange.start && this.visible.length < atomicRange.end) return takeGraphemes(this.source, this.visible.length, atomicRange.end - this.visible.length, this.segmenter, Math.min(atomicRange.end, revealableEnd));
		const sliceEnd = atomicRange && atomicRange.start > this.visible.length ? Math.min(atomicRange.start, revealableEnd) : revealableEnd;
		return takeGraphemes(this.source, this.visible.length, desiredCount, this.segmenter, sliceEnd);
	}
	discardConsumedAtomicRanges() {
		while (this.atomicRevealRangeIndex < this.atomicRevealRanges.length && this.atomicRevealRanges[this.atomicRevealRangeIndex].end <= this.visible.length) this.atomicRevealRangeIndex++;
		if (this.atomicRevealRangeIndex >= 64 && this.atomicRevealRangeIndex * 2 >= this.atomicRevealRanges.length) {
			this.atomicRevealRanges.splice(0, this.atomicRevealRangeIndex);
			this.atomicRevealRangeIndex = 0;
		}
	}
	isDocumentHidden() {
		return typeof document !== "undefined" && document.visibilityState === "hidden";
	}
	ensureLoop() {
		if (this.destroyed || this.rafId || this.timerId != null || this.paused || !this.hasRevealableChars()) return;
		if (typeof requestAnimationFrame !== "function") {
			this.flush();
			return;
		}
		this.attachVisibilityListener();
		if (this.isDocumentHidden() && typeof setTimeout === "function") {
			this.timerId = setTimeout(() => {
				this.timerId = null;
				this.tick(now());
			}, HIDDEN_TICK_MS);
			return;
		}
		this.rafId = requestAnimationFrame(this.tick);
	}
	cancelLoop() {
		if (this.rafId) {
			if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.rafId);
			this.rafId = 0;
		}
		if (this.timerId != null) {
			clearTimeout(this.timerId);
			this.timerId = null;
		}
		this.detachVisibilityListener();
	}
	emit() {
		if (this.destroyed) return;
		for (const listener of this.listeners) listener();
	}
};
function createSmoothMarkdownStream(options = {}, notify) {
	const controller = new SmoothMarkdownStreamControllerImpl(options, notify);
	return {
		getSnapshot: controller.getSnapshot,
		subscribe: controller.subscribe,
		enqueue: controller.enqueue,
		finish: controller.finish,
		flush: controller.flush,
		reset: controller.reset,
		pause: controller.pause,
		resume: controller.resume,
		destroy: controller.destroy,
		dispose: controller.dispose
	};
}
function createGraphemeSegmenter() {
	if (typeof Intl === "undefined") return null;
	const SegmenterCtor = Intl.Segmenter;
	if (!SegmenterCtor) return null;
	return new SegmenterCtor(void 0, { granularity: "grapheme" });
}
function takeGraphemes(input, start, count, segmenter, endLimit = input.length) {
	const normalizedEnd = Math.min(input.length, Math.max(start, endLimit));
	if (start >= normalizedEnd || count <= 0) return {
		text: "",
		graphemeCount: 0
	};
	if (!segmenter) {
		let end = start;
		let used$1 = 0;
		while (end < normalizedEnd && used$1 < count) {
			const code = input.charCodeAt(end);
			const next = input.charCodeAt(end + 1);
			const codeUnitLength = code >= 55296 && code <= 56319 && next >= 56320 && next <= 57343 ? 2 : 1;
			end = Math.min(normalizedEnd, end + codeUnitLength);
			used$1++;
		}
		return {
			text: input.slice(start, end),
			graphemeCount: used$1
		};
	}
	let sliceEnd = start;
	let used = 0;
	let fastPathSafe = true;
	while (used < count && sliceEnd < normalizedEnd) {
		const codePoint = input.codePointAt(sliceEnd);
		const codePointLength = codePoint > 65535 ? 2 : 1;
		if (sliceEnd + codePointLength > normalizedEnd || !isGraphemeFastPathCodePoint(codePoint)) {
			fastPathSafe = false;
			break;
		}
		sliceEnd += codePointLength;
		used++;
	}
	if (fastPathSafe && sliceEnd > start) {
		if (!(sliceEnd < normalizedEnd && input.charCodeAt(sliceEnd - 1) === 13 && input.charCodeAt(sliceEnd) === 10)) {
			const boundaryCodePoint = input.codePointAt(sliceEnd);
			const hasSimpleBoundary = boundaryCodePoint != null && sliceEnd + (boundaryCodePoint != null && boundaryCodePoint > 65535 ? 2 : 1) <= normalizedEnd && isGraphemeFastPathCodePoint(boundaryCodePoint);
			if (sliceEnd >= normalizedEnd || hasSimpleBoundary) return {
				text: input.slice(start, sliceEnd),
				graphemeCount: used
			};
		}
	}
	const pendingLength = normalizedEnd - start;
	let windowLength = Math.min(pendingLength, Math.max(64, count * 2));
	while (true) {
		const reachesEnd = windowLength >= pendingLength;
		const window$1 = input.slice(start, start + windowLength);
		let outputLength = 0;
		let used$1 = 0;
		for (const part of segmenter.segment(window$1)) {
			if (used$1 >= count) return {
				text: input.slice(start, start + outputLength),
				graphemeCount: used$1
			};
			outputLength += part.segment.length;
			used$1++;
		}
		if (reachesEnd) return {
			text: input.slice(start, start + outputLength),
			graphemeCount: used$1
		};
		windowLength = Math.min(pendingLength, windowLength * 2);
	}
}
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
function isGraphemeSimpleCodePoint(codePoint) {
	return codePoint >= 11904 && codePoint <= 12329 || codePoint >= 12336 && codePoint <= 12351 || codePoint >= 12352 && codePoint <= 12440 || codePoint >= 12443 && codePoint <= 12543 || codePoint >= 12544 && codePoint <= 12799 || codePoint >= 12800 && codePoint <= 13311 || codePoint >= 13312 && codePoint <= 19903 || codePoint >= 19968 && codePoint <= 40959 || codePoint >= 44032 && codePoint <= 55203 || codePoint >= 63744 && codePoint <= 64255 || codePoint >= 65072 && codePoint <= 65103 || codePoint >= 65280 && codePoint <= 65437 || codePoint >= 65440 && codePoint <= 65519 || codePoint >= 127488 && codePoint <= 127743 || codePoint >= 131072 && codePoint <= 196607;
}
function isGraphemeFastPathCodePoint(codePoint) {
	return codePoint <= 127 || isGraphemeSimpleCodePoint(codePoint);
}

//#endregion
export { buildDiffPreviewPanes, createDiffMatchCache, createPanGesture, createSmoothMarkdownStream, getHighlightRegistrationKey, getLanguageBaseToken, getRegisterHighlightOptions, getRuntimeShikiRegistrationConfig, getShikiLangs, getShikiLanguageMatchKey, getShikiRendererOptions, getShikiThemes, normalizeShikiLanguage, registerHighlightOnce, resolveStreamingTextState, resolveStreamingTextUpdate };
//# sourceMappingURL=index.js.map