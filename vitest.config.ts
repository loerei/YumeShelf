/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 10000,
    hookTimeout: 10000,
    projects: [
      {
        extends: true,
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
          environment: 'happy-dom',
          setupFiles: [path.resolve(__dirname, 'vitest.setup.renderer.ts')],
          globals: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'main',
          include: ['src/main/**/*.{test,spec}.{ts,tsx}', 'src/shared/**/*.{test,spec}.{ts,tsx}'],
          environment: 'node',
          setupFiles: [path.resolve(__dirname, 'vitest.setup.node.ts')],
          globals: true,
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@yumeshelf/engine/types': path.resolve(__dirname, 'packages/yume-engine/src/types.ts'),
      '@yumeshelf/engine': path.resolve(__dirname, 'packages/yume-engine/src/index.ts'),
    },
  },
});
