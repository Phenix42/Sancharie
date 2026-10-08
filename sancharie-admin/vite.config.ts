import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5174, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('recharts') || id.includes('/d3-')) return 'charts';
          if (id.includes('react-router') || id.includes('@tanstack')) return 'routing-query';
          if (id.includes('lucide-react')) return 'icons';
        },
      },
    },
  },
});
