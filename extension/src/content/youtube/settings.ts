export type TranslationMode = "vi-to-en" | "en-to-vi" | "any-to-en";

export const TRANSLATION_MODE_STORAGE_KEY = "youtubeTranslationMode";

export const TRANSLATION_MODE_LABELS: Record<TranslationMode, string> = {
  "vi-to-en": "Translate Vietnamese to English",
  "en-to-vi": "Translate English to Vietnamese",
  "any-to-en": "Other: translate any language to English",
};

function isTranslationMode(value: unknown): value is TranslationMode {
  return value === "vi-to-en" || value === "en-to-vi" || value === "any-to-en";
}

function getStorageArea() {
  return chrome.storage?.sync || chrome.storage?.local;
}

export function getTranslationMode(): Promise<TranslationMode | null> {
  return new Promise((resolve, reject) => {
    getStorageArea().get(TRANSLATION_MODE_STORAGE_KEY, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const value = items[TRANSLATION_MODE_STORAGE_KEY];
      resolve(isTranslationMode(value) ? value : null);
    });
  });
}

export function saveTranslationMode(mode: TranslationMode): Promise<void> {
  return new Promise((resolve, reject) => {
    getStorageArea().set({ [TRANSLATION_MODE_STORAGE_KEY]: mode }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

export function resetTranslationMode(): Promise<void> {
  return new Promise((resolve, reject) => {
    getStorageArea().remove(TRANSLATION_MODE_STORAGE_KEY, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}
