# 07 — Acknowledgements, Credits Attribution & Documentation

## Epic
PRD 01: YumeEngine Core Architecture & Headless Extraction

## What to build
Publish complete open-source acknowledgements, attribution headers, and multi-lingual documentation across all project README files (English, Vietnamese, Chinese, Japanese) and in the in-app Settings About modal.

## Blocked by
- 06.3 — Integrate Headless Save Resolvers & SaveEditorService

## Status
ready-for-agent

## Acceptance criteria
- [x] Verify MIT attribution headers honoring `horsicq (Detect-It-Easy / XPEViewer)`, `bbepis (XUnity.AutoTranslator)`, and `BepInEx` are preserved across all relevant source files in `packages/yume-engine`.
- [x] Update root `README.md` (English), `README.vi.md` (Vietnamese), `README.zh.md` (Chinese), and `README.ja.md` (Japanese) with a dedicated **Acknowledgements & Credits** section citing:
  - `Detect-It-Easy (horsicq)` — Binary inspection heuristics, PE structure analysis, and engine signatures.
  - `XUnity.AutoTranslator (bbepis)` — Unity runtime translation architecture and plugin hooking models.
  - `BepInEx` — Unity and .NET modding and runtime injection framework.
- [x] Add the Acknowledgements & Credits link/section in YumeShelf's UI under Settings $\rightarrow$ About modal.
- [x] Verify formatting and link integrity across all 4 README files.
