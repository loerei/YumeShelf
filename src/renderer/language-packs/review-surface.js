import { renderMarkdownLite } from '../markdown-lite.js';
import { formatDataSize, formatTemplate, isFinalInstallPhase } from './helpers.js';

export function setOverlayChrome({
    refs,
    getText,
    reviewMode,
    appUpdate = null
}) {
    const reviewOpen = reviewMode === 'updates-review';
    const updateOnlyFocus = reviewOpen && isFinalInstallPhase(appUpdate);
    refs.languagePackTitle.textContent = reviewOpen
        ? getText('updates_review_title', 'Review updates')
        : getText('lang_modal_title', 'Language packs');
    refs.languagePackToolbar.style.display = reviewOpen ? 'none' : 'flex';
    refs.languagePackSectionTitle.style.display = reviewOpen && !updateOnlyFocus ? 'block' : 'none';
    refs.languagePackSectionTitle.textContent = getText('updates_review_language_section_title', 'Language pack updates');
    refs.languagePackHint.textContent = reviewOpen
        ? getText('updates_review_language_hint', 'Installed language pack updates that are ready for this library.')
        : getText('lang_modal_hint');
    refs.languagePackHint.style.display = reviewOpen && updateOnlyFocus ? 'none' : 'block';
    refs.languagePackSource.style.display = reviewOpen && updateOnlyFocus ? 'none' : 'block';
}

export function renderAppUpdateReview({
    refs,
    getText,
    localeController,
    appUpdate,
    reviewMode
}) {
    const reviewOpen = reviewMode === 'updates-review';
    const installedMode = !!appUpdate?.installed || appUpdate?.actionState === 'installed';
    const updateOnlyFocus = isFinalInstallPhase(appUpdate);
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
            : appUpdate.installPhase === 'install-preparing'
                ? getText('app_update_review_status_install_preparing', 'Preparing YumeShelf for installation...')
                : appUpdate.installPhase === 'install-handoff'
                    ? getText('app_update_review_status_install_handoff', 'Handing off to the installer and restarting YumeShelf...')
                    : appUpdate.actionState === 'installing'
                        ? getText('app_update_review_status_installing', 'Closing YumeShelf and applying the update...')
                        : appUpdate.actionState === 'scheduled' || appUpdate.deferredUntilNextLaunch
                            ? getText('app_update_review_status_scheduled', 'This update will install automatically the next time you launch YumeShelf.')
                            : !appUpdate.downloadable
                                ? getText('app_update_review_status_manual', 'This update cannot be installed in place here. You can still open the download page.')
                                : appUpdate.downloadReady
                                    ? getText('app_update_review_status_ready', 'The verified update is ready. Press Restart and Update to apply it now.')
                                    : getText('app_update_review_status_available', 'Review the latest release notes, then press Update when you are ready.');
    const primaryLabel = installedMode
        ? ''
        : appUpdate.actionState === 'downloading' || appUpdate.actionState === 'installing'
            ? getText('lang_modal_downloading', 'Downloading...')
            : !appUpdate.downloadable
                ? getText('update_notification_open_download_page', 'Open download page')
                : appUpdate.downloadReady
                    ? getText('update_notification_restart_and_update', 'Restart and Update')
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
        ${(!installedMode && appUpdate.downloadReady && !appUpdate.deferredUntilNextLaunch) ? `<span class="language-pack-chip">${getText('update_notification_label_ready', 'Ready to install')}</span>` : ''}
        ${(!installedMode && appUpdate.deferredUntilNextLaunch) ? `<span class="language-pack-chip">${getText('update_notification_label_scheduled', 'Scheduled')}</span>` : ''}
    `;
    refs.appUpdateReviewNotes.innerHTML = renderMarkdownLite(
        appUpdate.releaseNotes || getText('app_update_review_notes_unavailable', 'Release notes are unavailable right now.')
    );

    if (appUpdate.actionState === 'downloading' && appUpdate.progress) {
        const { percent, bytesPerSecond } = appUpdate.progress;
        refs.appUpdateProgressContainer.style.display = 'block';
        refs.appUpdateProgressFill.style.width = `${percent}%`;
        refs.appUpdateProgressPercent.textContent = `${percent}%`;
        refs.appUpdateProgressSpeed.textContent = `${formatDataSize(bytesPerSecond)}/s`;

        refs.appUpdateReviewStatus.textContent = getText('app_update_review_status_downloading', 'Downloading update...');
    } else {
        refs.appUpdateProgressContainer.style.display = 'none';
    }

    refs.appUpdateReviewActionBtn.style.display = installedMode || updateOnlyFocus ? 'none' : 'inline-flex';
    refs.appUpdateReviewActionBtn.textContent = primaryLabel;
    refs.appUpdateReviewActionBtn.disabled = appUpdate.actionState === 'downloading' || appUpdate.actionState === 'installing';
    refs.appUpdateReviewOptOutBtn.style.display = installedMode && !updateOnlyFocus ? 'inline-flex' : 'none';
    refs.appUpdateReviewOptOutBtn.textContent = getText('post_update_notification_opt_out', "Don't show again");
}
