const MENU_ID = "hello-world-youtube-side-menu";
const RESULT_CLASS = "hello-world-youtube-result";
const CAPTION_TEXT_CLASS = "hello-world-youtube-caption-text";
const CAPTION_STATUS_CLASS = "hello-world-youtube-caption-status";
const CAPTION_ACTION_CLASS = "hello-world-youtube-caption-action";
const CAPTION_SYNC_OFFSET_SECONDS = 2;
const CAPTION_HISTORY_LINE_COUNT = 4;
const DEBUG_CAPTIONS = false;

let loggedPlayerScriptIndexes = new Set();
let lastLoadDebugKey = "";
let cachedCaptionRequestHints = null;
let captionRetryTimeout = null;
let lastSeenVideoId = getVideoId();
let captionAccessApproved = false;

// Shared caption state for the currently loaded YouTube watch page.
let captionState = {
  videoId: null,
  loadingVideoId: null,
  captions: [],
  activeIndex: -1,
  video: null
};

function debugLog(message, data) {
  if (!DEBUG_CAPTIONS) {
    return;
  }

  if (data === undefined) {
    console.log(`[YouTube Sidebar Captions] ${message}`);
    return;
  }

  console.log(`[YouTube Sidebar Captions] ${message}`, data);
}

// Page and layout detection.

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

// Read the video ID from the URL so caption state can reset on YouTube SPA navigation.
function getVideoId() {
  return new URLSearchParams(location.search).get("v");
}

function scheduleDelayedUpdates() {
  scheduleUpdate();
  window.setTimeout(scheduleUpdate, 500);
  window.setTimeout(scheduleUpdate, 1500);
}

function handlePossibleVideoNavigation() {
  const currentVideoId = getVideoId();
  if (currentVideoId === lastSeenVideoId) {
    scheduleUpdate();
    return;
  }

  lastSeenVideoId = currentVideoId;
  resetCaptions();
  scheduleDelayedUpdates();
}

function patchHistoryNavigation() {
  for (const methodName of ["pushState", "replaceState"]) {
    const originalMethod = history[methodName];
    history[methodName] = function patchedHistoryMethod(...args) {
      const result = originalMethod.apply(this, args);
      window.setTimeout(handlePossibleVideoNavigation, 0);
      return result;
    };
  }
}

// Remove the custom side menu if it exists.
function removeSideMenu() {
  document.getElementById(MENU_ID)?.remove();
}

// Backend prompt handling.

// Send a prompt through the extension service worker so the page does not need CORS access.
function processPrompt(prompt) {
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

// Sidebar text updates.

function setResult(menu, message, state = "") {
  const result = menu.querySelector(`.${RESULT_CLASS}`);
  result.textContent = message;
  result.dataset.state = state;
}

function setCaptionStatus(menu, message) {
  const status = menu?.querySelector(`.${CAPTION_STATUS_CLASS}`);
  if (status) {
    status.textContent = message;
  }
}

function setCaptionText(menu, message) {
  const captionText = menu?.querySelector(`.${CAPTION_TEXT_CLASS}`);
  if (captionText) {
    captionText.textContent = message;
  }
}

function setCaptionActionVisible(menu, isVisible) {
  const action = menu?.querySelector(`.${CAPTION_ACTION_CLASS}`);
  if (action) {
    action.hidden = !isVisible;
  }
}

function setCaptionLines(menu, captions, activeIndex) {
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

// Caption loading and parsing.

function resetCaptions() {
  if (captionRetryTimeout) {
    window.clearTimeout(captionRetryTimeout);
    captionRetryTimeout = null;
  }

  if (captionState.video) {
    captionState.video.removeEventListener("timeupdate", updateCurrentCaption);
  }

  captionState = {
    videoId: null,
    loadingVideoId: null,
    captions: [],
    activeIndex: -1,
    video: null
  };
  loggedPlayerScriptIndexes = new Set();
  lastLoadDebugKey = "";
  cachedCaptionRequestHints = null;
}

function isAdPlaying() {
  const moviePlayer = document.querySelector("#movie_player");
  return Boolean(moviePlayer?.classList.contains("ad-showing") || moviePlayer?.classList.contains("ad-interrupting"));
}

function scheduleCaptionRetry(menu, delayMs = 3000) {
  if (captionRetryTimeout) {
    return;
  }

  captionRetryTimeout = window.setTimeout(() => {
    captionRetryTimeout = null;
    loadCaptionsForCurrentVideo(menu);
  }, delayMs);
}

// Pull the first complete JSON object out of a script tag, starting near a known marker.
// This avoids depending on an exact assignment format for ytInitialPlayerResponse.
function extractJsonObject(text, startIndex) {
  const firstBrace = text.indexOf("{", startIndex);
  if (firstBrace === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = firstBrace; index < text.length; index += 1) {
    const char = text[index];

    // Ignore braces inside quoted JSON strings so nested text does not break depth counting.
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(firstBrace, index + 1);
      }
    }
  }

  return null;
}

