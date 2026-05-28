// ============================================================
// Content Dispatcher - runs in ISOLATED world
// Bridges MAIN world events to the service worker
// ============================================================

import { isBlockedUrl } from '../shared/helpers';

const INIT_FLAG = '___tp_isInitialized_dispatcher';
const extensionOrigin = chrome.runtime.getURL('');

let isReady = false;
const messageQueue: any[] = [];
let isProcessing = false;

// Listen for custom events from MAIN world content script
window.addEventListener('tp-dispatcher-message', ((event: CustomEvent) => {
  const detail = event.detail;
  if (!detail?.scope || !detail?.event) return;

  const level = detail.lvl || 'log';

  if (level === 'error') {
    // Forward to service worker
    console.error(`[${detail.scope}] ${detail.event}`, detail.data ?? '');
    try {
      chrome.runtime.sendMessage({
        type: 'logger-error',
        entry: {
          lvl: 'error',
          scope: detail.scope,
          event: detail.event,
          msg: typeof detail.data === 'string' ? detail.data : undefined,
          ctx: detail.data,
        },
        pageUrl: window.location.href,
      });
    } catch {
      /* ignore */
    }

    try {
      chrome.runtime.sendMessage({
        type: 'main-console-error',
        scope: detail.scope,
        event: detail.event,
        data: detail.data,
        pageUrl: window.location.href,
      });
    } catch {
      /* ignore */
    }
  }
}) as EventListener);

// Listen for commands from MAIN world
window.addEventListener('tp-command', ((event: CustomEvent) => {
  const detail = event.detail;
  if (!detail || typeof detail.command !== 'string') return;

  // Skip peak-analysis commands
  if (detail.command === 'peak-analysis') return;

  messageQueue.push(detail);
  processQueue();
}) as EventListener);

function processQueue(): void {
  if (!isReady || isProcessing || messageQueue.length === 0) return;
  isProcessing = true;

  const msg = messageQueue.shift()!;
  if (msg && typeof msg === 'object' && !msg.extensionPath) {
    msg.extensionPath = extensionOrigin;
  }

  chrome.runtime.sendMessage(msg, () => {
    if (chrome.runtime.lastError) {
      const errMsg = chrome.runtime.lastError.message || '';
      if (errMsg.includes('context invalidated')) {
        // Context was invalidated, ignore
      }
    }
    isProcessing = false;
    processQueue();
  });
}

// Listen for commands from service worker (forwarded from popup/sidepanel)
chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  // Диспатчим команды в MAIN world через CustomEvent
  // Это включает set/set-from-content команды от service-worker (которые пришли от popup/sidepanel)
  try {
    window.dispatchEvent(
      new CustomEvent('transpose-dispatch-controls-to-content', { detail: msg }),
    );
  } catch (err) {
    const errMsg = String((err as Error)?.message || err || '');
    if (errMsg.includes('Extension context invalidated')) {
      // ignore
    }
  }
  sendResponse(true);
});

// Initialize if URL is not blocked
if (!(window as any)[INIT_FLAG]) {
  (window as any)[INIT_FLAG] = true;

  if (!isBlockedUrl(window.location.href)) {
    // Signal to service worker that dispatcher is ready
    chrome.runtime.sendMessage({
      command: 'dispatcher-ready',
      tabId: undefined as any,
      sender: 'content-dispatcher',
    });

    isReady = true;
    processQueue();
  }
}
