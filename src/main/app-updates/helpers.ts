// @ts-nocheck
const fs = require('fs/promises');
const path = require('path');
const { ensureDir } = require('../core/shared-io');
const {
    formatStackedReleaseNotes,
    getReleaseDisplayName,
    normalizeReleaseNotesForReview,
    shouldIncludePrereleaseReleases
} = require('./release-utils');
const { APP_UPDATE_RELEASE_PAGE_URL } = require('./feed-resolver');

const VERBOSE_UPDATE_LOG = process.env.YUMESHELF_UPDATE_DEBUG === '1';

async function appendUpdateLog(context, message) {
    await ensureDir(context.updateCacheDir);
    const line = `[${new Date().toISOString()}] ${message}\n`;
    await fs.appendFile(context.updateLogFile, line, 'utf8');
}

async function appendVerboseUpdateLog(context, message) {
    if (!VERBOSE_UPDATE_LOG) return;
    await appendUpdateLog(context, message);
}

async function logDebug(context, message) {
    await appendVerboseUpdateLog(context, `debug ${message}`);
}

function summarizeAppUpdate(context, update) {
    return context.nsisUpdaterService.summarizeUpdateState({
        available: !!update?.available,
        canSelfUpdate: !!update?.canSelfUpdate,
        deferredUntilNextLaunch: !!update?.deferredUntilNextLaunch,
        downloadable: !!update?.downloadable,
        downloadReady: !!update?.downloadReady,
        releaseName: update?.releaseName ? String(update.releaseName) : '',
        releaseNotes: normalizeReleaseNotesForReview(update?.releaseNotes || ''),
        releaseUrl: update?.releaseUrl ? String(update.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
        selfApplicable: !!update?.selfApplicable,
        version: update?.version ? String(update.version) : ''
    });
}

async function enrichUpdateInfo(context, update, runtimeStrategy) {
    const enriched = {
        ...update,
        available: !!update?.available,
        canSelfUpdate: !!update?.canSelfUpdate,
        deferredUntilNextLaunch: !!update?.deferredUntilNextLaunch,
        downloadable: !!update?.downloadable,
        downloadReady: !!update?.downloadReady,
        fallbackReason: update?.fallbackReason ? String(update.fallbackReason) : null,
        releaseName: update?.releaseName ? String(update.releaseName) : '',
        releaseNotes: normalizeReleaseNotesForReview(update?.releaseNotes || ''),
        releaseUrl: update?.releaseUrl ? String(update.releaseUrl) : APP_UPDATE_RELEASE_PAGE_URL,
        selfApplicable: !!update?.selfApplicable,
        source: update?.source ? String(update.source) : runtimeStrategy.channel,
        version: update?.version ? String(update.version) : null
    };

    if (!enriched.available || !enriched.version) {
        return enriched;
    }

    if (runtimeStrategy.channel === 'nsis') {
        try {
            const newerReleases = await context.resolver.resolveNewerReleases(
                context.app.getVersion(),
                enriched.version,
                { includePrerelease: shouldIncludePrereleaseReleases(context.app.getVersion(), enriched.version) }
            );
            if (newerReleases.length > 0) {
                enriched.releaseName = getReleaseDisplayName(newerReleases[0]);
                enriched.releaseNotes = formatStackedReleaseNotes(newerReleases);
                enriched.releaseUrl = newerReleases[0].htmlUrl || enriched.releaseUrl;
            }
        } catch (error) {
            await appendUpdateLog(context, `enrichUpdateInfo release-refresh-failed error=${String((error && error.stack) || error || '')}`);
        }
    }

    return enriched;
}

module.exports = {
    appendUpdateLog,
    appendVerboseUpdateLog,
    logDebug,
    summarizeAppUpdate,
    enrichUpdateInfo
};
