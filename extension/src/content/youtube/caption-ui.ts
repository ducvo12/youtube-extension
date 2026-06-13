import {
  CAPTION_STATUS_CLASS,
  CAPTION_TEXT_CLASS,
  RESULT_CLASS,
  CAPTION_ACTION_CLASS,
  SELECTED_CAPTION_CLASS,
  SELECTED_CAPTION_TEXT_CLASS,
} from "./constants";

export function setResult(menu, message, state = "") {
  const result = menu.querySelector(`.${RESULT_CLASS}`);
  result.textContent = message;
  result.dataset.state = state;
}

export function setCaptionStatus(menu, message) {
  const status = menu?.querySelector(`.${CAPTION_STATUS_CLASS}`);
  if (status) {
    status.textContent = message;
  }
}

export function setCaptionText(menu, message) {
  const captionText = menu?.querySelector(`.${CAPTION_TEXT_CLASS}`);
  if (captionText) {
    captionText.textContent = message;
  }
}

export function setCaptionActionVisible(menu, isVisible) {
  const action = menu?.querySelector(`.${CAPTION_ACTION_CLASS}`);
  if (action) {
    action.hidden = !isVisible;
  }
}

function getSelectionTextInside(captionText: Element) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    return "";
  }

  const range = selection.getRangeAt(0);
  const selectedText = selection.toString().replace(/\s+/g, " ").trim();
  if (!selectedText || !captionText.contains(range.commonAncestorContainer)) {
    return "";
  }

  return selectedText;
}

function setSelectedCaptionText(menu: Element, text: string) {
  const selectedCaption = menu.querySelector(`.${SELECTED_CAPTION_CLASS}`) as HTMLElement | null;
  const selectedCaptionText = menu.querySelector(`.${SELECTED_CAPTION_TEXT_CLASS}`);
  const captionText = menu.querySelector(`.${CAPTION_TEXT_CLASS}`) as HTMLElement | null;

  if (!selectedCaption || !selectedCaptionText || !captionText) {
    return;
  }

  captionText.dataset.selectedText = text;
  selectedCaptionText.textContent = text;
  selectedCaption.hidden = !text;
}

export function getSelectedCaptionText(menu: Element) {
  const captionText = menu.querySelector(`.${CAPTION_TEXT_CLASS}`) as HTMLElement | null;
  if (!captionText) {
    return "";
  }

  return captionText.dataset.selectedText?.trim() || getSelectionTextInside(captionText);
}

export function initializeCaptionSelection(menu: Element) {
  const captionText = menu.querySelector(`.${CAPTION_TEXT_CLASS}`);
  if (!captionText) {
    return;
  }

  const captureSelection = () => {
    const selectedText = getSelectionTextInside(captionText);
    if (selectedText) {
      setSelectedCaptionText(menu, selectedText);
    }
  };

  captionText.addEventListener("mouseup", () => window.setTimeout(captureSelection));
  captionText.addEventListener("touchend", () => window.setTimeout(captureSelection));
  captionText.addEventListener("keyup", captureSelection);
}

function appendCaptionLine(captionText, text, index, visibleCount) {
  const line = document.createElement("span");
  const distanceFromCurrent = visibleCount - index - 1;

  line.className = "hello-world-youtube-caption-line";
  line.dataset.current = distanceFromCurrent === 0 ? "true" : "false";
  line.dataset.bottom = index === visibleCount - 1 ? "true" : "false";
  line.dataset.age = String(distanceFromCurrent);
  line.textContent = text;
  captionText.append(line);
}

export function setCaptionRows(menu, rows) {
  const captionText = menu?.querySelector(`.${CAPTION_TEXT_CLASS}`);
  if (!captionText) {
    return;
  }

  captionText.replaceChildren();
  captionText.dataset.mode = "word";

  for (const [index, row] of rows.entries()) {
    appendCaptionLine(captionText, row, index, rows.length);
  }
}
