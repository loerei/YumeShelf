import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectronAPI } from '../../shared/types/ipc';
import { TranslationSyncBanner } from '../components/TranslationSyncBanner';
import { UpdateNotificationCard } from '../components/UpdateNotificationCard';
import {
  NotificationProvider,
  clampProgress,
  parseAppUpdatePayload,
  parseTranslationStatusPayload,
  useNotification,
  type AppUpdateNotification,
  type TranslationSyncNotification,
} from './NotificationProvider';

function createMockElectronAPI() {
  let updateListener: ((payload: unknown) => void) | null = null;
  let translationListener: ((payload: unknown) => void) | null = null;
  const unsubUpdate = vi.fn();
  const unsubTranslation = vi.fn();

  const api = {
    onAppUpdateStatus: vi.fn((cb: (payload: unknown) => void) => {
      updateListener = cb;
      return unsubUpdate;
    }),
    onTranslationStatus: vi.fn((cb: (payload: unknown) => void) => {
      translationListener = cb;
      return unsubTranslation;
    }),
    startAppUpdateDownload: vi.fn().mockResolvedValue(undefined),
    openAppUpdateDownloadPage: vi.fn().mockResolvedValue(undefined),
    restartAndInstallAppUpdate: vi.fn().mockResolvedValue(undefined),
    scheduleAppUpdateNextLaunch: vi.fn().mockResolvedValue(undefined),
    cancelTranslationSync: vi.fn().mockResolvedValue(undefined),
    moveTranslationQueue: vi.fn().mockResolvedValue(undefined),
  } as unknown as ElectronAPI;

  return {
    api,
    emitUpdate: (payload: unknown) => updateListener?.(payload),
    emitTranslation: (payload: unknown) => translationListener?.(payload),
    unsubUpdate,
    unsubTranslation,
  };
}

