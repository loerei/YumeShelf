# Library Packaging, Exports Encapsulation, and Dual-Package Readiness

Audits package manifests (`package.json`, `Cargo.toml`, `pyproject.toml`), subpath exports encapsulation, ESM/CJS dual-package hazards, `peerDependencies` singleton safety, and multi-runtime portability.

## Domain Audit Checklist

### 1. Strict Package Encapsulation (`"exports"` & `"files"`)
- [ ] **Explicit `"exports"` Subpath Map**: Verify `package.json` defines an explicit `"exports"` field mapping only intended public entrypoints (`.` and `./<subpath>`), blocking consumers from deep-importing private internal paths (`pkg/dist/internal/*`).
- [ ] **Declaration-First Condition Ordering**: Within each `"exports"` target, verify `"types"` precedes `"import"`, `"require"`, and `"default"` (required by TypeScript `moduleResolution: "NodeNext"` / `"Bundler"`).
- [ ] **Publish Artifact Allowlist (`"files"`)**: Verify `package.json` declares an explicit `"files": ["dist", "README.md", "LICENSE"]` allowlist (or equivalent packaging manifest) so `.env`, test fixtures, benchmarks, and `.scratch/` never leak into published tarballs.

### 2. Dual-Package Hazard & Module Format Parity
- [ ] **Single-State Dual ESM/CJS Safety**: If a package ships both ESM (`import`) and CJS (`require`) builds and holds module-level state, symbols, or `instanceof`-checked classes, verify that CJS and ESM do not evaluate two isolated copies of the state/class in the same runtime process (e.g. use an ESM wrapper re-exporting the CJS core, `Symbol.for()` brand checks, or ship pure ESM).
- [ ] **Format-Matched Extensions**: Confirm ESM outputs use `.mjs` (or `.js` under `"type": "module"`) with `.d.mts`/`.d.ts`, and CJS outputs use `.cjs` with `.d.cts`, matching `"exports"` paths on disk.

### 3. Dependency Tiering (`peerDependencies` vs `dependencies`)
- [ ] **Host-Shared Runtime Singletons in `peerDependencies`**: Libraries integrating with host frameworks or context-sharing packages (e.g. `react`, `@opentelemetry/api`, `zod`, `graphql`, `@prisma/client`) MUST declare them in `peerDependencies` (with compatible SemVer ranges like `^18.0.0 || ^19.0.0`) rather than bundling them in `dependencies`, preventing duplicate framework copies and broken `instanceof` / `React.Context` identity.
- [ ] **Zero Dev/Build Leakage in `dependencies`**: Confirm linters, test runners (`vitest`, `jest`), type-fest helpers, and bundlers reside strictly in `devDependencies`.

### 4. Multi-Runtime & Engine Portability
- [ ] **Guard Node-Only Built-ins in Universal Libraries**: For libraries targeting browsers, Web Workers, or Edge runtimes (`workerd`, `deno`), reject unguarded top-level imports of `node:fs`, `node:path`, `node:crypto`, or `Buffer`. Use standard Web APIs (`Uint8Array`, `crypto.subtle`, `TextEncoder`, `fetch`) or conditional runtime exports (`"browser"`, `"workerd"`, `"node"`).

## Concrete Anti-Patterns

### Anti-Pattern 1: Unencapsulated `package.json` & Bundled Framework Singleton in `dependencies`

```json
// BAD: No "exports" map (allows deep-importing internal files), "types" placed after "default",
// and "@opentelemetry/api" placed in "dependencies" (causes duplicate OTel context globals in host app)
{
  "name": "acme-tracer-plugin",
  "main": "dist/index.js",
  "dependencies": {
    "@opentelemetry/api": "1.9.0",
    "vitest": "^2.0.0"
  }
}

// GOOD: Strict "exports" encapsulation with "types" first, "files" allowlist, "sideEffects": false,
// and host-shared singleton in "peerDependencies"
{
  "name": "acme-tracer-plugin",
  "version": "1.0.0",
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "peerDependencies": {
    "@opentelemetry/api": "^1.0.0"
  },
  "devDependencies": {
    "@opentelemetry/api": "^1.9.0",
    "vitest": "^2.0.0"
  }
}
```

## Failure Modes & Mitigations

| Failure Mode | Root Cause | Mitigation |
| :--- | :--- | :--- |
| **`TS2307` Under `NodeNext` Resolution** | `"types"` key placed after `"default"` or `"import"` in `package.json` `"exports"`, or `.d.cts` omitted for `require` branch. | Place `"types"` as the first key in every `"exports"` condition block and emit matching `.d.ts` / `.d.cts` files. |
| **`err instanceof MySdkError` Returns `false`** | Dual ESM/CJS package loads two separate class definitions in the same Node process. | Implement `[Symbol.hasInstance]` using a shared `Symbol.for("pkg.MySdkError")` brand marker on error/entity classes. |
| **Broken React Context / OTel Trace Propagation** | Library places `react` or `@opentelemetry/api` in `dependencies`, installing a second nested copy in `node_modules`. | Move shared host framework/API packages to `peerDependencies` (and `devDependencies` for local testing). |
