import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import bonkEffectImg from '../../../assets/BONK.png';
import yumeBonked from '../../../assets/yume_bonked.png';
import yumeBonkedTooMuch from '../../../assets/yume_bonkedtoomuch.png';
import yumeSmug from '../../../assets/yume_smug.png';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import { useLocaleStrings } from '../i18n/locale-strings';
import {
  DEFAULT_MASCOT_TIMING_CONFIG,
  MASCOT_STORAGE_KEYS,
  applyBonkTransition,
  normalizeMascotScale,
  normalizeMascotSound,
  normalizeMascotVolume,
  parseBonkCount,
  parseMascotPosition,
  parseMascotPreferences,
  recoverToSmug,
  type MascotExpression,
  type MascotPosition,
  type MascotRecoveryState,
} from '../mascot/mascot-domain';
import { useOptionalMascot } from '../providers/MascotProvider';
import type { UiStorageAdapter } from '../state/ui-runtime-state';

export interface MascotPreferences {
  show?: boolean;
  scale?: number | string;
  sound?: string;
  volume?: number | string;
}

export interface MascotWidgetProps extends MascotPreferences {
  storage?: UiStorageAdapter;
  onBonk?: (quote: string) => void;
  onRecoverSmug?: () => void;
}

const IMAGES: Record<MascotExpression, string> = {
  smug: yumeSmug,
  bonked: yumeBonked,
  bonkedTooMuch: yumeBonkedTooMuch,
};

interface ContextMenuState {
  readonly open: boolean;
  readonly rawX: number;
  readonly rawY: number;
  readonly left: number;
  readonly top: number;
}

const CLOSED_MENU_STATE: ContextMenuState = {
  open: false,
  rawX: 0,
  rawY: 0,
  left: 0,
  top: 0,
};

function clampViewportPosition(
  x: number,
  y: number,
  width: number,
  height: number
): MascotPosition {
  const effectiveWidth = width > 0 ? width : 200;
  const effectiveHeight = height > 0 ? height : 200;
  const maxX = Math.max(0, window.innerWidth - effectiveWidth);
  const maxY = Math.max(0, window.innerHeight - effectiveHeight);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
  };
}

