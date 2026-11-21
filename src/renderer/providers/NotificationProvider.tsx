import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type { ElectronAPI } from '../../shared/types/ipc';
import { ToastPill } from '../components/ToastPill';
import { UpdateNotificationCard } from '../components/UpdateNotificationCard';
import { TranslationSyncBanner } from '../components/TranslationSyncBanner';

export type AppUpdatePhase = 'available' | 'downloading' | 'ready' | 'error';

export type AppUpdateNotification =
  | {
      readonly phase: 'available';
      readonly releaseName?: string;
      readonly releaseNotes?: string;
      readonly releaseUrl?: string;
      readonly downloadable?: boolean;
    }
  | {
      readonly phase: 'downloading';
      readonly releaseName?: string;
      readonly releaseNotes?: string;
      readonly releaseUrl?: string;
      readonly progress?: number;
    }
  | {
      readonly phase: 'ready';
      readonly releaseName?: string;
      readonly releaseNotes?: string;
      readonly releaseUrl?: string;
    }
  | {
      readonly phase: 'error';
      readonly releaseName?: string;
      readonly releaseNotes?: string;
      readonly releaseUrl?: string;
      readonly error: string;
    };

export interface RawAppUpdatePayload {
  phase:
    | 'update-available'
    | 'download-started'
    | 'download-progress'
    | 'download-ready'
    | 'download-failed'
    | 'install-preparing'
    | 'install-deferred'
    | 'install-handoff';
  update?: {
    releaseName?: string;
    releaseNotes?: string;
    releaseUrl?: string;
    downloadable?: boolean;
    downloadReady?: boolean;
  };
  progress?: number;
  downloaded?: number;
  total?: number;
  error?: string;
  reason?: string;
}

export function clampProgress(val: unknown): number | undefined {
  if (typeof val !== 'number' || !Number.isFinite(val)) return undefined;
  return Math.max(0, Math.min(1, val));
}

export function parseAppUpdatePayload(raw: unknown): AppUpdateNotification | null {
  if (!raw || typeof raw !== 'object' || !('phase' in raw)) return null;
  const payload = raw as RawAppUpdatePayload;
  const update = payload.update;
  switch (payload.phase) {
    case 'update-available':
      return {
        phase: 'available',
        releaseName: update?.releaseName,
        releaseNotes: update?.releaseNotes,
        releaseUrl: update?.releaseUrl,
        downloadable: update?.downloadable !== false,
      };
    case 'download-started':
    case 'download-progress': {
      const directProgress = clampProgress(payload.progress);
      const calculatedProgress =
        typeof payload.downloaded === 'number' &&
        typeof payload.total === 'number' &&
        Number.isFinite(payload.downloaded) &&
        Number.isFinite(payload.total) &&
        payload.total > 0 &&
        payload.downloaded >= 0
          ? clampProgress(payload.downloaded / payload.total)
          : undefined;
      const progress = directProgress ?? calculatedProgress;
      return {
        phase: 'downloading',
        releaseName: update?.releaseName,
        releaseNotes: update?.releaseNotes,
        releaseUrl: update?.releaseUrl,
        progress,
      };
    }
    case 'download-ready':
    case 'install-deferred':
    case 'install-preparing':
    case 'install-handoff':
      return {
        phase: 'ready',
        releaseName: update?.releaseName,
        releaseNotes: update?.releaseNotes,
        releaseUrl: update?.releaseUrl,
      };
    case 'download-failed':
      return {
        phase: 'error',
        releaseName: update?.releaseName,
        releaseNotes: update?.releaseNotes,
        releaseUrl: update?.releaseUrl,
        error:
          payload.error || payload.reason
            ? sanitizeUserPaths(String(payload.error || payload.reason))
            : 'Update download failed',
      };
    default:
      return null;
  }
}

export type TranslationSyncStatus =
  | 'preparing'
  | 'downloading'
  | 'extracting-binaries'
  | 'ready'
  | 'error'
  | 'sync-extracting'
  | 'syncing'
  | 'synced'
  | 'sync-error'
  | 'sync-cancelled'
  | 'sync-queued';

export interface TranslationQueueItem {
  gameKey: string;
  title?: string;
}

export interface TranslationSyncNotification {
  status: TranslationSyncStatus;
  gameKey?: string;
  progress?: number;
  queue?: TranslationQueueItem[];
  error?: string;
}

