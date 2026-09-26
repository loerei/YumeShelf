# PRD 01: YumeEngine Core Architecture & Headless Extraction

## Problem Statement

Currently, game engine detection, save directory resolution, and save format encoding/decoding logic are tightly coupled and fragmented inside the YumeShelf Electron desktop application (`TranslationService`, `SaveFolderResolver`, and `SaveEditor`). 
- Detection logic depends on brittle directory layout heuristics (checking `data/` or `www/` folders) which produce false positives.
- Core inspection and manipulation code cannot be tested, versioned, or executed independently of the Electron environment.
- Downstream feature development (such as the Community Add-on Marketplace and Translation Service refactoring) is blocked by the lack of a deterministic, single-source-of-truth Engine Inspection API.

## Solution

Extract and build **`YumeEngine`** (`@yumeshelf/engine`), an independent, headless, zero-Electron TypeScript library that serves as the foundation for the entire YumeShelf ecosystem:
1. **Core PE Binary Inspector:** Fast binary stream parser reading Windows PE headers (`e_lfanew`, NT Headers, Import Directory, `VS_VERSIONINFO`) directly implementing the forensic specifications from [research/research_xpe_core_parser.md](../research/research_xpe_core_parser.md) and [research/research_die_script_engine.md](../research/research_die_script_engine.md).
2. **100% F95zone Engine Tags & Japanese Doujin Coverage:** Direct deterministic identification for all 12 F95zone engine tags (`Unity`, `RPGM`, `Ren'Py`, `Wolf RPG`, `Unreal Engine`, `Godot`, `Flash`, `HTML`, `Java`, `QSP`, `RAGS`, `ADRIFT`, `Tads`, `Others`) and classic VN engines (KiriKiri 2/Z, GameMaker, TyranoBuilder, BGI, CatSystem 2, SystemNNN, Siglus, Majiro, NScripter, etc.).
3. **Headless Save Operations:** House all save directory resolvers and save format codecs (`rpgsave`, `rvdata2`, `wolf-sav`, `renpy-pickle`, `qsp-savedgame`) within the engine library.
4. **Integration & Re-coupling:** Package and link `YumeEngine` into `YumeShelf`, replacing all fragmented legacy inspection code across the main application.

## User Stories

1. As a developer/contributor, I want `YumeEngine` to be a standalone, headless TypeScript module with zero Electron dependencies, so that it can be tested, benchmarked, and executed via CLI or Node.js without GUI overhead.
2. As a player importing a game, I want the engine to inspect the `.exe` binary headers in under 64KB of RAM, so that game detection is instantaneous (< 10ms) and produces zero false positives.
3. As a player playing RPG Maker (2000, 2003, XP, VX, VX Ace, MV, MZ, Unite), I want the engine to identify the exact runtime variant and RGSS/NW.js version from the binary, so that the correct save format and translators are dispatched.
4. As a player playing Unity games (Mono vs IL2CPP, x86 vs x64), I want the engine to determine the architecture from the PE machine header and import table (`GameAssembly.dll` vs `UnityPlayer.dll`), so that translation tools can hook without trial-and-error.
5. As a player playing Wolf RPG, Ren'Py, Godot, Unreal Engine, Flash/AIR, QSP, RAGS, ADRIFT, Tads, or Visual Novels, I want the engine to detect the engine tag directly from executable signatures and resolve save directories deterministically.
6. As a developer writing tests, I want `YumeEngine` to provide a `MockFileSystemProvider` and synthetic binary test fixtures, so that 100% of engine rules and save decoders can be verified in automated CI without needing real game installations.
7. As a developer working on the upcoming Marketplace and Translation features, I want a clean `GameEngineProfile` schema, so that downstream modules can consume engine metadata without re-inspecting files.

## Implementation Decisions

1. **Package Architecture & Boundaries:**
   - Designed as a standalone package `packages/yume-engine` (published/linked as `@yumeshelf/engine`).
   - Monorepo Workspace Configuration:
     - Configured in root `pnpm-workspace.yaml` under `packages: ['packages/*']`.
     - Linked in root `package.json` dependencies as `@yumeshelf/engine: "workspace:*"`.
     - Project references and path mappings configured in `tsconfig.json` and `tsconfig.main.json`.
   - Strict rule: **Zero native Node GUI or Electron dependencies**. Uses an abstract `FileSystemProvider` interface (`DefaultFileSystemProvider` for Node.js `fs/promises`, `MockFileSystemProvider` for CI tests).

