import { setupMenu } from "./menu.js";

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const IDLE_DELAY = 2500;

let menus = 0;

const clock = (seconds) => {
  const s = Math.floor(Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const make = (tag, className, attributes = {}) => {
  const node = document.createElement(tag);
  node.className = className;
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  return node;
};

const iconButton = (className, label, icon) => {
  const button = make("button", `icon-btn ${className}`, { type: "button" });
  button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
  button.setAttribute("aria-label", label);
  button.title = label;
  return button;
};

const setIcon = (button, label, icon) => {
  button.setAttribute("aria-label", label);
  button.title = label;
  button.querySelector("i").className = `fa-solid ${icon}`;
};

// A range input whose filled part is drawn from --fill.
const slider = (className, label, max, step) => {
  const input = make("input", `player-range ${className}`, {
    type: "range",
    min: "0",
    max: String(max),
    step: String(step),
    "aria-label": label,
  });
  input.value = "0";
  return input;
};

const setSlider = (input, value, max) => {
  input.max = String(max);
  input.value = String(value);
  input.style.setProperty("--fill", `${max ? (value / max) * 100 : 0}%`);
};

function speedItems(video, menu, button) {
  for (const speed of SPEEDS) {
    const item = make("button", "menu-item", {
      type: "button",
      role: "menuitem",
    });
    item.textContent = `${speed}×`;
    item.addEventListener("click", () => {
      video.playbackRate = speed;
      menu.hidePopover();
      button.focus();
    });
    menu.append(item);
  }
}

// The speed button opens the site's menu above itself.
function speedControl(video) {
  const id = `player-speed-${++menus}`;
  const button = make("button", "player-speed", {
    type: "button",
    popovertarget: id,
    "aria-haspopup": "menu",
    title: "Speed",
  });
  const menu = make("div", "menu player-menu", {
    id,
    popover: "",
    role: "menu",
    "aria-label": "Speed",
  });
  speedItems(video, menu, button);
  const sync = () => {
    const rate = `${video.playbackRate}×`;
    button.textContent = rate;
    button.setAttribute("aria-label", `Speed, ${rate}`);
    for (const item of menu.children) {
      item.toggleAttribute("aria-current", item.textContent === rate);
    }
  };
  setupMenu(menu, button, { above: true });
  video.addEventListener("ratechange", sync);
  sync();
  return [button, menu];
}

const TIME_EVENTS = [
  "play",
  "pause",
  "ended",
  "timeupdate",
  "seeked",
  "loadedmetadata",
  "durationchange",
];

function timeControls(video) {
  const play = iconButton("player-play", "Play", "fa-play");
  const seek = slider("player-seek", "Seek", 0, "any");
  const time = make("span", "player-time");
  const sync = () => {
    const playing = !video.paused && !video.ended;
    setIcon(play, playing ? "Pause" : "Play", playing ? "fa-pause" : "fa-play");
    setSlider(seek, video.currentTime, video.duration || 0);
    seek.setAttribute("aria-valuetext", clock(video.currentTime));
    time.textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`;
  };
  // A refused play() is shown by the error handler or is a pause that won.
  const toggle = () =>
    video.paused ? video.play().catch(() => {}) : video.pause();
  play.addEventListener("click", toggle);
  video.addEventListener("click", toggle);
  seek.addEventListener("input", () => {
    video.currentTime = Number(seek.value);
  });
  for (const event of TIME_EVENTS) video.addEventListener(event, sync);
  sync();
  return { play, seek, time };
}

function volumeControls(video) {
  const mute = iconButton("player-mute", "Mute", "fa-volume-high");
  const volume = slider("player-volume", "Volume", 1, 0.05);
  const sync = () => {
    const silent = video.muted || video.volume === 0;
    setIcon(
      mute,
      silent ? "Unmute" : "Mute",
      silent ? "fa-volume-xmark" : "fa-volume-high",
    );
    setSlider(volume, silent ? 0 : video.volume, 1);
  };
  mute.addEventListener("click", () => {
    video.muted = !video.muted;
  });
  volume.addEventListener("input", () => {
    video.volume = Number(volume.value);
    video.muted = video.volume === 0;
  });
  video.addEventListener("volumechange", sync);
  sync();
  const sound = make("span", "player-sound");
  sound.append(mute, volume);
  return sound;
}

// Full screen takes the whole player so its controls stay; iPhones only
// allow the video itself.
function fullscreenButton(player, video) {
  const button = iconButton("player-full", "Full screen", "fa-expand");
  button.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (player.requestFullscreen) player.requestFullscreen();
    else video.webkitEnterFullscreen?.();
  });
  player.addEventListener("fullscreenchange", () => {
    const full = document.fullscreenElement === player;
    setIcon(
      button,
      full ? "Exit full screen" : "Full screen",
      full ? "fa-compress" : "fa-expand",
    );
  });
  return button;
}

// The controls fade out while the clip plays untouched and come back on
// any pointer or key activity.
function autoHide(player, video) {
  let timer = null;
  const wake = () => {
    player.classList.remove("idle");
    clearTimeout(timer);
    if (video.paused) return;
    timer = setTimeout(() => player.classList.add("idle"), IDLE_DELAY);
  };
  for (const event of ["pointermove", "pointerdown", "keydown", "focusin"]) {
    player.addEventListener(event, wake);
  }
  video.addEventListener("play", wake);
  video.addEventListener("pause", wake);
}

// A clip the browser can't decode says so in place of its controls.
function showFailure(player, video) {
  const fail = () => {
    if (video.hidden) return;
    const note = make("p", "player-error", { role: "alert" });
    note.textContent =
      "This video is missing or can't be played in this browser.";
    video.hidden = true;
    video.before(note);
    player.classList.add("failed");
  };
  video.addEventListener("error", fail);
  if (video.error) fail();
}

function controlsOf(player, video) {
  const { play, seek, time } = timeControls(video);
  const row = make("div", "player-row");
  row.append(
    play,
    time,
    ...speedControl(video),
    volumeControls(video),
    fullscreenButton(player, video),
  );
  const osd = make("div", "player-osd");
  osd.append(seek, row);
  return osd;
}

// Videos get controls in the site's style, laid over the picture; without
// JavaScript they keep the browser's own.
export function enhanceVideos(root = document) {
  for (const video of root.querySelectorAll("video[controls]")) {
    const player = make("div", "player", {
      role: "group",
      "aria-label": video.getAttribute("aria-label") || "Video",
    });
    video.replaceWith(player);
    video.removeAttribute("controls");
    player.append(video, controlsOf(player, video));
    autoHide(player, video);
    showFailure(player, video);
  }
}
