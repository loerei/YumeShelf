export type RunnerMode = 'native' | 'wine' | 'proton' | 'umu' | 'custom' | 'auto';

export interface GameRunnerConfig {
    mode?: RunnerMode;
    customRunnerPath?: string;
    customArgs?: string[];
    customEnv?: Record<string, string>;
    winePrefixPath?: string;
    protonPath?: string;
}

export interface DetectedRunner {
    id: string;
    name: string;
    mode: RunnerMode;
    path: string;
    version?: string;
    isDefault?: boolean;
}

export interface GlobalRunnerSettings {
    defaultLinuxNativeMode: RunnerMode;
    defaultWindowsExeMode: RunnerMode;
    defaultWinePrefix: string;
    customRunners: DetectedRunner[];
}

export interface ResolvedLaunchParameters {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    runnerMode: RunnerMode;
    targetPlatform: 'windows' | 'linux';
}
