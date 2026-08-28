# YumeShelf Developer Utilities (`.devutil/`)

A suite of standalone CLI utilities for benchmarking, diagnosing, and inspecting game assets and binary executable icons across YumeShelf's Icon Resolution Pipeline.

---

## 🛠️ Available Utilities

### 1. `simulate-icon-pipeline.cjs`
**Full End-to-End Icon Pipeline Simulator & Benchmark Tool**

Simulates YumeShelf's 5-Branch Icon Resolution Cascade against any directory containing game executables. Measures worker extraction latency, cache hit performance, and branch distributions.

```bash
# Run simulation against a game library folder (uses disk cache if available)
node .devutil/simulate-icon-pipeline.cjs "D:/Games/MyGames"

# Force cold extraction (bypass disk cache)
node .devutil/simulate-icon-pipeline.cjs "D:/Games/MyGames" --bypass-cache

# Wipe high-res disk cache and force cold extraction
node .devutil/simulate-icon-pipeline.cjs "D:/Games/MyGames" --clear-cache --bypass-cache
```

---

### 2. `inspect-exe-icon.cjs`
**Windows PE Executable Icon Frame & Resolution Inspector**

Inspects the internal icon frames of a Windows PE binary (`.exe`), detects whether high-definition 256px PNG data exists natively in the PE resource table, or if the icon is upscaled by the OS from lower-resolution DIB bitmaps (16px / 32px / 48px).

```bash
# Inspect icon frames and PNG signatures inside an executable
node .devutil/inspect-exe-icon.cjs "D:/Games/MyGames/Game.exe"

# To test native extraction matrix with full Desktop Shell context:
$env:ELECTRON_RUN_AS_NODE="1"; & "node_modules/.pnpm/electron@29.4.6/node_modules/electron/dist/electron.exe" .devutil/inspect-exe-icon.cjs "D:/Games/MyGames/Game.exe"
```

---

### 3. `inspect-engine-icon.cjs`
**Game Engine Asset & Static Icon Inspector**

Analyzes game engine configurations (`package.json`, `window.icon`), scans candidate paths for Branch A (`icon.png`, `cover.jpg`, `icon/icon.png`, `www/icon/icon.png`), checks dimensions and SHA-1 hashes, and identifies default engine template icons vs custom game artwork.

```bash
# Inspect game engine directory assets and static candidates
node .devutil/inspect-engine-icon.cjs "D:/Games/MyGames/RPG_Game_Folder"
```

---

### 4. `simulate-save-pipeline.cjs`
**Full End-to-End Save Folder, Save Format & Auxiliary Metadata Pipeline Simulator**

Simulates YumeShelf's complete Save Resolution and Metadata Pipeline against any target library directory. Hooks directly into production modules (`scanner.ts`, `save-folder-resolver`, `SaveDataEngine`, `SaveEditorService`) to evaluate game discovery, save directory resolution rates, confidence distribution, recognized save file formats, and auxiliary game metadata (Items, Weapons, Armors, Variables, Switches, System configurations, and Multi-language packs).

```bash
# Run simulation against a game library folder
node .devutil/simulate-save-pipeline.cjs "D:/Games/MyGames"

# List individual save files and matched format strategies
node .devutil/simulate-save-pipeline.cjs "D:/Games/MyGames" --list-files

# Inspect in-game auxiliary metadata (Items, Weapons, Armors, Variables, Switches, Titles)
node .devutil/simulate-save-pipeline.cjs "D:/Games/MyGames" --metadata

# Output raw JSON metrics for automated evaluations
node .devutil/simulate-save-pipeline.cjs "D:/Games/MyGames" --json
```

---

### 5. `inspect-game-engine.cjs`
**Game Engine & F95zone Tag Binary Inspector**

High-performance binary inspector and classifier covering 100% of F95zone engine tags (`Unity`, `RPGM`, `Ren'Py`, `Wolf RPG`, `Unreal Engine`, `Godot`, `Flash`, `HTML`, `Java`, `QSP`, `RAGS`, `ADRIFT`, `Tads`, `Others`). Uses bounded 64KB PE header slicing, RVA-to-offset mapping, and import/version introspection.

```bash
# Run simulation & benchmark across game library
node .devutil/inspect-game-engine.cjs "D:/Games/MyGames"
```