export const MascotWidget: React.FC<MascotWidgetProps> = ({
  show: showProp,
  scale: scaleProp,
  sound: soundProp,
  volume: volumeProp,
  storage,
}) => {
  const mascot = useOptionalMascot();
  const mascotRef = useRef(mascot);
  mascotRef.current = mascot;
  const resolvedStorage = storage ?? mascot?.storage;
  const fallbackStorage =
    resolvedStorage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const strings = useLocaleStrings(resolvedStorage);

  const widgetRef = useRef<HTMLButtonElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  // Standalone fallback state when rendered without <MascotProvider>
  const [standalonePrefs, setStandalonePrefs] = useState(() =>
    parseMascotPreferences(fallbackStorage)
  );
  const [standaloneBonkCount, setStandaloneBonkCount] = useState(() =>
    parseBonkCount(fallbackStorage)
  );
  const [standaloneRecovery, setStandaloneRecovery] = useState<MascotRecoveryState>({
    phase: 'smug',
  });
  const standaloneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveShow =
    mascot !== null
      ? mascot.isWidgetVisible
      : showProp !== undefined
        ? showProp
        : standalonePrefs.show;
  const effectiveScale =
    mascot !== null
      ? mascot.scale
      : scaleProp !== undefined
        ? normalizeMascotScale(scaleProp, 30)
        : standalonePrefs.scale;
  const effectiveSound =
    mascot !== null
      ? mascot.sound
      : soundProp !== undefined
        ? normalizeMascotSound(soundProp)
        : standalonePrefs.sound;
  const effectiveVolume =
    mascot !== null
      ? mascot.volume
      : volumeProp !== undefined
        ? normalizeMascotVolume(volumeProp, 20)
        : standalonePrefs.volume;
  const effectiveBonkCount = mascot !== null ? mascot.bonkCount : standaloneBonkCount;

  const [isDraggingLocal, setIsDraggingLocal] = useState(false);
  const [isBonkAnimating, setIsBonkAnimating] = useState(false);
  const [menuState, setMenuState] = useState<ContextMenuState>(CLOSED_MENU_STATE);
  const [pos, setPos] = useState<MascotPosition | null>(() =>
    parseMascotPosition(fallbackStorage)
  );

  const posRef = useRef<MascotPosition | null>(pos);
  posRef.current = pos;
  const isWidgetVisibleRef = useRef(effectiveShow);
  isWidgetVisibleRef.current = effectiveShow;

  const isPointerDownRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const elemStartRef = useRef({ x: 0, y: 0 });
  const cachedRectSizeRef = useRef({ width: 200, height: 200 });
  const animEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveExpression: MascotExpression =
    mascot !== null
      ? mascot.expression
      : isDraggingLocal
        ? 'bonked'
        : standaloneRecovery.phase;

  const persistPosition = useCallback(
    (nextPos: MascotPosition | null) => {
      if (!fallbackStorage) return;
      if (nextPos === null) {
        for (const key of [MASCOT_STORAGE_KEYS.posX, MASCOT_STORAGE_KEYS.posY]) {
          try {
            fallbackStorage.removeItem(key);
          } catch (err) {
            console.warn('[MascotWidget] Failed to persist mascot position:', {
              key,
              error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
              stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
            });
          }
        }
        return;
      }

      const entries: Array<[string, string]> = [
        [MASCOT_STORAGE_KEYS.posX, String(nextPos.x)],
        [MASCOT_STORAGE_KEYS.posY, String(nextPos.y)],
      ];
      for (const [key, value] of entries) {
        try {
          fallbackStorage.setItem(key, value);
        } catch (err) {
          console.warn('[MascotWidget] Failed to persist mascot position:', {
            key,
            error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
            stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
          });
        }
      }
    },
    [fallbackStorage]
  );

  // Preload all 4 mascot/impact images on mount
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    [yumeSmug, yumeBonked, yumeBonkedTooMuch, bonkEffectImg].forEach((src) => {
      const preloader = new Image();
      preloader.src = src;
    });
  }, []);

  // Cleanup timers and active drag state on unmount
  useEffect(() => {
    return () => {
      if (animEndTimerRef.current !== null) {
        clearTimeout(animEndTimerRef.current);
        animEndTimerRef.current = null;
      }
      if (standaloneTimerRef.current !== null) {
        clearTimeout(standaloneTimerRef.current);
        standaloneTimerRef.current = null;
      }
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        isPointerDownRef.current = false;
        mascotRef.current?.finishDrag();
      }
    };
  }, []);

  // Clear stale drag/menu state when mascot becomes hidden
  useEffect(() => {
    if (effectiveShow) return;
    setMenuState(CLOSED_MENU_STATE);
    if (isPointerDownRef.current || isDraggingRef.current) {
      isPointerDownRef.current = false;
      isDraggingRef.current = false;
      setIsDraggingLocal(false);
      mascot?.finishDrag();
    }
  }, [effectiveShow, mascot]);

  // Clamp saved position when visible or when scale changes
  useLayoutEffect(() => {
    if (!effectiveShow || !posRef.current) return;
    const rect = widgetRef.current?.getBoundingClientRect();
    const clamped = clampViewportPosition(
      posRef.current.x,
      posRef.current.y,
      rect?.width ?? 0,
      rect?.height ?? 0
    );
    if (clamped.x !== posRef.current.x || clamped.y !== posRef.current.y) {
      posRef.current = clamped;
      setPos(clamped);
      persistPosition(clamped);
    }
  }, [effectiveShow, effectiveScale, persistPosition]);

  // Re-clamp on window resize while visible
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      if (!isWidgetVisibleRef.current || !posRef.current) return;
      const rect = widgetRef.current?.getBoundingClientRect();
      const clamped = clampViewportPosition(
        posRef.current.x,
        posRef.current.y,
        rect?.width ?? 0,
        rect?.height ?? 0
      );
      if (clamped.x !== posRef.current.x || clamped.y !== posRef.current.y) {
        posRef.current = clamped;
        setPos(clamped);
        persistPosition(clamped);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [persistPosition]);

  // Clamp context menu inside viewport with 250x180 fallback for headless/happy-dom
  useLayoutEffect(() => {
    if (!menuState.open || typeof window === 'undefined') return;
    const menuRect = contextMenuRef.current?.getBoundingClientRect();
    const menuWidth = menuRect && menuRect.width > 0 ? menuRect.width : 250;
    const menuHeight = menuRect && menuRect.height > 0 ? menuRect.height : 180;

    let left = menuState.rawX;
    let top = menuState.rawY;

    if (left + menuWidth > window.innerWidth - 10) {
      left = Math.max(10, menuState.rawX - menuWidth);
    }
    if (top + menuHeight > window.innerHeight - 10) {
      top = Math.max(10, menuState.rawY - menuHeight);
    }

    if (left !== menuState.left || top !== menuState.top) {
      setMenuState((prev) => (prev.open ? { ...prev, left, top } : prev));
    }
  }, [menuState.open, menuState.rawX, menuState.rawY, menuState.left, menuState.top]);

  const closeMenuAndRestoreFocusIfInside = useCallback(() => {
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const wasFocusInsideMenu = Boolean(
      activeEl && contextMenuRef.current?.contains(activeEl)
    );
    setMenuState(CLOSED_MENU_STATE);
    if (wasFocusInsideMenu && isWidgetVisibleRef.current) {
      widgetRef.current?.focus();
    }
  }, []);

  // Document click-outside and Escape close for context menu
  useEffect(() => {
    if (!menuState.open || typeof document === 'undefined') return;

    const handleDocClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('#mascot-context-menu, #yume-mascot-widget')) {
        return;
      }
      setMenuState(CLOSED_MENU_STATE);
    };

    const handleDocKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenuAndRestoreFocusIfInside();
      }
    };

    document.addEventListener('click', handleDocClick);
    document.addEventListener('keydown', handleDocKeyDown);
    return () => {
      document.removeEventListener('click', handleDocClick);
      document.removeEventListener('keydown', handleDocKeyDown);
    };
  }, [menuState.open, closeMenuAndRestoreFocusIfInside]);

  const triggerBonk = useCallback(
    (clientX?: number, clientY?: number, renderedHeight?: number) => {
      if (mascot) {
        mascot.bonk({
          clientX,
          clientY,
          renderedHeight:
            renderedHeight ?? (widgetRef.current?.getBoundingClientRect().height || 260),
        });
      } else {
        const nextCount = parseBonkCount(fallbackStorage) + 1;
        setStandaloneBonkCount(nextCount);
        if (fallbackStorage) {
          try {
            fallbackStorage.setItem(MASCOT_STORAGE_KEYS.bonkCount, String(nextCount));
          } catch (err) {
            console.warn('[MascotWidget] Failed to persist mascot bonk count:', {
              key: MASCOT_STORAGE_KEYS.bonkCount,
              error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
              stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
            });
          }
        }
        const nowMs = performance.now();
        setStandaloneRecovery((prev) =>
          applyBonkTransition(prev, nowMs, DEFAULT_MASCOT_TIMING_CONFIG)
        );
        if (standaloneTimerRef.current !== null) {
          clearTimeout(standaloneTimerRef.current);
        }
        standaloneTimerRef.current = setTimeout(() => {
          standaloneTimerRef.current = null;
          setStandaloneRecovery(recoverToSmug());
        }, DEFAULT_MASCOT_TIMING_CONFIG.minCooldownMs);
      }

      if (animEndTimerRef.current !== null) {
        clearTimeout(animEndTimerRef.current);
        animEndTimerRef.current = null;
      }
      const el = widgetRef.current;
      if (el) {
        el.classList.remove('bonk-animating');
        const _reflow = el.offsetWidth;
        if (_reflow >= 0) {
          el.classList.add('bonk-animating');
        }
      }
      setIsBonkAnimating(true);
      animEndTimerRef.current = setTimeout(() => {
        animEndTimerRef.current = null;
        setIsBonkAnimating(false);
      }, 500);
    },
    [fallbackStorage, mascot]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      setMenuState(CLOSED_MENU_STATE);
      isPointerDownRef.current = true;
      isDraggingRef.current = false;
      dragStartRef.current = { x: event.clientX, y: event.clientY };

      const rect = event.currentTarget.getBoundingClientRect();
      elemStartRef.current = { x: rect.left, y: rect.top };
      cachedRectSizeRef.current = {
        width: rect.width || 200,
        height: rect.height || 200,
      };

      if (typeof event.currentTarget.setPointerCapture === 'function') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (err) {
          console.warn('[MascotWidget] Failed to capture pointer:', {
            error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
            stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
          });
        }
      }
    },
    []
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isPointerDownRef.current) return;
      const deltaX = event.clientX - dragStartRef.current.x;
      const deltaY = event.clientY - dragStartRef.current.y;

      if (!isDraggingRef.current && Math.hypot(deltaX, deltaY) >= 5) {
        isDraggingRef.current = true;
        setIsDraggingLocal(true);
        mascot?.interruptRecoveryForDrag();
      }

      if (isDraggingRef.current) {
        const clamped = clampViewportPosition(
          elemStartRef.current.x + deltaX,
          elemStartRef.current.y + deltaY,
          cachedRectSizeRef.current.width,
          cachedRectSizeRef.current.height
        );
        posRef.current = clamped;
        setPos(clamped);
      }
    },
    [mascot]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;

      if (typeof event.currentTarget.releasePointerCapture === 'function') {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Best-effort pointer capture release
        }
      }

      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDraggingLocal(false);
        mascot?.finishDrag();
        if (posRef.current !== null) {
          persistPosition(posRef.current);
        }
      } else {
        triggerBonk(event.clientX, event.clientY, cachedRectSizeRef.current.height);
      }
    },
    [mascot, persistPosition, triggerBonk]
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;

      if (typeof event.currentTarget.releasePointerCapture === 'function') {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Best-effort pointer capture release
        }
      }

      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDraggingLocal(false);
        mascot?.finishDrag();
        if (posRef.current !== null) {
          persistPosition(posRef.current);
        }
      }
    },
    [mascot, persistPosition]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.repeat || isDraggingRef.current) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      triggerBonk(
        rect.left + rect.width / 2,
        rect.top + rect.height * 0.28,
        rect.height || 260
      );
    },
    [triggerBonk]
  );

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setMenuState({
      open: true,
      rawX: event.clientX,
      rawY: event.clientY,
      left: event.clientX,
      top: event.clientY,
    });
  }, []);

  const handleResetPosition = useCallback(() => {
    posRef.current = null;
    setPos(null);
    persistPosition(null);
    closeMenuAndRestoreFocusIfInside();
  }, [closeMenuAndRestoreFocusIfInside, persistPosition]);

  const bonkCounterText = (() => {
    if (effectiveBonkCount === 1 && strings.mascot_menu_bonked_count_one) {
      return strings.mascot_menu_bonked_count_one;
    }
    if (strings.mascot_menu_bonked_count) {
      return strings.mascot_menu_bonked_count.replace('{count}', String(effectiveBonkCount));
    }
    return `Bonked ${effectiveBonkCount} times`;
  })();

  const widgetClassName = [
    'yume-mascot-widget',
    effectiveShow ? '' : 'hidden',
    isDraggingLocal ? 'is-dragging' : '',
    isBonkAnimating ? 'bonk-animating' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const widgetStyle: React.CSSProperties & { '--mascot-scale'?: string } = {
    '--mascot-scale': String(effectiveScale / 100),
    ...(pos !== null
      ? {
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          right: 'auto',
          bottom: 'auto',
        }
      : {}),
  };

  return (
    <div id="mascot-widget-container">
      <button
        type="button"
        className={widgetClassName}
        id="yume-mascot-widget"
        title="Bonk!"
        style={widgetStyle}
        ref={widgetRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
      >
        <img
          className="yume-mascot-img"
          id="yume-mascot-img"
          src={IMAGES[effectiveExpression]}
          alt="Yume Mascot"
          draggable={false}
        />
      </button>

      <div
        className="mascot-context-menu"
        id="mascot-context-menu"
        aria-hidden={!menuState.open}
        style={{
          display: menuState.open ? 'flex' : 'none',
          ...(menuState.open
            ? { left: `${menuState.left}px`, top: `${menuState.top}px` }
            : {}),
        }}
        ref={contextMenuRef}
      >
        <div className="mascot-menu-header">
          <div className="mascot-menu-title-group">
            <span className="mascot-menu-title">Yume-chan</span>
            <span className="mascot-menu-counter" id="mascot-menu-counter">
              {bonkCounterText}
            </span>
          </div>
          <button
            type="button"
            className="mascot-menu-reset-btn"
            id="mascot-menu-reset-btn"
            data-i18n="mascot_menu_reset_position"
            onClick={handleResetPosition}
          >
            {strings.mascot_menu_reset_position || 'Reset Position'}
          </button>
        </div>
        <div className="mascot-menu-divider" />
        <div className="mascot-menu-row">
          <label
            id="ui-mascot-menu-sound-label"
            htmlFor="mascot-menu-sound-select"
            data-i18n="mascot_menu_sound"
          >
            {strings.mascot_menu_sound || 'Bonk Sound'}
          </label>
          <select
            id="mascot-menu-sound-select"
            value={effectiveSound}
            onChange={(e) => {
              const next = e.target.value;
              if (mascot) {
                mascot.setSound(next);
              } else {
                setStandalonePrefs((prev) => ({
                  ...prev,
                  sound: normalizeMascotSound(next),
                }));
              }
            }}
          >
            <option value="squeaker" data-i18n="sound_squeaker">
              {strings.sound_squeaker || 'Squeaky'}
            </option>
            <option value="metal-pipe" data-i18n="sound_metal_pipe">
              {strings.sound_metal_pipe || 'Metal pipe'}
            </option>
            <option value="none" data-i18n="sound_none">
              {strings.sound_none || 'None'}
            </option>
          </select>
        </div>
        <div className="mascot-menu-row">
          <label
            id="ui-mascot-menu-scale-label"
            htmlFor="mascot-menu-scale-slider"
            data-i18n="mascot_menu_scale"
          >
            {strings.mascot_menu_scale || 'Scale'}
          </label>
          <div className="volume-slider-container">
            <span className="volume-value-label" id="mascot-menu-scale-value">
              {`${effectiveScale}%`}
            </span>
            <input
              type="range"
              id="mascot-menu-scale-slider"
              min={25}
              max={100}
              value={effectiveScale}
              step={1}
              aria-label="Scale"
              aria-valuetext={`${effectiveScale}%`}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (mascot) {
                  mascot.setScale(next);
                } else {
                  setStandalonePrefs((prev) => ({
                    ...prev,
                    scale: normalizeMascotScale(next, 30),
                  }));
                }
              }}
            />
          </div>
        </div>
        <div className="mascot-menu-row">
          <label
            id="ui-mascot-menu-volume-label"
            htmlFor="mascot-menu-volume-slider"
            data-i18n="mascot_menu_volume"
          >
            {strings.mascot_menu_volume || 'Volume'}
          </label>
          <div className="volume-slider-container">
            <span className="volume-value-label" id="mascot-menu-volume-value">
              {`${effectiveVolume}%`}
            </span>
            <input
              type="range"
              id="mascot-menu-volume-slider"
              min={0}
              max={100}
              value={effectiveVolume}
              step={1}
              aria-label="Volume"
              aria-valuetext={`${effectiveVolume}%`}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (mascot) {
                  mascot.setVolume(next);
                } else {
                  setStandalonePrefs((prev) => ({
                    ...prev,
                    volume: normalizeMascotVolume(next, 20),
                  }));
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
