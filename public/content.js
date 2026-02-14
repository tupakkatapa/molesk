function addCopyButtons() {
  document.querySelectorAll(".markdown-body pre code").forEach((block) => {
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
}

function setupImageLightbox() {
  // Create lightbox overlay
  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = '<img src="" alt="Lightbox image">';
  document.body.append(overlay);

  const lightboxImg = overlay.querySelector("img");

  // Handle image clicks
  document.querySelectorAll(".markdown-body img").forEach((img) => {
    img.addEventListener("click", () => {
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt;
      overlay.classList.add("active");
      document.body.style.overflow = "hidden";
    });
  });

  // Close lightbox
  overlay.addEventListener("click", () => {
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  });

  // Close on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) {
      overlay.classList.remove("active");
      document.body.style.overflow = "";
    }
  });
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

function setupPageTransitions() {
  const navigateTo = async (href) => {
    const response = await fetch(href, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const html = await response.text();

    const content = document.querySelector("#file-content");
    if (content) {
      content.innerHTML = html;
      // Re-initialize features for new content
      addCopyButtons();
      setupLazyImages();
      setupImageLightbox();
      setupSmoothAnchors();
    }

    window.history.pushState({ href }, "", href);
    updateActiveLink(href);
  };

  // Intercept navigation clicks for instant content swap
  document.querySelectorAll('a[href^="/content/"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      if (href === window.location.pathname) return;

      e.preventDefault();
      navigateTo(href);
    });
  });

  // Handle browser back/forward
  window.addEventListener("popstate", () => {
    const href = window.location.pathname;
    navigateTo(href);
  });
}

function updateActiveLink(href) {
  document.querySelectorAll(".sidebar li.active").forEach((li) => {
    li.classList.remove("active");
  });
  document.querySelectorAll('.sidebar a[href^="/content/"]').forEach((link) => {
    if (link.getAttribute("href") === href) {
      link.closest("li").classList.add("active");
    }
  });
}

function setupSmoothAnchors() {
  // Smooth scroll to anchor links within the page
  document.querySelectorAll('.markdown-body a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const targetId = anchor.getAttribute("href").slice(1);
      const target = document.querySelector(`#${CSS.escape(targetId)}`);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.pushState({}, "", `#${targetId}`);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  addCopyButtons();
  setupImageLightbox();
  setupLazyImages();
  setupPageTransitions();
  setupSmoothAnchors();
});
