import { handlePossibleVideoNavigation, patchHistoryNavigation } from "./youtube/navigation";
import { scheduleUpdate } from "./youtube/sidebar";

// Re-run the update after navigation and fullscreen changes.
patchHistoryNavigation();
document.addEventListener("yt-navigate-start", handlePossibleVideoNavigation);
document.addEventListener("yt-navigate-finish", handlePossibleVideoNavigation);
document.addEventListener("yt-page-data-updated", handlePossibleVideoNavigation);
window.addEventListener("popstate", handlePossibleVideoNavigation);
document.addEventListener("fullscreenchange", scheduleUpdate);

// YouTube sometimes updates watch pages without consistently firing public SPA events.
window.setInterval(handlePossibleVideoNavigation, 1000);

// Observe DOM changes that could affect YouTube page layout, especially theater mode.
new MutationObserver(scheduleUpdate).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["theater"],
});

// Initial run on script load.
scheduleUpdate();