function getPlayerResponse() {
  const watchFlexy = document.querySelector("ytd-watch-flexy[player-response]");
  const playerResponse = watchFlexy?.getAttribute("player-response");
  if (playerResponse) {
    try {
      debugLog("Player response source", "watch-flexy attribute");
      return JSON.parse(playerResponse);
    } catch (error) {
      debugLog("Failed to parse watch-flexy player-response attribute", error.message);
      // YouTube sometimes mutates this attribute while loading; script parsing is a fallback.
    }
  }

  for (const [scriptIndex, script] of Array.from(document.scripts).entries()) {
    const text = script.textContent || "";
    const markerIndex = text.indexOf("ytInitialPlayerResponse");
    if (markerIndex === -1) {
      continue;
    }

    if (!loggedPlayerScriptIndexes.has(scriptIndex)) {
      loggedPlayerScriptIndexes.add(scriptIndex);
      debugLog("Found script containing ytInitialPlayerResponse", {
        scriptIndex,
        length: text.length
      });
    }

    const jsonText = extractJsonObject(text, markerIndex);
    if (!jsonText) {
      debugLog(`Could not extract JSON object from player response script ${scriptIndex}`);
      continue;
    }

    try {
      debugLog("Player response source", `script ${scriptIndex}`);
      return JSON.parse(jsonText);
    } catch (error) {
      debugLog(`Failed to parse extracted player response JSON from script ${scriptIndex}`, error.message);
      // Keep looking in case another script contains a complete player response object.
    }
  }

  return null;
}

function summarizeCaptionTrack(track) {
  return {
    label: getCaptionTrackLabel(track),
    languageCode: track.languageCode,
    kind: track.kind,
    vssId: track.vssId,
    isTranslatable: track.isTranslatable,
    hasBaseUrl: Boolean(track.baseUrl),
    baseUrl: track.baseUrl
  };
}

function chooseCaptionTrack(tracks) {
  debugLog("Available caption tracks", tracks?.map(summarizeCaptionTrack) || []);

  if (!tracks?.length) {
    return null;
  }

  // Prefer high-quality English/manual captions, then any manual captions, then auto captions.
  const selectedTrack =
    tracks.find((track) => track.languageCode?.startsWith("en") && track.kind !== "asr") ||
    tracks.find((track) => track.kind !== "asr") ||
    tracks.find((track) => track.languageCode?.startsWith("en")) ||
    tracks[0];

  debugLog("Selected caption track", summarizeCaptionTrack(selectedTrack));
  return selectedTrack;
}

function getCaptionTrackLabel(track) {
  return track.name?.simpleText || track.languageCode || "selected track";
}

function getBrowserBrand() {
  return navigator.userAgentData?.brands?.find((brand) => brand.brand !== "Not A(Brand")?.brand || "Chrome";
}

function getBrowserVersion() {
  const userAgentVersion = navigator.userAgent.match(/(?:Chrome|CriOS)\/(\d+\.\d+\.\d+\.\d+)/);
  return userAgentVersion?.[1] || navigator.userAgentData?.brands?.[0]?.version || "";
}

function getOperatingSystem() {
  if (navigator.platform.includes("Mac")) {
    return "Macintosh";
  }

  if (navigator.platform.includes("Win")) {
    return "Windows";
  }

  if (navigator.platform.includes("Linux")) {
    return "Linux";
  }

  return navigator.platform || "";
}

function getOperatingSystemVersion() {
  const macVersion = navigator.userAgent.match(/Mac OS X ([\d_]+)/)?.[1];
  const windowsVersion = navigator.userAgent.match(/Windows NT ([\d.]+)/)?.[1];
  return macVersion || windowsVersion || "";
}

function getInnertubeClientVersion() {
  for (const script of document.scripts) {
    const text = script.textContent || "";
    const clientVersion = text.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1];
    if (clientVersion) {
      return clientVersion;
    }
  }

  return "";
}

