# PRD: Implementation for macOS Platform Support (In Progress - Beta Released)

## Current Status
> [!NOTE]
> **Status: Beta Released**
> The initial macOS Universal (Apple Silicon & Intel) packaging and CI/CD pipelines have been implemented via GitHub Actions `macos-14` runner and officially released in **v2.2.7**.
>
> Remaining work focuses on native menu/window lifecycle, compatibility runners (Whisky/Wine), and cross-platform save converters.

## Executive Summary
This PRD defines the behavioral implementation ($B$) for official macOS platform support across window management, game launching compatibility layers, save converters, and CI/CD packaging pipelines.

## Tickets

- 01 — macOS Electron Menu, Dock & Window Lifecycle (`tickets/01-macos-electron-menu-dock-lifecycle.md`)
- 02 — macOS Compatibility Game Runner (Whisky, CrossOver & Homebrew Wine) (`tickets/02-macos-compatibility-game-runner.md`)
- 03 — Cross-Platform Save Converter for macOS (ModernSaveConverter) (`tickets/03-cross-platform-save-converter-macos.md`)
- 04.1 — macOS Packaging Configuration & Universal CI/CD Pipeline (`tickets/04.1-macos-packaging-universal-pipeline.md`) — **Done (v2.2.7)**
- 04.2 — macOS Save Converter Packaging & Hardened Runtime (`tickets/04.2-macos-save-converter-and-entitlements.md`)