describe('NotificationProvider & Parsers', () => {
  let fixtureRoot: HTMLDivElement;
  let portalRoot: HTMLDivElement;

  beforeEach(() => {
    fixtureRoot = document.createElement('div');
    fixtureRoot.id = 'react-root';
    document.body.appendChild(fixtureRoot);

    portalRoot = document.createElement('div');
    portalRoot.id = 'portal-root';
    document.body.appendChild(portalRoot);
  });

  afterEach(() => {
    fixtureRoot.remove();
    portalRoot.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('clampProgress & parseAppUpdatePayload', () => {
    it('clamps finite scalars to [0, 1] and returns undefined for non-finite values', () => {
      expect(clampProgress(0.5)).toBe(0.5);
      expect(clampProgress(-0.2)).toBe(0);
      expect(clampProgress(1.8)).toBe(1);
      expect(clampProgress(Number.NaN)).toBeUndefined();
      expect(clampProgress(Number.POSITIVE_INFINITY)).toBeUndefined();
      expect(clampProgress('0.5')).toBeUndefined();
    });

    it('parses update-available, downloading, ready, and error payloads accurately', () => {
      expect(
        parseAppUpdatePayload({
          phase: 'update-available',
          update: { releaseName: 'v2.0.0', releaseNotes: 'Notes', downloadable: true },
        })
      ).toEqual({
        phase: 'available',
        releaseName: 'v2.0.0',
        releaseNotes: 'Notes',
        releaseUrl: undefined,
        downloadable: true,
      });

      expect(
        parseAppUpdatePayload({
          phase: 'download-progress',
          progress: 0.42,
        })
      ).toEqual({
        phase: 'downloading',
        releaseName: undefined,
        releaseNotes: undefined,
        releaseUrl: undefined,
        progress: 0.42,
      });

      expect(
        parseAppUpdatePayload({
          phase: 'download-progress',
          downloaded: 50,
          total: 200,
        })
      ).toMatchObject({ phase: 'downloading', progress: 0.25 });

      expect(
        parseAppUpdatePayload({
          phase: 'download-progress',
          downloaded: 300,
          total: 200,
        })
      ).toMatchObject({ phase: 'downloading', progress: 1 });

      expect(
        parseAppUpdatePayload({
          phase: 'download-progress',
          downloaded: 50,
          total: 0,
        })
      ).toMatchObject({ phase: 'downloading', progress: undefined });

      expect(
        parseAppUpdatePayload({
          phase: 'download-progress',
          downloaded: -10,
          total: 100,
        })
      ).toMatchObject({ phase: 'downloading', progress: undefined });

      expect(
        parseAppUpdatePayload({
          phase: 'download-ready',
          update: { releaseName: 'v2.0.0' },
        })
      ).toMatchObject({ phase: 'ready', releaseName: 'v2.0.0' });

      const failed = parseAppUpdatePayload({
        phase: 'download-failed',
        error: "EACCES: C:\\Users\\John Doe\\AppData\\Local\\update.exe",
      });
      expect(failed?.phase).toBe('error');
      if (failed?.phase === 'error') {
        expect(failed.error).not.toContain('John Doe');
      }

      expect(parseAppUpdatePayload(null)).toBeNull();
      expect(parseAppUpdatePayload({ phase: 'unknown-phase' })).toBeNull();
    });
  });

  describe('parseTranslationStatusPayload', () => {
    it('clamps progress, defaults terminal success to 1, and sanitizes queue items', () => {
      const syncing = parseTranslationStatusPayload({
        status: 'syncing',
        gameKey: 'game-1',
        progress: 1.5,
        queue: [
          { gameKey: '  game-1  ', title: '  Game One  ' },
          { gameKey: '   ' },
          { gameKey: '__proto__' },
          { gameKey: 'constructor' },
          { gameKey: 'prototype' },
          null,
          'bad-item',
        ],
      });

      expect(syncing).toEqual({
        status: 'syncing',
        gameKey: 'game-1',
        progress: 1,
        queue: [{ gameKey: 'game-1', title: 'Game One' }],
        error: undefined,
      });

      expect(parseTranslationStatusPayload({ status: 'synced' })).toMatchObject({
        status: 'synced',
        progress: 1,
      });

      expect(parseTranslationStatusPayload({ status: 'ready' })).toMatchObject({
        status: 'ready',
        progress: 1,
      });

      expect(parseTranslationStatusPayload({ status: 'preparing' })).toMatchObject({
        status: 'preparing',
        progress: undefined,
      });

      const errPayload = parseTranslationStatusPayload({
        status: 'sync-error',
        error: "Failed at C:\\Users\\Alice\\Documents\\game",
      });
      expect(errPayload?.error).not.toContain('Alice');

      expect(parseTranslationStatusPayload({ status: 'invalid' })).toBeNull();
      expect(parseTranslationStatusPayload('bad')).toBeNull();
    });
  });

  describe('ToastPill & showToast lifecycle', () => {
    it('renders status live region, dismiss button, and auto-dismisses with transition classes', () => {
      vi.useFakeTimers();
      const { api } = createMockElectronAPI();

      function Consumer() {
        const { showToast } = useNotification();
        return (
          <button type="button" onClick={() => showToast('Saved changes', 2000)}>
            Trigger Toast
          </button>
        );
      }

      const { unmount } = render(
        <NotificationProvider electronAPI={api}>
          <Consumer />
        </NotificationProvider>
      );

      fireEvent.click(screen.getByText('Trigger Toast'));

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status.className).toContain('toast-pill-visible');
      expect(screen.getByText('Saved changes')).toBeInTheDocument();

      const dismissBtn = screen.getByRole('button', { name: 'Dismiss notification' });
      expect(dismissBtn).toBeInTheDocument();
      const svg = dismissBtn.querySelector('svg');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg).toHaveAttribute('aria-hidden', 'true');

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByRole('status').className).toContain('toast-pill-hiding');

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      // Trigger again and unmount before timer fires to ensure clean teardown
      fireEvent.click(screen.getByText('Trigger Toast'));
      expect(screen.getByRole('status')).toBeInTheDocument();
      unmount();

      act(() => {
        vi.advanceTimersByTime(5000);
      });
    });
  });

  describe('NotificationProvider IPC bindings, diagnostics, and teardown', () => {
    it('logs sanitized console.warn for unparseable payloads and invokes unsubscribe on unmount', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { api, emitUpdate, emitTranslation, unsubUpdate, unsubTranslation } = createMockElectronAPI();

      const { unmount } = render(
        <NotificationProvider electronAPI={api}>
          <div>child</div>
        </NotificationProvider>
      );

      act(() => {
        emitUpdate({ phase: 'bogus', path: 'C:\\Users\\SecretUser\\file.txt' });
        emitTranslation({ status: 'bogus', path: 'C:\\Users\\SecretUser\\sync.log' });
      });

      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(String(warnSpy.mock.calls[0][1])).not.toContain('SecretUser');
      expect(String(warnSpy.mock.calls[1][1])).not.toContain('SecretUser');

      unmount();
      expect(unsubUpdate).toHaveBeenCalledTimes(1);
      expect(unsubTranslation).toHaveBeenCalledTimes(1);
    });

    it('portals UpdateNotificationCard and emits error toast when update action rejects', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { api, emitUpdate } = createMockElectronAPI();
      (api.startAppUpdateDownload as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network offline')
      );

      render(
        <NotificationProvider electronAPI={api}>
          <div>child</div>
        </NotificationProvider>
      );

      act(() => {
        emitUpdate({
          phase: 'update-available',
          update: { releaseName: 'v1.9.0', downloadable: true },
        });
      });

      const region = screen.getByRole('region', { name: 'Application update' });
      expect(portalRoot.contains(region)).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Download Update' }));

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Update download failed: Network offline');
      });
      expect(errorSpy).toHaveBeenCalledWith(
        '[NotificationProvider] Failed to start update download:',
        expect.objectContaining({ error: 'Network offline' })
      );
    });

    it('restores focus to consumer-registered setFallbackFocusTarget on dismiss', () => {
      const { api, emitUpdate } = createMockElectronAPI();

      function Consumer() {
        const { setFallbackFocusTarget } = useNotification();
        return (
          <button
            type="button"
            ref={(el) => setFallbackFocusTarget(el)}
          >
            Focus Anchor
          </button>
        );
      }

      render(
        <NotificationProvider electronAPI={api}>
          <Consumer />
        </NotificationProvider>
      );

      act(() => {
        emitUpdate({
          phase: 'update-available',
          update: { releaseName: 'v2.1.0', downloadable: true },
        });
      });

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notification' }));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Focus Anchor' }));
    });
  });

  describe('UpdateNotificationCard unit behavior', () => {
    it('shifts focus to Remind Later on Download Update and suppresses concurrent activations', async () => {
      let resolveDownload!: () => void;
      const onStartDownload = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveDownload = resolve;
          })
      );
      const onDismiss = vi.fn();

      const update: AppUpdateNotification = {
        phase: 'available',
        releaseName: 'v2.0.0',
        downloadable: true,
      };

      render(
        <UpdateNotificationCard
          update={update}
          onDismiss={onDismiss}
          onStartDownload={onStartDownload}
          onOpenDownloadPage={vi.fn().mockResolvedValue(undefined)}
          onInstall={vi.fn().mockResolvedValue(undefined)}
        />
      );

      const downloadBtn = screen.getByRole('button', { name: 'Download Update' });
      const remindLaterBtn = screen.getByRole('button', { name: 'Remind Later' });
      const dismissBtn = screen.getByRole('button', { name: 'Dismiss update notification' });
      expect(dismissBtn).toHaveAttribute('title', 'Dismiss update notification');

      fireEvent.click(downloadBtn);

      expect(downloadBtn).toHaveAttribute('aria-disabled', 'true');
      expect(document.activeElement).toBe(remindLaterBtn);

      // Concurrent clicks should be suppressed
      fireEvent.click(downloadBtn);
      fireEvent.click(dismissBtn);
      expect(onStartDownload).toHaveBeenCalledTimes(1);
      expect(onDismiss).not.toHaveBeenCalled();

      await act(async () => {
        resolveDownload();
      });

      expect(downloadBtn).toHaveAttribute('aria-disabled', 'false');
    });

    it('preserves focus on Restart & Install during ready phase without native disabled', async () => {
      let resolveInstall!: () => void;
      const onInstall = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveInstall = resolve;
          })
      );

      render(
        <UpdateNotificationCard
          update={{ phase: 'ready', releaseName: 'v2.0.0' }}
          onDismiss={vi.fn()}
          onStartDownload={vi.fn().mockResolvedValue(undefined)}
          onOpenDownloadPage={vi.fn().mockResolvedValue(undefined)}
          onInstall={onInstall}
        />
      );

      const installBtn = screen.getByRole('button', { name: 'Restart & Install' });
      installBtn.focus();
      fireEvent.click(installBtn);

      expect(installBtn).toHaveAttribute('aria-disabled', 'true');
      expect(installBtn).not.toBeDisabled();
      expect(installBtn.style.pointerEvents).toBe('none');
      expect(document.activeElement).toBe(installBtn);

      await act(async () => {
        resolveInstall();
      });
    });

    it('renders progressbar in downloading phase and alert + Retry Download in error phase', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onStartDownload = vi.fn().mockRejectedValueOnce(new Error('Disk full'));

      const { rerender } = render(
        <UpdateNotificationCard
          update={{ phase: 'downloading', releaseName: 'v2.0.0', progress: 0.65 }}
          onDismiss={vi.fn()}
          onStartDownload={onStartDownload}
          onOpenDownloadPage={vi.fn().mockResolvedValue(undefined)}
          onInstall={vi.fn().mockResolvedValue(undefined)}
        />
      );

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '65');

      rerender(
        <UpdateNotificationCard
          update={{ phase: 'error', releaseName: 'v2.0.0', error: 'Checksum mismatch' }}
          onDismiss={vi.fn()}
          onStartDownload={onStartDownload}
          onOpenDownloadPage={vi.fn().mockResolvedValue(undefined)}
          onInstall={vi.fn().mockResolvedValue(undefined)}
        />
      );

      expect(screen.getByRole('alert')).toHaveTextContent('Checksum mismatch');
      fireEvent.click(screen.getByRole('button', { name: 'Retry Download' }));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith(
          '[UpdateNotificationCard] Failed to start update download:',
          expect.objectContaining({ error: 'Disk full' })
        );
      });
    });

    it('transfers focus to injected fallbackFocusRef or #react-root on dismiss', () => {
      const fallbackRef = createRef<HTMLButtonElement>();
      const onDismiss = vi.fn();

      const { rerender } = render(
        <>
          <button type="button" ref={fallbackRef}>
            Injected Target
          </button>
          <UpdateNotificationCard
            update={{ phase: 'available', releaseName: 'v2.0.0', downloadable: false }}
            onDismiss={onDismiss}
            onStartDownload={vi.fn().mockResolvedValue(undefined)}
            onOpenDownloadPage={vi.fn().mockResolvedValue(undefined)}
            onInstall={vi.fn().mockResolvedValue(undefined)}
            fallbackFocusRef={fallbackRef}
          />
        </>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notification' }));
      expect(document.activeElement).toBe(fallbackRef.current);
      expect(onDismiss).toHaveBeenCalledTimes(1);

      rerender(
        <UpdateNotificationCard
          update={{ phase: 'available', releaseName: 'v2.0.0', downloadable: false }}
          onDismiss={onDismiss}
          onStartDownload={vi.fn().mockResolvedValue(undefined)}
          onOpenDownloadPage={vi.fn().mockResolvedValue(undefined)}
          onInstall={vi.fn().mockResolvedValue(undefined)}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Remind Later' }));
      expect(fixtureRoot.getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(fixtureRoot);
    });
  });

  describe('TranslationSyncBanner & auto-dismiss lifecycle', () => {
    it('guards in-flight cancellation, scrubs personal paths on rejection, and restores focus on resolve/dismiss', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let rejectCancel!: (err: Error) => void;
      const onCancelSync = vi.fn(
        () =>
          new Promise<void>((_, reject) => {
            rejectCancel = reject;
          })
      );
      const onDismiss = vi.fn();

      const translation: TranslationSyncNotification = {
        status: 'syncing',
        gameKey: 'game-abc',
        progress: 0.4,
      };

      render(
        <TranslationSyncBanner
          translation={translation}
          onDismiss={onDismiss}
          onCancelSync={onCancelSync}
        />
      );

      const dismissBtn = screen.getByRole('button', { name: 'Dismiss translation status' });
      expect(dismissBtn).toHaveAttribute('title', 'Dismiss translation status');
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');

      const cancelBtn = screen.getByRole('button', { name: 'Cancel Sync' });
      cancelBtn.focus();
      fireEvent.click(cancelBtn);

      expect(cancelBtn).toHaveAttribute('aria-disabled', 'true');
      expect(document.activeElement).toBe(cancelBtn);

      // Duplicate cancel and dismiss are blocked while cancelling
      fireEvent.click(cancelBtn);
      fireEvent.click(dismissBtn);
      expect(onCancelSync).toHaveBeenCalledTimes(1);
      expect(onDismiss).not.toHaveBeenCalled();

      await act(async () => {
        rejectCancel(
          new Error("EACCES: permission denied, unlink 'C:\\Users\\John Doe\\AppData\\Local\\sync.lock'")
        );
      });

      expect(errorSpy).toHaveBeenCalledWith(
        '[TranslationSyncBanner] Failed to cancel translation sync:',
        expect.objectContaining({
          gameKey: 'game-abc',
          error: expect.not.stringContaining('John Doe'),
        })
      );
      expect(document.activeElement).toBe(cancelBtn);
      expect(cancelBtn).not.toHaveAttribute('aria-disabled');

      // Dismiss transfers focus to #react-root
      dismissBtn.focus();
      fireEvent.click(dismissBtn);
      expect(document.activeElement).toBe(fixtureRoot);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('auto-dismisses after 3000ms with focus handoff, cancels timer on subsequent sync, and clears on sync-cancelled', () => {
      vi.useFakeTimers();
      const { api, emitTranslation } = createMockElectronAPI();

      render(
        <NotificationProvider electronAPI={api}>
          <div>child</div>
        </NotificationProvider>
      );

      // 1. Emit synced -> starts 3000ms timer
      act(() => {
        emitTranslation({ status: 'synced', gameKey: 'g1' });
      });
      expect(screen.getByRole('region', { name: 'Translation sync progress' })).toBeInTheDocument();

      // 2. Subsequent sync within 3000ms cancels timer and preserves banner
      act(() => {
        vi.advanceTimersByTime(1500);
        emitTranslation({ status: 'syncing', gameKey: 'g2', progress: 0.2 });
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole('region', { name: 'Translation sync progress' })).toBeInTheDocument();

      // 3. sync-cancelled immediately clears active translation
      act(() => {
        emitTranslation({ status: 'sync-cancelled', gameKey: 'g2' });
      });
      expect(screen.queryByRole('region', { name: 'Translation sync progress' })).not.toBeInTheDocument();

      // 4. Auto-dismiss while focus is inside banner transfers focus to #react-root
      act(() => {
        emitTranslation({ status: 'ready', gameKey: 'g3' });
      });
      const dismissBtn = screen.getByRole('button', { name: 'Dismiss translation status' });
      dismissBtn.focus();
      expect(document.activeElement).toBe(dismissBtn);

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole('region', { name: 'Translation sync progress' })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(fixtureRoot);
    });
  });
});
