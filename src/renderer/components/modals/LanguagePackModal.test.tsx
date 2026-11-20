import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguagePackModal } from './LanguagePackModal';
import { NotificationProvider } from '../../providers/NotificationProvider';
import type {
  ElectronAPI,
  InstallLanguagePackResult,
  LanguagePackManifestResponse,
  LanguageState,
  ManifestPack,
} from '../../../shared/types/ipc';
import type { UiStorageAdapter } from '../../state/ui-runtime-state';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

const DEFAULT_PACKS: ManifestPack[] = [
  {
    code: 'en',
    bcp47: 'en',
    englishName: 'English',
    nativeName: 'English',
    packVersion: '1.0.0',
  },
  {
    code: 'ja',
    bcp47: 'ja',
    englishName: 'Japanese',
    nativeName: '日本語',
    packVersion: '1.2.0',
  },
  {
    code: 'fr',
    bcp47: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    packVersion: '1.1.0',
  },
];

function createLanguageState(installedCodes: string[] = []): LanguageState {
  return {
    repoUrl: 'https://example.com/repo',
    manifestUrl: 'https://example.com/manifest.json',
    appVersion: '1.0.0',
    builtIn: [
      {
        code: 'en',
        bcp47: 'en',
        englishName: 'English',
        nativeName: 'English',
        packVersion: '1.0.0',
        source: 'built-in',
      },
    ],
    installed: installedCodes.map((code) => ({
      code,
      bcp47: code,
      englishName: code,
      nativeName: code,
      packVersion: '1.0.0',
      source: 'downloaded' as const,
    })),
    locales: {},
  };
}

function createMockElectronAPI(
  overrides: Partial<ElectronAPI> = {}
): ElectronAPI {
  return {
    getLanguageState: vi.fn().mockResolvedValue(createLanguageState()),
    getLanguagePackManifest: vi.fn().mockResolvedValue({
      ok: true,
      packs: DEFAULT_PACKS,
    } satisfies LanguagePackManifestResponse),
    installLanguagePack: vi.fn().mockResolvedValue({
      ok: true,
      installedCode: 'ja',
    } satisfies InstallLanguagePackResult),
    ...overrides,
  } as unknown as ElectronAPI;
}

function renderModal(ui: React.ReactElement, electronAPI?: ElectronAPI) {
  return render(
    <NotificationProvider electronAPI={electronAPI}>
      {ui}
    </NotificationProvider>
  );
}

