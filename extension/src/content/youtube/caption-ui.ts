import {
  CAPTION_HISTORY_LINE_COUNT,
  CAPTION_STATUS_CLASS,
  CAPTION_TEXT_CLASS,
  RESULT_CLASS,
  CAPTION_ACTION_CLASS,
  WORD_CAPTION_HISTORY_LINE_COUNT,
  WORD_CAPTION_LINE_CHARACTER_COUNT,
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

function getWordCaptionRows(captions, activeIndex) {
  const rows = [""];
  const firstIndex = Math.max(0, activeIndex - 120);

  for (const caption of captions.slice(firstIndex, activeIndex + 1)) {
    const word = caption.text.trim();
    const currentRow = rows[rows.length - 1];
    if (!word) {
      continue;
    }

    if (!currentRow) {
      rows[rows.length - 1] = word;
      continue;
    }

    if (`${currentRow} ${word}`.length <= WORD_CAPTION_LINE_CHARACTER_COUNT) {
      rows[rows.length - 1] = `${currentRow} ${word}`;
      continue;
    }

    rows.push(word);
  }

  return rows.slice(-WORD_CAPTION_HISTORY_LINE_COUNT);
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

export function setCaptionLines(menu, captions, activeIndex) {
  const captionText = menu?.querySelector(`.${CAPTION_TEXT_CLASS}`);
  if (!captionText) {
    return;
  }

  if (activeIndex === -1) {
    return;
  }

  captionText.replaceChildren();

  if (captions[activeIndex]?.isWord) {
    captionText.dataset.mode = "word";
    const visibleRows = getWordCaptionRows(captions, activeIndex);
    for (const [index, row] of visibleRows.entries()) {
      appendCaptionLine(captionText, row, index, visibleRows.length);
    }
    return;
  }

  captionText.dataset.mode = "caption";

  const historyLineCount = captions[activeIndex]?.isWord ? WORD_CAPTION_HISTORY_LINE_COUNT : CAPTION_HISTORY_LINE_COUNT;
  const startIndex = Math.max(0, activeIndex - historyLineCount + 1);
  const visibleCaptions = captions.slice(startIndex, activeIndex + 1);

  for (const [index, caption] of visibleCaptions.entries()) {
    appendCaptionLine(captionText, caption.text, index, visibleCaptions.length);
  }
}
