# 01 — Build & Tooling Setup for React & Testing Library ($S$)

## Epic
[Epic 08: React Migration & Renderer Reconstruction](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/PRD.md)

## What to build
Configure Vite, TypeScript, and Vitest to support React 19, `@testing-library/react`, and establish a strict typecheck baseline:
1. **Dependencies & Package Manager**:
   - Mandate `pnpm` as the repository package manager for all dependency operations (prohibiting `npm install` or `npm add`, which fails fatally with `EUNSUPPORTEDPROTOCOL` on the monorepo `"@yumeshelf/engine": "workspace:*"` dependency):
     ```bash
     pnpm add -w -D react react-dom use-sync-external-store @tanstack/react-virtual vitest @vitejs/plugin-react@^6.0.0 @types/react @types/react-dom @types/use-sync-external-store @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event@^14.5.2 happy-dom
     ```
   - Add `react` (`^19.0.0`), `react-dom` (`^19.0.0`), `use-sync-external-store` (`^1.4.0`), `@tanstack/react-virtual` (`^3.11.0`), `vitest` (`^5.0.3`), `@types/react` (`^19.0.0`), `@types/react-dom` (`^19.0.0`), `@types/use-sync-external-store` (`^1.5.0`), `@vitejs/plugin-react` (`^6.0.0`), `@testing-library/react` (`^16.2.0`), `@testing-library/dom` (`^10.4.0`), `@testing-library/jest-dom` (`^6.6.3`), `@testing-library/user-event` (`^14.5.2`), and `happy-dom` (`^17.1.0`) to `devDependencies` in `package.json` (because Vite bundles all renderer code into `dist/renderer/`, keeping browser-oriented packages out of `dependencies` prevents duplicate packaging in `app.asar` and avoids `verify:deps` Node `require()` failures).
   - **Monorepo Clean-Clone Pre-requisite**: While root `tsconfig.json` paths resolve directly to TypeScript source (`packages/yume-engine/src/*.ts`), clean-clone CI pipelines and local developers should execute `pnpm --filter @yumeshelf/engine build` following dependency installation if distribution artifacts (`packages/yume-engine/dist/`) are required by external tooling or node package runners.
