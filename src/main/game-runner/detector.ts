import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { DetectedRunner } from './types';

export interface RunnerDetectorEnv {
    platform: string;
    env: Record<string, string | undefined>;
    existsSync(p: string): boolean;
    readdirSync(p: string): string[];
}

export const defaultDetectorEnv: RunnerDetectorEnv = {
    platform: process.platform,
    env: process.env,
    existsSync: (p: string) => fsSync.existsSync(p),
    readdirSync: (p: string) => {
        try {
            return fsSync.readdirSync(p);
        } catch {
            return [];
        }
    }
};

export async function detectInstalledRunners(env: RunnerDetectorEnv = defaultDetectorEnv): Promise<DetectedRunner[]> {
    const runners: DetectedRunner[] = [];

    // Native Linux execution is always available on Linux
    if (env.platform === 'linux') {
        runners.push({
            id: 'native-linux',
            name: 'Native Linux Binary / Script',
            mode: 'native',
            path: '',
            isDefault: true
        });
    }

    // Windows native execution on Windows
    if (env.platform === 'win32') {
        runners.push({
            id: 'native-windows',
            name: 'Native Windows Executable',
            mode: 'native',
            path: '',
            isDefault: true
        });
        return runners;
    }

    const pathApi = env.platform === 'win32' ? path.win32 : path.posix;
    const pathDelimiter = env.platform === 'win32' ? ';' : ':';
    const home = env.env.HOME || '';
    const pathEnv = env.env.PATH || '';
    const pathDirs = pathEnv.split(pathDelimiter).filter(Boolean);

    // 1. System Wine Detection
    const wineCandidates = [
        ...pathDirs.map((dir) => pathApi.join(dir, 'wine')),
        ...pathDirs.map((dir) => pathApi.join(dir, 'wine64')),
        '/usr/bin/wine',
        '/usr/local/bin/wine',
        '/usr/bin/wine64',
        '/usr/local/bin/wine64'
    ];

    const seenWinePaths = new Set<string>();
    for (const cand of wineCandidates) {
        if (!seenWinePaths.has(cand) && env.existsSync(cand)) {
            seenWinePaths.add(cand);
            runners.push({
                id: `wine-${pathApi.basename(cand)}`,
                name: `System Wine (${cand})`,
                mode: 'wine',
                path: cand,
                isDefault: runners.filter((r) => r.mode === 'wine').length === 0
            });
            break; // Grab the primary wine binary
        }
    }

    // 2. Steam Proton Detection
    const protonScanDirs = [
        // Standard Steam Compatibility Tools
        pathApi.join(home, '.steam', 'root', 'compatibilitytools.d'),
        pathApi.join(home, '.local', 'share', 'Steam', 'compatibilitytools.d'),
        // Flatpak Steam
        pathApi.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam', 'compatibilitytools.d'),
        pathApi.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.steam', 'root', 'compatibilitytools.d'),
        // SteamApps Common (Official Protons)
        pathApi.join(home, '.local', 'share', 'Steam', 'steamapps', 'common'),
        pathApi.join(home, '.steam', 'steam', 'steamapps', 'common'),
        pathApi.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam', 'steamapps', 'common')
    ];

    const seenProtonPaths = new Set<string>();
    for (const scanDir of protonScanDirs) {
        if (!env.existsSync(scanDir)) continue;
        const entries = env.readdirSync(scanDir);
        for (const entry of entries) {
            const protonDir = pathApi.join(scanDir, entry);
            const protonExecutable = pathApi.join(protonDir, 'proton');
            if (env.existsSync(protonExecutable) && !seenProtonPaths.has(protonExecutable)) {
                seenProtonPaths.add(protonExecutable);
                runners.push({
                    id: `proton-${entry.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`,
                    name: `Steam Proton (${entry})`,
                    mode: 'proton',
                    path: protonExecutable,
                    version: entry
                });
            }
        }
    }

    // 3. UMU Launcher Detection
    const umuCandidates = [
        ...pathDirs.map((dir) => pathApi.join(dir, 'umu-run')),
        pathApi.join(home, '.local', 'bin', 'umu-run'),
        '/usr/bin/umu-run',
        '/usr/local/bin/umu-run'
    ];

    for (const cand of umuCandidates) {
        if (env.existsSync(cand)) {
            runners.push({
                id: 'umu-launcher',
                name: `UMU Launcher (${cand})`,
                mode: 'umu',
                path: cand
            });
            break;
        }
    }

    // 4. Bottles & Lutris Runners
    const bottlesRunnersDir = pathApi.join(home, '.local', 'share', 'bottles', 'runners');
    if (env.existsSync(bottlesRunnersDir)) {
        for (const entry of env.readdirSync(bottlesRunnersDir)) {
            const wineBin = pathApi.join(bottlesRunnersDir, entry, 'bin', 'wine');
            if (env.existsSync(wineBin) && !seenWinePaths.has(wineBin)) {
                seenWinePaths.add(wineBin);
                runners.push({
                    id: `bottles-${entry.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`,
                    name: `Bottles Runner (${entry})`,
                    mode: 'wine',
                    path: wineBin,
                    version: entry
                });
            }
        }
    }

    return runners;
}
