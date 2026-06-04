// ============================================================
// SidePanel App — Music Pitch Changer
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ServiceWorkerMessage, EqBand } from '../shared/types';
import { DEFAULT_EQ_BANDS } from '../shared/types';
import { useTheme } from '../shared/hooks/useTheme';
import { HistoryPage } from '../shared/components/HistoryPage';
import { TonalityCard } from '../popup/components/TonalityCard';
import { SpeedCard } from '../popup/components/SpeedCard';
import { EqCard } from '../popup/components/EqCard';
import { BpmKeyCard } from '../popup/components/BpmKeyCard';

const Logo: React.FC = () => (
  <svg width="16" height="12" viewBox="0 0 18 14" className="flex-shrink-0">
    <rect x="0" y="6" width="1.5" height="2" rx="0.5" fill="var(--accent-secondary)" />
    <rect x="2.5" y="3" width="1.5" height="8" rx="0.5" fill="var(--accent-primary)" />
    <rect x="5" y="1" width="1.5" height="12" rx="0.5" fill="var(--accent-secondary)" />
    <rect x="7.5" y="0" width="1.5" height="14" rx="0.5" fill="var(--accent-primary)" />
    <rect x="10" y="2" width="1.5" height="10" rx="0.5" fill="var(--accent-secondary)" />
    <rect x="12.5" y="4" width="1.5" height="6" rx="0.5" fill="var(--accent-primary)" />
    <rect x="15" y="5" width="1.5" height="4" rx="0.5" fill="var(--accent-secondary)" />
  </svg>
);

type Page = 'main' | 'history' | 'settings';

