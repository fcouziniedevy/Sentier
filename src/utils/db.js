const DB_NAME = 'trailapp';
const STORE_NAME = 'tracks';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const req = fn(store);
      let result;
      req.onsuccess = () => { result = req.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

export function saveTrack({ name, gpxText, totalDistance, elevationGain, elevationLoss }) {
  return tx('readwrite', (store) =>
    store.add({ name, gpxText, totalDistance, elevationGain, elevationLoss, savedAt: Date.now() })
  );
}

export function getAllTracks() {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function getLastTrack() {
  return getAllTracks().then((tracks) => {
    if (!tracks.length) return null;
    tracks.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return tracks[0];
  });
}

export function getTrack(id) {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function deleteTrack(id) {
  return tx('readwrite', (store) => store.delete(id));
}

export function renameTrack(id, newName) {
  return getTrack(id).then((track) => {
    if (!track) return;
    track.name = newName;
    return tx('readwrite', (store) => store.put(track));
  });
}

export function markElevationEnriched(id) {
  return getTrack(id).then((track) => {
    if (!track) return;
    track.elevationEnriched = true;
    return tx('readwrite', (store) => store.put(track));
  });
}

export function markTrackCached(id, { tileKeys = [], cacheSize = 0 } = {}) {
  return getTrack(id).then((track) => {
    if (!track) return;
    track.cachedOffline = true;
    track.tileKeys = tileKeys;
    track.cacheSize = cacheSize;
    return tx('readwrite', (store) => store.put(track));
  });
}

export function clearTrackCache(id) {
  return getTrack(id).then((track) => {
    if (!track) return;
    track.cachedOffline = false;
    track.tileKeys = [];
    track.cacheSize = 0;
    return tx('readwrite', (store) => store.put(track));
  });
}

export function updateTrackGpx(id, gpxText, { name, totalDistance, elevationGain, elevationLoss }) {
  return getTrack(id).then((track) => {
    if (!track) return;
    track.gpxText = gpxText;
    track.name = name;
    track.totalDistance = totalDistance;
    track.elevationGain = elevationGain;
    track.elevationLoss = elevationLoss;
    return tx('readwrite', (store) => store.put(track));
  });
}
