// ============================================================
// SidePanel App - отправляет команды напрямую в content script
// через chrome.tabs.sendMessage (как в оригинальном Transpose)
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AudioControls } from '../shared/AudioControls';
import type { MediaState, ServiceWorkerMessage, EqBand } from '../shared/types';
import { DEFAULT_EQ_BANDS } from '../shared/types';

// --- i18n helper ---
const t = (key: string, ...args: string[]): string => {
  let msg = chrome.i18n.getMessage(key, args);
  return msg || key;
};

// ============================================================
// MediaItem (for history)
// ============================================================

interface MediaItem {
  id: string;
  title: string;
  url: string;
  timestamp: number;
  semitone: number;
  pitch: number;
  speed: number;
  formant: number;
  loopMode: string;
  varispeed: boolean;
  eqEnabled: boolean;
}

interface Playlist {
  id: string;
  name: string;
  items: MediaItem[];
}

const MediaItemComponent: React.FC<{
  media: MediaItem;
  allowEdit: boolean;
  onDelete: (id: string) => void;
  onClick: (media: MediaItem) => void;
}> = ({ media, allowEdit, onDelete, onClick }) => {
  const formattedDate = new Date(media.timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="media-item" onClick={() => onClick(media)}>
      <div className="media-item-info">
        <div className="media-item-title">{media.title || 'Untitled'}</div>
        <div className="media-item-meta">
          <span className="media-item-date">{formattedDate}</span>
          {media.semitone !== 0 && <span className="media-item-badge">±{media.semitone}</span>}
          {media.speed !== 1 && <span className="media-item-badge">{media.speed}x</span>}
        </div>
      </div>
      {allowEdit && (
        <button
          className="media-item-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(media.id);
          }}
          title="Delete">
          <span className="material-icons">close</span>
        </button>
      )}
    </div>
  );
};

// ============================================================
// RecentHistoryTab
// ============================================================

interface RecentHistoryTabProps {
  mediaList: MediaItem[];
  onDelete: (id: string) => void;
  onClick: (media: MediaItem) => void;
}

const RecentHistoryTab: React.FC<RecentHistoryTabProps> = ({ mediaList, onDelete, onClick }) => {
  return (
    <div className="history-list">
      {mediaList.map((media) => (
        <MediaItemComponent
          key={media.id}
          media={media}
          allowEdit={true}
          onDelete={onDelete}
          onClick={onClick}
        />
      ))}
    </div>
  );
};

// ============================================================
// RenamePlaylistDialog
// ============================================================

