const MENU_ID = "hello-world-youtube-side-menu";
const RESULT_CLASS = "hello-world-youtube-result";

// Detect whether the current page is a YouTube watch page for a video.
function isWatchPage() {
  return location.pathname === "/watch" && new URLSearchParams(location.search).has("v");
}

// Detect whether the browser is currently in fullscreen mode.
function isFullscreen() {
  return Boolean(document.fullscreenElement);
}

// Detect whether YouTube is using theater mode on the watch page.
function isTheaterMode() {
  const watchFlexy = document.querySelector("ytd-watch-flexy");
  return Boolean(watchFlexy?.hasAttribute("theater"));
}

// Read the video title from the page, with a fallback if needed.
function getVideoTitle() {
  const title = document.querySelector("ytd-watch-metadata h1 yt-formatted-string");
  return title?.textContent?.trim() || document.title.replace(/ - YouTube$/, "") || "Untitled video";
}

// Remove the custom side menu if it exists.
function removeSideMenu() {
  document.getElementById(MENU_ID)?.remove();
}

// Send a prompt through the extension service worker so the page does not need CORS access.
function processPrompt(prompt) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "PROCESS_PROMPT", prompt }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Backend request failed"));
        return;
      }

      resolve(response.data);
    });
  });
}

function setResult(menu, message, state = "") {
  const result = menu.querySelector(`.${RESULT_CLASS}`);
  result.textContent = message;
  result.dataset.state = state;
}

function formatBackendResult(data) {
  if (data?.response) {
    return data.response;
  }

  if (data?.error) {
    return [data.error, data.details].filter(Boolean).join(": ");
  }

  return JSON.stringify(data, null, 2);
}

async function handlePromptSubmit(event) {
  event.preventDefault();

  const menu = event.currentTarget.closest(`#${MENU_ID}`);
  const input = menu.querySelector("textarea");
  const button = menu.querySelector("button");
  const prompt = input.value.trim();

  if (!prompt) {
    setResult(menu, "Enter a prompt first.", "error");
    return;
  }

  button.disabled = true;
  setResult(menu, "Sending prompt...", "loading");

  try {
    const data = await processPrompt(prompt);
    const isError = Boolean(data?.error);
    setResult(menu, formatBackendResult(data), isError ? "error" : "success");
  } catch (error) {
    setResult(menu, error.message, "error");
  } finally {
    button.disabled = false;
  }
}

// Create the side menu element used on the watch page.
function createSideMenu() {
  const menu = document.createElement("aside");
  menu.id = MENU_ID;
  menu.innerHTML = `
    <p class="hello-world-youtube-label">Current video</p>
    <h2></h2>
    <div class="${RESULT_CLASS}" aria-live="polite"></div>
    <form class="hello-world-youtube-form">
      <label for="hello-world-youtube-prompt">Ask about this video</label>
      <textarea id="hello-world-youtube-prompt" rows="4" placeholder="Enter a prompt..."></textarea>
      <button type="submit">Submit</button>
    </form>
  `;
  menu.querySelector("form").addEventListener("submit", handlePromptSubmit);
  return menu;
}

// Add or update the side menu when on the watch page and not in fullscreen/theater mode.
function updateSideMenu() {
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
}

// Schedule an update on the next animation frame for smoother DOM interaction.
function scheduleUpdate() {
  window.requestAnimationFrame(updateSideMenu);
}

// Re-run the update after navigation and fullscreen changes.
document.addEventListener("yt-navigate-finish", scheduleUpdate);
document.addEventListener("fullscreenchange", scheduleUpdate);

// Observe DOM changes that could affect YouTube page layout, especially theater mode.
new MutationObserver(scheduleUpdate).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["theater"]
});

// Initial run on script load.
scheduleUpdate();
