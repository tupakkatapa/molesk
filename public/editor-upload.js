import { report } from "./editor.js";
import { replaceRange } from "./editor-format.js";
import { errorText } from "./api.js";
import { encode } from "./slug.mjs";

const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
const MAX_NAME_BYTES = 200;
const MAX_TRIES = 100;

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
  `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// The page's name, cut by whole characters until the file name fits.
function fitName(name, suffix) {
  const chars = [...name];
  const bytes = (text) => new TextEncoder().encode(text).length;
  while (chars.length > 0 && bytes(chars.join("") + suffix) > MAX_NAME_BYTES) {
    chars.pop();
  }
  return chars.join("") + suffix;
}

// Stores `file` as assets/<page>-<time>.<ext> beside the page, with -1,
// -2… when the name is taken, and returns the name.
async function upload(ed, file) {
  const { dir, ext } = ed.ui.root.dataset;
  const page = ed.path.slice(dir.length, ed.path.length - ext.length);
  const time = stamp(new Date());
  for (let n = 0; n < MAX_TRIES; n++) {
    const suffix = `-${time}${n ? `-${n}` : ""}.${EXTENSIONS[file.type]}`;
    const name = fitName(page, suffix);
    const res = await fetch(`/api/assets/${encode(`${dir}assets/${name}`)}`, {
      method: "PUT",
      headers: { "Content-Type": file.type, "If-None-Match": "*" },
      body: file,
    });
    if (res.ok) return name;
    if (res.status !== 412) throw new Error(await errorText(res));
  }
  throw new Error("No free name left");
}

const mediaOf = (files) =>
  [...(files ?? [])].filter((file) => EXTENSIONS[file.type]);

// The files go in at the caret as it was when they were pasted or dropped.
async function insertMedia(ed, files) {
  const { textarea } = ed.ui;
  const { selectionStart, selectionEnd } = textarea;
  report(ed, "Uploading…");
  try {
    const names = [];
    for (const file of files) names.push(await upload(ed, file));
    const text = names.map((name) => `![](<assets/${name}>)`).join("\n");
    replaceRange(textarea, selectionStart, selectionEnd, text);
  } catch (err) {
    report(ed, `Upload failed: ${err.message}`);
  }
}

function setupUpload(ed) {
  const { textarea } = ed.ui;
  const take = (e, files) => {
    const media = mediaOf(files);
    if (media.length === 0) return;
    e.preventDefault();
    insertMedia(ed, media);
  };
  const dropping = (on) => textarea.classList.toggle("dropping", on);
  textarea.addEventListener("paste", (e) => take(e, e.clipboardData?.files));
  textarea.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dropping(true);
  });
  textarea.addEventListener("dragleave", () => dropping(false));
  textarea.addEventListener("drop", (e) => {
    dropping(false);
    take(e, e.dataTransfer?.files);
  });
}

document.addEventListener("editor:ready", (e) => setupUpload(e.detail));
