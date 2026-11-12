import { CONFIG, el } from "./dom.js";
import { renderDiagrams } from "./mermaid.js";
import { markActiveLink, mobileQuery, setSidebarOpen } from "./sidebar.js";

// Code blocks get a header with their language and a copy button.
export function enhanceCode(root = document) {
  root.querySelectorAll(".markdown-body pre code").forEach((block) => {
    const pre = block.parentNode;

    // Extract language from class
    const classes = block.className.split(" ");
    const langClass = classes.find((c) => c.startsWith("language-"));
    const lang = langClass ? langClass.replace("language-", "") : null;

    // Create wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "code-wrapper";

    // Create header with language and copy button
    const header = document.createElement("div");
    header.className = "code-header";

    const langBadge = document.createElement("span");
    langBadge.className = "code-language";
    langBadge.textContent = lang || "";

    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.innerHTML = '<i class="fa-regular fa-copy"></i>';
    copyButton.title = "Copy";
    copyButton.setAttribute("aria-label", "Copy code");
    copyButton.addEventListener("click", () => {
      navigator.clipboard.writeText(block.textContent).then(() => {
        const icon = copyButton.querySelector("i");
        icon.classList.remove("fa-regular", "fa-copy");
        icon.classList.add("fa-solid", "fa-check");
        setTimeout(() => {
          icon.classList.remove("fa-solid", "fa-check");
          icon.classList.add("fa-regular", "fa-copy");
        }, CONFIG.COPY_BUTTON_RESET_DELAY);
      });
    });

    header.append(langBadge);
    header.append(copyButton);

    pre.parentNode.replaceChild(wrapper, pre);
    wrapper.append(header);
    wrapper.append(pre);
  });
  renderDiagrams(root);
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

function setupLazyImages() {
  document.querySelectorAll(".markdown-body img").forEach((img) => {
    if (img.complete) {
      img.classList.add("loaded");
    } else {
      img.addEventListener("load", () => img.classList.add("loaded"));
      img.addEventListener("error", () => img.classList.add("loaded"));
    }
  });
}

let shownPath = window.location.pathname;

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
  enhanceCode();
  setupLazyImages();

  const title = response.headers.get("X-Page-Title");
  if (title) document.title = decodeURIComponent(title);
  const heading = response.headers.get("X-Page-Heading");
  const topbarTitle = document.querySelector(".topbar-title");
  if (heading && topbarTitle)
    topbarTitle.textContent = decodeURIComponent(heading);
  syncTopbarEdit();

  if (push) {
    window.history.pushState({ href: shown }, "", shown);
    window.scrollTo({ top: 0, behavior: "instant" });
  } else if (shown !== window.location.pathname) {
    window.history.replaceState({ href: shown }, "", shown);
  }
  shownPath = window.location.pathname;
  markActiveLink(shown);
}

function scrollToAnchor(e, anchor) {
  const targetId = anchor.getAttribute("href").slice(1);
  const target = document.querySelector(`#${CSS.escape(targetId)}`);
  if (target) {
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState({}, "", `#${targetId}`);
  }
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

    if (href.startsWith("#") && link.closest(".markdown-body")) {
      scrollToAnchor(e, link);
    } else if (
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
  enhanceCode();
  setupLazyImages();
  setupClickHandling(setupImageLightbox());
});
