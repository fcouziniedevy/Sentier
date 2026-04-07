import { useState, useCallback, useEffect } from 'react';
import TrackList from './components/TrackList';
import MapView from './components/MapView';
import ElevationChart from './components/ElevationChart';
import { getLastTrack } from './utils/db';
import { parseGpx } from './utils/gpxUtils';
import './App.css';

export default function App() {
  const [page, setPage] = useState('map');
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [highlightIndex, setHighlightIndex] = useState(null);
  const [centerIndex, setCenterIndex] = useState(null);
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    getLastTrack().then((record) => {
      if (record) {
        try {
          const parsed = parseGpx(record.gpxText);
          setTrack({ ...parsed, name: record.name });
        } catch { /* ignore parse errors */ }
      }
      setLoading(false);
    });
  }, []);

  const handleOpen = useCallback((parsed) => {
    setTrack(parsed);
    setHighlightIndex(null);
    setCenterIndex(null);
    setShowChart(false);
    setPage('map');
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
        </header>
        <TrackList onOpen={handleOpen} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>TrailApp</h1>
        <div className="header-actions">
          {track && (
            <button className="header-btn" onClick={() => setShowChart((v) => !v)}>
              {showChart ? 'Hide elevation' : 'Elevation'}
            </button>
          )}
          <button className="header-btn" onClick={() => setPage('list')}>My tracks</button>
        </div>
      </header>

      {track && showChart && (
        <div className="track-stats">
          <span><strong>{track.name}</strong></span>
          <span>{(track.totalDistance / 1000).toFixed(1)} km</span>
          <span>D+ {Math.round(track.elevationGain)} m</span>
        </div>
      )}

      <div className="map-container">
        <MapView
          points={track?.points ?? []}
          highlightIndex={highlightIndex}
          onTrackClick={setHighlightIndex}
          centerIndex={centerIndex}
        />
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
