---
name: brave-browsing
description: Use when running Chrome DevTools MCP with Brave browser or debugging connection errors.
---

# Brave Browsing

For MCP and Windows Registry configuration, see [SETUP.md](SETUP.md). For Chrome extension popup tab-query overrides, see [EXTENSION-POPUP.md](EXTENSION-POPUP.md).

## Connection Protocol

Before running Chrome DevTools MCP browser automation tasks, execute the helper script:

```powershell
node <skill-dir>/scripts/ensure-brave.js
```

| Script Output Signal | Action |
| :--- | :--- |
| `[✔] Brave 9222 ready` | Execute browser automation task immediately. |
| `[🚀] Launched Brave with port 9222 (Registry configured)` | Execute browser automation task. |
| `[🚀] Launched Brave with port 9222 (Registry NOT configured)...` | Execute browser task; optionally propose persistent Registry setup. |
