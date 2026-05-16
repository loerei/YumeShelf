import { formatCount, formatTemplate, formatVersion } from './formatters.js';
import {
    buildAppAvailableGroup,
    createAppReadyGroup,
    createLanguagePackAvailableGroup,
    createLanguagePackInstalledGroup
} from './update-groups.js';

function buildUpdatedTitle(version, getText) {
    return formatTemplate(
        getText('post_update_notification_title', 'YumeShelf Updated to v{version}'),
        { version: formatVersion(version) }
    );
}

export function createAggregatedUpdateNotification({
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
    restartAndInstallAppUpdate,
    scheduleAppUpdateNextLaunch,
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
        updateNotificationController.present(createAppUpdateReadyNotification({
            getText,
            openUpdatesReviewModal,
            restartAndInstallAppUpdate,
            scheduleAppUpdateNextLaunch,
            update: appUpdateCheck
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
    restartAndInstallAppUpdate,
    scheduleAppUpdateNextLaunch,
    update
}) {
    const version = formatVersion(update?.version);
    return {
        eyebrow: getText('update_notification_label_ready', 'Ready to install'),
        handleLabel: getText('update_notification_handle', 'Updates'),
        message: '',
        onPrimaryAction: async () => {
            if (typeof restartAndInstallAppUpdate === 'function') {
                await restartAndInstallAppUpdate();
                return;
            }
            await openUpdatesReviewModal();
        },
        onSecondaryAction: async () => {
            if (typeof scheduleAppUpdateNextLaunch === 'function') {
                await scheduleAppUpdateNextLaunch();
                return;
            }
        },
        persistOnce: false,
        primaryLabel: getText('update_notification_restart_and_update', 'Restart and Update'),
        secondaryLabel: getText('update_notification_install_next_launch', 'Install on next launch'),
        signature: null,
        summaryItems: [
            formatTemplate(
                getText('update_notification_summary_app_ready_one', 'App update {version} is ready to install'),
                { version }
            )
        ],
        title: formatTemplate(
            getText('update_notification_app_ready_title', 'Update {version} is ready to install'),
            { version }
        )
    };
}

export function createAppUpdateScheduledNotification({
    getText,
    openUpdatesReviewModal,
    update
}) {
    const version = formatVersion(update?.version);
    return {
        eyebrow: getText('update_notification_label_scheduled', 'Scheduled'),
        handleLabel: getText('update_notification_handle', 'Updates'),
        message: '',
        onPrimaryAction: async () => {
            await openUpdatesReviewModal();
        },
        persistOnce: false,
        primaryLabel: getText('update_notification_review', 'Review updates'),
        secondaryLabel: getText('post_update_notification_dismiss', 'Dismiss'),
        signature: null,
        summaryItems: [
            formatTemplate(
                getText('update_notification_summary_app_scheduled_one', 'App update {version} will install on the next launch'),
                { version }
            )
        ],
        title: formatTemplate(
            getText('update_notification_app_scheduled_title', 'Update {version} will install on the next launch'),
            { version }
        )
    };
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

export function createPostUpdateInstalledNotification({
    getText,
    openUpdatesReviewModal,
    suppressPostUpdateNotice,
    update
}) {
    return {
        eyebrow: '',
        handleLabel: getText('post_update_notification_handle', 'Updated'),
        message: '',
        onPrimaryAction: async () => {
            await openUpdatesReviewModal({ appSectionMode: 'installed' });
        },
        onTertiaryAction: () => {
            if (typeof suppressPostUpdateNotice === 'function') {
                suppressPostUpdateNotice();
            }
        },
        persistOnce: false,
        primaryLabel: getText('post_update_notification_review', 'Review changes'),
        secondaryLabel: getText('post_update_notification_dismiss', 'Dismiss'),
        summaryItems: [],
        tertiaryLabel: getText('post_update_notification_opt_out', "Don't show again"),
        title: buildUpdatedTitle(update?.version, getText)
    };
}
