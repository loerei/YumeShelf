function formatTemplate(template, replacements = {}) {
    return Object.entries(replacements).reduce((result, [key, value]) => {
        return result.replaceAll(`{${key}}`, value);
    }, template);
}

function formatCount(count) {
    return String(Math.max(0, Number(count) || 0));
}

function formatVersion(version) {
    return String(version || '').trim();
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
    return {
        count: 1,
        kind: 'app',
        summaryText: appUpdateCheck.downloadable
            ? formatTemplate(
                getText('update_notification_summary_app_available_one', 'App update {version} is available'),
                { version: formatVersion(appUpdateCheck.version) }
            )
            : formatTemplate(
                getText('update_notification_summary_app_manual_one', 'App update {version} needs a manual download'),
                { version: formatVersion(appUpdateCheck.version) }
            )
    };
}

function createAppReadyGroup(appUpdateCheck, getText) {
    if (!appUpdateCheck || !appUpdateCheck.available || !appUpdateCheck.downloadReady) return null;
    return {
        count: 1,
        kind: 'app-ready',
        signaturePart: appUpdateCheck.version,
        summaryText: formatTemplate(
            getText('update_notification_summary_app_ready_one', 'App update {version} is ready to install'),
            { version: formatVersion(appUpdateCheck.version) }
        ),
        version: formatVersion(appUpdateCheck.version)
    };
}

function createAggregatedUpdateNotification({
    groups,
    mode = 'notify',
    getText,
    openUpdatesReviewModal,
    titleOverride = ''
}) {
    const totalCount = groups.reduce((sum, group) => sum + group.count, 0);
    const installedMode = mode === 'automatic-installed';
    const appReadyGroup = groups.find(group => group.kind === 'app-ready');
    const title = titleOverride || (installedMode
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
        ));

    return {
        eyebrow: appReadyGroup
            ? getText('update_notification_label_ready', 'Ready to install')
            : installedMode
            ? getText('update_notification_label_installed', 'Updated automatically')
            : getText('update_notification_label_available', 'Update available'),
        handleLabel: getText('update_notification_handle', 'Updates'),
        message: '',
        onPrimaryAction: async () => {
            await openUpdatesReviewModal();
        },
        persistOnce: installedMode,
        primaryLabel: getText('update_notification_review', 'Review updates'),
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
    openUpdatesReviewModal,
    updateNotificationController
}) {
    if (!bootstrapData || !bootstrapData.bootChecks) return;
    const { bootChecks } = bootstrapData;
    const languagePackCheck = bootChecks.languagePackCheck || null;
    const appUpdateCheck = bootChecks.appUpdateCheck || null;

    const appReadyGroup = createAppReadyGroup(appUpdateCheck, getText);
    const automaticGroups = [];
    if (
        bootChecks.languagePackUpdatesMode === 'automatic'
        && languagePackCheck
        && Array.isArray(languagePackCheck.installedUpdates)
        && languagePackCheck.installedUpdates.length > 0
    ) {
        automaticGroups.push(createLanguagePackInstalledGroup(languagePackCheck.installedUpdates, getText));
    }
    if (appReadyGroup) {
        updateNotificationController.present(createAggregatedUpdateNotification({
            getText,
            groups: [appReadyGroup, ...automaticGroups],
            mode: 'notify',
            openUpdatesReviewModal
        }));
        return;
    }

    if (automaticGroups.length > 0) {
        updateNotificationController.present(createAggregatedUpdateNotification({
            getText,
            groups: automaticGroups,
            mode: 'automatic-installed',
            openUpdatesReviewModal
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
    if (
        bootChecks.appUpdatesMode === 'notify'
        || (
            bootChecks.appUpdatesMode === 'automatic'
            && appUpdateCheck
            && appUpdateCheck.available
            && !appUpdateCheck.downloadable
        )
    ) {
        const appGroup = buildAppAvailableGroup(appUpdateCheck, getText);
        if (appGroup) notifyGroups.push(appGroup);
    }

    if (notifyGroups.length > 0) {
        updateNotificationController.present(createAggregatedUpdateNotification({
            getText,
            groups: notifyGroups,
            mode: 'notify',
            openUpdatesReviewModal
        }));
    }
}

export function createAppUpdateReadyNotification({
    getText,
    openUpdatesReviewModal,
    update
}) {
    const version = formatVersion(update?.version);
    return createAggregatedUpdateNotification({
        getText,
        groups: [createAppReadyGroup(update, getText)],
        mode: 'notify',
        openUpdatesReviewModal,
        titleOverride: formatTemplate(
            getText('update_notification_app_ready_title', 'Update {version} is ready to install'),
            { version }
        )
    });
}

export function createAppUpdateDownloadFailedNotification({
    getText,
    openUpdatesReviewModal,
    update
}) {
    const version = formatVersion(update?.version);
    return {
        eyebrow: getText('update_notification_label_available', 'Update available'),
        handleLabel: getText('update_notification_handle', 'Updates'),
        message: '',
        onPrimaryAction: async () => {
            await openUpdatesReviewModal();
        },
        persistOnce: false,
        primaryLabel: getText('update_notification_review', 'Review updates'),
        secondaryLabel: getText('update_notification_later', 'Remind later'),
        signature: null,
        summaryItems: [
            formatTemplate(
                getText('update_notification_summary_app_manual_one', 'App update {version} needs a manual download'),
                { version }
            )
        ],
        title: formatTemplate(
            getText('update_notification_app_manual_title', 'Update {version} needs a manual download'),
            { version }
        )
    };
}
