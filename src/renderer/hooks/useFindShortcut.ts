import { useEffect, useRef } from 'react';

function resolveTargetElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    return document.activeElement;
  }
  return null;
}

/**
 * Returns true when an event target or active element sits inside an open dialog.
 */
export function isInsideDialog(target: EventTarget | null): boolean {
  return Boolean(resolveTargetElement(target)?.closest('[role="dialog"]'));
}

/**
 * Matches Ctrl+F (Windows/Linux) or Cmd+F (macOS) without Alt or Shift modifiers.
 */
export function isFindShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f';
}

/**
 * Focuses and selects the resolved search input on Ctrl+F / Cmd+F unless a dialog is active.
 */
export function useFindShortcut(
  getTarget: () => HTMLInputElement | null,
  enabled = true
): void {
  const getTargetRef = useRef(getTarget);
  getTargetRef.current = getTarget;

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFindShortcut(e) || isInsideDialog(e.target)) return;
      const input = getTargetRef.current();
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled]);
}
