import { App, Protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

function readPackageJsonVersion(): string | null {
    const candidates = [
        path.join(__dirname, '..', '..', 'package.json'),
        path.join(__dirname, '..', '..', '..', 'package.json'),
        path.join(process.cwd(), 'package.json')
    ];
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
            if (parsed?.name === 'yumeshelf' && typeof parsed.version === 'string') {
                return parsed.version;
            }
        } catch {
            // try next candidate
        }
    }
    return null;
}

export function applyVersionOverride(app: App): void {
    const rawOriginalGetVersion = app.getVersion.bind(app);
    const originalGetVersion = () => {
        const raw = rawOriginalGetVersion();
        if (!app.isPackaged && raw === process.versions.electron) {
            return readPackageJsonVersion() || raw;
        }
        return raw;
    };
    const readOverrideVersion = () => {
        const overrideArg = process.argv.find(arg => /^-\d+\.\d+\.\d+/.test(arg));
        return overrideArg ? overrideArg.slice(1) : null;
    };

    try {
        Object.defineProperty(app, 'getVersion', {
            value: function getVersionWithOverride() {
                return readOverrideVersion() || originalGetVersion();
            },
            configurable: true,
            writable: true
        });
    } catch (_error) {
        app.getVersion = function getVersionWithOverride() {
            return readOverrideVersion() || originalGetVersion();
        };
    }
}

export function registerPrivilegedSchemes(protocol: Protocol): void {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: 'game-icon',
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                bypassCSP: true
            }
        }
    ]);
}

function safeGetPath(app: App, name: any): string {
    try {
        return app.getPath(name);
    } catch (err: any) {
        return `ERROR:${String(err?.message || err)}`;
    }
}

export function logBootDiagnostics(app: App): void {
    console.log(`[MAIN][BOOT] summary=${JSON.stringify({
        pid: process.pid,
        argv: process.argv,
        defaultApp: !!process.defaultApp,
        isPackaged: app.isPackaged,
        appName: app.name,
        appGetName: typeof app.getName === 'function' ? app.getName() : null,
        appData: safeGetPath(app, 'appData'),
        userData: safeGetPath(app, 'userData'),
        sessionData: safeGetPath(app, 'sessionData'),
        cache: safeGetPath(app, 'cache'),
        localAppDataEnv: process.env.LOCALAPPDATA || null,
        appDataEnv: process.env.APPDATA || null
    })}`);
}
