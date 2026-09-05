# Icon Pipeline Runtime Simulator (`.devutil/icon-pipeline-sim/`)

A standalone Electron-backed simulation and verification utility for YumeShelf's icon resolution pipeline.

## Purpose

The icon pipeline relies on Electron's native image manipulation capabilities (`nativeImage.createFromPath`, `nativeImage.createFromBuffer`) to decode Windows PE executable icons, transcode legacy DIB frames, and crop transparent borders.

Pure Node.js unit tests (`node --test`) mock these C++ native bindings. This utility boots the real Chromium/Electron process to verify icon extraction, ICO transcoding fallbacks, and disk caching against actual native bindings without needing a full app launch.

## Requirements

Ensure TypeScript outputs are compiled:
```bash
npm run build:main
```

## Usage

### 1. Synthetic Fixture Mode (Default)
Generates mock games in `os.tmpdir()` covering:
- Windows PE with embedded 256x256 PNG frame
- Windows PE with embedded 256x256 DIB frame (Windows ICO)
- Folder with local `icon.png` artwork
- Executable without icon resources (shell icon fallback)

Run without arguments:
```bash
npx electron .devutil/icon-pipeline-sim
```
or via npm script:
```bash
npm run test:icon-sim
```

### 2. Target Directory Mode
Scans any directory containing game folders and executables, resolves candidates, and tests icon extraction on each game:
```bash
npx electron .devutil/icon-pipeline-sim "D:/Games/H Games"
```

## Exit Codes
- `0`: All icon requests succeeded and passed quality/dimension checks.
- `1`: One or more games encountered errors, empty decodes, or dimension downgrades.
