# 03 — Cross-Platform Save Converter for macOS (ModernSaveConverter)

## Epic
PRD: Implementation for macOS Platform Support (Parked)

## What to build

Extend the C# `ModernSaveConverter` build pipeline and Unity Mono save format driver to support macOS (`osx-arm64` and `osx-x64`). Update `scripts/save-converter/build.js` to support cross-compiling or publishing self-contained macOS binaries, and update `src/main/save-editor/formats/unity-mono-bin.ts` to detect and execute the macOS binary or fallback to `dotnet ModernSaveConverter.dll`.

## Acceptance criteria

- [ ] Update `scripts/save-converter/build.js` to compile/publish `ModernSaveConverter` for `osx-arm64` and `osx-x64` targets.
- [ ] Update `unity-mono-bin.ts` in `src/main/save-editor/formats/unity-mono-bin.ts` to resolve `osx-arm64` and `osx-x64` executable paths when running on `process.platform === 'darwin'`.
- [ ] Support fallback to `dotnet ModernSaveConverter.dll` if standalone macOS binary is unavailable, checking for `dotnet` runtime in `PATH` and throwing typed `SaveCodecError('UNSUPPORTED_FORMAT', 'ModernSaveConverter requires .NET Runtime on macOS')` if missing.
- [ ] Verify save decoding and encoding roundtrip for Unity Mono binary format on macOS.
- [ ] Add unit tests in `tests/save-editor-contracts.test.js` verifying macOS converter executable resolution, `dotnet` presence verification, and error handling.
- [ ] Execute automated unit tests via `npm test -- tests/save-editor-contracts.test.js`.

## Blocked by
- Epic 02: 02 — macOS Save Folder Discovery & Engine Resolvers
- Epic 01: 05.2 — Extract ProcessRunner Seam into YumeEngine
