---
version: "1.5.9"
status: "working"
released_at: null
last_updated_by: "antigravity-icon-pipeline"
last_updated_at: "2026-05-28T12:35:00+07:00"
---

# YumeShelf Changelog - v1.5.9

## ✨ What's New

- ...

## 🔧 What Changed

- [antigravity-icon-pipeline] Fixed game icon extraction inside packaged production builds, enabling high-resolution 256x256 game icon recovery on client machines.

---

## 🛠️ For the Nerds

- [antigravity-icon-pipeline] Fallback to `process.execPath` (Electron) as Node interpreter using `ELECTRON_RUN_AS_NODE: '1'` for spawning the background extraction worker when a global Node environment is absent.
- [antigravity-icon-pipeline] Added `"asarUnpack"` entry in `package.json` for `extract-file-icon` dependency to unpack compiled native addon binary from the ASAR archive, ensuring seamless require calls inside Electron-as-Node environment.
