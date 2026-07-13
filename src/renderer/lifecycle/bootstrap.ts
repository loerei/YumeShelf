// @ts-nocheck
export async function runRendererBootstrap({
    refs,
    bootController,
    settingsController,
    localeController,
    searchController,
    startupController,
    appUpdateController,
    updateNotificationFeature,
    uiTextController,
    initApp
}) {
    bootController.show({
        key: 'boot_initializing',
        fallbackText: 'Preparing startup pipeline'
    });

    let bootstrapData = null;
    try {
        bootstrapData = await globalThis.electronAPI.invoke('bootstrap-app', {
            ...settingsController.getBootstrapPreferences()
        });
    } catch (error) {
        console.error('[BOOT] bootstrap-app failed, falling back to legacy startup flow', error);
        bootController.show({
            fallbackText: 'Startup bootstrap failed, continuing with local fallback'
        });
    }

    await localeController.loadLanguageState(bootstrapData ? bootstrapData.languageState : null);
    settingsController.applyLibraryConfig(bootstrapData ? bootstrapData.config : null);
    refs.searchPlaceholder.innerText = localeController.getPlaceholders()[localeController.getPlaceholderIndex()];
    localeController.setCurrentLanguage(localeController.getCurrentLang(), { persist: false });
    setInterval(() => searchController.rotatePlaceholder(), 60000);
    const deferredInstallPending = !!bootstrapData?.deferredAppUpdateInstall?.pending;
    if (deferredInstallPending) {
        refs.welcome.style.display = 'none';
    } else {
        await initApp(bootstrapData);
    }

    const appUpdateInit = await appUpdateController.initialize(bootstrapData) || { presentedPostUpdate: false };
    if (globalThis.electronAPI) {
        (globalThis as any).electronAPI.invoke('log-app-update-debug', `renderer initialize result=${JSON.stringify(appUpdateInit)}`);
        const bootChecks = bootstrapData?.bootChecks || null;
        const appUpdateCheck = bootChecks?.appUpdateCheck || null;
        (globalThis as any).electronAPI.invoke('log-app-update-debug', `renderer bootChecks appUpdatesMode=${bootChecks?.appUpdatesMode || ''} languagePackUpdatesMode=${bootChecks?.languagePackUpdatesMode || ''} appUpdateCheck=${JSON.stringify(appUpdateCheck ? {
            available: !!appUpdateCheck.available,
            deferredUntilNextLaunch: !!appUpdateCheck.deferredUntilNextLaunch,
            downloadable: !!appUpdateCheck.downloadable,
            downloadReady: !!appUpdateCheck.downloadReady,
            releaseName: appUpdateCheck.releaseName || '',
            version: appUpdateCheck.version || ''
        } : null)}`);
    }
    if (!deferredInstallPending && !appUpdateInit.presentedPostUpdate) {
        updateNotificationFeature.presentBootNotifications(bootstrapData);
        if (globalThis.electronAPI) {
            (globalThis as any).electronAPI.invoke('log-app-update-debug', 'renderer presentBootNotifications=true');
        }
    } else if (globalThis.electronAPI) {
        (globalThis as any).electronAPI.invoke('log-app-update-debug', `renderer presentBootNotifications=false reason=${deferredInstallPending ? 'deferred-install-pending' : 'post-update-presented'}`);
    }

    await uiTextController.applyUIStrings();
}
