const MarkdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const yaml = require("js-yaml");
const { escapeHtml } = require("./helpers");

// Security: Disable raw HTML to prevent XSS
const md = new MarkdownIt({
  html: false,
  typographer: true,
  linkify: true,
}).use(markdownItAnchor, {
  permalink: markdownItAnchor.permalink.headerLink(),
  slugify: (s) =>
    encodeURIComponent(String(s).trim().toLowerCase().replaceAll(/\s+/g, "-")),
  level: 1,
});

const loadPlugin = (name, ...args) => {
  try {
    const plugin = require(name);
    if (name === "markdown-it-emoji") {
      const pluginFn = plugin.full || plugin.default || plugin;
      md.use(pluginFn, ...args);
    } else {
      const pluginFn = plugin.default || plugin;
      md.use(pluginFn, ...args);
    }
  } catch (err) {
    console.error(`Failed to load plugin ${name}:`, err.message);
  }
};

loadPlugin("markdown-it-highlightjs");
loadPlugin("markdown-it-emoji");
loadPlugin("markdown-it-sub");
loadPlugin("markdown-it-ins");
loadPlugin("markdown-it-mark");
loadPlugin("markdown-it-expandable");
loadPlugin("markdown-it-footnote");
loadPlugin("markdown-it-deflist");
loadPlugin("markdown-it-container", "warning");
loadPlugin("markdown-it-container", "info");
loadPlugin("markdown-it-abbr");
loadPlugin("markdown-it-collapsible");

function parseMetadataOnly(data) {
  const fmMatch = data.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const frontMatter = yaml.load(fmMatch[1]) || {};
    return { date: frontMatter.date, description: frontMatter.description };
  }
  return {};
}

function parseFileContent(data) {
  const fmMatch = data.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fmMatch) {
    const frontMatter = yaml.load(fmMatch[1]) || {};
    return {
      content: md.render(fmMatch[2]),
      metadata: { date: frontMatter.date },
    };
  }
  return { content: md.render(data), metadata: {} };
}

function metadataToHtml(meta) {
  return meta.date
    ? `<div class="metadata"><span class="meta-date">${escapeHtml(meta.date)}</span></div>`
    : "";
}

module.exports = { md, parseMetadataOnly, parseFileContent, metadataToHtml };
