// ============================================================
// SidePanel App - отправляет команды напрямую в content script
// через chrome.tabs.sendMessage (как в оригинальном Transpose)
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AudioControls } from '../shared/AudioControls';
import type { MediaState, ServiceWorkerMessage, EqBand } from '../shared/types';
import { DEFAULT_EQ_BANDS } from '../shared/types';
import { translate } from '../shared/i18n';
import { HistoryPage } from '../shared/components/HistoryPage';
import { ProBadge } from '../shared/components/ProBanner';

// ============================================================
// SubscriptionAlert
// ============================================================

const SubscriptionAlert: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check subscription status
    chrome.storage.sync.get('subscription', (result) => {
      // Handle subscription alert logic
    });
  }, []);

  if (!visible) return null;

  return (
    <div className="subscription-alert">
      <span>Subscription required for this feature</span>
      <button onClick={() => setVisible(false)}>Dismiss</button>
    </div>
  );
};

// ============================================================
// ProBannerSidepanel
// ============================================================

const ProBannerSidepanel: React.FC = () => {
  return (
    <div className="pro-banner">
      <div className="pro-banner-content">
        <div className="pro-banner-text">
          <h3>Transpose ▲▼ PRO</h3>
          <p>Unlock all features</p>
        </div>
        <button className="pro-banner-button">Upgrade</button>
      </div>
    </div>
  );
};

// ============================================================
// SidePanelApp - Главный компонент сайдпанели
// ============================================================

type SidePanelPage = 'main' | 'history' | 'settings';