describe('LanguagePackModal', () => {
  afterEach(() => {
    document.getElementById('portal-root')?.remove();
    vi.restoreAllMocks();
  });

  it('portals into #portal-root and renders canonical language-packs.css selectors with canonical manifest payload', async () => {
    const portalRoot = document.createElement('div');
    portalRoot.id = 'portal-root';
    document.body.appendChild(portalRoot);

    const api = createMockElectronAPI();
    const storage = createMemoryStorage({ yumeshelf_lang: 'en' });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={vi.fn()}
        electronAPI={api}
        storage={storage}
      />,
      api
    );

    const dialog = screen.getByRole('dialog');
    expect(portalRoot.contains(dialog)).toBe(true);
    expect(dialog.className).toContain('language-pack-panel');
    expect(dialog.querySelector('.language-pack-body')).not.toBeNull();
    expect(dialog.querySelector('.language-pack-toolbar')).not.toBeNull();
    expect(dialog.querySelector('.language-pack-search')).not.toBeNull();
    expect(dialog.querySelector('.language-pack-placeholder')).not.toBeNull();

    await waitFor(() => {
      expect(dialog.querySelector('.language-pack-results')).not.toBeNull();
    });

    const cards = dialog.querySelectorAll('.language-pack-card');
    expect(cards.length).toBe(3);
    expect(dialog.querySelector('.language-pack-card-meta')).not.toBeNull();
    expect(dialog.querySelector('.language-pack-chip')).not.toBeNull();

    const appliedBtn = screen.getByRole('button', { name: 'Applied' });
    expect(appliedBtn.className).toContain('small-btn');
    expect(appliedBtn.className).toContain('secondary-btn');
    expect(appliedBtn).toHaveAttribute('aria-disabled', 'true');

    const installBtns = screen.getAllByRole('button', { name: 'Download & Install' });
    expect(installBtns.length).toBe(2);
    expect(installBtns[0].className).toContain('small-btn');
    expect(installBtns[0].className).toContain('primary-btn');
  });

  it('defensively supports raw ManifestPack[] array fixtures from getLanguagePackManifest', async () => {
    const api = createMockElectronAPI({
      getLanguagePackManifest: vi.fn().mockResolvedValue(DEFAULT_PACKS),
    });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={vi.fn()}
        electronAPI={api}
        storage={createMemoryStorage()}
      />,
      api
    );

    await waitFor(() => {
      expect(screen.getAllByRole('listitem').length).toBe(3);
    });
    expect(screen.getByText(/日本語/)).toBeInTheDocument();
  });

  it('transitions to error state with Retry CTA and logs sanitized structured error when manifest fetch fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manifestMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ENOENT: C:\\Users\\John Doe\\manifest.json'))
      .mockResolvedValueOnce({ ok: true, packs: DEFAULT_PACKS });

    const api = createMockElectronAPI({
      getLanguagePackManifest: manifestMock,
    });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={vi.fn()}
        electronAPI={api}
        storage={createMemoryStorage()}
      />,
      api
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText('Unable to fetch language packs')).toBeInTheDocument();
    expect(screen.getByText('Failed to load language packs')).toBeInTheDocument();

    expect(errorSpy).toHaveBeenCalledWith(
      '[LanguagePackModal] Failed to load language pack manifest:',
      expect.objectContaining({
        error: expect.stringContaining('<USER_DIR>'),
      })
    );
    const loggedPayload = errorSpy.mock.calls[0][1] as { error: string };
    expect(loggedPayload.error).not.toContain('John Doe');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getAllByRole('listitem').length).toBe(3);
    });
  });

  it('filters packs using NFC/NFD Unicode-normalized search matching across nativeName and englishName', async () => {
    const nfcPacks: ManifestPack[] = [
      {
        code: 'vi',
        bcp47: 'vi',
        englishName: 'Vietnamese',
        nativeName: 'Tiếng Việt'.normalize('NFC'),
        packVersion: '1.0.0',
      },
      {
        code: 'de',
        bcp47: 'de',
        englishName: 'German (Über)'.normalize('NFD'),
        nativeName: 'Deutsch',
        packVersion: '1.0.0',
      },
    ];
    const api = createMockElectronAPI({
      getLanguagePackManifest: vi.fn().mockResolvedValue({ ok: true, packs: nfcPacks }),
    });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={vi.fn()}
        electronAPI={api}
        storage={createMemoryStorage()}
      />,
      api
    );

    await waitFor(() => {
      expect(screen.getAllByRole('listitem').length).toBe(2);
    });

    const searchInput = screen.getByLabelText('Search language packs');

    // NFD-decomposed query matches NFC-composed nativeName
    fireEvent.change(searchInput, { target: { value: 'Tiếng'.normalize('NFD') } });
    expect(screen.getAllByRole('listitem').length).toBe(1);
    expect(screen.getByText('vi')).toBeInTheDocument();

    // NFC-composed query matches NFD-decomposed englishName
    fireEvent.change(searchInput, { target: { value: 'Über'.normalize('NFC') } });
    expect(screen.getAllByRole('listitem').length).toBe(1);
    expect(screen.getByText('de')).toBeInTheDocument();
  });

  it('activates installed language, persists to storage, notifies callback, and closes modal', async () => {
    const onClose = vi.fn();
    const onLanguagePackApplied = vi.fn();
    const storage = createMemoryStorage({ yumeshelf_lang: 'en' });
    const api = createMockElectronAPI({
      getLanguageState: vi.fn().mockResolvedValue(createLanguageState(['ja'])),
    });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={onClose}
        electronAPI={api}
        storage={storage}
        onLanguagePackApplied={onLanguagePackApplied}
      />,
      api
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(storage.getItem('yumeshelf_lang')).toBe('ja');
    expect(onLanguagePackApplied).toHaveBeenCalledWith('ja');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Activated language: ja')).toBeInTheDocument();
  });

  it('handles storage quota exceptions gracefully in handleApply with sanitized console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onClose = vi.fn();
    const onLanguagePackApplied = vi.fn();
    const failingStorage: UiStorageAdapter = {
      getItem: () => 'en',
      setItem: () => {
        throw new Error('QuotaExceededError at C:\\Users\\Jane Doe\\LocalStorage');
      },
      removeItem: () => {},
    };
    const api = createMockElectronAPI({
      getLanguageState: vi.fn().mockResolvedValue(createLanguageState(['ja'])),
    });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={onClose}
        electronAPI={api}
        storage={failingStorage}
        onLanguagePackApplied={onLanguagePackApplied}
      />,
      api
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(warnSpy).toHaveBeenCalledWith(
      '[LanguagePackModal] Failed to persist active language to storage:',
      expect.objectContaining({
        code: 'ja',
        error: expect.stringContaining('<USER_DIR>'),
      })
    );
    expect(onLanguagePackApplied).toHaveBeenCalledWith('ja');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('validates BCP-47 language code before install/apply and aborts with toast on invalid format', async () => {
    const invalidPack: ManifestPack = {
      code: '../bad_code!',
      bcp47: null,
      englishName: 'Broken',
      nativeName: 'Broken',
      packVersion: '0.0.1',
    };
    const installMock = vi.fn();
    const api = createMockElectronAPI({
      getLanguagePackManifest: vi.fn().mockResolvedValue({ ok: true, packs: [invalidPack] }),
      installLanguagePack: installMock,
    });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={vi.fn()}
        electronAPI={api}
        storage={createMemoryStorage()}
      />,
      api
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Download & Install' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Download & Install' }));

    expect(installMock).not.toHaveBeenCalled();
    expect(screen.getByText('Invalid language code format: ../bad_code!')).toBeInTheDocument();
  });

  it('logs sanitized structured console.error and shows toast when installLanguagePack returns { ok: false } or rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const installMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: 'Checksum mismatch in C:\\Users\\John Doe\\packs\\ja.json',
      })
      .mockResolvedValueOnce({ ok: false, reason: '   ' })
      .mockRejectedValueOnce(new Error('Network fail at C:\\Users\\John Doe\\net'));

    const api = createMockElectronAPI({
      installLanguagePack: installMock,
    });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={vi.fn()}
        electronAPI={api}
        storage={createMemoryStorage()}
      />,
      api
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Download & Install' }).length).toBe(2);
    });

    // 1. { ok: false, reason } with path sanitization
    fireEvent.click(screen.getAllByRole('button', { name: 'Download & Install' })[0]);
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        '[LanguagePackModal] Language pack installation failed:',
        expect.objectContaining({
          code: 'ja',
          reason: expect.stringContaining('<USER_DIR>'),
        })
      );
    });
    expect(
      (errorSpy.mock.calls[0][1] as { reason: string }).reason
    ).not.toContain('John Doe');

    // 2. { ok: false, reason: '   ' } falls back to 'Installation failed'
    fireEvent.click(screen.getAllByRole('button', { name: 'Download & Install' })[0]);
    await waitFor(() => {
      expect(screen.getByText('Installation failed')).toBeInTheDocument();
    });

    // 3. Rejection logs structured error with sanitized message
    fireEvent.click(screen.getAllByRole('button', { name: 'Download & Install' })[0]);
    await waitFor(() => {
      expect(screen.getByText('Installation encountered an unexpected error')).toBeInTheDocument();
    });
    expect(errorSpy).toHaveBeenCalledWith(
      '[LanguagePackModal] Unexpected error installing language pack "ja":',
      expect.objectContaining({
        packCode: 'ja',
        error: expect.stringContaining('<USER_DIR>'),
      })
    );
  });

  it('Deferred-Refresh Non-Unmount Test: keeps .language-pack-results mounted with aria-disabled during silent refresh and moves focus to Apply button', async () => {
    const refreshDeferred = createDeferred<LanguagePackManifestResponse>();
    const getLanguageStateMock = vi
      .fn()
      .mockResolvedValueOnce(createLanguageState([]))
      .mockResolvedValueOnce(createLanguageState(['ja']));
    const getManifestMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, packs: DEFAULT_PACKS })
      .mockReturnValueOnce(refreshDeferred.promise);

    const api = createMockElectronAPI({
      getLanguageState: getLanguageStateMock,
      getLanguagePackManifest: getManifestMock,
      installLanguagePack: vi.fn().mockResolvedValue({ ok: true, installedCode: 'ja' }),
    });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={vi.fn()}
        electronAPI={api}
        storage={createMemoryStorage()}
      />,
      api
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Download & Install' }).length).toBe(2);
    });

    const jaInstallBtn = screen.getAllByRole('button', { name: 'Download & Install' })[0];
    jaInstallBtn.focus();
    expect(document.activeElement).toBe(jaInstallBtn);

    fireEvent.click(jaInstallBtn);

    // While silent refresh is pending, .language-pack-results stays mounted and buttons are aria-disabled
    await waitFor(() => {
      expect(getManifestMock).toHaveBeenCalledTimes(2);
    });
    expect(document.querySelector('.language-pack-results')).not.toBeNull();
    expect(document.querySelector('.language-pack-placeholder')).toBeNull();
    expect(jaInstallBtn).toHaveAttribute('aria-disabled', 'true');
    expect(jaInstallBtn.style.pointerEvents).toBe('none');
    expect(jaInstallBtn.style.opacity).toBe('0.5');

    // Resolve silent refresh
    await act(async () => {
      refreshDeferred.resolve({ ok: true, packs: DEFAULT_PACKS });
      await refreshDeferred.promise;
    });

    await waitFor(() => {
      const applyBtn = screen.getByRole('button', { name: 'Apply' });
      expect(document.activeElement).toBe(applyBtn);
    });
  });

  it('Non-Stealing Focus Test: preserves focus on .language-pack-search if user moves focus while install/refresh is in flight', async () => {
    const installDeferred = createDeferred<InstallLanguagePackResult>();
    const refreshDeferred = createDeferred<LanguagePackManifestResponse>();

    const api = createMockElectronAPI({
      getLanguageState: vi
        .fn()
        .mockResolvedValueOnce(createLanguageState([]))
        .mockResolvedValueOnce(createLanguageState(['ja'])),
      getLanguagePackManifest: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, packs: DEFAULT_PACKS })
        .mockReturnValueOnce(refreshDeferred.promise),
      installLanguagePack: vi.fn().mockReturnValue(installDeferred.promise),
    });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={vi.fn()}
        electronAPI={api}
        storage={createMemoryStorage()}
      />,
      api
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Download & Install' }).length).toBe(2);
    });

    const jaInstallBtn = screen.getAllByRole('button', { name: 'Download & Install' })[0];
    jaInstallBtn.focus();
    fireEvent.click(jaInstallBtn);

    const searchInput = screen.getByLabelText('Search language packs');
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    await act(async () => {
      installDeferred.resolve({ ok: true, installedCode: 'ja' });
      await installDeferred.promise;
    });

    await act(async () => {
      refreshDeferred.resolve({ ok: true, packs: DEFAULT_PACKS });
      await refreshDeferred.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    });
    expect(document.activeElement).toBe(searchInput);
  });

  it('Silent Refresh Failure Test: keeps .language-pack-results mounted, returns to idle without error panel, and shows toast', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = createMockElectronAPI({
      getLanguagePackManifest: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, packs: DEFAULT_PACKS })
        .mockRejectedValueOnce(new Error('Silent refresh network failure')),
      installLanguagePack: vi.fn().mockResolvedValue({ ok: true, installedCode: 'ja' }),
    });

    renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={vi.fn()}
        electronAPI={api}
        storage={createMemoryStorage()}
      />,
      api
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Download & Install' }).length).toBe(2);
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Download & Install' })[0]);

    await waitFor(() => {
      expect(screen.getByText('Failed to load language packs')).toBeInTheDocument();
    });

    // Results stay mounted with existing packs, no full-body error alert, and buttons are no longer busy
    expect(document.querySelector('.language-pack-results')).not.toBeNull();
    expect(screen.queryByText('Unable to fetch language packs')).not.toBeInTheDocument();
    const installBtns = screen.getAllByRole('button', { name: 'Download & Install' });
    expect(installBtns.length).toBe(2);
    expect(installBtns[0]).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('transfers focus deterministically to fallbackFocusRef.current when closing with disconnected trigger', async () => {
    const fallbackRef = createRef<HTMLButtonElement>();
    const triggerBtn = document.createElement('button');
    triggerBtn.textContent = 'Trigger';
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    const api = createMockElectronAPI();
    const { rerender } = render(
      <NotificationProvider electronAPI={api}>
        <button ref={fallbackRef} type="button">
          Fallback Target
        </button>
        <LanguagePackModal
          isOpen={true}
          onClose={vi.fn()}
          fallbackFocusRef={fallbackRef}
          electronAPI={api}
          storage={createMemoryStorage()}
        />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByRole('listitem').length).toBe(3);
    });

    // Disconnect original trigger before closing modal
    triggerBtn.remove();

    rerender(
      <NotificationProvider electronAPI={api}>
        <button ref={fallbackRef} type="button">
          Fallback Target
        </button>
        <LanguagePackModal
          isOpen={false}
          onClose={vi.fn()}
          fallbackFocusRef={fallbackRef}
          electronAPI={api}
          storage={createMemoryStorage()}
        />
      </NotificationProvider>
    );

    expect(document.activeElement).toBe(fallbackRef.current);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('suppresses stale manifest errors and toasts if modal closes while fetch is in flight', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const manifestDeferred = createDeferred<LanguagePackManifestResponse>();
    const api = createMockElectronAPI({
      getLanguagePackManifest: vi.fn().mockReturnValue(manifestDeferred.promise),
    });

    const { rerender } = renderModal(
      <LanguagePackModal
        isOpen={true}
        onClose={vi.fn()}
        electronAPI={api}
        storage={createMemoryStorage()}
      />,
      api
    );

    rerender(
      <NotificationProvider electronAPI={api}>
        <LanguagePackModal
          isOpen={false}
          onClose={vi.fn()}
          electronAPI={api}
          storage={createMemoryStorage()}
        />
      </NotificationProvider>
    );

    await act(async () => {
      manifestDeferred.reject(new Error('Stale failure'));
      await manifestDeferred.promise.catch(() => {});
    });

    expect(screen.queryByText('Failed to load language packs')).not.toBeInTheDocument();
  });
});
