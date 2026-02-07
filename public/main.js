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
});

function isMobile() {
  return window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
}

function setupThemeToggle() {
  const toggleTheme = () => {
    const isDarkTheme = document.body.classList.toggle("dark-theme");
    localStorage.setItem("theme", isDarkTheme ? "dark" : "light");
    el.hljsLight.disabled = isDarkTheme;
    el.hljsDark.disabled = !isDarkTheme;
  };

  el.themeToggle.addEventListener("click", (e) => {
    e.preventDefault();
    toggleTheme();
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
    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", () => {
      navigator.clipboard.writeText(block.textContent).then(() => {
        copyButton.textContent = "Copied!";
        setTimeout(
          () => (copyButton.textContent = "Copy"),
          CONFIG.COPY_BUTTON_RESET_DELAY,
        );
      });
    });

    const wrapper = document.createElement("div");
    wrapper.className = "code-wrapper";
    block.parentNode.replaceChild(wrapper, block);
    wrapper.appendChild(block);
    wrapper.appendChild(copyButton);
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
