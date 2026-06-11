import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/lib/**', 'src/config/**'],
      exclude: ['src/**/__tests__/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // Stub out build-time globals so tests can run without a Vite build
  define: {
    __CRIBAI_APP_DOMAIN__: JSON.stringify('https://cribai.app'),
    __CRIBAI_API_BASE__: JSON.stringify('https://cribai.app'),
    __SUPABASE_URL__: JSON.stringify('https://test.supabase.co'),
    __SUPABASE_ANON_KEY__: JSON.stringify('test-anon-key'),
  },
});
