export function createLanguagePackController({
    electronAPI,
    localeController,
    refs
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

    function setLanguagePackBanner(message = '', visible = false) {
        refs.languagePackBanner.textContent = message;
        refs.languagePackBanner.style.display = visible && message ? 'block' : 'none';
    }

    function getText(key, fallback = '') {
        const d = localeController.getStrings();
        const en = localeController.getEnglishStrings();
        return d[key] || en[key] || fallback;
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

    function filterLanguagePacks(query) {
        const normalized = query.trim().toLowerCase();
        const manifestPacks = remoteManifestState.packs || [];
        if (!normalized) return manifestPacks;
        return manifestPacks.filter((pack) => {
            const haystack = [
                pack.code,
                pack.englishName,
                pack.nativeName,
                ...(pack.aliases || []),
                ...(pack.keywords || [])
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(normalized);
        });
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
        } else {
            setLanguagePackBanner('', false);
        }
        renderLanguagePackResults();
    }

    async function openLanguagePackModal(options = {}) {
        const { bannerMessage = '', showAll = false } = options;
        refs.languagePackOverlay.style.display = 'flex';
        refs.languagePackSearch.value = '';
        showAllLanguagePacks = !!showAll;
        setLanguagePackBanner(navigator.onLine === false ? getText('lang_modal_offline', 'You are offline.') : '', navigator.onLine === false);
        renderLanguagePackResults();
        await fetchLanguagePackManifest();
        if (bannerMessage) {
            setLanguagePackBanner(bannerMessage, true);
        }
    }

    function closeLanguagePackModal() {
        refs.languagePackOverlay.style.display = 'none';
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
        closeLanguagePackModal();
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

    function renderLanguagePackResults() {
        const availableUpdates = getAvailableLanguagePackUpdates();
        updateLanguagePackSourceText();
        refs.languagePackSearch.placeholder = getText('lang_modal_search_placeholder');
        refs.languagePackListBtn.textContent = getText('lang_modal_list_button');
        refs.languagePackRefreshBtn.textContent = getText('lang_modal_refresh_button');
        refs.languagePackHint.textContent = getText('lang_modal_hint');
        refs.languagePackEmptyTitle.textContent = getText('lang_modal_empty_title');
        refs.languagePackEmptyDesc.textContent = getText('lang_modal_empty_desc');
        refs.languagePackRepoLink.textContent = getText('lang_modal_contribute');
        refs.languagePackRepoLink.href = localeController.getLocaleState().repoUrl || refs.languagePackRepoLink.href;

        refs.languagePackResults.innerHTML = '';
        refs.languagePackEmpty.style.display = 'none';

        if (remoteManifestState.loading) {
            refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${getText('lang_modal_loading')}</div>`;
            return;
        }

        const query = refs.languagePackSearch.value.trim();
        if (!showAllLanguagePacks && !query) {
            refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${getText('lang_modal_hint')}</div>`;
            return;
        }

        const matches = filterLanguagePacks(query);
        if (matches.length === 0) {
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

            if (installed) {
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

    return {
        closeLanguagePackModal,
        fetchLanguagePackManifest,
        handleListClick,
        handleRefreshClick,
        handleSearchInput,
        openLanguagePackModal,
        renderLanguagePackResults
    };
}
