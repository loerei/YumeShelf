import { createLanguagePackActions } from './language-packs/actions.js';
import { createLanguagePackResultsController } from './language-packs/results.js';

export function createLanguagePackController({
    electronAPI,
    getAppUpdateState,
    localeController,
    onOverlayOpen,
    onPackInstalled,
    performAppUpdateAction,
    refs,
    suppressPostUpdateReview,
    subscribeAppUpdateState
}) {
    let remoteManifestState = {
        loaded: false,
        loading: false,
        offline: false,
        source: 'none',
        error: null,
        packs: []
    };
    let showAllLanguagePacks = false;
    let downloadingLanguageCode = null;
    let reviewMode = 'language-packs';
    let appSectionMode = 'auto';

    function getText(key, fallback = '') {
        const d = localeController.getStrings();
        const en = localeController.getEnglishStrings();
        return d[key] || en[key] || fallback;
    }

    function setLanguagePackBanner(message = '', visible = false) {
        refs.languagePackBanner.textContent = message;
        refs.languagePackBanner.style.display = visible && message ? 'block' : 'none';
    }

    function setBannerLock(locked) {
        if (locked) {
            refs.languagePackBanner.dataset.locked = 'true';
            return;
        }
        delete refs.languagePackBanner.dataset.locked;
    }

    function updateManifestState(nextState) {
        remoteManifestState = nextState;
    }

    const resultsController = createLanguagePackResultsController({
        getAppSectionMode: () => appSectionMode,
        getAppUpdateState,
        getDownloadingLanguageCode: () => downloadingLanguageCode,
        getManifestState: () => remoteManifestState,
        getReviewMode: () => reviewMode,
        getShowAllLanguagePacks: () => showAllLanguagePacks,
        getText,
        localeController,
        onDownloadLanguagePack: (...args) => actions.downloadLanguagePack(...args),
        onSelectInstalledPack: (code) => {
            localeController.setCurrentLanguage(code);
            actions.closeLanguagePackModal();
        },
        refs
    });
    const renderLanguagePackResults = () => resultsController.renderLanguagePackResults();

    const actions = createLanguagePackActions({
        electronAPI,
        fetchManifestState: () => ({
            ...remoteManifestState,
            reviewMode
        }),
        getText,
        localeController,
        onOverlayOpen,
        onPackInstalled,
        performAppUpdateAction,
        refs,
        renderLanguagePackResults,
        setAppSectionMode: (value) => {
            appSectionMode = value;
        },
        setBannerLock,
        setDownloadingLanguageCode: (value) => {
            downloadingLanguageCode = value;
        },
        setLanguagePackBanner,
        setManifestState: (value) => {
            remoteManifestState = value;
        },
        setReviewMode: (value) => {
            reviewMode = value;
        },
        setShowAllLanguagePacks: (value) => {
            showAllLanguagePacks = value;
        },
        suppressPostUpdateReview,
        updateManifestState
    });

    function handleListClick() {
        showAllLanguagePacks = true;
        refs.languagePackSearch.value = '';
        renderLanguagePackResults();
    }

    async function handleRefreshClick() {
        showAllLanguagePacks = true;
        await actions.fetchLanguagePackManifest();
    }

    function handleSearchInput() {
        showAllLanguagePacks = true;
        renderLanguagePackResults();
    }

    refs.appUpdateReviewActionBtn.onclick = () => {
        void actions.handleAppUpdateAction();
    };
    refs.appUpdateReviewOptOutBtn.onclick = () => {
        if (typeof suppressPostUpdateReview === 'function') {
            suppressPostUpdateReview();
        }
        actions.closeLanguagePackModal();
    };

    if (typeof subscribeAppUpdateState === 'function') {
        subscribeAppUpdateState(() => {
            if (refs.languagePackOverlay.style.display === 'flex' && reviewMode === 'updates-review') {
                renderLanguagePackResults();
            }
        });
    }

    return {
        closeLanguagePackModal: actions.closeLanguagePackModal,
        fetchLanguagePackManifest: actions.fetchLanguagePackManifest,
        handleListClick,
        handleRefreshClick,
        handleSearchInput,
        openLanguagePackModal: actions.openLanguagePackModal,
        openUpdatesReviewModal: actions.openUpdatesReviewModal,
        renderLanguagePackResults
    };
}
