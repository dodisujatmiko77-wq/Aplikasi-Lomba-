import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// PWA: app shell tersimpan di perangkat, sehingga layar TV tetap dapat dibuka saat internet terputus.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Sistem Informasi Masjid',
        short_name: 'Info Masjid',
        description: 'Dashboard informasi digital masjid',
        lang: 'id',
        start_url: '/',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#022c22',
        theme_color: '#064e3b',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Logo, poster, dan gambar QRIS dari Supabase Storage: simpan agar tampil saat offline.
            urlPattern: ({ url, request }) => url.pathname.includes('/storage/v1/object/public/') && request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'media-gambar', expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    target: 'es2019',
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], supabase: ['@supabase/supabase-js'], charts: ['recharts'], motion: ['framer-motion'] },
      },
    },
  },
})
