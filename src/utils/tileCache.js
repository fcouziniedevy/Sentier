const DB_NAME = 'trailapp-tiles';
const STORE_NAME = 'tiles';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Standard Web Mercator: lat/lon → tile x,y at zoom z
export function latLonToTile(lat, lon, z) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

export function computeTilesForTrack(points, zoomLevels = [12, 14, 16], bufferMeters = 2000) {
  if (!points.length) return [];

  // Sample points every ~200m to avoid processing too many
  const sampled = [points[0]];
  let lastDist = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].dist - lastDist >= 200) {
      sampled.push(points[i]);
      lastDist = points[i].dist;
    }
  }
  // Always include last point
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1]);
  }

  // Average latitude for tile width calculation
  const avgLat = sampled.reduce((s, p) => s + p.lat, 0) / sampled.length;

  const tileSet = new Set();

  for (const z of zoomLevels) {
    // Tile width in meters at this zoom and latitude
    const tileWidth = (40075016 * Math.cos((avgLat * Math.PI) / 180)) / Math.pow(2, z);
    const buffer = Math.ceil(bufferMeters / tileWidth);

    for (const pt of sampled) {
      const { x, y } = latLonToTile(pt.lat, pt.lon, z);
      for (let dx = -buffer; dx <= buffer; dx++) {
        for (let dy = -buffer; dy <= buffer; dy++) {
          tileSet.add(`${z}/${x + dx}/${y + dy}`);
        }
      }
    }
  }

  return Array.from(tileSet).map((key) => {
    const [z, x, y] = key.split('/').map(Number);
    return { z, x, y };
  });
}

export function tileUrl(z, x, y) {
  return (
    'https://data.geopf.fr/private/wmts?' +
    'SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    '&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS' +
    '&STYLE=normal&FORMAT=image/jpeg' +
    '&TILEMATRIXSET=PM&TILEMATRIX=' + z +
    '&TILEROW=' + y +
    '&TILECOL=' + x +
    '&apikey=ign_scan_ws'
  );
}

export async function getCachedTile(z, x, y) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(`${z}/${x}/${y}`);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// Bulk existence check — single transaction, no blob fetch
async function checkCachedKeys(keys) {
  if (!keys.length) return new Set();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const cached = new Set();
    let pending = keys.length;
    keys.forEach((key) => {
      const req = store.getKey(key);
      req.onsuccess = () => {
        if (req.result !== undefined) cached.add(key);
        if (--pending === 0) resolve(cached);
      };
      req.onerror = () => { if (--pending === 0) resolve(cached); };
    });
  });
}

async function storeTile(key, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// IGN Géoplateforme rate limit: 10 req/s. Default target: 8 req/s (20% headroom).
export async function downloadTiles(tiles, onProgress, { concurrency = 4, maxRatePerSec = 8 } = {}) {
  const total = tiles.length;
  const allKeys = tiles.map(({ z, x, y }) => `${z}/${x}/${y}`);

  // Skip tiles already in cache (single bulk check before the loop)
  const alreadyCached = await checkCachedKeys(allKeys);
  const toDownload = tiles.filter(({ z, x, y }) => !alreadyCached.has(`${z}/${x}/${y}`));

  let done = alreadyCached.size;
  onProgress(done, total);

  const minBatchMs = (concurrency / maxRatePerSec) * 1000;

  let i = 0;
  while (i < toDownload.length) {
    const batch = toDownload.slice(i, i + concurrency);
    const batchStart = Date.now();
    await Promise.all(
      batch.map(async ({ z, x, y }) => {
        try {
          const resp = await fetch(tileUrl(z, x, y));
          if (resp.ok) {
            const blob = await resp.blob();
            await storeTile(`${z}/${x}/${y}`, blob);
          }
        } catch {
          // Skip failed tiles silently
        }
        done++;
        onProgress(done, total);
      })
    );
    i += concurrency;
    if (i < toDownload.length) {
      const remaining = minBatchMs - (Date.now() - batchStart);
      if (remaining > 0) await delay(remaining);
    }
  }

  return getCacheSizeForKeys(allKeys);
}

export async function getCacheSizeForKeys(keys) {
  if (!keys.length) return 0;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    let totalSize = 0;
    let pending = keys.length;
    keys.forEach((key) => {
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result) totalSize += req.result.size;
        if (--pending === 0) resolve(totalSize);
      };
      req.onerror = () => { if (--pending === 0) resolve(totalSize); };
    });
  });
}

export async function deleteTiles(keys) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const key of keys) {
      store.delete(key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCacheStats() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve({ count: req.result });
    req.onerror = () => reject(req.error);
  });
}

export async function clearCache() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
