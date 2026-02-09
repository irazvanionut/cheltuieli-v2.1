import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const proxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000'
console.log(`[vite] API proxy target: ${proxyTarget}`)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[vite] Proxy error:', err.message)
            if (res && 'writeHead' in res) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ detail: `Backend unreachable at ${proxyTarget}: ${err.message}` }))
            }
          })
        },
      },
    },
  },
})
