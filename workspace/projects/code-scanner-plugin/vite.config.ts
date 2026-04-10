import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    // 真实 MinIO 包仅在 USE_MOCK=false 时需要，避免 build 报错
    rollupOptions: {
      external: ['minio'],
    },
  },
  optimizeDeps: {
    exclude: ['minio'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
