// @ts-nocheck
import smugFaceImg from '../../../assets/yume_smug.png';
import bonkedFaceImg from '../../../assets/yume_bonked.png';
import bonkedTooMuchFaceImg from '../../../assets/yume_bonkedtoomuch.png';

const CARD_IMAGES = {
    smug: smugFaceImg,
    bonked: bonkedFaceImg,
    bonkedTooMuch: bonkedTooMuchFaceImg
};

const DEFAULT_TITLES = [
    'Yume-chan',
    'Prestigious Yume-chan',
    'Admired Yume-chan',
    'Yume-sama',
    'Your Highness',
    'Yume-chama',
    '?????',
    'Maou-chama',
    'Hahahahahha'
];

const DEFAULT_IDLE_QUOTES = [
    'Zaako~',
    'Zaako!',
    'Oiiiiiiii',
    'Want some snacks?',
    'You know how a lot of laughing turns into grass?',
    'Stay Young Beautiful And Unique',
    'Why am I talking to a fish?',
    'Teto is 31yo',
    'CUWAYO!',
    'Cuwayo~ cuwayo~',
    'Sakanaaaaa~'
];

const DEFAULT_BONK_QUOTES = [
    'OIIIIIIII!!!',
    'Ugh!',
    'Poor me :(',
    'Gah-',
    'My braincells!',
    'You can do better than cyberbullying me :(',
    'Bold of you!',
    '@@',
    '???'
];

export const MASCOT_CARD_KEY = 'yumeshelf_mascot_card';

export function getNextShuffledIndex(storageKey: string, totalCount: number): number {
    if (totalCount <= 1) return 0;
    let deck: number[] = [];
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number' && n >= 0 && n < totalCount)) {
                deck = parsed;
            }
        }
    } catch {
        deck = [];
    }

    if (deck.length === 0) {
        deck = Array.from({ length: totalCount }, (_, i) => i);
        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    const nextIndex = deck.pop()!;
    try {
        localStorage.setItem(storageKey, JSON.stringify(deck));
    } catch {
        // Fallback safe
    }
    return nextIndex;
}

export interface HideAndSeekControllerOptions {
    mascotWidget: any;
    getStrings: () => any;
    getLanguage?: () => string;
    onBonk?: (quote: string) => void;
    onRecoverSmug?: () => void;
    onRerenderRequested?: () => void;
}

