// ============================================================
// Service Worker (Background Script) - Manifest V3
// ============================================================

import { runtimeLog } from '../shared/runtime-logger';
import { isBlockedUrl, isVivExt, isYaBrowser, hasSidePanel } from '../shared/helpers';
import type { ServiceWorkerMessage, ContentMessage } from '../shared/types';
import { hasHostPermissions, registerContentScripts } from './content-scripts';
import { updateBadge, highlightToolbarIcon } from './badge';

// --- UI Mode Detection ---

let uiMode: 'popup' | 'sidepanel' = 'popup';
let sidePanelEnabled = false;
let sidePanelOnceTabId: number | null = null;
const sidePanelTabs = new Set<number>();
const connectedTabs = new Set<number>();
const connectThrottle = new Map<number, number>();

async function detectUiMode(): Promise<void> {
  try {
    sidePanelEnabled = !(await isVivExt()) && !isYaBrowser() && hasSidePanel();
    if (!sidePanelEnabled) {
      uiMode = 'popup';
      await chrome.action.setPopup({ popup: 'popup/index.html' });
      return;
    }

    const syncData = await chrome.storage.sync.get('uiMode');
    uiMode = syncData.uiMode === 'sidepanel' ? 'sidepanel' : 'popup';

    const localData = await chrome.storage.local.get('sidepanelOnceTabId');
    sidePanelOnceTabId =
      typeof localData.sidepanelOnceTabId === 'number' ? localData.sidepanelOnceTabId : null;

    if (uiMode === 'sidepanel') {
      await chrome.action.setPopup({ popup: '' });
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        await ensureSidePanelForTab(activeTab.id);
      }
    } else {
      await chrome.action.setPopup({ popup: 'popup/index.html' });
    }
  } catch (err) {
    runtimeLog.error('[SW] Error initializing cache from storage', err);
    uiMode = 'popup';
    await chrome.action.setPopup({ popup: 'popup/index.html' });
  }
}

const initPromise = detectUiMode();

// --- Side Panel Management ---

async function ensureSidePanelForTab(tabId: number, setEnabled = false): Promise<void> {
  try {
    if (!sidePanelEnabled) return;

    if (!sidePanelTabs.has(tabId)) {
      if (setEnabled) {
        await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel/index.html', enabled: true });
      } else {
        await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel/index.html' });
      }
      sidePanelTabs.add(tabId);
    } else if (setEnabled) {
      await chrome.sidePanel.setOptions({ tabId, enabled: true });
    }

    await chrome.action.setPopup({ tabId, popup: '' });
  } catch (err) {
    runtimeLog.warn('sw', 'ensure-sidepanel-failed', 'ensureSidePanelForTab failed', {
      tabId,
      setEnabled,
      error: err,
    });
  }
}

function isSidePanelMode(): boolean {
  return sidePanelEnabled && uiMode === 'sidepanel';
}

// --- Tab UI Update ---

async function updateUiForTab(tab: chrome.tabs.Tab | undefined): Promise<void> {
  if (!tab?.id) return;
  try {
    if (isSidePanelMode()) {
      await ensureSidePanelForTab(tab.id);
      await chrome.action.setPopup({ tabId: tab.id, popup: '' });
    } else {
      if (sidePanelEnabled) {
        await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
      }
      await chrome.action.setPopup({ tabId: tab.id, popup: 'popup/index.html' });
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('No tab with id') || err.message.includes('Invalid tab ID'))
    ) {
      return;
    }
    runtimeLog.error('[SW] Error updating UI for tab', { tabId: tab.id, error: err });
  }
}

// --- Messaging ---

async function sendRuntimeMessage(msg: ServiceWorkerMessage, context: string): Promise<boolean> {
  try {
    await chrome.runtime.sendMessage(msg);
    return true;
  } catch (err) {
    const msgStr = String((err as Error)?.message || err || '');
    if (
      msgStr.includes('Receiving end does not exist') ||
      msgStr.includes('The message port closed before a response was received')
    ) {
      // Expected when no popup/sidepanel is open
      return false;
    }
    runtimeLog.error('[SW] Error sending runtime message', { context, error: err });
    return false;
  }
}

