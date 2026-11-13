import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Hanya server dev: bila VITE_SUPABASE_URL diberikan saat menjalankan `vite`, /config.js ditimpa dengan nilai itu
// (dipakai uji lokal dengan emulator). Build produksi tidak terpengaruh.
const devConfigOverride = () => ({
  name: 'lr1-dev-config-override',
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: string) => void }, next: () => void) => void) => void } }) {
    const url = process.env.VITE_SUPABASE_URL
    if (!url) return
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/config.js') return next()
      res.setHeader('Content-Type', 'application/javascript')
      res.end(`window.__LR1_CONFIG__ = { SUPABASE_URL: ${JSON.stringify(url)}, SUPABASE_ANON_KEY: ${JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? '')} }`)
    })
  },
})

export default defineConfig({
  plugins: [react(), devConfigOverride()],
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