function getDefaultCaptionClientParams() {
  const params = {
    xorb: "2",
    xobt: "3",
    xovt: "3",
    cbrand: getBrowserBrand(),
    cbr: "Chrome",
    cbrver: getBrowserVersion(),
    c: "WEB",
    cver: getInnertubeClientVersion(),
    cplayer: "UNIPLAYER",
    cos: getOperatingSystem(),
    cosver: getOperatingSystemVersion(),
    cplatform: "DESKTOP"
  };

  return Object.fromEntries(Object.entries(params).filter(([, value]) => value));
}

function extractPoTokensFromScripts() {
  const tokens = new Set();
  const patterns = [
    /"poToken"\s*:\s*"([^"]+)"/g,
    /"pot"\s*:\s*"([^"]+)"/g,
    /"playerAttestationRenderer"[\s\S]{0,2000}?"challenge"\s*:\s*"([^"]+)"/g
  ];

  for (const script of document.scripts) {
    const text = script.textContent || "";
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        tokens.add(match[1].replace(/\\u0026/g, "&"));
      }
    }
  }

  return Array.from(tokens);
}

function getTimedTextResourceHints(videoId) {
  return performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/api/timedtext"))
    .map((entry) => {
      try {
        return {
          startTime: entry.startTime,
          url: new URL(entry.name)
        };
      } catch {
        return null;
      }
    })
    .filter((entry) => entry?.url.searchParams.get("v") === videoId)
    .sort((left, right) => right.startTime - left.startTime);
}

function getObservedTimedTextUrl(videoId) {
  return getTimedTextResourceHints(videoId).find((entry) => entry.url.searchParams.has("pot"))?.url || null;
}

function createTrackFromObservedTimedTextUrl(url) {
  return {
    baseUrl: url.toString(),
    name: {
      simpleText: url.searchParams.get("lang") || "observed YouTube captions"
    },
    languageCode: url.searchParams.get("lang") || "",
    kind: url.searchParams.get("kind") || "",
    vssId: "",
    isTranslatable: false,
    trackName: ""
  };
}

function getCaptionToggleButton() {
  return document.querySelector("button.ytp-subtitles-button") || document.querySelector(".ytp-subtitles-button") || document.querySelector("button[aria-keyshortcuts='c']");
}

function areYouTubeCaptionsEnabled(button) {
  return button?.getAttribute("aria-pressed") === "true";
}

function isCaptionButtonReady(button) {
  return Boolean(button && !button.disabled && button.getAttribute("aria-disabled") !== "true");
}

function isPlayerReadyForCaptions() {
  const video = document.querySelector("video");
  const moviePlayer = document.querySelector("#movie_player");

  return Boolean(
    video &&
    moviePlayer &&
    video.currentSrc &&
    video.readyState >= HTMLMediaElement.HAVE_METADATA &&
    !moviePlayer.classList.contains("unstarted-mode") &&
    !isAdPlaying()
  );
}

function waitForObservedTimedTextUrl(videoId, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();

    function check() {
      const observedUrl = getObservedTimedTextUrl(videoId);
      if (observedUrl || Date.now() - startedAt >= timeoutMs) {
        resolve(observedUrl);
        return;
      }

      window.setTimeout(check, 150);
    }

    check();
  });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function showPlayerControls() {
  const player = document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
  const video = document.querySelector("video");
  const target = player || video;

  if (!target) {
    return;
  }

  for (const eventName of ["mouseover", "mousemove"]) {
    target.dispatchEvent(new MouseEvent(eventName, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }
}

function clickCaptionButton(button) {
  showPlayerControls();

  button.focus();

  for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    button.dispatchEvent(new MouseEvent(eventName, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }

  button.click();
}

async function waitForCaptionToggleButton(timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    showPlayerControls();

    const button = getCaptionToggleButton();
    if (isCaptionButtonReady(button)) {
      return button;
    }

    await wait(150);
  }

  return null;
}

async function waitForPlayerReadyForCaptions(timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (isPlayerReadyForCaptions()) {
      return true;
    }

    await wait(200);
  }

  return false;
}

async function enableYouTubeCaptions(button) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (areYouTubeCaptionsEnabled(button)) {
      return true;
    }

    clickCaptionButton(button);
    await wait(350);
  }

  return areYouTubeCaptionsEnabled(button);
}

