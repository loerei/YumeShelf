import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LibraryViewItem } from '../library-stacks';
import type { GameEntry } from '../types/game';
import { formatBytes, formatPlaytime, timeSince } from '../utils/formatting';
import type { GameCardMenuAction, GameCardMenuPayload } from './GameCard';
import { GameIcon } from './GameIcon';

const DEFAULT_TIME_STRINGS = {
  status_playing: 'Playing',
  status_never: 'Never played',
  status_recent: 'Just now',
  status_mins: 'm ago',
  status_hours: 'h ago',
  status_days: 'd ago',
  status_months: ' months ago',
  status_years: 'y ago',
};

export interface StackCardProps extends React.HTMLAttributes<HTMLDivElement> {
  stack: LibraryViewItem;
  onOpenStack?: (stack: LibraryViewItem) => void;
  onToggleFavorite?: (stack: LibraryViewItem) => void;
  onMenuAction?: (action: GameCardMenuAction, game: GameEntry, payload?: GameCardMenuPayload) => void;
}

function isInteractiveDescendant(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('button, a, input, select, textarea, [role="button"], [data-interactive]')
  );
}

export const StackCard = React.memo(
  React.forwardRef<HTMLDivElement, StackCardProps>(function StackCard(
    {
      stack,
      onOpenStack,
      onToggleFavorite,
      onMenuAction,
      className,
      style,
      onClick,
      onKeyDown,
      ...rest
    },
    forwardedRef
  ) {
    const primaryGame = stack.primaryGame;
    const displayName = primaryGame.name || primaryGame.title || primaryGame.folderName || '';
    const isFavorited = Boolean(stack.favorite);
    const isRunning = stack.games.some((g) => Boolean(g.isRunning));

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [draftName, setDraftName] = useState(displayName);

    const cardRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const menuBtnRef = useRef<HTMLButtonElement | null>(null);
    const renameInputRef = useRef<HTMLInputElement | null>(null);
    const isCancellingRef = useRef(false);
    const isCommittingRef = useRef(false);

    const handleRootRef = (node: HTMLDivElement | null) => {
      cardRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    };

    useEffect(() => {
      setDraftName(displayName);
    }, [displayName]);

    useLayoutEffect(() => {
      if (isRenaming) {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }
    }, [isRenaming]);

    useEffect(() => {
      if (!isMenuOpen) return;

      const handleDocumentPointerDown = (e: PointerEvent) => {
        const target = e.target as Node | null;
        if (
          menuRef.current &&
          target &&
          !menuRef.current.contains(target) &&
          menuBtnRef.current &&
          !menuBtnRef.current.contains(target)
        ) {
          setIsMenuOpen(false);
        }
      };

      const handleDocumentKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsMenuOpen(false);
          menuBtnRef.current?.focus();
        }
      };

      document.addEventListener('pointerdown', handleDocumentPointerDown);
      document.addEventListener('keydown', handleDocumentKeyDown);
      return () => {
        document.removeEventListener('pointerdown', handleDocumentPointerDown);
        document.removeEventListener('keydown', handleDocumentKeyDown);
      };
    }, [isMenuOpen]);

    const handleToggleFavorite = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onToggleFavorite?.(stack);
    };

    const handleStartRename = () => {
      setIsMenuOpen(false);
      isCancellingRef.current = false;
      isCommittingRef.current = false;
      setDraftName(displayName);
      setIsRenaming(true);
    };

    const handleRenameCommit = (options?: { restoreFocus?: boolean }) => {
      if (isCancellingRef.current || isCommittingRef.current) return;
      isCommittingRef.current = true;
      const trimmedName = draftName.trim();
      if (trimmedName.length > 0 && trimmedName !== displayName) {
        onMenuAction?.('rename', primaryGame, { newName: trimmedName });
      } else {
        setDraftName(displayName);
      }
      setIsRenaming(false);
      if (options?.restoreFocus ?? true) {
        cardRef.current?.focus();
      }
    };

    const handleRenameCancel = () => {
      if (isCancellingRef.current || isCommittingRef.current) return;
      isCancellingRef.current = true;
      setDraftName(displayName);
      setIsRenaming(false);
      menuBtnRef.current?.focus();
    };

    const handleMenuSelect = (action: GameCardMenuAction, payload?: GameCardMenuPayload) => {
      menuBtnRef.current?.focus();
      setIsMenuOpen(false);
      onMenuAction?.(action, primaryGame, payload);
    };

    const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || isInteractiveDescendant(e.target)) return;
      onOpenStack?.(stack);
    };

    const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || isInteractiveDescendant(e.target)) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpenStack?.(stack);
      }
    };

    const combinedClassName = [
      'game-card',
      'stack-card',
      isFavorited ? 'favorited' : '',
      isRunning ? 'running' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const favLabel = isFavorited ? 'Remove from favorites' : 'Add to favorites';
    const uniqueLocations = Array.from(
      new Set(stack.games.map((g) => g.locationLabel).filter(Boolean))
    );
    const locationSummary =
      uniqueLocations.length > 1
        ? `${uniqueLocations[0]} +${uniqueLocations.length - 1}`
        : uniqueLocations[0] || primaryGame.locationLabel || '';
    const statusLabel = isRunning
      ? DEFAULT_TIME_STRINGS.status_playing
      : timeSince(primaryGame.lastPlayed, DEFAULT_TIME_STRINGS);
    const playtimeLabel = formatPlaytime(primaryGame.playtime);
    const engineName = (primaryGame as { engine?: string }).engine || '';
    const sizeLabel = formatBytes((primaryGame as { sizeBytes?: number }).sizeBytes);
    const tooltipMeta = [engineName, sizeLabel].filter(Boolean).join(' • ') || undefined;
    const tooltipSubtitle = primaryGame.fullLocationLabel || locationSummary || undefined;

    return (
      <div
        ref={handleRootRef}
        className={combinedClassName}
        style={style}
        data-group-key={stack.groupKey}
        data-game-key={stack.representativeKey}
        data-tooltip={displayName || undefined}
        data-tooltip-meta={tooltipMeta}
        data-tooltip-subtitle={tooltipSubtitle}
        tabIndex={0}
        role="region"
        aria-label={`Game stack: ${displayName} (${stack.stackSize} instances)`}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        {...rest}
      >
        <button
          type="button"
          className={`fav-btn stack-fav-indicator ${isFavorited ? 'active' : ''}`.trim()}
          aria-label={favLabel}
          aria-pressed={isFavorited}
          title={favLabel}
          onClick={handleToggleFavorite}
          onDoubleClick={(e) => e.preventDefault()}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>

        <button
          ref={menuBtnRef}
          type="button"
          className="menu-btn"
          aria-label="Stack options"
          title="Stack options"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={(e) => {
            e.preventDefault();
            setIsMenuOpen((prev) => !prev);
          }}
          onDoubleClick={(e) => e.preventDefault()}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>

        {isMenuOpen && (
          <div ref={menuRef} className="dropdown-menu show" role="menu" aria-label="Stack options">
            <button
              type="button"
              role="menuitem"
              className="dropdown-item"
              onClick={(e) => {
                e.preventDefault();
                handleStartRename();
              }}
            >
              <svg
                className="dropdown-item-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
              <span>Rename</span>
            </button>

            <button
              type="button"
              role="menuitem"
              className="dropdown-item"
              onClick={(e) => {
                e.preventDefault();
                handleMenuSelect('reveal');
              }}
            >
              <svg
                className="dropdown-item-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M3 7h5l2 2h11v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2" />
              </svg>
              <span>Reveal</span>
            </button>

            <button
              type="button"
              role="menuitem"
              className="dropdown-item"
              onClick={(e) => {
                e.preventDefault();
                handleMenuSelect('open-saves');
              }}
            >
              <svg
                className="dropdown-item-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" />
              </svg>
              <span>Open Save Folder</span>
            </button>
          </div>
        )}

        <GameIcon game={primaryGame} />

        <div className="game-duplicate-chip">{stack.stackSize}x</div>

        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            className="rename-input"
            value={draftName}
            autoFocus
            aria-label="Rename stack title"
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRenameCommit({ restoreFocus: true });
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleRenameCancel();
              }
            }}
            onBlur={(e) => {
              handleRenameCommit({ restoreFocus: !e.relatedTarget });
            }}
          />
        ) : (
          <div className="game-title" title={displayName}>
            {displayName}
          </div>
        )}

        <div className="game-status">{statusLabel}</div>
        <div className="game-playtime">{playtimeLabel}</div>
        {locationSummary && <div className="game-path">{locationSummary}</div>}
      </div>
    );
  })
);
