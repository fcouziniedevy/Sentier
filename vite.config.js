import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Precache all build assets
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // No runtime caching — tile fetches are handled by IndexedDB in tileCache.js
        runtimeCaching: [],
        // SPA fallback
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'Sentier',
        short_name: 'Sentier',
        description: 'Hiking GPS track viewer',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#863bff',
        lang: 'fr',
        orientation: 'portrait',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          // Reuses the 512 icon as maskable fallback — replace with a proper
          // safe-zone-padded version (icon-512-maskable.png) for best results
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
})
