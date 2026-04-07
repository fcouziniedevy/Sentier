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

export async function downloadTiles(tiles, onProgress, { concurrency = 4, delayMs = 500 } = {}) {
  let done = 0;
  let totalBytes = 0;
  const total = tiles.length;
  onProgress(0, total);

  // Process in batches with a delay between each batch to avoid flooding the server
  let i = 0;
  while (i < tiles.length) {
    const batch = tiles.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ({ z, x, y }) => {
        const key = `${z}/${x}/${y}`;
        // Skip if already cached
        const existing = await getCachedTile(z, x, y);
        if (existing) {
          totalBytes += existing.size;
          done++;
          onProgress(done, total);
          return;
        }
        try {
          const resp = await fetch(tileUrl(z, x, y));
          if (resp.ok) {
            const blob = await resp.blob();
            totalBytes += blob.size;
            await storeTile(key, blob);
          }
        } catch {
          // Skip failed tiles silently
        }
        done++;
        onProgress(done, total);
      })
    );
    i += concurrency;
    if (i < tiles.length) await delay(delayMs);
  }

  return totalBytes;
}

export async function getCacheSizeForKeys(keys) {
  const db = await openDb();
  let totalSize = 0;
  for (const key of keys) {
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (blob) totalSize += blob.size;
  }
  return totalSize;
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
