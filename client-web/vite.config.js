import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
    dedupe: ['chart.js', 'vue'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../public-vue',
  },
  optimizeDeps: {
    include: ['chart.js', 'chartjs-plugin-zoom', 'vue-chartjs'],
  },
})
