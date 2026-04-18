import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

// Chef Display — port 3001
// configureServer intercepts / BEFORE Vite's own HTML middleware and sends
// chef.html (transformed with HMR injection etc.) instead of index.html.
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'chef-entry',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            try {
              const html = readFileSync(
                path.resolve(__dirname, 'chef.html'),
                'utf-8'
              )
              const transformed = await server.transformIndexHtml(
                req.url,
                html,
                req.originalUrl
              )
              res.setHeader('Content-Type', 'text/html')
              res.statusCode = 200
              res.end(transformed)
            } catch (e) {
              next(e)
            }
            return
          }
          next()
        })
      },
    },
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist-chef',
    rollupOptions: {
      input: path.resolve(__dirname, 'chef.html'),
    },
  },
  server: {
    port: 3001,
    proxy: {
      '/api':       { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true, changeOrigin: true },
    },
  },
})
