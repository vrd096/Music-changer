import React, { useState, useEffect, useCallback, useRef } from 'react';
import { loadFromStorage, saveToStorage } from '../storage';

// ============================================================
// Types
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

// ============================================================
// MediaItemComponent
// ============================================================

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
// RenamePlaylistDialog
// ============================================================

const RenamePlaylistDialog: React.FC<{
  currentName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}> = ({ currentName, onConfirm, onCancel }) => {
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

const DeleteConfirmDialog: React.FC<{
  itemName: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ itemName, onConfirm, onCancel }) => (
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

// ============================================================
// PlaylistRow
// ============================================================

const PlaylistRow: React.FC<{
  playlist: Playlist;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}> = ({ playlist, onRename, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
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

const PlaylistTab: React.FC<{
  playlists: Playlist[];
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}> = ({ playlists, onRename, onDelete }) => {
  const [sortOrder, setSortOrder] = useState<'date' | 'name'>('date');

  useEffect(() => {
    loadFromStorage<'date' | 'name'>('playlistSortOrder', 'date').then(setSortOrder);
  }, []);

  const handleSortChange = useCallback((order: 'date' | 'name') => {
    setSortOrder(order);
    saveToStorage('playlistSortOrder', order);
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
// RecentHistoryTab
// ============================================================

const RecentHistoryTab: React.FC<{
  mediaList: MediaItem[];
  onDelete: (id: string) => void;
  onClick: (media: MediaItem) => void;
}> = ({ mediaList, onDelete, onClick }) => (
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

// ============================================================
// HistoryPage (public export)
// ============================================================

interface HistoryPageProps {
  isSidePanel?: boolean;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ isSidePanel = false }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    chrome.storage.local.get(['recentMedia', 'playlists'], (result) => {
      if (result.recentMedia) setMediaList(result.recentMedia);
      if (result.playlists) setPlaylists(result.playlists);
    });
  }, []);

  const handleDeleteMedia = useCallback((id: string) => {
    setMediaList((prev) => {
      const updated = prev.filter((m) => m.id !== id);
      chrome.storage.local.set({ recentMedia: updated });
      return updated;
    });
  }, []);

  const handleDeletePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      chrome.storage.local.set({ playlists: updated });
      return updated;
    });
  }, []);

  const handleRenamePlaylist = useCallback((id: string, newName: string) => {
    setPlaylists((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, name: newName } : p));
      chrome.storage.local.set({ playlists: updated });
      return updated;
    });
  }, []);

  return (
    <div className="history-page">
      <div className="history-tabs">
        <button className={activeTab === 0 ? 'active' : ''} onClick={() => setActiveTab(0)}>
          Recent
        </button>
        <button className={activeTab === 1 ? 'active' : ''} onClick={() => setActiveTab(1)}>
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
