import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';

const mocks = vi.hoisted(() => {
  const webContentsListeners = new Map<string, (...args: any[]) => any>();
  const winListeners = new Map<string, (...args: any[]) => any>();
  let windowOpenHandler: ((details: { url: string }) => any) | null = null;
  let headersReceivedCb: ((details: any, cb: (res: any) => void) => void) | null = null;

  const mockWin: any = {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    minimize: vi.fn(),
    destroy: vi.fn(),
    removeMenu: vi.fn(),
    setMenuBarVisibility: vi.fn(),
    setTitle: vi.fn(),
    loadURL: vi.fn(async () => {}),
    loadFile: vi.fn(async () => {}),
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      winListeners.set(event, cb);
    }),
    once: vi.fn(),
    webContents: {
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        webContentsListeners.set(event, cb);
      }),
      setWindowOpenHandler: vi.fn((handler: (details: { url: string }) => any) => {
        windowOpenHandler = handler;
      }),
    },
  };

  const BrowserWindowMock: any = vi.fn(function () {
    return mockWin;
  });

  const TrayMock: any = vi.fn(function () {
    return {
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn(),
    };
  });

  return {
    webContentsListeners,
    winListeners,
    getWindowOpenHandler: () => windowOpenHandler,
    setWindowOpenHandler: (h: any) => {
      windowOpenHandler = h;
    },
    getHeadersReceivedCb: () => headersReceivedCb,
    setHeadersReceivedCb: (cb: any) => {
      headersReceivedCb = cb;
    },
    mockWin,
    BrowserWindowMock,
    TrayMock,
    dialogShowMessageBoxSync: vi.fn(() => 1),
    shellOpenExternal: vi.fn(async () => {}),
    ipcMainOn: vi.fn(),
    existsSyncOverride: null as null | ((p: string) => boolean),
    writeFileSyncShouldThrow: false,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: mocks.BrowserWindowMock,
  Tray: mocks.TrayMock,
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  ipcMain: { on: mocks.ipcMainOn },
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: vi.fn((cb: any) => {
          mocks.setHeadersReceivedCb(cb);
        }),
      },
    },
  },
  shell: { openExternal: mocks.shellOpenExternal },
  dialog: { showMessageBoxSync: mocks.dialogShowMessageBoxSync },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((p: any) => {
      if (mocks.existsSyncOverride) return mocks.existsSyncOverride(String(p));
      return actual.existsSync(p);
    }),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(() => {
      if (mocks.writeFileSyncShouldThrow) {
        throw new Error('EACCES: C:\\Users\\alice\\AppData\\probe.tmp');
      }
    }),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

import {
  _resetMainWindowStateForTesting,
  createMainWindow,
  logStartupDiagnostics,
} from './main-window';

