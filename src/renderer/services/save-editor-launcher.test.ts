import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountStandaloneSaveEditor } from '../../save-editor';
import { initSaveEditorUI } from '../save-editor-ui';
import { ElectronSaveEditorLauncher, type ISaveEditorLauncher } from './save-editor-launcher';

describe('ElectronSaveEditorLauncher', () => {
  it('dispatches openSaveEditorWindow with trimmed gameKey', async () => {
    const openSaveEditorWindow = vi.fn().mockResolvedValue(undefined);
    const launcher = new ElectronSaveEditorLauncher({ openSaveEditorWindow });

    await launcher.open('  game-123  ');

    expect(openSaveEditorWindow).toHaveBeenCalledTimes(1);
    expect(openSaveEditorWindow).toHaveBeenCalledWith('game-123');
  });

  it('throws when IPC bridge is unavailable', async () => {
    const launcher = new ElectronSaveEditorLauncher(undefined);

    await expect(launcher.open('game-123')).rejects.toThrow('Save editor IPC bridge is unavailable');
  });

  it('throws when gameKey is empty or whitespace', async () => {
    const openSaveEditorWindow = vi.fn().mockResolvedValue(undefined);
    const launcher = new ElectronSaveEditorLauncher({ openSaveEditorWindow });

    await expect(launcher.open('   ')).rejects.toThrow('Missing required gameKey');
    expect(openSaveEditorWindow).not.toHaveBeenCalled();
  });

  it('surfaces IPC rejection errors when window launch fails', async () => {
    const openSaveEditorWindow = vi.fn().mockRejectedValue(new Error('Window spawn failed'));
    const launcher = new ElectronSaveEditorLauncher({ openSaveEditorWindow });

    await expect(launcher.open('game-123')).rejects.toThrow('Window spawn failed');
  });
});

