import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 8932,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8162',
        changeOrigin: true,
      },
    },
  },
})
