const AUTO_COLLAPSE_MS = 12000;
const SEEN_SIGNATURES_STORAGE_KEY = 'yumeshelf_seen_update_notification_signatures';

function readSeenSignatures() {
    try {
        const raw = JSON.parse(localStorage.getItem(SEEN_SIGNATURES_STORAGE_KEY) || '[]');
        return Array.isArray(raw) ? raw.filter(Boolean) : [];
    } catch {
        return [];
    }
}

function writeSeenSignatures(signatures) {
    localStorage.setItem(SEEN_SIGNATURES_STORAGE_KEY, JSON.stringify(signatures.slice(-30)));
}

export function createUpdateNotificationController({
    refs
}) {
    let activeNotification = null;
    let collapseTimer = null;
    let seenSignatures = readSeenSignatures();

    function clearCollapseTimer() {
        if (collapseTimer) {
            clearTimeout(collapseTimer);
            collapseTimer = null;
        }
    }

    function hideAll() {
        clearCollapseTimer();
        refs.host.dataset.state = 'hidden';
        refs.card.style.display = 'none';
        refs.handle.style.display = 'none';
    }

    function markSignatureSeen(signature) {
        if (!signature || seenSignatures.includes(signature)) return;
        seenSignatures = [...seenSignatures, signature];
        writeSeenSignatures(seenSignatures);
    }

    function renderExpanded() {
        if (!activeNotification) {
            hideAll();
            return;
        }

        refs.host.dataset.state = 'expanded';
        refs.eyebrow.textContent = activeNotification.eyebrow || '';
        refs.eyebrow.style.display = activeNotification.eyebrow ? 'inline-flex' : 'none';
        refs.title.textContent = activeNotification.title;
        refs.message.textContent = activeNotification.message || '';
        refs.message.style.display = activeNotification.message ? 'block' : 'none';
        refs.summary.innerHTML = '';
        (activeNotification.summaryItems || []).forEach((item) => {
            const row = document.createElement('li');
            row.textContent = item;
            refs.summary.appendChild(row);
        });
        refs.primaryBtn.textContent = activeNotification.primaryLabel;
        refs.laterBtn.textContent = activeNotification.secondaryLabel;
        refs.tertiaryBtn.textContent = activeNotification.tertiaryLabel || '';
        refs.tertiaryBtn.style.display = activeNotification.tertiaryLabel ? 'inline-flex' : 'none';
        refs.handle.textContent = activeNotification.handleLabel;
        refs.card.style.display = 'flex';
        refs.handle.style.display = 'none';
    }

    function collapseActiveNotification() {
        if (!activeNotification) return;
        clearCollapseTimer();
        refs.host.dataset.state = 'collapsed';
        refs.card.style.display = 'none';
        refs.handle.textContent = activeNotification.handleLabel;
        refs.handle.style.display = 'inline-flex';
    }

    function scheduleAutoCollapse() {
        if (!activeNotification) return;
        clearCollapseTimer();
        collapseTimer = setTimeout(() => {
            collapseActiveNotification();
        }, AUTO_COLLAPSE_MS);
    }

    function expandActiveNotification() {
        if (!activeNotification) return;
        renderExpanded();
        scheduleAutoCollapse();
    }

    function shouldSkip(notification) {
        return Boolean(notification.persistOnce && notification.signature && seenSignatures.includes(notification.signature));
    }

    function present(notification) {
        if (!notification || shouldSkip(notification)) return false;

        activeNotification = notification;
        if (notification.persistOnce && notification.signature) {
            markSignatureSeen(notification.signature);
        }
        renderExpanded();
        scheduleAutoCollapse();
        return true;
    }

    function clear() {
        activeNotification = null;
        hideAll();
    }

    async function handlePrimaryAction() {
        if (!activeNotification || typeof activeNotification.onPrimaryAction !== 'function') return;
        await activeNotification.onPrimaryAction();
        collapseActiveNotification();
    }

    function handleSecondaryAction() {
        collapseActiveNotification();
    }

    function handleDismissAction() {
        collapseActiveNotification();
    }

    async function handleTertiaryAction() {
        if (!activeNotification || typeof activeNotification.onTertiaryAction !== 'function') {
            return;
        }
        await activeNotification.onTertiaryAction();
        clear();
    }

    refs.primaryBtn.onclick = () => {
        void handlePrimaryAction();
    };
    refs.laterBtn.onclick = handleSecondaryAction;
    refs.tertiaryBtn.onclick = () => {
        void handleTertiaryAction();
    };
    refs.dismissBtn.onclick = handleDismissAction;
    refs.handle.onclick = expandActiveNotification;
    refs.card.addEventListener('mouseenter', clearCollapseTimer);
    refs.card.addEventListener('mouseleave', () => {
        if (refs.host.dataset.state === 'expanded') {
            scheduleAutoCollapse();
        }
    });

    hideAll();

    return {
        clear,
        collapseActiveNotification,
        expandActiveNotification,
        present
    };
}
