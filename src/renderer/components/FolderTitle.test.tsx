import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enLocale from '../../locales/builtins/en.json';
import { resetLocaleCacheForTests } from '../i18n/locale-strings';
import { FolderTitle } from './FolderTitle';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('FolderTitle', () => {
  const strings = enLocale.strings;

  beforeEach(() => {
    resetLocaleCacheForTests();
    vi.restoreAllMocks();
  });

  it('renders idle heading with aria-description and enters edit mode on click, F2, or Enter', () => {
    const onRenameFolder = vi.fn().mockResolvedValue({ ok: true });
    render(
      <FolderTitle
        folderPath="D:\\Games\\VN"
        displayName="VN"
        onRenameFolder={onRenameFolder}
      />
    );

    const heading = screen.getByRole('heading', { level: 3, name: 'VN' });
    expect(heading).toHaveClass('folder-section-title');
    expect(heading).toHaveAttribute('tabindex', '0');
    expect(heading).toHaveAttribute('aria-description', strings.rename_folder_hint);

    fireEvent.click(heading);
    const input = document.querySelector<HTMLInputElement>('.rename-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('VN');
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input!, { key: 'Escape' });
    const headingAfterEsc = screen.getByRole('heading', { level: 3, name: 'VN' });
    fireEvent.keyDown(headingAfterEsc, { key: 'F2' });
    expect(document.querySelector('.rename-input')).toBeInTheDocument();

    fireEvent.keyDown(document.querySelector('.rename-input')!, { key: 'Escape' });
    const headingAfterF2 = screen.getByRole('heading', { level: 3, name: 'VN' });
    fireEvent.keyDown(headingAfterF2, { key: 'Enter' });
    expect(document.querySelector('.rename-input')).toBeInTheDocument();
  });

  it('(a) handles rejected onRenameFolder by reverting to editing, preserving draft, setting aria-invalid, calling onShowToast, and logging sanitized console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onShowToast = vi.fn();
    const onRenameFolder = vi
      .fn()
      .mockRejectedValue(new Error('IPC error at C:\\Users\\John Doe\\Games\\VN'));

    render(
      <FolderTitle
        folderPath="C:\\Users\\John Doe\\Games\\VN"
        displayName="VN"
        onRenameFolder={onRenameFolder}
        onShowToast={onShowToast}
      />
    );

    fireEvent.click(screen.getByRole('heading', { level: 3 }));
    const input = document.querySelector<HTMLInputElement>('.rename-input')!;
    fireEvent.change(input, { target: { value: 'Visual Novels' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    const recoveredInput = document.querySelector<HTMLInputElement>('.rename-input')!;
    expect(recoveredInput).toBeInTheDocument();
    expect(recoveredInput).toHaveValue('Visual Novels');
    expect(recoveredInput).not.toHaveAttribute('readonly');
    expect(recoveredInput).not.toHaveAttribute('aria-busy', 'true');
    expect(recoveredInput).toHaveAttribute('aria-invalid', 'true');
    expect(onShowToast).toHaveBeenCalledWith(strings.toast_folder_rename_failed);
    expect(errorSpy).toHaveBeenCalledWith(
      '[FolderTitle] Folder rename rejected:',
      expect.objectContaining({
        folderPath: expect.not.stringContaining('John Doe'),
        error: expect.not.stringContaining('John Doe'),
      })
    );
  });

  it('(b) restores focus post-commit to <input> with aria-invalid="true" when blur-triggered commit fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onShowToast = vi.fn();
    const onRenameFolder = vi.fn().mockResolvedValue({ ok: false, error: 'outside-library' });

    render(
      <FolderTitle
        folderPath="/Users/alice/Games/VN"
        displayName="VN"
        onRenameFolder={onRenameFolder}
        onShowToast={onShowToast}
      />
    );

    fireEvent.click(screen.getByRole('heading', { level: 3 }));
    const input = document.querySelector<HTMLInputElement>('.rename-input')!;
    fireEvent.change(input, { target: { value: 'New Alias' } });

    await act(async () => {
      fireEvent.blur(input, { relatedTarget: null });
    });

    const recoveredInput = document.querySelector<HTMLInputElement>('.rename-input')!;
    expect(recoveredInput).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(recoveredInput);
    expect(onShowToast).toHaveBeenCalledWith(strings.error_outside_library);
  });

  it('(c) suppresses Escape while status is submitting without exiting edit mode', async () => {
    const deferred = createDeferred<{ ok: boolean }>();
    const onRenameFolder = vi.fn().mockReturnValue(deferred.promise);

    render(
      <FolderTitle
        folderPath="D:\\Games\\VN"
        displayName="VN"
        onRenameFolder={onRenameFolder}
      />
    );

    fireEvent.click(screen.getByRole('heading', { level: 3 }));
    const input = document.querySelector<HTMLInputElement>('.rename-input')!;
    fireEvent.change(input, { target: { value: 'Updated VN' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('aria-busy', 'true');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.querySelector('.rename-input')).toBeInTheDocument();

    await act(async () => {
      deferred.resolve({ ok: true });
      await deferred.promise;
    });

    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  it('(d) pressing Escape followed synchronously by blur does not invoke onRenameFolder and restores focus to idle heading', () => {
    const onRenameFolder = vi.fn().mockResolvedValue({ ok: true });

    render(
      <FolderTitle
        folderPath="D:\\Games\\VN"
        displayName="VN"
        onRenameFolder={onRenameFolder}
      />
    );

    fireEvent.click(screen.getByRole('heading', { level: 3 }));
    const input = document.querySelector<HTMLInputElement>('.rename-input')!;
    fireEvent.change(input, { target: { value: 'Changed' } });

    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input, { relatedTarget: null });

    expect(onRenameFolder).not.toHaveBeenCalled();
    const heading = screen.getByRole('heading', { level: 3, name: 'VN' });
    expect(document.activeElement).toBe(heading);
  });

  it('(e) pressing Enter followed synchronously by blur invokes onRenameFolder exactly once', async () => {
    const deferred = createDeferred<{ ok: boolean }>();
    const onRenameFolder = vi.fn().mockReturnValue(deferred.promise);

    render(
      <FolderTitle
        folderPath="D:\\Games\\VN"
        displayName="VN"
        onRenameFolder={onRenameFolder}
      />
    );

    fireEvent.click(screen.getByRole('heading', { level: 3 }));
    const input = document.querySelector<HTMLInputElement>('.rename-input')!;
    fireEvent.change(input, { target: { value: 'Updated' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input, { relatedTarget: null });

    expect(onRenameFolder).toHaveBeenCalledTimes(1);
    expect(onRenameFolder).toHaveBeenCalledWith('D:\\\\Games\\\\VN', 'Updated');

    await act(async () => {
      deferred.resolve({ ok: true });
      await deferred.promise;
    });
  });

  it('(f) committing an unchanged displayName exits edit mode without invoking onRenameFolder', () => {
    const onRenameFolder = vi.fn().mockResolvedValue({ ok: true });

    render(
      <FolderTitle
        folderPath="D:\\Games\\VN"
        displayName="VN"
        onRenameFolder={onRenameFolder}
      />
    );

    fireEvent.click(screen.getByRole('heading', { level: 3 }));
    const input = document.querySelector<HTMLInputElement>('.rename-input')!;
    fireEvent.change(input, { target: { value: '  VN  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameFolder).not.toHaveBeenCalled();
    const heading = screen.getByRole('heading', { level: 3, name: 'VN' });
    expect(document.activeElement).toBe(heading);
  });

  it('(g) { ok: false } emits console.warn with sanitizeUserPaths scrubbing on both folderPath and res.error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onRenameFolder = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Failed at /Users/alice/Games/VN' });

    render(
      <FolderTitle
        folderPath="/Users/alice/Games/VN"
        displayName="VN"
        onRenameFolder={onRenameFolder}
      />
    );

    fireEvent.click(screen.getByRole('heading', { level: 3 }));
    const input = document.querySelector<HTMLInputElement>('.rename-input')!;
    fireEvent.change(input, { target: { value: 'New Name' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[FolderTitle] Folder rename failed:',
      expect.objectContaining({
        folderPath: expect.not.stringContaining('alice'),
        error: expect.not.stringContaining('alice'),
      })
    );
  });

  it('(h) Enter commit restores focus to idle heading, whereas onBlur with non-null relatedTarget does not steal focus', async () => {
    const onRenameFolder = vi.fn().mockResolvedValue({ ok: true });

    render(
      <div>
        <FolderTitle
          folderPath="D:\\Games\\VN"
          displayName="VN"
          onRenameFolder={onRenameFolder}
        />
        <button type="button">External Button</button>
      </div>
    );

    // 1. Enter with valid new name -> focus returns to heading
    fireEvent.click(screen.getByRole('heading', { level: 3 }));
    const input1 = document.querySelector<HTMLInputElement>('.rename-input')!;
    fireEvent.change(input1, { target: { value: 'Renamed VN' } });

    await act(async () => {
      fireEvent.keyDown(input1, { key: 'Enter' });
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 3 }));
    });

    // 2. onBlur with non-null relatedTarget -> does not steal focus back to heading
    fireEvent.click(screen.getByRole('heading', { level: 3 }));
    const input2 = document.querySelector<HTMLInputElement>('.rename-input')!;
    const externalBtn = screen.getByRole('button', { name: 'External Button' });

    await act(async () => {
      externalBtn.focus();
      fireEvent.blur(input2, { relatedTarget: externalBtn });
    });

    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    expect(document.activeElement).toBe(externalBtn);
  });
});
