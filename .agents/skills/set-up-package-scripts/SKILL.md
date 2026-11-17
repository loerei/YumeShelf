---
name: set-up-package-scripts
description: Use when organizing, hardening, or automating package scripts and fail-fast build pipelines.
---

# Set Up Package Scripts

Configure and structure npm/pnpm package scripts with fail-fast preflight gates, deterministic asset pipelines, and clean lifecycle boundaries. For script templates and the dependency crawler implementation, see [REFERENCE.md](REFERENCE.md).

## Directives

1. **Fail-Fast Gating**: Heavy build commands (`build`, `build:linux`, `build:win`, `release`) MUST run lightweight verification gates first (`verify:deps`, `typecheck`, `lint`) before compilers or packagers.
2. **Deterministic Script Hierarchy**: Group scripts under standard namespace prefixes (`build:*`, `test:*`, `verify:*`, `ensure:*`, `sync:*`, `clean:*`).
3. **Cross-Platform Execution**: Scripts MUST run identically across Windows (cmd/PowerShell), macOS (zsh), Linux (bash), and CI/Docker without machine-specific absolute paths.
4. **Zero Silent Failures**: Verification scripts MUST exit with code `1` (`process.exit(1)`) on any unresolved dependency or assertion failure.
5. **Read-Only CI Verifiers**: Verification commands (`verify:deps`) MUST stay read-only; mutating helpers (`sync:deps`, `lint:fix`, `format`) MUST live in separate commands.

## Canonical Script Taxonomy

```json
{
  "scripts": {
    "// PREFLIGHT & AUDITING": "",
    "verify:deps": "node scripts/verify-packaged-dependencies.js",
    "sync:deps": "node scripts/verify-packaged-dependencies.js --fix",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src",
    "lint:fix": "biome check --write src",
    "check": "npm run verify:deps && npm run typecheck && npm run test",

    "// COMPILATION & ASSETS": "",
    "ensure:bins": "node scripts/ensure-binaries.js",
    "copy:assets": "copyfiles -u 1 \"src/assets/**/*\" dist",
    "build:preload": "tsup src/preload.ts --out-dir dist --format cjs --external electron",
    "build:main": "tsc -p tsconfig.main.json",
    "build:vite": "vite build",

    "// PACKAGING & ARTIFACTS (FAIL-FAST)": "",
    "organize:build-output": "node scripts/organize-build-output.js",
    "build": "npm run check && npm run ensure:bins && npm run build:preload && npm run build:main && npm run copy:assets && npm run build:vite && electron-builder --win && npm run organize:build-output",
    "build:linux": "npm run check && npm run ensure:bins && npm run build:preload && npm run build:main && npm run copy:assets && npm run build:vite && electron-builder --linux && npm run organize:build-output",
    "build:fast": "npm run verify:deps && npm run build:preload && npm run build:main && npm run copy:assets && npm run build:vite && electron-builder --dir && npm run organize:build-output",

    "// MAINTENANCE & CLEANUP": "",
    "clean": "node scripts/clean.js",
    "clean:all": "node scripts/clean.js --all"
  }
}
```

## Fail-Fast Execution Pipeline

1. **Preflight Gate (`0-3s`)**: Run `verify:deps`, `typecheck`, and `lint` -> exit `1` immediately on missing dependencies or type/lint errors.
2. **Assets & Binaries**: Run `ensure:bins` (compile/fetch native binaries) and `copy:assets`.
3. **Compilation**: Run `build:preload`, `build:main`, and `build:vite`.
4. **Unit Tests (`npm test`)**: Exit `1` immediately before heavy packaging if any test fails.
5. **Packaging**: Run heavy packager (`electron-builder`, `docker`).
6. **Post-Build Organize**: Run `organize:build-output` to sort generated files into `application/`, `feed/`, `metadata/`, and `unpacked/`.
