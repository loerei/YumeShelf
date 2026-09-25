# Client-Side Desktop & IPC Security

Covers desktop applications, native client runtimes (Tauri, Electron), inter-process communication (IPC) boundaries, subprocess execution, and native shell handlers.

## Domain Audit Checklist

### 1. IPC Boundary & Command Isolation
- [ ] **Restricted IPC Operations**: IPC bridges MUST expose only narrow, domain-specific operations with concrete parameter schemas. Reject generic command-dispatch proxies, arbitrary reflection invoke, or ambient shell bridges.
- [ ] **Sender Origin Verification**: In Electron `ipcMain.handle` / `on` handlers, verify `event.senderFrame` origin and ensure webview sandboxing (`sandbox: true`) and context isolation (`contextIsolation: true`) are enabled.
- [ ] **Tauri Capabilities Scoping**: In Tauri v2, verify permissions in `src-tauri/capabilities/*.json` restrict command execution and filesystem access to authorized windows with path constraints. Reject wildcard permissions (`fs:default`, `shell:allow-execute`).

### 2. Shell Execution & Sandbox Boundaries
- [ ] **External URL Protocol Allowlisting**: When delegating URL opening to native operating system openers (`shell.openExternal`, Tauri opener plugin), parse target URLs and strictly allowlist protocols to `https:` and `http:`. Reject `file:`, `smb:`, `ms-msdt:`, `data:`, or unvetted custom schemes.
- [ ] **Subprocess Argument Arrays**: Native command execution MUST use direct argument arrays (`child_process.execFile`, `Command::new`). NEVER pass raw concatenated strings to shell interpreters (`sh -c`, `cmd.exe /c`, `eval`).

---

## Concrete Anti-Patterns

### Anti-Pattern 1: Unrestricted Command Execution Exposed Over Electron ContextBridge

```javascript
// BAD: Exposing raw child_process invocation gives frontend webview ambient shell access
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  runCommand: (command) => ipcRenderer.invoke('run-command', command)
});

// Main process:
ipcMain.handle('run-command', (event, cmd) => {
  return execSync(cmd); // Arbitrary command execution vulnerability
});

// GOOD: Expose strictly typed action with zero client-controlled command strings
contextBridge.exposeInMainWorld('api', {
  exportReport: () => ipcRenderer.invoke('export-report')
});

// Main process:
ipcMain.handle('export-report', async (event) => {
  // Validate senderFrame origin
  if (new URL(event.senderFrame.url).protocol !== 'app:') {
    throw new Error('Unauthorized origin');
  }
  return runInternalReportPipeline();
});
```

### Anti-Pattern 2: Unvalidated External URL Opener Passing Dangerous Protocol Schemes

```javascript
// BAD: Passing unvalidated URI opens arbitrary local files or exploits OS protocol handlers
const { shell } = require('electron');

function handleOpenLink(targetUrl) {
  shell.openExternal(targetUrl); // Dangerous: targetUrl can be "file:///C:/malicious.exe" or "ms-msdt:..."
}

// GOOD: Parse URI and strictly enforce web protocol allowlist
function handleOpenLink(targetUrl) {
  const parsed = new URL(targetUrl);
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error(`Disallowed protocol scheme: ${parsed.protocol}`);
  }
  shell.openExternal(parsed.href);
}
```

---

## Failure Modes & Mitigations

| Failure Mode | Root Mechanism | Required Mitigation |
| :--- | :--- | :--- |
| **Renderer-to-Host RCE via IPC** | Untrusted webview calls exposed bridge handler passing arbitrary shell commands. | Ban generic command IPC. Expose discrete actions and verify `event.senderFrame`. |
| **Protocol Handler Hijacking** | Operating system executes arbitrary binary or script via unvalidated URI scheme. | Enforce strict `['https:', 'http:']` protocol allowlist before invoking OS opener. |
| **Overly Permissive Tauri Plugin** | Tauri capability grants ambient filesystem or shell execution without directory scoping. | Scope capabilities in `capabilities/*.json` to explicit paths (e.g. `$APPDATA/exports/*`). |