2. **Vite Configuration**:
   - Update [`vite.config.ts`](file:///d:/Projects/YumeShelf/vite.config.ts) to import `react` from `@vitejs/plugin-react` and include `react()` in `plugins: [react()]`.
   - Configure `resolve.alias` mirroring `tsconfig.json` paths (`@yumeshelf/engine/types` $\to$ `resolve(__dirname, 'packages/yume-engine/src/types.ts')` and `@yumeshelf/engine` $\to$ `resolve(__dirname, 'packages/yume-engine/src/index.ts')`, with subpath ordered first) to ensure Rollup bundles engine packages cleanly without sequential prefix collision. Note: `packages/yume-engine/src/types.ts` contains runtime JavaScript exports (classes, constants, error types) and therefore cannot be imported via value imports in renderer code; all imports from `@yumeshelf/engine/types` across renderer modules in `src/renderer/` must strictly use type-only syntax (`import type { ... }`). Direct imports from `'@yumeshelf/engine'` in `src/renderer/` are strictly prohibited to comply with the `ban-engine-runtime-in-renderer` build guard.
   - Configure the `ban-engine-runtime-in-renderer` Vite build guard plugin in `plugins` asserting that no renderer chunk references browser-external shims (`moduleIds.includes('__vite-browser-external') || moduleIds.some((m) => m.includes('browser-external'))`) or non-type engine modules (`packages/yume-engine/src/`), failing `npm run build:vite` fatally if runtime engine modules are leaked into the browser bundle.
3. **TypeScript Configuration & Strict Baseline**:
   - Update [`tsconfig.json`](file:///d:/Projects/YumeShelf/tsconfig.json) compiler options to add `"jsx": "react-jsx"`, `"strict": true`, update `"types": ["node", "vitest/globals", "vite/client"]` to provide global test typings (`describe`, `it`, `expect`, `vi`) and ambient client asset declarations (`.png`, `.svg`, `.mp3`) without type definition collisions, reorder `paths` with subpath `"@yumeshelf/engine/types"` declared before `"@yumeshelf/engine"` for symmetric alignment with Vite/Vitest resolvers, scope `"include"` array to `["src/**/*", "packages/*/src/**/*", "vitest.setup.*.ts", "vite.config.ts", "vitest.config.ts"]`, and add `"exclude": ["node_modules", "dist", "build_output", "packages/*/dist", "packages/*/tests"]` to ensure clean-clone monorepo compilation without depending on unbuilt package distribution artifacts, while relying on `vitest.setup.renderer.ts` to ambiently augment Vitest's `Assertion` interface with `@testing-library/jest-dom/vitest`.
   - Configure CI/npm script `"verify:no-ts-nocheck"` ratcheting the baseline directive count to ensure it does not exceed the codebase baseline of 65 files during migration (with zero-tolerance enforcement in Ticket 10.2).
4. **Vitest & Testing Harness**:
   - Create [`vitest.config.ts`](file:///d:/Projects/YumeShelf/vitest.config.ts) configuring `test.projects` with `extends: true` on each inline project to inherit root Vite plugins (`react()`) and `resolve.alias` (`@yumeshelf/engine`), isolating the `renderer` test environment (`environment: 'happy-dom'`, `setupFiles: [path.resolve(__dirname, 'vitest.setup.renderer.ts')]`, `include: ['src/renderer/**/*.{test,spec}.{ts,tsx}']`) from the `main` test environment (`environment: 'node'`, `setupFiles: [path.resolve(__dirname, 'vitest.setup.node.ts')]`, `include: ['src/main/**/*.{test,spec}.{ts,tsx}', 'src/shared/**/*.{test,spec}.{ts,tsx}']`), explicit fail-fast timeouts (`testTimeout: 10000`, `hookTimeout: 10000`), and `resolve.alias` mapping subpath `@yumeshelf/engine/types` before `@yumeshelf/engine` to avoid Rollup alias prefix collisions and Node/happy-dom global pollution.
   - Create headless test setup files (`vitest.setup.renderer.ts` and `vitest.setup.node.ts`) with ambient types `/// <reference types="@testing-library/jest-dom/vitest" />`, importing `@testing-library/jest-dom/vitest` and configuring global test cleanup, state isolation, and `window.ResizeObserver` mock for virtualized component containers (`afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); document.body.className = ''; document.body.innerHTML = ''; })`).
   - Author a headless sanity test in `src/renderer/react-sanity.test.tsx` verifying that a dummy React component mounts and asserts cleanly under Vitest without DOM leaks.
5. **Global Theme & Elevation Token Scale Contract ($S$)**:
   - Update [`src/styles/theme.css`](file:///d:/Projects/YumeShelf/src/styles/theme.css) to declare the complete, unified application elevation token scale in `:root` (`--zIndex-dropdown` through `--zIndex-toast`), establishing the prerequisite design token foundations ($S$) before behavioral UI feature tickets ($B$) consume them, and declare semantic danger action tokens `--danger-btn-bg: #e03131;` and `--danger-btn-hover-bg: #c92a2a;` matching the established codebase danger palette:
     ```css
     /* src/styles/theme.css */
     :root {
         /* ELEVATION SCALE TOKENS */
         --zIndex-dropdown: 1000;
         --zIndex-widget: 1600;
         --zIndex-widget-overlay: 1700;
         --zIndex-notification: 1800;
         --zIndex-modal: 2000;
         --zIndex-overlay: 6000;
         --zIndex-tooltip: 10000;
         --zIndex-toast: 10005;

         /* DANGER ACTION TOKENS */
         --danger-btn-bg: #e03131;
         --danger-btn-hover-bg: #c92a2a;
     }
     ```
6. **Viewport Scrollbar Layout Stability Contract ($S$)**:
   - Update [`src/styles/base.css`](file:///d:/Projects/YumeShelf/src/styles/base.css) to declare `scrollbar-gutter: stable` on `html, body`, ensuring that the 10px Windows vertical scrollbar space is reserved continuously to guarantee zero Cumulative Layout Shift (`CLS = 0`) across modal dialog transitions and dynamic list filtering states:
     ```css
     /* src/styles/base.css */
     html, body {
         scrollbar-gutter: stable;
     }
     ```
7. **Privacy-Safe Cross-Process Path Sanitizer Foundations ($S$)**:
   - Introduce [`src/shared/path-sanitizer.ts`](file:///d:/Projects/YumeShelf/src/shared/path-sanitizer.ts) defining and exporting `sanitizeUserPaths(text: unknown): string` and `sanitizeLoneSurrogates(input: string): string` as pure regex-based string transformers with zero Node.js native runtime module dependencies (`node:os`, `node:path`, `node:fs`) so that they execute identically across both Main process logs and Vite-bundled client-side error handling without bundler externalization failures or runtime crashes.
   - Safely accept `unknown` inputs (`null`, `undefined`, numbers, objects, prototype-less dictionaries created via `Object.create(null)`, and throwing `.toString()` getters) without throwing `TypeError`, returning `''` for nullish or un-stringifiable inputs, normalizing strings and scrubbing local filesystem usernames and home directories across Windows, macOS, and Linux using delimiter-safe lookahead token matchers:
     ```typescript
     const winUserDirRegex = /(?:[a-zA-Z]:(?:\\\\|\\|\/)(?:Users|Documents and Settings)(?:\\\\|\\|\/)[^\\\/":,;*?<>|\r\n]+)(?=(?:\\\\|\\|\/|"|'|`|\)|\]|:|,|;|\r?\n|$))/gi;
     const macUserDirRegex = /(?:\/Users\/[^/":,;*?<>|\r\n]+)(?=(?:\/|"|'|`|\)|\]|:|,|;|\r?\n|$))/gi;
     const linuxUserDirRegex = /(?:\/home\/[^/":,;*?<>|\r\n]+)(?=(?:\/|"|'|`|\)|\]|:|,|;|\r?\n|$))/g;

     export function sanitizeUserPaths(text: unknown): string {
       let str: string;
       if (typeof text === 'string') {
         str = text;
       } else if (text === null || text === undefined) {
         return '';
       } else {
         try {
           str = String(text);
         } catch {
           return '';
         }
       }
       return str
         .replace(winUserDirRegex, '<USER_DIR>')
         .replace(macUserDirRegex, '<USER_DIR>')
         .replace(linuxUserDirRegex, '<USER_DIR>');
     }

     export function sanitizeLoneSurrogates(input: string): string {
       return input.replace(
         /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
         '\uFFFD'
       );
     }
     ```
   - Author Vitest unit tests in [`src/shared/path-sanitizer.test.ts`](file:///d:/Projects/YumeShelf/src/shared/path-sanitizer.test.ts) verifying MultiOS path redaction across Windows, macOS, Linux, usernames containing spaces, JSON-escaped paths, colon/comma/semicolon error delimiters (`EACCES: open /home/alice: permission denied`, `Failed at /home/alice, retrying in 50ms`), lowercase `/users/` APFS paths, and `sanitizeLoneSurrogates` (preserving BMP and valid surrogate pairs, replacing lone high/low surrogates, and preventing `URIError` when passed to `encodeURIComponent`), passing cleanly under Vitest runner.

## Blocked by
- [Epic 07: Storage Schema Migration & Library Domain Core](file:///d:/Projects/YumeShelf/docs/specs/07-storage-schema-migration-and-domain-core/PRD.md)

## Status
todo

## Target Files

### [MODIFY] [`package.json`](file:///d:/Projects/YumeShelf/package.json)
- Add development dependencies (including Vite-bundled renderer packages so `electron-builder` and `verify:deps` do not treat browser bundles as Main-process runtime dependencies):
  - `react`: `^19.0.0`
  - `react-dom`: `^19.0.0`
  - `use-sync-external-store`: `^1.4.0`
  - `@tanstack/react-virtual`: `^3.11.0`
  - `vitest`: `^5.0.3`
  - `@types/react`: `^19.0.0`
  - `@types/react-dom`: `^19.0.0`
  - `@types/use-sync-external-store`: `^1.5.0`
  - `@vitejs/plugin-react`: `^6.0.0`
  - `@testing-library/react`: `^16.2.0`
  - `@testing-library/dom`: `^10.4.0`
  - `@testing-library/jest-dom`: `^6.6.3`
  - `@testing-library/user-event`: `^14.5.2`
  - `happy-dom`: `^17.1.0`
- Update and add `scripts`:
  - Update `"test:vitest"` to `"vitest run"`
  - Add `"verify:no-ts-nocheck"` cross-platform script:
    ```json
    "verify:no-ts-nocheck": "node -e \"let count = 0; try { const out = require('child_process').execSync('git grep -c @ts-nocheck src/').toString().trim(); count = out ? out.split('\\n').length : 0; } catch (e) { if (e.status === 1) { count = 0; } else { throw e; } } if (count > 65) { console.error('New @ts-nocheck introduced! Baseline 65, found: ' + count); process.exit(1); }\""
    ```

### [MODIFY] [`vite.config.ts`](file:///d:/Projects/YumeShelf/vite.config.ts)
- Add `react()` plugin from `@vitejs/plugin-react`.
- Configure `resolve.alias` mapping subpath `@yumeshelf/engine/types` BEFORE root `@yumeshelf/engine` (e.g. `resolve.alias: { '@yumeshelf/engine/types': resolve(__dirname, 'packages/yume-engine/src/types.ts'), '@yumeshelf/engine': resolve(__dirname, 'packages/yume-engine/src/index.ts') }`) to prevent Rollup's sequential prefix-matching alias resolver from intercepting subpath imports.
- Configure `ban-engine-runtime-in-renderer` plugin to assert zero runtime engine leakage into client chunks:
  ```typescript
  plugins: [
    react(),
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
  ]
  ```

### [MODIFY] [`tsconfig.json`](file:///d:/Projects/YumeShelf/tsconfig.json)
- Add `"jsx": "react-jsx"` to `compilerOptions`.
- Update `compilerOptions.types` to `["node", "vitest/globals", "vite/client"]` to ensure Vitest test runner globals and ambient Vite client asset types (`.png`, `.svg`, `.mp3`) are recognized by `tsc --noEmit` without requiring `@ts-ignore` or ambient type collisions.
- Update `"include"` array to `["src/**/*", "packages/*/src/**/*", "vitest.setup.*.ts", "vite.config.ts", "vitest.config.ts"]`.
- Add `"exclude"` array: `["node_modules", "dist", "build_output", "packages/*/dist", "packages/*/tests"]`.
- Reorder `compilerOptions.paths` mapping `"@yumeshelf/engine/types"` before `"@yumeshelf/engine"` for symmetric subpath resolution.
- Verified compiler options diff preserving codebase ground truth:
  ```diff
  --- a/tsconfig.json
  +++ b/tsconfig.json
  @@ -11,6 +11,8 @@
       "skipLibCheck": true,
       "isolatedModules": true,
       "allowImportingTsExtensions": true,
       "forceConsistentCasingInFileNames": true,
  -    "types": ["node"],
  +    "types": ["node", "vitest/globals", "vite/client"],
  +    "jsx": "react-jsx",
       "noEmit": true,
       "outDir": "dist",
       "paths": {
  +      "@yumeshelf/engine/types": ["./packages/yume-engine/src/types.ts"],
         "@yumeshelf/engine": ["./packages/yume-engine/src/index.ts"]
  -      "@yumeshelf/engine/types": ["./packages/yume-engine/src/types.ts"]
       }
     },
  -  "include": ["src/**/*", "packages/**/*"]
  +  "include": ["src/**/*", "packages/*/src/**/*", "vitest.setup.*.ts", "vite.config.ts", "vitest.config.ts"],
  +  "exclude": ["node_modules", "dist", "build_output", "packages/*/dist", "packages/*/tests"]
   }
  ```

### [NEW] [`vitest.config.ts`](file:///d:/Projects/YumeShelf/vitest.config.ts)
- Configure `defineConfig` imported from `'vitest/config'` using `test.projects`:
  ```typescript
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
  ```

### [NEW] [`vitest.setup.renderer.ts`](file:///d:/Projects/YumeShelf/vitest.setup.renderer.ts)
- Import `@testing-library/jest-dom/vitest` with ambient reference, mock `ResizeObserver` for virtualized list containers, and configure DOM/React cleanups:
  ```typescript
  /// <reference types="@testing-library/jest-dom/vitest" />
  import '@testing-library/jest-dom/vitest';
  import { afterEach, vi } from 'vitest';
  import { cleanup } from '@testing-library/react';

  if (typeof window !== 'undefined' && !window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (typeof window !== 'undefined' && !window.Audio) {
    window.Audio = class MockAudio {
      src = '';
      volume = 1;
      currentTime = 0;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
    } as any;
  }

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    if (typeof document !== 'undefined') {
      document.body.className = '';
      document.body.innerHTML = '';
    }
  });
  ```

### [NEW] [`vitest.setup.node.ts`](file:///d:/Projects/YumeShelf/vitest.setup.node.ts)
- Configure pure Node runner cleanup without DOM or `@testing-library/react` dependencies:
  ```typescript
  import { afterEach, vi } from 'vitest';

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  ```

### [NEW] [`src/renderer/react-sanity.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/react-sanity.test.tsx)
- Author test verifying Vitest renders React components via `@testing-library/react` and handles state changes:
  ```tsx
  import React, { useState } from 'react';
  import { describe, it, expect } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/react';

  function TestCounter() {
    const [count, setCount] = useState(0);
    return (
      <div>
        <span data-testid="count-display">Count: {count}</span>
        <button type="button" onClick={() => setCount((c) => c + 1)}>
          Increment
        </button>
      </div>
    );
  }

  describe('React 19 & Testing Library Sanity Harness', () => {
    it('renders component, executes state transitions, and asserts DOM updates cleanly', () => {
      render(<TestCounter />);
      const display = screen.getByTestId('count-display');
      const button = screen.getByRole('button', { name: /increment/i });

      expect(display).toHaveTextContent('Count: 0');
      fireEvent.click(button);
      expect(display).toHaveTextContent('Count: 1');
    });
  });
  ```

### [NEW] [`src/renderer/test/environment.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/test/environment.test.ts)
- Author minimal smoke test asserting Happy-DOM emulator globals are functional before component tests begin:
  ```typescript
  import { describe, it, expect } from 'vitest';

  describe('Happy-DOM Environment Baseline', () => {
    it('initializes window and document globals correctly', () => {
      expect(typeof window).toBe('object');
      expect(typeof document).toBe('object');
      expect(typeof document.createElement).toBe('function');
    });
  });
  ```

### [MODIFY] [`src/styles/theme.css`](file:///d:/Projects/YumeShelf/src/styles/theme.css)
- Declare the unified application elevation token scale and canonical danger button tokens in `:root`:
  ```css
  :root {
      /* ELEVATION SCALE TOKENS */
      --zIndex-dropdown: 1000;
      --zIndex-widget: 1600;
      --zIndex-widget-overlay: 1700;
      --zIndex-notification: 1800;
      --zIndex-modal: 2000;
      --zIndex-overlay: 6000;
      --zIndex-tooltip: 10000;
      --zIndex-toast: 10005;

      /* DANGER ACTION TOKENS */
      --danger-btn-bg: #e03131;
      --danger-btn-hover-bg: #c92a2a;
  }
  ```

### [MODIFY] [`src/styles/base.css`](file:///d:/Projects/YumeShelf/src/styles/base.css)
- Declare `scrollbar-gutter: stable` on root elements:
  ```css
  html, body {
      scrollbar-gutter: stable;
  }
  ```

### [NEW] [`src/shared/path-sanitizer.ts`](file:///d:/Projects/YumeShelf/src/shared/path-sanitizer.ts)
- Define and export `sanitizeUserPaths(text: unknown): string` and `sanitizeLoneSurrogates(input: string): string` as pure regex-based string transformers with zero Node native runtime dependencies (`node:os`, `node:path`, `node:fs`), safely accepting `unknown` inputs without throwing `TypeError`, scrubbing local filesystem usernames and personal directories across Windows, macOS, and Linux (including colon/comma/semicolon error delimiters and case-insensitive APFS `/users/` paths) without PII bypass, and neutralizing unpaired UTF-16 surrogates to `\uFFFD` before `encodeURIComponent`.

### [NEW] [`src/shared/path-sanitizer.test.ts`](file:///d:/Projects/YumeShelf/src/shared/path-sanitizer.test.ts)
- Vitest unit tests verifying `sanitizeUserPaths` MultiOS path redaction across Windows, macOS, Linux, usernames containing spaces, JSON-escaped paths, colon/comma/semicolon delimited errors, lowercase `/users/` paths, and verifying `sanitizeLoneSurrogates` preserves BMP and valid surrogate pairs while replacing lone surrogates and truncated pairs, passing cleanly under Vitest runner.

## Acceptance Criteria
- [ ] Dependencies installed via `pnpm` using the workspace root flag (`pnpm add -w ...` and `pnpm add -w -D ...`); running `npm install` is prohibited to prevent `workspace:*` protocol failures on `@yumeshelf/engine`.
- [ ] `react`, `react-dom`, `use-sync-external-store`, and `@tanstack/react-virtual` installed in `package.json` under `dependencies`.
- [ ] `vitest`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/use-sync-external-store`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `happy-dom` installed under `devDependencies`.
- [ ] `package.json` defines cross-platform `"verify:no-ts-nocheck"` script ratcheting the baseline to <= 65 @ts-nocheck files (handling `git grep` exit status 1 cleanly when match count reaches 0).
- [ ] `package.json` updates `"test:vitest"` to `"vitest run"`.
- [ ] `vite.config.ts` and `vitest.config.ts` incorporate `react()` plugin and configure `resolve.alias` with subpath `@yumeshelf/engine/types` ordered before `@yumeshelf/engine` (or exact regex matchers) to ensure subpath imports resolve without Rollup alias prefix collision.
- [ ] All imports from `@yumeshelf/engine/types` across renderer modules in `src/renderer/` strictly use type-only import syntax (`import type { ... }`). Direct imports from `'@yumeshelf/engine'` in `src/renderer/` are strictly prohibited to comply with the `ban-engine-runtime-in-renderer` build guard, verifying that `npm run build:vite` fails fatally if runtime engine modules or browser-external shims are bundled into `dist/renderer/`.
- [ ] `vitest.config.ts` imports `defineConfig` directly from `'vitest/config'` to provide native type definitions for `test.projects` and configuration blocks.
- [ ] `tsconfig.json` declares `"jsx": "react-jsx"`, configures `"types": ["node", "vitest/globals", "vite/client"]`, reorders `"paths"` mapping `@yumeshelf/engine/types` before `@yumeshelf/engine`, scopes `"include"` to `["src/**/*", "packages/*/src/**/*", "vitest.setup.*.ts", "vite.config.ts", "vitest.config.ts"]`, and configures `"exclude"` to `["node_modules", "dist", "build_output", "packages/*/dist", "packages/*/tests"]`, passing `tsc --noEmit` in clean checkouts without pre-built `packages/yume-engine/dist`.
- [ ] `tsconfig.json` includes `"vite/client"` in `compilerOptions.types` so that static assets (`.png`, `.svg`, `.mp3`) and Vite client types are ambiently typed across renderer code without `@ts-ignore`.
- [ ] Clean-clone guidance documented for CI and local workflows: running `pnpm --filter @yumeshelf/engine build` after `pnpm install` ensures workspace package dist types exist for external tooling.
- [ ] `vitest.config.ts` configures `test.projects` with `extends: true` on each inline project to inherit root Vite plugins (`react()`) and `resolve.alias` (`@yumeshelf/engine`), isolating `renderer` (`happy-dom`, `setupFiles: [path.resolve(__dirname, 'vitest.setup.renderer.ts')]`) from `main` (`node`, `setupFiles: [path.resolve(__dirname, 'vitest.setup.node.ts')]`) environments, configures explicit fail-fast timeouts (`testTimeout: 10000`, `hookTimeout: 10000`), and configures `resolve.alias` with subpath `@yumeshelf/engine/types` ordered before root `@yumeshelf/engine`.
- [ ] `vitest.setup.renderer.ts` initializes testing library environment cleanly with ambient type reference, DOM cleanup, mock resets, global `window.ResizeObserver` mock for virtualized component containers, and global `window.Audio` mock for mascot audio effects.
- [ ] `vitest.setup.node.ts` resets mocks and timers for Node process tests without loading DOM globals or React dependencies.
- [ ] `src/styles/theme.css` defines the canonical application elevation scale (`--zIndex-dropdown` through `--zIndex-toast`) and semantic danger button tokens (`--danger-btn-bg: #e03131;` and `--danger-btn-hover-bg: #c92a2a;`) in `:root`, with zero unverified `--accent-color`, `--danger-color`, or `--danger-hover-color` aliases.
- [ ] `src/styles/base.css` defines `scrollbar-gutter: stable` on `html, body`, continuously reserving vertical scrollbar space and guaranteeing visual Cumulative Layout Shift `CLS = 0` during modal open/close transitions and search filter mutations.
- [ ] `src/shared/path-sanitizer.ts` defines and exports `sanitizeUserPaths(text: unknown): string` and `sanitizeLoneSurrogates(input: string): string` as pure regex-based string transformers with zero Node native runtime dependencies (`node:os`, `node:path`, `node:fs`), safely accepting `unknown` inputs without throwing `TypeError`, scrubbing local filesystem usernames and personal directories across Windows, macOS, and Linux (including colon/comma/semicolon delimiters and case-insensitive APFS `/users/` paths) without PII bypass, and replacing lone UTF-16 surrogates with `\uFFFD`.
- [ ] `src/shared/path-sanitizer.test.ts` unit tests verify `sanitizeUserPaths` MultiOS path redaction across Windows, macOS, Linux, usernames containing spaces, JSON-escaped paths, colon/comma/semicolon delimited error strings, and verify `sanitizeLoneSurrogates` handles valid BMP, valid surrogate pairs, lone high/low surrogates, and truncated surrogate slices without throwing `URIError` when passed to `encodeURIComponent`.
- [ ] Sanity test in `src/renderer/react-sanity.test.tsx` passes with zero warnings or errors.
- [ ] Minimal smoke test in `src/renderer/test/environment.test.ts` passes under Vitest, asserting `window`, `document`, and `document.createElement` globals are registered.
- [ ] Execute automated verification command: `pnpm test:vitest -- src/renderer/react-sanity.test.tsx src/renderer/test/environment.test.ts src/shared/path-sanitizer.test.ts && pnpm typecheck`.

## Verification Command
```bash
pnpm test:vitest -- src/renderer/react-sanity.test.tsx src/renderer/test/environment.test.ts src/shared/path-sanitizer.test.ts && pnpm typecheck
```
