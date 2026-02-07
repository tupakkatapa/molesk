// Configuration
const CONFIG = {
  SWIPE_THRESHOLD: 75,
  MOBILE_BREAKPOINT: 768,
  TRANSITION_DELAY: 50,
  COPY_BUTTON_RESET_DELAY: 2000,
  DEFAULT_THEME: "dark",
};

// Shared DOM element references
const el = {};

document.addEventListener("DOMContentLoaded", () => {
  el.sidebar = document.querySelector(".sidebar");
  el.container = document.querySelector(".container");
  el.collapseBtn = document.getElementById("collapseSidebar");
  el.backdrop = document.getElementById("sidebarBackdrop");
  el.themeToggle = document.getElementById("themeToggleIcon");
  el.hljsLight = document.getElementById("highlightjs-light");
  el.hljsDark = document.getElementById("highlightjs-dark");
  el.main = document.querySelector(".main");

  const singleFileMode = document.body.classList.contains("single-file-mode");

  setupThemeToggle();
  if (!singleFileMode) {
    setupSidebarToggle();
    setupSwipeGestures();
    setupInitialSidebarState();
    setupFolderToggles();
    setupActiveLink();
    setupRssCopyLink();
  }
  addCopyButtons();
  setupKeyboardNavigation();
  setupImageLightbox();
  setupLazyImages();
  setupPageTransitions();
  setupSmoothAnchors();
});

function isMobile() {
  return window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
}

function setupThemeToggle() {
  const animateThemeTransition = () => {
    // Check for View Transitions API support
    if (document.startViewTransition) {
      const willBeDark = !document.body.classList.contains("dark-theme");

      // Get button position for ripple origin
      const rect = el.themeToggle.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      // Calculate max radius needed to cover the entire viewport
      const maxRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );

      // Set CSS variables for the animation
      document.documentElement.style.setProperty("--ripple-x", `${x}px`);
      document.documentElement.style.setProperty("--ripple-y", `${y}px`);
      document.documentElement.style.setProperty(
        "--max-radius",
        `${maxRadius}px`,
      );

      // Use View Transitions API for smooth content morphing
      const transition = document.startViewTransition(() => {
        document.body.classList.toggle("dark-theme", willBeDark);
        el.hljsLight.disabled = willBeDark;
        el.hljsDark.disabled = !willBeDark;
      });

      transition.finished.then(() => {
        localStorage.setItem("theme", willBeDark ? "dark" : "light");
      });
    } else {
      // Fallback for browsers without View Transitions
      const willBeDark = !document.body.classList.contains("dark-theme");
      document.body.classList.toggle("dark-theme", willBeDark);
      localStorage.setItem("theme", willBeDark ? "dark" : "light");
      el.hljsLight.disabled = willBeDark;
      el.hljsDark.disabled = !willBeDark;
    }
  };

  el.themeToggle.addEventListener("click", (e) => {
    e.preventDefault();
    animateThemeTransition(e);
  });
  const storedTheme = localStorage.getItem("theme");
  const validThemes = ["dark", "light"];
  const preferredTheme = validThemes.includes(storedTheme)
    ? storedTheme
    : CONFIG.DEFAULT_THEME;
  const isDark = preferredTheme === "dark";

  // Body already has dark-theme class by default, only remove if light theme
  if (!isDark) {
    document.body.classList.remove("dark-theme");
  }

  el.hljsLight.disabled = isDark;
  el.hljsDark.disabled = !isDark;
}

function setupSidebarToggle() {
  const toggleSidebar = () => {
    const isCollapsed = el.sidebar.classList.toggle("collapsed");

    if (isMobile()) {
      el.backdrop.classList.toggle("active", !isCollapsed);
      document.body.classList.toggle("no-scroll", !isCollapsed);
    } else {
      el.container.classList.toggle("sidebar-collapsed", isCollapsed);
    }

    el.collapseBtn.classList.toggle("rotate", isCollapsed);
  };

  el.collapseBtn.addEventListener("click", toggleSidebar);
  el.backdrop.addEventListener("click", () => {
    if (!el.sidebar.classList.contains("collapsed")) {
      toggleSidebar();
    }
  });

  // Mobile: clicking the collapsed sidebar sliver opens it
  const toggleZone = document.getElementById("sidebarToggleZone");
  if (toggleZone) {
    toggleZone.addEventListener("click", () => {
      if (isMobile() && el.sidebar.classList.contains("collapsed")) {
        toggleSidebar();
      }
    });
  }
}

