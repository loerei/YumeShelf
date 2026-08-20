import {
    GameRunnerConfig,
    GlobalRunnerSettings,
    DetectedRunner,
    ResolvedLaunchParameters
} from './types';
import { detectInstalledRunners, RunnerDetectorEnv, defaultDetectorEnv } from './detector';
import { resolveGameLaunch, RunnerResolverEnv, defaultResolverEnv } from './resolver';

export * from './types';
export * from './detector';
export * from './resolver';

export interface GameRunnerServiceOptions {
    detectorEnv?: RunnerDetectorEnv;
    resolverEnv?: RunnerResolverEnv;
    initialSettings?: Partial<GlobalRunnerSettings>;
}

export class GameRunnerService {
    private settings: GlobalRunnerSettings;
    private cachedRunners: DetectedRunner[] = [];
    private readonly detectorEnv: RunnerDetectorEnv;
    private readonly resolverEnv: RunnerResolverEnv;

    constructor(options: GameRunnerServiceOptions = {}) {
        this.detectorEnv = options.detectorEnv || defaultDetectorEnv;
        this.resolverEnv = options.resolverEnv || defaultResolverEnv;
        this.settings = {
            defaultLinuxNativeMode: 'native',
            defaultWindowsExeMode: 'wine',
            defaultWinePrefix: '',
            customRunners: [],
            ...options.initialSettings
        };
    }

    async getDetectedRunners(forceRefresh = false): Promise<DetectedRunner[]> {
        if (this.cachedRunners.length === 0 || forceRefresh) {
            const detected = await detectInstalledRunners(this.detectorEnv);
            this.cachedRunners = [...detected, ...this.settings.customRunners];
        }
        return this.cachedRunners;
    }

    getSettings(): GlobalRunnerSettings {
        return { ...this.settings };
    }

    updateSettings(next: Partial<GlobalRunnerSettings>): GlobalRunnerSettings {
        this.settings = {
            ...this.settings,
            ...next
        };
        return this.getSettings();
    }

    async resolveLaunch(
        game: { platform?: string; exePath: string; gameKey?: string },
        gameRunnerConfig?: GameRunnerConfig
    ): Promise<ResolvedLaunchParameters> {
        const detected = await this.getDetectedRunners(false);
        return resolveGameLaunch(
            game,
            gameRunnerConfig,
            this.settings,
            detected,
            this.resolverEnv
        );
    }
}
