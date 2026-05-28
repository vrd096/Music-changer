// ============================================================
// Shared i18n helper — replaces duplicated `const t` in all modules
// ============================================================

/** Get localized message by key, falls back to key if not found */
export function translate(key: string, ...args: string[]): string {
  const msg = chrome.i18n.getMessage(key, args);
  return msg || key;
}
