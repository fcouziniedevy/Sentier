import { useState, useCallback, useEffect } from 'react';
import TrackList from './components/TrackList';
import MapView from './components/MapView';
import ElevationChart from './components/ElevationChart';
import Settings from './components/Settings';
import { getTrack } from './utils/db';
import { parseGpx } from './utils/gpxUtils';
import './App.css';

export default function App() {
  const [page, setPage] = useState('map');
  const [listTab, setListTab] = useState('tracks');
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [highlightIndex, setHighlightIndex] = useState(null);
  const [centerIndex, setCenterIndex] = useState(null);
  const [showChart, setShowChart] = useState(false);
  const [locateTrigger, setLocateTrigger] = useState(0);
  const [trackColor, setTrackColor] = useState(
    () => localStorage.getItem('trackColor') ?? '#f97316'
  );

  const handleTrackColorChange = useCallback((color) => {
    setTrackColor(color);
    localStorage.setItem('trackColor', color);
  }, []);

  useEffect(() => {
    const lastId = localStorage.getItem('lastTrackId');
    if (!lastId) { setLoading(false); return; }
    getTrack(Number(lastId)).then((record) => {
      if (record) {
        try {
          const parsed = parseGpx(record.gpxText);
          setTrack({ ...parsed, name: record.name });
        } catch { /* ignore parse errors */ }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleOpen = useCallback((parsed, trackId) => {
    setTrack(parsed);
    setHighlightIndex(null);
    setCenterIndex(null);
    setShowChart(false);
    setPage('map');
    if (trackId != null) {
      localStorage.setItem('lastTrackId', trackId);
      // Clear saved map view so the new track gets fitted
      localStorage.removeItem('mapView');
    }
  }, []);

  const handleChartClick = useCallback((index) => {
    setHighlightIndex(index);
    setCenterIndex(index);
  }, []);

  if (loading) return null;

  if (page === 'list') {
    return (
      <div className="app">
        <header className="header">
          <h1>TrailApp</h1>
          <button className="header-btn" onClick={() => setPage('map')}>Map</button>
        </header>
        <div className="tabs">
          <button
            className={`tab-btn${listTab === 'tracks' ? ' tab-btn-active' : ''}`}
            onClick={() => setListTab('tracks')}
          >
            My tracks
          </button>
          <button
            className={`tab-btn${listTab === 'settings' ? ' tab-btn-active' : ''}`}
            onClick={() => setListTab('settings')}
          >
            Settings
          </button>
        </div>
        {listTab === 'tracks'
          ? <TrackList onOpen={handleOpen} />
          : <Settings trackColor={trackColor} onTrackColorChange={handleTrackColorChange} />
        }
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header map-header">
        <h1>TrailApp</h1>
        <div className="header-actions">
          {track && (
            <button className="header-btn" onClick={() => setShowChart((v) => !v)}>
              {showChart ? 'Hide elevation' : 'Elevation'}
            </button>
          )}
          <button className="header-icon-btn" onClick={() => setPage('list')} title="My tracks & Settings">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      {track && showChart && (
        <div className="track-stats">
          <span><strong>{track.name}</strong></span>
          <span>{(track.totalDistance / 1000).toFixed(1)} km</span>
          <span>D+ {Math.round(track.elevationGain)} m</span>
          {track.elevationLoss != null && <span>D- {Math.round(track.elevationLoss)} m</span>}
        </div>
      )}

      <div className="map-container">
        <MapView
          points={track?.points ?? []}
          highlightIndex={highlightIndex}
          onTrackClick={setHighlightIndex}
          centerIndex={centerIndex}
          color={trackColor}
          locateTrigger={locateTrigger}
        />
        <div className="map-bottom-bar">
          <button className="map-bar-btn" onClick={() => setPage('list')} title="My tracks & Settings">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button
            className={`map-bar-btn${!track ? ' map-bar-btn-disabled' : ''}`}
            onClick={() => track && setShowChart((v) => !v)}
            title="Elevation profile"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 17 13 8 9 12 2 7"/>
              <line x1="2" y1="20" x2="22" y2="20"/>
            </svg>
          </button>
          <button className="map-bar-btn" onClick={() => setLocateTrigger((t) => t + 1)} title="Center on my location">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8"/>
              <line x1="12" y1="2" x2="12" y2="6"/>
              <line x1="12" y1="18" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="6" y2="12"/>
              <line x1="18" y1="12" x2="22" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {track && showChart && (
        <div className="chart-container">
          <ElevationChart
            points={track.points}
            highlightIndex={highlightIndex}
            onHover={setHighlightIndex}
            onClick={handleChartClick}
          />
        </div>
      )}
    </div>
  );
}
