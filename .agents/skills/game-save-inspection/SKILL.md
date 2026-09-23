---
name: game-save-inspection
description: CLI toolkit for inspecting game binaries, decompiling C#/Unity assemblies, detecting engine packaging, and extracting game data.
local: true
---

# Game Inspection Toolkit

This skill documents the available CLI tools in the environment for inspecting game executables, decompiling assemblies, unpacking assets, and analyzing binaries.

## Available CLI Tools

| Tool | Location / Command | Primary Use Case |
| :--- | :--- | :--- |
| **`ilspycmd`** | Global dotnet tool (`ilspycmd`) | Decompile .NET and Unity `Assembly-CSharp.dll` assemblies to C# source code for inspecting game logic, text extraction, save schemas, or writing injectors. |
| **`diec`** | Detect It Easy CLI (`diec`) | Inspect executables to identify engine (Unity, Godot, RPG Maker, Electron), compiler, architecture, and packers (Enigma, UPX). |
| **`7z`** | `C:\Program Files\7-Zip\7z.exe` | Inspect and extract packed archives, installers, and compressed bundles. |
| **`strings`** | MinGW tool (`strings.exe`) | Scan binaries or data files for hardcoded strings, keys, error messages, and signatures. |
| **`xxd`** | Git Unix tools (`xxd.exe`) | Hex dump headers and data structures to inspect magic bytes, block alignment, and payload layout. |
| **`file`** | Git Unix tools (`file.exe`) | Identify file types and magic MIME signatures of unknown binaries and assets. |

## Quick Command Reference

```powershell
# Decompile Unity/C# assembly to a folder
ilspycmd -p "path/to/Assembly-CSharp.dll" -o ".scratch/decompiled"

# Decompile a specific type or class from an assembly
ilspycmd -t "Namespace.ClassName" "path/to/Assembly-CSharp.dll"

# Detect engine, compiler, and packer
diec "path/to/Game.exe"

# Search for strings in a binary
strings -a "path/to/binary" | grep -i "keyword"

# Hex dump first N bytes of a file
xxd -l 128 "path/to/file"

# Inspect archive contents
& "C:\Program Files\7-Zip\7z.exe" l "path/to/archive"
```