describe('initSaveEditorUI seam & standalone loop suppression', () => {
  afterEach(() => {
    delete (window as { showSaveEditor?: unknown }).showSaveEditor;
    delete (window as { __IS_STANDALONE_SAVE_EDITOR__?: unknown }).__IS_STANDALONE_SAVE_EDITOR__;
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('attaches window.showSaveEditor in main window context and delegates to launcher', async () => {
    const mockLauncher: ISaveEditorLauncher = {
      open: vi.fn().mockResolvedValue(undefined),
    };

    initSaveEditorUI(mockLauncher);

    expect(typeof window.showSaveEditor).toBe('function');
    await window.showSaveEditor?.('game-1');
    expect(mockLauncher.open).toHaveBeenCalledTimes(1);
    expect(mockLauncher.open).toHaveBeenCalledWith('game-1');
  });

  it('suppresses window.showSaveEditor when __IS_STANDALONE_SAVE_EDITOR__ is true', () => {
    window.__IS_STANDALONE_SAVE_EDITOR__ = true;
    const mockLauncher: ISaveEditorLauncher = {
      open: vi.fn().mockResolvedValue(undefined),
    };

    initSaveEditorUI(mockLauncher);

    expect(window.showSaveEditor).toBeUndefined();
  });

  it('suppresses window.showSaveEditor when URL search contains gameKey=', () => {
    window.history.replaceState(null, '', '/?gameKey=demo');
    const mockLauncher: ISaveEditorLauncher = {
      open: vi.fn().mockResolvedValue(undefined),
    };

    initSaveEditorUI(mockLauncher);

    expect(window.showSaveEditor).toBeUndefined();
  });

  it('suppresses window.showSaveEditor when URL pathname contains save-editor', () => {
    window.history.replaceState(null, '', '/save-editor.html');
    const mockLauncher: ISaveEditorLauncher = {
      open: vi.fn().mockResolvedValue(undefined),
    };

    initSaveEditorUI(mockLauncher);

    expect(window.showSaveEditor).toBeUndefined();
  });
});

describe('mountStandaloneSaveEditor', () => {
  afterEach(() => {
    delete (window as { __IS_STANDALONE_SAVE_EDITOR__?: unknown }).__IS_STANDALONE_SAVE_EDITOR__;
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('sets __IS_STANDALONE_SAVE_EDITOR__, opens controller, and cleans up on dispose', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const destroy = vi.fn();
    const controllerFactory = vi.fn(() => ({ open, destroy }));
    const fakeRoot = document.createElement('div');
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');

    const cleanup = await mountStandaloneSaveEditor(fakeRoot, '?gameKey=my-game', { controllerFactory });

    expect(window.__IS_STANDALONE_SAVE_EDITOR__).toBe(true);
    expect(controllerFactory).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('my-game', { isStandaloneWindow: true });

    cleanup();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(removeListenerSpy).toHaveBeenCalledWith('beforeunload', cleanup);
    expect(removeListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

    // Idempotent second cleanup
    cleanup();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('renders error fallback when gameKey is missing or empty', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const controllerFactory = vi.fn();
    const fakeRoot = document.createElement('div');

    const cleanup = await mountStandaloneSaveEditor(fakeRoot, '?gameKey=   ', { controllerFactory });

    expect(controllerFactory).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[SaveEditor] Missing or empty gameKey parameter in standalone window.'
    );
    const errorEl = fakeRoot.querySelector('.save-editor-error');
    expect(errorEl?.textContent).toBe('Missing required gameKey parameter.');

    cleanup();
  });

  it('sanitizes local user paths in console.error and DOM fallback when controller.open rejects', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('Failed to open C:\\Users\\Alice\\save.dat');
    err.stack = 'Error: Failed to open C:\\Users\\Alice\\save.dat\n    at C:\\Users\\Alice\\app.js:10:5';
    const open = vi.fn().mockRejectedValue(err);
    const destroy = vi.fn();
    const controllerFactory = vi.fn(() => ({ open, destroy }));
    const fakeRoot = document.createElement('div');

    const cleanup = await mountStandaloneSaveEditor(fakeRoot, '?gameKey=valid-game', { controllerFactory });

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    const [prefix, payload] = consoleErrorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(prefix).toBe('[SaveEditor] Failed to mount standalone view controller:');
    expect(payload.gameKey).toBe('valid-game');
    expect(payload.error).toBe('Failed to open <USER_DIR>\\save.dat');
    expect(payload.stack).toEqual(expect.not.stringContaining('Alice'));
    expect(JSON.stringify(payload)).toEqual(expect.not.stringContaining('Alice'));

    const errorEl = fakeRoot.querySelector('.save-editor-error');
    expect(errorEl?.textContent).toBe('Failed to load save editor: Failed to open <USER_DIR>\\save.dat');

    cleanup();
  });

  it('registers global error sanitizer that redacts paths and detaches on cleanup', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const open = vi.fn().mockResolvedValue(undefined);
    const destroy = vi.fn();
    const fakeRoot = document.createElement('div');

    const cleanup = await mountStandaloneSaveEditor(fakeRoot, '?gameKey=valid-game', {
      controllerFactory: () => ({ open, destroy }),
    });

    const errEvent = new ErrorEvent('error', {
      message: 'Crash at C:\\Users\\Alice\\save.dat',
      filename: 'C:\\Users\\Alice\\renderer.js',
      lineno: 42,
      colno: 7,
      error: new Error('Boom at C:\\Users\\Alice\\save.dat'),
    });
    window.dispatchEvent(errEvent);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = consoleErrorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(prefix).toBe('[SaveEditor] Uncaught error:');
    expect(JSON.stringify(payload)).toEqual(expect.not.stringContaining('Alice'));
    expect(payload.message).toBe('Crash at <USER_DIR>\\save.dat');

    cleanup();
    consoleErrorSpy.mockClear();

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'After cleanup',
      })
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
