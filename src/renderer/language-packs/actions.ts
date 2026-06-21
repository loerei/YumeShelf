// @ts-nocheck
export function createLanguagePackActions({
    electronAPI,
    fetchManifestState,
    getText,
    localeController,
    onOverlayOpen,
    onPackInstalled,
    performAppUpdateAction,
    refs,
    renderLanguagePackResults,
    setAppSectionMode,
    setBannerLock,
    setDownloadingLanguageCode,
    setLanguagePackBanner,
    setManifestState,
    setReviewMode,
    setShowAllLanguagePacks,
    suppressPostUpdateReview,
    updateManifestState
}) {
    async function fetchLanguagePackManifest() {
        updateManifestState({
            ...fetchManifestState(),
            loading: true
        });
        renderLanguagePackResults();

        const response = await electronAPI.invoke('get-language-pack-manifest');
        updateManifestState({
            loaded: true,
            loading: false,
            offline: !!response.offline,
            source: response.source || 'none',
            error: response.error || null,
            packs: response.packs || []
        });

        if (response.repoUrl) {
            localeController.setLocaleState({
                ...localeController.getLocaleState(),
                repoUrl: response.repoUrl
            });
        }

        if (fetchManifestState().offline) {
            setLanguagePackBanner(getText('lang_modal_offline', 'You are offline.'), true);
        } else if (!refs.languagePackBanner.dataset.locked) {
            setLanguagePackBanner('', false);
        }
        renderLanguagePackResults();
    }

    async function openLanguagePackModal(options = {}) {
        const { bannerMessage = '', showAll = false } = options;
        setReviewMode('language-packs');
        setAppSectionMode('auto');
        if (typeof onOverlayOpen === 'function') {
            onOverlayOpen();
        }
        refs.languagePackOverlay.style.display = 'flex';
        refs.languagePackSearch.value = '';
        setShowAllLanguagePacks(!!showAll);
        setBannerLock(false);
        setLanguagePackBanner(navigator.onLine === false ? getText('lang_modal_offline', 'You are offline.') : '', navigator.onLine === false);
        renderLanguagePackResults();
        await fetchLanguagePackManifest();
        if (bannerMessage) {
            setBannerLock(true);
            setLanguagePackBanner(bannerMessage, true);
        }
    }

    async function openUpdatesReviewModal(options = {}) {
        const { bannerMessage = '' } = options;
        setReviewMode('updates-review');
        setAppSectionMode(options.appSectionMode || 'auto');
        if (typeof onOverlayOpen === 'function') {
            onOverlayOpen();
        }
        refs.languagePackOverlay.style.display = 'flex';
        refs.languagePackSearch.value = '';
        setShowAllLanguagePacks(true);
        setBannerLock(false);
        setLanguagePackBanner('', false);
        renderLanguagePackResults();
        await fetchLanguagePackManifest();
        if (bannerMessage) {
            setBannerLock(true);
            setLanguagePackBanner(bannerMessage, true);
        }
    }

    function closeLanguagePackModal() {
        refs.languagePackOverlay.style.display = 'none';
        setReviewMode('language-packs');
        setAppSectionMode('auto');
        setBannerLock(false);
    }

    async function downloadLanguagePack(code, options = {}) {
        const { activateAfterInstall = true } = options;
        setDownloadingLanguageCode(code);
        renderLanguagePackResults();
        const result = await electronAPI.invoke('install-language-pack', code);
        setDownloadingLanguageCode(null);

        if (!result?.ok) {
            if (result?.reason === 'checksum') {
                setLanguagePackBanner(getText('lang_modal_checksum_failed', 'Checksum verification failed.'), true);
            } else if (result?.reason === 'schema') {
                setLanguagePackBanner(getText('lang_modal_schema_failed', 'Language pack schema is invalid.'), true);
            } else if (result?.reason === 'not-compatible') {
                setLanguagePackBanner(getText('lang_modal_not_compatible', 'This language pack needs a newer version of YumeShelf.'), true);
            } else if (result?.reason === 'offline') {
                setLanguagePackBanner(getText('lang_modal_offline', 'You are offline.'), true);
            } else {
                setLanguagePackBanner(getText('lang_modal_install_error', 'Could not install that language pack.'), true);
            }
            renderLanguagePackResults();
            return;
        }

        localeController.setLocaleState(result.state || localeController.getLocaleState());
        if (activateAfterInstall || localeController.getCurrentLang() === code) {
            localeController.setCurrentLanguage(code);
        }
        if (typeof onPackInstalled === 'function') {
            onPackInstalled(result);
        }

        if (fetchManifestState().reviewMode === 'updates-review') {
            await fetchLanguagePackManifest();
            setBannerLock(true);
            setLanguagePackBanner(getText('lang_modal_downloaded', 'Language pack installed and applied.'), true);
            return;
        }

        closeLanguagePackModal();
    }

    async function handleAppUpdateAction() {
        if (typeof performAppUpdateAction !== 'function') return;
        const result = await performAppUpdateAction();
        if (!result || result.ok) return;

        if (result.reason === 'checksum') {
            setLanguagePackBanner(getText('app_update_review_error_checksum', 'The downloaded app update failed checksum verification.'), true);
        } else if (result.reason === 'offline') {
            setLanguagePackBanner(getText('app_update_review_error_offline', 'The app update could not finish because you are offline.'), true);
        } else if (result.reason !== 'busy') {
            setLanguagePackBanner(getText('app_update_review_error_generic', 'The app update could not be completed right now.'), true);
        }
        renderLanguagePackResults();
    }

    return {
        closeLanguagePackModal,
        downloadLanguagePack,
        fetchLanguagePackManifest,
        handleAppUpdateAction,
        openLanguagePackModal,
        openUpdatesReviewModal
    };
}
