// @ts-nocheck
import yumeSmug from '../../assets/yume_smug.png';
import yumeBonked from '../../assets/yume_bonked.png';
import yumeBonkedTooMuch from '../../assets/yume_bonkedtoomuch.png';
import bonkEffectImg from '../../assets/BONK.png';
import squeakerSound from '../../assets/squeaker.mp3';
import metalPipeSound from '../../assets/metal-pipe.mp3';

export interface MascotController {
    init(): void;
    destroy(): void;
    show(): void;
    hide(): void;
    setVisible(visible: boolean): void;
    setScale(scalePercent: number | string): void;
    setSound(soundKey: string): void;
    setVolume(volumePercent: number | string): void;
    resetPosition(): void;
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
    imgEl,
    contextMenuEl,
    getStrings
}: {
    widgetEl: HTMLElement | null;
    imgEl: HTMLImageElement | null;
    contextMenuEl?: HTMLElement | null;
    getStrings?: () => any;
}): MascotController {
    if (!widgetEl || !imgEl) {
        return {
            init: () => {},
            destroy: () => {},
            show: () => {},
            hide: () => {},
            setVisible: () => {},
            setScale: () => {},
            setSound: () => {},
            setVolume: () => {},
            resetPosition: () => {}
        };
    }

    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let secondaryRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let animEndTimer: ReturnType<typeof setTimeout> | null = null;
    let currentStreak = 0;
    let currentMascotState: 'smug' | 'bonked' | 'bonkedTooMuch' = 'smug';
    let stage2EndTime = 0;
    let accumulatedCooldownMs = 3000;
    let rapidClicksDuringCooldown: number[] = [];
    let currentSoundKey = 'squeaker';
    let currentVolume = 20;
    let currentScale = 100;
    let activeAudio: HTMLAudioElement | null = null;

    // Position state
    let posX: number | null = null;
    let posY: number | null = null;

    // Drag interaction tracking
    let isPointerDown = false;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let elemStartX = 0;
    let elemStartY = 0;

    // Preload images into memory for instant zero-latency swap
    [...Object.values(IMAGES), bonkEffectImg].forEach((src) => {
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
        currentMascotState = state;
        const nextSrc = IMAGES[state];
        if (imgEl && imgEl.getAttribute('src') !== nextSrc) {
            imgEl.src = nextSrc;
        }
    }

    function resetToSmug() {
        clearRecoveryTimers();
        currentStreak = 0;
        stage2EndTime = 0;
        accumulatedCooldownMs = 3000;
        rapidClicksDuringCooldown = [];
        setMascotState('smug');
    }

    function clampAndApplyPosition(x: number, y: number, save = true) {
        const rect = widgetEl.getBoundingClientRect();
        const width = rect.width || 200;
        const height = rect.height || 200;

        const maxX = Math.max(0, window.innerWidth - width);
        const maxY = Math.max(0, window.innerHeight - height);

        const clampedX = Math.min(Math.max(0, x), maxX);
        const clampedY = Math.min(Math.max(0, y), maxY);

        posX = clampedX;
        posY = clampedY;

        widgetEl.style.left = `${clampedX}px`;
        widgetEl.style.top = `${clampedY}px`;
        widgetEl.style.right = 'auto';
        widgetEl.style.bottom = 'auto';

        if (save) {
            localStorage.setItem('yumeshelf_mascot_x', String(clampedX));
            localStorage.setItem('yumeshelf_mascot_y', String(clampedY));
        }
    }

    function restoreSavedPosition() {
        const savedX = localStorage.getItem('yumeshelf_mascot_x');
        const savedY = localStorage.getItem('yumeshelf_mascot_y');

        if (savedX !== null && savedY !== null) {
            const parsedX = parseFloat(savedX);
            const parsedY = parseFloat(savedY);
            if (Number.isFinite(parsedX) && Number.isFinite(parsedY)) {
                clampAndApplyPosition(parsedX, parsedY, false);
                return;
            }
        }

        // Default: docked bottom-right
        posX = null;
        posY = null;
        widgetEl.style.left = '';
        widgetEl.style.top = '';
        widgetEl.style.right = '';
        widgetEl.style.bottom = '';
    }

    function resetPosition() {
        posX = null;
        posY = null;
        localStorage.removeItem('yumeshelf_mascot_x');
        localStorage.removeItem('yumeshelf_mascot_y');
        widgetEl.style.left = '';
        widgetEl.style.top = '';
        widgetEl.style.right = '';
        widgetEl.style.bottom = '';
        closeContextMenu();
    }

    function handleWindowResize() {
        if (posX !== null && posY !== null) {
            clampAndApplyPosition(posX, posY, true);
        }
    }

    function spawnBonkImpact(clickX?: number, clickY?: number) {
        const rect = widgetEl.getBoundingClientRect();

        let cx = clickX;
        let cy = clickY;

        if (typeof cx !== 'number' || typeof cy !== 'number') {
            // Default to top-center area of mascot head
            cx = rect.left + rect.width / 2;
            cy = rect.top + rect.height * 0.28;
        }

        const particle = document.createElement('img');
        particle.src = bonkEffectImg;
        particle.alt = 'Bonk Impact';
        particle.className = 'bonk-impact-particle';

        // Base size scaled proportionally to mascot rendered size (~38% of mascot height)
        const renderedHeight = rect.height || 260;
        const baseSize = Math.max(65, Math.min(140, renderedHeight * 0.38));
        particle.style.width = `${baseSize}px`;
        particle.style.left = `${cx}px`;
        particle.style.top = `${cy}px`;

        // Random rotation from -45deg to +45deg
        const rotationDeg = (Math.random() * 90) - 45;
        // Random peak opacity from 0.75 to 1.0
        const maxOpacity = 0.75 + Math.random() * 0.25;

        // Mathematical curve parameters: f(t) = (t / tp)^n * exp(n * (1 - t / tp))
        const tp = 0.12; // Peak position at ~12% duration (~45ms)
        const n = 2.5;   // Slope power controlling rapid rise and smooth exponential tail
        const duration = 380; // Total duration in ms
        const startTime = performance.now();

        particle.style.opacity = '0';
        particle.style.transform = `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(0.6)`;
        document.body.appendChild(particle);

        function animateFrame(now: number) {
            const elapsed = now - startTime;
            const t = Math.min(1, Math.max(0, elapsed / duration));

            if (t <= 0) {
                particle.style.opacity = '0';
                particle.style.transform = `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(0.6)`;
            } else {
                // Apply the user's mathematical curve formula
                const curve = Math.pow(t / tp, n) * Math.exp(n * (1.0 - t / tp));
                const currentOpacity = Math.max(0, Math.min(1, curve * maxOpacity));
                const currentScale = 0.7 + 0.35 * Math.min(1.2, curve);

                particle.style.opacity = String(currentOpacity);
                particle.style.transform = `translate(-50%, -50%) rotate(${rotationDeg}deg) scale(${currentScale})`;
            }

            if (t < 1) {
                requestAnimationFrame(animateFrame);
            } else {
                particle.remove();
            }
        }

        requestAnimationFrame(animateFrame);
    }

    function clearRecoveryTimers() {
        if (recoveryTimer) {
            clearTimeout(recoveryTimer);
            recoveryTimer = null;
        }
        if (secondaryRecoveryTimer) {
            clearTimeout(secondaryRecoveryTimer);
            secondaryRecoveryTimer = null;
        }
    }

    function triggerBonk(clickX?: number, clickY?: number) {
        const now = performance.now();

        if (currentMascotState === 'bonked' && stage2EndTime > now) {
            // Case 1: In Stage 2 cooldown (bonked state counting down to smug)
            currentStreak += 1;
            const remainingMs = Math.max(0, stage2EndTime - now);
            accumulatedCooldownMs = Math.min(10000, remainingMs + 1000);

            // Track rapid burst in sliding 1200ms window
            rapidClicksDuringCooldown = rapidClicksDuringCooldown.filter(t => now - t < 1200);
            rapidClicksDuringCooldown.push(now);

            if (rapidClicksDuringCooldown.length >= 3) {
                // Burst of >= 3 clicks: re-trigger bonkedTooMuch and restart Stage 1
                clearRecoveryTimers();
                setMascotState('bonkedTooMuch');

                recoveryTimer = setTimeout(() => {
                    setMascotState('bonked');
                    const stage2Start = performance.now();
                    stage2EndTime = stage2Start + accumulatedCooldownMs;

                    secondaryRecoveryTimer = setTimeout(() => {
                        resetToSmug();
                    }, accumulatedCooldownMs);
                }, 3000);
            } else {
                // 1 or 2 clicks: stay in bonked, apply incrementally increased remaining time
                stage2EndTime = now + accumulatedCooldownMs;
                if (secondaryRecoveryTimer) {
                    clearTimeout(secondaryRecoveryTimer);
                }
                secondaryRecoveryTimer = setTimeout(() => {
                    resetToSmug();
                }, accumulatedCooldownMs);
            }
        } else if (currentMascotState === 'bonkedTooMuch') {
            // Case 2: In Stage 1 (bonkedTooMuch active)
            clearRecoveryTimers();
            currentStreak += 1;
            accumulatedCooldownMs = Math.min(10000, accumulatedCooldownMs + 1000);

            recoveryTimer = setTimeout(() => {
                setMascotState('bonked');
                const stage2Start = performance.now();
                stage2EndTime = stage2Start + accumulatedCooldownMs;

                secondaryRecoveryTimer = setTimeout(() => {
                    resetToSmug();
                }, accumulatedCooldownMs);
            }, 3000);
        } else {
            // Case 3: Starting fresh from smug or after full recovery
            clearRecoveryTimers();
            currentStreak += 1;
            rapidClicksDuringCooldown = [now];

            if (currentStreak >= 3) {
                // Burst of >= 3 clicks directly from smug
                setMascotState('bonkedTooMuch');
                accumulatedCooldownMs = Math.min(10000, 3000 + (currentStreak - 3) * 1000);

                recoveryTimer = setTimeout(() => {
                    setMascotState('bonked');
                    const stage2Start = performance.now();
                    stage2EndTime = stage2Start + accumulatedCooldownMs;

                    secondaryRecoveryTimer = setTimeout(() => {
                        resetToSmug();
                    }, accumulatedCooldownMs);
                }, 3000);
            } else {
                // Normal 1-2 clicks from smug: bonked state, recovers to smug after 3.0s
                setMascotState('bonked');
                accumulatedCooldownMs = 3000;
                stage2EndTime = now + 3000;

                recoveryTimer = setTimeout(() => {
                    resetToSmug();
                }, 3000);
            }
        }

        // Play bonk audio (interrupts current playing sound and restarts cleanly)
        playBonkSound();

        // Spawn mathematical curve BONK impact effect particle
        spawnBonkImpact(clickX, clickY);

        // Increment persistent bonk counter in localStorage
        const prevCount = parseInt(localStorage.getItem('yumeshelf_mascot_bonk_count') || '0', 10);
        localStorage.setItem('yumeshelf_mascot_bonk_count', String(prevCount + 1));

        // Retrigger 0.5s bonk squash animation smoothly
        widgetEl.classList.remove('bonk-animating');
        const _reflow = widgetEl.offsetWidth; // Trigger DOM reflow cleanly without void operator
        if (_reflow >= 0) {
            widgetEl.classList.add('bonk-animating');
        }

        if (animEndTimer) {
            clearTimeout(animEndTimer);
        }
        animEndTimer = setTimeout(() => {
            widgetEl.classList.remove('bonk-animating');
        }, 500);
    }

    function onPointerDown(event: PointerEvent) {
        if (event.button !== 0) return; // Left mouse button only

        closeContextMenu();
        isPointerDown = true;
        isDragging = false;
        dragStartX = event.clientX;
        dragStartY = event.clientY;

        const rect = widgetEl.getBoundingClientRect();
        elemStartX = rect.left;
        elemStartY = rect.top;

        widgetEl.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
        if (!isPointerDown) return;

        const deltaX = event.clientX - dragStartX;
        const deltaY = event.clientY - dragStartY;
        const distance = Math.hypot(deltaX, deltaY);

        if (!isDragging && distance >= 5) {
            isDragging = true;
            widgetEl.classList.add('is-dragging');
            setMascotState('bonked'); // Expressive bonked face while being dragged
            clearRecoveryTimers();
        }

        if (isDragging) {
            const targetX = elemStartX + deltaX;
            const targetY = elemStartY + deltaY;
            clampAndApplyPosition(targetX, targetY, false);
        }
    }

    function onPointerUp(event: PointerEvent) {
        if (!isPointerDown) return;
        isPointerDown = false;

        try {
            widgetEl.releasePointerCapture(event.pointerId);
        } catch {
            // Ignore if pointer capture was already lost
        }

        if (isDragging) {
            isDragging = false;
            widgetEl.classList.remove('is-dragging');

            // Save final clamped coordinates
            if (posX !== null && posY !== null) {
                clampAndApplyPosition(posX, posY, true);
            }

            // Restore smug face on drop and reset streak
            currentStreak = 0;
            setMascotState('smug');
        } else {
            // Click without drag -> Bonk at click location!
            triggerBonk(event.clientX, event.clientY);
        }
    }

    function onContextMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        openContextMenu(event.clientX, event.clientY);
    }

    function openContextMenu(clickX: number, clickY: number) {
        if (!contextMenuEl) return;

        contextMenuEl.style.display = 'flex';

        // Position context menu adjacent to click, clamped in viewport
        const menuRect = contextMenuEl.getBoundingClientRect();
        const menuWidth = menuRect.width || 250;
        const menuHeight = menuRect.height || 180;

        let left = clickX;
        let top = clickY;

        if (left + menuWidth > window.innerWidth - 10) {
            left = Math.max(10, clickX - menuWidth);
        }
        if (top + menuHeight > window.innerHeight - 10) {
            top = Math.max(10, clickY - menuHeight);
        }

        contextMenuEl.style.left = `${left}px`;
        contextMenuEl.style.top = `${top}px`;

        // Update persistent bonked counter text
        const bonkCount = parseInt(localStorage.getItem('yumeshelf_mascot_bonk_count') || '0', 10);
        const counterEl = contextMenuEl.querySelector('#mascot-menu-counter');
        if (counterEl) {
            const strings = typeof getStrings === 'function' ? getStrings() : null;
            let template = strings?.mascot_menu_bonked_count;
            if (bonkCount === 1 && strings?.mascot_menu_bonked_count_one) {
                template = strings.mascot_menu_bonked_count_one;
            }
            if (template) {
                counterEl.textContent = template.replace('{count}', String(bonkCount));
            } else {
                counterEl.textContent = `Bonked ${bonkCount} times`;
            }
        }

        // Sync context menu inputs with current states
        const soundSelect = contextMenuEl.querySelector('#mascot-menu-sound-select') as HTMLSelectElement | null;
        const scaleSlider = contextMenuEl.querySelector('#mascot-menu-scale-slider') as HTMLInputElement | null;
        const scaleLabel = contextMenuEl.querySelector('#mascot-menu-scale-value') as HTMLElement | null;
        const volumeSlider = contextMenuEl.querySelector('#mascot-menu-volume-slider') as HTMLInputElement | null;
        const volumeLabel = contextMenuEl.querySelector('#mascot-menu-volume-value') as HTMLElement | null;

        if (soundSelect) soundSelect.value = currentSoundKey;
        if (scaleSlider) scaleSlider.value = String(currentScale);
        if (scaleLabel) scaleLabel.textContent = `${currentScale}%`;
        if (volumeSlider) volumeSlider.value = String(currentVolume);
        if (volumeLabel) volumeLabel.textContent = `${currentVolume}%`;
    }

    function closeContextMenu() {
        if (contextMenuEl) {
            contextMenuEl.style.display = 'none';
        }
    }

    function onDocumentClick(event: MouseEvent) {
        if (contextMenuEl && contextMenuEl.style.display !== 'none') {
            if (!contextMenuEl.contains(event.target as Node) && !widgetEl.contains(event.target as Node)) {
                closeContextMenu();
            }
        }
    }

    function onDocumentKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            closeContextMenu();
        }
        if (event.target === widgetEl && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            triggerBonk();
        }
    }

    function show() {
        widgetEl.classList.remove('hidden');
    }

    function hide() {
        widgetEl.classList.add('hidden');
        closeContextMenu();
    }

    function setVisible(visible: boolean) {
        if (visible) {
            show();
        } else {
            hide();
        }
    }

    function setScale(scalePercent: number | string) {
        const parsed = Number(scalePercent);
        currentScale = Number.isFinite(parsed) && parsed > 0 ? Math.min(100, Math.max(25, parsed)) : 100;
        widgetEl.style.setProperty('--mascot-scale', String(currentScale / 100));

        // Re-clamp position after scale change to ensure bounds safety
        if (posX !== null && posY !== null) {
            clampAndApplyPosition(posX, posY, true);
        }
    }

    function setSound(soundKey: string) {
        currentSoundKey = (soundKey in SOUNDS || soundKey === 'none') ? soundKey : 'squeaker';
    }

    function setVolume(volumePercent: number | string) {
        const parsed = Number(volumePercent);
        currentVolume = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 20;
    }

    function returnFromHideAndSeek(streak: number, accumulatedMs: number) {
        const isShow = localStorage.getItem('yumeshelf_mascot_show') !== 'off';
        if (isShow) {
            show();
        }
        clearRecoveryTimers();
        currentStreak = streak;
        accumulatedCooldownMs = Math.min(10000, Math.max(3000, accumulatedMs));

        // Mascot appears in 'bonked' state (recovering from bonkedTooMuch)
        setMascotState('bonked');
        const stage2Start = performance.now();
        stage2EndTime = stage2Start + accumulatedCooldownMs;

        secondaryRecoveryTimer = setTimeout(() => {
            resetToSmug();
        }, accumulatedCooldownMs);
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

            restoreSavedPosition();
            setMascotState('smug');

            widgetEl.addEventListener('pointerdown', onPointerDown);
            widgetEl.addEventListener('pointermove', onPointerMove);
            widgetEl.addEventListener('pointerup', onPointerUp);
            widgetEl.addEventListener('pointercancel', onPointerUp);
            widgetEl.addEventListener('contextmenu', onContextMenu);

            window.addEventListener('resize', handleWindowResize);
            document.addEventListener('click', onDocumentClick);
            document.addEventListener('keydown', onDocumentKeyDown);

            // Context menu reset button
            if (contextMenuEl) {
                const resetBtn = contextMenuEl.querySelector('#mascot-menu-reset-btn');
                if (resetBtn) {
                    resetBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        resetPosition();
                    });
                }
            }
        },
        destroy: () => {
            clearRecoveryTimers();
            if (animEndTimer) clearTimeout(animEndTimer);
            if (activeAudio) {
                try {
                    activeAudio.pause();
                } catch {}
            }
            widgetEl.removeEventListener('pointerdown', onPointerDown);
            widgetEl.removeEventListener('pointermove', onPointerMove);
            widgetEl.removeEventListener('pointerup', onPointerUp);
            widgetEl.removeEventListener('pointercancel', onPointerUp);
            widgetEl.removeEventListener('contextmenu', onContextMenu);

            window.removeEventListener('resize', handleWindowResize);
            document.removeEventListener('click', onDocumentClick);
            document.removeEventListener('keydown', onDocumentKeyDown);
        },
        show,
        hide,
        setVisible,
        setScale,
        setSound,
        setVolume,
        resetPosition,
        playBonkSound,
        spawnBonkImpact,
        returnFromHideAndSeek
    };
}
