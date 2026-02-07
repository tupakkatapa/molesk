// Configuration
const CONFIG = {
  SWIPE_THRESHOLD: 75,
  MOBILE_BREAKPOINT: 768,
  TRANSITION_DELAY: 50,
  COPY_BUTTON_RESET_DELAY: 2000,
  DEFAULT_THEME: "dark",
};

document.addEventListener("DOMContentLoaded", () => {
  setupThemeToggle();
  setupSidebarToggle();
  setupSwipeGestures();
  setupInitialSidebarState();
  addCopyButtons();
  setupFolderToggles();
  setupKeyboardNavigation();
  setupRssCopyLink();
});

function setupThemeToggle() {
  const themeToggleIcon = document.getElementById("themeToggleIcon");
  const toggleTheme = () => {
    const isDarkTheme = document.body.classList.toggle("dark-theme");
    localStorage.setItem("theme", isDarkTheme ? "dark" : "light");
    document.getElementById("highlightjs-light").disabled = isDarkTheme;
    document.getElementById("highlightjs-dark").disabled = !isDarkTheme;
  };

  themeToggleIcon.addEventListener("click", (e) => {
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

  document.getElementById("highlightjs-light").disabled = isDark;
  document.getElementById("highlightjs-dark").disabled = !isDark;
}

function setupSidebarToggle() {
  const collapseBtn = document.getElementById("collapseSidebar");
  const sidebar = document.querySelector(".sidebar");
  const container = document.querySelector(".container");
  const backdrop = document.getElementById("sidebarBackdrop");
  const isMobile = () => window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;

  const toggleSidebar = () => {
    const isCollapsed = sidebar.classList.toggle("collapsed");

    if (isMobile()) {
      backdrop.classList.toggle("active", !isCollapsed);
      document.body.style.overflow = isCollapsed ? "auto" : "hidden";
    } else {
      container.classList.toggle("sidebar-collapsed", isCollapsed);
    }

    collapseBtn.style.transform = isCollapsed
      ? "rotate(180deg)"
      : "rotate(0deg)";
  };

  collapseBtn.addEventListener("click", toggleSidebar);
  backdrop.addEventListener("click", () => {
    if (!sidebar.classList.contains("collapsed")) {
      toggleSidebar();
    }
  });
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
    const sidebar = document.querySelector(".sidebar");
    const container = document.querySelector(".container");
    const collapseBtn = document.getElementById("collapseSidebar");

    if (
      touchEndX > touchStartX + threshold &&
      sidebar.classList.contains("collapsed")
    ) {
      sidebar.classList.remove("collapsed");
      container.classList.remove("sidebar-collapsed");
      collapseBtn.style.transform = "rotate(0deg)";
    } else if (
      touchEndX < touchStartX - threshold &&
      !sidebar.classList.contains("collapsed")
    ) {
      sidebar.classList.add("collapsed");
      container.classList.add("sidebar-collapsed");
      collapseBtn.style.transform = "rotate(180deg)";
    }
  });
}

function setupInitialSidebarState() {
  const sidebar = document.querySelector(".sidebar");
  const container = document.querySelector(".container");
  const collapseBtn = document.getElementById("collapseSidebar");
  const isMobile = () => window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;

  sidebar.classList.add("no-transition");
  container.classList.add("no-transition");

  if (isMobile()) {
    // On mobile, start with sidebar collapsed
    sidebar.classList.add("collapsed");
    collapseBtn.style.transform = "rotate(180deg)";
    // Ensure main content is positioned correctly
    container.classList.add("sidebar-collapsed");
  } else {
    sidebar.classList.remove("collapsed");
    container.classList.remove("sidebar-collapsed");
    collapseBtn.style.transform = "rotate(0deg)";
  }

  setTimeout(() => {
    sidebar.classList.remove("no-transition");
    container.classList.remove("no-transition");
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
  const sidebar = document.querySelector(".sidebar");
  sidebar.classList.add("no-transition");

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
    () => sidebar.classList.remove("no-transition"),
    CONFIG.TRANSITION_DELAY,
  );
}

function setupKeyboardNavigation() {
  document.addEventListener("keydown", (e) => {
    // Ignore if user is typing in an input
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.key) {
      case "t":
      case "T":
        e.preventDefault();
        document.getElementById("themeToggleIcon").click();
        break;
      case "Escape":
        const sidebar = document.querySelector(".sidebar");
        if (!sidebar.classList.contains("collapsed")) {
          document.getElementById("collapseSidebar").click();
        }
        break;
      case "Home":
        e.preventDefault();
        document
          .querySelector(".main")
          .scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "End":
        e.preventDefault();
        const main = document.querySelector(".main");
        main.scrollTo({ top: main.scrollHeight, behavior: "smooth" });
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
