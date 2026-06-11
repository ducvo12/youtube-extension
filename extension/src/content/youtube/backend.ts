import type { BackendResult } from "./types";

// Send a prompt through the extension service worker so the page does not need CORS access.
export function processPrompt(prompt: string): Promise<BackendResult> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "PROCESS_PROMPT", prompt }, (response) => {
      // Chrome reports messaging failures through chrome.runtime.lastError instead of throwing.
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      // The service worker wraps backend responses in an { ok, data/error } envelope.
      if (!response?.ok) {
        reject(new Error(response?.error || "Backend request failed"));
        return;
      }

      resolve(response.data);
    });
  });
}
