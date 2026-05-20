// @ts-nocheck
export function createUpdateInstallFlow({ bootController }) {
    let installShellTimers = [];

    function clearInstallShellTimers() {
        installShellTimers.forEach(timer => clearTimeout(timer));
        installShellTimers = [];
    }

    function showInstallShellPhase(phase = 'install-preparing') {
        const stageMap = {
            'install-preparing': {
                fallbackText: 'Preparing installation',
                key: 'boot_update_preparing_install'
            },
            'install-handoff': {
                fallbackText: 'Installing update',
                key: 'boot_update_installing'
            },
            restarting: {
                fallbackText: 'Restarting YumeShelf',
                key: 'boot_update_restarting'
            }
        };
        const stage = stageMap[phase] || stageMap['install-preparing'];
        bootController.show({
            fallbackText: stage.fallbackText,
            key: stage.key,
            mode: 'update',
            showProgress: true,
            titleKey: 'boot_update_title',
            titleText: 'Installing YumeShelf update'
        });
    }

    function beginInstallShellSequence(initialPhase = 'install-preparing') {
        clearInstallShellTimers();
        showInstallShellPhase(initialPhase);
        installShellTimers = [
            setTimeout(() => showInstallShellPhase('install-handoff'), 520),
            setTimeout(() => showInstallShellPhase('restarting'), 1080)
        ];
    }

    async function waitForNextPaint() {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    return {
        beginInstallShellSequence,
        clearInstallShellTimers,
        showInstallShellPhase,
        waitForNextPaint
    };
}
