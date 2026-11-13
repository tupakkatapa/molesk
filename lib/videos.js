const { VIDEO_EXTENSIONS, escapeHtml } = require("./helpers");

const isVideo = (token) =>
  token.type === "image" &&
  VIDEO_EXTENSIONS.includes(
    /\.[^./?#]+(?=[?#]|$)/u.exec(token.attrGet("src"))?.[0].toLowerCase(),
  );

// A video alone on its line stands as a block, without a paragraph.
function unwrap(state) {
  state.tokens.forEach((token, i) => {
    const lone = token.type === "inline" && token.children.length === 1;
    if (!lone || !isVideo(token.children[0])) return;
    if (state.tokens[i - 1]?.type !== "paragraph_open") return;
    state.tokens[i - 1].hidden = true;
    state.tokens[i + 1].hidden = true;
  });
}

// An image link to a video file embeds a player; its alt text names it.
function videos(md) {
  md.core.ruler.push("video_blocks", unwrap);
  const renderImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!isVideo(token)) return renderImage(tokens, idx, options, env, self);
    const src = token.attrGet("src");
    const label = self.renderInlineAsText(token.children, options, env);
    const title = token.attrGet("title");
    return (
      `<video controls playsinline preload="metadata" src="${escapeHtml(src)}"` +
      (label ? ` aria-label="${escapeHtml(label)}"` : "") +
      (title ? ` title="${escapeHtml(title)}"` : "") +
      "></video>"
    );
  };
}

module.exports = { videos };
