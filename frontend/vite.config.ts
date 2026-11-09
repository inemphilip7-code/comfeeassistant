import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

if (process.env.VERCEL === '1' && !process.env.VITE_API_URL?.trim()) {
  throw new Error('VITE_API_URL must point to the deployed backend before building the Vercel frontend.');
}

const backendTarget = process.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Vabatim',
        short_name: 'Vabatim',
        description: 'Vabatim Clinical Documentation Assistant',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // EXTREMELY IMPORTANT: Only cache standard static assets.
        // NEVER CACHE /api/* requests or JSON responses containing clinical data.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [] // Purposely empty to ensure no clinical data is cached
      }
    })
  ],
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      }
    }
  }
});