function isThrottled(key: string, minInterval = 1200): boolean {
  const now = Date.now();
  const last = connectThrottle.get(key as any) ?? 0;
  if (now - last < minInterval) return true;
  connectThrottle.set(key as any, now);
  return false;
}

async function sendWithRetry(
  msg: ServiceWorkerMessage,
  context: string,
  delay = 900,
): Promise<void> {
  const sent = await sendRuntimeMessage(msg, context);
  if (!sent) {
    setTimeout(() => {
      sendRuntimeMessage(msg, `${context}-retry`);
    }, delay);
  }
}

// --- Message Processing ---
// Обрабатывает сообщения ТОЛЬКО от content script (у них есть tabId)

function processMessage(
  msg: ServiceWorkerMessage | ContentMessage,
  tabId: number,
  senderUrl?: string,
): void {
  try {
    // Handle content script messages
    const contentMsg = msg as ContentMessage;

    if (contentMsg.type === 'main-console-error') {
      runtimeLog.error('[SW][MAIN-ERROR]', {
        scope: contentMsg.scope,
        event: contentMsg.event,
        data: contentMsg.data,
        pageUrl: contentMsg.pageUrl,
        tabId,
        senderUrl,
      });
      return;
    }

    if (contentMsg.type === 'logger-error') {
      const entry = contentMsg.entry;
      runtimeLog.error(entry?.scope || 'content', entry?.event || 'logger-error', entry?.msg, {
        ctx: entry?.ctx,
        pageUrl: contentMsg.pageUrl,
        tabId,
        senderUrl,
      });
      return;
    }

    if (contentMsg.type === 'highlight-toolbar-icon') {
      const tId = Number(contentMsg.tabId);
      if (Number.isFinite(tId) && tId > 0) highlightToolbarIcon(tId);
      return;
    }

    if (contentMsg.type === 'enable-tab-connect') {
      const tId = Number(contentMsg.tabId ?? tabId);
      if (!Number.isFinite(tId) || tId <= 0) return;
      connectedTabs.add(tId);
      if (isSidePanelMode()) ensureSidePanelForTab(tId, true);

      const url = typeof contentMsg.url === 'string' ? contentMsg.url : senderUrl;
      sendWithRetry(
        {
          sender: 'service-worker',
          command: 'connect',
          tabId: tId,
          isNavigation: true,
          altUrl: url,
          altTitle: typeof contentMsg.title === 'string' ? contentMsg.title : undefined,
        },
        'enable-tab-connect',
        900,
      );
      return;
    }

    // Handle dispatcher-ready (from content-dispatcher via chrome.runtime.sendMessage)
    const anyMsg = msg as any;
    if (anyMsg.command === 'dispatcher-ready' && tabId) {
      if (!isThrottled(String(tabId))) {
        updateBadge(tabId, 0, 'off');
      }
      return;
    }

    if (anyMsg.command === 'reset' || anyMsg.command === 'exit-tabCapture') {
      updateBadge(tabId, 0, undefined);
      return;
    }

    // Обновляем badge при получении set/set-from-content от content script
    if (anyMsg.command === 'set' || anyMsg.command === 'set-from-content') {
      const semitone = anyMsg.semitone ?? anyMsg.media?.semitone;
      const loopMode = anyMsg.loopMode;
      if (semitone !== undefined || loopMode !== undefined) {
        updateBadge(tabId, semitone, loopMode);
      }
      return;
    }
  } catch (err) {
    runtimeLog.error('[SW] Error processing message', err);
  }
}

// --- Event Listeners ---

// Startup
chrome.runtime.onStartup.addListener(async () => {
  await detectUiMode();
});

