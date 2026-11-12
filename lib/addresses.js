const fs = require("fs").promises;
const path = require("path");
const { byName, MD_EXTENSIONS } = require("./helpers");
const { slugNote, slugSegment } = require("../public/slug.mjs");
const { aliasAddress } = require("./aliases");
const { siteIndex } = require("./site");

const notFound = () => Object.assign(new Error("Not Found"), { status: 404 });

const isNoteName = (name) =>
  MD_EXTENSIONS.includes(path.extname(name).toLowerCase());
const isFolderEntry = (entry) => entry.isDirectory() || entry.isSymbolicLink();

// The entry a page address segment names: the exact name, else the page
// (unless only a folder may match) and then the folder whose slug it is.
// ponytail: equal slugs go to the first name and are logged, no rename.
function matchSegment(entries, segment, { last, folder }) {
  const exact = entries.find((entry) => entry.name === segment);
  if (exact) return exact;
  const pages =
    last && !folder
      ? entries.filter(
          (entry) => isNoteName(entry.name) && slugNote(entry.name) === segment,
        )
      : [];
  const folders = entries.filter(
    (entry) => isFolderEntry(entry) && slugSegment(entry.name) === segment,
  );
  const matches = [
    ...pages.sort((a, b) => byName(a.name, b.name)),
    ...folders.sort((a, b) => byName(a.name, b.name)),
  ];
  if (matches.length > 1) {
    console.warn(
      `Address "${segment}" fits ${matches.map((m) => `"${m.name}"`).join(", ")}; serving "${matches[0].name}"`,
    );
  }
  return matches[0] ?? null;
}

async function walkAddress(config, address, folder) {
  const segments = address.split("/").filter(Boolean);
  const names = [];
  let dir = config.CONTENTS_DIR;
  for (const [i, segment] of segments.entries()) {
    const entries = await fs
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);
    const match = matchSegment(
      entries.filter((entry) => !entry.name.startsWith(".")),
      segment,
      { last: i === segments.length - 1, folder },
    );
    if (!match) throw notFound();
    names.push(match.name);
    dir = path.join(dir, match.name);
  }
  return names.join("/");
}

// The path under the data dir a page address points at, or 404. With
// `folder`, the last segment names a folder. A page's old address from its
// `aliases:` points at the page.
async function resolveAddress(config, address, { folder = false } = {}) {
  try {
    return await walkAddress(config, address, folder);
  } catch (err) {
    if (err.status !== 404 || folder) throw err;
    const { aliases } = await siteIndex(config).get();
    const target = aliases.get(aliasAddress(address) ?? "");
    if (!target) throw err;
    return target;
  }
}

// The canonical address to redirect an old or differently spelled one to,
// or null; equal slugs leave the other file at its own address.
async function movedTo(config, req, canonical, rel, options) {
  const prefix = canonical.slice(0, canonical.indexOf("/", 1) + 1);
  if (decodeURIComponent(canonical) === prefix + req.params.path) return null;
  const owner = await resolveAddress(
    config,
    decodeURIComponent(canonical.slice(prefix.length)),
    options,
  ).catch(() => null);
  return owner === rel ? canonical : null;
}

module.exports = { movedTo, resolveAddress };
