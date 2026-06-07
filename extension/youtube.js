const MENU_ID = "hello-world-youtube-side-menu";

// Detect whether the current page is a YouTube watch page for a video.
function isWatchPage() {
  return location.pathname === "/watch" && new URLSearchParams(location.search).has("v");
}

// Detect whether the browser is currently in fullscreen mode.
function isFullscreen() {
  return Boolean(document.fullscreenElement);
}

// Detect whether YouTube is using theater mode on the watch page.
function isTheaterMode() {
  const watchFlexy = document.querySelector("ytd-watch-flexy");
  return Boolean(watchFlexy?.hasAttribute("theater"));
}

// Read the video title from the page, with a fallback if needed.
function getVideoTitle() {
  const title = document.querySelector("ytd-watch-metadata h1 yt-formatted-string");
  return title?.textContent?.trim() || document.title.replace(/ - YouTube$/, "") || "Untitled video";
}

// Remove the custom side menu if it exists.
function removeSideMenu() {
  document.getElementById(MENU_ID)?.remove();
}

// Create the side menu element used on the watch page.
function createSideMenu() {
  const menu = document.createElement("aside");
  menu.id = MENU_ID;
  menu.innerHTML = `
    <p class="hello-world-youtube-label">Current video</p>
    <h2></h2>
  `;
  return menu;
}

// Add or update the side menu when on the watch page and not in fullscreen/theater mode.
function updateSideMenu() {
  if (!isWatchPage() || isFullscreen() || isTheaterMode()) {
    removeSideMenu();
    return;
  }

  const secondaryColumn = document.querySelector("#secondary-inner") || document.querySelector("#secondary");
  if (!secondaryColumn) {
    return;
  }

  // Reuse existing menu if present, otherwise create and insert it.
  let menu = document.getElementById(MENU_ID);
  if (!menu) {
    menu = createSideMenu();
    secondaryColumn.prepend(menu);
  }

  // Update the video title in the menu.
  const title = menu.querySelector("h2");
  title.textContent = getVideoTitle();
}

// Schedule an update on the next animation frame for smoother DOM interaction.
function scheduleUpdate() {
  window.requestAnimationFrame(updateSideMenu);
}

// Re-run the update after navigation and fullscreen changes.
document.addEventListener("yt-navigate-finish", scheduleUpdate);
document.addEventListener("fullscreenchange", scheduleUpdate);

// Observe DOM changes that could affect YouTube page layout, especially theater mode.
new MutationObserver(scheduleUpdate).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["theater"]
});

// Initial run on script load.
scheduleUpdate();
