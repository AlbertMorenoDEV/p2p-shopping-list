import React, { useState, useEffect, useCallback } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Plus, Trash2, Check, Square, Share2, ShoppingCart, Loader2 } from 'lucide-react';
import './App.css';

// Initialize Yjs Document
const ydoc = new Y.Doc();
const yList = ydoc.getArray('shopping-list');

function App() {
  const [items, setItems] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [roomName, setRoomName] = useState('');
  const [isSynced, setIsSynced] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    // 1. Handle Room ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    let room = urlParams.get('room');
    if (!room) {
      room = `p2p-shop-${crypto.randomUUID()}`;
      urlParams.set('room', room);
      window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);
    }
    setRoomName(room);

    // 2. Setup Persistence (IndexedDB)
    const persistence = new IndexeddbPersistence(room, ydoc);
    persistence.on('synced', () => {
      console.log('Local data synced from IndexedDB');
      setIsSynced(true);
    });

    // 3. Setup Networking (WebRTC)
    const provider = new WebrtcProvider(room, ydoc, {
      signaling: ['wss://signaling.yjs.dev']
    });

    // 4. Bind Yjs data to React State
    const updateHandler = () => {
      setItems(yList.toArray());
    };
    
    yList.observe(updateHandler);
    updateHandler(); // Initial load

    return () => {
      yList.unobserve(updateHandler);
      provider.destroy();
      persistence.destroy();
    };
  }, []);

  const addItem = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const newItem = {
      id: crypto.randomUUID(),
      text: inputValue.trim(),
      isCompleted: false,
      timestamp: Date.now()
    };

    yList.push([newItem]);
    setInputValue('');
  };

  const toggleItem = (id) => {
    const index = yList.toArray().findIndex(item => item.id === id);
    if (index !== -1) {
      const item = yList.get(index);
      const updatedItem = { ...item, isCompleted: !item.isCompleted };
      yList.delete(index, 1);
      yList.insert(index, [updatedItem]);
    }
  };

  const deleteItem = (id) => {
    const index = yList.toArray().findIndex(item => item.id === id);
    if (index !== -1) {
      yList.delete(index, 1);
    }
  };

  const shareList = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="app-container">
      <header>
        <div className="logo-section">
          <ShoppingCart className="logo-icon" />
          <h1>Shared List</h1>
        </div>
        <button onClick={shareList} className={`share-btn ${isCopied ? 'copied' : ''}`}>
          {isCopied ? <Check size={18} /> : <Share2 size={18} />}
          <span>{isCopied ? 'Copied!' : 'Share'}</span>
        </button>
      </header>

      <main>
        <form onSubmit={addItem} className="input-group">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Add an item..."
            autoFocus
          />
          <button type="submit" className="add-btn">
            <Plus size={24} />
          </button>
        </form>

        {!isSynced && (
          <div className="sync-status">
            <Loader2 className="spin" size={16} />
            <span>Syncing local storage...</span>
          </div>
        )}

        <div className="list-section">
          {items.length === 0 ? (
            <div className="empty-state">
              <p>Your shopping list is empty</p>
            </div>
          ) : (
            <ul className="shopping-list">
              {items.map((item) => (
                <li key={item.id} className={`list-item ${item.isCompleted ? 'completed' : ''}`}>
                  <button 
                    onClick={() => toggleItem(item.id)} 
                    className="check-btn"
                  >
                    {item.isCompleted ? <Check className="checked-icon" size={20} /> : <Square size={20} />}
                  </button>
                  <span className="item-text">{item.text}</span>
                  <button 
                    onClick={() => deleteItem(item.id)} 
                    className="delete-btn"
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <footer>
        <p className="room-info">Room ID: <code>{roomName}</code></p>
        <p className="version-info">v{__APP_VERSION__}</p>
      </footer>
    </div>
  );
}

export default App;
