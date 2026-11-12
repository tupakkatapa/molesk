const { unreadableCount } = require("./content");
const { siteIndex, slugOf, targetOf } = require("./site");

// Prints each broken or ambiguous link to stdout and a summary to stderr;
// resolves to the exit code: 1 when a link is broken, 2 when some path
// couldn't be read, else 0.
async function checkLinks(config) {
  const site = await siteIndex(config).get();
  let broken = 0;
  let warnings = 0;
  for (const note of site.notes) {
    for (const link of note.links) {
      const shown =
        link.kind === "wiki" ? `[[${link.target}]]` : `(${link.target})`;
      const where = `${note.rel}:${link.line}`;
      if (!targetOf(site, note, link)) {
        broken++;
        console.log(`${where}: broken link ${shown}`);
        continue;
      }
      const found =
        link.kind === "wiki" ? site.names.get(slugOf(link.target)) : [];
      if (found.length > 1) {
        warnings++;
        console.log(`${where}: ambiguous link ${shown}: ${found.join(", ")}`);
      }
    }
  }
  console.error(
    `${broken} broken, ${warnings} warnings in ${site.notes.length} notes`,
  );
  if (unreadableCount() > 0) return 2;
  return broken > 0 ? 1 : 0;
}

module.exports = { checkLinks };