function setupSwipeGestures() {
  let touchStartX = 0;
  document.body.addEventListener(
    "touchstart",
    (e) => (touchStartX = e.changedTouches[0].screenX),
  );
  document.body.addEventListener("touchend", (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const threshold = CONFIG.SWIPE_THRESHOLD;

    if (
      touchEndX > touchStartX + threshold &&
      el.sidebar.classList.contains("collapsed")
    ) {
      el.sidebar.classList.remove("collapsed");
      el.container.classList.remove("sidebar-collapsed");
      el.collapseBtn.classList.remove("rotate");
    } else if (
      touchEndX < touchStartX - threshold &&
      !el.sidebar.classList.contains("collapsed")
    ) {
      el.sidebar.classList.add("collapsed");
      el.container.classList.add("sidebar-collapsed");
      el.collapseBtn.classList.add("rotate");
    }
  });
}

function setupInitialSidebarState() {
  el.sidebar.classList.add("no-transition");
  el.container.classList.add("no-transition");

  if (isMobile()) {
    el.sidebar.classList.add("collapsed");
    el.collapseBtn.classList.add("rotate");
    el.container.classList.add("sidebar-collapsed");
  } else {
    el.sidebar.classList.remove("collapsed");
    el.container.classList.remove("sidebar-collapsed");
    el.collapseBtn.classList.remove("rotate");
  }

  setTimeout(() => {
    el.sidebar.classList.remove("no-transition");
    el.container.classList.remove("no-transition");
  }, CONFIG.TRANSITION_DELAY);
}

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

    header.appendChild(langBadge);
    header.appendChild(copyButton);

    pre.parentNode.replaceChild(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });
}

function setupFolderToggles() {
  el.sidebar.classList.add("no-transition");

  document
    .querySelectorAll(".sidebar .folder > span")
    .forEach((folderSpan, index) => {
      const listItem = folderSpan.parentElement;
      const sublist = listItem.querySelector("ul");
      const folderIcon = folderSpan.querySelector("i");
      const folderId = `folderState-${index}`;
      const storedState = localStorage.getItem(folderId) || "closed";

      const setFolderState = (isOpen) => {
        listItem.classList.toggle("open", isOpen);
        sublist.style.maxHeight = isOpen ? `${sublist.scrollHeight}px` : 0;
        folderIcon.classList.toggle("fa-folder-open", isOpen);
        folderIcon.classList.toggle("fa-folder", !isOpen);
        localStorage.setItem(folderId, isOpen ? "open" : "closed");
      };

      setFolderState(storedState === "open");

      folderSpan.addEventListener("click", () =>
        setFolderState(!listItem.classList.contains("open")),
      );
    });

  setTimeout(
    () => el.sidebar.classList.remove("no-transition"),
    CONFIG.TRANSITION_DELAY,
  );
}

function setupKeyboardNavigation() {
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.key) {
      case "t":
      case "T":
        e.preventDefault();
        el.themeToggle.click();
        break;
      case "Escape":
        if (
          el.sidebar &&
          el.collapseBtn &&
          !el.sidebar.classList.contains("collapsed")
        ) {
          el.collapseBtn.click();
        }
        break;
      case "Home":
        e.preventDefault();
        el.main.scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "End":
        e.preventDefault();
        el.main.scrollTo({ top: el.main.scrollHeight, behavior: "smooth" });
        break;
    }
  });
}

function setupRssCopyLink() {
  const rssLink = document.querySelector(".rss-copy-link");
  if (!rssLink) return;

  rssLink.addEventListener("click", (e) => {
    e.preventDefault();
    const rssUrl = window.location.origin + rssLink.dataset.rssUrl;
    navigator.clipboard.writeText(rssUrl).then(() => {
      const icon = rssLink.querySelector("i");
      icon.classList.remove("fa-rss");
      icon.classList.add("fa-check");
      setTimeout(() => {
        icon.classList.remove("fa-check");
        icon.classList.add("fa-rss");
      }, CONFIG.COPY_BUTTON_RESET_DELAY);
    });
  });
}

function setupActiveLink() {
  const currentPath = window.location.pathname;
  document.querySelectorAll('.sidebar a[href^="/content/"]').forEach((link) => {
    if (link.getAttribute("href") === currentPath) {
      link.closest("li").classList.add("active");
    }
  });
}

function setupImageLightbox() {
  // Create lightbox overlay
  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = '<img src="" alt="Lightbox image">';
  document.body.appendChild(overlay);

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

    const content = document.getElementById("file-content");
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
      const target = document.getElementById(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.pushState({}, "", `#${targetId}`);
      }
    });
  });
}
