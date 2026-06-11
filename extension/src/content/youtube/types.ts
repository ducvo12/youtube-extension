export type BackendResult = {
  response?: string;
  error?: string;
  details?: unknown;
  [key: string]: unknown;
};

export type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    brands?: Array<{
      brand: string;
      version: string;
    }>;
  };
};

export type Caption = {
  start: number;
  end: number;
  text: string;
};

export type CaptionTrack = {
  baseUrl: string;
  name?: {
    simpleText?: string;
  };
  languageCode?: string;
  kind?: string;
  vssId?: string;
  isTranslatable?: boolean;
  trackName?: string;
};

export type CaptionState = {
  videoId: string | null;
  loadingVideoId: string | null;
  captions: Caption[];
  activeIndex: number;
  video: HTMLVideoElement | null;
};

export type CaptionFormat = "json3" | "xml" | "vtt";

export type CaptionUrlCandidate = {
  label: string;
  format: CaptionFormat;
  url: URL;
  useRequestHints?: boolean;
};
