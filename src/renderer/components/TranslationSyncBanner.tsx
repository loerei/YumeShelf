import { useState } from 'react';
import type React from 'react';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type { TranslationSyncNotification } from '../providers/NotificationProvider';

export interface TranslationSyncBannerProps {
  translation: TranslationSyncNotification;
  onDismiss: () => void;
  onCancelSync?: (gameKey: string) => Promise<void>;
  onMoveQueue?: (params: { gameKey: string; direction: 'up' | 'down' }) => Promise<void>;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

export function TranslationSyncBanner({
  translation,
  onDismiss,
  onCancelSync,
  fallbackFocusRef,
}: TranslationSyncBannerProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const isError = translation.status === 'error' || translation.status === 'sync-error';
  const isProgress =
    typeof translation.progress === 'number' &&
    (translation.status === 'downloading' || translation.status === 'syncing');

  const focusFallbackTarget = () => {
    const target =
      fallbackFocusRef?.current ??
      document.querySelector<HTMLElement>('#react-root') ??
      document.querySelector<HTMLElement>('.library-grid');
    if (target) {
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }
      target.focus();
    }
  };

  const handleDismiss = () => {
    if (isCancelling) return;
    focusFallbackTarget();
    onDismiss();
  };

  const handleCancel = async () => {
    if (isCancelling || !onCancelSync || !translation.gameKey) return;
    setIsCancelling(true);
    try {
      await onCancelSync(translation.gameKey);
      // Physical focus retention: shift focus to main application container ONLY upon successful cancellation resolution
      focusFallbackTarget();
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      const sanitizedMsg = sanitizeUserPaths(rawMsg);
      const sanitizedStack = error instanceof Error && error.stack ? sanitizeUserPaths(error.stack) : undefined;
      console.error('[TranslationSyncBanner] Failed to cancel translation sync:', {
        gameKey: sanitizeUserPaths(translation.gameKey),
        error: sanitizedMsg,
        stack: sanitizedStack,
      });
      setIsCancelling(false);
      // Active focus remains safely on the Cancel button so user can retry or inspect error
    }
  };

  return (
    <aside
      className={`translation-sync-banner ${isError ? 'is-error' : ''}`}
      role="region"
      aria-label="Translation sync progress"
      aria-live="polite"
    >
      <div className="translation-sync-header">
        <span className="translation-sync-title">
          {isError ? 'Translation Error' : 'Translating Game Content'}
        </span>
        <button
          type="button"
          className="translation-sync-dismiss"
          aria-label="Dismiss translation status"
          title="Dismiss translation status"
          aria-disabled={isCancelling}
          style={isCancelling ? { pointerEvents: 'none' } : undefined}
          onClick={handleDismiss}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {isProgress && (
        <div
          className="translation-progress-track"
          role="progressbar"
          aria-valuenow={Math.round((translation.progress ?? 0) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="translation-progress-bar"
            style={{ width: `${Math.round((translation.progress ?? 0) * 100)}%` }}
          />
        </div>
      )}
      {translation.error && (
        <p className="translation-sync-error">{translation.error}</p>
      )}
      {translation.gameKey && (translation.status === 'syncing' || translation.status === 'downloading') && onCancelSync && (
        <div className="translation-sync-actions">
          <button
            type="button"
            className="small-btn secondary-btn"
            aria-disabled={isCancelling ? 'true' : undefined}
            style={{
              pointerEvents: isCancelling ? 'none' : undefined,
              opacity: isCancelling ? 0.6 : 1,
              cursor: isCancelling ? 'not-allowed' : 'pointer',
            }}
            onClick={handleCancel}
          >
            {isCancelling ? 'Cancelling...' : 'Cancel Sync'}
          </button>
        </div>
      )}
    </aside>
  );
}
