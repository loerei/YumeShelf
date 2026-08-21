// @ts-nocheck
import yumeSmug from '../../assets/yume_smug.png';
import yumeBonked from '../../assets/yume_bonked.png';
import yumeBonkedTooMuch from '../../assets/yume_bonkedtoomuch.png';
import squeakerSound from '../../assets/squeaker.mp3';
import metalPipeSound from '../../assets/metal-pipe.mp3';

export interface MascotController {
    init(): void;
    destroy(): void;
    setVisible(visible: boolean): void;
    setScale(scalePercent: number | string): void;
    setSound(soundKey: string): void;
    setVolume(volumePercent: number | string): void;
}

const IMAGES = {
    smug: yumeSmug,
    bonked: yumeBonked,
    bonkedTooMuch: yumeBonkedTooMuch
};

const SOUNDS = {
    squeaker: squeakerSound,
    'metal-pipe': metalPipeSound
};

export function createMascotWidget({
    widgetEl,
    imgEl
}: {
    widgetEl: HTMLElement | null;
    imgEl: HTMLImageElement | null;
}): MascotController {
    if (!widgetEl || !imgEl) {
        return {
            init: () => {},
            destroy: () => {},
            setVisible: () => {},
            setScale: () => {},
            setSound: () => {},
            setVolume: () => {}
        };
    }

    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let animEndTimer: ReturnType<typeof setTimeout> | null = null;
    let recentClicks: number[] = [];
    let currentSoundKey = 'squeaker';
    let currentVolume = 20;
    let activeAudio: HTMLAudioElement | null = null;

    // Preload images into memory for instant zero-latency swap
    Object.values(IMAGES).forEach((src) => {
        const preloader = new Image();
        preloader.src = src;
    });

    function playBonkSound() {
        if (activeAudio) {
            try {
                activeAudio.pause();
                activeAudio.currentTime = 0;
            } catch {
                // Ignore audio pause errors
            }
        }

        if (currentSoundKey === 'none') return;

        const vol = Math.min(1, Math.max(0, currentVolume / 100));
        if (vol <= 0) return;

        const soundSrc = SOUNDS[currentSoundKey];
        if (!soundSrc) return;

        try {
            activeAudio = new Audio(soundSrc);
            activeAudio.volume = vol;
            activeAudio.play().catch(() => {});
        } catch {
            // Ignore audio autoplay policies if blocked
        }
    }

    function setMascotState(state: 'smug' | 'bonked' | 'bonkedTooMuch') {
        const nextSrc = IMAGES[state];
        if (imgEl && imgEl.getAttribute('src') !== nextSrc) {
            imgEl.src = nextSrc;
        }
    }

    function triggerBonk() {
        const now = performance.now();

        // Retain clicks within the last 1200ms
        recentClicks = recentClicks.filter((time) => now - time < 1200);
        recentClicks.push(now);

        // Rapid click detection: 3+ clicks in the sliding window
        if (recentClicks.length >= 3) {
            setMascotState('bonkedTooMuch');
        } else {
            setMascotState('bonked');
        }

        // Play bonk audio (interrupts current playing sound and restarts cleanly)
        playBonkSound();

        // Retrigger 0.5s bonk squash animation smoothly
        widgetEl.classList.remove('bonk-animating');
        void widgetEl.offsetWidth; // Trigger DOM reflow to restart keyframe animation
        widgetEl.classList.add('bonk-animating');

        if (animEndTimer) {
            clearTimeout(animEndTimer);
        }
        animEndTimer = setTimeout(() => {
            widgetEl.classList.remove('bonk-animating');
        }, 500);

        // Auto-recovery back to smug after 1.4s of inactivity
        if (recoveryTimer) {
            clearTimeout(recoveryTimer);
        }
        recoveryTimer = setTimeout(() => {
            recentClicks = [];
            setMascotState('smug');
        }, 1400);
    }

    function handleClick(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        triggerBonk();
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            triggerBonk();
        }
    }

    function setVisible(visible: boolean) {
        if (visible) {
            widgetEl.classList.remove('hidden');
        } else {
            widgetEl.classList.add('hidden');
        }
    }

    function setScale(scalePercent: number | string) {
        const parsed = Number(scalePercent);
        const scaleVal = (Number.isFinite(parsed) && parsed > 0) ? (parsed / 100) : 1;
        widgetEl.style.setProperty('--mascot-scale', String(scaleVal));
    }

    function setSound(soundKey: string) {
        currentSoundKey = (soundKey in SOUNDS || soundKey === 'none') ? soundKey : 'squeaker';
    }

    function setVolume(volumePercent: number | string) {
        const parsed = Number(volumePercent);
        currentVolume = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 20;
    }

    return {
        init: () => {
            // Set initial state from localStorage
            const initialShow = localStorage.getItem('yumeshelf_mascot_show') !== 'off';
            const initialScale = localStorage.getItem('yumeshelf_mascot_scale') || '100';
            const initialSound = localStorage.getItem('yumeshelf_mascot_sound') || 'squeaker';
            const initialVolume = localStorage.getItem('yumeshelf_mascot_volume') ?? '20';

            setVisible(initialShow);
            setScale(initialScale);
            setSound(initialSound);
            setVolume(initialVolume);

            setMascotState('smug');
            widgetEl.addEventListener('click', handleClick);
            widgetEl.addEventListener('keydown', handleKeyDown);
        },
        destroy: () => {
            if (recoveryTimer) clearTimeout(recoveryTimer);
            if (animEndTimer) clearTimeout(animEndTimer);
            if (activeAudio) {
                try {
                    activeAudio.pause();
                } catch {}
            }
            widgetEl.removeEventListener('click', handleClick);
            widgetEl.removeEventListener('keydown', handleKeyDown);
        },
        setVisible,
        setScale,
        setSound,
        setVolume
    };
}
