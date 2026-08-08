import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// firebase-admin (and its transitive WASM dependency, farmhash-modern) is a
// server-only package — it belongs in netlify/functions/, never in the
// browser bundle. Vite has no way to know that on its own; if ANY file
// reachable from src/ ever imports firebase-admin by accident (directly, or
// transitively through a shared helper), Vite tries to bundle
// farmhash-modern's WASM file for the browser and the site build fails with
// "ESM integration proposal for Wasm is not supported" — a real build
// failure this project hit (Aug 2026), traced to firebase-admin being
// pulled into the client build somewhere. Excluding it here means an
// accidental import surfaces as a clear "module not found in browser"
// error at the actual import site instead of an opaque WASM failure with no
// obvious connection to the real cause.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['firebase-admin', 'farmhash-modern'],
  },
  build: {
    rollupOptions: {
      external: ['firebase-admin', 'farmhash-modern'],
    },
  },
})
