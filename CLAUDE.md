# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Sentier

A hiking GPS track viewer PWA built with React + Vite. Users upload GPX files, view tracks on a map with elevation charts, and can cache map tiles for offline use.

## Commands

- `npm run dev` — start dev server (HTTPS with self-signed cert, exposed on all interfaces)
- `npm run build` — production build to `dist/`
- `npm run lint` — ESLint
- `npm run preview` — preview production build

No test framework is configured.

## Architecture

**Single-page app with two views** managed by `page` state in `App.jsx`:
- `"map"` — MapView + optional ElevationChart (default)
- `"list"` — TrackList (upload, rename, reverse, delete, offline caching)

**Components** (`src/components/`):
- `MapView.jsx` — Leaflet map via react-leaflet. Multiple base layers (IGN Scan25, OpenTopoMap, IGN Plan, OSM). Custom `CachedTileLayer` serves tiles from IndexedDB when available, falls back to network. Contains sub-components for geolocation (`LocateUser`), map view persistence (`SaveMapView`), track click handling, fit bounds, and km markers.
- `ElevationChart.jsx` — Chart.js line chart with drag-to-zoom (chartjs-plugin-zoom). Bidirectional sync with map: hover/click on chart highlights point on map and vice versa.
- `TrackList.jsx` — GPX upload, track management, offline tile download UI.

**Utilities** (`src/utils/`):
- `gpxUtils.js` — GPX parsing (via `gpxparser` lib), haversine distance, elevation gain, track reversal.
- `db.js` — IndexedDB wrapper for track storage (`sentier` database, `tracks` store). Stores raw GPX text + metadata.
- `tileCache.js` — IndexedDB tile cache (`sentier-tiles` database). Computes required tiles for a track at zoom levels 12/14/16 with 2km buffer, batch downloads with rate limiting.

**Persistence** — two IndexedDB databases (`sentier` for tracks, `sentier-tiles` for map tiles) + `localStorage` for `lastTrackId` and `mapView` (center/zoom).

**PWA** — service worker (`public/sw.js`) with network-first caching strategy. Manifest at `public/manifest.json`.

## Key patterns

- Map tile source is IGN Géoportail WMTS (French national mapping). The API key `ign_scan_ws` is a public key.
- Track data flows: GPX text → `parseGpx()` → `{ name, points[], totalDistance, elevationGain }`. Points have `{ lat, lon, ele, dist }`.
- Chart↔Map sync uses point array indices (`highlightIndex`, `centerIndex`) as the shared coordinate.
