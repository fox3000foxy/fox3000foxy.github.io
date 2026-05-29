import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'manifest.json'],
      manifest: {
        name: "Fox's Blog",
        short_name: 'FoxBlog',
        description: 'A blog about code, games, and reverse engineering',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        categories: ['blog', 'technology', 'gaming'],
        orientation: 'any',
        icons: [
          { src: '/icons/android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/android-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/ms-icon-310x310.png', sizes: '310x310', type: 'image/png' },
          { src: '/icons/apple-icon-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/apple-icon.png', sizes: '120x120', type: 'image/png' },
        ],
        screenshots: [
          { src: '/icons/android-icon-192x192.png', sizes: '192x192', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,md,xml,json,ico,png,svg,txt}'],
        globIgnores: ['**/articles/assets/*.png'],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
})