const VALID_TRANSLATION_STATUSES = new Set<TranslationSyncStatus>([
  'preparing',
  'downloading',
  'extracting-binaries',
  'ready',
  'error',
  'sync-extracting',
  'syncing',
  'synced',
  'sync-error',
  'sync-cancelled',
  'sync-queued',
]);

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function parseTranslationStatusPayload(raw: unknown): TranslationSyncNotification | null {
  if (!raw || typeof raw !== 'object' || !('status' in raw)) return null;
  const payload = raw as Record<string, any>;
  if (!VALID_TRANSLATION_STATUSES.has(payload.status)) return null;

  const sanitizedQueue = Array.isArray(payload.queue)
    ? payload.queue
        .filter((item): item is Record<string, any> =>
          Boolean(
            item &&
              typeof item === 'object' &&
              typeof item.gameKey === 'string' &&
              item.gameKey.trim().length > 0 &&
              !DANGEROUS_KEYS.has(item.gameKey.trim())
          )
        )
        .map((item) => ({
          gameKey: String(item.gameKey).trim(),
          title:
            typeof item.title === 'string' && item.title.trim().length > 0
              ? item.title.trim()
              : undefined,
        }))
    : undefined;

  const parsedProgress = clampProgress(payload.progress);
  const progress =
    parsedProgress !== undefined
      ? parsedProgress
      : payload.status === 'synced' || payload.status === 'ready'
        ? 1
        : undefined;

  return {
    status: payload.status,
    gameKey: typeof payload.gameKey === 'string' ? payload.gameKey : undefined,
    progress,
    queue: sanitizedQueue,
    error: typeof payload.error === 'string' ? sanitizeUserPaths(payload.error) : undefined,
  };
}

export interface NotificationContextValue {
  showToast: (message: string, durationMs?: number) => void;
  activeUpdate: AppUpdateNotification | null;
  activeTranslation: TranslationSyncNotification | null;
  dismissUpdate: () => void;
  dismissTranslation: () => void;
  startUpdateDownload: () => Promise<void>;
  openUpdateDownloadPage: () => Promise<void>;
  restartAndInstallUpdate: () => Promise<void>;
  scheduleInstallOnNextLaunch: () => Promise<void>;
  cancelTranslationSync: (gameKey: string) => Promise<void>;
  moveTranslationQueue: (params: { gameKey: string; direction: 'up' | 'down' }) => Promise<void>;
  setFallbackFocusTarget: (target: HTMLElement | null) => void;
}

export interface NotificationProviderProps {
  children: ReactNode;
  electronAPI?: ElectronAPI;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return ctx;
}

const TRANSLATION_AUTO_DISMISS_MS = 3000;

