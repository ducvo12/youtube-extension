import { CAPTION_HISTORY_LINE_COUNT, CAPTION_STATUS_CLASS, CAPTION_TEXT_CLASS, RESULT_CLASS, CAPTION_ACTION_CLASS } from "./constants";

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

export function setCaptionLines(menu, captions, activeIndex) {
  const captionText = menu?.querySelector(`.${CAPTION_TEXT_CLASS}`);
  if (!captionText) {
    return;
  }

  captionText.replaceChildren();

  if (activeIndex === -1) {
    setCaptionText(menu, "No caption at the current timestamp.");
    return;
  }

  const startIndex = Math.max(0, activeIndex - CAPTION_HISTORY_LINE_COUNT + 1);
  const visibleCaptions = captions.slice(startIndex, activeIndex + 1);

  for (const [index, caption] of visibleCaptions.entries()) {
    const line = document.createElement("span");
    const distanceFromCurrent = visibleCaptions.length - index - 1;

    line.className = "hello-world-youtube-caption-line";
    line.dataset.current = distanceFromCurrent === 0 ? "true" : "false";
    line.dataset.age = String(distanceFromCurrent);
    line.textContent = caption.text;
    captionText.append(line);
  }
}
