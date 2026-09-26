# 02 — macOS Compatibility Game Runner (Whisky, CrossOver & Homebrew Wine)

## Epic
PRD: Implementation for macOS Platform Support (Parked)

## What to build

Extend the Game Runner module in `src/main/game-runner` to support macOS runtime environments. Implement detection for native macOS binaries / `.app` bundles, Whisky (`/Applications/Whisky.app`), CrossOver (`cxrun`), and Homebrew Wine (`/opt/homebrew/bin/wine64`, `/usr/local/bin/wine64`). Implement launch resolution for native macOS games (with executable permission handling) and Windows `.exe` games running via macOS Wine/Whisky/CrossOver compatibility layers.

## Acceptance criteria

- [ ] Register `native-macos` detected runner on `env.platform === 'darwin'` in `src/main/game-runner/detector.ts`.
- [ ] Add detection logic in `detector.ts` for Whisky (`/Applications/Whisky.app`), CrossOver (`/Applications/CrossOver.app` or `cxrun`), and Homebrew Wine (`/opt/homebrew/bin/wine64`, `/usr/local/bin/wine64`).
- [ ] Extend `resolver.ts` to handle launching native macOS `.app` bundles via `/usr/bin/open` with `-W` (`/usr/bin/open -W -a "<appPath>" --args <gameArgs>`) or resolving inner executable `<appPath>/Contents/MacOS/<Executable>`, and for direct Mach-O binaries check `fs.constants.X_OK` and execute `fs.chmodSync(binPath, 0o755)` wrapped in `try...catch` (handling `EROFS`/`EACCES` on read-only DMGs by displaying a structured permission error modal).
- [ ] Support launching Windows `.exe` games on macOS via detected Wine/Whisky/CrossOver with custom prefixes, arguments, and environment variables using `child_process.spawn` with `args: string[]`, `shell: false`, and strict argument sanitization.
- [ ] Add unit tests in `tests/game-runner.test.js` validating macOS runner detection, `.app` bundle execution arguments, read-only filesystem permission handling, and launch parameter resolution.
- [ ] Execute automated unit tests via `npm test -- tests/game-runner.test.js` validating macOS runner detection, `.app` bundle execution arguments, read-only filesystem permission handling, and launch parameter resolution.

## Blocked by
- Epic 02: 01 — Core Platform Types & macOS Game Scanner Adapter