2. **PE Binary Inspector Engine (`PEInspector`):**
   - Implements the detailed C++ memory mapping model and offset calculations specified in `research_xpe_core_parser.md`:
     - DOS Header (`0x3C` pointer to PE Header, validating `MZ`/`ZM` magic).
     - COFF File Header (`Machine` type for x86 `0x014C` vs x64 `0x8664`, section counts).
     - Optional Header (PE32 `0x10B` vs PE32+ `0x20B`, Data Directories: Import Table at index 1, Resource Table at index 2, COM/CLR at index 14).
     - Section Table & safe RVA-to-Offset translation (`rvaToOffset`, enforcing strict upper and lower bounds `rva >= sec.virtualAddress && (rva - sec.virtualAddress) < sec.rawSize`).
     - Import Table parser reading `IMAGE_IMPORT_DESCRIPTOR` thunks (32-bit & 64-bit thunks) into a normalized `Set<string>`.
     - `VS_VERSIONINFO` Resource tree traversal (Type 16) extracting `StringFileInfo` keys (`OriginalFilename`, `ProductName`, `InternalName`).
   - **Two-Stage Lazy Read Model:**
     - Stage 1: Reads initial 4KB–8KB header buffer containing DOS Header, COFF Header, Optional Header, and Section Table.
     - Stage 2: When resolving RVAs for imports or `VS_VERSIONINFO` resource directory entries located at high offsets (5MB–50MB+ in large binaries), lazily reads only the required 4KB–16KB chunk on demand via `FileSystemProvider.read(fd/path, offset, size)`.
     - Memory guarantee: Bounded peak buffer allocation $\le 64\text{KB}$ per executable scan.

3. **Complete F95zone & Doujin Engine Classification Matrix:**
   - Decouples **Runtime Container Detection** from **Application Framework Classification**:
     - **Unity**: Imports `GameAssembly.dll` $\to$ IL2CPP; Imports `mono-2.0-bdwgc.dll` / `UnityPlayer.dll` $\to$ Mono (x86 / x64).
     - **RPGM (RPG Maker)**:
       - In NW.js containers: Requires explicit RPG Maker markers (`rmmz_core.js`, `rpg_core.js`, `data/System.json`, `www/data/System.json`, or `.rpgsave`) before assigning `tag: 'RPGM'`.
       - Legacy RGSS: Imports `RGSS301.dll` $\to$ VX Ace; `RGSS202E.dll` $\to$ VX; `RGSS104E.dll` $\to$ XP.
       - RPG_RT header $\to$ 2000/2003; `bakinengine.dll` $\to$ RPG Bakin.
     - **Ren'Py**: Imports `python*.dll` with `renpy/` directory, `game/*.rpa`, or `options.rpyc` markers. (Generic Python binaries without Ren'Py markers default to `Others/native`).
     - **Wolf RPG**: Imports `wmovie.dll` / `GuruguruSMF4.dll` or Delphi runtime layout with `Game.dat` / `BasicData.wolf` signature.
     - **Unreal Engine**: `Engine/Binaries/`, `*.uproject`, UE PAK magic (`0x5A6F12E1` / `0x9E2A83C1`).
     - **Godot**: Magic `GDPC` (`0x43504447`) in `.pck`, `project.godot`.
     - **Flash**: Header `FWS` / `CWS` / `ZWS` in `*.swf`, `Adobe AIR/`.
     - **QSP (Quest Soft Player)**: File `*.qsp`, `qsp.exe`, `qspgui.exe`, save header `QSPSAVEDGAME`.
     - **RAGS**: File `*.rag` (RAGS encrypted game), `RagsPlayer.exe`, `*.sdf` (SQL Compact DB).
     - **ADRIFT / Tads**: ADRIFT `*.taf` / `Blorb`; TADS `*.t3` / `*.gam` / `t3run.exe`.
     - **Java**: `*.jar` (ZIP header `PK\x03\x04` + `META-INF/MANIFEST.MF`), `javaw.exe`, `jvm.dll`.
     - **HTML / WebGL**: `index.html`, generic NW.js / Electron wrappers without RPG Maker/Tyrano markers, WebGL canvas hooks, `package.json`.
     - **Others**: TyranoBuilder (`tyrano/`, `data/scenario/`, `tyrano.js`), GameMaker Studio (`data.win`), KiriKiri 2/Z (`*.xp3`), BGI/Ethornell, CatSystem 2, SystemNNN, SiglusEngine/RealLive, Majiro, NScripter, Artemis, Lilim, LiveMaker, Native Win32 C++.

