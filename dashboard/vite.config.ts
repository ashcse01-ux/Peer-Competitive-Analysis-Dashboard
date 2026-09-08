import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineConfig(({ command }) => {
  // GitHub Pages subpath ONLY for production builds — never for local dev
  const basePath =
    command === 'build' && process.env.VITE_BASE_PATH
      ? process.env.VITE_BASE_PATH
      : '/'

  return {
    plugins: [
      react(),
      {
        name: 'github-pages-spa-fallback',
        closeBundle() {
          if (command !== 'build' || !process.env.VITE_BASE_PATH) return
          const dist = resolve(__dirname, 'dist')
          copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
        },
      },
    ],
    base: basePath,
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: false,
      open: '/redbus',
      proxy: {
        '/api/v1': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: false,
      open: '/redbus',
    },
  }
})
