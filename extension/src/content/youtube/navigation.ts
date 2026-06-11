import { resetCaptions } from "./captions";
import { getVideoId } from "./page";
import { scheduleUpdate } from "./sidebar";

let lastSeenVideoId = getVideoId();

function scheduleDelayedUpdates() {
  scheduleUpdate();
  window.setTimeout(scheduleUpdate, 500);
  window.setTimeout(scheduleUpdate, 1500);
}

export function handlePossibleVideoNavigation() {
  const currentVideoId = getVideoId();
  if (currentVideoId === lastSeenVideoId) {
    scheduleUpdate();
    return;
  }

  lastSeenVideoId = currentVideoId;
  resetCaptions();
  scheduleDelayedUpdates();
}

export function patchHistoryNavigation() {
  for (const methodName of ["pushState", "replaceState"]) {
    const originalMethod = history[methodName];
    history[methodName] = function patchedHistoryMethod(...args) {
      const result = originalMethod.apply(this, args);
      window.setTimeout(handlePossibleVideoNavigation, 0);
      return result;
    };
  }
}
