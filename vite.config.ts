import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Hanya dipakai untuk pengujian lokal (scripts/dev-api.mjs). Tidak berpengaruh di produksi.
    proxy: process.env.DEV_API_PROXY
      ? { '/__api': { target: process.env.DEV_API_PROXY, changeOrigin: true, rewrite: (p) => p.replace(/^\/__api/, '') } }
      : undefined,
  },
})
