import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias }
  },
  preload: {
    resolve: { alias },
    build: {
      // Sandboxed preloads cannot require sibling chunks: bundle each entry standalone.
      isolatedEntries: true,
      externalizeDeps: false,
      rollupOptions: {
        input: {
          admin: resolve('src/preload/admin.ts'),
          public: resolve('src/preload/public.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          admin: resolve('src/renderer/admin.html'),
          public: resolve('src/renderer/public.html'),
          overlay: resolve('src/renderer/overlay.html')
        }
      }
    }
  }
})
