import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/campus-market/',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['campus-market.local'],
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
