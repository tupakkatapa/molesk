// Mermaid diagrams render in the browser, loading the library only on pages
// that have one. A diagram that fails to parse stays as its source.
let library = null;

const theme = () =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "default";

async function load() {
  library ??= import("/vendor/mermaid/mermaid.esm.min.mjs").then(
    ({ default: mermaid }) => mermaid,
  );
  const mermaid = await library;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: theme(),
  });
  return mermaid;
}

async function draw(nodes) {
  if (nodes.length === 0) return;
  for (const node of nodes) {
    node.dataset.source ??= node.textContent;
    node.textContent = node.dataset.source;
    delete node.dataset.processed;
  }
  try {
    const mermaid = await load();
    await mermaid.run({ nodes, suppressErrors: true });
  } catch (err) {
    console.warn("Mermaid diagrams could not be rendered:", err);
  }
}

export const renderDiagrams = (root = document) =>
  draw([...root.querySelectorAll(".markdown-body pre.mermaid")]);

export const redrawDiagrams = () =>
  draw([...document.querySelectorAll("pre.mermaid[data-source]")]);
