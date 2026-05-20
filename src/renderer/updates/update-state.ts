// @ts-nocheck
import { isPostUpdateNoticeSuppressed, setPostUpdateNoticeSuppressed } from '../post-update-preferences';

function normalizeUpdate(update, patch = {}) {
    if (!update || (!update.available && !update.installed)) return null;
    return {
        ...update,
        ...patch
    };
}

export function createUpdateState() {
    let currentUpdate = null;
    let recentInstalledUpdate = null;
    const listeners = new Set();

    function notifyStateChanged() {
        listeners.forEach((listener) => {
            listener({
                currentUpdate,
                recentInstalledUpdate
            });
        });
    }

    function setCurrentUpdate(update, patch = {}) {
        currentUpdate = normalizeUpdate(update, patch);
        notifyStateChanged();
        return currentUpdate;
    }

    function patchCurrentUpdate(patch = {}) {
        if (!currentUpdate) return null;
        currentUpdate = {
            ...currentUpdate,
            ...patch
        };
        notifyStateChanged();
        return currentUpdate;
    }

    function getCurrentUpdateState() {
        return currentUpdate || recentInstalledUpdate;
    }

    function getAppUpdateState(mode = 'auto') {
        if (mode === 'available') return currentUpdate;
        if (mode === 'installed') return recentInstalledUpdate;
        return currentUpdate || recentInstalledUpdate;
    }

    function setRecentInstalledUpdate(update, patch = {}) {
        recentInstalledUpdate = normalizeUpdate(update, patch);
        notifyStateChanged();
        return recentInstalledUpdate;
    }

    function suppressPostUpdateNotice() {
        setPostUpdateNoticeSuppressed(true);
        recentInstalledUpdate = null;
        notifyStateChanged();
    }

    function subscribe(listener) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    return {
        getAppUpdateState,
        getCurrentUpdateState,
        patchCurrentUpdate,
        setCurrentUpdate,
        setRecentInstalledUpdate,
        subscribe,
        suppressPostUpdateNotice
    };
}
