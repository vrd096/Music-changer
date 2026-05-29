import { isBlockedUrl } from '../shared/helpers';

const INIT_FLAG = '___tp_isInitialized_dispatcher';
const extensionOrigin = chrome.runtime.getURL('');

let isReady = false;
const messageQueue: any[] = [];
let isProcessing = false;

window.addEventListener('tp-dispatcher-message', ((event: CustomEvent) => {
  const detail = event.detail;
  if (!detail?.scope || !detail?.event) return;

  const level = detail.lvl || 'log';

  if (level === 'error') {
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
    } catch {}

    try {
      chrome.runtime.sendMessage({
        type: 'main-console-error',
        scope: detail.scope,
        event: detail.event,
        data: detail.data,
        pageUrl: window.location.href,
      });
    } catch {}
  }
}) as EventListener);

window.addEventListener('tp-command', ((event: CustomEvent) => {
  const detail = event.detail;
  if (!detail || typeof detail.command !== 'string') return;

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
      }
    }
    isProcessing = false;
    processQueue();
  });
}

chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  try {
    window.dispatchEvent(
      new CustomEvent('transpose-dispatch-controls-to-content', { detail: msg }),
    );
  } catch (err) {
    const errMsg = String((err as Error)?.message || err || '');
    if (errMsg.includes('Extension context invalidated')) {
    }
  }
  sendResponse(true);
});

if (!(window as any)[INIT_FLAG]) {
  (window as any)[INIT_FLAG] = true;

  if (!isBlockedUrl(window.location.href)) {
    chrome.runtime.sendMessage({
      command: 'dispatcher-ready',
      tabId: undefined as any,
      sender: 'content-dispatcher',
    });

    isReady = true;
    processQueue();
  }
}
