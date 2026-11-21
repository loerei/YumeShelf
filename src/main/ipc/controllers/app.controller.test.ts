import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppIpcController } from './app.controller';

describe('AppIpcController (open-external-url)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createHarness(shellOverrides: Record<string, any> = {}) {
    const handlers = new Map<string, (...args: any[]) => any>();
    const listeners = new Map<string, (...args: any[]) => any>();

    const mockIpcMain: any = {
      handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
        handlers.set(channel, handler);
      }),
      on: vi.fn((channel: string, listener: (...args: any[]) => any) => {
        listeners.set(channel, listener);
      }),
    };

    const mockShell: any = {
      openExternal: vi.fn(async () => {}),
      ...shellOverrides,
    };

    const controller = new AppIpcController({
      ipcMain: mockIpcMain,
      shell: mockShell,
    } as any);
    controller.registerHandlers();

    return {
      handler: handlers.get('open-external-url')!,
      mockShell,
    };
  }

  it('delegates valid https/http URLs to shell.openExternal and resolves { ok: true }', async () => {
    const { handler, mockShell } = createHarness();
    const res = await handler({}, 'https://example.com');
    expect(res).toEqual({ ok: true });
    expect(mockShell.openExternal).toHaveBeenCalledWith('https://example.com/');
  });

  it('blocks unauthorized protocols with sanitized warnings and returns unauthorized-protocol', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { handler, mockShell } = createHarness();

    for (const url of ['file:///Users/alice/secret.txt', 'javascript:alert(1)', 'data:text/html,hi']) {
      const res = await handler({}, url);
      expect(res).toEqual({ ok: false, reason: 'unauthorized-protocol' });
    }

    expect(mockShell.openExternal).not.toHaveBeenCalled();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('alice');
  });

  it('handles malformed or non-string inputs safely and returns invalid-url', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { handler, mockShell } = createHarness();

    for (const bad of ['', null, undefined, 'not a url', 123]) {
      const res = await handler({}, bad);
      expect(res).toEqual({ ok: false, reason: 'invalid-url' });
    }

    expect(mockShell.openExternal).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('catches shell.openExternal rejections, logs sanitized warning, and returns open-failed', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { handler } = createHarness({
      openExternal: vi.fn(async () => {
        throw new Error('Failed at C:\\Users\\alice\\browser.exe');
      }),
    });

    const res = await handler({}, 'https://example.com/path');
    expect(res).toEqual({ ok: false, reason: 'open-failed' });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('alice');
    expect(JSON.stringify(warnSpy.mock.calls)).toContain('<USER_DIR>');
  });
});
