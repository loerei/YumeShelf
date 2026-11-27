import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SaveFolderBar } from './SaveFolderBar';

describe('SaveFolderBar', () => {
  it('displays resolved directory path, fallback default label, and loading state', () => {
    const onSelect = vi.fn().mockResolvedValue(undefined);
    const onReset = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <SaveFolderBar
        saveDir="C:\Games\YumeNikki\Save"
        onSelectDirectory={onSelect}
        onResetDirectory={onReset}
      />
    );

    const pathEl = screen.getByTitle('C:\\Games\\YumeNikki\\Save');
    expect(pathEl.textContent).toBe('C:\\Games\\YumeNikki\\Save');
    expect(screen.queryByText('Override')).toBeNull();
    expect(screen.queryByRole('button', { name: /Reset to default save directory/i })).toBeNull();

    rerender(
      <SaveFolderBar
        saveDir={null}
        onSelectDirectory={onSelect}
        onResetDirectory={onReset}
      />
    );
    expect(screen.getByTitle('Default Save Directory').textContent).toBe('Default Save Directory');

    rerender(
      <SaveFolderBar
        saveDir="C:\Games\YumeNikki\Save"
        isLoading={true}
        onSelectDirectory={onSelect}
        onResetDirectory={onReset}
      />
    );
    expect(screen.getByTitle('Resolving save folder...').textContent).toBe(
      'Resolving save folder...'
    );
  });

  it('renders Override badge and Reset button when isOverride is true', () => {
    render(
      <SaveFolderBar
        saveDir="/custom/saves"
        isOverride={true}
        onSelectDirectory={vi.fn().mockResolvedValue(undefined)}
        onResetDirectory={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByText('Override')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset to default save directory' })).toBeTruthy();
  });

  it('renders missing folder alert banner with role="alert" when isMissing is true', () => {
    const { container } = render(
      <SaveFolderBar
        saveDir="/missing/saves"
        isOverride={true}
        isMissing={true}
        onSelectDirectory={vi.fn().mockResolvedValue(undefined)}
        onResetDirectory={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const bar = container.querySelector('.save-folder-bar');
    expect(bar?.classList.contains('has-missing-folder')).toBe(true);

    const alert = screen.getByRole('alert');
    expect(alert.classList.contains('save-folder-missing-alert')).toBe(true);
    expect(alert.textContent).toBe('Configured save folder not found');
  });

  it('renders folderError alert with Retry button and transfers focus from Retry to Change button', () => {
    const onRetry = vi.fn();
    render(
      <SaveFolderBar
        saveDir={null}
        folderError="Failed to resolve save directory"
        onRetryFolder={onRetry}
        onSelectDirectory={vi.fn().mockResolvedValue(undefined)}
        onResetDirectory={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Failed to resolve save directory');

    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    const changeBtn = screen.getByRole('button', { name: 'Choose save directory' });

    retryBtn.focus();
    expect(document.activeElement).toBe(retryBtn);

    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(changeBtn);
  });

  it('guards in-flight async directory selection and reset via isActionPending and aria-disabled', async () => {
    let resolveSelect!: () => void;
    const onSelect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSelect = resolve;
        })
    );
    const onReset = vi.fn().mockResolvedValue(undefined);

    render(
      <SaveFolderBar
        saveDir="/custom/saves"
        isOverride={true}
        onSelectDirectory={onSelect}
        onResetDirectory={onReset}
      />
    );

    const changeBtn = screen.getByRole('button', { name: 'Choose save directory' });
    const resetBtn = screen.getByRole('button', { name: 'Reset to default save directory' });

    fireEvent.click(changeBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(changeBtn.textContent).toBe('Choosing...');
    expect(changeBtn.getAttribute('aria-disabled')).toBe('true');
    expect(changeBtn.hasAttribute('disabled')).toBe(false);
    expect(resetBtn.getAttribute('aria-disabled')).toBe('true');

    // Duplicate activations while pending must be ignored
    fireEvent.click(changeBtn);
    fireEvent.click(resetBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onReset).not.toHaveBeenCalled();

    await act(async () => {
      resolveSelect();
    });

    expect(changeBtn.textContent).toBe('Change...');
    expect(changeBtn.getAttribute('aria-disabled')).toBe('false');
  });

  it('invokes electronAPI.setSaveFolderOverride({ gameKey, folderPath: null }) on reset and synchronously transfers focus to Change button when Reset unmounts', async () => {
    const setSaveFolderOverride = vi.fn().mockResolvedValue({ ok: true, saveFolderOverride: null });

    function Wrapper() {
      const [isOverride, setIsOverride] = React.useState(true);
      const [saveDir, setSaveDir] = React.useState<string | null>('/override/path');
      return (
        <SaveFolderBar
          saveDir={saveDir}
          isOverride={isOverride}
          onSelectDirectory={vi.fn().mockResolvedValue(undefined)}
          onResetDirectory={async () => {
            await setSaveFolderOverride({ gameKey: 'yume-nikki', folderPath: null });
            setIsOverride(false);
            setSaveDir('/default/path');
          }}
        />
      );
    }

    render(<Wrapper />);

    const changeBtn = screen.getByRole('button', { name: 'Choose save directory' });
    const resetBtn = screen.getByRole('button', { name: 'Reset to default save directory' });

    resetBtn.focus();
    expect(document.activeElement).toBe(resetBtn);

    await act(async () => {
      fireEvent.click(resetBtn);
    });

    expect(setSaveFolderOverride).toHaveBeenCalledWith({
      gameKey: 'yume-nikki',
      folderPath: null,
    });
    expect(screen.queryByRole('button', { name: 'Reset to default save directory' })).toBeNull();
    expect(document.activeElement).toBe(changeBtn);
  });

  it('truncates paths exceeding 200 characters with min-width: 0 and declares matching CSS containment and elevation tokens in save-editor.css', () => {
    const longPath = `C:\\Users\\Player\\AppData\\LocalLow\\StudioName\\GameTitle\\${'NestedDirectory\\'.repeat(15)}Saves`;
    expect(longPath.length).toBeGreaterThan(200);

    const { container } = render(
      <SaveFolderBar
        saveDir={longPath}
        isOverride={true}
        onSelectDirectory={vi.fn().mockResolvedValue(undefined)}
        onResetDirectory={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const pathEl = container.querySelector('.save-folder-path') as HTMLElement;
    expect(pathEl).toBeTruthy();
    expect(pathEl.getAttribute('title')).toBe(longPath);
    expect(['0', '0px']).toContain(pathEl.style.minWidth);

    const cssPath = path.resolve(__dirname, '../../../../styles/save-editor.css');
    const cssText = fs.readFileSync(cssPath, 'utf-8');

    expect(cssText).toMatch(/\.save-folder-bar\s*\{[^}]*min-width:\s*0;/s);
    expect(cssText).toMatch(/\.save-folder-header\s*\{[^}]*min-width:\s*0;/s);
    expect(cssText).toMatch(
      /\.save-folder-path\s*\{[^}]*white-space:\s*nowrap;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*min-width:\s*0;/s
    );
    expect(cssText).toMatch(
      /\.save-editor-popover\s*\{[^}]*z-index:\s*var\(--zIndex-dropdown,\s*1000\);[^}]*isolation:\s*isolate;/s
    );
    expect(cssText).toMatch(
      /\.save-editor-rename-tooltip\s*\{[^}]*z-index:\s*var\(--zIndex-tooltip,\s*10000\);/s
    );
    expect(cssText).toMatch(/#save-editor-root\s*\{[^}]*isolation:\s*isolate;/s);
    expect(cssText).toMatch(/\.save-editor-overlay\s*\{[^}]*isolation:\s*isolate;/s);
    expect(cssText).toMatch(
      /\.standalone-save-editor\s+\.save-editor-overlay\s*\{[^}]*position:\s*static;[^}]*z-index:\s*auto;/s
    );
  });

  it('renders path as a clickable button when onOpenFolder is provided for a valid folder and stays non-clickable when loading, missing, or errored', () => {
    const dir = 'C:\\Games\\YumeNikki\\Save';
    const onOpenFolder = vi.fn();
    const onSelect = vi.fn().mockResolvedValue(undefined);
    const onReset = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <SaveFolderBar
        saveDir={dir}
        onOpenFolder={onOpenFolder}
        onSelectDirectory={onSelect}
        onResetDirectory={onReset}
      />
    );

    const pathBtn = screen.getByRole('button', { name: dir });
    fireEvent.click(pathBtn);
    expect(onOpenFolder).toHaveBeenCalledTimes(1);

    rerender(
      <SaveFolderBar
        saveDir={dir}
        isLoading={true}
        onOpenFolder={onOpenFolder}
        onSelectDirectory={onSelect}
        onResetDirectory={onReset}
      />
    );
    expect(screen.queryByRole('button', { name: 'Resolving save folder...' })).toBeNull();

    rerender(
      <SaveFolderBar
        saveDir={dir}
        isMissing={true}
        onOpenFolder={onOpenFolder}
        onSelectDirectory={onSelect}
        onResetDirectory={onReset}
      />
    );
    expect(screen.queryByRole('button', { name: dir })).toBeNull();

    rerender(
      <SaveFolderBar
        saveDir={dir}
        folderError="Failed"
        onOpenFolder={onOpenFolder}
        onSelectDirectory={onSelect}
        onResetDirectory={onReset}
      />
    );
    expect(screen.queryByRole('button', { name: dir })).toBeNull();
  });
});
