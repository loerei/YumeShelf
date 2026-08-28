/**
 * ensure-brave.js
 * Fast Connection Protocol helper for Brave Browsing with chrome-devtools-mcp.
 * 
 * Outputs:
 * 1. [✔] Brave 9222 ready
 * 2. [🚀] Launched Brave with port 9222 (Registry configured)
 * 3. [🚀] Launched Brave with port 9222 (Registry NOT configured). Consider configuring Registry to streamline workflow.
 */

import { execSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

async function checkPort9222() {
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

function isRegistryConfigured() {
  if (os.platform() !== 'win32') return false;
  try {
    const out = execSync(String.raw`powershell -NoProfile -Command "(Get-ItemProperty 'HKCU:\Software\Classes\http\shell\open\command').'(default)'"`, { encoding: 'utf8' });
    return out.includes('--remote-debugging-port=9222');
  } catch {
    return false;
  }
}

function ensureScheduledTaskRegistered(braveExe, flags) {
  const psRegister = `$action = New-ScheduledTaskAction -Execute '${braveExe}' -Argument '${flags}'; Register-ScheduledTask -TaskName 'LaunchBraveGUI' -Action $action -Force | Out-Null`;
  try {
    execSync(`powershell -NoProfile -Command "${psRegister}"`);
  } catch (e) {
    console.warn('[⚠️] Warning registering Scheduled Task:', e.message);
  }
}

function launchBraveGUI(braveExe, flags) {
  const defaultFlags = '--remote-debugging-port=9222 --remote-allow-origins=http://127.0.0.1:9222,http://localhost:9222';
  const effectiveFlags = flags || defaultFlags;

  if (os.platform() === 'win32') {
    ensureScheduledTaskRegistered(braveExe, effectiveFlags);
    execSync('powershell -NoProfile -Command "Start-ScheduledTask -TaskName \'LaunchBraveGUI\'"');
  } else {
    const args = effectiveFlags.split(' ');
    const p = spawn(braveExe, args, { detached: true, stdio: 'ignore' });
    p.unref();
  }
}

(async () => {
  if (await checkPort9222()) {
    console.log('[✔] Brave 9222 ready');
    process.exit(0);
  }

  const hasReg = isRegistryConfigured();
  const braveExe = path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe');

  if (hasReg) {
    launchBraveGUI(braveExe);
    console.log('[🚀] Launched Brave with port 9222 (Registry configured)');
  } else {
    launchBraveGUI(braveExe);
    console.log('[🚀] Launched Brave with port 9222 (Registry NOT configured). Consider configuring Registry to streamline workflow.');
  }

  await new Promise(r => setTimeout(r, 2000));
})();
