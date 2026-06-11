import { debugLog } from "./debug";
import type { NavigatorWithUserAgentData } from "./types";

let loggedPlayerScriptIndexes = new Set();
let cachedCaptionRequestHints = null;

export function resetCaptionHints() {
  loggedPlayerScriptIndexes = new Set();
  cachedCaptionRequestHints = null;
}

export function getCachedCaptionRequestHints() {
  return cachedCaptionRequestHints;
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

export function getPlayerResponse() {
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
        length: text.length,
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

export function summarizeCaptionTrack(track) {
  return {
    label: getCaptionTrackLabel(track),
    languageCode: track.languageCode,
    kind: track.kind,
    vssId: track.vssId,
    isTranslatable: track.isTranslatable,
    hasBaseUrl: Boolean(track.baseUrl),
    baseUrl: track.baseUrl,
  };
}

export function chooseCaptionTrack(tracks) {
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

export function getCaptionTrackLabel(track) {
  return track.name?.simpleText || track.languageCode || "selected track";
}

function getBrowserBrand() {
  const userAgentData = (navigator as NavigatorWithUserAgentData).userAgentData;
  return userAgentData?.brands?.find((brand) => brand.brand !== "Not A(Brand")?.brand || "Chrome";
}

function getBrowserVersion() {
  const userAgentVersion = navigator.userAgent.match(/(?:Chrome|CriOS)\/(\d+\.\d+\.\d+\.\d+)/);
  const userAgentData = (navigator as NavigatorWithUserAgentData).userAgentData;
  return userAgentVersion?.[1] || userAgentData?.brands?.[0]?.version || "";
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
    cplatform: "DESKTOP",
  };

  return Object.fromEntries(Object.entries(params).filter(([, value]) => value));
}

export function extractPoTokensFromScripts() {
  const tokens = new Set<string>();
  const patterns = [
    /"poToken"\s*:\s*"([^"]+)"/g,
    /"pot"\s*:\s*"([^"]+)"/g,
    /"playerAttestationRenderer"[\s\S]{0,2000}?"challenge"\s*:\s*"([^"]+)"/g,
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

export function getTimedTextResourceHints(videoId) {
  return performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/api/timedtext"))
    .map((entry) => {
      try {
        return {
          startTime: entry.startTime,
          url: new URL(entry.name),
        };
      } catch {
        return null;
      }
    })
    .filter((entry) => entry?.url.searchParams.get("v") === videoId)
    .sort((left, right) => right.startTime - left.startTime);
}

export function getObservedTimedTextUrl(videoId) {
  return getTimedTextResourceHints(videoId).find((entry) => entry.url.searchParams.has("pot"))?.url || null;
}

export function createTrackFromObservedTimedTextUrl(url) {
  return {
    baseUrl: url.toString(),
    name: {
      simpleText: url.searchParams.get("lang") || "observed YouTube captions",
    },
    languageCode: url.searchParams.get("lang") || "",
    kind: url.searchParams.get("kind") || "",
    vssId: "",
    isTranslatable: false,
    trackName: "",
  };
}

export function getCaptionRequestHints(track, videoId) {
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
    params,
  };

  debugLog("Caption request hints", cachedCaptionRequestHints);
  return params;
}

export function applyCaptionRequestHints(url, hints) {
  for (const [key, value] of Object.entries(hints)) {
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }
}
