import { DEBUG_CAPTIONS } from "./constants";

export function debugLog(message: string, data?: unknown) {
  if (!DEBUG_CAPTIONS) {
    return;
  }

  if (data === undefined) {
    console.log(`[YouTube Sidebar Captions] ${message}`);
    return;
  }

  console.log(`[YouTube Sidebar Captions] ${message}`, data);
}
