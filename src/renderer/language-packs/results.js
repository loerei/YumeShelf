import { buildLanguagePackSearchHaystack, compareVersions, isFinalInstallPhase } from './helpers.js';
import { renderAppUpdateReview, setOverlayChrome } from './review-surface.js';

export function createLanguagePackResultsController({
    getAppSectionMode,
    getAppUpdateState,
    getDownloadingLanguageCode,
    getManifestState,
    getReviewMode,
    getShowAllLanguagePacks,
    getText,
    localeController,
    onDownloadLanguagePack,
    onSelectInstalledPack,
    refs
}) {
    function updateLanguagePackSourceText() {
        const manifestState = getManifestState();
        if (manifestState.source === 'remote' || manifestState.source === 'local') {
            refs.languagePackSource.textContent = getText('lang_modal_source_remote');
        } else if (manifestState.source === 'cache') {
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
        const manifestState = getManifestState();
        const localeState = localeController.getLocaleState();
        const installedPacks = Array.isArray(localeState.installed) ? localeState.installed : [];
        const manifestByCode = new Map((manifestState.packs || []).map(pack => [pack.code, pack]));

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

    function getReviewLanguageMatches(query, availableUpdates) {
        const pendingPacks = Array.from(availableUpdates.values()).map(updateInfo => updateInfo.manifestEntry);
        return filterLanguagePacks(pendingPacks, query);
    }

    function renderLanguagePackResults() {
        const manifestState = getManifestState();
        const reviewMode = getReviewMode();
        const availableUpdates = getAvailableLanguagePackUpdates();
        const reviewOpen = reviewMode === 'updates-review';
        const appUpdate = typeof getAppUpdateState === 'function' ? getAppUpdateState(getAppSectionMode()) : null;
        const updateOnlyFocus = reviewOpen && isFinalInstallPhase(appUpdate);
        setOverlayChrome({
            refs,
            getText,
            reviewMode,
            appUpdate
        });
        renderAppUpdateReview({
            refs,
            getText,
            localeController,
            appUpdate,
            reviewMode
        });
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
        refs.languagePackResults.style.display = updateOnlyFocus ? 'none' : 'grid';

        if (manifestState.loading) {
            refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${reviewOpen ? getText('updates_review_loading', 'Checking available updates...') : getText('lang_modal_loading')}</div>`;
            return;
        }

        if (updateOnlyFocus) {
            return;
        }

        const query = refs.languagePackSearch.value.trim();
        if (!reviewOpen && !getShowAllLanguagePacks() && !query) {
            refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${getText('lang_modal_hint')}</div>`;
            return;
        }

        const matches = reviewOpen
            ? getReviewLanguageMatches(query, availableUpdates)
            : filterLanguagePacks(manifestState.packs || [], query);

        if (matches.length === 0) {
            if (reviewOpen) {
                refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${getText('updates_review_language_empty', 'No language pack updates are waiting right now.')}</div>`;
                return;
            }
            if (manifestState.offline && (!manifestState.packs || manifestState.packs.length === 0)) {
                refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${getText('lang_modal_offline', 'You are offline.')}</div>`;
                return;
            }
            if (manifestState.error && (!manifestState.packs || manifestState.packs.length === 0)) {
                refs.languagePackResults.innerHTML = `<div class="language-pack-placeholder">${manifestState.error}</div>`;
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

            const actionDisabled = (!updateAvailable && installed) || getDownloadingLanguageCode() !== null;
            const actionLabel = updateAvailable
                ? (getDownloadingLanguageCode() === pack.code ? getText('lang_modal_downloading') : getText('lang_modal_update', 'Update'))
                : installed
                    ? getText('lang_modal_installed')
                    : (getDownloadingLanguageCode() === pack.code ? getText('lang_modal_downloading') : getText('lang_modal_download'));

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
                await onDownloadLanguagePack(pack.code, { activateAfterInstall: !installed });
            };

            if (!reviewOpen && installed) {
                card.style.cursor = 'pointer';
                card.onclick = () => onSelectInstalledPack(pack.code);
            }

            refs.languagePackResults.appendChild(card);
        });
    }

    return {
        getAvailableLanguagePackUpdates,
        renderLanguagePackResults
    };
}
