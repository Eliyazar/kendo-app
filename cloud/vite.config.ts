import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The web app lives in ./web and is built into ./dist, which wrangler serves as static assets.
export default defineConfig({
  root: resolve(import.meta.dirname, 'web'),
  plugins: [react(), tailwindcss()],
  build: { outDir: resolve(import.meta.dirname, 'dist'), emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 800 },
  server: { proxy: { '/api': 'http://localhost:8787' } }
})
