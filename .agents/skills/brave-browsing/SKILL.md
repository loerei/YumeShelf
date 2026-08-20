---
name: brave-browsing
description: Configure and execute Chrome DevTools MCP server using Brave browser instead of Google Chrome. Use when configuring browser automation with Brave, loading user profiles (--userDataDir), or resolving Chromium connection errors.
---

# Brave Browsing

## 1. Connection Protocol

When invoked via `/browser` or `/brave-browsing`, MUST run helper script first:

```powershell
node D:\Projects\myskills\productivity\brave-browsing\scripts\ensure-brave.js
```

### Response Branching

| Script Output Signal | Action |
| :--- | :--- |
| `[✔] Brave 9222 ready` | Execute browser automation task immediately. |
| `[🚀] Launched Brave (Registry configured)` | Execute browser automation task. |
| `[🚀] Launched Brave (Registry NOT configured)` | Execute browser task; optionally propose persistent Registry setup. |

---

## 2. Domain References

- **MCP & Registry Configuration**: see [SETUP.md](SETUP.md).
- **Chrome Extension Popup Automation**: see [EXTENSION-POPUP.md](EXTENSION-POPUP.md).
