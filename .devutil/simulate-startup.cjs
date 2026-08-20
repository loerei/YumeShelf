#!/usr/bin/env node
/**
 * YumeShelf Startup & Bootstrap Simulator
 * Usage: node .devutil/simulate-startup.cjs [--os linux|win32] [--simulate-cold-boot]
 */

const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');

const args = process.argv.slice(2);
const targetOs = args.includes('--os') ? args[args.indexOf('--os') + 1] : (process.platform === 'win32' ? 'linux' : process.platform);
const isColdBoot = args.includes('--simulate-cold-boot') || true;

console.log(`\n======================================================`);
console.log(`🚀 YumeShelf Startup & Bootstrap Pipeline Simulator`);
console.log(`   Simulating OS: ${targetOs.toUpperCase()} (Cold Boot: ${isColdBoot})`);
console.log(`======================================================\n`);

async function runSimulation() {
    const tempDir = path.join(os.tmpdir(), `yumeshelf-startup-sim-${Date.now()}`);
    const mockAppData = targetOs === 'linux' ? path.join(tempDir, '.config') : path.join(tempDir, 'AppData', 'Roaming');
    const mockUserData = path.join(mockAppData, 'YumeShelf');
    const mockExeDir = path.join(tempDir, 'opt', 'YumeShelf');

    console.log(`[SIM] Mock AppData: ${mockAppData}`);
    console.log(`[SIM] Mock UserData: ${mockUserData}`);

    const mockApp = {
        isPackaged: true,
        getVersion: () => '1.6.0',
        getName: () => 'YumeShelf',
        name: 'YumeShelf',
        getPath: (name) => {
            if (name === 'appData') return mockAppData;
            if (name === 'userData') return mockUserData;
            if (name === 'exe') return path.join(mockExeDir, targetOs === 'win32' ? 'YumeShelf.exe' : 'YumeShelf');
            return tempDir;
        }
    };

    const rootDir = path.resolve(__dirname, '..');
    const distDir = path.join(rootDir, 'dist');

    // 1. App Paths
    const { createAppPaths } = require(path.join(distDir, 'main', 'core', 'app-paths'));
    const paths = createAppPaths(mockApp, distDir);

    // 2. Category State
    const { createCategoryState } = require(path.join(distDir, 'main', 'category-state'));
    const categoryState = createCategoryState({ fs, stateFile: paths.categoryStateFile });

    // 3. Library State
    const { createLibraryState } = require(path.join(distDir, 'main', 'library-state'));
    const libraryState = createLibraryState({
        categoryState,
        defaultGamesDir: paths.defaultGamesDir,
        dialog: {},
        fs,
        fsSync,
        dbFilePath: paths.dbFile
    });

    // 4. Language Pack Services
    const { createLanguagePackServices } = require(path.join(distDir, 'main', 'language-packs', 'service'));
    const languagePackServices = createLanguagePackServices({ app: mockApp, paths });

    // 5. App Updates
    const { createAppUpdateServices } = require(path.join(distDir, 'main', 'app-updates'));
    const appUpdateServices = createAppUpdateServices({
        app: mockApp,
        broadcastStatus: () => {},
        compareVersions: () => 0,
        openExternalUrl: () => {},
        startupNetworkTimeoutMs: 1000
    });

    // 6. Playtime Session Manager
    const { createPlaytimeSessionManager } = require(path.join(distDir, 'main', 'playtime-session-manager'));
    const playtimeSessionManager = createPlaytimeSessionManager({
        app: mockApp,
        BrowserWindow: { getAllWindows: () => [] },
        libraryState
    });

    // 7. Startup Services
    const { createStartupServices } = require(path.join(distDir, 'main', 'startup'));
    const startupServices = createStartupServices({
        app: mockApp,
        checkForAppUpdate: () => appUpdateServices.checkForAppUpdate(),
        consumePostUpdateMarker: () => appUpdateServices.consumePostUpdateMarker(),
        prepareDeferredInstallOnLaunch: () => appUpdateServices.prepareDeferredInstallOnLaunch(),
        preparePlaytimeSessions: () => playtimeSessionManager.initialize(),
        overlayPlaytimeSessions: (games) => playtimeSessionManager.overlayGames(games),
        logAppUpdateDebug: () => {},
        applyLanguagePackUpdates: languagePackServices.applyLanguagePackUpdates,
        buildLanguageState: languagePackServices.buildLanguageState,
        fetchLanguageManifest: languagePackServices.fetchLanguageManifest,
        getLanguagePackUpdateCandidates: languagePackServices.getLanguagePackUpdateCandidates,
        isNetworkLikeError: languagePackServices.isNetworkLikeError,
        loadGamesForConfig: (cfg) => libraryState.loadGamesForConfig(cfg),
        resolveLibraryConfig: () => libraryState.resolveLibraryConfig(),
        getCategoryTree: () => categoryState.getCategoryTree(),
        startupNetworkTimeoutMs: 1000
    });

    const emittedStatuses = [];
    const mockWebContents = {
        isDestroyed: () => false,
        send: (channel, data) => {
            if (channel === 'boot-status') {
                emittedStatuses.push(data.key || data.fallbackText);
                console.log(`  ➔ [BOOT STATUS] ${data.key} ("${data.fallbackText}")`);
            }
        }
    };

    console.log(`\n▶ Step 1: Executing bootstrapAppState on cold storage...`);
    const startTime = Date.now();
    const result = await startupServices.bootstrapAppState(mockWebContents, {});
    const elapsed = Date.now() - startTime;

    console.log(`\n✅ Bootstrap Completed in ${elapsed}ms!`);
    console.log(`   - App Version: ${result.appVersion}`);
    console.log(`   - Config Resolved: ${result.config ? 'YES (Library Path: ' + (result.config.libraryPath || '<empty>') + ')' : 'NO'}`);
    console.log(`   - DB File Created on Disk: ${fsSync.existsSync(paths.dbFile) ? 'YES' : 'NO'}`);
    console.log(`   - Category State Created on Disk: ${fsSync.existsSync(paths.categoryStateFile) ? 'YES' : 'NO'}`);
    console.log(`   - Total Emitted Boot Statuses: ${emittedStatuses.length}`);

    // Cleanup temp dir
    try {
        await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}

    console.log(`\n🎉 Simulation PASSED! Zero errors on cold startup.\n`);
}

runSimulation().catch((err) => {
    console.error(`\n❌ Simulation FAILED:`, err);
    process.exit(1);
});
