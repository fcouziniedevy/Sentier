const BATCH_SIZE = 50;
const MIN_BATCH_MS = 1000 / 5; // IGN altimetry limit: 5 req/s

async function fetchElevationBatch(points) {
  const lons = points.map((p) => p.lon.toFixed(6)).join('|');
  const lats = points.map((p) => p.lat.toFixed(6)).join('|');
  const url =
    'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json' +
    `?lon=${lons}&lat=${lats}&resource=ign_rge_alti_wld&zonly=true`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  // -99999 means no data for that point — fall back to original elevation
  return data.elevations.map((e, i) => (e === -99999 ? points[i].ele : e));
}

// Enriches track points with IGN RGE ALTI elevations.
// Samples every 50m, fetches in batches, then linearly interpolates for all points.
// onProgress(done, total) where total = number of API batches.
export async function enrichElevations(points, onProgress) {
  // Sample one point every 50m
  const sampled = [{ idx: 0, dist: points[0].dist }];
  for (let i = 1; i < points.length; i++) {
    if (points[i].dist - sampled[sampled.length - 1].dist >= 50) {
      sampled.push({ idx: i, dist: points[i].dist });
    }
  }
  if (sampled[sampled.length - 1].idx !== points.length - 1) {
    sampled.push({ idx: points.length - 1, dist: points[points.length - 1].dist });
  }

  // Fetch elevations for sampled points
  const sampledEles = new Array(sampled.length);
  const totalBatches = Math.ceil(sampled.length / BATCH_SIZE);
  onProgress(0, totalBatches);

  for (let b = 0; b < sampled.length; b += BATCH_SIZE) {
    const batchStart = Date.now();
    const batch = sampled.slice(b, b + BATCH_SIZE);
    const eles = await fetchElevationBatch(batch.map((s) => points[s.idx]));
    eles.forEach((ele, i) => { sampledEles[b + i] = ele; });
    onProgress(Math.floor(b / BATCH_SIZE) + 1, totalBatches);
    if (b + BATCH_SIZE < sampled.length) {
      const remaining = MIN_BATCH_MS - (Date.now() - batchStart);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    }
  }

  // Linear interpolation by distance for all original points
  return points.map((p) => {
    // Binary search for surrounding sample points
    let lo = 0, hi = sampled.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (sampled[mid].dist <= p.dist) lo = mid;
      else hi = mid;
    }
    if (lo === hi) return { ...p, ele: sampledEles[lo] };
    const t = (p.dist - sampled[lo].dist) / (sampled[hi].dist - sampled[lo].dist);
    return { ...p, ele: sampledEles[lo] + t * (sampledEles[hi] - sampledEles[lo]) };
  });
}
