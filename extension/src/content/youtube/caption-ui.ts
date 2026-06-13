import {
  CAPTION_STATUS_CLASS,
  CAPTION_TEXT_CLASS,
  RESULT_CLASS,
  CAPTION_ACTION_CLASS,
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
