export function translate(key: string, ...args: string[]): string {
  const msg = chrome.i18n.getMessage(key, args);
  return msg || key;
}
