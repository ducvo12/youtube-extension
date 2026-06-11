// Detect whether the current page is a YouTube watch page for a video.
export function isWatchPage() {
  return location.pathname === "/watch" && new URLSearchParams(location.search).has("v");
}

// Detect whether the browser is currently in fullscreen mode.
export function isFullscreen() {
  return Boolean(document.fullscreenElement);
}

// Detect whether YouTube is using theater mode on the watch page.
export function isTheaterMode() {
  const watchFlexy = document.querySelector("ytd-watch-flexy");
  return Boolean(watchFlexy?.hasAttribute("theater"));
}

// Read the video title from the page, with a fallback if needed.
export function getVideoTitle() {
  const title = document.querySelector("ytd-watch-metadata h1 yt-formatted-string");
  return title?.textContent?.trim() || document.title.replace(/ - YouTube$/, "") || "Untitled video";
}

// Read the video ID from the URL so caption state can reset on YouTube SPA navigation.
export function getVideoId() {
  return new URLSearchParams(location.search).get("v");
}
