import { useState, useEffect, useRef } from 'react';
import { getAllTracks, saveTrack, deleteTrack, renameTrack, getTrack, updateTrackGpx, markTrackCached, clearTrackCache } from '../utils/db';
import { parseGpx, reverseTrack } from '../utils/gpxUtils';
import { computeTilesForTrack, downloadTiles, deleteTiles } from '../utils/tileCache';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TrackList({ onOpen }) {
  const [tracks, setTracks] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [downloading, setDownloading] = useState(null); // { id, done, total }
  const fileRef = useRef();

  const refresh = () => getAllTracks().then(setTracks);

  useEffect(() => { refresh(); }, []);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const gpxText = ev.target.result;
      try {
        const parsed = parseGpx(gpxText);
        saveTrack({
          name: parsed.name,
          gpxText,
          totalDistance: parsed.totalDistance,
          elevationGain: parsed.elevationGain,
        }).then(refresh);
      } catch (err) {
        alert('Error parsing GPX: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDelete = (id) => {
    deleteTrack(id).then(refresh);
  };

  const handleRename = (id) => {
    if (!editName.trim()) return;
    renameTrack(id, editName.trim()).then(() => {
      setEditingId(null);
      refresh();
    });
  };

  const handleReverse = (id) => {
    getTrack(id).then((record) => {
      const parsed = parseGpx(record.gpxText);
      const reversed = reverseTrack(parsed);
      // Rebuild a minimal GPX from reversed points
      const gpxLines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1"><trk>',
        `<name>${record.name}</name>`,
        '<trkseg>',
      ];
      reversed.points.forEach((p) => {
        gpxLines.push(`<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele></trkpt>`);
      });
      gpxLines.push('</trkseg></trk></gpx>');
      const newGpx = gpxLines.join('\n');
      updateTrackGpx(id, newGpx, {
        name: record.name,
        totalDistance: reversed.totalDistance,
        elevationGain: reversed.elevationGain,
      }).then(refresh);
    });
  };

  const handleDownload = (id) => {
    getTrack(id).then((record) => {
      const parsed = parseGpx(record.gpxText);
      const tiles = computeTilesForTrack(parsed.points);
      const tileKeys = tiles.map(({ z, x, y }) => `${z}/${x}/${y}`);
      setDownloading({ id, done: 0, total: tiles.length });
      downloadTiles(tiles, (done, total) => {
        setDownloading({ id, done, total });
      }).then((cacheSize) => {
        setDownloading(null);
        return markTrackCached(id, { tileKeys, cacheSize });
      }).then(refresh);
    });
  };

  const handleClearCache = (id) => {
    getTrack(id).then((record) => {
      if (record.tileKeys?.length) {
        return deleteTiles(record.tileKeys);
      }
    }).then(() => clearTrackCache(id)).then(refresh);
  };

  const handleOpen = (id) => {
    getTrack(id).then((record) => {
      const parsed = parseGpx(record.gpxText);
      onOpen({ ...parsed, name: record.name }, id);
    });
  };

  return (
    <div className="track-list">
      <div className="track-list-header">
        <h2>My tracks</h2>
        <button className="upload-btn" onClick={() => fileRef.current.click()}>
          Upload GPX
          <input ref={fileRef} type="file" accept=".gpx" onChange={handleUpload} style={{ display: 'none' }} />
        </button>
      </div>

      {tracks.length === 0 && (
        <p className="track-list-empty">No tracks saved yet. Upload a GPX file to get started.</p>
      )}

      <ul className="track-list-items">
        {tracks.map((t) => (
          <li key={t.id} className="track-item">
            <div className="track-item-main" onClick={() => handleOpen(t.id)}>
              {editingId === t.id ? (
                <input
                  className="rename-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(t.id); }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span className="track-item-name">{t.name}</span>
              )}
              <span className="track-item-stats">
                {(t.totalDistance / 1000).toFixed(1)} km — D+ {Math.round(t.elevationGain)} m
                {t.cachedOffline && t.cacheSize > 0 && (
                  <> — Cache: {formatSize(t.cacheSize)}</>
                )}
              </span>
            </div>
            <div className="track-item-actions" onClick={(e) => e.stopPropagation()}>
              {editingId === t.id ? (
                <>
                  <button className="action-btn" onClick={() => handleRename(t.id)}>OK</button>
                  <button className="action-btn" onClick={() => setEditingId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button className="action-btn" onClick={() => { setEditingId(t.id); setEditName(t.name); }}>Rename</button>
                  <button className="action-btn" onClick={() => handleReverse(t.id)}>Reverse</button>
                  <button
                    className={`action-btn${t.cachedOffline ? ' action-btn-cached' : ''}`}
                    onClick={() => handleDownload(t.id)}
                    disabled={downloading != null}
                  >
                    {downloading?.id === t.id
                      ? `${downloading.done}/${downloading.total}`
                      : 'Offline'}
                  </button>
                  {t.cachedOffline && (
                    <button className="action-btn action-btn-danger" onClick={() => handleClearCache(t.id)}>Clear cache</button>
                  )}
                  <button className="action-btn action-btn-danger" onClick={() => handleDelete(t.id)}>Delete</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
