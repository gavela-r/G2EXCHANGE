import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  server: { host: '127.0.0.1',
  // Permite compartir la landing con un túnel de Cloudflare (cloudflared tunnel --url http://localhost:5173)
  allowedHosts: ['.trycloudflare.com'],
  // En Docker sobre Windows no llegan los eventos de cambio de archivos: se sondea
  watch: process.env.VITE_USE_POLLING ? { usePolling: true, interval: 300 } : undefined,
  proxy: {
    '/api/capital': 'http://127.0.0.1:3100',
    // En Docker se apunta al servicio backend con API_PROXY_TARGET
    '/api/landing': process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000'
  } },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
