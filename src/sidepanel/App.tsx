// ============================================================
// SidePanel App — Music Pitch Changer
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  const [masterTempo, setMasterTempo] = useState(false);
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [detectedKey, setDetectedKey] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showMT, setShowMT] = useState(true);
  const [isDrmSite, setIsDrmSite] = useState(false);

  const effectiveBpm = useMemo(() => {
    if (detectedBpm !== null) {
      return Math.round(detectedBpm * speed);
    }
    return null;
  }, [detectedBpm, speed]);

  const [uiMode, setUiMode] = useState<string>('popup');
  const [visibleComponents, setVisibleComponents] = useState<Record<string, boolean>>({
    tonality: true,
    speed: true,
    eq: true,
    bpmkey: true,
  });
  const activeTabIdRef = useRef<number | null>(null);
  const eqStorageKeyRef = useRef<string | null>(null);
  const permissionJustGrantedRef = useRef(false);

  useEffect(() => {
    chrome.storage.sync.get(['uiMode', 'visibleComponents'], (data) => {
      if (data.uiMode) setUiMode(data.uiMode);
      if (data.visibleComponents)
        setVisibleComponents((prev) => ({ ...prev, ...data.visibleComponents }));
    });
    chrome.storage.local.get(['isDetecting', 'isDrmSite'], (data) => {
      if (data.isDetecting !== undefined) setIsDetecting(data.isDetecting);
      if (data.isDrmSite) setIsDrmSite(true);
    });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || '';
      const drm = url.includes('spotify.com') || url.includes('soundcloud.com');
      setIsDrmSite(drm);
      if (!drm) {
        chrome.storage.local.remove('isDrmSite').catch(() => {});
      }

      const tabId = tabs[0]?.id;
      if (tabId) {
        activeTabIdRef.current = tabId;
        chrome.storage.local.get(['eqSettings'], (data) => {
          const saved = data['eqSettings'];
          if (saved && typeof saved === 'object') {
            if (saved.bands && Array.isArray(saved.bands) && saved.bands.length === 6) {
              setEqBands(saved.bands);
              if (saved.enabled) {
                saved.bands.forEach((band: any, i: number) => {
                  if (band.gain !== undefined && band.gain !== 0) {
                    sendCommand({ eqBand: { index: i, gain: band.gain } });
                  }
                });
              }
            }
            if (typeof saved.enabled === 'boolean') {
              setEqEnabled(saved.enabled);
              if (saved.enabled) {
                sendCommand({ eqEnabled: true });
              }
            }
            if (typeof saved.preset === 'string' && saved.preset) {
              setSavedPreset(saved.preset);
            }
          }
        });
      }
    });
    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      console.log('[SidePanel] storage.onChanged:', Object.keys(changes));
      if (changes.isDetecting !== undefined) {
        console.log('[SidePanel] storage.onChanged isDetecting:', changes.isDetecting.newValue);
        setIsDetecting(changes.isDetecting.newValue);
      }
      if (changes.isDrmSite?.newValue) {
        setIsDrmSite(true);
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    const pollInterval = setInterval(() => {
      chrome.storage.local.get(['isDetecting'], (data) => {
        if (data.isDetecting !== undefined) setIsDetecting(data.isDetecting);
      });
    }, 1000);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      clearInterval(pollInterval);
    };
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
    let tabId = activeTabIdRef.current;
    if (!tabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id ?? null;
      if (tabId) activeTabIdRef.current = tabId;
    }
    if (!tabId) return;
    const msg = { sender: 'controls', tabId, ...data };

    try {
      await chrome.tabs.sendMessage(tabId, msg);
      return;
    } catch {
      // main frame failed, try all frames
    }

    try {
      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      if (!frames) return;
      for (const frame of frames) {
        if (frame.frameId === 0) continue;
        try {
          await chrome.tabs.sendMessage(tabId, msg, { frameId: frame.frameId });
          return;
        } catch {
          // try next frame
        }
      }
    } catch {
      // webNavigation may not be available
    }

    if (permissionJustGrantedRef.current && retryCount < 3) {
      setTimeout(() => sendCommand(data, retryCount + 1), 1000);
      return;
    }
    if (retryCount < 3) {
      setTimeout(() => sendCommand(data, retryCount + 1), 800);
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
    const handleMessage = (msg: ServiceWorkerMessage | any) => {
      if (msg.type === 'METRICS_UPDATE') {
        if (
          msg._sourceTabId !== undefined &&
          activeTabIdRef.current !== null &&
          msg._sourceTabId !== activeTabIdRef.current
        ) {
          return;
        }
        const p = msg.payload || msg;
        if (p.bpm !== undefined) setDetectedBpm(p.bpm);
        if (p.key !== undefined) setDetectedKey(p.key);
        if (p.isCapturing) setIsDetecting(false);
        return;
      }
      if (msg.sender === 'service-worker' && msg.command === 'connect') {
        if (msg.noPermissionContext) setConnectionStatus('no-permission');
        else {
          const isNewTab = msg.tabId && activeTabIdRef.current !== msg.tabId;
          setConnectionStatus('connected');
          setIsDetecting(true);
          if (msg.tabId) activeTabIdRef.current = msg.tabId;
          if (isNewTab) {
            setDetectedBpm(null);
            setDetectedKey(null);
            setSpeed(1);
            setBpm(128);
            setSemitone(0);
            chrome.storage.local
              .remove(['detectedBpm', 'detectedKey', 'popupSpeed', 'popupSemitone'])
              .catch(() => {});
          }
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
            setShowMT(
              !url.includes('spotify.com') &&
                !url.includes('beatport.com') &&
                !url.includes('youtube.com') &&
                !url.includes('youtu.be') &&
                !url.includes('vk.com') &&
                !url.includes('vkvideo.ru'),
            );
            (async () => {
              const urlObj = new URL(url);
              const pattern = `${urlObj.protocol}//${urlObj.hostname}/*`;
              const hasPerms = await chrome.permissions.contains({ origins: [pattern] });
              if (!hasPerms) {
                setPendingHostUrl(url);
                setConnectionStatus('no-permission');
              }
            })();
          }
          chrome.storage.local.get(['popupSpeed', 'popupSemitone', 'popupMasterTempo'], (data) => {
            if (data.popupSpeed !== undefined) {
              setSpeed(data.popupSpeed);
              setBpm(Math.round(data.popupSpeed * 128));
            }
            if (data.popupSemitone !== undefined) setSemitone(data.popupSemitone);
            if (data.popupMasterTempo !== undefined) setMasterTempo(data.popupMasterTempo);
          });
        }
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    getActiveTabId().then((tabId) => {
      if (tabId) activeTabIdRef.current = tabId;
      chrome.runtime.sendMessage({ sender: 'sidepanel', command: 'ping' }).catch(() => {});
    });
    const keepalive = setInterval(() => {
      chrome.runtime.sendMessage({ sender: 'sidepanel', command: 'ping' }).catch(() => {});
    }, 20000);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      clearInterval(keepalive);
    };
  }, [getActiveTabId]);

  const saveState = useCallback((s: number, sm: number, mt: boolean) => {
    chrome.storage.local
      .set({ popupSpeed: s, popupSemitone: sm, popupMasterTempo: mt })
      .catch(() => {});
  }, []);

  const handleSemitoneChange = useCallback(
    (v: number) => {
      setSemitone(v);
      saveState(speed, v, masterTempo);
      sendCommand({ semitone: v });
    },
    [sendCommand, speed, masterTempo, saveState],
  );
  const handleBpmChange = useCallback(
    (v: number) => {
      setBpm(v);
      const newSpeed = v / 128;
      setSpeed(newSpeed);
      saveState(newSpeed, semitone, masterTempo);
      sendCommand({ speed: newSpeed });
    },
    [sendCommand, semitone, masterTempo, saveState],
  );
  const handleSpeedChange = useCallback(
    (v: number) => {
      setSpeed(v);
      saveState(v, semitone, masterTempo);
      sendCommand({ speed: v });
    },
    [sendCommand, semitone, masterTempo, saveState],
  );
  const handleEqToggle = useCallback(
    (c: boolean) => {
      setEqEnabled(c);
      const eqSettings = { enabled: c, bands: eqBands };
      chrome.storage.local.set({ eqSettings }).catch(() => {});
      sendCommand({ eqEnabled: c });
    },
    [sendCommand, eqBands],
  );
  const handleMasterTempoToggle = useCallback(() => {
    setMasterTempo((prev) => {
      const next = !prev;
      saveState(speed, semitone, next);
      sendCommand({ masterTempo: next });
      return next;
    });
  }, [sendCommand, speed, semitone, saveState]);

  const handleResetTonality = useCallback(() => {
    setSemitone(0);
    sendCommand({ semitone: 0 });
  }, [sendCommand]);

  const handleResetSpeed = useCallback(() => {
    setSpeed(1);
    setBpm(128);
    saveState(1, semitone, masterTempo);
    sendCommand({ speed: 1 });
  }, [sendCommand, semitone, masterTempo, saveState]);

  const [savedPreset, setSavedPreset] = useState<string>('flat');

  const handleResetEq = useCallback(() => {
    const defaultBands = DEFAULT_EQ_BANDS.map((b) => ({ ...b }));
    setEqBands(defaultBands);
    setSavedPreset('flat');
    chrome.storage.local
      .set({ eqSettings: { enabled: false, bands: defaultBands, preset: 'flat' } })
      .catch(() => {});
    DEFAULT_EQ_BANDS.forEach((_, i) => {
      sendCommand({ eqBand: { index: i, gain: 0 } });
    });
  }, [sendCommand]);

  const handlePresetSelect = useCallback(
    (presetName: string, gains: number[]) => {
      const newBands = DEFAULT_EQ_BANDS.map((b, i) => ({ ...b, gain: gains[i] ?? 0 }));
      setEqBands(newBands);
      setSavedPreset(presetName);
      chrome.storage.local
        .set({ eqSettings: { enabled: true, bands: newBands, preset: presetName } })
        .catch(() => {});
      gains.forEach((g, i) => {
        sendCommand({ eqBand: { index: i, gain: g } });
      });
    },
    [sendCommand],
  );

  const handleEqBandChange = useCallback(
    (i: number, g: number) => {
      setEqBands((p) => {
        const u = [...p];
        u[i] = { ...u[i], gain: g };
        const eqSettings = { enabled: true, bands: u };
        chrome.storage.local.set({ eqSettings }).catch(() => {});
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
            <TonalityCard
              semitone={semitone}
              onChange={handleSemitoneChange}
              onReset={handleResetTonality}
            />
          )}
          {visibleComponents.speed && (
            <SpeedCard
              mediaType={mediaType}
              bpm={bpm}
              speed={speed}
              masterTempo={masterTempo}
              showMT={showMT}
              onBpmChange={handleBpmChange}
              onSpeedChange={handleSpeedChange}
              onMasterTempoToggle={handleMasterTempoToggle}
              onReset={handleResetSpeed}
              detectedBpm={detectedBpm}
            />
          )}
          {visibleComponents.eq && (
            <EqCard
              enabled={eqEnabled}
              bands={eqBands}
              savedPreset={savedPreset}
              onToggle={handleEqToggle}
              onBandChange={handleEqBandChange}
              onReset={handleResetEq}
              onPresetSelect={handlePresetSelect}
            />
          )}
          {visibleComponents.bpmkey && !isDrmSite && (
            <BpmKeyCard bpm={effectiveBpm} keyCamelot={detectedKey} isLoading={isDetecting} />
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
