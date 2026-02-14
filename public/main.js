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
  el.collapseBtn = document.querySelector("#collapseSidebar");
  el.backdrop = document.querySelector("#sidebarBackdrop");
  el.themeToggle = document.querySelector("#themeToggleIcon");
  el.hljsLight = document.querySelector("#highlightjs-light");
  el.hljsDark = document.querySelector("#highlightjs-dark");
  el.main = document.querySelector(".main");

  const singleFileMode = document.body.classList.contains("single-file-mode");

  setupThemeToggle();
  setupKeyboardNavigation();
  if (!singleFileMode) {
    setupActiveLink();
    setupRssCopyLink();
  }
});

function animateThemeTransition() {
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
}

function initializeTheme() {
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

function setupThemeToggle() {
  el.themeToggle.addEventListener("click", (e) => {
    e.preventDefault();
    animateThemeTransition();
  });
  initializeTheme();
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