export const SidePanelApp: React.FC = () => {
  const { theme, toggleTheme, isDark } = useTheme();
  const [currentPage, setCurrentPage] = useState<Page>('main');
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'no-permission'
  >('connecting');
  const [pendingHostUrl, setPendingHostUrl] = useState<string | null>(null);
  const [powerOn, setPowerOn] = useState(true);
  const [semitone, setSemitone] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [bpm, setBpm] = useState(128);
  const [mediaType, setMediaType] = useState<'audio' | 'video'>('audio');
  const [eqEnabled, setEqEnabled] = useState(false);
  const [eqBands, setEqBands] = useState<EqBand[]>(DEFAULT_EQ_BANDS.map((b) => ({ ...b })));
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [detectedKey, setDetectedKey] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [uiMode, setUiMode] = useState<string>('popup');
  const [visibleComponents, setVisibleComponents] = useState<Record<string, boolean>>({
    tonality: true,
    speed: true,
    eq: true,
    bpmkey: true,
  });
  const activeTabIdRef = useRef<number | null>(null);
  const permissionJustGrantedRef = useRef(false);

  useEffect(() => {
    chrome.storage.sync.get(['uiMode', 'visibleComponents'], (data) => {
      if (data.uiMode) setUiMode(data.uiMode);
      if (data.visibleComponents)
        setVisibleComponents((prev) => ({ ...prev, ...data.visibleComponents }));
    });
  }, []);
  const getActiveTabId = useCallback(async (): Promise<number | null> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab?.id ?? null;
    } catch {
      return null;
    }
  }, []);
  const sendCommand = useCallback(async (data: Record<string, unknown>, retryCount = 0) => {
    const tabId = activeTabIdRef.current;
    if (!tabId) return;
    try {
      await chrome.tabs.sendMessage(tabId, { sender: 'controls', tabId, ...data });
    } catch (err) {
      if (permissionJustGrantedRef.current && retryCount < 3) {
        setTimeout(() => sendCommand(data, retryCount + 1), 1000);
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const urlObj = new URL(tab.url);
        const pattern = `${urlObj.protocol}//${urlObj.hostname}/*`;
        const hasPerms = await chrome.permissions.contains({ origins: [pattern] });
        if (!hasPerms) {
          setPendingHostUrl(tab.url);
          setConnectionStatus('no-permission');
        } else if (retryCount < 3) {
          setTimeout(() => sendCommand(data, retryCount + 1), 800);
        }
      }
    }
  }, []);
  const requestHostPermission = useCallback(async (url: string) => {
    try {
      const urlObj = new URL(url);
      const pattern = `${urlObj.protocol}//${urlObj.hostname}/*`;
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (granted) {
        setPendingHostUrl(null);
        setConnectionStatus('connecting');
        permissionJustGrantedRef.current = true;
        setTimeout(() => {
          permissionJustGrantedRef.current = false;
        }, 5000);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handleMessage = (msg: ServiceWorkerMessage) => {
      if (msg.sender === 'service-worker' && msg.command === 'connect') {
        if (msg.noPermissionContext) setConnectionStatus('no-permission');
        else {
          setConnectionStatus('connected');
          if (msg.tabId) activeTabIdRef.current = msg.tabId;
          if (msg.altUrl) {
            const url = msg.altUrl;
            setMediaType(
              url.includes('youtube.com') ||
                url.includes('youtu.be') ||
                url.includes('vkvideo.ru') ||
                url.includes('vk.com/video') ||
                url.includes('rutube.ru') ||
                url.includes('twitch.tv') ||
                url.includes('vimeo.com') ||
                url.includes('dailymotion.com')
                ? 'video'
                : 'audio',
            );
          }
        }
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    getActiveTabId().then((tabId) => {
      if (tabId) activeTabIdRef.current = tabId;
      chrome.runtime.sendMessage({ sender: 'sidepanel', command: 'ping' }).catch(() => {});
    });
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [getActiveTabId]);

  const handleSemitoneChange = useCallback(
    (v: number) => {
      setSemitone(v);
      sendCommand({ semitone: v });
    },
    [sendCommand],
  );
  const handleBpmChange = useCallback(
    (v: number) => {
      setBpm(v);
      setSpeed(1);
      sendCommand({ speed: v / 128 });
    },
    [sendCommand],
  );
  const handleSpeedChange = useCallback(
    (v: number) => {
      setSpeed(v);
      sendCommand({ speed: v });
    },
    [sendCommand],
  );
  const handleEqToggle = useCallback(
    (c: boolean) => {
      setEqEnabled(c);
      sendCommand({ eqEnabled: c });
    },
    [sendCommand],
  );
  const handleEqBandChange = useCallback(
    (i: number, g: number) => {
      setEqBands((p) => {
        const u = [...p];
        u[i] = { ...u[i], gain: g };
        return u;
      });
      sendCommand({ eqBand: { index: i, gain: g } });
    },
    [sendCommand],
  );
  const handleVisibleComponentToggle = useCallback((key: string) => {
    setVisibleComponents((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      chrome.storage.sync.set({ visibleComponents: updated });
      return updated;
    });
  }, []);
  const togglePower = useCallback(() => {
    setPowerOn((p) => !p);
    sendCommand({ command: 'toggle-power' });
  }, [sendCommand]);

  const tbBtn =
    'w-6 h-6 rounded-full border-0 bg-transparent cursor-pointer flex items-center justify-center text-[13px] flex-shrink-0';

  const renderHeader = () => (
    <header
      className="flex items-center px-2 py-2 border-b gap-1.5 flex-shrink-0"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        height: '40px',
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
      }}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Logo />
        <span
          className="font-semibold tracking-[0.3px] uppercase truncate"
          style={{ fontSize: '11px', color: 'var(--text-primary)' }}>
          MUSIC PITCH CHANGER
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          className={tbBtn + ' text-[11px] font-semibold'}
          style={{ color: powerOn ? 'var(--accent-secondary)' : 'var(--text-muted)' }}
          onClick={togglePower}
          title={powerOn ? 'Выключить обработку' : 'Включить обработку'}>
          {powerOn ? 'ON' : 'OFF'}
        </button>
        <button
          className={tbBtn + ' text-[15px]'}
          style={{ color: 'var(--text-secondary)' }}
          onClick={() => setCurrentPage('settings')}
          title="Настройки">
          ⚙
        </button>
        <span style={{ fontSize: '11px' }}>{isDark ? '🌙' : '☀️'}</span>
        <div
          onClick={toggleTheme}
          className="relative cursor-pointer rounded-full flex-shrink-0"
          style={{
            width: '22px',
            height: '12px',
            background: isDark ? 'var(--toggle-active-bg)' : 'var(--toggle-bg)',
          }}>
          <div
            className="absolute top-0.5 rounded-full transition-all"
            style={{
              width: '8px',
              height: '8px',
              background: 'var(--toggle-knob)',
              left: isDark ? '12px' : '2px',
            }}
          />
        </div>
      </div>
    </header>
  );

  const renderMain = () => (
    <div className="flex-1 p-3" style={{ overflowY: 'auto' }}>
      {pendingHostUrl && (
        <div
          className="flex flex-col items-center justify-center gap-3 py-10 text-center"
          style={{ color: 'var(--text-secondary)' }}>
          <p>Требуется доступ к сайту</p>
          <button
            onClick={() => requestHostPermission(pendingHostUrl)}
            className="px-4 py-2 rounded-lg border-0 cursor-pointer font-medium text-white text-[12px]"
            style={{ background: 'var(--accent-primary)' }}>
            Разрешить доступ
          </button>
        </div>
      )}
      {!pendingHostUrl && connectionStatus === 'connecting' && (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <div
            className="w-8 h-8 rounded-full border-[3px] animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent-secondary)' }}
          />
          <div className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            Подключение...
          </div>
        </div>
      )}
      {!pendingHostUrl && connectionStatus === 'connected' && (
        <>
          {visibleComponents.tonality && (
            <TonalityCard semitone={semitone} onChange={handleSemitoneChange} />
          )}
          {visibleComponents.speed && (
            <SpeedCard
              mediaType={mediaType}
              bpm={bpm}
              speed={speed}
              onBpmChange={handleBpmChange}
              onSpeedChange={handleSpeedChange}
            />
          )}
          {visibleComponents.eq && (
            <EqCard
              enabled={eqEnabled}
              bands={eqBands}
              onToggle={handleEqToggle}
              onBandChange={handleEqBandChange}
            />
          )}
          {visibleComponents.bpmkey && (
            <BpmKeyCard bpm={detectedBpm} keyCamelot={detectedKey} isLoading={isDetecting} />
          )}
        </>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="flex-1 p-3" style={{ overflowY: 'auto' }}>
      <button
        onClick={() => setCurrentPage('main')}
        className="flex items-center gap-1 mb-3 border-0 bg-transparent cursor-pointer"
        style={{ color: 'var(--accent-secondary)', fontSize: '11px' }}>
        ← Назад
      </button>
      <h3
        className="font-semibold tracking-wider mb-3"
        style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        Настройки
      </h3>
      <div className="flex justify-between items-center py-2">
        <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
          Тема
        </span>
        <div className="flex items-center gap-2">
          <span>{isDark ? '🌙' : '☀️'}</span>
          <div
            onClick={toggleTheme}
            className="relative cursor-pointer rounded-full"
            style={{
              width: '28px',
              height: '14px',
              background: isDark ? 'var(--toggle-active-bg)' : 'var(--toggle-bg)',
            }}>
            <div
              className="absolute top-0.5 rounded-full transition-all"
              style={{
                width: '10px',
                height: '10px',
                background: 'var(--toggle-knob)',
                left: isDark ? '16px' : '2px',
              }}
            />
          </div>
        </div>
      </div>
      <div
        className="flex justify-between items-center py-2 border-t"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
          Режим интерфейса
        </span>
        <select
          className="rounded px-2 py-1 text-[11px] border"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border)',
          }}
          value={uiMode}
          onChange={(e) => {
            setUiMode(e.target.value);
            chrome.storage.sync.set({ uiMode: e.target.value });
          }}>
          <option value="popup">Popup</option>
          <option value="sidepanel">Side Panel</option>
        </select>
      </div>
      <div className="border-t py-2" style={{ borderColor: 'var(--border)' }}>
        <span className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
          Компоненты
        </span>
        {[
          { key: 'tonality', label: 'Тональность' },
          { key: 'speed', label: 'Скорость' },
          { key: 'eq', label: 'Эквалайзер' },
          { key: 'bpmkey', label: 'BPM & Key' },
        ].map(({ key, label }) => (
          <div key={key} className="flex justify-between items-center py-1.5">
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {label}
            </span>
            <div
              onClick={() => handleVisibleComponentToggle(key)}
              className="relative cursor-pointer rounded-full"
              style={{
                width: '28px',
                height: '14px',
                background: visibleComponents[key] ? 'var(--toggle-active-bg)' : 'var(--toggle-bg)',
              }}>
              <div
                className="absolute top-0.5 rounded-full transition-all"
                style={{
                  width: '10px',
                  height: '10px',
                  background: 'var(--toggle-knob)',
                  left: visibleComponents[key] ? '16px' : '2px',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {renderHeader()}
      {currentPage === 'main' && renderMain()}
      {currentPage === 'history' && (
        <div className="flex-1 flex flex-col" style={{ overflowY: 'auto' }}>
          <button
            onClick={() => setCurrentPage('main')}
            className="flex items-center gap-1 mx-4 mt-3 mb-1 border-0 bg-transparent cursor-pointer flex-shrink-0"
            style={{ color: 'var(--accent-secondary)', fontSize: '11px' }}>
            ← Назад
          </button>
          <div className="flex-1" style={{ overflowY: 'auto' }}>
            <HistoryPage isSidePanel={true} />
          </div>
        </div>
      )}
      {currentPage === 'settings' && renderSettings()}
    </div>
  );
};
