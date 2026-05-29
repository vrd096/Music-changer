const highlightTimers = new Map<number, ReturnType<typeof setTimeout>[]>();

export function updateBadge(tabId: number, semitone?: number, loopMode?: string): void {
  chrome.action.getBadgeText({ tabId }, (currentText) => {
    let hasLoop = currentText.includes('▶');
    let currentSemitone: number | undefined;
    const withoutLoop = currentText.replace('▶', '').trim();
    if (withoutLoop) {
      const parsed = parseFloat(withoutLoop);
      if (!isNaN(parsed)) currentSemitone = parsed;
    }
    if (loopMode !== undefined) hasLoop = loopMode !== 'off';
    if (semitone !== undefined) currentSemitone = semitone;
    const parts: string[] = [];
    if (hasLoop) parts.push('▶');
    if (currentSemitone !== undefined && currentSemitone !== 0)
      parts.push(currentSemitone.toString());
    const text = parts.join(' ').trim();
    chrome.action.setBadgeText({ tabId, text });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#6e40c9' });
  });
}

export function highlightToolbarIcon(tabId: number): void {
  const existing = highlightTimers.get(tabId);
  if (existing) existing.forEach(clearTimeout);
  const timers: ReturnType<typeof setTimeout>[] = [];
  highlightTimers.set(tabId, timers);
  const normal = { 16: 'assets/icons/icon-16-32x32.png', 32: 'assets/icons/icon-32x32.png' };
  const highlight = {
    16: 'assets/icons/icon-16-32x32-highlight.png',
    32: 'assets/icons/icon-16-32x32-highlight.png',
  };
  let delay = 0;
  for (let i = 0; i < 3; i++) {
    timers.push(
      setTimeout(() => {
        chrome.action.setIcon({ tabId, path: highlight }, () => {
          void chrome.runtime.lastError;
        });
      }, delay),
    );
    delay += 320;
    timers.push(
      setTimeout(() => {
        chrome.action.setIcon({ tabId, path: normal }, () => {
          void chrome.runtime.lastError;
        });
      }, delay),
    );
    delay += 250;
  }
  timers.push(
    setTimeout(() => {
      highlightTimers.delete(tabId);
    }, delay),
  );
}
