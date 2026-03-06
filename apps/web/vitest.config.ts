import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: [
      'lib/__tests__/**/*.test.ts',
      '__tests__/**/*.test.{ts,tsx}',
      'components/**/__tests__/**/*.test.{ts,tsx}',
    ],
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