describe('main-window hardening and crash recovery', () => {
  function createMockApp() {
    const appListeners = new Map<string, (...args: any[]) => void>();
    return {
      isPackaged: true,
      getAppPath: vi.fn(() => 'C:\\Users\\alice\\App\\app.asar'),
      getPath: vi.fn((name: string) => `C:\\Users\\alice\\AppData\\${name}`),
      relaunch: vi.fn(),
      exit: vi.fn(),
      quit: vi.fn(),
      on: vi.fn((event: string, cb: (...args: any[]) => void) => {
        appListeners.set(event, cb);
      }),
      emit(event: string) {
        appListeners.get(event)?.();
      },
    };
  }

  const basePaths = {
    mainWindowIconPath: path.join('D:', 'Projects', 'YumeShelf', 'assets', 'icon.png'),
    preloadPath: path.join('D:', 'Projects', 'YumeShelf', 'dist', 'preload.js'),
    indexHtmlPath: path.join('D:', 'Projects', 'YumeShelf', 'dist', 'renderer', 'index.html'),
  };

  beforeEach(() => {
    _resetMainWindowStateForTesting();
    mocks.webContentsListeners.clear();
    mocks.winListeners.clear();
    mocks.setWindowOpenHandler(null);
    mocks.setHeadersReceivedCb(null);
    mocks.BrowserWindowMock.mockClear();
    mocks.mockWin.isDestroyed.mockReturnValue(false);
    mocks.mockWin.destroy.mockClear();
    mocks.dialogShowMessageBoxSync.mockReset().mockReturnValue(1);
    mocks.shellOpenExternal.mockClear();
    mocks.existsSyncOverride = null;
    mocks.writeFileSyncShouldThrow = false;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sanitizes startup path diagnostics and probe errors via sanitizeUserPaths', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.existsSyncOverride = () => true;
    mocks.writeFileSyncShouldThrow = true;

    const mockApp = createMockApp();
    logStartupDiagnostics(mockApp);

    const output = JSON.stringify(logSpy.mock.calls);
    expect(output).not.toContain('alice');
    expect(output).toContain('<USER_DIR>');
  });

  it('configures sandbox: true, scrubs telemetry from CSP, and sanitizes console-message logs', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mockApp = createMockApp();

    createMainWindow({
      app: mockApp,
      paths: basePaths,
      launchedAfterUpdate: false,
    });

    expect(mocks.BrowserWindowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        webPreferences: expect.objectContaining({
          preload: basePaths.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        }),
      })
    );

    const headersCb = mocks.getHeadersReceivedCb()!;
    expect(headersCb).toBeTypeOf('function');
    const cspCallback = vi.fn();
    headersCb({ responseHeaders: {} }, cspCallback);
    const cspHeader = cspCallback.mock.calls[0][0].responseHeaders['Content-Security-Policy'][0];
    expect(cspHeader).not.toContain('yumeshelf-telemetry.sayusumat.workers.dev');
    expect(cspHeader).not.toContain('https://translate.googleapis.com');
    expect(cspHeader).toContain("connect-src 'self'");

    const consoleHandler = mocks.webContentsListeners.get('console-message')!;
    consoleHandler({ sender: { isDestroyed: () => false } }, 1, 'Error in C:\\Users\\alice\\save.dat');
    expect(logSpy).toHaveBeenCalledWith('[RENDERER-LOG] Error in <USER_DIR>\\save.dat');
  });

  it('enforces setWindowOpenHandler and will-navigate containment with platform-aware case comparison', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockApp = createMockApp();

    createMainWindow({
      app: mockApp,
      paths: basePaths,
      launchedAfterUpdate: false,
      platform: 'win32',
    });

    const openHandler = mocks.getWindowOpenHandler()!;
    expect(openHandler({ url: 'https://example.com/docs' })).toEqual({ action: 'deny' });
    expect(mocks.shellOpenExternal).toHaveBeenCalledWith('https://example.com/docs');

    const willNavigate = mocks.winListeners.get('will-navigate') || mocks.webContentsListeners.get('will-navigate')!;
    const allowedEvent = { preventDefault: vi.fn() };
    const winIndexUrl = 'file:///' + basePaths.indexHtmlPath.replace(/\\/g, '/').toUpperCase();
    willNavigate(allowedEvent, winIndexUrl);
    expect(allowedEvent.preventDefault).not.toHaveBeenCalled();

    const siblingBypassEvent = { preventDefault: vi.fn() };
    willNavigate(siblingBypassEvent, 'file:///D:/Projects/YumeShelf/dist/renderer-evil/index.html');
    expect(siblingBypassEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('handles render-process-gone for unexpected crash (relaunch/exit/dialog-error), clean-exit, and isQuitting', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockApp = createMockApp();

    createMainWindow({
      app: mockApp,
      paths: basePaths,
      launchedAfterUpdate: false,
    });

    const goneHandler = mocks.webContentsListeners.get('render-process-gone')!;

    // 1. Clean exit
    goneHandler({}, { reason: 'clean-exit', exitCode: 0 });
    expect(mockApp.quit).toHaveBeenCalledTimes(1);
    expect(mocks.dialogShowMessageBoxSync).not.toHaveBeenCalled();

    // 2. Unexpected crash -> Relaunch (choice 0)
    mockApp.quit.mockClear();
    mocks.dialogShowMessageBoxSync.mockReturnValueOnce(0);
    goneHandler({}, { reason: 'crashed', exitCode: 1 });
    expect(mocks.mockWin.destroy).toHaveBeenCalledTimes(1);
    expect(mockApp.relaunch).toHaveBeenCalledTimes(1);
    expect(mockApp.exit).toHaveBeenCalledWith(0);

    // 3. Unexpected crash -> Dialog throws -> fallback quit
    mocks.dialogShowMessageBoxSync.mockImplementationOnce(() => {
      throw new Error('Dialog failure C:\\Users\\alice\\ui');
    });
    goneHandler({}, undefined);
    expect(mockApp.quit).toHaveBeenCalledTimes(1);

    // 4. Normal shutdown (isQuitting = true) suppresses dialog
    mocks.dialogShowMessageBoxSync.mockClear();
    mockApp.quit.mockClear();
    mockApp.emit('before-quit');
    goneHandler({}, { reason: 'killed', exitCode: -1 });
    expect(mocks.dialogShowMessageBoxSync).not.toHaveBeenCalled();
    expect(mockApp.quit).not.toHaveBeenCalled();
  });
});
