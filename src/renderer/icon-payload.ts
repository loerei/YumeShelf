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

export function getGameIconUrl(exePath) {
    if (!exePath) return '';
    return `game-icon://app?path=${encodeURIComponent(exePath)}`;
}

export function renderIconMarkup(dataUrl, fit = 'contain', source = 'unknown') {
    const normalizedFit = fit === 'cover' ? 'cover' : 'contain';
    return `<img src="${dataUrl}" alt="icon" loading="lazy" draggable="false" data-icon-fit="${normalizedFit}" data-icon-source="${source}" class="fade-in-icon" style="width:100%; height:100%; object-fit:${normalizedFit}; pointer-events:none;">`;
}

export function createIconElement(dataUrl, fit = 'contain', source = 'unknown') {
    const normalizedFit = fit === 'cover' ? 'cover' : 'contain';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'icon';
    img.loading = 'lazy';
    img.draggable = false;
    img.dataset.iconFit = normalizedFit;
    img.dataset.iconSource = source;
    img.className = 'fade-in-icon';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = normalizedFit;
    img.style.pointerEvents = 'none';
    return img;
}

export function logIconRender(_context, _key, _payload, _imgElement) {
    // No-op diagnostic logger
}

// CSP-compliant event delegation for icon load and error (avoids inline handlers)
if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__yumeIconEventsBound) {
    window.__yumeIconEventsBound = true;
    document.addEventListener(
        'load',
        (event) => {
            const target = event.target as HTMLElement | null;
            if (target?.classList?.contains('fade-in-icon')) {
                target.classList.add('loaded');
            }
        },
        true
    );
    document.addEventListener(
        'error',
        (event) => {
            const target = event.target as HTMLElement | null;
            if (target?.classList?.contains('fade-in-icon')) {
                const parent = target.parentElement;
                if (parent) {
                    parent.textContent = '🎮';
                }
            }
        },
        true
    );
}

