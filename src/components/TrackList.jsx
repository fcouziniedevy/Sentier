import { useState, useEffect, useRef } from 'react';
import { getAllTracks, saveTrack, deleteTrack, renameTrack, getTrack, updateTrackGpx, markTrackCached, clearTrackCache, markElevationEnriched } from '../utils/db';
import { parseGpx, reverseTrack, buildGpx } from '../utils/gpxUtils';
import { computeTilesForTrack, downloadTiles, deleteTiles } from '../utils/tileCache';
import { enrichElevations } from '../utils/elevationUtils';

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
  const [enriching, setEnriching] = useState(null); // { id, done, total }
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
          elevationLoss: parsed.elevationLoss,
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
      const newGpx = buildGpx(record.name, reversed.points);
      updateTrackGpx(id, newGpx, {
        name: record.name,
        totalDistance: reversed.totalDistance,
        elevationGain: reversed.elevationGain,
        elevationLoss: reversed.elevationLoss,
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

  const handleEnrichElevation = (id) => {
    getTrack(id).then((record) => {
      const parsed = parseGpx(record.gpxText);
      setEnriching({ id, done: 0, total: 1 });
      return enrichElevations(parsed.points, (done, total) => {
        setEnriching({ id, done, total });
      }).then((enrichedPoints) => {
        const newGpx = buildGpx(record.name, enrichedPoints);
        const newParsed = parseGpx(newGpx);
        return updateTrackGpx(id, newGpx, {
          name: record.name,
          totalDistance: newParsed.totalDistance,
          elevationGain: newParsed.elevationGain,
          elevationLoss: newParsed.elevationLoss,
        });
      }).then(() => markElevationEnriched(id))
      .then(() => {
        setEnriching(null);
        refresh();
      }).catch(() => setEnriching(null));
    });
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
                {(t.totalDistance / 1000).toFixed(1)} km
                {' '}— D+ {Math.round(t.elevationGain)} m
                {t.elevationLoss != null && <> D- {Math.round(t.elevationLoss)} m</>}
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
                  <button className="icon-btn" title="Rename" onClick={() => { setEditingId(t.id); setEditName(t.name); }}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button className="icon-btn" title="Reverse track" onClick={() => handleReverse(t.id)}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"/>
                      <path d="M3.51 15a9 9 0 1 0 .49-5.01"/>
                    </svg>
                  </button>
                  <button
                    className={`icon-btn${t.elevationEnriched ? ' icon-btn-active' : ''}`}
                    title="Fix elevation from IGN"
                    onClick={() => handleEnrichElevation(t.id)}
                    disabled={enriching != null || downloading != null}
                  >
                    {enriching?.id === t.id ? (
                      <span className="icon-btn-progress">{enriching.done}/{enriching.total}</span>
                    ) : (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 17 13 8 9 12 2 7"/>
                        <line x1="2" y1="20" x2="22" y2="20"/>
                      </svg>
                    )}
                  </button>
                  <button
                    className={`icon-btn${t.cachedOffline ? ' icon-btn-active' : ''}`}
                    title={t.cachedOffline ? 'Re-download offline tiles' : 'Download for offline use'}
                    onClick={() => handleDownload(t.id)}
                    disabled={downloading != null || enriching != null}
                  >
                    {downloading?.id === t.id ? (
                      <span className="icon-btn-progress">{downloading.done}/{downloading.total}</span>
                    ) : (
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="8 17 12 21 16 17"/>
                        <line x1="12" y1="12" x2="12" y2="21"/>
                        <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
                      </svg>
                    )}
                  </button>
                  {t.cachedOffline && (
                    <button className="icon-btn icon-btn-danger" title="Clear offline cache" onClick={() => handleClearCache(t.id)}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
                        <line x1="9" y1="14" x2="15" y2="20"/>
                        <line x1="15" y1="14" x2="9" y2="20"/>
                      </svg>
                    </button>
                  )}
                  <button className="icon-btn icon-btn-danger" title="Delete track" onClick={() => handleDelete(t.id)}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                      <path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
