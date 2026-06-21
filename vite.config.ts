import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    root: 'src',
    base: './',
    build: {
        outDir: '../dist/renderer',
        emptyOutDir: true,
        target: 'esnext'
    },
    server: {
        port: 5173,
        strictPort: true
    }
});
