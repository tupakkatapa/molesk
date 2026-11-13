import { CONFIG, el } from "./dom.js";
import { renderDiagrams } from "./mermaid.js";
import { restorePosition } from "./position.js";
import { markActiveLink, mobileQuery, setSidebarOpen } from "./sidebar.js";

const CODE_HEADER =
  '<div class="code-header"><span class="code-language"></span><button class="copy-button" title="Copy" aria-label="Copy code"><i class="fa-regular fa-copy"></i></button></div>';

function addCodeHeader(block) {
  const pre = block.parentNode;
  const wrapper = document.createElement("div");
  wrapper.className = "code-wrapper";
  wrapper.innerHTML = CODE_HEADER;
  wrapper.querySelector(".code-language").textContent =
    /(?:^|\s)language-(\S*)/u.exec(block.className)?.[1] ?? "";
  const icon = wrapper.querySelector("i");
  wrapper.querySelector("button").addEventListener("click", () => {
    navigator.clipboard.writeText(block.textContent).then(() => {
      icon.className = "fa-solid fa-check";
      setTimeout(() => {
        icon.className = "fa-regular fa-copy";
      }, CONFIG.COPY_BUTTON_RESET_DELAY);
    });
  });
  pre.replaceWith(wrapper);
  wrapper.append(pre);
}

// Code blocks get a header with their language and a copy button; diagrams
// and videos get drawn and their controls.
export function enhance(root = document) {
  for (const block of root.querySelectorAll(".markdown-body pre code")) {
    addCodeHeader(block);
  }
  renderDiagrams(root);
  if (root.querySelector("video[controls]")) {
    import("./player.js").then(({ enhanceVideos }) => enhanceVideos(root));
  }
}

function setupImageLightbox() {
  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Image viewer");
  overlay.innerHTML = '<img src="" alt="Lightbox image">';
  document.body.append(overlay);

  const lightboxImg = overlay.querySelector("img");

  const close = () => {
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  };

  overlay.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });

  return (img) => {
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  };
}

let shownPath = window.location.pathname;

const byHash = (hash) => {
  try {
    return document.querySelector(
      `#${CSS.escape(decodeURIComponent(hash.slice(1)))}`,
    );
  } catch {
    return null;
  }
};

async function navigateTo(href, { push = true } = {}) {
  if (el.sidebar && mobileQuery.matches) setSidebarOpen(false);

  let response;
  let html;
  try {
    response = await fetch(href, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    html = await response.text();
  } catch {
    window.location.href = href;
    return;
  }

  const content = document.querySelector("#file-content");
  content.innerHTML = html;
  content.dataset.path = decodeURIComponent(
    response.headers.get("X-Page-Path") ?? "",
  );
  const shown = new URL(response.url).pathname;
  document.dispatchEvent(new Event("content:loaded"));
  enhance();

  const title = response.headers.get("X-Page-Title");
  if (title) document.title = decodeURIComponent(title);
  const heading = response.headers.get("X-Page-Heading");
  const topbarTitle = document.querySelector(".topbar-title");
  if (heading && topbarTitle)
    topbarTitle.textContent = decodeURIComponent(heading);
  syncTopbarEdit();

  content.querySelector("h1")?.focus({ preventScroll: true });
  if (push) {
    const { hash } = new URL(href, window.location.href);
    window.history.pushState({ href: shown }, "", shown + hash);
    const target = hash && byHash(hash);
    if (target) target.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: "instant" });
  } else {
    if (shown !== window.location.pathname) {
      window.history.replaceState({ href: shown }, "", shown);
    }
    restorePosition();
  }
  shownPath = window.location.pathname;
  markActiveLink(shown);
}

function setupClickHandling(openLightbox) {
  document.addEventListener("click", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const img = e.target.closest(".markdown-body img");
    if (img) {
      openLightbox(img);
      return;
    }

    const link = e.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href");

    if (
      href.startsWith("/content/") &&
      href !== window.location.pathname &&
      document.querySelector("#file-content")
    ) {
      e.preventDefault();
      navigateTo(href);
    }
  });

  window.addEventListener("popstate", () => {
    if (window.location.pathname !== shownPath) {
      navigateTo(window.location.pathname, { push: false });
    }
  });
}

// On phones the note's actions live in the top bar.
function syncTopbarEdit() {
  for (const name of ["edit", "download"]) {
    const button = document.querySelector(`.topbar-${name}`);
    const action = document.querySelector(`#file-content .${name}-icon`);
    if (!button) continue;
    button.hidden = !action;
    if (action) button.href = action.getAttribute("href");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  syncTopbarEdit();
  enhance();
  setupClickHandling(setupImageLightbox());
});
