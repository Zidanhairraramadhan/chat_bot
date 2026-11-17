import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'autoUpdate', includeAssets: ['favicon.svg'], manifest: {
    name: 'Zidan AI Bot Manager', short_name: 'Zidan Bot', description: 'Kelola Telegram AI Bot dari HP', theme_color: '#101827', background_color: '#0b1220', display: 'standalone', start_url: '/', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]
  } })],
  server: { proxy: { '/api': 'http://localhost:3000' } }
});
