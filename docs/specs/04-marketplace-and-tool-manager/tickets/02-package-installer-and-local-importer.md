# 02 — Package Installer & Local Archive Importer

## Epic
PRD 04: Community Add-on Marketplace, Task Runner & Cascading Tool Manager

## What to build
The `AddonInstallerService` managing package installation from remote marketplace endpoints and manual local archive imports (`.zip` / folder) into `userData/addons/<id>/`, with hash verification, socket-level SSRF validation, atomic staging extraction, `addonId`-routed progress streaming, dependency injection seams, and IPC exposure on `window.electronAPI`.

## Explicit Assumptions & Boundaries
- Package installation extracts and verifies add-on assets into `userData/addons/<id>/`. (Runtime shim deployment into game directories is handled strictly by `AddonLifecycleService` in Ticket 06.1.2).
- Outbound network requests for package archives consume the shared `SSRFValidator` custom socket lookup agent to protect against DNS rebinding.

## Blocked by
- 01.1.1 — SSRF Socket Validator & Network Security Layer
- 01.1.2 — Manifest Registry and Multi-Tag Search Index
- 01.2 — Security-Hardened Zip Decompression Engine

## Status
ready-for-agent

## Acceptance criteria
- [ ] Implement `AddonInstallerService` under `src/main/addons/`, supporting optional `paths?: { addonsDir?: string, tempDir?: string }`, `fetchFn?: typeof fetch`, `ssrfValidator?: SSRFValidator`, `webContentsProvider?: () => Electron.WebContents[]`, and `broadcastFn?: (channel: string, payload: any) => void` in constructor for headless testing.
- [ ] Implement outbound network request downloading consuming `src/main/security/ssrf-validator.ts` custom socket lookup agent (or undici Dispatcher) and HTTPS enforcement, verifying SHA-256 integrity hash against manifest during stream download.
- [ ] Implement remote package installation extracting into atomic staging directory `userData/addons/.staging_<tool-id>_<timestamp>/` using `ZipExtractor` (enforcing Zip Slip suffix checks, DOS device name rejection, and ADS sanitization), atomically committing via directory rename to `userData/addons/<id>/` on success, and rolling back staging files on failure.
- [ ] Implement local archive / folder importer (`importLocalPackage`): validate imported `manifest.json`, verify manifest schema (including `shimFiles` and `entryPoint` containment), unpack local `.zip` or copy local directory into `userData/addons/<id>/` (traversing folders without dereferencing external symlinks `{ dereference: false }`). Sweep abandoned `.staging_*` folders older than 1 hour on startup.
- [ ] Implement package uninstaller (`uninstallPackage(addonId: string)`): validate `addonId` against `/^[a-z0-9_-]{3,64}$/`, assert `path.resolve(addonsDir, addonId)` resolves strictly within `addonsDir`, safely delete `userData/addons/<id>/`, and update registered add-on database.
- [ ] Implement progress event streaming (`download-progress` with `{ addonId: string, downloadedBytes: number, totalBytes: number, percent: number }`) to renderer webContents.
- [ ] Expose installer IPC channels (`addon:install-package`, `addon:import-local-package`, `addon:uninstall-package`, `addon:get-installed-addons`, `addon:download-progress`) on `window.electronAPI` in `src/preload.ts` via `contextBridge` and declare typed signatures in `src/shared/types/ipc.d.ts`.
- [ ] Integration tests verifying remote installation with socket-level SSRF protection and hash verification, local archive import with non-dereferenced symlinks, local directory import, corrupted package rollback, and clean package uninstallation.
- [ ] Execute automated tests via `npm run test:node -- tests/addon-installer.test.js`.
