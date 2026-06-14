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
import {
  getTranslationMode,
  resetTranslationMode,
  saveTranslationMode,
  TRANSLATION_MODE_LABELS,
  type TranslationMode,
} from "./settings";

// Remove the custom side menu if it exists.
export function removeSideMenu() {
  document.getElementById(MENU_ID)?.remove();
}

function renderTranslationMode(menu: HTMLElement, mode: TranslationMode | null) {
  const setup = menu.querySelector<HTMLElement>(".hello-world-youtube-translation-setup");
  const main = menu.querySelector<HTMLElement>(".hello-world-youtube-main");
  const currentMode = menu.querySelector<HTMLElement>(".hello-world-youtube-current-mode");

  if (!mode) {
    setup.hidden = false;
    main.hidden = true;
    currentMode.textContent = "";
    return;
  }

  setup.hidden = true;
  main.hidden = false;
  currentMode.textContent = TRANSLATION_MODE_LABELS[mode];
}

async function loadTranslationMode(menu: HTMLElement) {
  try {
    renderTranslationMode(menu, await getTranslationMode());
  } catch (error) {
    renderTranslationMode(menu, null);
    console.warn("Unable to load translation mode", error);
  }
}

function initializeTranslationModeControls(menu: HTMLElement) {
  menu.querySelectorAll<HTMLButtonElement>("[data-translation-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      const mode = button.dataset.translationMode as TranslationMode;
      await saveTranslationMode(mode);
      renderTranslationMode(menu, mode);
    });
  });

  menu.querySelector(".hello-world-youtube-reset-storage").addEventListener("click", async () => {
    await resetTranslationMode();
    renderTranslationMode(menu, null);
  });
}

// Create the side menu element used on the watch page.
function createSideMenu() {
  const menu = document.createElement("aside");
  menu.id = MENU_ID;
  menu.innerHTML = `
    <p class="hello-world-youtube-label">Current video</p>
    <h2></h2>
    <section class="hello-world-youtube-translation-setup" hidden>
      <p class="hello-world-youtube-label">Translation setup</p>
      <p class="hello-world-youtube-helper">Choose a default translation mode to continue.</p>
      <button type="button" data-translation-mode="vi-to-en">Translate Vietnamese to English</button>
      <button type="button" data-translation-mode="en-to-vi">Translate English to Vietnamese</button>
      <button type="button" data-translation-mode="any-to-en">Other: translate any language to English</button>
    </section>
    <div class="hello-world-youtube-main" hidden>
      <section class="hello-world-youtube-mode-summary">
        <p class="hello-world-youtube-label">Current mode</p>
        <p class="hello-world-youtube-current-mode"></p>
        <button class="hello-world-youtube-reset-storage" type="button">Reset storage</button>
      </section>
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
        <label for="hello-world-youtube-prompt">Optional extra instructions</label>
        <textarea id="hello-world-youtube-prompt" rows="4" placeholder="Add extra instructions if needed..."></textarea>
        <button type="submit">Submit</button>
      </form>
    </div>
  `;
  initializeTranslationModeControls(menu);
  initializeCaptionSelection(menu);
  menu.querySelector(`.${CAPTION_ACTION_CLASS}`).addEventListener("click", handleCaptionAccessClick);
  menu.querySelector("form").addEventListener("submit", handlePromptSubmit);
  loadTranslationMode(menu);
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
