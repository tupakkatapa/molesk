const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/u;
const QUOTE = /^(\s*>\s?)/u;
const ANY_MARK = /^(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/u;

const LINE_PREFIXES = {
  heading: { match: /^#{1,6}\s+/u, add: "## " },
  list: { match: /^[-*+]\s+(?!\[[ xX]\])/u, add: "- " },
  task: { match: /^[-*+]\s+\[[ xX]\]\s+/u, add: "- [ ] " },
};

const WRAPS = {
  bold: ["**", "**"],
  italic: ["_", "_"],
  code: ["`", "`"],
};

// Edits go through execCommand so they land on the browser's undo stack.
export function replaceRange(textarea, start, end, text, select = []) {
  textarea.focus();
  textarea.setSelectionRange(start, end);
  const command = text ? "insertText" : "delete";
  if (start === end && !text) return;
  if (!document.execCommand(command, false, text)) {
    textarea.setRangeText(text, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const [selStart = start + text.length, selEnd = selStart] = select;
  textarea.setSelectionRange(selStart, selEnd);
}

const lineStartAt = (value, pos) => value.lastIndexOf("\n", pos - 1) + 1;

function lineEndAt(value, pos) {
  const end = value.indexOf("\n", pos);
  return end === -1 ? value.length : end;
}

function continueQuote(textarea, lineStart, lineEnd, pos) {
  const { value } = textarea;
  const quote = QUOTE.exec(value.slice(lineStart, pos));
  if (!quote) return false;
  if (value.slice(lineStart + quote[1].length, lineEnd).trim()) {
    replaceRange(textarea, pos, pos, `\n${quote[1].trimEnd()} `);
  } else {
    replaceRange(textarea, lineStart, lineEnd, "");
  }
  return true;
}

function continueList(textarea) {
  const { value, selectionStart: pos, selectionEnd } = textarea;
  if (pos !== selectionEnd) return false;
  const lineStart = lineStartAt(value, pos);
  const lineEnd = lineEndAt(value, pos);
  const item = LIST_ITEM.exec(value.slice(lineStart, pos));
  if (!item) return continueQuote(textarea, lineStart, lineEnd, pos);
  const [prefix, indent, bullet, number, delimiter, space, task] = item;
  if (!value.slice(lineStart + prefix.length, lineEnd).trim()) {
    replaceRange(textarea, lineStart, lineEnd, "");
    return true;
  }
  const marker = bullet ?? `${Number(number) + 1}${delimiter}`;
  const next = `\n${indent}${marker}${space}${task ? "[ ] " : ""}`;
  replaceRange(textarea, pos, pos, next);
  return true;
}

// Applies `transform(line)` to every line the selection touches and keeps
// the selection on the same text.
function editLines(textarea, transform) {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  const blockStart = lineStartAt(value, start);
  const blockEnd = lineEndAt(value, end);
  const lines = value.slice(blockStart, blockEnd).split("\n");
  const edited = lines.map((line) => transform(line));
  if (edited.every((line, i) => line === lines[i])) return false;
  const firstShift = edited[0].length - lines[0].length;
  const text = edited.join("\n");
  const totalShift = text.length - (blockEnd - blockStart);
  replaceRange(textarea, blockStart, blockEnd, text, [
    Math.max(blockStart, start + firstShift),
    Math.max(blockStart, end + totalShift),
  ]);
  return true;
}

const markerWidth = (item) => (item[2] ? 1 : item[3].length + 1) + 1;

function indentLines(textarea, outdent) {
  return editLines(textarea, (line) => {
    const item = LIST_ITEM.exec(line);
    if (!item) return line;
    const width = markerWidth(item);
    if (!outdent) return " ".repeat(width) + line;
    return line.slice(Math.min(item[1].length, width));
  });
}

function togglePrefix(textarea, kind) {
  const prefix = LINE_PREFIXES[kind];
  editLines(textarea, (line) => {
    const indent = /^\s*/u.exec(line)[0];
    const body = line.slice(indent.length);
    if (prefix.match.test(body)) return indent + body.replace(prefix.match, "");
    return indent + prefix.add + body.replace(ANY_MARK, "");
  });
}

function wrapSelection(textarea, kind) {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  const selected = value.slice(start, end);
  if (kind === "link") {
    const text = `[${selected}](url)`;
    const url = start + selected.length + 3;
    replaceRange(
      textarea,
      start,
      end,
      text,
      selected ? [url, url + 3] : [start + 1],
    );
    return;
  }
  const [before, after] =
    kind === "code" && selected.includes("\n")
      ? ["```\n", "\n```"]
      : WRAPS[kind];
  replaceRange(textarea, start, end, before + selected + after, [
    start + before.length,
    end + before.length,
  ]);
}

const TABLE = "| Column | Column |\n| ------ | ------ |\n|        |        |";

// Fences the lines the selection touches, selecting their text.
function insertCodeBlock(textarea) {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  const blockStart = lineStartAt(value, start);
  const blockEnd = lineEndAt(value, end);
  const body = value.slice(blockStart, blockEnd);
  const inner = blockStart + 4;
  replaceRange(textarea, blockStart, blockEnd, `\`\`\`\n${body}\n\`\`\``, [
    inner,
    inner + body.length,
  ]);
}

// Starts a table on the current line, or below it after a blank line,
// with the first header cell selected.
function insertTable(textarea) {
  const { value, selectionEnd: end } = textarea;
  const lineStart = lineStartAt(value, end);
  const lineEnd = lineEndAt(value, end);
  const line = value.slice(lineStart, lineEnd);
  const lead = line.trim() ? `${line}\n\n` : "";
  const cell = lineStart + lead.length + 2;
  replaceRange(textarea, lineStart, lineEnd, lead + TABLE, [cell, cell + 6]);
}

const BLOCKS = { codeblock: insertCodeBlock, table: insertTable };

function applyFormat(textarea, kind) {
  if (BLOCKS[kind]) BLOCKS[kind](textarea);
  else if (LINE_PREFIXES[kind]) togglePrefix(textarea, kind);
  else wrapSelection(textarea, kind);
}

const SHORTCUTS = { b: "bold", i: "italic", k: "link" };

function handleFormatKeys(e) {
  const textarea = e.currentTarget;
  if (e.isComposing) return;
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  let handled = false;
  if (e.key === "Enter" && plain && !e.shiftKey) {
    handled = continueList(textarea);
  } else if (e.key === "Tab" && plain) {
    handled = indentLines(textarea, e.shiftKey);
  } else if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    const kind = SHORTCUTS[e.key.toLowerCase()];
    if (kind) {
      wrapSelection(textarea, kind);
      handled = true;
    }
  }
  if (handled) e.preventDefault();
}

// On phones the bar rides above the on-screen keyboard while typing, and
// the page keeps the caret clear of it.
function pinAboveKeyboard(bar, textarea) {
  const viewport = window.visualViewport;
  const narrow = matchMedia("(max-width: 768px)");
  if (!viewport) return;
  const place = () => {
    const pinned = narrow.matches && document.activeElement === textarea;
    bar.classList.toggle("pinned", pinned);
    const lift = window.innerHeight - viewport.height - viewport.offsetTop;
    bar.style.transform = pinned ? `translateY(${-Math.max(0, lift)}px)` : "";
    document.documentElement.style.setProperty(
      "--format-bar-h",
      pinned ? `${bar.offsetHeight}px` : "0px",
    );
  };
  viewport.addEventListener("resize", place);
  viewport.addEventListener("scroll", place);
  textarea.addEventListener("focus", place);
  textarea.addEventListener("blur", place);
  narrow.addEventListener("change", place);
}

function setupFormatting(root, textarea) {
  const bar = root.querySelector(".editor-format");
  textarea.addEventListener("keydown", handleFormatKeys);
  bar.addEventListener("mousedown", (e) => e.preventDefault());
  bar.addEventListener("click", (e) => {
    const button = e.target.closest("[data-format]");
    if (button) applyFormat(textarea, button.dataset.format);
  });
  pinAboveKeyboard(bar, textarea);
}

document.addEventListener("editor:ready", (e) =>
  setupFormatting(e.target, e.detail.ui.textarea),
);
