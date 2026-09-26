# 00 — Monorepo Workspace & Package Scaffolding

## Epic
PRD 01: YumeEngine Core Architecture & Headless Extraction

## What to build
Set up the pnpm monorepo workspace structure for `@yumeshelf/engine` as an isolated, headless TypeScript package decoupled from Electron. Establish build, typecheck, and test scripts with project references in root configurations.

## Acceptance criteria
- [x] Add `packages/*` to `pnpm-workspace.yaml`.
- [x] Initialize `packages/yume-engine/package.json` with `"name": "@yumeshelf/engine"`, `"version": "1.0.0"`, `"main": "dist/index.js"`, `"types": "dist/index.d.ts"`, and `"exports"` field.
- [x] Create `packages/yume-engine/tsconfig.json` extending root TypeScript configuration with declaration generation enabled.
- [x] Add `@yumeshelf/engine: "workspace:*"` dependency in root `package.json`.
- [x] Configure `tsconfig.main.json` project references to resolve `@yumeshelf/engine`.
- [x] Add root package script `"test:engine": "pnpm --filter @yumeshelf/engine test"`.
- [x] Create test fixture scaffold `packages/yume-engine/tests/fixtures/synthetic-pe-builder.ts` generating valid minimal in-memory PE32 / PE32+ header buffers, Section Tables, Import Tables, and Resource Directory trees.
- [x] Create `MockFileSystemProvider` scaffold in `packages/yume-engine/tests/fixtures/mock-fs-provider.ts` implementing `FileSystemProvider` for in-memory unit tests without touching `process.env` or disk.
- [x] Execute automated package verification via `pnpm --filter @yumeshelf/engine test` verifying 100% passing tests and clean test scaffolding build.
- [x] Verify `pnpm --filter @yumeshelf/engine build` compiles cleanly.

## Blocked by
None — can start immediately.
