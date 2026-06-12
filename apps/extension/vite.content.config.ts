/**
 * Second Vite build pass — content script bundle (AIN-72).
 *
 * Content scripts in MV3 CANNOT be ES modules (Chrome loads them as classic
 * scripts without `type="module"`). Vite's default multi-entry build splits
 * shared code into chunks which would create ES-import statements that break
 * in the content-script context. We therefore build the content entry as a
 * self-contained IIFE in a separate pass so the output is always a single
 * file with no runtime imports.
 *
 * Build order: `vite build` (main pass) then `vite build --config vite.content.config.ts`
 * Main pass: emptyOutDir:true — clears dist/ and writes background.js + popup.js + assets.
 * Content pass: emptyOutDir:false — adds content.js without removing the main-pass output.
 */

import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

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

    build: {
      outDir: 'dist',
      emptyOutDir: false, // second pass — keep background/popup output from main pass
      sourcemap: mode !== 'production',
      minify: mode === 'production',
      rollupOptions: {
        input: resolve(__dirname, 'src/content/index.ts'),
        output: {
          format: 'iife',
          entryFileNames: 'content.js',
          inlineDynamicImports: true,
        },
      },
    },

    // No publicDir — assets are already copied by the main pass plugin
    publicDir: false,
  };
});
