# 02 — PE Version Info Resource Tree Parser

## Epic
PRD 01: YumeEngine Core Architecture & Headless Extraction

## What to build
Implement Win32 PE binary resource directory tree traversal (`RT_VERSION` Type 16 $\to$ Name $\to$ Lang $\to$ `VS_VERSIONINFO` header parsing, `StringFileInfo` UTF-16LE block decoding with lazy chunk reads) inside `PEInspector`.

## Attribution Requirement
- Include MIT attribution header for `horsicq (Detect-It-Easy / XPEViewer)`.

## Blocked by
- 01.2 — PE Import Directory & Thunk Table Parser

## Status
ready-for-agent

## Acceptance criteria
- [x] Implement Win32 resource directory tree traversal in `PEInspector` (Type 16 `RT_VERSION` $\to$ Name $\to$ Lang) using on-demand chunk reads (`IFileHandle.read`), enforcing a strict maximum recursion depth ceiling ($\le 3$ levels) to guard against stack overflow and circular references on malformed PE binaries.
- [x] Implement `VS_VERSIONINFO` and `StringFileInfo` UTF-16LE block decoding with 4-byte DWORD alignment (`cursor = (cursor + 3) & ~3`), minimum step length guard (`wLength < 6`), and string byte boundary checks to extract standard version properties: `OriginalFilename`, `ProductName`, `InternalName`, `FileDescription`, `FileVersion`.
- [x] Handle resource tree bounds checking and corrupted section offsets safely without throwing unhandled exceptions.
- [x] Comprehensive unit tests using `synthetic-pe-builder.ts` resource byte fixtures verifying resource traversal and version property extraction.
- [x] Execute automated unit tests via `pnpm --filter @yumeshelf/engine test` verifying 100% passing tests across all synthetic version fixtures.