function serializeRawPayload(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

export function NotificationProvider({
  children,
  electronAPI,
  fallbackFocusRef,
}: NotificationProviderProps) {
  const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);

  const [toast, setToast] = useState<{ message: string; durationMs?: number; id: number } | null>(null);
  const [activeUpdate, setActiveUpdate] = useState<AppUpdateNotification | null>(null);
  const [activeTranslation, setActiveTranslation] = useState<TranslationSyncNotification | null>(null);

  const toastCounterRef = useRef(0);
  const translationDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dynamicFallbackRef = useRef<HTMLElement | null>(null);
  const effectiveFallbackFocusRef = fallbackFocusRef ?? dynamicFallbackRef;

  const clearTranslationDismissTimer = useCallback(() => {
    if (translationDismissTimerRef.current !== null) {
      clearTimeout(translationDismissTimerRef.current);
      translationDismissTimerRef.current = null;
    }
  }, []);

  const showToast = useCallback((message: string, durationMs?: number) => {
    toastCounterRef.current += 1;
    setToast({ message, durationMs, id: toastCounterRef.current });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const dismissUpdate = useCallback(() => {
    setActiveUpdate(null);
  }, []);

  const dismissTranslation = useCallback(() => {
    clearTranslationDismissTimer();
    setActiveTranslation(null);
  }, [clearTranslationDismissTimer]);

  const setFallbackFocusTarget = useCallback((target: HTMLElement | null) => {
    dynamicFallbackRef.current = target;
  }, []);

  useEffect(() => {
    const unsubUpdate = api?.onAppUpdateStatus?.((raw: unknown) => {
      const parsed = parseAppUpdatePayload(raw);
      if (!parsed) {
        console.warn(
          '[NotificationProvider] Dropped unparseable update payload:',
          sanitizeUserPaths(serializeRawPayload(raw))
        );
        return;
      }
      setActiveUpdate(parsed);
    });

    const unsubTranslation = api?.onTranslationStatus?.((raw: unknown) => {
      const parsed = parseTranslationStatusPayload(raw);
      if (!parsed) {
        console.warn(
          '[NotificationProvider] Dropped unparseable translation status payload:',
          sanitizeUserPaths(serializeRawPayload(raw))
        );
        return;
      }

      clearTranslationDismissTimer();

      if (parsed.status === 'sync-cancelled') {
        setActiveTranslation(null);
        return;
      }

      setActiveTranslation(parsed);

      if (parsed.status === 'synced' || parsed.status === 'ready') {
        translationDismissTimerRef.current = setTimeout(() => {
          translationDismissTimerRef.current = null;
          if (typeof document !== 'undefined') {
            const banner = document.querySelector('.translation-sync-banner');
            if (banner && document.activeElement && banner.contains(document.activeElement)) {
              const target =
                effectiveFallbackFocusRef.current ??
                document.querySelector<HTMLElement>('#react-root') ??
                document.querySelector<HTMLElement>('.library-grid');
              if (target) {
                if (!target.hasAttribute('tabindex')) {
                  target.setAttribute('tabindex', '-1');
                }
                target.focus();
              }
            }
          }
          setActiveTranslation((current) =>
            current && (current.status === 'synced' || current.status === 'ready')
              ? null
              : current
          );
        }, TRANSLATION_AUTO_DISMISS_MS);
      }
    });

    return () => {
      unsubUpdate?.();
      unsubTranslation?.();
      clearTranslationDismissTimer();
    };
  }, [api, clearTranslationDismissTimer, effectiveFallbackFocusRef]);

  const startUpdateDownload = useCallback(async () => {
    try {
      await api?.startAppUpdateDownload?.();
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const sanitizedMsg = sanitizeUserPaths(rawMsg);
      const sanitizedStack = err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined;
      console.error('[NotificationProvider] Failed to start update download:', {
        error: sanitizedMsg,
        stack: sanitizedStack,
      });
      showToast(`Update download failed: ${sanitizedMsg}`);
    }
  }, [api, showToast]);

  const openUpdateDownloadPage = useCallback(async () => {
    try {
      await api?.openAppUpdateDownloadPage?.();
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const sanitizedMsg = sanitizeUserPaths(rawMsg);
      const sanitizedStack = err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined;
      console.error('[NotificationProvider] Failed to open update download page:', {
        error: sanitizedMsg,
        stack: sanitizedStack,
      });
      showToast(`Failed to open download page: ${sanitizedMsg}`);
    }
  }, [api, showToast]);

  const restartAndInstallUpdate = useCallback(async () => {
    try {
      await api?.restartAndInstallAppUpdate?.();
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const sanitizedMsg = sanitizeUserPaths(rawMsg);
      const sanitizedStack = err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined;
      console.error('[NotificationProvider] Failed to install update:', {
        error: sanitizedMsg,
        stack: sanitizedStack,
      });
      showToast(`Failed to install update: ${sanitizedMsg}`);
    }
  }, [api, showToast]);

  const scheduleInstallOnNextLaunch = useCallback(async () => {
    try {
      await api?.scheduleAppUpdateNextLaunch?.();
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const sanitizedMsg = sanitizeUserPaths(rawMsg);
      const sanitizedStack = err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined;
      console.error('[NotificationProvider] Failed to schedule update install on next launch:', {
        error: sanitizedMsg,
        stack: sanitizedStack,
      });
      showToast(`Failed to schedule update: ${sanitizedMsg}`);
    }
  }, [api, showToast]);

  const cancelTranslationSync = useCallback(
    async (gameKey: string) => {
      await api?.cancelTranslationSync?.(gameKey);
    },
    [api]
  );

  const moveTranslationQueue = useCallback(
    async (params: { gameKey: string; direction: 'up' | 'down' }) => {
      try {
        await api?.moveTranslationQueue?.(params);
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        const sanitizedMsg = sanitizeUserPaths(rawMsg);
        const sanitizedStack = err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined;
        console.error('[NotificationProvider] Failed to move translation queue:', {
          error: sanitizedMsg,
          stack: sanitizedStack,
        });
        showToast(`Failed to reorder translation queue: ${sanitizedMsg}`);
      }
    },
    [api, showToast]
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      showToast,
      activeUpdate,
      activeTranslation,
      dismissUpdate,
      dismissTranslation,
      startUpdateDownload,
      openUpdateDownloadPage,
      restartAndInstallUpdate,
      scheduleInstallOnNextLaunch,
      cancelTranslationSync,
      moveTranslationQueue,
      setFallbackFocusTarget,
    }),
    [
      showToast,
      activeUpdate,
      activeTranslation,
      dismissUpdate,
      dismissTranslation,
      startUpdateDownload,
      openUpdateDownloadPage,
      restartAndInstallUpdate,
      scheduleInstallOnNextLaunch,
      cancelTranslationSync,
      moveTranslationQueue,
      setFallbackFocusTarget,
    ]
  );

  const portalTarget =
    typeof document !== 'undefined'
      ? document.getElementById('portal-root') ?? document.body
      : null;

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {portalTarget &&
        createPortal(
          <>
            {(activeUpdate || activeTranslation) && (
              <div className="update-notification-host">
                {activeUpdate && (
                  <UpdateNotificationCard
                    update={activeUpdate}
                    onDismiss={dismissUpdate}
                    onStartDownload={startUpdateDownload}
                    onOpenDownloadPage={openUpdateDownloadPage}
                    onInstall={restartAndInstallUpdate}
                    fallbackFocusRef={effectiveFallbackFocusRef}
                  />
                )}
                {activeTranslation && (
                  <TranslationSyncBanner
                    translation={activeTranslation}
                    onDismiss={dismissTranslation}
                    onCancelSync={cancelTranslationSync}
                    onMoveQueue={moveTranslationQueue}
                    fallbackFocusRef={effectiveFallbackFocusRef}
                  />
                )}
              </div>
            )}
            <ToastPill
              message={toast?.message ?? null}
              durationMs={toast?.durationMs}
              toastId={toast?.id}
              onDismiss={dismissToast}
            />
          </>,
          portalTarget
        )}
    </NotificationContext.Provider>
  );
}
