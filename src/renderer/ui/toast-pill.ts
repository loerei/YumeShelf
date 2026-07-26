let toastHost: HTMLElement | null = null;
let toastText: HTMLElement | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function initToastPill(container?: HTMLElement | null): void {
    toastHost = container || document.getElementById('toast-pill-host');
    toastText = document.getElementById('toast-pill-text');
}

export function showToastPill(message: string, durationMs = 3000): void {
    toastHost ??= document.getElementById('toast-pill-host');
    toastText ??= document.getElementById('toast-pill-text');

    if (!toastHost || !toastText) return;

    toastText.textContent = message;

    if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
    }
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }

    toastHost.style.display = 'flex';
    // Trigger reflow
    const _reflow = toastHost.offsetWidth;
    toastHost.classList.remove('toast-pill-hiding');
    toastHost.classList.add('toast-pill-visible');

    dismissTimer = setTimeout(() => {
        if (!toastHost) return;
        toastHost.classList.remove('toast-pill-visible');
        toastHost.classList.add('toast-pill-hiding');

        hideTimer = setTimeout(() => {
            if (toastHost?.classList.contains('toast-pill-hiding')) {
                toastHost.style.display = 'none';
                toastHost.classList.remove('toast-pill-hiding');
            }
            hideTimer = null;
        }, 320);
        dismissTimer = null;
    }, durationMs);
}