interface RenameDialogProps {
  currentName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

const RenamePlaylistDialog: React.FC<RenameDialogProps> = ({
  currentName,
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onConfirm(name.trim());
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Rename Playlist</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="dialog-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit">Rename</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// DeleteConfirmDialog
// ============================================================

interface DeleteConfirmProps {
  itemName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmDialog: React.FC<DeleteConfirmProps> = ({ itemName, onConfirm, onCancel }) => {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Delete</h3>
        <p>Are you sure you want to delete "{itemName}"?</p>
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PlaylistRow
// ============================================================

interface PlaylistRowProps {
  playlist: Playlist;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}

const PlaylistRow: React.FC<PlaylistRowProps> = ({ playlist, onRename, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sortedItems = [...playlist.items].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="playlist-row">
      <div className="playlist-header" onClick={() => setExpanded(!expanded)}>
        <span className="material-icons">{expanded ? 'expand_more' : 'chevron_right'}</span>
        <span className="playlist-name">{playlist.name}</span>
        <span className="playlist-count">{playlist.items.length}</span>
        <div className="playlist-menu-container" ref={menuRef}>
          <button
            className="mat-mdc-icon-button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}>
            <span className="material-icons">more_vert</span>
          </button>
          {showMenu && (
            <div className="playlist-menu">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  setShowRenameDialog(true);
                }}>
                Rename
              </button>
              <button
                className="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  setShowDeleteDialog(true);
                }}>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {expanded && (
        <div className="playlist-items">
          {sortedItems.length === 0 ? (
            <div className="empty-message">No items</div>
          ) : (
            sortedItems.map((item) => (
              <MediaItemComponent
                key={item.id}
                media={item}
                allowEdit={false}
                onDelete={() => {}}
                onClick={() => {}}
              />
            ))
          )}
        </div>
      )}
      {showRenameDialog && (
        <RenamePlaylistDialog
          currentName={playlist.name}
          onConfirm={(newName) => {
            onRename(playlist.id, newName);
            setShowRenameDialog(false);
          }}
          onCancel={() => setShowRenameDialog(false)}
        />
      )}
      {showDeleteDialog && (
        <DeleteConfirmDialog
          itemName={playlist.name}
          onConfirm={() => {
            onDelete(playlist.id);
            setShowDeleteDialog(false);
          }}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
    </div>
  );
};

// ============================================================
// PlaylistTab
// ============================================================

interface PlaylistTabProps {
  playlists: Playlist[];
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}

const PlaylistTab: React.FC<PlaylistTabProps> = ({ playlists, onRename, onDelete }) => {
  const [sortOrder, setSortOrder] = useState<'date' | 'name'>('date');

  useEffect(() => {
    loadFromChrome<'date' | 'name'>('playlistSortOrder', 'date').then(setSortOrder);
  }, []);

  const handleToggle = useCallback((playlistId: string) => {
    // handled inside PlaylistRow
  }, []);

  const handleSortChange = useCallback((order: 'date' | 'name') => {
    setSortOrder(order);
    saveToChrome('playlistSortOrder', order);
  }, []);

  const sortedPlaylists = [...playlists].sort((a, b) => {
    if (sortOrder === 'name') return a.name.localeCompare(b.name);
    const aMax = Math.max(...a.items.map((i) => i.timestamp), 0);
    const bMax = Math.max(...b.items.map((i) => i.timestamp), 0);
    return bMax - aMax;
  });

  return (
    <div className="playlist-tab">
      <div className="sort-controls">
        <button
          className={sortOrder === 'date' ? 'active' : ''}
          onClick={() => handleSortChange('date')}>
          Date
        </button>
        <button
          className={sortOrder === 'name' ? 'active' : ''}
          onClick={() => handleSortChange('name')}>
          Name
        </button>
      </div>
      {sortedPlaylists.map((playlist) => (
        <PlaylistRow
          key={playlist.id}
          playlist={playlist}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

// ============================================================
// HistoryPage
// ============================================================

interface HistoryPageProps {
  isSidePanel?: boolean;
}

const HistoryPage: React.FC<HistoryPageProps> = ({ isSidePanel = false }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    chrome.storage.local.get(['recentMedia', 'playlists'], (result) => {
      if (result.recentMedia) setMediaList(result.recentMedia);
      if (result.playlists) setPlaylists(result.playlists);
    });
  }, []);

  const handleTabChange = useCallback((index: number) => {
    setActiveTab(index);
  }, []);

  const handleDeleteMedia = useCallback(
    (id: string) => {
      const updated = mediaList.filter((m) => m.id !== id);
      setMediaList(updated);
      chrome.storage.local.set({ recentMedia: updated });
    },
    [mediaList],
  );

  const handleDeletePlaylist = useCallback(
    (id: string) => {
      const updated = playlists.filter((p) => p.id !== id);
      setPlaylists(updated);
      chrome.storage.local.set({ playlists: updated });
    },
    [playlists],
  );

  const handleRenamePlaylist = useCallback(
    (id: string, newName: string) => {
      const updated = playlists.map((p) => (p.id === id ? { ...p, name: newName } : p));
      setPlaylists(updated);
      chrome.storage.local.set({ playlists: updated });
    },
    [playlists],
  );

  return (
    <div className="history-page">
      <div className="history-tabs">
        <button className={activeTab === 0 ? 'active' : ''} onClick={() => handleTabChange(0)}>
          Recent
        </button>
        <button className={activeTab === 1 ? 'active' : ''} onClick={() => handleTabChange(1)}>
          Playlists
        </button>
      </div>
      {activeTab === 0 && (
        <RecentHistoryTab mediaList={mediaList} onDelete={handleDeleteMedia} onClick={() => {}} />
      )}
      {activeTab === 1 && (
        <PlaylistTab
          playlists={playlists}
          onRename={handleRenamePlaylist}
          onDelete={handleDeletePlaylist}
        />
      )}
    </div>
  );
};

// ============================================================
// ProBadge
// ============================================================

const ProBadge: React.FC = () => (
  <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="14" rx="3" fill="#FFD700" />
    <text
      x="11"
      y="10"
      textAnchor="middle"
      fill="black"
      fontSize="8"
      fontWeight="bold"
      fontFamily="Arial">
      PRO
    </text>
  </svg>
);

// ============================================================
// Storage helpers
// ============================================================

function loadFromChrome<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] !== undefined ? result[key] : fallback);
    });
  });
}

function saveToChrome<T>(key: string, value: T): void {
  chrome.storage.local.set({ [key]: value });
}

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
            title={t('toolbar.historyTooltip') || 'History'}>
            <span className="material-icons">queue_music</span>
          </button>
          <button
            className="mat-mdc-icon-button toolbar-action-button scene-button"
            onClick={cycleScene}
            title={t('toolbar.sceneTooltip') || 'Change scene'}>
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
              {t('toolbar.trial') || 'Trial'}
            </button>
          )}
        </span>
        {/* Right section */}
        <span>
          <button
            className="mat-mdc-icon-button toolbar-action-button"
            onClick={saveCurrentMedia}
            disabled={!media}
            title={t('toolbar.saveTooltip') || 'Save'}>
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
              title={t('toolbar.shareTooltip') || 'Share'}>
              <span className="material-icons">share</span>
            </button>
          )}
          <button
            className="mat-mdc-icon-button toolbar-action-button"
            onClick={togglePowerOnOff}
            title={
              powerOn
                ? t('toolbar.disableTooltip') || 'Disable'
                : t('toolbar.enableTooltip') || 'Enable'
            }>
            <span className="material-icons">
              {powerOn ? 'power_settings_new' : 'remove_circle_outline'}
            </span>
          </button>
          <button
            className="mat-mdc-icon-button toolbar-action-button"
            onClick={() => setCurrentPage('settings')}
            title={t('toolbar.settingsTooltip') || 'Settings'}>
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
          <div className="empty-message">{t('settings.title') || 'Settings'}</div>
        )}
      </main>

      {/* Pro Banner */}
      <ProBannerSidepanel />
    </div>
  );
};
