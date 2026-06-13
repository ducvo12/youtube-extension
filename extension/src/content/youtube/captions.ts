import { MENU_ID } from "./constants";
import { WORD_CAPTION_HISTORY_LINE_COUNT, WORD_CAPTION_LINE_CHARACTER_COUNT } from "./constants";
import { setCaptionActionVisible, setCaptionRows, setCaptionStatus, setCaptionText } from "./caption-ui";
import { getVideoId } from "./page";

let captionRetryTimeout: number | null = null;
let renderedCaptionObserver: MutationObserver | null = null;
let observedVideoId: string | null = null;
let renderedCaptionText = "";
let committedCaptionRows: string[] = [];
let currentCaptionRow = "";

function clearCaptionRetry() {
  if (captionRetryTimeout) {
    window.clearTimeout(captionRetryTimeout);
    captionRetryTimeout = null;
  }
}

function scheduleCaptionRetry(menu: Element, delayMs = 1000) {
  if (captionRetryTimeout) {
    return;
  }

  captionRetryTimeout = window.setTimeout(() => {
    captionRetryTimeout = null;
    loadCaptionsForCurrentVideo(menu);
  }, delayMs);
}

function resetLiveCaptionState() {
  renderedCaptionText = "";
  committedCaptionRows = [];
  currentCaptionRow = "";
}

export function resetCaptions() {
  clearCaptionRetry();
  renderedCaptionObserver?.disconnect();
  renderedCaptionObserver = null;
  observedVideoId = null;
  resetLiveCaptionState();
}

function getCaptionToggleButton() {
  return document.querySelector("button.ytp-subtitles-button") || document.querySelector(".ytp-subtitles-button") || document.querySelector("button[aria-keyshortcuts='c']");
}

function areYouTubeCaptionsEnabled() {
  return getCaptionToggleButton()?.getAttribute("aria-pressed") === "true";
}

function showPlayerControls() {
  const player = document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
  const video = document.querySelector("video");
  const target = player || video;

  if (!target) {
    return;
  }

  for (const eventName of ["mouseover", "mousemove"]) {
    target.dispatchEvent(
      new MouseEvent(eventName, {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
  }
}

function clickCaptionButton(button: Element) {
  showPlayerControls();

  for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    button.dispatchEvent(
      new MouseEvent(eventName, {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
  }
}

function normalizeCaptionText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeWord(word: string) {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function getRenderedCaptionContainer() {
  return document.querySelector(".ytp-caption-window-container");
}

function getRenderedCaptionText() {
  const container = getRenderedCaptionContainer();
  if (!container) {
    return "";
  }

  const segments = Array.from(container.querySelectorAll(".ytp-caption-segment"));
  return normalizeCaptionText(segments.map((segment) => segment.textContent || "").join(" "));
}

function isYouTubeCaptionControlText(text: string) {
  const normalizedText = text.toLowerCase();

  return (
    normalizedText.includes("click for settings") ||
    normalizedText.includes("auto-generated") ||
    normalizedText.includes("subtitles/closed captions")
  );
}

function getNewRenderedWords(previousText: string, nextText: string) {
  if (!nextText || nextText === previousText) {
    return [];
  }

  if (previousText && nextText.startsWith(previousText)) {
    return normalizeCaptionText(nextText.slice(previousText.length)).split(" ").filter(Boolean);
  }

  const previousWords = previousText.split(" ").filter(Boolean);
  const nextWords = nextText.split(" ").filter(Boolean);
  const maxOverlap = Math.min(previousWords.length, nextWords.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const previousSuffix = previousWords.slice(previousWords.length - overlap).map(normalizeWord);
    const nextPrefix = nextWords.slice(0, overlap).map(normalizeWord);
    if (previousSuffix.every((word, index) => word && word === nextPrefix[index])) {
      return nextWords.slice(overlap);
    }
  }

  return nextWords;
}

function appendWordToCaptionRows(word: string) {
  const currentWithWord = currentCaptionRow ? `${currentCaptionRow} ${word}` : word;
  if (currentWithWord.length <= WORD_CAPTION_LINE_CHARACTER_COUNT) {
    currentCaptionRow = currentWithWord;
    return;
  }

  if (currentCaptionRow) {
    committedCaptionRows.push(currentCaptionRow);
  }

  currentCaptionRow = word;
  committedCaptionRows = committedCaptionRows.slice(-40);
}

function getVisibleCaptionRows() {
  const rows = currentCaptionRow ? [...committedCaptionRows, currentCaptionRow] : [...committedCaptionRows];
  return rows.slice(-WORD_CAPTION_HISTORY_LINE_COUNT);
}

function appendRenderedWords(menu: Element) {
  const nextText = getRenderedCaptionText();
  if (!nextText || isYouTubeCaptionControlText(nextText)) {
    renderedCaptionText = "";
    return;
  }

  const newWords = getNewRenderedWords(renderedCaptionText, nextText);
  renderedCaptionText = nextText;

  if (!newWords.length) {
    return;
  }

  for (const word of newWords) {
    appendWordToCaptionRows(word);
  }

  setCaptionRows(menu, getVisibleCaptionRows());
  setCaptionStatus(menu, "Reading YouTube's rendered captions.");
}

function observeRenderedCaptions(menu: Element) {
  renderedCaptionObserver?.disconnect();

  const target = getRenderedCaptionContainer() || document.querySelector("#movie_player");
  if (!target) {
    setCaptionStatus(menu, "Waiting for the YouTube player caption layer...");
    scheduleCaptionRetry(menu);
    return;
  }

  renderedCaptionObserver = new MutationObserver(() => appendRenderedWords(menu));
  renderedCaptionObserver.observe(target, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  appendRenderedWords(menu);
}

export async function handleCaptionAccessClick(event: Event) {
  const action = event.currentTarget as HTMLButtonElement;
  const menu = action.closest(`#${MENU_ID}`);
  const button = getCaptionToggleButton();

  if (!menu || !button) {
    return;
  }

  action.disabled = true;
  setCaptionStatus(menu, "Enabling YouTube captions...");
  clickCaptionButton(button);

  window.setTimeout(() => {
    action.disabled = false;
    loadCaptionsForCurrentVideo(menu);
  }, 500);
}

export function loadCaptionsForCurrentVideo(menu: Element) {
  const videoId = getVideoId();
  if (!videoId) {
    return;
  }

  if (observedVideoId !== videoId) {
    resetCaptions();
    observedVideoId = videoId;
    setCaptionText(menu, "");
  }

  if (!areYouTubeCaptionsEnabled()) {
    renderedCaptionObserver?.disconnect();
    renderedCaptionObserver = null;
    resetLiveCaptionState();
    setCaptionText(menu, "");
    setCaptionStatus(menu, "Enable YouTube captions to use the live caption river.");
    setCaptionActionVisible(menu, true);
    scheduleCaptionRetry(menu, 1500);
    return;
  }

  clearCaptionRetry();
  setCaptionActionVisible(menu, false);
  setCaptionStatus(menu, "Waiting for YouTube's rendered captions...");
  observeRenderedCaptions(menu);
}
