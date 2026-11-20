import { useEffect, useRef, useState } from 'react';

export interface ToastPillProps {
  message: string | null;
  durationMs?: number;
  toastId?: number;
  onDismiss: () => void;
}

const DEFAULT_TOAST_DURATION_MS = 3200;
const HIDE_TRANSITION_MS = 300;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ToastPill({
  message,
  durationMs = DEFAULT_TOAST_DURATION_MS,
  toastId,
  onDismiss,
}: ToastPillProps) {
  const [phase, setPhase] = useState<'visible' | 'hiding'>('visible');
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const clearTimers = () => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  useEffect(() => {
    clearTimers();
    if (!message) {
      return;
    }

    setPhase('visible');

    const safeDuration =
      typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0
        ? durationMs
        : DEFAULT_TOAST_DURATION_MS;

    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      if (prefersReducedMotion()) {
        onDismissRef.current();
        return;
      }
      setPhase('hiding');
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        onDismissRef.current();
      }, HIDE_TRANSITION_MS);
    }, safeDuration);

    return () => {
      clearTimers();
    };
  }, [message, durationMs, toastId]);

  if (!message) {
    return null;
  }

  const handleManualDismiss = () => {
    clearTimers();
    onDismissRef.current();
  };

  const hostClass =
    phase === 'hiding'
      ? 'toast-pill-host toast-pill-hiding'
      : 'toast-pill-host toast-pill-visible';

  return (
    <div className={hostClass} role="status" aria-live="polite">
      <div className="toast-pill">
        <span className="toast-pill-text">{message}</span>
        <button
          type="button"
          className="toast-pill-dismiss"
          aria-label="Dismiss notification"
          onClick={handleManualDismiss}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
