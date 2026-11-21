import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LibraryStoreContext } from '../context/LibraryStateContext';
import { buildDuplicateChipLabel, buildPathSubtitle } from '../game-annotations';
import type { GameEntry } from '../types/game';
import { formatBytes, formatPlaytime, timeSince } from '../utils/formatting';
import { GameIcon } from './GameIcon';

export type GameCardMenuAction =
  | 'rename'
  | 'reveal'
  | 'open-saves'
  | 'set-save-folder'
  | 'reset-save-folder'
  | 'toggle-live-tl'
  | 'tl-sync'
  | 'toggle-bg'
  | 'delete';

export interface GameCardMenuPayload {
  readonly newName?: string;
  readonly targetLang?: string;
}

export interface GameCardProps extends React.HTMLAttributes<HTMLDivElement> {
  game: GameEntry;
  launchMode?: 'single' | 'double';
  showDuplicateChip?: boolean;
  showPath?: boolean;
  isBetaExposed?: boolean;
  onToggleFavorite?: (game: GameEntry) => void;
  onLaunch?: (game: GameEntry) => void;
  onMenuAction?: (action: GameCardMenuAction, game: GameEntry, payload?: GameCardMenuPayload) => void;
  onOpenSaveEditor?: (gameKey: string) => void;
}

function isInteractiveDescendant(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('button, a, input, select, textarea, [role="button"], [data-interactive]')
  );
}

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

