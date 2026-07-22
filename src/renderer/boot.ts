// @ts-nocheck
export function createBootController({
    loading,
    bootProgress,
    bootProgressBar,
    bootTitle,
    bootStatus,
    getStrings,
    getEnglishStrings
}) {
    let latestBootPayload = {
        key: 'boot_initializing',
        fallbackText: 'Preparing startup pipeline',
        mode: 'startup',
        showProgress: false
    };

    function resolveBootMessage(payload = latestBootPayload) {
        const d = getStrings();
        const en = getEnglishStrings();
        if (payload?.key) {
            return d[payload.key] || en[payload.key] || payload.fallbackText || '';
        }
        return payload?.fallbackText || '';
    }

    function resolveBootTitle(payload = latestBootPayload) {
        const d = getStrings();
        const en = getEnglishStrings();
        if (payload?.titleKey) {
            return d[payload.titleKey] || en[payload.titleKey] || payload.titleText || '';
        }
        return payload?.titleText || d.boot_title || en.boot_title || 'Starting YumeShelf';
    }

    function render(payload = latestBootPayload) {
        latestBootPayload = payload || latestBootPayload;
        const mode = latestBootPayload?.mode === 'update' ? 'update' : 'startup';
        loading.dataset.mode = mode;
        if (bootTitle) {
            bootTitle.textContent = resolveBootTitle(latestBootPayload);
        }
        if (bootStatus) {
            let message = resolveBootMessage(latestBootPayload);
            if (latestBootPayload?.showProgress && latestBootPayload?.progress !== undefined) {
                const percent = Math.round(latestBootPayload.progress * 100);
                // If the message doesn't already contain a percentage, append it
                if (!message.includes('%')) {
                    message += ` (${percent}%)`;
                }
            }
            bootStatus.textContent = message;
        }
        if (bootProgress) {
            bootProgress.style.display = latestBootPayload?.showProgress ? 'flex' : 'none';
        }
        if (bootProgressBar) {
            bootProgressBar.style.animationPlayState = latestBootPayload?.showProgress ? 'running' : 'paused';
        }
    }

    function show(payload = latestBootPayload) {
        loading.style.display = 'flex';
        render(payload);
    }

    function hide() {
        loading.style.display = 'none';
    }

    function getLatestPayload() {
        return latestBootPayload;
    }

    return {
        getLatestPayload,
        hide,
        render,
        resolveBootMessage,
        show
    };
}
