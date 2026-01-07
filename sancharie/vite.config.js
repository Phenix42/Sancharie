import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/sms-api': {
        target: 'https://sms.metareach.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sms-api/, '/vb'),
        secure: false,
      },
    },
  },
})
