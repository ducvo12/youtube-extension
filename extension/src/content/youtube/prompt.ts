import { processPrompt } from "./backend";
import { MENU_ID } from "./constants";
import { getSelectedCaptionText, setResult } from "./caption-ui";
import type { BackendResult } from "./types";

function formatBackendResult(data: BackendResult) {
  if (data?.response) {
    return data.response;
  }

  if (data?.error) {
    // Backend errors may include extra details; omit empty parts to avoid trailing punctuation.
    return [data.error, data.details].filter(Boolean).join(": ");
  }

  return JSON.stringify(data, null, 2);
}

export async function handlePromptSubmit(event) {
  event.preventDefault();

  const menu = event.currentTarget.closest(`#${MENU_ID}`);
  const input = menu.querySelector("textarea");
  const button = menu.querySelector("button");
  const prompt = input.value.trim();
  const highlightedText = getSelectedCaptionText(menu);

  if (!prompt) {
    setResult(menu, "Enter a prompt first.", "error");
    return;
  }

  if (!highlightedText) {
    setResult(menu, "Highlight caption text first.", "error");
    return;
  }

  button.disabled = true;
  setResult(menu, "Sending prompt...", "loading");

  try {
    const data = await processPrompt(prompt, highlightedText);
    const isError = Boolean(data?.error);
    setResult(menu, formatBackendResult(data), isError ? "error" : "success");
  } catch (error) {
    // Network, extension messaging, and backend failures all surface here as user-visible text.
    setResult(menu, error.message, "error");
  } finally {
    button.disabled = false;
  }
}
