const MENU_ID = "hello-world-youtube-side-menu";

function isWatchPage() {
  return location.pathname === "/watch" && new URLSearchParams(location.search).has("v");
}

function isFullscreen() {
  return Boolean(document.fullscreenElement);
}

function isTheaterMode() {
  const watchFlexy = document.querySelector("ytd-watch-flexy");
  return Boolean(watchFlexy?.hasAttribute("theater"));
}

function getVideoTitle() {
  const title = document.querySelector("ytd-watch-metadata h1 yt-formatted-string");
  return title?.textContent?.trim() || document.title.replace(/ - YouTube$/, "") || "Untitled video";
}

function removeSideMenu() {
  document.getElementById(MENU_ID)?.remove();
}

function createSideMenu() {
  const menu = document.createElement("aside");
  menu.id = MENU_ID;
  menu.innerHTML = `
    <p class="hello-world-youtube-label">Current video</p>
    <h2></h2>
  `;
  return menu;
}

function updateSideMenu() {
  if (!isWatchPage() || isFullscreen() || isTheaterMode()) {
    removeSideMenu();
    return;
  }

  const secondaryColumn = document.querySelector("#secondary-inner") || document.querySelector("#secondary");
  if (!secondaryColumn) {
    return;
  }

  let menu = document.getElementById(MENU_ID);
  if (!menu) {
    menu = createSideMenu();
    secondaryColumn.prepend(menu);
  }

  const title = menu.querySelector("h2");
  title.textContent = getVideoTitle();
}

function scheduleUpdate() {
  window.requestAnimationFrame(updateSideMenu);
}

document.addEventListener("yt-navigate-finish", scheduleUpdate);
document.addEventListener("fullscreenchange", scheduleUpdate);

new MutationObserver(scheduleUpdate).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["theater"]
});

scheduleUpdate();
