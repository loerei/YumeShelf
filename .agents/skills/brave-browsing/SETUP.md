# Brave MCP & Registry Setup

## 1. MCP Configuration

Ensure `~/.gemini/config/mcp_config.json` sets `--browserUrl`:

```json
{
  "mcpServers": {
    "chrome-devtools-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--browserUrl",
        "http://127.0.0.1:9222"
      ]
    }
  }
}
```

---

## 2. Launch Modes

### Mode 1: Manual CLI Flag
```powershell
brave.exe --remote-debugging-port=9222 --remote-allow-origins=http://127.0.0.1:9222,http://localhost:9222
```

### Mode 2: Persistent Windows Registry Automation
> [!CAUTION]
> Modifying Registry keys requires **Tier 3 Explicit User Approval**.

Target Registry Paths:
- `HKCU:\Software\Classes\BraveHTML\shell\open\command`
- `HKCU:\Software\Classes\http\shell\open\command`
- `HKCU:\Software\Classes\https\shell\open\command`

| State | Registry String Value |
| :--- | :--- |
| **Debug Mode** | `"C:\Users\<username>\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222 --remote-allow-origins=http://127.0.0.1:9222,http://localhost:9222 -- "%1"` |
| **Default Restore** | `"C:\Users\<username>\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe" -- "%1"` |
