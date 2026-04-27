import { renderMarkdownLite } from './markdown-lite.js';

function formatTemplate(template, replacements = {}) {
    return Object.entries(replacements).reduce((result, [key, value]) => {
        return result.replaceAll(`{${key}}`, value);
    }, template);
}

function compareVersions(left, right) {
    const toParts = (value) => String(value || '0')
        .split('.')
        .map(part => parseInt(part, 10))
        .map(part => Number.isFinite(part) ? part : 0);

    const a = toParts(left);
    const b = toParts(right);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
        const delta = (a[i] || 0) - (b[i] || 0);
        if (delta !== 0) return delta;
    }
    return 0;
}

function buildLanguagePackSearchHaystack(pack) {
    return [
        pack.code,
        pack.englishName,
        pack.nativeName,
        ...(pack.aliases || []),
        ...(pack.keywords || [])
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

export function createLanguagePackController({
    electronAPI,
    getAppUpdateState,
    localeController,
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

    function updateLanguagePackSourceText() {
        if (remoteManifestState.source === 'remote' || remoteManifestState.source === 'local') {
            refs.languagePackSource.textContent = getText('lang_modal_source_remote');
        } else if (remoteManifestState.source === 'cache') {
            refs.languagePackSource.textContent = getText('lang_modal_source_cache');
        } else {
            refs.languagePackSource.textContent = '';
        }
    }

    function filterLanguagePacks(packs, query) {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return packs;
        return packs.filter((pack) => buildLanguagePackSearchHaystack(pack).includes(normalized));
    }

    function getAvailableLanguagePackUpdates() {
        const updates = new Map();
        const localeState = localeController.getLocaleState();
        const installedPacks = Array.isArray(localeState.installed) ? localeState.installed : [];
        const manifestByCode = new Map((remoteManifestState.packs || []).map(pack => [pack.code, pack]));

        installedPacks.forEach((installedPack) => {
            const manifestEntry = manifestByCode.get(installedPack.code);
            if (!manifestEntry) return;
            if (manifestEntry.minAppVersion && compareVersions(localeState.appVersion, manifestEntry.minAppVersion) < 0) return;
            if (compareVersions(manifestEntry.packVersion, installedPack.packVersion) <= 0) return;

            updates.set(installedPack.code, {
                currentPackVersion: installedPack.packVersion,
                manifestEntry
            });
        });

        return updates;
    }

    function setOverlayChrome() {
        const reviewOpen = reviewMode === 'updates-review';
        refs.languagePackTitle.textContent = reviewOpen
            ? getText('updates_review_title', 'Review updates')
            : getText('lang_modal_title', 'Language packs');
        refs.languagePackToolbar.style.display = reviewOpen ? 'none' : 'flex';
        refs.languagePackSectionTitle.style.display = reviewOpen ? 'block' : 'none';
        refs.languagePackSectionTitle.textContent = getText('updates_review_language_section_title', 'Language pack updates');
        refs.languagePackHint.textContent = reviewOpen
            ? getText('updates_review_language_hint', 'Installed language pack updates that are ready for this library.')
            : getText('lang_modal_hint');
    }

    function renderAppUpdateReview() {
        const reviewOpen = reviewMode === 'updates-review';
        const appUpdate = typeof getAppUpdateState === 'function' ? getAppUpdateState(appSectionMode) : null;
        const installedMode = !!appUpdate?.installed || appUpdate?.actionState === 'installed';
        refs.appUpdateReviewSection.style.display = reviewOpen && appUpdate ? 'flex' : 'none';
        if (!reviewOpen || !appUpdate) return;

        const releaseLabel = installedMode
            ? formatTemplate(
                getText('post_update_notification_title', 'YumeShelf Updated to v{version}'),
                { version: appUpdate.version || '' }
            )
            : appUpdate.releaseName || formatTemplate(
            getText('app_update_review_title', 'YumeShelf {version}'),
            { version: appUpdate.version || '' }
        );
        const currentVersion = localeController.getLocaleState().appVersion || '';
        const statusText = installedMode
            ? getText('app_update_review_status_installed', 'YumeShelf was updated successfully. Review the release notes below.')
            : appUpdate.actionState === 'downloading'
            ? getText('app_update_review_status_downloading', 'Downloading and verifying the new build...')
            : appUpdate.actionState === 'installing'
            ? getText('app_update_review_status_installing', 'Closing YumeShelf and applying the update...')
            : !appUpdate.downloadable
            ? getText('app_update_review_status_manual', 'This update cannot be installed in place here. You can still open the download page.')
            : appUpdate.downloadReady
            ? getText('app_update_review_status_ready', 'The verified update is ready. Press Update to restart and apply it.')
            : getText('app_update_review_status_available', 'Review the latest release notes, then press Update when you are ready.');
        const primaryLabel = installedMode
            ? ''
            : appUpdate.actionState === 'downloading' || appUpdate.actionState === 'installing'
            ? getText('lang_modal_downloading', 'Downloading...')
            : !appUpdate.downloadable
            ? getText('update_notification_open_download_page', 'Open download page')
            : getText('app_update_review_action', 'Update');

        refs.appUpdateReviewEyebrow.textContent = getText('app_update_review_eyebrow', 'App update');
        refs.appUpdateReviewTitle.textContent = releaseLabel;
        refs.appUpdateReviewStatus.textContent = statusText;
        refs.appUpdateReviewMeta.innerHTML = `
            <span class="language-pack-chip">${formatTemplate(
                getText(
                    installedMode ? 'app_update_review_previous_version' : 'app_update_review_current_version',
                    installedMode ? 'From v{version}' : 'Current v{version}'
                ),
                { version: (installedMode ? appUpdate.fromVersion : currentVersion) || '-' }
            )}</span>
            <span class="language-pack-chip">${formatTemplate(
                getText(
                    installedMode ? 'app_update_review_installed_version' : 'app_update_review_next_version',
                    installedMode ? 'Now v{version}' : 'New v{version}'
                ),
                { version: appUpdate.version || '-' }
            )}</span>
            ${(!installedMode && appUpdate.downloadReady) ? `<span class="language-pack-chip">${getText('update_notification_label_ready', 'Ready to install')}</span>` : ''}
        `;
        refs.appUpdateReviewNotes.innerHTML = renderMarkdownLite(
            appUpdate.releaseNotes || getText('app_update_review_notes_unavailable', 'Release notes are unavailable right now.')
        );
        
        if (appUpdate.actionState === 'downloading' && appUpdate.progress) {
            const { percent, bytesPerSecond } = appUpdate.progress;
            refs.appUpdateProgressContainer.style.display = 'block';
            refs.appUpdateProgressFill.style.width = `${percent}%`;
            refs.appUpdateProgressPercent.textContent = `${percent}%`;
            refs.appUpdateProgressSpeed.textContent = formatDataSize(bytesPerSecond) + '/s';
            
            refs.appUpdateReviewStatus.textContent = getText('app_update_review_status_downloading', 'Downloading update...');
        } else {
            refs.appUpdateProgressContainer.style.display = 'none';
        }

        refs.appUpdateReviewActionBtn.style.display = installedMode ? 'none' : 'inline-flex';
        refs.appUpdateReviewActionBtn.textContent = primaryLabel;
        refs.appUpdateReviewActionBtn.disabled = appUpdate.actionState === 'downloading' || appUpdate.actionState === 'installing';
        refs.appUpdateReviewOptOutBtn.style.display = installedMode ? 'inline-flex' : 'none';
        refs.appUpdateReviewOptOutBtn.textContent = getText('post_update_notification_opt_out', "Don't show again");
    }

    function formatDataSize(bytes) {
        if (!bytes || isNaN(bytes) || bytes < 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }

    async function fetchLanguagePackManifest() {
        remoteManifestState.loading = true;
        renderLanguagePackResults();

        const response = await electronAPI.getLanguagePackManifest();
        remoteManifestState = {
            loaded: true,
            loading: false,
            offline: !!response.offline,
            source: response.source || 'none',
            error: response.error || null,
            packs: response.packs || []
        };

        if (response.repoUrl) {
            localeController.setLocaleState({
                ...localeController.getLocaleState(),
                repoUrl: response.repoUrl
            });
        }

        if (remoteManifestState.offline) {
            setLanguagePackBanner(getText('lang_modal_offline', 'You are offline.'), true);
        } else if (!refs.languagePackBanner.dataset.locked) {
            setLanguagePackBanner('', false);
        }
        renderLanguagePackResults();
    }

    async function openLanguagePackModal(options = {}) {
        const { bannerMessage = '', showAll = false } = options;
        reviewMode = 'language-packs';
        appSectionMode = 'auto';
        refs.languagePackOverlay.style.display = 'flex';
        refs.languagePackSearch.value = '';
        showAllLanguagePacks = !!showAll;
        delete refs.languagePackBanner.dataset.locked;
        setLanguagePackBanner(navigator.onLine === false ? getText('lang_modal_offline', 'You are offline.') : '', navigator.onLine === false);
        renderLanguagePackResults();
        await fetchLanguagePackManifest();
        if (bannerMessage) {
            refs.languagePackBanner.dataset.locked = 'true';
            setLanguagePackBanner(bannerMessage, true);
        }
    }

    async function openUpdatesReviewModal(options = {}) {
        const { bannerMessage = '' } = options;
        reviewMode = 'updates-review';
        appSectionMode = options.appSectionMode || 'auto';
        refs.languagePackOverlay.style.display = 'flex';
        refs.languagePackSearch.value = '';
        showAllLanguagePacks = true;
        delete refs.languagePackBanner.dataset.locked;
        setLanguagePackBanner('', false);
        renderLanguagePackResults();
        await fetchLanguagePackManifest();
        if (bannerMessage) {
            refs.languagePackBanner.dataset.locked = 'true';
            setLanguagePackBanner(bannerMessage, true);
        }
    }

    function closeLanguagePackModal() {
        refs.languagePackOverlay.style.display = 'none';
        reviewMode = 'language-packs';
        appSectionMode = 'auto';
        delete refs.languagePackBanner.dataset.locked;
    }

    async function downloadLanguagePack(code, options = {}) {
        const { activateAfterInstall = true } = options;
        downloadingLanguageCode = code;
        renderLanguagePackResults();
        const result = await electronAPI.installLanguagePack(code);
        downloadingLanguageCode = null;

        if (!result || !result.ok) {
            if (result && result.reason === 'checksum') {
                setLanguagePackBanner(getText('lang_modal_checksum_failed', 'Checksum verification failed.'), true);
            } else if (result && result.reason === 'schema') {
                setLanguagePackBanner(getText('lang_modal_schema_failed', 'Language pack schema is invalid.'), true);
            } else if (result && result.reason === 'not-compatible') {
                setLanguagePackBanner(getText('lang_modal_not_compatible', 'This language pack needs a newer version of YumeShelf.'), true);
            } else if (result && result.reason === 'offline') {
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

        if (reviewMode === 'updates-review') {
            await fetchLanguagePackManifest();
            refs.languagePackBanner.dataset.locked = 'true';
            setLanguagePackBanner(getText('lang_modal_downloaded', 'Language pack installed and applied.'), true);
            return;
        }

        closeLanguagePackModal();
    }

    function getReviewLanguageMatches(query, availableUpdates) {
        const pendingPacks = Array.from(availableUpdates.values()).map(updateInfo => updateInfo.manifestEntry);
        return filterLanguagePacks(pendingPacks, query);
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

    function renderLanguagePackResults() {
        const availableUpdates = getAvailableLanguagePackUpdates();
        const reviewOpen = reviewMode === 'updates-review';
        setOverlayChrome();
        renderAppUpdateReview();
        updateLanguagePackSourceText();
        refs.languagePackSearch.placeholder = getText('lang_modal_search_placeholder');
        refs.languagePackListBtn.textContent = getText('lang_modal_list_button');
        refs.languagePackRefreshBtn.textContent = getText('lang_modal_refresh_button');
        refs.languagePackEmptyTitle.textContent = getText('lang_modal_empty_title');
        refs.languagePackEmptyDesc.textContent = getText('lang_modal_empty_desc');
        refs.languagePackRepoLink.textContent = getText('lang_modal_contribute');
        refs.languagePackRepoLink.href = localeController.getLocaleState().repoUrl || refs.languagePackRepoLink.href;

        refs.languagePackResults.innerHTML = '';
        refs.languagePackEmpty.style.display = 'none';

        if (remoteManifestState.loading) {
            refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${reviewOpen ? getText('updates_review_loading', 'Checking available updates...') : getText('lang_modal_loading')}</div>`;
            return;
        }

        const query = refs.languagePackSearch.value.trim();
        if (!reviewOpen && !showAllLanguagePacks && !query) {
            refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${getText('lang_modal_hint')}</div>`;
            return;
        }

        const matches = reviewOpen
            ? getReviewLanguageMatches(query, availableUpdates)
            : filterLanguagePacks(remoteManifestState.packs || [], query);

        if (matches.length === 0) {
            if (reviewOpen) {
                refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${getText('updates_review_language_empty', 'No language pack updates are waiting right now.')}</div>`;
                return;
            }
            if (remoteManifestState.offline && (!remoteManifestState.packs || remoteManifestState.packs.length === 0)) {
                refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${getText('lang_modal_offline', 'You are offline.')}</div>`;
                return;
            }
            if (remoteManifestState.error && (!remoteManifestState.packs || remoteManifestState.packs.length === 0)) {
                refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${remoteManifestState.error}</div>`;
                return;
            }
            refs.languagePackEmpty.style.display = 'block';
            return;
        }

        matches.forEach((pack) => {
            const installed = localeController.isLanguageAvailable(pack.code);
            const updateInfo = availableUpdates.get(pack.code);
            const updateAvailable = !!updateInfo;
            if (reviewOpen && !updateAvailable) return;

            const card = document.createElement('div');
            card.className = 'language-pack-card';

            const title = localeController.formatLanguageLabel(pack);
            const sourceText = updateAvailable
                ? getText('lang_modal_update_available', 'Update available')
                : installed
                ? (localeController.getLanguageMeta(pack.code)?.source === 'built-in' ? getText('lang_builtin_source') : getText('lang_downloaded_source'))
                : getText('lang_modal_available_title');

            const actionDisabled = (!updateAvailable && installed) || downloadingLanguageCode !== null;
            const actionLabel = updateAvailable
                ? (downloadingLanguageCode === pack.code ? getText('lang_modal_downloading') : getText('lang_modal_update', 'Update'))
                : installed
                ? getText('lang_modal_installed')
                : (downloadingLanguageCode === pack.code ? getText('lang_modal_downloading') : getText('lang_modal_download'));

            card.innerHTML = `
                <div class="language-pack-card-copy">
                    <h3>${title}</h3>
                    <p>${pack.code.toUpperCase()} • ${sourceText}</p>
                    <div class="language-pack-card-meta">
                        <span class="language-pack-chip">${getText('pack_chip_version_prefix')} v${updateInfo ? updateInfo.currentPackVersion : pack.packVersion}</span>
                        ${updateInfo ? `<span class="language-pack-chip">${getText('lang_modal_update', 'Update')} v${pack.packVersion}</span>` : ''}
                        ${pack.reviewedForAppVersion ? `<span class="language-pack-chip">${getText('pack_chip_reviewed_for_prefix')} ${pack.reviewedForAppVersion}</span>` : ''}
                        ${(pack.aliases || []).slice(0, 3).map(alias => `<span class="language-pack-chip">${alias}</span>`).join('')}
                    </div>
                </div>
                <button class="small-btn ${installed ? '' : 'secondary-btn'}" ${actionDisabled ? 'disabled' : ''}>${actionLabel}</button>
            `;

            const button = card.querySelector('button');
            button.onclick = async (event) => {
                event.stopPropagation();
                if (installed && !updateAvailable) return;
                await downloadLanguagePack(pack.code, { activateAfterInstall: !installed });
            };

            if (!reviewOpen && installed) {
                card.style.cursor = 'pointer';
                card.onclick = () => {
                    localeController.setCurrentLanguage(pack.code);
                    closeLanguagePackModal();
                };
            }

            refs.languagePackResults.appendChild(card);
        });
    }

    function handleListClick() {
        showAllLanguagePacks = true;
        refs.languagePackSearch.value = '';
        renderLanguagePackResults();
    }

    async function handleRefreshClick() {
        showAllLanguagePacks = true;
        await fetchLanguagePackManifest();
    }

    function handleSearchInput() {
        showAllLanguagePacks = true;
        renderLanguagePackResults();
    }

    refs.appUpdateReviewActionBtn.onclick = () => {
        void handleAppUpdateAction();
    };
    refs.appUpdateReviewOptOutBtn.onclick = () => {
        if (typeof suppressPostUpdateReview === 'function') {
            suppressPostUpdateReview();
        }
        closeLanguagePackModal();
    };

    if (typeof subscribeAppUpdateState === 'function') {
        subscribeAppUpdateState(() => {
            if (refs.languagePackOverlay.style.display === 'flex' && reviewMode === 'updates-review') {
                renderLanguagePackResults();
            }
        });
    }

    return {
        closeLanguagePackModal,
        fetchLanguagePackManifest,
        handleListClick,
        handleRefreshClick,
        handleSearchInput,
        openLanguagePackModal,
        openUpdatesReviewModal,
        renderLanguagePackResults
    };
}
