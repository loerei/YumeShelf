import { useRef, useState } from 'react';
import type React from 'react';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type { AppUpdateNotification } from '../providers/NotificationProvider';

export interface UpdateNotificationCardProps {
  update: AppUpdateNotification;
  onDismiss: () => void;
  onStartDownload: () => Promise<void>;
  onOpenDownloadPage: () => Promise<void>;
  onInstall: () => Promise<void>;
  onOptOut?: () => Promise<void> | void;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

export function UpdateNotificationCard({
  update,
  onDismiss,
  onStartDownload,
  onOpenDownloadPage,
  onInstall,
  onOptOut,
  fallbackFocusRef,
}: UpdateNotificationCardProps) {
  const [isActionPending, setIsActionPending] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const remindLaterBtnRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);

  const handleStartDownload = async () => {
    if (isActionPending) return;
    setIsActionPending(true);
    // Shift focus to surviving action control prior to unmounting download button
    remindLaterBtnRef.current?.focus();
    try {
      await onStartDownload?.();
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[UpdateNotificationCard] Failed to start update download:', {
        error: sanitizeUserPaths(rawMsg),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleOpenDownloadPage = async () => {
    if (isActionPending) return;
    setIsActionPending(true);
    try {
      await onOpenDownloadPage?.();
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[UpdateNotificationCard] Failed to open download page:', {
        error: sanitizeUserPaths(rawMsg),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleInstall = async () => {
    if (isActionPending) return;
    setIsActionPending(true);
    try {
      await onInstall?.();
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[UpdateNotificationCard] Failed to install update:', {
        error: sanitizeUserPaths(rawMsg),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
    } finally {
      setIsActionPending(false);
    }
  };

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
    if (isActionPending) return;
    focusFallbackTarget();
    onDismiss?.();
  };

  if (isCollapsed) {
    return (
      <button
        type="button"
        className="update-notification-handle"
        id="update-notification-handle"
        style={{ display: 'inline-flex' }}
        onClick={() => setIsCollapsed(false)}
      >
        Updates
      </button>
    );
  }

  return (
    <section
      ref={cardRef}
      className="update-notification-card"
      role="region"
      aria-label="Application update"
      aria-live="polite"
      style={{ display: 'flex' }}
    >
      <button
        type="button"
        className="update-notification-dismiss"
        aria-label="Dismiss update notification"
        title="Dismiss update notification"
        aria-disabled={isActionPending}
        style={isActionPending ? { pointerEvents: 'none' } : undefined}
        onClick={handleDismiss}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="update-notification-eyebrow">
        {update.phase === 'error' ? 'Update Error' : 'Update Available'}
      </div>
      <h2 className="update-notification-title">
        {update.releaseName || 'New version available'}
      </h2>
      {update.phase === 'downloading' && (
        <div className="update-notification-progress-container" style={{ display: 'block', margin: '5px 0' }}>
          <div
            className="loading-progress-track"
            role="progressbar"
            aria-valuenow={Math.round((update.progress ?? 0) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="loading-progress-bar"
              style={{ width: `${Math.round((update.progress ?? 0) * 100)}%`, animation: 'none' }}
            />
          </div>
        </div>
      )}
      {update.phase === 'error' && update.error && (
        <p className="update-notification-message update-notification-error" role="alert">
          {update.error}
        </p>
      )}
      {update.releaseNotes && update.phase !== 'error' && (
        <p className="update-notification-message">{update.releaseNotes}</p>
      )}
      <div className="update-notification-actions">
        {onOptOut && (
          <button
            type="button"
            className="text-btn update-notification-tertiary"
            id="update-notification-tertiary-btn"
            aria-disabled={isActionPending}
            style={isActionPending ? { pointerEvents: 'none' } : undefined}
            onClick={() => {
              if (!isActionPending) void onOptOut();
            }}
          >
            Don&apos;t show again
          </button>
        )}
        <button
          ref={remindLaterBtnRef}
          type="button"
          className="small-btn secondary-btn"
          aria-disabled={isActionPending}
          style={isActionPending ? { pointerEvents: 'none' } : undefined}
          onClick={handleDismiss}
        >
          Remind Later
        </button>
        {update.phase === 'error' && (
          <button
            type="button"
            className="small-btn"
            id="update-notification-primary-btn"
            aria-disabled={isActionPending}
            style={isActionPending ? { pointerEvents: 'none' } : undefined}
            onClick={handleStartDownload}
          >
            Retry Download
          </button>
        )}
        {update.phase === 'available' && update.downloadable && (
          <button
            type="button"
            className="small-btn"
            id="update-notification-primary-btn"
            aria-disabled={isActionPending}
            style={isActionPending ? { pointerEvents: 'none' } : undefined}
            onClick={handleStartDownload}
          >
            Download Update
          </button>
        )}
        {update.phase === 'available' && !update.downloadable && (
          <button
            type="button"
            className="small-btn"
            id="update-notification-primary-btn"
            aria-disabled={isActionPending}
            style={isActionPending ? { pointerEvents: 'none' } : undefined}
            onClick={handleOpenDownloadPage}
          >
            Open Download Page
          </button>
        )}
        {update.phase === 'ready' && (
          <button
            type="button"
            className="small-btn"
            id="update-notification-primary-btn"
            aria-disabled={isActionPending}
            style={isActionPending ? { pointerEvents: 'none' } : undefined}
            onClick={handleInstall}
          >
            Restart & Install
          </button>
        )}
      </div>
    </section>
  );
}
