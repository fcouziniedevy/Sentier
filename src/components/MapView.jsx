import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Circle,
  Tooltip,
  LayersControl,
  ScaleControl,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const IGN_SCAN25_URL =
  'https://data.geopf.fr/private/wmts?' +
  'SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS' +
  '&STYLE=normal&FORMAT=image/jpeg' +
  '&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}' +
  '&apikey=ign_scan_ws';

const OPEN_TOPO_URL = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

const IGN_PLAN_URL =
  'https://data.geopf.fr/wmts?' +
  'SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2' +
  '&STYLE=normal&FORMAT=image/png' +
  '&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ], { padding: [30, 30] });
  }, [points, map]);
  return null;
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

function LocateUser() {
  const map = useMap();
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(0);
  const posRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    const onSuccess = (pos) => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      setPosition(latlng);
      setAccuracy(pos.coords.accuracy);
      posRef.current = latlng;
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
    const LocateControl = L.Control.extend({
      onAdd() {
        const btn = L.DomUtil.create('button', 'locate-btn');
        btn.innerHTML = '\u2316';
        btn.title = 'Center on my location';
        btn.onclick = (e) => {
          e.stopPropagation();
          if (posRef.current) map.setView(posRef.current, 15);
        };
        L.DomEvent.disableClickPropagation(btn);
        return btn;
      },
    });

    const control = new LocateControl({ position: 'topleft' });
    control.addTo(map);
    return () => control.remove();
  }, [map]);

  if (!position) return null;

  return (
    <>
      <Circle
        center={position}
        radius={accuracy}
        pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1 }}
      />
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

export default function MapView({ points, highlightIndex, onTrackClick, centerIndex }) {
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

  return (
    <MapContainer
      center={[46.5, 2.5]}
      zoom={6}
      style={{ height: '100%', width: '100%' }}
    >
      <LocateUser />
      <ScaleControl position="bottomleft" metric imperial={false} />
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="IGN Topo (Scan25)">
          <TileLayer url={IGN_SCAN25_URL} attribution="&copy; IGN" maxZoom={18} crossOrigin="anonymous" />
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
          <FitBounds points={points} />
          <Polyline positions={positions} color="#f97316" weight={4} />
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

