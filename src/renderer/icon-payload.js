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
    const normalized = normalizeIconPayload(payload);
    if (!normalized) {
        console.log(`[FRONTEND][ICON] ${context} key=${key} payload=missing`);
        return;
    }

    const debugText = normalized.debug ? JSON.stringify(normalized.debug) : 'null';
    console.log(
        `[FRONTEND][ICON] ${context} key=${key} source=${normalized.source} fit=${normalized.fit} hasDebug=${normalized.debug ? 'true' : 'false'} debug=${debugText}`
    );

    if (!imgElement) {
        return;
    }

    const logDimensions = () => {
        console.log(
            `[FRONTEND][ICON] ${context} key=${key} rendered natural=${imgElement.naturalWidth}x${imgElement.naturalHeight} client=${imgElement.clientWidth}x${imgElement.clientHeight} dataFit=${imgElement.dataset.iconFit || ''} dataSource=${imgElement.dataset.iconSource || ''}`
        );
    };

    if (imgElement.complete) {
        logDimensions();
        return;
    }

    imgElement.addEventListener('load', logDimensions, { once: true });
}