export const GameCard = React.memo(
  React.forwardRef<HTMLDivElement, GameCardProps>(function GameCard(
    {
      game,
      launchMode = 'single',
      showDuplicateChip = false,
      showPath = false,
      isBetaExposed,
      onToggleFavorite,
      onLaunch,
      onMenuAction,
      onOpenSaveEditor,
      className,
      style,
      onClick,
      onDoubleClick,
      onKeyDown,
      ...rest
    },
    forwardedRef
  ) {
    const store = useContext(LibraryStoreContext);
    const resolvedBetaExposed =
      isBetaExposed ?? Boolean(store?.getSnapshot().currentLibraryConfig?.exposeBetaOptions);

    const displayName = game.name || game.title || game.folderName || '';
    const gameKey = game.gameKey || game.gameId || '';
    const isFavorited = Boolean(game.favorite);

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [openSubmenu, setOpenSubmenu] = useState<'saves' | 'addons' | null>(null);
    const [translationSupported, setTranslationSupported] = useState<boolean | null>(null);
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
      if (!isMenuOpen) {
        setOpenSubmenu(null);
        return;
      }

      const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
      let cancelled = false;
      if (gameKey && typeof api?.checkTranslationSupport === 'function') {
        void Promise.resolve(api.checkTranslationSupport(gameKey))
          .then((result: unknown) => {
            if (cancelled) return;
            const supported =
              result && typeof result === 'object'
                ? (result as { supported?: unknown }).supported !== false
                : true;
            setTranslationSupported(supported);
          })
          .catch(() => {
            if (!cancelled) setTranslationSupported(true);
          });
      }

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
        cancelled = true;
        document.removeEventListener('pointerdown', handleDocumentPointerDown);
        document.removeEventListener('keydown', handleDocumentKeyDown);
      };
    }, [isMenuOpen, gameKey]);

    const handleToggleFavorite = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onToggleFavorite?.(game);
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
      const trimmed = draftName.trim();
      if (trimmed && trimmed !== displayName) {
        onMenuAction?.('rename', game, { newName: trimmed });
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
      onMenuAction?.(action, game, payload);
    };

    const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || isInteractiveDescendant(e.target)) return;
      if (launchMode === 'single') {
        onLaunch?.(game);
      }
    };

    const handleCardDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onDoubleClick?.(e);
      if (e.defaultPrevented || isInteractiveDescendant(e.target)) return;
      if (launchMode === 'double') {
        onLaunch?.(game);
      }
    };

    const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || isInteractiveDescendant(e.target)) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onLaunch?.(game);
      }
    };

    const combinedClassName = [
      'game-card',
      isFavorited ? 'favorited' : '',
      game.isRunning ? 'running' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const duplicateChip = showDuplicateChip ? buildDuplicateChipLabel(game.duplicateCount) : null;
    const pathSubtitle = showPath ? buildPathSubtitle(game) : '';
    const statusLabel = game.isRunning
      ? DEFAULT_TIME_STRINGS.status_playing
      : timeSince(game.lastPlayed, DEFAULT_TIME_STRINGS);
    const playtimeLabel = formatPlaytime(game.playtime);
    const favLabel = isFavorited ? 'Remove from favorites' : 'Add to favorites';
    const engineName = (game as { engine?: string }).engine || '';
    const sizeLabel = formatBytes((game as { sizeBytes?: number }).sizeBytes);
    const tooltipMeta = [engineName, sizeLabel].filter(Boolean).join(' • ') || undefined;
    const tooltipSubtitle =
      game.relativePathFullDisplay ||
      game.relativePathDisplay ||
      game.relativePath ||
      game.folderPath ||
      undefined;

    return (
      <div
        ref={handleRootRef}
        className={combinedClassName}
        style={style}
        data-game-key={gameKey}
        data-tooltip={displayName || undefined}
        data-tooltip-meta={tooltipMeta}
        data-tooltip-subtitle={tooltipSubtitle}
        tabIndex={0}
        role="article"
        onClick={handleCardClick}
        onDoubleClick={handleCardDoubleClick}
        onKeyDown={handleCardKeyDown}
        {...rest}
      >
        <button
          type="button"
          className={`fav-btn ${isFavorited ? 'active' : ''}`.trim()}
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
          aria-label="Game options"
          title="Game options"
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
          <div ref={menuRef} className="dropdown-menu show" role="menu" aria-label="Game options">
            <button
              type="button"
              role="menuitem"
              className="dropdown-item action-rename"
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
              className="dropdown-item action-reveal"
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

            <div
              role="menuitem"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={openSubmenu === 'saves'}
              className={`dropdown-item has-submenu action-saves-group${openSubmenu === 'saves' ? ' submenu-open' : ''}`}
              onMouseEnter={() => setOpenSubmenu('saves')}
              onMouseLeave={() => setOpenSubmenu((prev) => (prev === 'saves' ? null : prev))}
              onClick={(e) => {
                if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('.dropdown-submenu')) {
                  e.preventDefault();
                  setOpenSubmenu((prev) => (prev === 'saves' ? null : 'saves'));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  setOpenSubmenu('saves');
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setOpenSubmenu(null);
                }
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
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span>Saves</span>
              <div className={`dropdown-submenu${openSubmenu === 'saves' ? ' show' : ''}`} role="menu" aria-label="Saves">
                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item action-save-editor"
                  onClick={(e) => {
                    e.preventDefault();
                    menuBtnRef.current?.focus();
                    setIsMenuOpen(false);
                    onOpenSaveEditor?.(gameKey);
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
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  </svg>
                  <span>Open Save Editor</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item action-save-folder"
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

                <button
                  type="button"
                  role="menuitem"
                  className="dropdown-item action-set-save-folder"
                  onClick={(e) => {
                    e.preventDefault();
                    handleMenuSelect('set-save-folder');
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
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  <span>Set Save Folder Path</span>
                </button>

                {Boolean(game.saveFolderOverride) && (
                  <button
                    type="button"
                    role="menuitem"
                    className="dropdown-item action-reset-save-folder"
                    onClick={(e) => {
                      e.preventDefault();
                      handleMenuSelect('reset-save-folder');
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
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                    <span>Reset to Auto-detect</span>
                  </button>
                )}
              </div>
            </div>

            <div
              role="menuitem"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={openSubmenu === 'addons'}
              className={`dropdown-item has-submenu action-addons-group${openSubmenu === 'addons' ? ' submenu-open' : ''}`}
              onMouseEnter={() => setOpenSubmenu('addons')}
              onMouseLeave={() => setOpenSubmenu((prev) => (prev === 'addons' ? null : prev))}
              onClick={(e) => {
                if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('.dropdown-submenu')) {
                  e.preventDefault();
                  setOpenSubmenu((prev) => (prev === 'addons' ? null : 'addons'));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  setOpenSubmenu('addons');
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setOpenSubmenu(null);
                }
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
                <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <span>Add-ons</span>
              <div className={`dropdown-submenu${openSubmenu === 'addons' ? ' show' : ''}`} role="menu" aria-label="Add-ons">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={Boolean(game.autoTranslate)}
                  aria-disabled={translationSupported === false || undefined}
                  disabled={translationSupported === false}
                  className={`dropdown-item action-live-translate${translationSupported === false ? ' disabled' : ''}`}
                  style={translationSupported === false ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    if (translationSupported === false) return;
                    handleMenuSelect('toggle-live-tl');
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
                    {game.autoTranslate ? (
                      <>
                        <polyline points="9 11 12 14 22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </>
                    ) : (
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    )}
                  </svg>
                  <span>{translationSupported === false ? 'Not yet supported' : 'Live Translation'}</span>
                </button>

                {resolvedBetaExposed && (
                  <button
                    type="button"
                    role="menuitem"
                    aria-disabled={translationSupported === false || undefined}
                    disabled={translationSupported === false}
                    className={`dropdown-item action-pre-translate${translationSupported === false ? ' disabled' : ''}`}
                    style={translationSupported === false ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      if (translationSupported === false) return;
                      handleMenuSelect('tl-sync');
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
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    </svg>
                    <span>{translationSupported === false ? 'Not yet supported' : 'Pre-Translate Game'}</span>
                  </button>
                )}

                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={Boolean(game.runInBackground)}
                  className="dropdown-item action-background-run"
                  onClick={(e) => {
                    e.preventDefault();
                    handleMenuSelect('toggle-bg');
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
                    {game.runInBackground ? (
                      <>
                        <polyline points="9 11 12 14 22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </>
                    ) : (
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    )}
                  </svg>
                  <span>Run in Background</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              role="menuitem"
              className="dropdown-item danger action-delete"
              onClick={(e) => {
                e.preventDefault();
                handleMenuSelect('delete');
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
                <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
              </svg>
              <span>Delete</span>
            </button>
          </div>
        )}

        <GameIcon game={game} />

        {duplicateChip && <div className="game-duplicate-chip">{duplicateChip}</div>}

        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            className="rename-input"
            value={draftName}
            autoFocus
            aria-label="Rename game title"
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
        {pathSubtitle && (
          <div className="game-path" title={pathSubtitle}>
            {pathSubtitle}
          </div>
        )}
      </div>
    );
  })
);
