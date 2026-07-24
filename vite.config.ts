import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server serves the SPA on 5173 and proxies everything the API owns to
// the Node server on 8080 (`npm run dev` starts both). In production a single
// Node process serves both the built bundle and the API, so no proxy exists.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
