import { useEffect, useLayoutEffect, useRef } from 'react';

const FLIP_DURATION_MS = 260;
const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export interface UseCardLayoutFlipOptions {
  readonly cardRefs: React.RefObject<Map<string, HTMLElement>>;
  readonly structuralLayoutRevision: number;
  readonly isDragging: boolean;
  readonly currentSort: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function resolveFlipKey(scopedKey: string, currentSort: string): string {
  if (currentSort === 'folder') {
    return scopedKey;
  }
  const sepIdx = scopedKey.indexOf('::');
  return sepIdx !== -1 ? scopedKey.slice(sepIdx + 2) : scopedKey;
}

/**
 * Animates non-drag card repositioning (favorite toggles, sort changes, tab/filter updates)
 * using strict two-phase read-before-write FLIP batching via the Web Animations API.
 *
 * Strictly suppressed during active `@dnd-kit` drag sessions and when `prefers-reduced-motion: reduce`
 * is active, and keyed on `structuralLayoutRevision` so 1-second playtime ticks perform zero layout reads.
 */
export function useCardLayoutFlip({
  cardRefs,
  structuralLayoutRevision,
  isDragging,
  currentSort,
}: UseCardLayoutFlipOptions): void {
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const activeAnimationsRef = useRef<Map<string, Animation>>(new Map());
  const wasDraggingRef = useRef(false);
  const hasSnapshotRef = useRef(false);
  const prevIsFolderModeRef = useRef<boolean | null>(null);

  const cancelActiveAnimations = () => {
    if (activeAnimationsRef.current.size === 0) return;
    for (const anim of activeAnimationsRef.current.values()) {
      if (typeof anim.cancel === 'function') {
        anim.cancel();
      }
    }
    activeAnimationsRef.current.clear();
  };

  useEffect(() => {
    return () => {
      cancelActiveAnimations();
    };
  }, []);

  useLayoutEffect(() => {
    cancelActiveAnimations();

    if (isDragging) {
      wasDraggingRef.current = true;
      return;
    }

    const refsMap = cardRefs.current;
    if (!refsMap) return;

    // Phase 1 (Read-Only): measure all connected, non-inert cards before any DOM writes
    const nextRects = new Map<string, DOMRect>();
    const connectedElements = new Map<string, HTMLElement>();
    for (const [scopedKey, el] of refsMap.entries()) {
      if (!el.isConnected || el.closest('[inert]')) continue;
      const flipKey = resolveFlipKey(scopedKey, currentSort);
      nextRects.set(flipKey, el.getBoundingClientRect());
      connectedElements.set(flipKey, el);
    }

    const isFolderMode = currentSort === 'folder';
    const isModeTransition =
      prevIsFolderModeRef.current !== null && prevIsFolderModeRef.current !== isFolderMode;
    prevIsFolderModeRef.current = isFolderMode;

    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      prevRectsRef.current = nextRects;
      return;
    }

    if (!hasSnapshotRef.current || isModeTransition || prefersReducedMotion()) {
      hasSnapshotRef.current = true;
      prevRectsRef.current = nextRects;
      return;
    }

    // Phase 2 (Write-Only): apply WAAPI FLIP transforms without interleaving layout reads
    const prevRects = prevRectsRef.current;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

    for (const [key, nextRect] of nextRects.entries()) {
      const prevRect = prevRects.get(key);
      if (!prevRect) continue;

      const dx = prevRect.left - nextRect.left;
      const dy = prevRect.top - nextRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      if (viewportHeight > 0) {
        const prevOffscreen = prevRect.bottom < 0 || prevRect.top > viewportHeight;
        const nextOffscreen = nextRect.bottom < 0 || nextRect.top > viewportHeight;
        if (prevOffscreen && nextOffscreen) continue;
      }

      const el = connectedElements.get(key);
      if (!el || typeof el.animate !== 'function') continue;

      const anim = el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0px, 0px)' },
        ],
        {
          duration: FLIP_DURATION_MS,
          easing: FLIP_EASING,
        }
      );

      if (anim) {
        activeAnimationsRef.current.set(key, anim);
        const cleanup = () => {
          if (activeAnimationsRef.current.get(key) === anim) {
            activeAnimationsRef.current.delete(key);
          }
        };
        anim.onfinish = cleanup;
        anim.oncancel = cleanup;
      }
    }

    prevRectsRef.current = nextRects;
  }, [structuralLayoutRevision, isDragging, currentSort]);
}
