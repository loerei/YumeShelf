// @ts-nocheck
import smugFaceImg from '../../../assets/yume_smug.png';
import bonkedFaceImg from '../../../assets/yume_bonked.png';
import bonkedTooMuchFaceImg from '../../../assets/yume_bonkedtoomuch.png';

const CARD_IMAGES = {
    smug: smugFaceImg,
    bonked: bonkedFaceImg,
    bonkedTooMuch: bonkedTooMuchFaceImg
};

const TITLES = {
    en: [
        'Yume-chan',
        'Prestigious Yume-chan',
        'Admired Yume-chan',
        'Yume-sama',
        'Your Highness',
        'Yume-chama',
        '?????',
        'Maou-chama',
        'Hahahahahha'
    ],
    ja: [
        'ユメちゃん',
        '名誉あるユメちゃん',
        '憧れのユメちゃん',
        'ユメ様',
        '姫様',
        'ユメちゃま',
        '?????',
        '魔王様',
        'ハハハハハハ'
    ],
    zh: [
        '小优梅',
        '尊贵的小优梅',
        '受人憧憬的小优梅',
        '优梅大人',
        '殿下',
        '优梅大小姐',
        '?????',
        '魔王大人',
        '哈哈哈哈哈哈'
    ]
};

const IDLE_QUOTES = {
    en: [
        'Zaako~',
        'Zaako!',
        'Oiiiiiiii',
        'Want some snacks?',
        'You know how a lot of laughing turns into grass?',
        'Stay Young Beautiful And Unique',
        'Why am I talking to a fish?',
        'Teto is 31yo',
        'CUWAYO!',
        'Cuwayo~ cuwayo~'
    ],
    ja: [
        'ざぁ〜こ♡',
        'ざぁ〜こ！',
        'おーい！',
        'おやつ食べる？',
        '草生えるって知ってる？',
        '若く美しく個性的であれ',
        'なんで魚と喋ってるの？',
        'テトは31歳だよ',
        'クワヨ！',
        'クワヨ〜 クワヨ〜'
    ],
    zh: [
        '杂鱼~',
        '杂鱼！',
        '喂————！',
        '想吃零食吗？',
        '你知道大笑会变成大草原吗？',
        '保持年轻、美丽且独一无二',
        '我为什么在和一条鱼说话？',
        '重音Teto已经31岁了哦',
        '可爱哟！',
        '可爱哟~ 可爱哟~'
    ]
};

const BONKED_QUOTES = {
    en: [
        'OIIIIIIII!!!',
        'Ugh!',
        'Poor me :(',
        'Gah-',
        'My braincells!',
        'You can do better than cyberbullying me :(',
        'Bold of you!',
        '@@',
        '???'
    ],
    ja: [
        'おーい！！！',
        'うっ！',
        'かわいそうな私… (´；ω；｀)',
        'ぐはっ',
        '私の脳細胞が！',
        'ネットいじめ以外にすることないの？ :(',
        'いい度胸ね！',
        '@@',
        '???'
    ],
    zh: [
        '喂！！！',
        '呃！',
        '可怜的我 :(',
        '咕呃——',
        '我的脑细胞！',
        '除了网络霸凌我你就没别的事做了吗 :(',
        '胆子挺大嘛！',
        '@@',
        '???'
    ]
};

export const MASCOT_CARD_KEY = 'yumeshelf_mascot_card';

export interface HideAndSeekControllerOptions {
    mascotWidget: any;
    getStrings: () => any;
    getLanguage?: () => string;
    onRerenderRequested?: () => void;
}

export function createHideAndSeekController({
    mascotWidget,
    getStrings,
    getLanguage,
    onRerenderRequested
}: HideAndSeekControllerOptions) {
    // Session state
    const threshold = Math.floor(Math.random() * 6) + 5; // 5..10 clicks
    const isStarred = Math.random() < 0.5;
    const titleIndex = Math.floor(Math.random() * 9);
    let randomIndexPosition = 0;
    let isDismissed = false;

    let currentStreak = 0;
    let accumulatedCooldownMs = 3000;
    let cardMascotState: 'smug' | 'bonked' | 'bonkedTooMuch' = 'smug';
    let currentQuote: string = '';
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let secondaryRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let cardAnimTimer: ReturnType<typeof setTimeout> | null = null;

    function getCurrentLangKey(): 'en' | 'ja' | 'zh' {
        const lang = (typeof getLanguage === 'function' ? getLanguage() : '') || localStorage.getItem('yumeshelf_language') || 'en';
        if (lang.startsWith('ja')) return 'ja';
        if (lang.startsWith('zh')) return 'zh';
        return 'en';
    }

    function getCardTitle(): string {
        const lang = getCurrentLangKey();
        const pool = TITLES[lang] || TITLES.en;
        return pool[titleIndex % pool.length] || 'Yume-chan';
    }

    function getRandomIdleQuote(): string {
        const lang = getCurrentLangKey();
        const pool = IDLE_QUOTES[lang] || IDLE_QUOTES.en;
        return pool[Math.floor(Math.random() * pool.length)] || 'Zaako~';
    }

    function getRandomBonkedQuote(): string {
        const lang = getCurrentLangKey();
        const pool = BONKED_QUOTES[lang] || BONKED_QUOTES.en;
        return pool[Math.floor(Math.random() * pool.length)] || 'OIIIIIIII!!!';
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
        if (randomIndexPosition > items.length || randomIndexPosition === 0) {
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
                    }, accumulatedCooldownMs);
                }, 3000);
            }
        };

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
