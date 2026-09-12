import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Arena's preview proxy terminates HTTPS on port 443, while a normal local
// or LAN Vite server is reached directly on port 5173. Keep the proxy-specific
// setting opt-in so it cannot break local HMR.
const isArenaPreview = process.env.E2B_SANDBOX === 'true';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // @ts-ignore
    allowedHosts: true as any,
    // The preview proxy exposes the browser-facing WebSocket on HTTPS/443.
    // For local/LAN use this is undefined, so Vite derives the port from the
    // page URL and connects to 5173 instead.
    hmr: isArenaPreview ? { clientPort: 443 } : undefined,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
});
