/* global __APP_VERSION__ */
import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  Check,
  Square,
  Share2,
  ShoppingCart,
  Wifi,
  WifiOff,
  Users,
  Undo2,
  Redo2,
  Pencil,
  X,
  FolderOpen,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { useShoppingList } from './hooks/useShoppingList';
import {
  resolveInitialRoom,
  generateRoomId,
  sanitizeRoomId,
  recordRoomVisit,
  removeRecentRoom,
} from './lib/rooms';
import './App.css';

async function copyTextWithFallback(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error('Clipboard copy failed');
  }
}

function ShoppingListView({
  roomName,
  recentRooms,
  onSelectRoom,
  onCreateRoom,
  onRemoveRecentRoom,
}) {
  const {
    items,
    isLocalReady,
    connectionStatus,
    isRemoteSynced,
    isBrowserOnline,
    activeDevices,
    canUndo,
    canRedo,
    usingPublicDemo,
    addItem,
    toggleItem,
    updateItemText,
    deleteItem,
    clearCompleted,
    undo,
    redo,
    getShareUrl,
  } = useShoppingList(roomName);

  const [inputValue, setInputValue] = useState('');
  const [shareState, setShareState] = useState('idle'); // 'idle' | 'copied' | 'error'
  const [roomCodeCopied, setRoomCodeCopied] = useState(false);
  const [showRoomsPanel, setShowRoomsPanel] = useState(false);
  const [joinRoomInput, setJoinRoomInput] = useState('');
  const [joinRoomError, setJoinRoomError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const shareTimeoutRef = useRef(null);
  const roomCodeTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      clearTimeout(shareTimeoutRef.current);
      clearTimeout(roomCodeTimeoutRef.current);
    };
  }, []);

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    addItem(inputValue);
    setInputValue('');
  };

  const startEditing = (item) => {
    setEditingId(item.id);
    setEditingText(item.text);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingText('');
  };

  const commitEditing = (e) => {
    e.preventDefault();
    if (editingId && editingText.trim()) {
      updateItemText(editingId, editingText);
    }
    cancelEditing();
  };

  const handleShareList = async () => {
    const shareUrl = getShareUrl({ includeSnapshot: true });
    clearTimeout(shareTimeoutRef.current);

    try {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Shared Shopping List',
            text: `Join my shopping list (${roomName})`,
            url: shareUrl,
          });
          setShareState('copied');
          shareTimeoutRef.current = setTimeout(() => setShareState('idle'), 2000);
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return;
        }
      }

      await copyTextWithFallback(shareUrl);
      setShareState('copied');
      shareTimeoutRef.current = setTimeout(() => setShareState('idle'), 2200);
    } catch {
      setShareState('error');
      shareTimeoutRef.current = setTimeout(() => setShareState('idle'), 2500);
    }
  };

  const handleCopyRoomCode = async () => {
    clearTimeout(roomCodeTimeoutRef.current);
    try {
      await copyTextWithFallback(roomName);
      setRoomCodeCopied(true);
      roomCodeTimeoutRef.current = setTimeout(() => setRoomCodeCopied(false), 1800);
    } catch {
      // No-op if copy fails.
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    const cleaned = sanitizeRoomId(joinRoomInput);
    if (!cleaned) {
      setJoinRoomError('Enter at least 3 letters, numbers, or dashes.');
      return;
    }
    setJoinRoomError('');
    setJoinRoomInput('');
    setShowRoomsPanel(false);
    onSelectRoom(cleaned);
  };

  const remainingCount = items.filter((item) => !item.isCompleted).length;
  const completedCount = items.length - remainingCount;

  const isConnected = isBrowserOnline && connectionStatus === 'connected';
  const isConnecting = isBrowserOnline && connectionStatus === 'connecting';

  const syncLabel = !isBrowserOnline
    ? 'Offline (local only)'
    : isConnected && isRemoteSynced
      ? 'Synced'
      : isConnected
        ? 'Connected (syncing...)'
        : isConnecting
          ? 'Connecting...'
          : 'Reconnecting...';

  return (
    <div className="app-container">
      <header>
        <div className="logo-section">
          <ShoppingCart className="logo-icon" size={26} aria-hidden="true" />
          <h1>Shared List</h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            onClick={() => setShowRoomsPanel((prev) => !prev)}
            className="icon-pill-btn"
            aria-expanded={showRoomsPanel}
            aria-controls="rooms-panel"
          >
            <FolderOpen size={16} aria-hidden="true" />
            <span>Lists</span>
          </button>
          <button
            type="button"
            onClick={handleShareList}
            className={`share-btn ${shareState !== 'idle' ? shareState : ''}`}
          >
            {shareState === 'copied' ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Share2 size={16} aria-hidden="true" />
            )}
            <span>
              {shareState === 'copied'
                ? 'Link Copied!'
                : shareState === 'error'
                  ? 'Copy Failed'
                  : 'Share'}
            </span>
          </button>
        </div>
      </header>

      {showRoomsPanel && (
        <section id="rooms-panel" className="room-panel" aria-label="Manage lists">
          <div className="room-panel-header">
            <h2>Switch or join a list</h2>
            <button
              type="button"
              onClick={() => {
                setShowRoomsPanel(false);
                onCreateRoom();
              }}
              className="new-room-btn"
            >
              <Plus size={15} aria-hidden="true" />
              <span>New list</span>
            </button>
          </div>

          <form onSubmit={handleJoinRoom} className="join-room-form">
            <label htmlFor="join-room-input" className="sr-only">
              Room ID
            </label>
            <input
              id="join-room-input"
              type="text"
              value={joinRoomInput}
              onChange={(e) => {
                setJoinRoomInput(e.target.value);
                if (joinRoomError) setJoinRoomError('');
              }}
              placeholder="Join by room ID (e.g. list-abc...)"
            />
            <button type="submit" className="join-room-btn">
              Join
            </button>
          </form>
          {joinRoomError && <p className="room-error">{joinRoomError}</p>}

          {recentRooms.length > 0 && (
            <div>
              <p className="recent-rooms-label">Recent lists on this device</p>
              <ul className="recent-rooms-list">
                {recentRooms.map((entry) => {
                  const isActive = entry.id === roomName;
                  return (
                    <li key={entry.id} className="recent-room-row">
                      <button
                        type="button"
                        className={`recent-room-select ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setShowRoomsPanel(false);
                          onSelectRoom(entry.id);
                        }}
                      >
                        <span>{entry.id}</span>
                        {isActive && <span className="active-badge">Current</span>}
                      </button>
                      {!isActive && (
                        <button
                          type="button"
                          className="recent-room-remove"
                          onClick={() => onRemoveRecentRoom(entry.id)}
                          aria-label={`Remove ${entry.id} from recent lists`}
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      <main>
        <div className="status-bar" role="status" aria-live="polite">
          <div className="status-item">
            {isConnected ? (
              <Wifi size={14} className="online-icon" aria-hidden="true" />
            ) : isConnecting ? (
              <RefreshCw size={14} className="connecting-icon" aria-hidden="true" />
            ) : (
              <WifiOff size={14} className="offline-icon" aria-hidden="true" />
            )}
            <span>{syncLabel}</span>
          </div>

          <div className="status-item">
            <Users
              size={14}
              className={activeDevices > 1 ? 'online-icon' : ''}
              aria-hidden="true"
            />
            <span>
              {activeDevices} {activeDevices === 1 ? 'device' : 'devices'} online
            </span>
          </div>

          <div className="status-item">
            <span className={`status-dot ${isLocalReady ? 'online' : ''}`} aria-hidden="true" />
            <span>{isLocalReady ? 'Saved locally' : 'Loading...'}</span>
          </div>
        </div>

        <form onSubmit={handleAddItem} className="input-group">
          <label htmlFor="new-item-input" className="sr-only">
            Add an item to the shopping list
          </label>
          <input
            id="new-item-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Add an item..."
            enterKeyHint="done"
          />
          <button
            type="submit"
            className="add-btn"
            aria-label="Add item"
            disabled={!inputValue.trim()}
          >
            <Plus size={22} aria-hidden="true" />
          </button>
        </form>

        {(items.length > 0 || canUndo || canRedo) && (
          <div className="list-toolbar">
            <span className="list-summary">
              {remainingCount} left
              {completedCount > 0 ? ` · ${completedCount} done` : ''}
            </span>
            <div className="toolbar-actions">
              <button
                type="button"
                className="toolbar-btn"
                onClick={undo}
                disabled={!canUndo}
                aria-label="Undo last change"
                title="Undo"
              >
                <Undo2 size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={redo}
                disabled={!canRedo}
                aria-label="Redo change"
                title="Redo"
              >
                <Redo2 size={14} aria-hidden="true" />
              </button>
              {completedCount > 0 && (
                <button
                  type="button"
                  className="toolbar-btn danger"
                  onClick={clearCompleted}
                >
                  Clear done
                </button>
              )}
            </div>
          </div>
        )}

        <div className="list-section">
          {items.length === 0 ? (
            <div className="empty-state">
              <p>Your shopping list is empty</p>
              <p className="empty-hint">Add items above or share this link with another device.</p>
            </div>
          ) : (
            <ul className="shopping-list">
              {items.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <li
                    key={item.id}
                    className={`list-item ${item.isCompleted ? 'completed' : ''}`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.isCompleted}
                      aria-label={
                        item.isCompleted
                          ? `Mark "${item.text}" as not completed`
                          : `Mark "${item.text}" as completed`
                      }
                      onClick={() => toggleItem(item.id)}
                      className="check-btn"
                    >
                      {item.isCompleted ? (
                        <Check className="checked-icon" size={20} aria-hidden="true" />
                      ) : (
                        <Square size={20} aria-hidden="true" />
                      )}
                    </button>

                    {isEditing ? (
                      <form onSubmit={commitEditing} className="edit-form">
                        <label htmlFor={`edit-${item.id}`} className="sr-only">
                          Edit item
                        </label>
                        <input
                          id={`edit-${item.id}`}
                          type="text"
                          className="edit-input"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') cancelEditing();
                          }}
                          autoFocus
                        />
                        <button
                          type="submit"
                          className="action-btn save-btn"
                          aria-label="Save item"
                        >
                          <Check size={17} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          onClick={cancelEditing}
                          aria-label="Cancel editing"
                        >
                          <X size={17} aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <span
                          className="item-text"
                          onDoubleClick={() => startEditing(item)}
                        >
                          {item.text}
                        </span>
                        <div className="item-actions">
                          <button
                            type="button"
                            onClick={() => startEditing(item)}
                            className="action-btn"
                            aria-label={`Edit "${item.text}"`}
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteItem(item.id)}
                            className="action-btn delete-btn"
                            aria-label={`Delete "${item.text}"`}
                          >
                            <Trash2 size={17} aria-hidden="true" />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      <footer>
        <div className="room-info">
          Room:{' '}
          <button
            type="button"
            className="room-code-btn"
            onClick={handleCopyRoomCode}
            title="Copy room ID"
          >
            <code>{roomName}</code>
            {roomCodeCopied ? (
              <Check size={13} aria-hidden="true" />
            ) : (
              <Copy size={13} aria-hidden="true" />
            )}
          </button>
        </div>
        {usingPublicDemo && (
          <p className="relay-note">
            Using public demo relay. Share links include a list snapshot for offline handoff.
          </p>
        )}
        <p className="version-info">v{__APP_VERSION__}</p>
      </footer>
    </div>
  );
}

function App() {
  const [roomName, setRoomName] = useState(() => resolveInitialRoom());
  const [recentRooms, setRecentRooms] = useState(() => recordRoomVisit(roomName));

  const handleSelectRoom = (nextRoom) => {
    setRoomName(nextRoom);
    setRecentRooms(recordRoomVisit(nextRoom));
  };

  const handleCreateRoom = () => {
    handleSelectRoom(generateRoomId());
  };

  const handleRemoveRecentRoom = (id) => {
    setRecentRooms(removeRecentRoom(id));
  };

  return (
    <ShoppingListView
      key={roomName}
      roomName={roomName}
      recentRooms={recentRooms}
      onSelectRoom={handleSelectRoom}
      onCreateRoom={handleCreateRoom}
      onRemoveRecentRoom={handleRemoveRecentRoom}
    />
  );
}

export default App;
