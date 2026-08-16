import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Single Vite config for all panels (student / chef / owner / track).
// All three panels are served as one SPA on port 3000 in dev,
// and built into a single dist/ folder for deployment.
//
// Routes:
//   /        → StudentKiosk
//   /chef    → ChefDisplay  (protected by AdminAuthGate)
//   /owner   → OwnerDashboard (protected by AdminAuthGate)
//   /track   → OrderTracking

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    // Disable modulepreload entirely — Vite's default behaviour injects
    // <link rel="modulepreload"> for every split chunk, flooding the console
    // with "preloaded but not used" warnings when navigating between SPA routes.
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:  ['react', 'react-dom', 'react-router-dom'],
          redux:   ['@reduxjs/toolkit', 'react-redux'],
          charts:  ['chart.js', 'react-chartjs-2'],
          // Firestore's client SDK is the single largest dependency here and
          // it changes far less often than app code. Splitting it out lets the
          // browser cache it across deploys instead of re-downloading it inside
          // the main chunk every time a component changes, and lets the two
          // parse in parallel rather than as one long block on the main thread.
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Proxy API and Socket.IO requests to the Express backend during dev
      '/api':       { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true, changeOrigin: true },
    },
  },
})
