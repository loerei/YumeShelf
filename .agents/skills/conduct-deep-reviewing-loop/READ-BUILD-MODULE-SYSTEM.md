# Build Systems, Module Resolution, and Cross-Platform Filesystem Readiness

Audits ESM/CommonJS interoperability, TypeScript/bundler configuration, monorepo workspace resolution, and OS filesystem portability.

## Domain Audit Checklist

### 1. Module System & Bundler Interoperability
- [ ] **ESM vs. CommonJS Parity**: Verify package import/export syntax aligns with `package.json` `"type"` (`"module"` vs `"commonjs"`) and `tsconfig.json` `module` / `moduleResolution` (`NodeNext`, `Bundler`). Reject mixing `require()` inside pure ESM modules without `createRequire`, or importing ESM-only packages via `require()` in CJS targets.
- [ ] **Explicit Extension & Path Alias Resolution**: When `moduleResolution` is `Node16` or `NodeNext`, verify relative imports specify explicit runtime extensions (`.js`). If path aliases (`@/*`) are used, confirm both `tsconfig.json` `paths` AND the runtime/bundler resolver (Vite `resolve.alias`, Vitest, `tsx`) are configured symmetrically.
- [ ] **Native Addon & Node Built-in Externalization**: In desktop/hybrid bundlers (Electron, Tauri, Vite, Rollup, esbuild), verify native binary addons (`.node`, `better-sqlite3`, `sharp`) and Node built-ins (`node:fs`, `node:crypto`) are marked `external` in bundler configs and prevented from leaking into browser/renderer bundles.

### 2. Monorepo & Workspace Dependency Hygiene
- [ ] **No Phantom Dependencies**: Verify every imported package is explicitly declared in the consuming package's own `package.json` / `Cargo.toml` / `pyproject.toml`, never relying on accidental root `node_modules` hoisting.
- [ ] **Workspace Build Topology**: In multi-package workspaces (`pnpm`, `npm`, `turborepo`, `cargo`), verify upstream workspace packages build declaration files (`.d.ts`) or artifacts before downstream packages run typechecking or tests.

### 3. Cross-Platform OS & Filesystem Portability
- [ ] **Path Separator & URL Normalization**: Reject hardcoded `/` or `\` string concatenation or `.split('/')` on filesystem paths. Mandate `path.join`, `path.resolve`, `path.sep`, and `url.fileURLToPath` / `url.pathToFileURL` when converting between `file://` URLs and OS paths.
- [ ] **Case-Sensitive Import Parity**: Verify import path casing matches exact on-disk filename casing so builds passing on case-insensitive macOS/Windows do not fail on case-sensitive Linux CI filesystems.
- [ ] **Windows File Locking & `MAX_PATH` Guards**: On Windows targets, verify open file descriptors and SQLite/log handles are closed before renaming or deleting files (avoiding `EBUSY` / `EPERM`), and keep nested scratch/artifact paths within 260-character bounds.

## Concrete Anti-Patterns

### Anti-Pattern 1: Hardcoded Path String Splitting & Unexternalized Native Addon

```typescript
// BAD: String splitting breaks on Windows backslashes; bundling native sqlite3 into renderer crashes build
const folderName = filePath.split("/").pop(); // Returns full path on Windows ("C:\\app\\data")

// GOOD: Use node:path utilities and externalize native modules in bundler config
import * as path from "node:path";
const folderName = path.basename(filePath);

// vite.config.ts (Main/Preload build):
export default defineConfig({
  build: {
    rollupOptions: {
      external: ["better-sqlite3", /^node:/]
    }
  }
});
```

### Anti-Pattern 2: Unsynchronized TypeScript Path Aliases Breaking Runtime Execution

```json
// BAD: Adding "@core/*" to tsconfig.json without configuring bundler/test runner alias resolver.
// tsc --noEmit passes, but Vite/Vitest/Node crashes at runtime with ERR_MODULE_NOT_FOUND.
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@core/*": ["src/core/*"] }
  }
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **`ERR_REQUIRE_ESM` at Startup** | CJS build calls `require()` on an ESM-only dependency. | Align build target to ESM or load via dynamic `await import()` in async bootstrap. |
| **Linux CI Build Failure on Imports** | Developer imports `./UserProfile` while file on disk is `userProfile.ts`. | Verify exact filename casing on disk and enforce `forceConsistentCasingInFileNames: true` in `tsconfig.json`. |
| **Phantom Dependency Crash in Prod** | Code imports transitive package not listed in `package.json`. | Declare all direct imports in `dependencies` and verify via `npm ls` / `pnpm why`. |
