import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Build a self-contained extension bundle into dist/.
// public/ (manifest.json, fonts/, icons/) is copied to dist/ as-is by Vite.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // Stable-ish names; the newtab page is the only entry.
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
