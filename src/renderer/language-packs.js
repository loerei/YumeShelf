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

    function setLanguagePackBanner(message = '', visible = false) {
        refs.languagePackBanner.textContent = message;
        refs.languagePackBanner.style.display = visible && message ? 'block' : 'none';
    }

    function updateLanguagePackSourceText() {
        const d = localeController.getStrings();
        if (remoteManifestState.source === 'remote' || remoteManifestState.source === 'local') {
            refs.languagePackSource.textContent = d.lang_modal_source_remote || '';
        } else if (remoteManifestState.source === 'cache') {
            refs.languagePackSource.textContent = d.lang_modal_source_cache || '';
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
            setLanguagePackBanner(localeController.getStrings().lang_modal_offline, true);
        } else {
            setLanguagePackBanner('', false);
        }
        renderLanguagePackResults();
    }

    async function openLanguagePackModal() {
        refs.languagePackOverlay.style.display = 'flex';
        refs.languagePackSearch.value = '';
        showAllLanguagePacks = false;
        setLanguagePackBanner(navigator.onLine === false ? localeController.getStrings().lang_modal_offline : '', navigator.onLine === false);
        renderLanguagePackResults();
        await fetchLanguagePackManifest();
    }

    function closeLanguagePackModal() {
        refs.languagePackOverlay.style.display = 'none';
    }

    async function downloadLanguagePack(code) {
        downloadingLanguageCode = code;
        renderLanguagePackResults();
        const result = await electronAPI.installLanguagePack(code);
        downloadingLanguageCode = null;

        if (!result || !result.ok) {
            const d = localeController.getStrings();
            if (result && result.reason === 'checksum') {
                setLanguagePackBanner(d.lang_modal_checksum_failed, true);
            } else if (result && result.reason === 'schema') {
                setLanguagePackBanner(d.lang_modal_schema_failed, true);
            } else if (result && result.reason === 'not-compatible') {
                setLanguagePackBanner(d.lang_modal_not_compatible, true);
            } else if (result && result.reason === 'offline') {
                setLanguagePackBanner(d.lang_modal_offline, true);
            } else {
                setLanguagePackBanner(d.lang_modal_install_error, true);
            }
            renderLanguagePackResults();
            return;
        }

        localeController.setLocaleState(result.state || localeController.getLocaleState());
        localeController.setCurrentLanguage(code);
        closeLanguagePackModal();
    }

    function renderLanguagePackResults() {
        const d = localeController.getStrings();
        const en = localeController.getEnglishStrings();
        updateLanguagePackSourceText();
        refs.languagePackSearch.placeholder = d.lang_modal_search_placeholder;
        refs.languagePackListBtn.textContent = d.lang_modal_list_button;
        refs.languagePackRefreshBtn.textContent = d.lang_modal_refresh_button;
        refs.languagePackHint.textContent = d.lang_modal_hint;
        refs.languagePackEmptyTitle.textContent = d.lang_modal_empty_title;
        refs.languagePackEmptyDesc.textContent = d.lang_modal_empty_desc;
        refs.languagePackRepoLink.textContent = d.lang_modal_contribute;
        refs.languagePackRepoLink.href = localeController.getLocaleState().repoUrl || refs.languagePackRepoLink.href;

        refs.languagePackResults.innerHTML = '';
        refs.languagePackEmpty.style.display = 'none';

        if (remoteManifestState.loading) {
            refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${d.lang_modal_loading}</div>`;
            return;
        }

        const query = refs.languagePackSearch.value.trim();
        if (!showAllLanguagePacks && !query) {
            refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${d.lang_modal_hint}</div>`;
            return;
        }

        const matches = filterLanguagePacks(query);
        if (matches.length === 0) {
            if (remoteManifestState.offline && (!remoteManifestState.packs || remoteManifestState.packs.length === 0)) {
                refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${d.lang_modal_offline}</div>`;
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
            const card = document.createElement('div');
            card.className = 'language-pack-card';

            const title = localeController.formatLanguageLabel(pack);
            const sourceText = installed
                ? (localeController.getLanguageMeta(pack.code)?.source === 'built-in' ? d.lang_builtin_source : d.lang_downloaded_source)
                : d.lang_modal_available_title;

            const actionDisabled = installed || downloadingLanguageCode !== null;
            const actionLabel = installed
                ? d.lang_modal_installed
                : (downloadingLanguageCode === pack.code ? d.lang_modal_downloading : d.lang_modal_download);

            card.innerHTML = `
                <div class="language-pack-card-copy">
                    <h3>${title}</h3>
                    <p>${pack.code.toUpperCase()} • ${sourceText}</p>
                    <div class="language-pack-card-meta">
                        <span class="language-pack-chip">${d.pack_chip_version_prefix || en.pack_chip_version_prefix} v${pack.packVersion}</span>
                        ${pack.reviewedForAppVersion ? `<span class="language-pack-chip">${d.pack_chip_reviewed_for_prefix || en.pack_chip_reviewed_for_prefix} ${pack.reviewedForAppVersion}</span>` : ''}
                        ${(pack.aliases || []).slice(0, 3).map(alias => `<span class="language-pack-chip">${alias}</span>`).join('')}
                    </div>
                </div>
                <button class="small-btn ${installed ? '' : 'secondary-btn'}" ${actionDisabled ? 'disabled' : ''}>${actionLabel}</button>
            `;

            const button = card.querySelector('button');
            button.onclick = async (event) => {
                event.stopPropagation();
                if (installed) return;
                await downloadLanguagePack(pack.code);
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
