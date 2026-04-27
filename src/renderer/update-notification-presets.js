function formatTemplate(template, replacements = {}) {
    return Object.entries(replacements).reduce((result, [key, value]) => {
        return result.replaceAll(`{${key}}`, value);
    }, template);
}

function formatCount(count) {
    return String(Math.max(0, Number(count) || 0));
}

function createLanguagePackAvailableGroup(updates, getText) {
    const count = updates.length;
    return {
        count,
        kind: 'language-pack',
        summaryText: count === 1
            ? getText('update_notification_summary_language_pack_available_one', '1 language pack update')
            : formatTemplate(
                getText('update_notification_summary_language_pack_available_many', '{count} language pack updates'),
                { count: formatCount(count) }
            )
    };
}

function createLanguagePackInstalledGroup(installedUpdates, getText) {
    const count = installedUpdates.length;
    return {
        count,
        kind: 'language-pack',
        signaturePart: installedUpdates
            .map(update => `${update.code}@${update.nextPackVersion}`)
            .sort()
            .join(','),
        summaryText: count === 1
            ? getText('update_notification_summary_language_pack_installed_one', '1 language pack updated')
            : formatTemplate(
                getText('update_notification_summary_language_pack_installed_many', '{count} language pack updates installed'),
                { count: formatCount(count) }
            )
    };
}

function buildAppAvailableGroup(appUpdateCheck, getText) {
    if (!appUpdateCheck || !appUpdateCheck.available) return null;
    const count = Math.max(1, Number(appUpdateCheck.count) || 1);
    return {
        count,
        kind: 'app',
        summaryText: count === 1
            ? getText('update_notification_summary_app_available_one', '1 app update available')
            : formatTemplate(
                getText('update_notification_summary_app_available_many', '{count} app updates available'),
                { count: formatCount(count) }
            )
    };
}

function createAggregatedUpdateNotification({
    groups,
    mode = 'notify',
    getText,
    openLanguagePackModal,
    openSettings
}) {
    const totalCount = groups.reduce((sum, group) => sum + group.count, 0);
    const installedMode = mode === 'automatic-installed';
    const title = installedMode
        ? (
            totalCount === 1
                ? formatTemplate(
                    getText('update_notification_title_installed_one', '{count} update finished automatically'),
                    { count: formatCount(totalCount) }
                )
                : formatTemplate(
                    getText('update_notification_title_installed_many', '{count} updates finished automatically'),
                    { count: formatCount(totalCount) }
                )
        )
        : (
            totalCount === 1
                ? formatTemplate(
                    getText('update_notification_title_available_one', '{count} update is ready'),
                    { count: formatCount(totalCount) }
                )
                : formatTemplate(
                    getText('update_notification_title_available_many', '{count} updates are ready'),
                    { count: formatCount(totalCount) }
                )
        );
    const hasLanguagePackGroup = groups.some(group => group.kind === 'language-pack');

    return {
        eyebrow: installedMode
            ? getText('update_notification_label_installed', 'Updated automatically')
            : getText('update_notification_label_available', 'Update available'),
        handleLabel: getText('update_notification_handle', 'Updates'),
        message: '',
        onPrimaryAction: async () => {
            if (hasLanguagePackGroup) {
                await openLanguagePackModal({
                    bannerMessage: installedMode
                        ? getText('lang_modal_downloaded', 'Language pack installed and applied.')
                        : getText('lang_modal_updates_available_banner', 'Language pack updates are available for your installed languages.'),
                    showAll: true
                });
                return;
            }
            openSettings();
        },
        persistOnce: installedMode,
        primaryLabel: installedMode
            ? getText('update_notification_view', 'View updates')
            : getText('update_notification_review', 'Review updates'),
        secondaryLabel: getText('update_notification_later', 'Remind later'),
        signature: installedMode
            ? `updates:auto:${groups.map(group => `${group.kind}:${group.signaturePart || group.summaryText}`).sort().join('|')}`
            : null,
        summaryItems: groups.map(group => group.summaryText),
        title
    };
}

export function presentBootUpdateNotifications({
    bootstrapData,
    getText,
    openLanguagePackModal,
    openSettings,
    updateNotificationController
}) {
    if (!bootstrapData || !bootstrapData.bootChecks) return;
    const { bootChecks } = bootstrapData;
    const languagePackCheck = bootChecks.languagePackCheck || null;
    const appUpdateCheck = bootChecks.appUpdateCheck || null;

    const automaticGroups = [];
    if (
        bootChecks.languagePackUpdatesMode === 'automatic'
        && languagePackCheck
        && Array.isArray(languagePackCheck.installedUpdates)
        && languagePackCheck.installedUpdates.length > 0
    ) {
        automaticGroups.push(createLanguagePackInstalledGroup(languagePackCheck.installedUpdates, getText));
    }
    if (automaticGroups.length > 0) {
        updateNotificationController.present(createAggregatedUpdateNotification({
            getText,
            groups: automaticGroups,
            mode: 'automatic-installed',
            openLanguagePackModal,
            openSettings
        }));
        return;
    }

    const notifyGroups = [];
    if (
        bootChecks.languagePackUpdatesMode === 'notify'
        && languagePackCheck
        && Array.isArray(languagePackCheck.availableUpdates)
        && languagePackCheck.availableUpdates.length > 0
    ) {
        notifyGroups.push(createLanguagePackAvailableGroup(languagePackCheck.availableUpdates, getText));
    }
    if (bootChecks.appUpdatesMode === 'notify') {
        const appGroup = buildAppAvailableGroup(appUpdateCheck, getText);
        if (appGroup) notifyGroups.push(appGroup);
    }

    if (notifyGroups.length > 0) {
        updateNotificationController.present(createAggregatedUpdateNotification({
            getText,
            groups: notifyGroups,
            mode: 'notify',
            openLanguagePackModal,
            openSettings
        }));
    }
}
