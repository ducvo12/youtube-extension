import { CAPTION_SYNC_OFFSET_SECONDS, MENU_ID } from "./constants";
import { setCaptionActionVisible, setCaptionLines, setCaptionStatus, setCaptionText } from "./caption-ui";
import {
  applyCaptionRequestHints,
  chooseCaptionTrack,
  createTrackFromObservedTimedTextUrl,
  extractPoTokensFromScripts,
  getCachedCaptionRequestHints,
  getCaptionRequestHints,
  getCaptionTrackLabel,
  getObservedTimedTextUrl,
  getPlayerResponse,
  resetCaptionHints,
  summarizeCaptionTrack,
} from "./caption-hints";
import { getVisibleTranscriptCaptions, parseCaptionResponse } from "./caption-parser";
import { debugLog } from "./debug";
import { getVideoId } from "./page";
import type { CaptionState } from "./types";

let lastLoadDebugKey = "";
let captionRetryTimeout = null;
let captionAccessApproved = false;

// Shared caption state for the currently loaded YouTube watch page.
let captionState: CaptionState = {
  videoId: null,
  loadingVideoId: null,
  captions: [],
  activeIndex: -1,
  video: null,
};

export function resetCaptions() {
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
    video: null,
  };
  lastLoadDebugKey = "";
  resetCaptionHints();
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
      !isAdPlaying(),
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
    target.dispatchEvent(
      new MouseEvent(eventName, {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
  }
}

function clickCaptionButton(button) {
  showPlayerControls();

  button.focus();

  for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    button.dispatchEvent(
      new MouseEvent(eventName, {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
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

export async function handleCaptionAccessClick(event) {
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

function buildCaptionUrls(track) {
  const baseUrl = new URL(track.baseUrl);
  const requestHints = getCaptionRequestHints(track, getVideoId());
  const cachedCaptionRequestHints = getCachedCaptionRequestHints();
  const candidates = [
    { label: "json3", format: "json3", url: new URL(baseUrl) },
    { label: "json3 with YouTube client params", format: "json3", url: new URL(baseUrl), useRequestHints: true },
    { label: "default XML", format: "xml", url: new URL(baseUrl) },
    { label: "default XML with YouTube client params", format: "xml", url: new URL(baseUrl), useRequestHints: true },
    { label: "srv3 XML", format: "xml", url: new URL(baseUrl) },
    { label: "srv3 XML with YouTube client params", format: "xml", url: new URL(baseUrl), useRequestHints: true },
    { label: "VTT", format: "vtt", url: new URL(baseUrl) },
    { label: "VTT with YouTube client params", format: "vtt", url: new URL(baseUrl), useRequestHints: true },
  ];

  if (cachedCaptionRequestHints?.latestTimedTextUrl) {
    candidates.unshift({
      label: "latest observed YouTube timedtext request",
      format: cachedCaptionRequestHints.latestTimedTextUrl.includes("fmt=vtt") ? "vtt" : "json3",
      url: new URL(cachedCaptionRequestHints.latestTimedTextUrl),
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
      url: candidate.url.toString(),
    })),
  );

  return uniqueCandidates;
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
      contentType: response.headers.get("content-type"),
    });

    if (!response.ok) {
      failures.push(`${candidate.label}: YouTube returned HTTP ${response.status}`);
      continue;
    }

    const rawCaptionData = await response.text();
    debugLog(`Caption candidate body summary: ${candidate.label}`, {
      length: rawCaptionData.length,
      preview: rawCaptionData.slice(0, 200),
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

export async function loadCaptionsForCurrentVideo(menu) {
  const videoId = getVideoId();
  const loadDebugKey = [videoId, captionState.videoId, captionState.loadingVideoId, location.href].join("|");
  if (loadDebugKey !== lastLoadDebugKey) {
    lastLoadDebugKey = loadDebugKey;
    debugLog("loadCaptionsForCurrentVideo state changed", {
      videoId,
      captionStateVideoId: captionState.videoId,
      loadingVideoId: captionState.loadingVideoId,
      currentUrl: location.href,
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