export function createHideAndSeekController({
    mascotWidget,
    getStrings,
    getLanguage,
    onBonk,
    onRecoverSmug,
    onRerenderRequested
}: HideAndSeekControllerOptions) {
    // Session state
    const threshold = Math.floor(Math.random() * 6) + 5; // 5..10 clicks
    const isStarred = Math.random() < 0.5;
    const titleIndex = getNextShuffledIndex('yumeshelf_deck_card_titles', DEFAULT_TITLES.length);
    let randomIndexPosition: number | null = null;
    let isDismissed = false;

    let currentStreak = 0;
    let accumulatedCooldownMs = 3000;
    let cardMascotState: 'smug' | 'bonked' | 'bonkedTooMuch' = 'smug';
    let currentQuote: string = '';
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let secondaryRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let cardAnimTimer: ReturnType<typeof setTimeout> | null = null;
    let idleRotateTimer: ReturnType<typeof setInterval> | null = null;
    let activeCardQuoteEl: HTMLElement | null = null;

    function startIdleRotation(quoteEl?: HTMLElement | null) {
        if (quoteEl) {
            activeCardQuoteEl = quoteEl;
        }
        stopIdleRotation();
        idleRotateTimer = setInterval(() => {
            if (cardMascotState === 'smug' && !isDismissed && activeCardQuoteEl) {
                currentQuote = getRandomIdleQuote();
                activeCardQuoteEl.style.opacity = '0';
                setTimeout(() => {
                    if (cardMascotState === 'smug' && activeCardQuoteEl) {
                        activeCardQuoteEl.textContent = currentQuote;
                        activeCardQuoteEl.style.opacity = '1';
                    }
                }, 200);
            }
        }, 10000);
    }

    function stopIdleRotation() {
        if (idleRotateTimer) {
            clearInterval(idleRotateTimer);
            idleRotateTimer = null;
        }
    }

    function getCardTitle(): string {
        const d = typeof getStrings === 'function' ? getStrings() : {};
        const pool = Array.isArray(d?.mascot_card_titles) && d.mascot_card_titles.length > 0 ? d.mascot_card_titles : DEFAULT_TITLES;
        return pool[titleIndex % pool.length] || 'Yume-chan';
    }

    function getRandomIdleQuote(): string {
        const d = typeof getStrings === 'function' ? getStrings() : {};
        const pool = Array.isArray(d?.mascot_card_idle_quotes) && d.mascot_card_idle_quotes.length > 0 ? d.mascot_card_idle_quotes : DEFAULT_IDLE_QUOTES;
        const index = getNextShuffledIndex('yumeshelf_deck_card_idle_quotes', pool.length);
        return pool[index % pool.length] || 'Zaako~';
    }

    function getRandomBonkedQuote(): string {
        const d = typeof getStrings === 'function' ? getStrings() : {};
        const pool = Array.isArray(d?.mascot_bonk_quotes) && d.mascot_bonk_quotes.length > 0 ? d.mascot_bonk_quotes : DEFAULT_BONK_QUOTES;
        const index = getNextShuffledIndex('yumeshelf_deck_bonked_quotes', pool.length);
        return pool[index % pool.length] || 'OIIIIIIII!!!';
    }

    // Initialize initial quote
    currentQuote = getRandomIdleQuote();

    function isEnabled(): boolean {
        return localStorage.getItem('yumeshelf_hide_and_seek') === 'yeaaa';
    }

    function isCardActive(): boolean {
        return isEnabled() && !isDismissed;
    }

    function setSetting(enabled: boolean) {
        localStorage.setItem('yumeshelf_hide_and_seek', enabled ? 'yeaaa' : 'out');
        if (enabled) {
            if (!isDismissed) {
                mascotWidget?.hide?.();
            }
        } else {
            const showPref = localStorage.getItem('yumeshelf_mascot_show') !== 'off';
            if (showPref) {
                mascotWidget?.show?.();
            }
        }
        if (typeof onRerenderRequested === 'function') {
            onRerenderRequested();
        }
    }

    function clearCardTimers() {
        stopIdleRotation();
        if (dismissTimer) {
            clearTimeout(dismissTimer);
            dismissTimer = null;
        }
        if (recoveryTimer) {
            clearTimeout(recoveryTimer);
            recoveryTimer = null;
        }
        if (secondaryRecoveryTimer) {
            clearTimeout(secondaryRecoveryTimer);
            secondaryRecoveryTimer = null;
        }
    }

    function getMascotCardItem(): any {
        return {
            id: MASCOT_CARD_KEY,
            key: MASCOT_CARD_KEY,
            name: getCardTitle(),
            favorite: isStarred,
            isMascotCard: true,
            iconData: null,
            playtime: 0,
            lastPlayed: 0
        };
    }

    function injectCardIntoItems(items: any[]): any[] {
        if (!isCardActive()) {
            return items;
        }

        const mascotItem = getMascotCardItem();
        if (items.length === 0) {
            return [mascotItem];
        }

        // Clamp random insertion index into range [0, items.length]
        if (randomIndexPosition === null || randomIndexPosition > items.length) {
            randomIndexPosition = Math.floor(Math.random() * (items.length + 1));
        }

        const result = [...items];
        result.splice(randomIndexPosition, 0, mascotItem);
        return result;
    }

    function getFormattedBonkStatus(): string {
        const d = typeof getStrings === 'function' ? getStrings() : {};
        const count = parseInt(localStorage.getItem('yumeshelf_mascot_bonk_count') || '0', 10);
        if (count === 0) {
            return d.never_bonked || 'Never bonked';
        }
        if (count === 1 && d.mascot_menu_bonked_count_one) {
            return d.mascot_menu_bonked_count_one;
        }
        if (d.mascot_menu_bonked_count) {
            return d.mascot_menu_bonked_count.replace('{count}', String(count));
        }
        return `Bonked ${count} times`;
    }

    function createMascotCardElement(item: any): HTMLElement {
        const d = typeof getStrings === 'function' ? getStrings() : {};
        const card = document.createElement('div');
        card.className = `game-card mascot-game-card ${item.favorite ? 'favorited' : ''}`;
        card.dataset.gameKey = MASCOT_CARD_KEY;
        card.draggable = false;

        const nothingHereText = d.card_nothing_here || 'Nothing here~';

        card.innerHTML = `
            <div class="fav-btn ${item.favorite ? 'active' : ''}">★</div>
            <div class="menu-btn"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
            <div class="dropdown-menu">
                <div class="dropdown-item non-actionable"><span>${nothingHereText}</span></div>
            </div>
            <div class="game-icon mascot-card-icon-container">
                <img src="${CARD_IMAGES[cardMascotState]}" class="mascot-card-img" alt="Yume-chan" draggable="false" />
            </div>
            <div class="game-title">${getCardTitle()}</div>
            <div class="game-status mascot-card-status">${getFormattedBonkStatus()}</div>
            <div class="game-playtime mascot-card-quote">${currentQuote}</div>
        `;

        const menuBtn = card.querySelector('.menu-btn') as HTMLElement;
        const dropdownMenu = card.querySelector('.dropdown-menu') as HTMLElement;
        const iconImg = card.querySelector('.mascot-card-img') as HTMLImageElement;
        const statusEl = card.querySelector('.mascot-card-status') as HTMLElement;
        const quoteEl = card.querySelector('.mascot-card-quote') as HTMLElement;

        if (menuBtn && dropdownMenu) {
            menuBtn.onclick = (e) => {
                e.stopPropagation();
                dropdownMenu.classList.toggle('show');
            };
        }

        // Close dropdown on click outside
        const closeMenuHandler = (e: MouseEvent) => {
            if (!card.contains(e.target as Node)) {
                dropdownMenu?.classList.remove('show');
            }
        };
        document.addEventListener('click', closeMenuHandler);

        // Bonk handler for the card
        const handleCardBonk = (event: MouseEvent) => {
            if ((event.target as HTMLElement).closest('.menu-btn, .dropdown-menu')) {
                return;
            }
            event.stopPropagation();
            event.preventDefault();

            clearCardTimers();
            currentStreak += 1;
            accumulatedCooldownMs = Math.min(10000, accumulatedCooldownMs + 1000);

            // Audio & impact particle
            mascotWidget?.playBonkSound?.();
            mascotWidget?.spawnBonkImpact?.(event.clientX, event.clientY);

            // Increment persistent counter
            const prev = parseInt(localStorage.getItem('yumeshelf_mascot_bonk_count') || '0', 10);
            localStorage.setItem('yumeshelf_mascot_bonk_count', String(prev + 1));

            // Quote & image update
            currentQuote = getRandomBonkedQuote();
            if (typeof onBonk === 'function') {
                onBonk(currentQuote);
            }
            cardMascotState = currentStreak >= 3 ? 'bonkedTooMuch' : 'bonked';
            if (iconImg) {
                iconImg.src = CARD_IMAGES[cardMascotState];
            }
            if (statusEl) {
                statusEl.textContent = getFormattedBonkStatus();
            }
            if (quoteEl) {
                quoteEl.textContent = currentQuote;
            }

            // Squash animation
            card.classList.remove('bonk-animating');
            const _reflow = card.offsetWidth;
            if (_reflow >= 0) {
                card.classList.add('bonk-animating');
            }
            if (cardAnimTimer) clearTimeout(cardAnimTimer);
            cardAnimTimer = setTimeout(() => {
                card.classList.remove('bonk-animating');
            }, 500);

            // Threshold check
            if (currentStreak >= threshold) {
                // Reached threshold: dismiss card after 3.0s of stopping
                dismissTimer = setTimeout(() => {
                    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';

                    setTimeout(() => {
                        isDismissed = true;
                        document.removeEventListener('click', closeMenuHandler);
                        mascotWidget?.returnFromHideAndSeek?.(currentStreak, accumulatedCooldownMs);
                        if (typeof onRecoverSmug === 'function') {
                            onRecoverSmug();
                        }
                        if (typeof onRerenderRequested === 'function') {
                            onRerenderRequested();
                        }
                    }, 400);
                }, 3000);
            } else {
                // Not reached threshold: recovery back to smug after 3.0s
                recoveryTimer = setTimeout(() => {
                    cardMascotState = 'bonked';
                    if (iconImg) iconImg.src = CARD_IMAGES.bonked;

                    secondaryRecoveryTimer = setTimeout(() => {
                        currentStreak = 0;
                        accumulatedCooldownMs = 3000;
                        cardMascotState = 'smug';
                        currentQuote = getRandomIdleQuote();
                        if (iconImg) iconImg.src = CARD_IMAGES.smug;
                        if (quoteEl) quoteEl.textContent = currentQuote;
                        startIdleRotation(quoteEl);
                        if (typeof onRecoverSmug === 'function') {
                            onRecoverSmug();
                        }
                    }, accumulatedCooldownMs);
                }, 3000);
            }
        };

        // Start idle quote rotation
        startIdleRotation(quoteEl);

        card.addEventListener('click', handleCardBonk);
        card.addEventListener('dblclick', handleCardBonk);
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dropdownMenu) {
                dropdownMenu.classList.toggle('show');
            }
        });

        return card;
    }

    return {
        init: () => {
            // Check if hide and seek should be active at startup
            if (isCardActive()) {
                mascotWidget?.hide?.();
            }
        },
        isEnabled,
        isCardActive,
        isDismissed: () => isDismissed,
        getCardTitle,
        injectCardIntoItems,
        createMascotCardElement,
        setSetting,
        destroy: () => {
            clearCardTimers();
            if (cardAnimTimer) clearTimeout(cardAnimTimer);
        }
    };
}
