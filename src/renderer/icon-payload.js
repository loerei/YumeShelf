export function normalizeIconPayload(payload) {
    if (!payload) {
        return null;
    }
    if (typeof payload === 'string') {
        return {
            dataUrl: payload,
            fit: 'contain'
        };
    }
    if (typeof payload === 'object' && typeof payload.dataUrl === 'string') {
        return {
            dataUrl: payload.dataUrl,
            fit: payload.fit === 'cover' ? 'cover' : 'contain'
        };
    }
    return null;
}

export function ensureIconCache() {
    if (!window.iconCache) {
        window.iconCache = new Map();
    }
    return window.iconCache;
}

export function applyIconPayload(target, payload) {
    const normalized = normalizeIconPayload(payload);
    if (!normalized) {
        return null;
    }
    target.iconData = normalized.dataUrl;
    target.iconFit = normalized.fit;
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

export function renderIconMarkup(dataUrl, fit = 'contain') {
    const normalizedFit = fit === 'cover' ? 'cover' : 'contain';
    return `<img src="${dataUrl}" alt="icon" draggable="false" style="width:100%; height:100%; object-fit:${normalizedFit}; pointer-events:none;">`;
}
