import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    root: 'src',
    base: './',
    plugins: [
        react(),
        {
            name: 'dev-csp-react-refresh',
            apply: 'serve',
            transformIndexHtml(html) {
                return html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
            }
        },
        {
            name: 'ban-engine-runtime-in-renderer',
            generateBundle(_options, bundle) {
                for (const fileName in bundle) {
                    const chunk = bundle[fileName];
                    if (chunk.type === 'chunk') {
                        const moduleIds = Object.keys(chunk.modules);
                        const offendingModules = moduleIds.filter(
                            (m) =>
                                m.includes('__vite-browser-external') ||
                                m.includes('browser-external') ||
                                m.replace(/\\/g, '/').includes('packages/yume-engine/src/')
                        );
                        if (offendingModules.length > 0) {
                            throw new Error(
                                `[Vite Build Error] Renderer bundle "${fileName}" illegally contains runtime engine modules or browser-external shims: ${offendingModules.join(', ')}! All imports from @yumeshelf/engine or @yumeshelf/engine/types in src/renderer/ must strictly use type-only syntax ('import type { ... }').`
                            );
                        }
                    }
                }
            }
        }
    ],
    resolve: {
        alias: {
            '@yumeshelf/engine/types': resolve(__dirname, 'packages/yume-engine/src/types.ts'),
            '@yumeshelf/engine': resolve(__dirname, 'packages/yume-engine/src/index.ts')
        }
    },
    build: {
        outDir: '../dist/renderer',
        emptyOutDir: true,
        target: 'esnext',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'src/index.html'),
                saveEditor: resolve(__dirname, 'src/save-editor.html')
            }
        }
    },
    server: {
        port: 5173,
        strictPort: true
    }
});