export const SidePanelApp: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<SidePanelPage>('main');
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'no-permission'
  >('connecting');
  const [pendingHostUrl, setPendingHostUrl] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaState>({
    semitone: 0,
    pitch: 0,
    speed: 1,
    formant: 0,
    loopMode: 'off',
    varispeed: false,
    eqEnabled: false,
  } as any);
  const [tabInfo, setTabInfo] = useState<{ url?: string; title?: string }>({});
  const [powerOn, setPowerOn] = useState(true);
  const [hasPro, setHasPro] = useState(false);
  const [isProTrial, setIsProTrial] = useState(false);
  const [eqBands, setEqBands] = useState<EqBand[]>(DEFAULT_EQ_BANDS.map((b) => ({ ...b })));
  const [toolbarProgressVisible, setToolbarProgressVisible] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);

  const progressShowTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progressHideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progressShowDelayMs = 180;
  const progressHideGraceMs = 380;
  const permissionJustGrantedRef = useRef(false);

  // Храним tabId активной вкладки
  const activeTabIdRef = useRef<number | null>(null);

  // Scene icons (как в оригинале)
  const sceneIcons = ['light_mode', 'dark_mode', 'desktop_windows', 'computer'];
  const sceneIcon = sceneIcons[sceneIndex % sceneIcons.length];

  // Получаем tabId активной вкладки
  const getActiveTabId = useCallback(async (): Promise<number | null> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  // Отправка команды напрямую в content script активной вкладки
  // Как в оригинальном Transpose: dispatchMessage -> chrome.tabs.sendMessage(tabId, message)
  const sendCommand = useCallback(async (data: Partial<MediaState>, retryCount = 0) => {
    const tabId = activeTabIdRef.current;
    if (!tabId) {
      console.warn('[Sidepanel] No active tabId to send command');
      return;
    }

    const message = {
      sender: 'controls',
      tabId,
      ...data,
    };

    try {
      await chrome.tabs.sendMessage(tabId, message);
      console.log('[Sidepanel] Command sent directly to content script:', tabId, data);
    } catch (err) {
      console.warn('[Sidepanel] Failed to send command to content script:', String(err));
      // Если только что дали разрешение — не показываем кнопку,
      // страница перезагружается, content script временно недоступен
      if (permissionJustGrantedRef.current) {
        console.log('[Sidepanel] Permission was just granted, waiting for page reload...');
        // Пробуем ещё раз через небольшую задержку (до 3 попыток)
        if (retryCount < 3) {
          setTimeout(() => sendCommand(data, retryCount + 1), 1000);
        }
        return;
      }
      // Проверяем permissions для конкретного URL вкладки, а не для *://*/*
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const urlObj = new URL(tab.url);
        const pattern = `${urlObj.protocol}//${urlObj.hostname}/*`;
        const hasPerms = await chrome.permissions.contains({ origins: [pattern] });
        if (!hasPerms) {
          setPendingHostUrl(tab.url);
          setConnectionStatus('no-permission');
        } else {
          // Права есть, но content script пока не доступен — повторяем
          if (retryCount < 3) {
            console.log('[Sidepanel] Content script not ready yet, retrying...', retryCount + 1);
            setTimeout(() => sendCommand(data, retryCount + 1), 800);
          }
        }
      }
    }
  }, []);

  // Запрос host_permissions для указанного URL (вызывается по клику пользователя)
  const requestHostPermission = useCallback(async (url: string) => {
    try {
      const urlObj = new URL(url);
      const pattern = `${urlObj.protocol}//${urlObj.hostname}/*`;
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (granted) {
        console.log('[Sidepanel] Host permission granted for', pattern);
        setPendingHostUrl(null);
        setConnectionStatus('connecting');
        // Ставим флаг, чтобы игнорировать повторные need-permission
        permissionJustGrantedRef.current = true;
        setTimeout(() => {
          permissionJustGrantedRef.current = false;
        }, 5000);
      } else {
        console.warn('[Sidepanel] Host permission denied for', pattern);
      }
    } catch (err) {
      console.error('[Sidepanel] Error requesting host permission:', err);
    }
  }, []);

  // Listen for messages from service worker
  useEffect(() => {
    const handleMessage = (msg: ServiceWorkerMessage) => {
      if (msg.sender === 'service-worker') {
        if (msg.command === 'connect') {
          if (msg.noPermissionContext) {
            setConnectionStatus('no-permission');
          } else {
            setConnectionStatus('connected');
            if (msg.altUrl) {
              setTabInfo({ url: msg.altUrl, title: msg.altTitle });
            }
            // Сохраняем tabId
            if (msg.tabId) {
              activeTabIdRef.current = msg.tabId;
            }
          }
          // Progress bar show (как в оригинале)
          if (progressHideTimerRef.current) {
            clearTimeout(progressHideTimerRef.current);
            progressHideTimerRef.current = undefined;
          }
          if (!toolbarProgressVisible) {
            if (progressShowTimerRef.current) {
              clearTimeout(progressShowTimerRef.current);
            }
            progressShowTimerRef.current = setTimeout(() => {
              progressShowTimerRef.current = undefined;
              setToolbarProgressVisible(true);
            }, progressShowDelayMs);
          }
        }
        // Если пришёл need-permission — запоминаем URL для кнопки "Разрешить доступ"
        // Игнорируем, если только что дали разрешение (страница перезагружается)
        if ((msg as any).command === 'need-permission' && !permissionJustGrantedRef.current) {
          setPendingHostUrl((msg as any).url || null);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    // При открытии сайдпанели получаем tabId активной вкладки
    // и отправляем запрос service-worker, чтобы он ответил connect
    getActiveTabId().then((tabId) => {
      if (tabId) {
        activeTabIdRef.current = tabId;
        console.log('[Sidepanel] Active tab ID:', tabId);
      }
      // Отправляем сообщение service-worker, чтобы получить connect
      chrome.runtime.sendMessage({ sender: 'sidepanel', command: 'ping' }).catch(() => {});
    });

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      if (progressShowTimerRef.current) clearTimeout(progressShowTimerRef.current);
      if (progressHideTimerRef.current) clearTimeout(progressHideTimerRef.current);
    };
  }, [toolbarProgressVisible, getActiveTabId]);

  const handleSemitoneChange = useCallback(
    (value: number) => {
      setMedia((prev) => ({ ...prev, semitone: value }));
      sendCommand({ semitone: value });
    },
    [sendCommand],
  );

  const handleSpeedChange = useCallback(
    (value: number) => {
      setMedia((prev) => ({ ...prev, speed: value }));
      sendCommand({ speed: value });
    },
    [sendCommand],
  );

  const handleEqToggle = useCallback(
    (checked: boolean) => {
      setMedia((prev) => ({ ...prev, eqEnabled: checked }) as any);
      sendCommand({ eqEnabled: checked } as any);
    },
    [sendCommand],
  );

  const handleEqBandChange = useCallback(
    (index: number, gain: number) => {
      setEqBands((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], gain };
        return updated;
      });
      sendCommand({ eqBand: { index, gain } } as any);
    },
    [sendCommand],
  );

  const cycleScene = useCallback(() => {
    setSceneIndex((prev) => (prev + 1) % sceneIcons.length);
    // Отправляем команду смены сцены напрямую в content script
    const tabId = activeTabIdRef.current;
    if (tabId) {
      chrome.tabs
        .sendMessage(tabId, { sender: 'controls', tabId, command: 'cycle-scene' })
        .catch(() => {});
    }
  }, []);

  const saveCurrentMedia = useCallback(() => {
    const tabId = activeTabIdRef.current;
    if (tabId) {
      chrome.tabs
        .sendMessage(tabId, { sender: 'controls', tabId, command: 'save-media' })
        .catch(() => {});
    }
  }, []);

  const togglePowerOnOff = useCallback(() => {
    setPowerOn((prev) => !prev);
    const tabId = activeTabIdRef.current;
    if (tabId) {
      chrome.tabs
        .sendMessage(tabId, { sender: 'controls', tabId, command: 'toggle-power' })
        .catch(() => {});
    }
  }, []);

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  const handleGrantPermission = useCallback(() => {
    if (pendingHostUrl) {
      requestHostPermission(pendingHostUrl);
    }
  }, [pendingHostUrl, requestHostPermission]);

  return (
    <div className={`sidepanel-shell has-${currentPage}`}>
      {/* MatToolbar - как в оригинале Fd class */}
      <header className="mat-toolbar" role="toolbar">
        {/* Left section */}
        <span>
          <button
            className="mat-mdc-icon-button toolbar-action-button"
            onClick={() => setCurrentPage('history')}
            title={translate('toolbar.historyTooltip') || 'History'}>
            <span className="material-icons">queue_music</span>
          </button>
          <button
            className="mat-mdc-icon-button toolbar-action-button scene-button"
            onClick={cycleScene}
            title={translate('toolbar.sceneTooltip') || 'Change scene'}>
            <span className="material-icons">{sceneIcon}</span>
          </button>
          {/* PRO badge (как в оригинале) */}
          {hasPro && (
            <button
              className="mat-mdc-icon-button toolbar-action-button toolbar-promo-button"
              onClick={() => {}}
              title="PRO">
              <ProBadge />
            </button>
          )}
          {/* PRO trial button (как в оригинале) */}
          {isProTrial && !hasPro && (
            <button
              className="btn btn-small btn-primary toolbar-trial-button"
              onClick={() => {
                chrome.tabs.create({
                  url: chrome.runtime.getURL('sidepanel/index.html#/upgrade'),
                });
              }}>
              {translate('toolbar.trial') || 'Trial'}
            </button>
          )}
        </span>
        {/* Right section */}
        <span>
          <button
            className="mat-mdc-icon-button toolbar-action-button"
            onClick={saveCurrentMedia}
            disabled={!media}
            title={translate('toolbar.saveTooltip') || 'Save'}>
            <span className="material-icons save-toolbar-icon">save</span>
          </button>
          {/* Share button (как в оригинале, только для PRO) */}
          {hasPro && (
            <button
              className="mat-mdc-icon-button toolbar-action-button"
              onClick={() => {
                const tabId = activeTabIdRef.current;
                if (tabId) {
                  chrome.tabs
                    .sendMessage(tabId, { sender: 'controls', tabId, command: 'share-media' })
                    .catch(() => {});
                }
              }}
              title={translate('toolbar.shareTooltip') || 'Share'}>
              <span className="material-icons">share</span>
            </button>
          )}
          <button
            className="mat-mdc-icon-button toolbar-action-button"
            onClick={togglePowerOnOff}
            title={
              powerOn
                ? translate('toolbar.disableTooltip') || 'Disable'
                : translate('toolbar.enableTooltip') || 'Enable'
            }>
            <span className="material-icons">
              {powerOn ? 'power_settings_new' : 'remove_circle_outline'}
            </span>
          </button>
          <button
            className="mat-mdc-icon-button toolbar-action-button"
            onClick={() => setCurrentPage('settings')}
            title={translate('toolbar.settingsTooltip') || 'Settings'}>
            <span className="material-icons">tune</span>
          </button>
        </span>
        {/* Progress bar */}
        <div className={`mat-progress-bar ${toolbarProgressVisible ? 'visible' : ''}`}>
          <div className="mat-progress-bar-indeterminate" />
        </div>
      </header>

      {/* Subscription Alert (как в оригинале app-subscription-alert) */}
      <SubscriptionAlert />

      {/* Content Area - router-outlet аналог */}
      <main className="app-container sidepanel-content">
        {currentPage === 'main' && pendingHostUrl && (
          <div className="no-permission">
            <p>Требуется доступ к сайту</p>
            <p className="subtitle">
              Разрешите расширению доступ к {new URL(pendingHostUrl).hostname}
            </p>
            <button className="mat-mdc-raised-button" onClick={handleGrantPermission}>
              Разрешить доступ
            </button>
          </div>
        )}
        {currentPage === 'main' && !pendingHostUrl && (
          <AudioControls
            media={media}
            connectionStatus={connectionStatus}
            onSemitoneChange={handleSemitoneChange}
            onSpeedChange={handleSpeedChange}
            onEqToggle={handleEqToggle}
            eqBands={eqBands}
            onEqBandChange={handleEqBandChange}
          />
        )}
        {currentPage === 'history' && <HistoryPage isSidePanel={true} />}
        {currentPage === 'settings' && (
          <div className="empty-message">{translate('settings.title') || 'Settings'}</div>
        )}
      </main>

      {/* Pro Banner */}
      <ProBannerSidepanel />
    </div>
  );
};
