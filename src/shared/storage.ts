// ============================================================
// Shared Chrome Storage helpers
// ============================================================

/** Load a value from chrome.storage.local with a fallback */
export function loadFromStorage<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] !== undefined ? result[key] : fallback);
    });
  });
}

/** Save a value to chrome.storage.local */
export function saveToStorage<T>(key: string, value: T): void {
  chrome.storage.local.set({ [key]: value });
}
