import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**'],
  },
  // Test files and vitest setup use anonymous mock components — display names not needed
  {
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', 'vitest.setup.ts'],
    rules: {
      'react/display-name': 'off',
    },
  },
];

export default config;
