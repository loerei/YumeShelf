// @ts-nocheck
export function normalizeIconPayload(payload) {
    if (!payload) {
        return null;
    }
    if (typeof payload === 'string') {
        return {
            dataUrl: payload,
            fit: 'contain',
            source: 'legacy-string',
            debug: null
        };
    }
    if (typeof payload === 'object' && typeof payload.dataUrl === 'string') {
        return {
            dataUrl: payload.dataUrl,
            fit: payload.fit === 'cover' ? 'cover' : 'contain',
            source: typeof payload.source === 'string' ? payload.source : 'unknown',
            debug: payload.debug || null
        };
    }
    return null;
}

export function ensureIconCache() {
    if (!globalThis.iconCache) {
        globalThis.iconCache = new Map();
    }
    return globalThis.iconCache;
}

export function applyIconPayload(target, payload) {
    const normalized = normalizeIconPayload(payload);
    if (!normalized) {
        return null;
    }
    target.iconData = normalized.dataUrl;
    target.iconFit = normalized.fit;
    target.iconSource = normalized.source;
    target.iconDebug = normalized.debug;
    return normalized;
}

export function readCachedIconPayload(exePath) {
    const cache = ensureIconCache();
    return normalizeIconPayload(cache.get(exePath));
}

export function cacheIconPayload(exePath, payload) {
    const normalized = normalizeIconPayload(payload);
    if (!normalized) {
        return null;
    }
    ensureIconCache().set(exePath, normalized);
    return normalized;
}

export function renderIconMarkup(dataUrl, fit = 'contain', source = 'unknown') {
    const normalizedFit = fit === 'cover' ? 'cover' : 'contain';
    return `<img src="${dataUrl}" alt="icon" draggable="false" data-icon-fit="${normalizedFit}" data-icon-source="${source}" style="width:100%; height:100%; object-fit:${normalizedFit}; pointer-events:none;">`;
}

export function logIconRender(context, key, payload, imgElement) {
    void context;
    void key;
    void payload;
    void imgElement;
}
