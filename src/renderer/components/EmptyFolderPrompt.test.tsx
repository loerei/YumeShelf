import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enLocale from '../../locales/builtins/en.json';
import { resetLocaleCacheForTests } from '../i18n/locale-strings';
import { EmptyFolderPrompt } from './EmptyFolderPrompt';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('EmptyFolderPrompt', () => {
  const strings = enLocale.strings;

  beforeEach(() => {
    resetLocaleCacheForTests();
    vi.restoreAllMocks();
  });

  it('(a) maps kebab-case backend error codes to localized strings via resolveLocalizedErrorCode', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onShowToast = vi.fn();
    const onAddManualGame = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'outside-library' })
      .mockResolvedValueOnce({ ok: false, error: 'target-not-found' });

    render(
      <EmptyFolderPrompt
        folderPath="D:\\Games\\VN"
        onAddManualGame={onAddManualGame}
        onShowToast={onShowToast}
      />
    );

    const btn = screen.getByRole('button', { name: strings.add_game_to_folder });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onShowToast).toHaveBeenLastCalledWith(strings.error_outside_library);

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onShowToast).toHaveBeenLastCalledWith(strings.error_target_not_found);
  });

  it('(b) guards two synchronous clicks so onAddManualGame is invoked only once while in-flight', async () => {
    const deferred = createDeferred<{ ok: boolean }>();
    const onAddManualGame = vi.fn().mockReturnValue(deferred.promise);

    render(
      <EmptyFolderPrompt
        folderPath="D:\\Games\\VN"
        onAddManualGame={onAddManualGame}
      />
    );

    const btn = screen.getByRole('button', { name: strings.add_game_to_folder });
    btn.focus();

    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(onAddManualGame).toHaveBeenCalledTimes(1);
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveTextContent(strings.empty_folder_selecting);
    expect(document.activeElement).toBe(btn);

    await act(async () => {
      deferred.resolve({ ok: true });
      await deferred.promise;
    });

    expect(btn).not.toHaveAttribute('aria-busy');
    expect(btn).not.toHaveAttribute('aria-disabled');
    expect(btn).toHaveTextContent(strings.manual_add_prompt);
  });

  it('(c) resets aria-busy/aria-disabled without calling onShowToast when canceled', async () => {
    const onShowToast = vi.fn();
    const onAddManualGame = vi.fn().mockResolvedValue({ ok: false, canceled: true });

    render(
      <EmptyFolderPrompt
        folderPath="D:\\Games\\VN"
        onAddManualGame={onAddManualGame}
        onShowToast={onShowToast}
      />
    );

    const btn = screen.getByRole('button', { name: strings.add_game_to_folder });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(btn).not.toHaveAttribute('aria-busy');
    expect(btn).not.toHaveAttribute('aria-disabled');
    expect(onShowToast).not.toHaveBeenCalled();
  });

  it('(d) resets aria-busy/aria-disabled in finally, logs sanitized console.error, and calls onShowToast on rejection', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onShowToast = vi.fn();
    const onAddManualGame = vi
      .fn()
      .mockRejectedValue(new Error('Dialog failed at C:\\Users\\John Doe\\Games\\VN'));

    render(
      <EmptyFolderPrompt
        folderPath="C:\\Users\\John Doe\\Games\\VN"
        onAddManualGame={onAddManualGame}
        onShowToast={onShowToast}
      />
    );

    const btn = screen.getByRole('button', { name: strings.add_game_to_folder });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(btn).not.toHaveAttribute('aria-busy');
    expect(btn).not.toHaveAttribute('aria-disabled');
    expect(onShowToast).toHaveBeenCalledWith(strings.toast_manual_add_failed);
    expect(errorSpy).toHaveBeenCalledWith(
      '[EmptyFolderPrompt] Manual game addition rejected:',
      expect.objectContaining({
        folderPath: expect.not.stringContaining('John Doe'),
        error: expect.not.stringContaining('John Doe'),
      })
    );
  });

  it('(e) falls back to toast_manual_add_failed for prototype-key error codes like toString and constructor', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onShowToast = vi.fn();
    const onAddManualGame = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'toString' })
      .mockResolvedValueOnce({ ok: false, error: 'constructor' });

    render(
      <EmptyFolderPrompt
        folderPath="/Users/alice/Games/VN"
        onAddManualGame={onAddManualGame}
        onShowToast={onShowToast}
      />
    );

    const btn = screen.getByRole('button', { name: strings.add_game_to_folder });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onShowToast).toHaveBeenLastCalledWith(strings.toast_manual_add_failed);

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onShowToast).toHaveBeenLastCalledWith(strings.toast_manual_add_failed);
  });
});