async function refreshEnabledYouTubeCaptions(button) {
  if (areYouTubeCaptionsEnabled(button)) {
    clickCaptionButton(button);
    await wait(250);
  }

  return enableYouTubeCaptions(button);
}

async function observeYouTubeCaptionRequest(menu, { userInitiated = false } = {}) {
  const videoId = getVideoId();
  const existingObservedUrl = videoId ? getObservedTimedTextUrl(videoId) : null;
  if (!videoId || existingObservedUrl) {
    return existingObservedUrl;
  }

  if (!(await waitForPlayerReadyForCaptions())) {
    setCaptionStatus(menu, "Waiting for the YouTube player before loading captions...");
    return null;
  }

  const captionButton = await waitForCaptionToggleButton();
  if (!captionButton) {
    setCaptionStatus(menu, "Caption stage: could not find YouTube's CC button.");
    return null;
  }

  const captionsWereEnabled = areYouTubeCaptionsEnabled(captionButton);
  setCaptionStatus(menu, "Caption stage: asking YouTube to generate its caption request...");

  if (userInitiated && !captionsWereEnabled) {
    await enableYouTubeCaptions(captionButton);
  }

  let observedUrl = await waitForObservedTimedTextUrl(videoId, captionsWereEnabled ? 2500 : 10000);

  if (userInitiated && !observedUrl && areYouTubeCaptionsEnabled(captionButton)) {
    setCaptionStatus(menu, "Caption stage: refreshing YouTube captions...");
    await refreshEnabledYouTubeCaptions(captionButton);
    observedUrl = await waitForObservedTimedTextUrl(videoId, 10000);
  }

  if (observedUrl) {
    setCaptionStatus(menu, "Caption stage: captured YouTube's caption request.");
  }

  return observedUrl;
}

async function handleCaptionAccessClick(event) {
  const action = event.currentTarget;
  const menu = action.closest(`#${MENU_ID}`);

  action.disabled = true;
  captionAccessApproved = true;
  setCaptionActionVisible(menu, false);
  setCaptionStatus(menu, "Requesting caption access from YouTube for this session...");

  const observedUrl = await observeYouTubeCaptionRequest(menu, { userInitiated: true });
  if (!observedUrl) {
    setCaptionStatus(menu, "YouTube did not expose captions yet. The extension will retry while this video plays.");
    setCaptionActionVisible(menu, true);
    action.disabled = false;
    scheduleCaptionRetry(menu);
    return;
  }

  resetCaptions();
  action.disabled = false;
  loadCaptionsForCurrentVideo(menu);
}

function getCaptionRequestHints(track) {
  const videoId = getVideoId();
  const timedTextResources = getTimedTextResourceHints(videoId);
  const latestTimedTextResource = timedTextResources.find((entry) => entry.url.searchParams.has("pot"))?.url || timedTextResources[0]?.url || null;
  const poTokens = extractPoTokensFromScripts();
  const params = getDefaultCaptionClientParams();

  if (latestTimedTextResource) {
    for (const key of ["potc", "pot", "xorb", "xobt", "xovt", "cbrand", "cbr", "cbrver", "c", "cver", "cplayer", "cos", "cosver", "cplatform"]) {
      const value = latestTimedTextResource.searchParams.get(key);
      if (value) {
        params[key] = value;
      }
    }
  }

  if (!params.pot && poTokens.length) {
    params.potc = "1";
    params.pot = poTokens[0];
  }

  cachedCaptionRequestHints = {
    selectedTrack: summarizeCaptionTrack(track),
    latestTimedTextUrl: latestTimedTextResource?.toString() || null,
    timedTextResourceUrls: timedTextResources.map((entry) => entry.url.toString()),
    poTokens,
    params
  };

  debugLog("Caption request hints", cachedCaptionRequestHints);
  return params;
}

function applyCaptionRequestHints(url, hints) {
  for (const [key, value] of Object.entries(hints)) {
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }
}

