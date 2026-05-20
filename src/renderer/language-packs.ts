// @ts-nocheck
import { createLanguagePackActions } from './language-packs/actions';
import { createLanguagePackResultsController } from './language-packs/results';

/**
 * Build an internal refs object by querying within the provided container.
 * This keeps sub-modules (actions.js, results.js, review-surface.js) unchanged
 * while eliminating the need for external ref registration in dom-refs.js.
 */
function buildLanguagePackRefs(container) {
    return {
        appUpdateReviewActionBtn:  container.querySelector('#app-update-review-action-btn'),
        appUpdateReviewEyebrow:    container.querySelector('#app-update-review-eyebrow'),
        appUpdateReviewMeta:       container.querySelector('#app-update-review-meta'),
        appUpdateReviewNotes:      container.querySelector('#app-update-review-notes'),
        appUpdateReviewOptOutBtn:  container.querySelector('#app-update-review-opt-out-btn'),
        appUpdateReviewSection:    container.querySelector('#app-update-review-section'),
        appUpdateReviewStatus:     container.querySelector('#app-update-review-status'),
        appUpdateReviewTitle:      container.querySelector('#app-update-review-title'),
        languagePackBanner:        container.querySelector('#language-pack-banner'),
        languagePackEmpty:         container.querySelector('#language-pack-empty'),
        languagePackEmptyDesc:     container.querySelector('#language-pack-empty-desc'),
        languagePackEmptyTitle:    container.querySelector('#language-pack-empty-title'),
        languagePackHint:          container.querySelector('#language-pack-hint'),
        languagePackListBtn:       container.querySelector('#language-pack-list-btn'),
        languagePackTitle:         container.querySelector('#ui-language-pack-title'),
        languagePackOverlay:       container,
        languagePackRefreshBtn:    container.querySelector('#language-pack-refresh-btn'),
        languagePackRepoLink:      container.querySelector('#language-pack-repo-link'),
        languagePackResults:       container.querySelector('#language-pack-results'),
        languagePackSearch:        container.querySelector('#language-pack-search'),
        languagePackSectionTitle:  container.querySelector('#language-pack-section-title'),
        languagePackSource:        container.querySelector('#language-pack-source'),
        languagePackToolbar:       container.querySelector('#language-pack-toolbar')
    };
}

export function createLanguagePackController({
    electronAPI,
    getAppUpdateState,
    localeController,
    onOverlayOpen,
    onPackInstalled,
    performAppUpdateAction,
    container,
    suppressPostUpdateReview,
    subscribeAppUpdateState
}) {
    // Build internal refs from container scope – no external ref registration needed.
    const refs = buildLanguagePackRefs(container);

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
