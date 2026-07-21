import * as fs from 'node:fs/promises';
import { ensureDir } from '../core/shared-io';
import {
    formatStackedReleaseNotes,
    getReleaseDisplayName,
    normalizeReleaseNotesForReview,
    shouldIncludePrereleaseReleases
} from './release-utils';
import { APP_UPDATE_RELEASE_PAGE_URL } from './feed-resolver';

export const VERBOSE_UPDATE_LOG = process.env.YUMESHELF_UPDATE_DEBUG === '1';

export async function appendUpdateLog(context: any, message: string): Promise<void> {
    await ensureDir(context.updateCacheDir);
    const line = `[${new Date().toISOString()}] ${message}\n`;
    await fs.appendFile(context.updateLogFile, line, 'utf8');
}

export async function appendVerboseUpdateLog(context: any, message: string): Promise<void> {
    if (!VERBOSE_UPDATE_LOG) return;
    await appendUpdateLog(context, message);
}

export async function logDebug(context: any, message: string): Promise<void> {
    await appendVerboseUpdateLog(context, `debug ${message}`);
}

export function summarizeAppUpdate(context: any, update: any): any {
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

export async function enrichUpdateInfo(context: any, update: any, runtimeStrategy: any): Promise<any> {
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
        } catch (error: any) {
            await appendUpdateLog(context, `enrichUpdateInfo release-refresh-failed error=${String(error?.stack || error || '')}`);
        }
    }

    return enriched;
}
