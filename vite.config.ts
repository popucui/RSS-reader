import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4300';

export default defineConfig({
  plugins: [react()],
  root: 'frontend',
  build: {
    outDir: '../dist/public',
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/clash/config.yaml': apiTarget
    }
  }
});
