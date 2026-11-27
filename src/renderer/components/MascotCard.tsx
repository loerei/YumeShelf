import React, { useCallback, useEffect, useRef, useState } from 'react';
import yumeBonked from '../../../assets/yume_bonked.png';
import yumeBonkedTooMuch from '../../../assets/yume_bonkedtoomuch.png';
import yumeSmug from '../../../assets/yume_smug.png';
import { useCardMenu } from '../hooks/useCardMenu';
import { useLocaleStrings, type LocaleStrings } from '../i18n/locale-strings';
import { MASCOT_CARD_KEY, type MascotExpression } from '../mascot/mascot-domain';
import { useOptionalMascot } from '../providers/MascotProvider';

const CARD_IMAGES: Record<MascotExpression, string> = {
  smug: yumeSmug,
  bonked: yumeBonked,
  bonkedTooMuch: yumeBonkedTooMuch,
};

export interface MascotCardProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly bonkThreshold?: number;
  readonly onDismissFocusHandoff?: () => void;
}

function isInteractiveOrMenuTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'button, a, input, select, textarea, [role="button"], [data-interactive], .menu-btn, .dropdown-menu'
      )
    )
  );
}

function formatBonkStatus(bonkCount: number, strings: LocaleStrings): string {
  if (bonkCount === 0) {
    return strings.never_bonked || 'Never bonked';
  }
  if (bonkCount === 1 && strings.mascot_menu_bonked_count_one) {
    return strings.mascot_menu_bonked_count_one;
  }
  if (strings.mascot_menu_bonked_count) {
    return strings.mascot_menu_bonked_count.replace('{count}', String(bonkCount));
  }
  return `Bonked ${bonkCount} times`;
}

/**
 * Declarative Hide-and-Seek mascot card rendered inside the library grid.
 */
