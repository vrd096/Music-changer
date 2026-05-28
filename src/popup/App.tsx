// ============================================================
// Popup App - отправляет команды напрямую в content script
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
// PopupApp
// ============================================================

export const PopupApp: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'main' | 'history' | 'settings'>('main');
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
  const [eqBands, setEqBands] = useState<EqBand[]>(DEFAULT_EQ_BANDS.map((b) => ({ ...b })));
  const [toolbarProgressVisible, setToolbarProgressVisible] = useState(false);
  const [hasPro] = useState(false);
  const progressShowTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progressHideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const progressShowDelayMs = 180;
  const progressHideGraceMs = 380;

  // Храним tabId активной вкладки
  const activeTabIdRef = useRef<number | null>(null);

  // Флаг, что разрешения только что были даны (чтобы не показывать кнопку доступа)
  const permissionJustGrantedRef = useRef(false);

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
      console.warn('[Popup] No active tabId to send command');
      return;
    }

    const message = {
      sender: 'controls',
      tabId,
      ...data,
    };

    try {
      await chrome.tabs.sendMessage(tabId, message);
      console.log('[Popup] Command sent directly to content script:', tabId, data);
    } catch (err) {
      console.warn('[Popup] Failed to send command to content script:', String(err));
      // Если только что дали разрешение — не показываем кнопку,
      // страница перезагружается, content script временно недоступен
      if (permissionJustGrantedRef.current) {
        console.log('[Popup] Permission was just granted, waiting for page reload...');
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
            console.log('[Popup] Content script not ready yet, retrying...', retryCount + 1);
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
        console.log('[Popup] Host permission granted for', pattern);
        setPendingHostUrl(null);
        setConnectionStatus('connecting');
        // Ставим флаг, чтобы игнорировать повторные need-permission
        permissionJustGrantedRef.current = true;
        setTimeout(() => {
          permissionJustGrantedRef.current = false;
        }, 5000);
      } else {
        console.warn('[Popup] Host permission denied for', pattern);
      }
    } catch (err) {
      console.error('[Popup] Error requesting host permission:', err);
    }
  }, []);

  // Слушаем статус соединения от service worker
  useEffect(() => {
    const handleMessage = (msg: ServiceWorkerMessage) => {
      if (msg.sender === 'service-worker') {
        if (msg.command === 'connect') {
          if (msg.noPermissionContext) {
            setConnectionStatus('no-permission');
          } else {
            setConnectionStatus('connected');
            // Сохраняем tabId
            if (msg.tabId) {
              activeTabIdRef.current = msg.tabId;
            }
          }
          // Progress bar show
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

    // При открытии попапа получаем tabId активной вкладки
    // и отправляем запрос service-worker, чтобы он ответил connect
    getActiveTabId().then((tabId) => {
      if (tabId) {
        activeTabIdRef.current = tabId;
        console.log('[Popup] Active tab ID:', tabId);
      }
      // Отправляем сообщение service-worker, чтобы получить connect
      chrome.runtime.sendMessage({ sender: 'popup', command: 'ping' }).catch(() => {});
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

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  const handleGrantPermission = useCallback(() => {
    if (pendingHostUrl) {
      requestHostPermission(pendingHostUrl);
    }
  }, [pendingHostUrl, requestHostPermission]);

  return (
    <div className={`app-content-container popup has-${currentPage}`}>
      {/* MatToolbar - как в оригинале Angular */}
      <header className="mat-toolbar" role="toolbar">
        {/* Left section */}
        <span>
          <button
            className="mat-mdc-icon-button"
            onClick={() => setCurrentPage('history')}
            title={translate('history.title') || 'History'}>
            <span className="material-icons">queue_music</span>
          </button>
          {hasPro && (
            <button className="mat-mdc-icon-button" title="PRO">
              <ProBadge />
            </button>
          )}
        </span>
        {/* Title - клик возвращает на главную (AudioControls) */}
        <span>
          <button
            className="mat-mdc-icon-button toolbar-title-button"
            onClick={() => setCurrentPage('main')}
            title={translate('toolbar.mainTooltip') || 'Main'}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>Transpose ▲▼</span>
          </button>
        </span>
        {/* Right section */}
        <span>
          <button
            className="mat-mdc-icon-button"
            onClick={() => setCurrentPage('settings')}
            title={translate('settings.title') || 'Settings'}>
            <span className="material-icons">tune</span>
          </button>
        </span>
        {/* Progress bar */}
        <div className={`mat-progress-bar ${toolbarProgressVisible ? 'visible' : ''}`}>
          <div className="mat-progress-bar-indeterminate" />
        </div>
      </header>

      {/* Content Area - router-outlet аналог */}
      <main className="app-container">
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
        {currentPage === 'history' && <HistoryPage isSidePanel={false} />}
        {currentPage === 'settings' && (
          <div className="empty-message">{translate('settings.title') || 'Settings'}</div>
        )}
      </main>
    </div>
  );
};
