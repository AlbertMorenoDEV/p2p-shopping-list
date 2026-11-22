import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  USER_ORIGIN,
  LEGACY_LIST_KEY,
  getItemsMap,
  migrateLegacyArray,
  readItems,
  addItem as crdtAddItem,
  toggleItem as crdtToggleItem,
  updateItemText as crdtUpdateItemText,
  deleteItem as crdtDeleteItem,
  clearCompletedItems as crdtClearCompleted,
  encodeDocSnapshot,
  applyDocSnapshot,
} from '../lib/crdt';
import {
  getSyncServerUrl,
  isUsingPublicDemoServer,
  getNamespacedRoom,
  extractSnapshotFromHash,
  syncUrlWithRoom,
  buildShareUrl,
} from '../lib/rooms';

export function useShoppingList(roomName) {
  const [items, setItems] = useState([]);
  const [isLocalReady, setIsLocalReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [isRemoteSynced, setIsRemoteSynced] = useState(false);
  const [activeDevices, setActiveDevices] = useState(1);
  const [isBrowserOnline, setIsBrowserOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const ydocRef = useRef(null);
  const undoManagerRef = useRef(null);

  const syncServerUrl = getSyncServerUrl();
  const usingPublicDemo = isUsingPublicDemoServer(syncServerUrl);

  useEffect(() => {
    let isDisposed = false;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const itemsMap = getItemsMap(ydoc);
    const legacyList = ydoc.getArray(LEGACY_LIST_KEY);
    const undoManager = new Y.UndoManager(itemsMap, {
      trackedOrigins: new Set([USER_ORIGIN]),
    });
    undoManagerRef.current = undoManager;

    const updateUndoState = () => {
      if (isDisposed) return;
      setCanUndo(undoManager.undoStack.length > 0);
      setCanRedo(undoManager.redoStack.length > 0);
    };

    const refreshItems = () => {
      if (isDisposed) return;
      setItems(readItems(ydoc));
    };

    const handleLegacyUpdate = () => {
      if (legacyList.length > 0) {
        migrateLegacyArray(ydoc);
      }
    };

    itemsMap.observeDeep(refreshItems);
    legacyList.observe(handleLegacyUpdate);
    undoManager.on('stack-item-added', updateUndoState);
    undoManager.on('stack-item-popped', updateUndoState);
    undoManager.on('stack-cleared', updateUndoState);

    // Apply any CRDT snapshot passed via URL hash (#state=...) for resilient
    // async handoff even when using an ephemeral public relay.
    const initialSnapshot = extractSnapshotFromHash();
    if (initialSnapshot) {
      applyDocSnapshot(ydoc, initialSnapshot);
      syncUrlWithRoom(roomName, { preserveHash: false });
      refreshItems();
    } else {
      syncUrlWithRoom(roomName, { preserveHash: false });
    }

    // 1. Local IndexedDB persistence (keeps original DB key `roomName` for backwards compatibility).
    const persistence = new IndexeddbPersistence(roomName, ydoc);
    persistence.on('synced', () => {
      if (isDisposed) return;
      migrateLegacyArray(ydoc);
      refreshItems();
      setIsLocalReady(true);
    });

    // 2. WebSocket sync provider (namespaced room to avoid collisions on public relays).
    const provider = new WebsocketProvider(
      syncServerUrl,
      getNamespacedRoom(roomName),
      ydoc,
      { connect: true }
    );

    const updateDeviceCount = () => {
      if (isDisposed) return;
      const count = provider.awareness.getStates().size;
      setActiveDevices(Math.max(1, count));
    };

    provider.awareness.setLocalStateField('device', {
      connectedAt: Date.now(),
    });
    provider.awareness.on('change', updateDeviceCount);
    updateDeviceCount();

    const handleStatus = (event) => {
      if (isDisposed) return;
      setConnectionStatus(event.status);
      if (event.status !== 'connected') {
        setIsRemoteSynced(false);
      }
    };

    const handleSync = (synced) => {
      if (isDisposed) return;
      migrateLegacyArray(ydoc);
      refreshItems();
      setIsRemoteSynced(Boolean(synced));
    };

    provider.on('status', handleStatus);
    provider.on('sync', handleSync);

    // Recover quickly when mobile browsers wake up or regain connectivity.
    const handleOnline = () => {
      setIsBrowserOnline(true);
      if (!provider.wsconnected) {
        provider.connect();
      }
    };

    const handleOffline = () => {
      setIsBrowserOnline(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && !provider.wsconnected) {
        provider.connect();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isDisposed = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      provider.off('status', handleStatus);
      provider.off('sync', handleSync);
      provider.awareness.off('change', updateDeviceCount);
      provider.destroy();

      persistence.destroy();

      undoManager.off('stack-item-added', updateUndoState);
      undoManager.off('stack-item-popped', updateUndoState);
      undoManager.off('stack-cleared', updateUndoState);
      undoManager.destroy();

      itemsMap.unobserveDeep(refreshItems);
      legacyList.unobserve(handleLegacyUpdate);
      ydoc.destroy();

      if (ydocRef.current === ydoc) {
        ydocRef.current = null;
      }
      if (undoManagerRef.current === undoManager) {
        undoManagerRef.current = null;
      }
    };
  }, [roomName, syncServerUrl]);

  const addItem = useCallback((text) => {
    if (!ydocRef.current) return null;
    return crdtAddItem(ydocRef.current, text);
  }, []);

  const toggleItem = useCallback((id) => {
    if (!ydocRef.current) return false;
    return crdtToggleItem(ydocRef.current, id);
  }, []);

  const updateItemText = useCallback((id, text) => {
    if (!ydocRef.current) return false;
    return crdtUpdateItemText(ydocRef.current, id, text);
  }, []);

  const deleteItem = useCallback((id) => {
    if (!ydocRef.current) return false;
    return crdtDeleteItem(ydocRef.current, id);
  }, []);

  const clearCompleted = useCallback(() => {
    if (!ydocRef.current) return 0;
    return crdtClearCompleted(ydocRef.current);
  }, []);

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  const getShareUrl = useCallback(
    ({ includeSnapshot = true } = {}) => {
      const snapshot =
        includeSnapshot && ydocRef.current ? encodeDocSnapshot(ydocRef.current) : null;
      return buildShareUrl(roomName, snapshot);
    },
    [roomName]
  );

  return {
    items,
    isLocalReady,
    connectionStatus,
    isRemoteSynced,
    isBrowserOnline,
    activeDevices,
    canUndo,
    canRedo,
    syncServerUrl,
    usingPublicDemo,
    addItem,
    toggleItem,
    updateItemText,
    deleteItem,
    clearCompleted,
    undo,
    redo,
    getShareUrl,
  };
}
