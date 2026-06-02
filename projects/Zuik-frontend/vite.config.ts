import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
const serverUrl = process.env.VITE_SERVER_URL || 'http://localhost:4030'
const voiceUrl = process.env.VITE_VOICE_SERVER_URL || 'http://localhost:3002'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/ai': { target: serverUrl, changeOrigin: true },
      '/api/market': { target: serverUrl, changeOrigin: true },
      '/api/agent-wallets': { target: serverUrl, changeOrigin: true },
      '/api/workflows': { target: serverUrl, changeOrigin: true },
      '/api/voice': { target: voiceUrl, changeOrigin: true },
      '/api/coingecko': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/coingecko/, '/api/v3'),
      },
      '/api/vestige': {
        target: 'https://free-api.vestige.fi',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/vestige/, ''),
      },
    },
  },
})
