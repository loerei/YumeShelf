# 01 — Build & Tooling Setup for React & Testing Library ($S$)

## Epic
[Epic 08: React & Virtual DOM Migration Foundation](file:///d:/Projects/YumeShelf/docs/specs/08-react-migration/PRD.md)

## What to build
Configure Vite, TypeScript, and Vitest to support React 19 and `@testing-library/react`:
1. **Dependencies**:
   - Add `react` (`^19.0.0`) and `react-dom` (`^19.0.0`) to `dependencies` in `package.json`.
   - Add `@types/react` (`^19.0.0`), `@types/react-dom` (`^19.0.0`), `@vitejs/plugin-react` (`^4.3.4`), `@testing-library/react` (`^16.2.0`), `@testing-library/jest-dom` (`^6.6.3`), and `happy-dom` (`^17.1.0`) to `devDependencies` in `package.json`.
2. **Vite Configuration**:
   - Update [`vite.config.ts`](file:///d:/Projects/YumeShelf/vite.config.ts) to import `react` from `@vitejs/plugin-react` and include `react()` in `plugins: [react()]`.
3. **TypeScript Configuration**:
   - Update [`tsconfig.json`](file:///d:/Projects/YumeShelf/tsconfig.json) compiler options to add `"jsx": "react-jsx"`.
4. **Vitest & Testing Harness**:
   - Create or update Vitest configuration to recognize JSX/TSX and provide a headless test setup file (`vitest.setup.ts`) importing `@testing-library/jest-dom/vitest`.
   - Author a headless sanity test in `src/renderer/react-sanity.test.tsx` verifying that a dummy React component mounts and asserts cleanly under Vitest without DOM leaks.

## Blocked by
- [Epic 07: Storage Schema Migration & Library Domain Core](file:///d:/Projects/YumeShelf/docs/specs/07-storage-schema-migration-and-domain-core/PRD.md)

## Status
todo

## Target Files

### [MODIFY] [`package.json`](file:///d:/Projects/YumeShelf/package.json)
- Add runtime dependencies:
  - `react`: `^19.0.0`
  - `react-dom`: `^19.0.0`
- Add development dependencies:
  - `@types/react`: `^19.0.0`
  - `@types/react-dom`: `^19.0.0`
  - `@vitejs/plugin-react`: `^4.3.4`
  - `@testing-library/react`: `^16.2.0`
  - `@testing-library/jest-dom`: `^6.6.3`
  - `happy-dom`: `^17.1.0`

### [MODIFY] [`vite.config.ts`](file:///d:/Projects/YumeShelf/vite.config.ts)
- Add `react()` plugin from `@vitejs/plugin-react`.

### [MODIFY] [`tsconfig.json`](file:///d:/Projects/YumeShelf/tsconfig.json)
- Add `"jsx": "react-jsx"` to `compilerOptions`.

### [NEW] [`vitest.setup.ts`](file:///d:/Projects/YumeShelf/vitest.setup.ts)
- Import `@testing-library/jest-dom/vitest` and configure global cleanups (`afterEach(cleanup)`).

### [NEW] [`src/renderer/react-sanity.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/react-sanity.test.tsx)
- Author test verifying Vitest renders React components via `@testing-library/react` and handles state changes.

## Acceptance Criteria
- [ ] `react` and `react-dom` installed in `package.json` under `dependencies`.
- [ ] `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@testing-library/react`, and `@testing-library/jest-dom` installed under `devDependencies`.
- [ ] `vite.config.ts` incorporates `react()` plugin.
- [ ] `tsconfig.json` declares `"jsx": "react-jsx"`.
- [ ] `vitest.setup.ts` initializes testing library environment cleanly.
- [ ] Sanity test in `src/renderer/react-sanity.test.tsx` passes with zero warnings or errors.
- [ ] `npm run typecheck` and `npm run test:vitest` pass cleanly.

## Verification Command
```bash
npm run test:vitest -- src/renderer/react-sanity.test.tsx && npm run typecheck
```
