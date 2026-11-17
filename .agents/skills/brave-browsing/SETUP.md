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
- `HKCU:\Software\Classes\<HashedProgId>\shell\open\command` (Windows 10/11 UserChoice ProgId, queried via `(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice').ProgId`)

| State | Registry String Value |
| :--- | :--- |
| **Debug Mode** | `"C:\Users\<username>\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222 --remote-allow-origins=* -- "%1"` |
| **Default Restore** | `"C:\Users\<username>\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe" -- "%1"` |

---

## 3. Desktop & Start Menu Shortcuts

To ensure launches from Desktop or Start Menu bind port 9222:
- Target shortcuts:
  - `C:\Users\<username>\Desktop\Brave.lnk` (or `OneDrive\Desktop\Brave.lnk`)
  - `C:\Users\<username>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Brave.lnk`
- Shortcut Arguments:
  ```powershell
  --remote-debugging-port=9222 --remote-allow-origins=*
  ```

---

## 4. Background Processes Caveat

Brave defaults to running background processes (`brave://settings/system` -> "Continue running background apps when Brave is closed").
- If Brave was opened once without `--remote-debugging-port=9222`, closing visible windows leaves background processes running.
- Any subsequent launch simply attaches to the existing background instance, ignoring the debug flag.
- Solution: Terminate all running `brave.exe` processes (`Stop-Process -Name brave -Force`) before restarting with port 9222.

