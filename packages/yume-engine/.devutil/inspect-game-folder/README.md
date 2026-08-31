# inspect-game-folder

Developer utility for the `@yumeshelf/engine` package.

Scans a root directory of game folders and produces a comprehensive JSON report exposing **every layer of engine output** per executable:

| Layer | Source | Fields |
|---|---|---|
| **PE Binary Structure** | `PEInspector` | COFF header, Optional header, Sections, Import table, `VS_VERSIONINFO` |
| **Engine Profile** | Rule registry | `family`, `variant`, `arch`, `runtime`, `saveStrategy`, `detectedBy` |
| **Surface Metadata** | Adjacent data files | `System.json` gameTitle, Unity `app.info`, NW.js `package.json`, Godot `project.godot`, Ren'Py `options.rpy`, `steam_appid.txt` |
| **Resolved Save Location** | Full resolver chain | `path`, `confidence`, `source`, `matchedStrategy`, all found save files |
| **Save Codec Probe** | `YumeEngine.decodeSaveFile` | Live decode of first save file, `topKeys`, success/error |

## Prerequisites

Build the engine package first:

```sh
cd packages/yume-engine
npm run build
```

## Usage

```sh
node packages/yume-engine/.devutil/inspect-game-folder/inspect-game-folder.cjs --dir <path> [options]
```

> **Note:** Uses `.cjs` extension because `packages/yume-engine` has `"type": "module"`. The utility loads `dist/index.cjs` via CommonJS `require()`.

### Options

| Flag      | Description                                                   | Default                      |
|-----------|---------------------------------------------------------------|------------------------------|
| `--dir`   | **(Required)** Root folder with one game per sub-directory.   | —                            |
| `--out`   | Output JSON file path.                                        | `inspect-output.json` in CWD |
| `--depth` | Max depth to search for `.exe` within each game folder.       | `2`                          |

### Examples

```sh
# Basic scan
node packages/yume-engine/.devutil/inspect-game-folder/inspect-game-folder.cjs \
  --dir "D:/Games/H Games"

# Custom output
node packages/yume-engine/.devutil/inspect-game-folder/inspect-game-folder.cjs \
  --dir "D:/Games/H Games" \
  --out .scratch/full-report.json

# Deeper scan for games with nested launchers
node packages/yume-engine/.devutil/inspect-game-folder/inspect-game-folder.cjs \
  --dir "D:/Games" --depth 3
```

## Output Schema (per inspection entry)

```jsonc
{
  "exePath": "D:/Games/GameName/Game.exe",
  "exeName": "Game.exe",
  "relativeExePath": "Game.exe",

  // Raw PE binary structure (COFF, Optional Header, Sections, Imports, VS_VERSIONINFO)
  "peDetails": {
    "valid": true,
    "is64Bit": true,
    "coff": { "machine": "0x8664", "numberOfSections": 6, "timestamp": "2023-01-01T..." },
    "optional": { "magic": "0x20B", "imageBase": "0x140000000", "subsystem": 2 },
    "sections": [{ "name": ".text", "virtualSize": 12345, "rawSize": 12800 }],
    "imports": [{ "dll": "UnityPlayer.dll", "functions": ["..."], "total": 3 }],
    "versionInfo": { "fileDescription": "...", "productName": "...", "companyName": "..." }
  },

  // Engine family / runtime / save strategy from rule registry
  "engineProfile": {
    "tag": "Unity", "family": "unity", "variant": "il2cpp",
    "arch": "x64", "runtime": "native",
    "saveStrategy": "unity", "detectedBy": "..."
  },

  // Metadata from adjacent files — not embedded in the .exe
  "surfaceMetadata": {
    "packageJson":  { "name": "", "windowTitle": "", "main": "www/index.html" },
    "systemJson":   { "gameTitle": "Fallen Priestess: ...", "locale": "en_US" },
    "appInfo":      { "companyName": "Studio", "productName": "GameName" },
    "godotProject": { "configName": "My Godot Game" },
    "renpyConfig":  { "configName": "Electric Sheep", "source": "game/options.rpy" },
    "steamAppId":   1234567
  },

  // Full resolver chain output
  "resolvedSaveLocation": {
    "path": "D:/Games/GameName/www/save",
    "confidence": "high",
    "source": "deterministic",
    "matchedStrategy": "rpg-maker-mv-mz",
    "files": ["file1.rpgsave", "file2.rpgsave"],
    "filesFound": 2
  },

  // Live save codec decode attempt
  "saveCodecProbe": {
    "attempted": true,
    "strategy": "rpg-maker-mv-mz",
    "sampleFile": "file1.rpgsave",
    "sampleSizeKb": 4.2,
    "decoded": true,
    "topKeys": ["switches", "variables", "selfSwitches", "actors"]
  }
}
```
