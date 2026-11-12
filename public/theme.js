// Loaded as a blocking script at the end of <head>, so the first paint is
// already in the right theme.
const root = document.documentElement;
const stored = localStorage.getItem("theme");
const auto = matchMedia("(prefers-color-scheme: dark)").matches
  ? "dark"
  : "light";
const fallback =
  root.dataset.themeDefault === "auto" ? auto : root.dataset.themeDefault;
root.dataset.theme = ["dark", "light"].includes(stored) ? stored : fallback;
document.querySelector("#highlightjs-light").disabled =
  root.dataset.theme === "dark";
document.querySelector("#highlightjs-dark").disabled =
  root.dataset.theme !== "dark";
