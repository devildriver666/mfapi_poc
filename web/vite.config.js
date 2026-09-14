import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PROXY_PORT = process.env.PORT || 8787;

// The browser only ever calls this dev server's own origin. /api is forwarded
// to the Express proxy, which is the only process holding the partner token.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${PROXY_PORT}`,
        changeOrigin: false,
      },
    },
  },
});
