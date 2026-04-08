import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Tooltip,
  LayersControl,
  ScaleControl,
  useMap,
} from 'react-leaflet';
import { createTileLayerComponent } from '@react-leaflet/core';
import 'leaflet/dist/leaflet.css';
import { getCachedTile, tileUrl } from '../utils/tileCache';

const IGN_SCAN25_URL =
  'https://data.geopf.fr/private/wmts?' +
  'SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS' +
  '&STYLE=normal&FORMAT=image/jpeg' +
  '&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}' +
  '&apikey=ign_scan_ws';

// Custom Leaflet TileLayer that checks IndexedDB cache first
const CachedTileLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');

    const { x, y } = coords;
    const z = coords.z;

    getCachedTile(z, x, y)
      .then((blob) => {
        if (blob) {
          tile.src = URL.createObjectURL(blob);
          done(null, tile);
        } else {
          // Fall back to network
          tile.crossOrigin = 'anonymous';
          tile.src = tileUrl(z, x, y);
          tile.onload = () => done(null, tile);
          tile.onerror = (err) => done(err, tile);
        }
      })
      .catch(() => {
        tile.crossOrigin = 'anonymous';
        tile.src = tileUrl(z, x, y);
        tile.onload = () => done(null, tile);
        tile.onerror = (err) => done(err, tile);
      });

    return tile;
  },
});

const OPEN_TOPO_URL = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

const IGN_PLAN_URL =
  'https://data.geopf.fr/wmts?' +
  'SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2' +
  '&STYLE=normal&FORMAT=image/png' +
  '&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function FitBounds({ points, skipInitial }) {
  const map = useMap();
  const prevPointsRef = useRef(points);
  useEffect(() => {
    if (points.length === 0) return;
    // Skip if these are the same points we mounted with and we have a saved view
    if (points === prevPointsRef.current && skipInitial) return;
    prevPointsRef.current = points;
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ], { padding: [30, 30] });
  }, [points, map, skipInitial]);
  return null;
}

const CachedIGNTileLayer = createTileLayerComponent(
  function createCachedLayer(props, context) {
    const layer = new CachedTileLayer('', { ...props });
    return { instance: layer, context: { ...context, layerContainer: layer } };
  },
  function updateCachedLayer(layer, props, prevProps) {}
);

function SaveMapView() {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      const { lat, lng } = map.getCenter();
      localStorage.setItem('mapView', JSON.stringify({ lat, lng, zoom: map.getZoom() }));
    };
    map.on('moveend', handler);
    return () => map.off('moveend', handler);
  }, [map]);
  return null;
}

function getInitialView() {
  try {
    const saved = JSON.parse(localStorage.getItem('mapView'));
    if (saved) return { center: [saved.lat, saved.lng], zoom: saved.zoom };
  } catch {}
  return { center: [46.5, 2.5], zoom: 6 };
}

function CenterOnPoint({ points, centerIndex }) {
  const map = useMap();
  useEffect(() => {
    if (centerIndex == null || !points[centerIndex]) return;
    const { lat, lon } = points[centerIndex];
    map.panTo([lat, lon]);
  }, [centerIndex, points, map]);
  return null;
}

function TrackClickHandler({ points, onTrackClick }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    const handler = (e) => {
      const { lat, lng } = e.latlng;
      let minDist = Infinity;
      let closest = 0;
      for (let i = 0; i < points.length; i++) {
        const d = (points[i].lat - lat) ** 2 + (points[i].lon - lng) ** 2;
        if (d < minDist) {
          minDist = d;
          closest = i;
        }
      }
      onTrackClick(closest);
    };

    map.on('click', handler);
    return () => map.off('click', handler);
  }, [points, onTrackClick, map]);

  return null;
}

