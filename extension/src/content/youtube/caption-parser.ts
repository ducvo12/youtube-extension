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
        text,
      };
    })
    .filter(Boolean);
}

export function parseTimeToSeconds(time) {
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
          text,
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
        text,
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

export function parseCaptionResponse(rawCaptionData, format) {
  if (format === "json3") {
    return parseCaptionEvents(JSON.parse(rawCaptionData));
  }

  if (format === "vtt") {
    return parseVttCaptionEvents(rawCaptionData);
  }

  return parseXmlCaptionEvents(rawCaptionData);
}

export function getVisibleTranscriptCaptions() {
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
        text: normalizeCaptionText(text),
      };
    })
    .filter(Boolean);

  return captions.map((caption, index) => ({
    ...caption,
    end: captions[index + 1]?.start || caption.end,
  }));
}
