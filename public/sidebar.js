function isMobile() {
  return window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
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
  const toggleZone = document.querySelector("#sidebarToggleZone");
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

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.classList.contains("single-file-mode")) return;
  setupSidebarToggle();
  setupSwipeGestures();
  setupInitialSidebarState();
  setupFolderToggles();
});
