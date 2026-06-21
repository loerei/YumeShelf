// @ts-nocheck
import { formatCount, formatTemplate, formatVersion } from './formatters';

export function createLanguagePackAvailableGroup(updates, getText) {
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

export function createLanguagePackInstalledGroup(installedUpdates, getText) {
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

export function buildAppAvailableGroup(appUpdateCheck, getText) {
    if (!appUpdateCheck?.available) return null;
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

export function createAppReadyGroup(appUpdateCheck, getText) {
    if (!appUpdateCheck?.available || !appUpdateCheck.downloadReady) return null;
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

export function createAppScheduledGroup(appUpdateCheck, getText) {
    if (!appUpdateCheck?.available || !appUpdateCheck.downloadReady || !appUpdateCheck.deferredUntilNextLaunch) return null;
    return {
        count: 1,
        kind: 'app-scheduled',
        signaturePart: appUpdateCheck.version,
        summaryText: formatTemplate(
            getText('update_notification_summary_app_scheduled_one', 'App update {version} will install on the next launch'),
            { version: formatVersion(appUpdateCheck.version) }
        ),
        version: formatVersion(appUpdateCheck.version)
    };
}
