import { handleCaptionAccessClick, loadCaptionsForCurrentVideo } from "./captions";
import {
  CAPTION_ACTION_CLASS,
  CAPTION_STATUS_CLASS,
  CAPTION_TEXT_CLASS,
  MENU_ID,
  RESULT_CLASS,
  SELECTED_CAPTION_CLASS,
  SELECTED_CAPTION_TEXT_CLASS,
} from "./constants";
import { getVideoTitle, isFullscreen, isTheaterMode, isWatchPage } from "./page";
import { handlePromptSubmit } from "./prompt";
import { initializeCaptionSelection } from "./caption-ui";

// Remove the custom side menu if it exists.
export function removeSideMenu() {
  document.getElementById(MENU_ID)?.remove();
}

// Create the side menu element used on the watch page.
function createSideMenu() {
  const menu = document.createElement("aside");
  menu.id = MENU_ID;
  menu.innerHTML = `
    <p class="hello-world-youtube-label">Current video</p>
    <h2></h2>
    <section class="hello-world-youtube-captions" aria-live="polite">
      <p class="hello-world-youtube-label">Current caption</p>
      <p class="${CAPTION_TEXT_CLASS}"></p>
      <div class="${SELECTED_CAPTION_CLASS}" hidden>
        <p class="hello-world-youtube-label">Selected caption</p>
        <p class="${SELECTED_CAPTION_TEXT_CLASS}"></p>
      </div>
      <p class="${CAPTION_STATUS_CLASS}">Looking for captions...</p>
      <button class="${CAPTION_ACTION_CLASS}" type="button" hidden>Enable caption access</button>
    </section>
    <div class="${RESULT_CLASS}" aria-live="polite"></div>
    <form class="hello-world-youtube-form">
      <label for="hello-world-youtube-prompt">Ask about this video</label>
      <textarea id="hello-world-youtube-prompt" rows="4" placeholder="Enter a prompt..."></textarea>
      <button type="submit">Submit</button>
    </form>
  `;
  initializeCaptionSelection(menu);
  menu.querySelector(`.${CAPTION_ACTION_CLASS}`).addEventListener("click", handleCaptionAccessClick);
  menu.querySelector("form").addEventListener("submit", handlePromptSubmit);
  return menu;
}

// Add or update the side menu when on the watch page and not in fullscreen/theater mode.
export function updateSideMenu() {
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

  loadCaptionsForCurrentVideo(menu);
}

// Schedule an update on the next animation frame for smoother DOM interaction.
export function scheduleUpdate() {
  window.requestAnimationFrame(updateSideMenu);
}
