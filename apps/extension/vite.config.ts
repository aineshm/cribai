import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

/**
 * Vite config for the CribAI Chrome Extension (MV3).
 *
 * Output layout in dist/:
 *   background.js        — service worker entry
 *   popup.js             — popup script entry
 *   popup.html           — popup page (copied from src/popup/)
 *   manifest.json        — manifest (copied from src/)
 *   icons/icon*.png      — icons (copied from src/public/icons/)
 *
 * Build-time env vars (in apps/extension/.env):
 *   VITE_CRIBAI_APP_DOMAIN    e.g. https://cribai.app
 *   VITE_CRIBAI_API_BASE      e.g. https://preview-xyz.vercel.app (optional)
 *   VITE_SUPABASE_URL         Supabase project URL
 *   VITE_SUPABASE_ANON_KEY    publishable anon key — safe to embed in the bundle
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    define: {
      __CRIBAI_APP_DOMAIN__: JSON.stringify(
        env['VITE_CRIBAI_APP_DOMAIN'] ?? 'https://cribai.app',
      ),
      __CRIBAI_API_BASE__: JSON.stringify(
        env['VITE_CRIBAI_API_BASE'] ??
          env['VITE_CRIBAI_APP_DOMAIN'] ??
          'https://cribai.app',
      ),
      __SUPABASE_URL__: JSON.stringify(env['VITE_SUPABASE_URL'] ?? ''),
      __SUPABASE_ANON_KEY__: JSON.stringify(env['VITE_SUPABASE_ANON_KEY'] ?? ''),
    },

    plugins: [
      {
        name: 'copy-extension-assets',
        closeBundle() {
          // manifest
          copyFileSync(
            resolve(__dirname, 'src/manifest.json'),
            resolve(__dirname, 'dist/manifest.json'),
          );
          // popup.html
          copyFileSync(
            resolve(__dirname, 'src/popup/popup.html'),
            resolve(__dirname, 'dist/popup.html'),
          );
          // icons
          const iconsDir = resolve(__dirname, 'dist/icons');
          if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
          for (const size of [16, 48, 128]) {
            const src = resolve(__dirname, `src/public/icons/icon${size}.png`);
            if (existsSync(src)) {
              copyFileSync(src, resolve(__dirname, `dist/icons/icon${size}.png`));
            }
          }
        },
      },
    ],

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: mode === 'development',
      minify: mode === 'production',

      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background/index.ts'),
          popup: resolve(__dirname, 'src/popup/popup.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: '[name].[ext]',
          // Service worker must not be split
          manualChunks(id) {
            if (id.includes('background/index')) return undefined;
            return undefined;
          },
        },
      },
    },

    // No publicDir — we copy manually above to keep control
    publicDir: false,
  };
});