// Installation
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install' || reason === 'update') {
    try {
      await registerContentScripts();
      await detectUiMode();
    } catch (err) {
      runtimeLog.error('[SW] registerScripts failed onInstalled', err);
    }
  }
});

// Permissions
chrome.permissions.onAdded.addListener(async (perms) => {
  await registerContentScripts().catch((err) => {
    runtimeLog.error('[SW] registerContentScripts on permissions.onAdded failed', err);
  });

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    runtimeLog.warn(
      'sw',
      'permissions-added-no-active-tab',
      'No active tab found to reload after permissions change',
      { addedPermissions: perms },
    );
    return;
  }

  if ((perms.permissions ?? []).includes('tabCapture')) {
    try {
      const newTab = await chrome.tabs.duplicate(activeTab.id);
      if (newTab?.id) {
        await chrome.tabs.remove(activeTab.id);
        runtimeLog.log(
          'sw',
          'tabcapture-permission-tab-duplicated',
          'Duplicated active tab and closed previous tab after tabCapture permission grant',
          { fromTabId: activeTab.id, toTabId: newTab.id },
        );
        return;
      }
      runtimeLog.warn(
        'sw',
        'tab-duplicate-missing-id',
        'Tab duplicate did not return a valid tab id after tabCapture grant',
        { activeTabId: activeTab.id },
      );
    } catch (err) {
      runtimeLog.warn(
        'sw',
        'tab-duplicate-fallback-reload',
        'Failed to duplicate/replace active tab after tabCapture grant, falling back to reload',
        { activeTabId: activeTab.id, error: err },
      );
    }
  }

  chrome.tabs.reload(activeTab.id);
});

chrome.permissions.onRemoved.addListener(() => {
  registerContentScripts().catch((err) => {
    runtimeLog.error('[SW] registerContentScripts on permissions.onRemoved failed', err);
  });
});

// Storage changes
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'sync' && changes.uiMode) {
    if (changes.uiMode.newValue === undefined) return;
    uiMode = changes.uiMode.newValue === 'sidepanel' ? 'sidepanel' : 'popup';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await updateUiForTab(tab);
  }

  if (area === 'local' && changes.sidepanelOnceTabId !== undefined) {
    const val = changes.sidepanelOnceTabId?.newValue;
    sidePanelOnceTabId = typeof val === 'number' ? val : null;
  }
});

// Action click
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    runtimeLog.error('[SW] Could not retrieve active tab information on action click');
    return;
  }

  const msg: ServiceWorkerMessage = {
    sender: 'service-worker',
    command: 'connect',
    tabId: tab.id,
    altUrl: tab.url,
    altTitle: tab.title,
  };

  connectedTabs.add(tab.id);

  if (isSidePanelMode()) {
    await ensureSidePanelForTab(tab.id, true);
    chrome.sidePanel
      .open({ tabId: tab.id })
      .then(() => {
        setTimeout(async () => {
          await sendWithRetry(msg, 'action-click', 1000);
        }, 100);
      })
      .catch(async (err) => {
        runtimeLog.error('[SW] Error opening side panel', err);
        if (String(err?.message || err).includes('No active side panel')) {
          try {
            const tId = tab.id!;
            await chrome.sidePanel.setOptions({
              tabId: tId,
              path: 'sidepanel/index.html',
              enabled: true,
            });
            sidePanelTabs.add(tId);
            await chrome.sidePanel.open({ tabId: tId });
          } catch (retryErr) {
            runtimeLog.error('[SW] Side panel open retry failed', retryErr);
          }
        } else {
          runtimeLog.error('[SW] Error opening side panel', err);
        }
      });
  } else {
    await chrome.action.setPopup({ tabId: tab.id, popup: 'popup/index.html' });
    chrome.action.openPopup().catch((err) => {
      runtimeLog.error('[SW] Error opening popup', err);
    });
  }
});

// Tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    await initPromise;
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await updateUiForTab(tab);

    if (isSidePanelMode() && tab?.id) {
      connectedTabs.add(tab.id);
      const url = tab.url;
      if (url) {
        sendWithRetry(
          {
            sender: 'service-worker',
            command: 'connect',
            tabId: tab.id,
            isNavigation: true,
            altUrl: url,
            altTitle: tab.title,
          },
          'tab-activated',
          900,
        );
      }
    }
  } catch (err) {
    runtimeLog.error('[SW] Error in onActivated listener', { tabId: activeInfo.tabId, error: err });
  }
});

// Tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  sidePanelTabs.delete(tabId);
  connectedTabs.delete(tabId);
  connectThrottle.delete(tabId as any);

  if (sidePanelOnceTabId === tabId) {
    sidePanelOnceTabId = null;
    chrome.storage.local.remove('sidepanelOnceTabId');
  }
});

// Tab update
const tabUrls = new Map<number, string>();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') tabUrls.delete(tabId);
  if (changeInfo.url) tabUrls.set(tabId, changeInfo.url);

  await initPromise;

  if (!connectedTabs.has(tabId)) {
    if (!isSidePanelMode()) return;
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id !== tabId) return;
    connectedTabs.add(tabId);
  }

  const isComplete = changeInfo.status === 'complete';
  const hasUrl = typeof changeInfo.url === 'string' && changeInfo.url.length > 0;
  if (!isComplete && !hasUrl) return;

  const url = changeInfo.url || tab.url || tabUrls.get(tabId);
  await updateUiForTab(tab);

  const msg: ServiceWorkerMessage = {
    sender: 'service-worker',
    command: 'connect',
    tabId,
    isNavigation: true,
  };

  if (url) {
    msg.altUrl = url;
    msg.altTitle = tab.title;
    await sendRuntimeMessage(msg, 'tab-updated');
  } else if (isComplete) {
    msg.connectionStatusMessage = 'No permission context';
    msg.hasConnectionStatusError = true;
    msg.noPermissionContext = true;
    await sendRuntimeMessage(msg, 'tab-updated-no-url');
  }
});

// Runtime messages
chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  try {
    const tabId = msg.tabId ?? sender.tab?.id;

    // Если есть tabId — обрабатываем как сообщение от content script
    if (tabId) {
      processMessage(msg, tabId, sender.tab?.url);
      sendResponse(true);
      return;
    }

    // Сообщения без tabId — от popup или sidepanel.
    // Отправляем connect обратно, чтобы попап знал статус соединения
    (async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
          const connectMsg: ServiceWorkerMessage = {
            sender: 'service-worker',
            command: 'connect',
            tabId: activeTab.id,
            altUrl: activeTab.url,
            altTitle: activeTab.title,
          };
          await chrome.runtime.sendMessage(connectMsg).catch(() => {});
        } else {
          // Нет активной вкладки
          const noTabMsg: ServiceWorkerMessage = {
            sender: 'service-worker',
            command: 'connect',
            noPermissionContext: true,
            connectionStatusMessage: 'No active tab found',
            hasConnectionStatusError: true,
          };
          await chrome.runtime.sendMessage(noTabMsg).catch(() => {});
        }
      } catch (err) {
        console.error('[SW] Error sending connect to popup:', err);
      }
    })();

    sendResponse(true);
  } catch {
    // Ignore
  }
});

// External messages (from transpose.video)
chrome.runtime.onMessageExternal.addListener((msg: any, _sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ status: 'success', message: 'pong' });
    return true;
  }

  if (msg.type === 'store-share-payload') {
    (async () => {
      const { createSharePayload } = await import('../shared/helpers');
      const payload = createSharePayload(msg.share);
      if (payload) {
        await chrome.storage.local.set({ pendingShare: payload });
        sendResponse({ status: 'success' });
      } else {
        sendResponse({ status: 'error', message: 'Invalid share payload.' });
      }
    })();
    return true;
  }
});