export const MascotCard = React.forwardRef<HTMLDivElement, MascotCardProps>(function MascotCard(
  {
    bonkThreshold,
    onDismissFocusHandoff,
    className,
    style,
    onClick,
    onDoubleClick,
    onKeyDown,
    onContextMenu,
    ...rest
  },
  forwardedRef
) {
  const mascot = useOptionalMascot();
  const strings = useLocaleStrings(mascot?.storage);

  const expression: MascotExpression = mascot?.expression ?? 'smug';
  const activeBonkQuote = mascot?.activeBonkQuote ?? null;
  const bonkCount = mascot?.bonkCount ?? 0;
  const isCardStarred = mascot?.isCardStarred ?? false;
  const cardTitle = mascot?.getMascotCardTitle(strings) ?? 'Yume-chan';
  const bonkStatus = formatBonkStatus(bonkCount, strings);
  const menuLabel = typeof strings.game_options === 'string' ? strings.game_options : 'Game options';

  const [idleQuote, setIdleQuote] = useState<string>(
    () => mascot?.getNextIdleQuote(strings) ?? 'Zaako~'
  );
  const [isQuoteFading, setIsQuoteFading] = useState(false);
  const [isBonkAnimating, setIsBonkAnimating] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const {
    isMenuOpen,
    menuRef,
    menuBtnRef,
    handleMenuButtonClick,
    handleCardContextMenu,
  } = useCardMenu({ cardRef, onContextMenu });

  const mascotRef = useRef(mascot);
  mascotRef.current = mascot;
  const stringsRef = useRef(strings);
  stringsRef.current = strings;
  const expressionRef = useRef(expression);
  expressionRef.current = expression;
  const isFadingOutRef = useRef(isFadingOut);
  isFadingOutRef.current = isFadingOut;
  const onDismissFocusHandoffRef = useRef(onDismissFocusHandoff);
  onDismissFocusHandoffRef.current = onDismissFocusHandoff;
  const prevExpressionRef = useRef<MascotExpression>(expression);
  const didReturnRef = useRef(false);

  const idleRotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const quoteFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bonkAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [forwardedRef]
  );

  // Refresh idle quote when MascotProvider recovers back to smug
  useEffect(() => {
    const prev = prevExpressionRef.current;
    prevExpressionRef.current = expression;
    if (prev !== 'smug' && expression === 'smug') {
      if (quoteFadeTimerRef.current !== null) {
        clearTimeout(quoteFadeTimerRef.current);
        quoteFadeTimerRef.current = null;
      }
      setIsQuoteFading(false);
      setIdleQuote(mascotRef.current?.getNextIdleQuote(stringsRef.current) ?? 'Zaako~');
    }
  }, [expression]);

  // 10s idle quote rotation with 200ms fade swap while smug and not fading out
  useEffect(() => {
    if (expression !== 'smug' || isFadingOut) {
      if (idleRotateTimerRef.current !== null) {
        clearInterval(idleRotateTimerRef.current);
        idleRotateTimerRef.current = null;
      }
      return;
    }

    idleRotateTimerRef.current = setInterval(() => {
      if (expressionRef.current !== 'smug' || isFadingOutRef.current) return;
      const nextQuote = mascotRef.current?.getNextIdleQuote(stringsRef.current) ?? 'Zaako~';
      setIsQuoteFading(true);
      if (quoteFadeTimerRef.current !== null) {
        clearTimeout(quoteFadeTimerRef.current);
      }
      quoteFadeTimerRef.current = setTimeout(() => {
        quoteFadeTimerRef.current = null;
        if (expressionRef.current !== 'smug' || isFadingOutRef.current) {
          setIsQuoteFading(false);
          return;
        }
        setIdleQuote(nextQuote);
        setIsQuoteFading(false);
      }, 200);
    }, 10000);

    return () => {
      if (idleRotateTimerRef.current !== null) {
        clearInterval(idleRotateTimerRef.current);
        idleRotateTimerRef.current = null;
      }
    };
  }, [expression, isFadingOut]);

  // Clear all local timers and cancel deferred recovery on unmount if not dismissed
  useEffect(() => {
    return () => {
      if (idleRotateTimerRef.current !== null) {
        clearInterval(idleRotateTimerRef.current);
        idleRotateTimerRef.current = null;
      }
      if (quoteFadeTimerRef.current !== null) {
        clearTimeout(quoteFadeTimerRef.current);
        quoteFadeTimerRef.current = null;
      }
      if (bonkAnimTimerRef.current !== null) {
        clearTimeout(bonkAnimTimerRef.current);
        bonkAnimTimerRef.current = null;
      }
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      if (fadeTimerRef.current !== null) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      if (!didReturnRef.current) {
        mascotRef.current?.cancelDeferredRecovery();
      }
    };
  }, []);

  const triggerBonk = useCallback(
    (clientX?: number, clientY?: number, renderedHeight?: number) => {
      if (isFadingOutRef.current) return;

      if (quoteFadeTimerRef.current !== null) {
        clearTimeout(quoteFadeTimerRef.current);
        quoteFadeTimerRef.current = null;
      }
      setIsQuoteFading(false);

      if (bonkAnimTimerRef.current !== null) {
        clearTimeout(bonkAnimTimerRef.current);
      }
      setIsBonkAnimating(true);
      bonkAnimTimerRef.current = setTimeout(() => {
        bonkAnimTimerRef.current = null;
        setIsBonkAnimating(false);
      }, 500);

      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }

      const activeMascot = mascotRef.current;
      const effectiveThreshold = bonkThreshold ?? activeMascot?.hideAndSeekThreshold ?? 5;
      const committed = activeMascot?.bonk({
        clientX,
        clientY,
        renderedHeight,
        deferRecoveryThreshold: effectiveThreshold,
      });

      if (committed && 'streak' in committed && committed.streak >= effectiveThreshold) {
        const committedStreak = committed.streak;
        const committedCooldownMs = committed.accumulatedCooldownMs;

        const completeDismissal = () => {
          if (didReturnRef.current) return;
          didReturnRef.current = true;
          if (
            cardRef.current &&
            typeof document !== 'undefined' &&
            cardRef.current.contains(document.activeElement)
          ) {
            onDismissFocusHandoffRef.current?.();
          }
          mascotRef.current?.returnFromHideAndSeek(committedStreak, committedCooldownMs);
        };

        dismissTimerRef.current = setTimeout(() => {
          dismissTimerRef.current = null;
          const prefersReducedMotion =
            typeof window !== 'undefined' &&
            Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

          if (prefersReducedMotion) {
            completeDismissal();
            return;
          }

          isFadingOutRef.current = true;
          setIsFadingOut(true);
          fadeTimerRef.current = setTimeout(() => {
            fadeTimerRef.current = null;
            completeDismissal();
          }, 400);
        }, 3000);
      }
    },
    [bonkThreshold]
  );

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || isInteractiveOrMenuTarget(e.target)) return;
    triggerBonk(e.clientX, e.clientY);
  };

  const handleCardDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onDoubleClick?.(e);
    if (e.defaultPrevented || isInteractiveOrMenuTarget(e.target)) return;
    triggerBonk(e.clientX, e.clientY);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || isInteractiveOrMenuTarget(e.target)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.repeat) return;
      e.preventDefault();
      const rect = cardRef.current?.getBoundingClientRect();
      const clientX = rect ? rect.left + rect.width / 2 : 0;
      const clientY = rect ? rect.top + rect.height * 0.28 : 0;
      const renderedHeight = rect?.height || 260;
      triggerBonk(clientX, clientY, renderedHeight);
    }
  };

  const rootClassName = [
    'game-card',
    'mascot-game-card',
    isCardStarred ? 'favorited' : '',
    isBonkAnimating ? 'bonk-animating' : '',
    isFadingOut ? 'is-fading-out' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const rootStyle: React.CSSProperties | undefined = isFadingOut
    ? {
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        opacity: 0,
        transform: 'scale(0.8)',
        ...style,
      }
    : style;

  const displayedQuote = activeBonkQuote ?? idleQuote;

  return (
    <div
      ref={handleRootRef}
      className={rootClassName}
      style={rootStyle}
      data-game-key={MASCOT_CARD_KEY}
      tabIndex={0}
      role="article"
      draggable={false}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      onKeyDown={handleCardKeyDown}
      onContextMenu={handleCardContextMenu}
      {...rest}
    >
      <span className={`fav-btn${isCardStarred ? ' active' : ''}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </span>

      <button
        ref={menuBtnRef}
        type="button"
        className="menu-btn"
        aria-label={menuLabel}
        title={menuLabel}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        onClick={handleMenuButtonClick}
        onDoubleClick={(e) => e.preventDefault()}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {isMenuOpen && (
        <div
          ref={menuRef}
          className="dropdown-menu show"
          role="menu"
          aria-label={menuLabel}
        >
          <div role="menuitem" className="dropdown-item non-actionable">
            <span>{strings.card_nothing_here || 'Nothing here~'}</span>
          </div>
        </div>
      )}

      <div className="game-icon mascot-card-icon-container">
        <img
          src={CARD_IMAGES[expression]}
          className="mascot-card-img"
          alt="Yume-chan"
          draggable={false}
        />
      </div>

      <div className="game-title">{cardTitle}</div>
      <div className="game-status mascot-card-status">{bonkStatus}</div>
      <div
        className="game-playtime mascot-card-quote"
        style={isQuoteFading ? { opacity: 0 } : undefined}
      >
        {displayedQuote}
      </div>
    </div>
  );
});
