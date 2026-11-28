import { useEffect, useRef } from 'react';
import type React from 'react';
import { type StackLibraryViewItem, resolveStackByGroupKey } from '../../library-stacks';
import { useAllGames } from '../../hooks/useLibraryState';
import { getGameKey } from '../../library-order';
import type { GameEntry } from '../../types/game';
import { GameCard, type GameCardMenuAction, type GameCardMenuPayload } from '../GameCard';
import { Modal } from './Modal';

export interface DuplicateStackModalProps {
  isOpen: boolean;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  groupKey?: string | null;
  stack?: StackLibraryViewItem | null;
  focusTargetKey?: string | null;
  onFocusHandled?: () => void;
  onClose: (targetFocusKey?: string) => void;
  onLaunch?: (game: GameEntry) => void;
  onOpenSaveEditor?: (gameKey: string) => void;
  onToggleFavorite?: (game: GameEntry) => void;
  onMenuAction?: (action: GameCardMenuAction, game: GameEntry, payload?: GameCardMenuPayload) => void;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

export type DuplicateStackModalContentProps = Omit<DuplicateStackModalProps, 'isOpen'>;

export function DuplicateStackModal({
  isOpen,
  containerRef,
  groupKey,
  stack: stackProp,
  focusTargetKey,
  onFocusHandled,
  onClose,
  onLaunch,
  onOpenSaveEditor,
  onToggleFavorite,
  onMenuAction,
  fallbackFocusRef,
}: DuplicateStackModalProps) {
  if (!isOpen) {
    return null;
  }
  return (
    <DuplicateStackModalContent
      containerRef={containerRef}
      groupKey={groupKey}
      stack={stackProp}
      focusTargetKey={focusTargetKey}
      onFocusHandled={onFocusHandled}
      onClose={onClose}
      onLaunch={onLaunch}
      onOpenSaveEditor={onOpenSaveEditor}
      onToggleFavorite={onToggleFavorite}
      onMenuAction={onMenuAction}
      fallbackFocusRef={fallbackFocusRef}
    />
  );
}

export function DuplicateStackModalContent({
  containerRef: externalContainerRef,
  groupKey,
  stack: stackProp,
  focusTargetKey,
  onFocusHandled,
  onClose,
  fallbackFocusRef,
  ...cardProps
}: DuplicateStackModalContentProps) {
  const allGames = useAllGames();
  const stack = stackProp ?? (groupKey ? resolveStackByGroupKey(allGames, groupKey) : null);
  const instanceRefs = useRef(new Map<string, HTMLElement>());
  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const resolvedContainerRef = externalContainerRef ?? internalContainerRef;
  const knownInstanceKeysRef = useRef<Set<string>>(new Set());

  // Reset known instance keys when groupKey changes across in-place modal payload updates
  useEffect(() => {
    knownInstanceKeysRef.current.clear();
  }, [groupKey]);

  // Populate known instance keys while stack is active (kept out of render body for React 19 StrictMode purity)
  useEffect(() => {
    if (!stack?.games) return;
    for (const g of stack.games) {
      const k = getGameKey(g);
      if (k) knownInstanceKeysRef.current.add(k);
    }
  }, [stack, groupKey]);

  // Only process focus targeting while stack is valid; do not consume targetKey during dissolution
  useEffect(() => {
    if (!stack || !focusTargetKey) return;
    const targetEl = instanceRefs.current.get(focusTargetKey);
    if (targetEl) {
      targetEl.focus();
    } else {
      resolvedContainerRef.current?.focus();
    }
    onFocusHandled?.();
  }, [stack, focusTargetKey, onFocusHandled, resolvedContainerRef]);

  // When stack dissolves to <= 1 instance, trigger close with surviving game key
  useEffect(() => {
    if (!stack) {
      const survivingGame = allGames.find((g) => {
        const k = getGameKey(g);
        if (k && knownInstanceKeysRef.current.has(k)) return true;
        return g.instances?.some((inst) => {
          const ik = typeof inst === 'string' ? inst : getGameKey(inst);
          return ik && knownInstanceKeysRef.current.has(ik);
        });
      });
      const targetKey = survivingGame ? getGameKey(survivingGame) : undefined;
      onClose(targetKey);
    }
  }, [stack, allGames, onClose]);

  if (!stack) {
    return null;
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      modalType="duplicate-stack"
      title={stack.primaryGame.name}
      panelClassName="stack-overlay-panel"
      fallbackFocusRef={fallbackFocusRef}
    >
      <Modal.Header>
        <span>{stack.primaryGame.name}</span>
        <span className="duplicate-stack-count">{stack.games?.length ?? 0} versions installed</span>
      </Modal.Header>
      <Modal.Body>
        <div ref={resolvedContainerRef} className="duplicate-stack-dialog" tabIndex={-1}>
          <div className="duplicate-stack-instances stack-overlay-grid">
            {stack.games?.map((game: GameEntry, index: number) => {
              const instanceKey = getGameKey(game);
              return (
                <div
                  key={instanceKey}
                  className="stack-overlay-item"
                  style={{ '--stack-delay': `${index * 40}ms` } as React.CSSProperties}
                >
                  <GameCard
                    ref={(el) => {
                      if (el) instanceRefs.current.set(instanceKey, el);
                      else instanceRefs.current.delete(instanceKey);
                    }}
                    className="stack-overlay-card"
                    game={game}
                    showPath={false}
                    showDuplicateChip={false}
                    launchMode="double"
                    {...cardProps}
                  />
                  <div className="stack-overlay-location">{game.locationLabel || ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
