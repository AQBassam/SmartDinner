/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Two builds:
//   npm run build          → dist/ : the PWA for dinner.bassamailab.xyz (nginx static)
//   npm run build:preview  → dist-preview/index.html : one self-contained file (no service worker)
export default defineConfig(({ mode }) => {
  const single = mode === 'singlefile';
  return {
    plugins: [
      react(),
      tailwindcss(),
      single
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'script',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'دليل العشاء المنزلي الذكي',
              short_name: 'عشاء البيت',
              description: 'خطة عشاء للأسرة، قائمة تسوق تتولد من الوصفات، ميزانية وتذكيرات.',
              lang: 'ar',
              dir: 'rtl',
              start_url: '/',
              display: 'standalone',
              background_color: '#FFF8EF',
              theme_color: '#2E6A4A',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              // Recipe photos are not precached (18 × 2 sizes would bloat the first visit); each one is kept
              // after it is first shown, so dishes already seen stay visible offline. Replaced photos carry a new ?v=.
              runtimeCaching: [{
                urlPattern: /\/recipes\/[a-z0-9_]+-(card|hero)\.webp/,
                handler: 'CacheFirst',
                options: { cacheName: 'recipe-photos', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 180 } },
              }],
            },
          }),
    ],
    build: single ? { outDir: 'dist-preview', assetsInlineLimit: 100_000_000 } : { outDir: 'dist' },
    test: { environment: 'node' },
  };
});
