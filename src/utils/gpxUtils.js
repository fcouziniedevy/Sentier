import gpxParser from 'gpxparser';

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parseGpx(gpxText) {
  const gpx = new gpxParser();
  gpx.parse(gpxText);

  if (!gpx.tracks.length) {
    throw new Error('No tracks found in GPX file');
  }

  const track = gpx.tracks[0];
  const rawPoints = track.points;

  let cumulativeDist = 0;
  const points = rawPoints.map((pt, i) => {
    if (i > 0) {
      cumulativeDist += haversineDistance(
        rawPoints[i - 1].lat,
        rawPoints[i - 1].lon,
        pt.lat,
        pt.lon
      );
    }
    return {
      lat: pt.lat,
      lon: pt.lon,
      ele: pt.ele ?? 0,
      dist: cumulativeDist,
    };
  });

  // Compute elevation gain (only positive differences)
  let elevationGain = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].ele - points[i - 1].ele;
    if (diff > 0) elevationGain += diff;
  }

  return {
    name: track.name || 'Unnamed track',
    totalDistance: cumulativeDist,
    elevationGain,
    points,
  };
}

export function reverseTrack(track) {
  const reversed = [...track.points].reverse();
  // Recompute cumulative distances
  let cumulativeDist = 0;
  const points = reversed.map((pt, i) => {
    if (i > 0) {
      cumulativeDist += haversineDistance(
        reversed[i - 1].lat, reversed[i - 1].lon,
        pt.lat, pt.lon
      );
    }
    return { ...pt, dist: cumulativeDist };
  });

  let elevationGain = 0;
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].ele - points[i - 1].ele;
    if (diff > 0) elevationGain += diff;
  }

  return { ...track, points, elevationGain };
}
