---
name: game-save-inspection
description: Workflow and CLI toolkit for inspecting game binaries, decompiling C#/Unity assemblies, detecting engine packaging, and discovering encrypted save formats for @yumeshelf/engine integration.
local: true
---

# Game Save & Engine Inspection Toolkit

This skill defines the workflow and CLI tooling for inspecting unknown game engines, decompiling game logic, and analyzing encrypted save file structures to build codecs and resolvers for `@yumeshelf/engine`.

---

## 1. Available CLI Tools in Environment

| Tool | Location / Command | Primary Use Case |
| :--- | :--- | :--- |
| **`ilspycmd`** | Global dotnet tool (`ilspycmd`) | Decompile .NET / Unity `Assembly-CSharp.dll` to C# source code to extract save logic, AES keys, IVs, and schemas. |
| **`diec`** | Detect It Easy CLI (`diec` or `horsicq.DIE-engine`) | Scan `.exe` binaries to detect game engine (Unity, Godot, RPG Maker, Electron), compiler, and packers (Enigma, UPX). |
| **`7z`** | `C:\Program Files\7-Zip\7z.exe` | Inspect and extract packed game archives, installers, and compressed asset bundles. |
| **`strings`** | MinGW tool (`strings.exe`) | Scan binaries or raw save files for hardcoded encryption keys, IVs, JSON keys, or error messages. |
| **`xxd`** | Git Unix tools (`xxd.exe`) | Hex dump save headers and payloads to inspect magic bytes, block alignment, and entropy. |
| **`file`** | Git Unix tools (`file.exe`) | Fast MIME/magic identification of unknown files. |

---

## 2. 4-Phase Discovery Workflow

### Phase 1: Engine & Binary Identification

Identify the runtime engine and check whether the game executable is an outer packer:

```powershell
# 1. Inspect executable with Detect It Easy
diec "D:\Games\TargetGame\Game.exe"

# 2. Check directory layout:
# - Unity Mono: "TargetGame_Data\Managed\Assembly-CSharp.dll"
# - Unity IL2CPP: "TargetGame_Data\il2cpp_data\" or "GameAssembly.dll"
# - RPG Maker: "www\data\System.json" or "data\System.json"
# - Ren'Py: "game\*.rpa" or "game\script.rpyc"
# - Godot: "TargetGame.pck" or embedded PCK
```

If `diec` detects an Enigma Virtual Box or UPX packer, internal asset files and DLLs are packed inside the single executable.

---

### Phase 2: Save File Signature & Entropy Analysis

Inspect the raw save file before attempting decryption:

```powershell
# 1. Identify file type
file "C:\path\to\savefile.dat"

# 2. View hex dump of header (first 128 bytes)
xxd -l 128 "C:\path\to\savefile.dat"

# 3. Check file size modulo 16 (AES block alignment indicator)
(Get-Item "C:\path\to\savefile.dat").Length % 16
```

**Common Patterns:**
- **Plaintext JSON**: Starts with `{` (`0x7b`) or `[` (`0x5b`).
- **Zlib compressed**: Starts with `78 9c` (default compression) or `78 01` (low compression).
- **Gzip compressed**: Starts with `1f 8b`.
- **AES-CBC encrypted**: High entropy across all bytes, total length is a strict multiple of 16 bytes (due to PKCS7 padding), or first 16 bytes contain a random IV followed by 16-byte aligned ciphertext.
- **Base64 encoded**: ASCII printable characters only, length multiple of 4, ending with `=` or `==`.

---

### Phase 3: Source Code & Key Extraction

#### A. Unity (Mono Backend)
When the game uses Unity with Mono, `Assembly-CSharp.dll` contains the full decompilable game code:

```powershell
# Dump entire Assembly-CSharp.dll to a temporary scratch directory
ilspycmd -p "D:\Games\TargetGame\TargetGame_Data\Managed\Assembly-CSharp.dll" -o ".scratch\decompiled_csharp"

# Search for save management, encryption, and keys
rg -i "aes|rijndael|cryptostream|secretkey|savegame|savedata|readallbytes" .scratch\decompiled_csharp\
```

#### B. Searching Binaries with Strings
If source code is obfuscated or packed, search strings for encryption hints:

```powershell
# Search for ASCII and Unicode strings matching key terms
strings -a "D:\Games\TargetGame\TargetGame_Data\Managed\Assembly-CSharp.dll" | grep -iE "rijndael|aes|encrypt|decrypt|save"
```

---

### Phase 4: Integration into @yumeshelf/engine

Once the cipher algorithm, keys, IV derivation, and serialization format (e.g. JSON, MessagePack, BinaryWriter) are understood:

1. **Implement Headless Codec**: Author codec in `packages/yume-engine/src/save-codecs/<codec-name>.ts` extending `BaseSaveCodec` using Node.js `crypto` and `buffer`.
2. **Deterministic & Heuristic Resolution**: Register save folder detection paths in `packages/yume-engine/src/save-folder-resolver/rules/`.
3. **Verify with Tests**: Write comprehensive in-memory unit tests in `packages/yume-engine/tests/` verifying roundtrip decode -> mutate -> encode fidelity.
4. **Wire UI Adapter**: Expose codec in `src/main/save-editor/formats/` and UI engine schema in `src/renderer/save-editor/engines/`.
