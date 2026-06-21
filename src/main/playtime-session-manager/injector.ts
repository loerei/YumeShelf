import { spawn, execFile } from 'node:child_process';
import * as path from 'node:path';
import { assertPlaytimeHelperExists, resolvePlaytimeHelperPath } from '../playtime-helper-paths';

export function isPidAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
}

export interface SpawnHelperOptions {
    app: any;
    dbFilePath: string;
    helperLogPath: string;
    log?: ((msg: string) => void) | null;
}

export function spawnHelper({ app, dbFilePath, helperLogPath, log }: SpawnHelperOptions, mode: string, journalPath: string): number {
    const helperPath = assertPlaytimeHelperExists(resolvePlaytimeHelperPath({ app }));
    const args = [
        mode,
        '--journal',
        journalPath,
        '--db',
        dbFilePath,
        '--log',
        helperLogPath
    ];
    if (typeof log === 'function') {
        log(`spawning helper mode=${mode} journal=${journalPath}`);
    }
    const child = spawn(helperPath, args, {
        detached: true,
        stdio: 'ignore'
    });
    child.unref();
    return child.pid || 0;
}

export interface InjectDllOptions {
    app: any;
    log?: ((msg: string) => void) | null;
    readSessionJournal: (filePath: string) => Promise<any>;
    delay: (ms: number) => Promise<void>;
}

export async function injectRunInBackgroundDll({ app, log, readSessionJournal, delay }: InjectDllOptions, journalPath: string): Promise<void> {
    const injectorPath = path.join(app.getAppPath(), 'native/background-injector/build/injector.exe');
    const payloadPath = path.join(app.getAppPath(), 'native/background-injector/build/payload.dll');
    
    for (let i = 0; i < 30; i++) {
        await delay(500);
        try {
            const journal = await readSessionJournal(journalPath);
            if (journal.rootPid && journal.rootPid > 0) {
                if (typeof log === 'function') {
                    log(`Injecting background DLL into rootPid=${journal.rootPid}`);
                }
                execFile(injectorPath, [journal.rootPid.toString(), payloadPath], (error, stdout, stderr) => {
                    if (error) {
                        console.error('[PLAYTIME][SESSIONS] DLL injection failed:', error, stderr);
                    } else {
                        if (typeof log === 'function') {
                            log(`DLL injection successful: ${stdout}`);
                        }
                    }
                });
                return;
            }
            if (journal.status === 'failed' || journal.status === 'completed') {
                return;
            }
        } catch (e) {
            // Keep polling
        }
    }
    if (typeof log === 'function') {
        log(`Timed out waiting for rootPid to inject background DLL`);
    }
}
