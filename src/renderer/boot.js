export function createBootController({
    loading,
    bootTitle,
    bootStatus,
    getStrings,
    getEnglishStrings
}) {
    let latestBootPayload = {
        key: 'boot_initializing',
        fallbackText: 'Preparing startup pipeline'
    };

    function resolveBootMessage(payload = latestBootPayload) {
        const d = getStrings();
        const en = getEnglishStrings();
        if (payload && payload.key) {
            return d[payload.key] || en[payload.key] || payload.fallbackText || '';
        }
        return (payload && payload.fallbackText) || '';
    }

    function render(payload = latestBootPayload) {
        latestBootPayload = payload || latestBootPayload;
        if (bootTitle) {
            bootTitle.textContent = getStrings().boot_title || getEnglishStrings().boot_title || 'Starting YumeShelf';
        }
        if (bootStatus) {
            bootStatus.textContent = resolveBootMessage(latestBootPayload);
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
