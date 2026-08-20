import * as fsSync from 'node:fs';
import * as path from 'node:path';
import {
    GameRunnerConfig,
    GlobalRunnerSettings,
    DetectedRunner,
    ResolvedLaunchParameters,
    RunnerMode
} from './types';

export interface RunnerResolverEnv {
    platform: string;
    env: Record<string, string | undefined>;
    chmodSync(p: string, mode: number): void;
    accessSync(p: string, mode: number): void;
    existsSync(p: string): boolean;
}

export const defaultResolverEnv: RunnerResolverEnv = {
    platform: process.platform,
    env: process.env,
    chmodSync: (p: string, mode: number) => {
        try {
            fsSync.chmodSync(p, mode);
        } catch (e) {
            console.warn(`[GAME-RUNNER] Failed to chmod ${p}:`, e);
        }
    },
    accessSync: (p: string, mode: number) => fsSync.accessSync(p, mode),
    existsSync: (p: string) => fsSync.existsSync(p)
};

export function isLinuxExecutable(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return (
        lower.endsWith('.x86_64') ||
        lower.endsWith('.x86') ||
        lower.endsWith('.appimage') ||
        lower.endsWith('.sh') ||
        !path.extname(lower) // extensionless ELF binary
    );
}

export async function ensureLinuxExecutablePermissions(
    filePath: string,
    env: RunnerResolverEnv = defaultResolverEnv
): Promise<void> {
    if (env.platform !== 'linux') return;

    try {
        env.accessSync(filePath, fsSync.constants.X_OK);
    } catch {
        try {
            env.chmodSync(filePath, 0o755);
        } catch (err) {
            console.warn(`[GAME-RUNNER] Could not set executable permission on ${filePath}:`, err);
        }
    }
}

export function determineRunnerMode(
    game: { platform?: string; exePath: string },
    runnerConfig?: GameRunnerConfig,
    globalSettings?: GlobalRunnerSettings,
    detectedRunners: DetectedRunner[] = [],
    env: RunnerResolverEnv = defaultResolverEnv
): RunnerMode {
    if (runnerConfig?.mode && runnerConfig.mode !== 'auto') {
        return runnerConfig.mode;
    }

    const isTargetLinux =
        game.platform === 'linux' ||
        isLinuxExecutable(game.exePath) ||
        (!game.exePath.toLowerCase().endsWith('.exe') && env.platform === 'linux');

    if (isTargetLinux) {
        return globalSettings?.defaultLinuxNativeMode || 'native';
    }

    // Windows .exe target
    if (env.platform === 'win32') {
        return 'native';
    }

    // Running .exe on Linux
    if (globalSettings?.defaultWindowsExeMode && globalSettings.defaultWindowsExeMode !== 'auto') {
        return globalSettings.defaultWindowsExeMode;
    }

    // Auto-selection based on detected runners
    if (detectedRunners.some((r) => r.mode === 'wine')) {
        return 'wine';
    }
    if (detectedRunners.some((r) => r.mode === 'proton')) {
        return 'proton';
    }
    if (detectedRunners.some((r) => r.mode === 'umu')) {
        return 'umu';
    }

    return 'wine'; // Fallback to wine
}

export async function resolveGameLaunch(
    game: { platform?: string; exePath: string; gameKey?: string },
    runnerConfig?: GameRunnerConfig,
    globalSettings?: GlobalRunnerSettings,
    detectedRunners: DetectedRunner[] = [],
    env: RunnerResolverEnv = defaultResolverEnv
): Promise<ResolvedLaunchParameters> {
    const pathApi = env.platform === 'win32' ? path.win32 : path.posix;
    const targetPath = pathApi.resolve(game.exePath);
    const cwd = pathApi.dirname(targetPath);
    const mode = determineRunnerMode(game, runnerConfig, globalSettings, detectedRunners, env);
    const customArgs = Array.isArray(runnerConfig?.customArgs) ? [...runnerConfig.customArgs] : [];
    const customEnv = runnerConfig?.customEnv ? { ...runnerConfig.customEnv } : {};

    const home = env.env.HOME || '';
    const isTargetLinux =
        game.platform === 'linux' ||
        isLinuxExecutable(game.exePath) ||
        (!game.exePath.toLowerCase().endsWith('.exe') && env.platform === 'linux');
    const targetPlatform: 'windows' | 'linux' = isTargetLinux ? 'linux' : 'windows';

    switch (mode) {
        case 'native': {
            if (isTargetLinux) {
                await ensureLinuxExecutablePermissions(targetPath, env);
            }
            return {
                command: targetPath,
                args: customArgs,
                cwd,
                env: customEnv,
                runnerMode: 'native',
                targetPlatform
            };
        }

        case 'wine': {
            let wineBin = runnerConfig?.customRunnerPath;
            if (!wineBin) {
                const wineRunner = detectedRunners.find((r) => r.mode === 'wine');
                wineBin = wineRunner?.path || 'wine';
            }

            const prefixPath =
                runnerConfig?.winePrefixPath ||
                globalSettings?.defaultWinePrefix ||
                (home ? pathApi.join(home, '.wine') : '');

            const mergedEnv: Record<string, string> = {
                ...customEnv
            };
            if (prefixPath) {
                mergedEnv.WINEPREFIX = prefixPath;
            }

            return {
                command: wineBin,
                args: [targetPath, ...customArgs],
                cwd,
                env: mergedEnv,
                runnerMode: 'wine',
                targetPlatform: 'windows'
            };
        }

        case 'proton': {
            let protonBin = runnerConfig?.protonPath || runnerConfig?.customRunnerPath;
            if (!protonBin) {
                const protonRunner = detectedRunners.find((r) => r.mode === 'proton');
                protonBin = protonRunner?.path;
            }

            if (!protonBin) {
                throw new Error('Steam Proton was not found on this system. Please specify a protonPath in game configuration or global settings.');
            }

            const compatData =
                runnerConfig?.winePrefixPath ||
                globalSettings?.defaultWinePrefix ||
                (home ? pathApi.join(home, '.local', 'share', 'YumeShelf', 'proton-prefix') : '');
            const steamClientPath = home ? pathApi.join(home, '.steam', 'root') : '';

            const mergedEnv: Record<string, string> = {
                STEAM_COMPAT_DATA_PATH: compatData,
                STEAM_COMPAT_CLIENT_INSTALL_PATH: steamClientPath,
                ...customEnv
            };

            return {
                command: protonBin,
                args: ['run', targetPath, ...customArgs],
                cwd,
                env: mergedEnv,
                runnerMode: 'proton',
                targetPlatform: 'windows'
            };
        }

        case 'umu': {
            let umuBin = runnerConfig?.customRunnerPath;
            if (!umuBin) {
                const umuRunner = detectedRunners.find((r) => r.mode === 'umu');
                umuBin = umuRunner?.path || 'umu-run';
            }

            return {
                command: umuBin,
                args: [targetPath, ...customArgs],
                cwd,
                env: customEnv,
                runnerMode: 'umu',
                targetPlatform: 'windows'
            };
        }

        case 'custom': {
            if (!runnerConfig?.customRunnerPath) {
                throw new Error('Custom runner path is required when runner mode is set to custom.');
            }

            return {
                command: runnerConfig.customRunnerPath,
                args: [...customArgs, targetPath],
                cwd,
                env: customEnv,
                runnerMode: 'custom',
                targetPlatform
            };
        }

        default: {
            return {
                command: targetPath,
                args: customArgs,
                cwd,
                env: customEnv,
                runnerMode: 'native',
                targetPlatform
            };
        }
    }
}