function parseCaptionEvents(data) {
  return (data.events || [])
    .map((event) => {
      // json3 captions split one visible caption into small text segments.
      const text = (event.segs || [])
        .map((segment) => segment.utf8 || "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();

      if (!text || typeof event.tStartMs !== "number") {
        return null;
      }

      // YouTube timing is in milliseconds; the HTML video clock uses seconds.
      const start = event.tStartMs / 1000;
      const duration = (event.dDurationMs || 2500) / 1000;
      return {
        start,
        end: start + duration,
        text
      };
    })
    .filter(Boolean);
}

function parseTimeToSeconds(time) {
  const parts = time.split(":").map(Number);
  if (parts.some(Number.isNaN)) {
    return null;
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return parts[0];
}

function normalizeCaptionText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function parseXmlCaptionEvents(rawCaptionData) {
  const documentXml = new DOMParser().parseFromString(rawCaptionData, "text/xml");
  if (documentXml.querySelector("parsererror")) {
    throw new Error("XML parser rejected the caption response.");
  }

  const legacyTextCaptions = Array.from(documentXml.querySelectorAll("text"));
  if (legacyTextCaptions.length) {
    return legacyTextCaptions
      .map((caption) => {
        const start = Number(caption.getAttribute("start"));
        const duration = Number(caption.getAttribute("dur") || 2.5);
        const text = normalizeCaptionText(caption.textContent || "");

        if (!text || Number.isNaN(start)) {
          return null;
        }

        return {
          start,
          end: start + duration,
          text
        };
      })
      .filter(Boolean);
  }

  // srv3 captions use millisecond timing on <p> nodes instead of second timing on <text> nodes.
  return Array.from(documentXml.querySelectorAll("p"))
    .map((caption) => {
      const start = Number(caption.getAttribute("t")) / 1000;
      const duration = Number(caption.getAttribute("d") || 2500) / 1000;
      const text = normalizeCaptionText(caption.textContent || "");

      if (!text || Number.isNaN(start)) {
        return null;
      }

      return {
        start,
        end: start + duration,
        text
      };
    })
    .filter(Boolean);
}

function parseVttCaptionEvents(rawCaptionData) {
  const captions = [];
  const blocks = rawCaptionData.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const timingLine = lines.find((line) => line.includes("-->"));
    if (!timingLine) {
      continue;
    }

    const [startText, endText] = timingLine.split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const start = parseTimeToSeconds(startText.replace(",", "."));
    const end = parseTimeToSeconds(endText.replace(",", "."));
    const text = normalizeCaptionText(lines.slice(lines.indexOf(timingLine) + 1).join(" "));

    if (!text || start === null || end === null) {
      continue;
    }

    captions.push({ start, end, text });
  }

  return captions;
}

function getVisibleTranscriptCaptions() {
  const segments = Array.from(document.querySelectorAll("ytd-transcript-segment-renderer"));
  const captions = segments
    .map((segment) => {
      const timestamp = segment.querySelector(".segment-timestamp")?.textContent?.trim();
      const text = segment.querySelector(".segment-text")?.textContent?.trim();
      const start = timestamp ? parseTimeToSeconds(timestamp) : null;

      if (!text || start === null) {
        return null;
      }

      return {
        start,
        end: start + 4,
        text: normalizeCaptionText(text)
      };
    })
    .filter(Boolean);

  return captions.map((caption, index) => ({
    ...caption,
    end: captions[index + 1]?.start || caption.end
  }));
}

function useLoadedCaptions(menu, videoId, captions, statusMessage) {
  captionState.videoId = videoId;
  captionState.captions = captions;
  captionState.video = document.querySelector("video");
  captionAccessApproved = true;

  if (!captions.length) {
    setCaptionStatus(menu, "Caption track loaded, but it has no readable text.");
    return;
  }

  setCaptionStatus(menu, statusMessage);
  bindCaptionVideo(menu);
}

function buildCaptionUrls(track) {
  const baseUrl = new URL(track.baseUrl);
  const requestHints = getCaptionRequestHints(track);
  const candidates = [
    { label: "json3", format: "json3", url: new URL(baseUrl) },
    { label: "json3 with YouTube client params", format: "json3", url: new URL(baseUrl), useRequestHints: true },
    { label: "default XML", format: "xml", url: new URL(baseUrl) },
    { label: "default XML with YouTube client params", format: "xml", url: new URL(baseUrl), useRequestHints: true },
    { label: "srv3 XML", format: "xml", url: new URL(baseUrl) },
    { label: "srv3 XML with YouTube client params", format: "xml", url: new URL(baseUrl), useRequestHints: true },
    { label: "VTT", format: "vtt", url: new URL(baseUrl) },
    { label: "VTT with YouTube client params", format: "vtt", url: new URL(baseUrl), useRequestHints: true }
  ];

  if (cachedCaptionRequestHints?.latestTimedTextUrl) {
    candidates.unshift({
      label: "latest observed YouTube timedtext request",
      format: cachedCaptionRequestHints.latestTimedTextUrl.includes("fmt=vtt") ? "vtt" : "json3",
      url: new URL(cachedCaptionRequestHints.latestTimedTextUrl)
    });
  }

  for (const candidate of candidates) {
    if (candidate.label.includes("json3")) {
      candidate.url.searchParams.set("fmt", "json3");
    } else if (candidate.label.includes("default XML")) {
      candidate.url.searchParams.delete("fmt");
    } else if (candidate.label.includes("srv3")) {
      candidate.url.searchParams.set("fmt", "srv3");
    } else if (candidate.label.includes("VTT")) {
      candidate.url.searchParams.set("fmt", "vtt");
    }
  }

  for (const candidate of candidates) {
    if (candidate.useRequestHints) {
      applyCaptionRequestHints(candidate.url, requestHints);
    }
  }

  const uniqueCandidates = candidates.filter((candidate, index) => {
    const url = candidate.url.toString();
    return candidates.findIndex((other) => other.url.toString() === url) === index;
  });

  debugLog(
    "Caption URL candidates",
    uniqueCandidates.map((candidate) => ({
      label: candidate.label,
      format: candidate.format,
      url: candidate.url.toString()
    }))
  );

  return uniqueCandidates;
}

function parseCaptionResponse(rawCaptionData, format) {
  if (format === "json3") {
    return parseCaptionEvents(JSON.parse(rawCaptionData));
  }

  if (format === "vtt") {
    return parseVttCaptionEvents(rawCaptionData);
  }

  return parseXmlCaptionEvents(rawCaptionData);
}

async function fetchCaptionTrack(track) {
  const failures = [];
  debugLog("Beginning caption fetch for selected track", summarizeCaptionTrack(track));

  // Auto-generated tracks can return an empty body for one format and valid captions for another.
  for (const candidate of buildCaptionUrls(track)) {
    debugLog(`Fetching caption candidate: ${candidate.label}`, candidate.url.toString());

    let response;
    try {
      response = await fetch(candidate.url.toString());
    } catch (error) {
      failures.push(`${candidate.label}: request failed before YouTube returned data (${error.message})`);
      continue;
    }

    debugLog(`Caption candidate response status: ${candidate.label}`, {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      contentType: response.headers.get("content-type")
    });

    if (!response.ok) {
      failures.push(`${candidate.label}: YouTube returned HTTP ${response.status}`);
      continue;
    }

    const rawCaptionData = await response.text();
    debugLog(`Caption candidate body summary: ${candidate.label}`, {
      length: rawCaptionData.length,
      preview: rawCaptionData.slice(0, 200)
    });

    if (!rawCaptionData.trim()) {
      failures.push(`${candidate.label}: YouTube returned an empty response`);
      continue;
    }

    try {
      const captions = parseCaptionResponse(rawCaptionData, candidate.format);
      debugLog(`Parsed caption count for ${candidate.label}`, captions.length);
      if (captions.length) {
        debugLog(`Using caption candidate: ${candidate.label}`);
        return captions;
      }

      failures.push(`${candidate.label}: response parsed but contained no readable caption text`);
    } catch (error) {
      failures.push(`${candidate.label}: parse failed (${error.message})`);
    }
  }

  throw new Error(`all caption formats failed. ${failures.join("; ")}`);
}

function findCurrentCaptionIndex(currentTime) {
  // Auto-generated YouTube caption timestamps often trail the spoken audio slightly.
  const adjustedTime = currentTime + CAPTION_SYNC_OFFSET_SECONDS;
  return captionState.captions.findIndex((caption) => adjustedTime >= caption.start && adjustedTime < caption.end);
}

// Caption playback syncing.

function updateCurrentCaption() {
  const menu = document.getElementById(MENU_ID);
  const video = captionState.video;
  if (!menu || !video || !captionState.captions.length) {
    return;
  }

  if (isAdPlaying()) {
    setCaptionStatus(menu, "Ad playing. Captions will resume when the video starts.");
    return;
  }

  const activeIndex = findCurrentCaptionIndex(video.currentTime);
  // Avoid rewriting the same caption on every timeupdate event.
  if (activeIndex === captionState.activeIndex) {
    return;
  }

  captionState.activeIndex = activeIndex;
  setCaptionLines(menu, captionState.captions, activeIndex);
}

function bindCaptionVideo(menu) {
  if (!captionState.captions.length) {
    return;
  }

  const video = document.querySelector("video");
  if (!video) {
    setCaptionText(menu, "Waiting for the video player...");
    return;
  }

  // YouTube can replace the <video> element during navigation or player reloads.
  if (captionState.video && captionState.video !== video) {
    captionState.video.removeEventListener("timeupdate", updateCurrentCaption);
  }

  captionState.video = video;
  captionState.video.addEventListener("timeupdate", updateCurrentCaption);
  updateCurrentCaption();
}

async function loadCaptionsForCurrentVideo(menu) {
  const videoId = getVideoId();
  const loadDebugKey = [videoId, captionState.videoId, captionState.loadingVideoId, location.href].join("|");
  if (loadDebugKey !== lastLoadDebugKey) {
    lastLoadDebugKey = loadDebugKey;
    debugLog("loadCaptionsForCurrentVideo state changed", {
      videoId,
      captionStateVideoId: captionState.videoId,
      loadingVideoId: captionState.loadingVideoId,
      currentUrl: location.href
    });
  }

  if (!videoId) {
    return;
  }

  if (captionState.videoId === videoId) {
    bindCaptionVideo(menu);
    return;
  }

  if (captionState.loadingVideoId === videoId) {
    return;
  }

  if (isAdPlaying()) {
    setCaptionStatus(menu, "Waiting for the ad to finish before loading captions...");
    scheduleCaptionRetry(menu);
    return;
  }

  resetCaptions();
  captionState.loadingVideoId = videoId;
  setCaptionStatus(menu, "Caption stage: reading YouTube player metadata...");
  setCaptionText(menu, "");
  setCaptionActionVisible(menu, false);

  try {
    const visibleTranscriptCaptions = getVisibleTranscriptCaptions();
    if (visibleTranscriptCaptions.length) {
      useLoadedCaptions(menu, videoId, visibleTranscriptCaptions, "Showing captions from YouTube's visible transcript panel.");
      return;
    }

    if (isAdPlaying()) {
      setCaptionStatus(menu, "Waiting for the ad to finish before loading captions...");
      scheduleCaptionRetry(menu);
      return;
    }

    const observedTimedTextUrl = getObservedTimedTextUrl(videoId);
    if (observedTimedTextUrl) {
      setCaptionStatus(menu, "Caption stage: using YouTube's observed caption request...");
      const captions = await fetchCaptionTrack(createTrackFromObservedTimedTextUrl(observedTimedTextUrl));
      useLoadedCaptions(menu, videoId, captions, "Showing captions from YouTube's caption request.");
      return;
    }

    const playerResponse = getPlayerResponse();
    if (!playerResponse) {
      if (captionAccessApproved) {
        const observedCaptionRequest = await observeYouTubeCaptionRequest(menu, { userInitiated: true });
        const observedUrl = observedCaptionRequest || getObservedTimedTextUrl(videoId);

        if (observedUrl) {
          setCaptionStatus(menu, "Caption stage: using YouTube's observed caption request...");
          const captions = await fetchCaptionTrack(createTrackFromObservedTimedTextUrl(observedUrl));
          useLoadedCaptions(menu, videoId, captions, "Showing captions from YouTube's caption request.");
          return;
        }

        setCaptionStatus(menu, "Waiting for YouTube to make its caption request. Retrying shortly...");
        scheduleCaptionRetry(menu);
        return;
      }

      if (isPlayerReadyForCaptions()) {
        setCaptionStatus(menu, "Click Enable caption access to let YouTube load captions for this session.");
        setCaptionActionVisible(menu, true);
        return;
      }

      setCaptionStatus(menu, "Waiting for YouTube to finish loading video metadata...");
      scheduleCaptionRetry(menu);
      return;
    }

    debugLog("Player response has caption metadata", Boolean(playerResponse?.captions));

    const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const track = chooseCaptionTrack(tracks);

    if (!track) {
      if (captionAccessApproved) {
        const observedCaptionRequest = await observeYouTubeCaptionRequest(menu, { userInitiated: true });
        const observedUrl = observedCaptionRequest || getObservedTimedTextUrl(videoId);

        if (observedUrl) {
          setCaptionStatus(menu, "Caption stage: using YouTube's observed caption request...");
          const captions = await fetchCaptionTrack(createTrackFromObservedTimedTextUrl(observedUrl));
          useLoadedCaptions(menu, videoId, captions, "Showing captions from YouTube's caption request.");
          return;
        }
      }

      setCaptionStatus(menu, "Waiting for YouTube caption tracks...");
      scheduleCaptionRetry(menu);
      return;
    }

    const hasObservedCaptionRequest = Boolean(getObservedTimedTextUrl(videoId));
    const hasExtractedToken = extractPoTokensFromScripts().length > 0;
    if (!hasObservedCaptionRequest && !hasExtractedToken) {
      if (!captionAccessApproved) {
        setCaptionStatus(menu, "Click Enable caption access to let YouTube load captions for this session.");
        setCaptionActionVisible(menu, true);
        return;
      }

      setCaptionStatus(menu, "Loading captions for this video...");
      const observedCaptionRequest = await observeYouTubeCaptionRequest(menu, { userInitiated: true });
      if (!observedCaptionRequest && !getObservedTimedTextUrl(videoId)) {
        setCaptionStatus(menu, "Waiting for YouTube to make its caption request. Retrying shortly...");
        scheduleCaptionRetry(menu);
        return;
      }
    }

    setCaptionStatus(menu, `Caption stage: fetching ${getCaptionTrackLabel(track)} captions...`);
    const captions = await fetchCaptionTrack(track);
    setCaptionStatus(menu, `Caption stage: parsing ${getCaptionTrackLabel(track)} captions...`);
    useLoadedCaptions(menu, videoId, captions, `Showing ${getCaptionTrackLabel(track)} captions.`);
  } catch (error) {
    if (isAdPlaying()) {
      setCaptionStatus(menu, "Caption retrieval paused while an ad is playing. Retrying shortly...");
      scheduleCaptionRetry(menu);
      return;
    }

    // Non-ad failures are treated as final for this video to avoid continuous refetching.
    captionState.videoId = videoId;
    setCaptionStatus(menu, `Caption retrieval failed: ${error.message}`);
  } finally {
    captionState.loadingVideoId = null;
  }
}

// Prompt form behavior.

function formatBackendResult(data) {
  if (data?.response) {
    return data.response;
  }

  if (data?.error) {
    // Backend errors may include extra details; omit empty parts to avoid trailing punctuation.
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
    // Network, extension messaging, and backend failures all surface here as user-visible text.
    setResult(menu, error.message, "error");
  } finally {
    button.disabled = false;
  }
}

// Sidebar creation and placement.

// Create the side menu element used on the watch page.
function createSideMenu() {
  const menu = document.createElement("aside");
  menu.id = MENU_ID;
  menu.innerHTML = `
    <p class="hello-world-youtube-label">Current video</p>
    <h2></h2>
    <section class="hello-world-youtube-captions" aria-live="polite">
      <p class="hello-world-youtube-label">Current caption</p>
      <p class="${CAPTION_TEXT_CLASS}"></p>
      <p class="${CAPTION_STATUS_CLASS}">Looking for captions...</p>
      <button class="${CAPTION_ACTION_CLASS}" type="button" hidden>Enable caption access</button>
    </section>
    <div class="${RESULT_CLASS}" aria-live="polite"></div>
    <form class="hello-world-youtube-form">
      <label for="hello-world-youtube-prompt">Ask about this video</label>
      <textarea id="hello-world-youtube-prompt" rows="4" placeholder="Enter a prompt..."></textarea>
      <button type="submit">Submit</button>
    </form>
  `;
  menu.querySelector(`.${CAPTION_ACTION_CLASS}`).addEventListener("click", handleCaptionAccessClick);
  menu.querySelector("form").addEventListener("submit", handlePromptSubmit);
  return menu;
}

// Page observers and event wiring.

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

  loadCaptionsForCurrentVideo(menu);
}

// Schedule an update on the next animation frame for smoother DOM interaction.
function scheduleUpdate() {
  window.requestAnimationFrame(updateSideMenu);
}

// Re-run the update after navigation and fullscreen changes.
patchHistoryNavigation();
document.addEventListener("yt-navigate-start", handlePossibleVideoNavigation);
document.addEventListener("yt-navigate-finish", handlePossibleVideoNavigation);
document.addEventListener("yt-page-data-updated", handlePossibleVideoNavigation);
window.addEventListener("popstate", handlePossibleVideoNavigation);
document.addEventListener("fullscreenchange", scheduleUpdate);

// YouTube sometimes updates watch pages without consistently firing public SPA events.
window.setInterval(handlePossibleVideoNavigation, 1000);

// Observe DOM changes that could affect YouTube page layout, especially theater mode.
new MutationObserver(scheduleUpdate).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["theater"]
});

// Initial run on script load.
scheduleUpdate();