function LocateUser({ locateTrigger }) {
  const map = useMap();
  const [position, setPosition] = useState(null);
  const [heading, setHeading] = useState(null);
  const posRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const onSuccess = (pos) => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      setPosition(latlng);
      posRef.current = latlng;
      const h = pos.coords.heading;
      setHeading(h != null && !isNaN(h) ? h : null);
    };

    // Get an initial fix first (faster on some mobile browsers)
    navigator.geolocation.getCurrentPosition(onSuccess, () => {}, {
      enableHighAccuracy: true, timeout: 15000,
    });

    const id = navigator.geolocation.watchPosition(onSuccess, () => {}, {
      enableHighAccuracy: true, maximumAge: 10000,
    });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!locateTrigger) return;
    if (posRef.current) map.setView(posRef.current, 15);
  }, [locateTrigger, map]);

  const arrowIcon = useMemo(() => heading != null ? L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${heading}deg);display:block">
      <polygon points="12,2 19,20 12,15 5,20" fill="#3b82f6" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  }) : null, [heading]);

  if (!position) return null;

  return (
    <>
      {arrowIcon && (
        <Marker position={position} icon={arrowIcon} interactive={false} zIndexOffset={10} />
      )}
      <CircleMarker
        center={position}
        radius={7}
        pathOptions={{ color: '#fff', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }}
      >
        <Tooltip>My position</Tooltip>
      </CircleMarker>
    </>
  );
}

export default function MapView({ points, highlightIndex, onTrackClick, centerIndex, color = '#f97316', locateTrigger }) {
  const positions = useMemo(
    () => points.map((p) => [p.lat, p.lon]),
    [points]
  );

  const kmMarkers = useMemo(() => {
    const markers = [];
    let nextKm = 5000;
    for (let i = 1; i < points.length; i++) {
      while (points[i].dist >= nextKm) {
        const ratio = (nextKm - points[i - 1].dist) / (points[i].dist - points[i - 1].dist);
        markers.push({
          lat: points[i - 1].lat + ratio * (points[i].lat - points[i - 1].lat),
          lon: points[i - 1].lon + ratio * (points[i].lon - points[i - 1].lon),
          km: nextKm / 1000,
        });
        nextKm += 5000;
      }
    }
    return markers;
  }, [points]);

  const highlightPoint = highlightIndex != null ? points[highlightIndex] : null;
  const initialView = useMemo(() => getInitialView(), []);
  const hasSavedView = !!localStorage.getItem('mapView');

  return (
    <MapContainer
      center={initialView.center}
      zoom={initialView.zoom}
      zoomControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <SaveMapView />
      <LocateUser locateTrigger={locateTrigger} />
      <ScaleControl position="bottomleft" metric imperial={false} />
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="IGN Topo (Scan25)">
          <CachedIGNTileLayer attribution="&copy; IGN" maxZoom={18} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="OpenTopoMap">
          <TileLayer url={OPEN_TOPO_URL} attribution="&copy; OpenTopoMap contributors" maxZoom={17} crossOrigin="anonymous" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="IGN Plan">
          <TileLayer url={IGN_PLAN_URL} attribution="&copy; IGN" maxZoom={18} crossOrigin="anonymous" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="OpenStreetMap">
          <TileLayer url={OSM_URL} attribution="&copy; OSM contributors" maxZoom={19} crossOrigin="anonymous" />
        </LayersControl.BaseLayer>
      </LayersControl>

      {positions.length > 0 && (
        <>
          <FitBounds points={points} skipInitial={hasSavedView} />
          <Polyline positions={positions} color={color} weight={4} />
          <CircleMarker
            center={[points[0].lat, points[0].lon]}
            radius={7}
            pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1 }}
          >
            <Tooltip>Start</Tooltip>
          </CircleMarker>
          <CircleMarker
            center={[points[points.length - 1].lat, points[points.length - 1].lon]}
            radius={7}
            pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1 }}
          >
            <Tooltip>End</Tooltip>
          </CircleMarker>
          {kmMarkers.map((m) => (
            <CircleMarker
              key={m.km}
              center={[m.lat, m.lon]}
              radius={5}
              pathOptions={{ color: '#1e293b', fillColor: '#fff', fillOpacity: 1, weight: 2 }}
            >
              <Tooltip>{m.km} km</Tooltip>
            </CircleMarker>
          ))}
        </>
      )}

      {points.length > 0 && onTrackClick && (
        <TrackClickHandler points={points} onTrackClick={onTrackClick} />
      )}

      {points.length > 0 && centerIndex != null && (
        <CenterOnPoint points={points} centerIndex={centerIndex} />
      )}

      {highlightPoint && (
        <CircleMarker
          center={[highlightPoint.lat, highlightPoint.lon]}
          radius={6}
          pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -8]} permanent>
            {(highlightPoint.dist / 1000).toFixed(2)} km — {Math.round(highlightPoint.ele)} m
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}

