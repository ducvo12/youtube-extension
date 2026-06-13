const BACKEND_PROCESS_URL = "http://localhost:8000/process";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "PROCESS_PROMPT") {
    return false;
  }

  fetch(BACKEND_PROCESS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
      body: JSON.stringify({
        prompt: message.prompt,
        highlighted_text: message.highlightedText,
      })
  })
    .then(async (response) => {
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.detail || `Backend request failed with status ${response.status}`);
      }

      return data;
    })
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
