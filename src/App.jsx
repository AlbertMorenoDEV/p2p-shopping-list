/* global __APP_VERSION__ */
import React, { useState, useEffect } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Plus, Trash2, Check, Square, Share2, ShoppingCart } from 'lucide-react';
import './App.css';

// Initialize Yjs Document
const ydoc = new Y.Doc();
const yList = ydoc.getArray('shopping-list');

function App() {
  const [items, setItems] = useState([]);
  const [inputValue, setInputValue] = useState('');
  
  // 1 & 3. Ensure the room name is correctly derived from the URL on every render to prevent mismatch.
  const urlParams = new URLSearchParams(window.location.search);
  let roomName = urlParams.get('room');
  if (!roomName) {
    roomName = `p2p-shop-${crypto.randomUUID()}`;
    urlParams.set('room', roomName);
    window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);
  }
  console.log('Active Room Name:', roomName);

  const [isSynced, setIsSynced] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [peers, setPeers] = useState(0);

  // 4. Add a useEffect to log when the local items state changes.
  useEffect(() => {
    console.log('Items state changed:', items);
  }, [items]);

  useEffect(() => {
    const room = roomName;

    // 2. Setup Persistence (IndexedDB)
    const persistence = new IndexeddbPersistence(room, ydoc);
    persistence.on('synced', () => {
      console.log('Local data synced from IndexedDB');
      setIsSynced(true);
    });

    // 3. Setup Networking (WebRTC)
    const provider = new WebrtcProvider(room, ydoc, {
      signaling: [
        'wss://y-webrtc-signaling-eu.herokuapp.com',
        'wss://y-webrtc-signaling-us.herokuapp.com',
        'wss://signaling.yjs.dev'
      ],
      peerOpts: {
        config: {
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        }
      }
    });

    // 2. Add event listeners for 'synced', 'connection', and 'peer-add/peer-remove'
    provider.on('synced', (event) => {
      console.log('WebRTC Provider: synced', event);
    });

    provider.on('connection', (event) => {
      console.log('WebRTC Provider: connection', event);
    });

    provider.on('peer-add', (event) => {
      console.log('WebRTC Provider: peer-add', event);
    });

    provider.on('peer-remove', (event) => {
      console.log('WebRTC Provider: peer-remove', event);
    });

    provider.on('peers', (event) => {
      setPeers(event.webrtcPeers.length);
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
  }, [roomName]);

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
        <div className="status-bar">
          <div className="status-item">
            <span className={`status-dot ${peers > 0 ? 'online' : ''}`}></span>
            <span>{peers} {peers === 1 ? 'peer' : 'peers'} connected</span>
          </div>
          <div className="status-item">
            <span className={`status-dot ${isSynced ? 'online' : ''}`}></span>
            <span>{isSynced ? 'Synced' : 'Syncing...'}</span>
          </div>
        </div>

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