4. **Public API Contract:**
   ```typescript
   export interface IFileHandle {
       read(offset: number, length: number): Promise<Buffer>;
       close(): Promise<void>;
   }

   export interface IFileSystem {
       open(path: string): Promise<IFileHandle>;
       readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer>;
       stat(path: string): Promise<{ size: number; isDirectory(): boolean; isFile(): boolean }>;
       readdir(path: string): Promise<string[]>;
       exists(path: string): Promise<boolean>;
   }

   export interface IEnvironmentPaths {
       getAppDataPath(): string;
       getLocalAppDataPath(): string;
       getUserProfilePath(): string;
       getDocumentsPath(): string;
       getSavedGamesPath(): string;
       getWinePrefixRoots?(): string[];
       getWineAppDataPaths?(): string[];
       getXdgDataHome?(): string;
       getXdgConfigHome?(): string;
   }

   export interface FileSystemProvider extends IFileSystem, IEnvironmentPaths {}

   export type F95EngineTag =
       | 'Unity'
       | 'RPGM'
       | "Ren'Py"
       | 'Wolf RPG'
       | 'Unreal Engine'
       | 'Godot'
       | 'Flash'
       | 'HTML'
       | 'Java'
       | 'QSP'
       | 'RAGS'
       | 'ADRIFT'
       | 'Tads'
       | 'Others';

   export interface GameEngineProfile {
       tag: F95EngineTag;
       family: 'unity' | 'rpg-maker' | 'wolf-rpg' | 'renpy' | 'godot' | 'unreal' | 'flash' | 'java' | 'qsp' | 'rags' | 'adrift' | 'tads' | 'html-webgl' | 'gamemaker' | 'kirikiri' | 'tyranobuilder' | 'native' | 'unknown';
       variant?: 'mono' | 'il2cpp' | 'mv' | 'mz' | 'vx-ace' | 'vx' | 'xp' | '2000-2003' | 'ue4-ue5' | 'studio' | 'xp3' | 'standard' | string;
       arch: 'x64' | 'x86' | 'unknown';
       runtime: 'native' | 'nwjs' | 'electron' | 'python' | 'mono' | 'flash' | 'jvm' | 'qsp-runtime' | 'dotnet-rags' | 'adrift-runner' | 'tads-vm' | 'webgl-browser';
       saveStrategy: 'rpg-maker-mv-mz' | 'rpg-maker-rgss' | 'wolf-sav' | 'renpy-pickle' | 'godot' | 'unreal-sav' | 'gamemaker-appdata' | 'qsp-savedgame' | 'rags-save' | 'adrift-save' | 'tads-save' | 'custom' | 'unknown';
       detectedBy: string;
   }

   export interface ResolvedSaveLocation {
       path: string | null;
       confidence: 'high' | 'medium' | 'low' | 'none';
       source: 'override' | 'deterministic' | 'heuristic' | 'appdata' | 'user-profile' | 'wine' | 'none';
       matchedStrategy?: string;
       files?: string[];
   }

   export interface SaveCodecContext {
       fileName?: string;
       gameTitle?: string;
       gameKey?: string;
       options?: Record<string, any>;
   }

   export class SaveCodecError extends Error {
       constructor(message: string, public readonly code: 'CHECKSUM_FAILED' | 'DECOMPRESSION_FAILED' | 'PARSE_FAILED' | 'UNSUPPORTED_FORMAT') {
           super(message);
           this.name = 'SaveCodecError';
       }
   }

   export class YumeEngine {
       static async inspectExecutable(exePath: string, fs?: IFileSystem): Promise<GameEngineProfile>;
       static async resolveSaveDirectory(profile: GameEngineProfile, exePath: string, fs?: FileSystemProvider): Promise<ResolvedSaveLocation | null>;
       static async decodeSaveFile(strategy: string, rawBuffer: Buffer, context?: SaveCodecContext): Promise<any>;
       static async encodeSaveFile(strategy: string, jsonData: any, context?: SaveCodecContext): Promise<Buffer>;
   }
   ```

   **Headless Save Codec Architecture:**
   - Pure in-memory TypeScript codecs (`lz-string`, `wolf-sav`, `keyed-json`, `pure-json`, `bakin-sgs`, pure TS pickle parser) reside directly in `@yumeshelf/engine`.
   - External process-dependent converters (Python or .NET CLI converters) are abstracted via a formal `IProcessRunner` interface:
     ```typescript
     export interface IProcessRunner {
         run(command: string, args: string[], options?: { cwd?: string; timeout?: number; env?: Record<string, string> }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
     }
     ```
   - All codec operations throw typed `SaveCodecError` on corrupt headers or unreadable save structures.

   **PEInspector Execution Modes:**
   - `PEInspector.fromBuffer(buf: Buffer)`: Synchronous parsing for full in-memory buffers and synthetic unit test fixtures.
   - `PEInspector.fromPath(filePath: string, fs?: IFileSystem)`: Asynchronous 2-stage lazy reading (4KB header slice + on-demand 4KB–16KB chunk reads via `IFileHandle.read`) for disk executables with bounded $\le 64\text{KB}$ peak RAM consumption. Ensures deterministic file handle disposal via `IFileHandle.close()` in `try...finally` blocks.

