export const CONFIG = {
  SWIPE_THRESHOLD: 75,
  MOBILE_BREAKPOINT: 768,
  TRANSITION_DELAY: 50,
  COPY_BUTTON_RESET_DELAY: 2000,
};

// Modules run once the document is parsed, so these are already there.
export const el = {
  sidebar: document.querySelector(".sidebar"),
  container: document.querySelector(".container"),
  main: document.querySelector(".main"),
  collapseBtn: document.querySelector("#collapseSidebar"),
  menuToggle: document.querySelector("#menuToggle"),
  backdrop: document.querySelector("#sidebarBackdrop"),
  themeToggle: document.querySelector("#themeToggleIcon"),
  hljsLight: document.querySelector("#highlightjs-light"),
  hljsDark: document.querySelector("#highlightjs-dark"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
};
