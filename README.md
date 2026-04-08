# Sentier

Visualiseur de traces GPX pour la randonnée, conçu comme une PWA installable sur Android.

## Fonctionnalités

- **Carte** — affichage de la trace sur fond IGN Scan25, OpenTopoMap, IGN Plan ou OpenStreetMap
- **Profil altimétrique** — graphique interactif avec zoom, synchronisé avec la carte (clic/survol)
- **Localisation GPS** — position en temps réel avec indicateur de direction
- **Mes traces** — import GPX, renommage, inversion, suppression
- **Correction d'altitude** — enrichissement depuis l'API IGN RGE ALTI (remplace les altitudes GPS par des données LiDAR)
- **Mise en cache hors-ligne** — téléchargement des tuiles IGN pour une utilisation sans réseau
- **PWA** — installable sur Android via Chrome ("Ajouter à l'écran d'accueil")

## Développement

```bash
npm install
npm run dev      # serveur HTTPS local (certificat auto-signé)
npm run build    # build de production
npm run lint
```

Le serveur de développement est exposé sur toutes les interfaces réseau (accessible depuis un téléphone sur le même réseau Wi-Fi).

## Stack

- React 19 + Vite 8
- react-leaflet / Leaflet — carte
- Chart.js — profil altimétrique
- IndexedDB — stockage des traces et cache de tuiles
- vite-plugin-pwa / Workbox — PWA et précache

## Sources de données

- **Tuiles cartographiques** : [IGN Géoplateforme](https://geoplateforme.ign.fr) (Scan25, Plan IGN), OpenTopoMap, OpenStreetMap
- **Altimétrie** : IGN RGE ALTI via l'API Géoplateforme (limite : 5 req/s)
- **Tuiles IGN** : clé publique `ign_scan_ws`, limite 10 req/s