5. **Credits & Attribution Specifications:**
   - **Source File Headers:** Every module in `packages/yume-engine` derived from Detect-It-Easy / XPEViewer includes the standard MIT attribution header for `horsicq`.
   - **Project README.md:** The root `README.md` includes a dedicated `Acknowledgements & Credits` section honoring `Detect-It-Easy (horsicq)`, `XUnity.AutoTranslator (bbepis)`, and `BepInEx`.
   - **In-App About Modal:** YumeShelf UI displays the credits link under Settings $\rightarrow$ About.

## Testing Decisions

1. **Binary Fixture Unit Tests:**
   - Synthetic minimal PE byte buffers representing valid PE32 / PE32+ headers with mock Import Tables and Version Resources.
   - Test suite executing in < 500ms without touching the host filesystem.
2. **Backward Compatibility Regression Suite:**
   - Run all existing `save-folder-resolver.test.ts` and `translation-service` test suites against the new engine API to guarantee zero behavioral regressions.

## Out of Scope

- Marketplace UI and Add-on manifest downloading (deferred to PRD 04).
- In-memory process debugging or memory hooking during live gameplay.

## Tickets

- 00 — Monorepo Workspace & Package Scaffolding (`tickets/00-monorepo-workspace-scaffolding.md`)
- 01.1 — Core PE Header & Section Table Parser (`tickets/01.1-core-pe-header-and-section-parser.md`)
- 01.2 — PE Import Directory & Thunk Table Parser (`tickets/01.2-pe-import-directory-and-thunk-parser.md`)
- 02 — PE Version Info Resource Tree Parser (`tickets/02-pe-version-info-parser.md`)
- 03.1 — Declarative Engine Rule Registry (Core 3D & Binary Engines) (`tickets/03.1-declarative-engine-rule-registry-core-3d-and-binary.md`)
- 03.2.1 — Declarative Engine Rule Registry (Doujin & RPG Engines) (`tickets/03.2.1-declarative-engine-rule-registry-doujin-and-rpg.md`)
- 03.2.2 — Declarative Engine Rule Registry (Interactive Fiction & HTML5/WebGL Engines) (`tickets/03.2.2-declarative-engine-rule-registry-interactive-fiction-and-web.md`)
- 03.2.3 — Declarative Engine Rule Registry (Classic Japanese Visual Novel Engines) (`tickets/03.2.3-declarative-engine-rule-registry-classic-visual-novels.md`)
- 04 — Extract Headless Save Resolvers into YumeEngine (`tickets/04-extract-headless-save-resolvers.md`)
- 05.1 — Extract Headless Save Codecs into YumeEngine (`tickets/05.1-extract-headless-save-codecs.md`)
- 05.2 — Extract ProcessRunner Seam into YumeEngine (`tickets/05.2-extract-process-runner-seam.md`)
- 06.1 — YumeEngine Monorepo Packaging, Export Barrels & Builder Configuration (`tickets/06.1-integrate-monorepo-packaging-and-builder.md`)
- 06.2 — Integrate Engine Inspection into TranslationService & Scanner (`tickets/06.2-integrate-engine-translation-service.md`)
- 06.3 — Integrate Headless Save Resolvers & SaveEditorService (`tickets/06.3-integrate-engine-save-resolvers-and-editor.md`)
- 07 — Acknowledgements, Credits Attribution & Documentation (`tickets/07-credits-attribution-and-docs.md`)
