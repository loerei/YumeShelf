import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NormalizedSaveDto } from '@yumeshelf/engine/types';
import type { ElectronAPI } from '../../../../shared/types/ipc';
import {
  createSaveEditorStore,
  SaveEditorStoreProvider,
} from '../../store/save-editor-store';
import { SaveEditorSidebar } from './SaveEditorSidebar';

const createMockDto = (fileName = 'slot1.sav'): NormalizedSaveDto => ({
  gameKey: 'game-1',
  fileName,
  strategy: 'rpg-maker-mv',
  tabs: [{ id: 'variables', label: 'Variables', count: 1 }],
  fields: [
    {
      id: 'variables:1',
      tabId: 'variables',
      key: '1',
      label: 'Gold',
      type: 'number',
      value: 500,
    },
  ],
});

describe('SaveEditorSidebar', () => {
  it('renders SaveFolderBar and SaveFileList, resolves folder info, and supports retry on folder resolution error', async () => {
    const getSaveFolder = vi
      .fn()
      .mockRejectedValueOnce(new Error("Access denied to 'C:\\Users\\SecretUser\\Saves'"))
      .mockResolvedValueOnce({
        path: 'C:\\Games\\Yume\\Save',
        engine: 'rpg-maker-mv',
        confidence: 'high',
        source: 'override',
      });
    const listSaveFiles = vi.fn().mockResolvedValue(['file1.rpgsave']);

    const api = {
      getSaveFolder,
      listSaveFiles,
    } as unknown as ElectronAPI;

    const store = createSaveEditorStore('game-1');

    render(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveEditorSidebar />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).not.toContain('SecretUser');

    // Click Retry to re-query getSaveFolder
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    });

    expect(getSaveFolder).toHaveBeenCalledTimes(2);
    expect(screen.getByTitle('C:\\Games\\Yume\\Save')).toBeTruthy();
    expect(screen.getByText('Override')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'file1.rpgsave' })).toBeTruthy();
  });

  it('handles directory selection and override reset, incrementing folderRevision and resetting loaded save state to idle', async () => {
    const getSaveFolder = vi.fn().mockResolvedValue({
      path: '/initial/saves',
      engine: 'rpg-maker-mv',
      confidence: 'high',
      source: 'deterministic',
    });
    const listSaveFiles = vi
      .fn()
      .mockResolvedValueOnce(['slot1.sav'])
      .mockResolvedValueOnce(['custom1.sav'])
      .mockResolvedValueOnce(['default1.sav']);
    const selectSaveFolder = vi.fn().mockResolvedValue({
      canceled: false,
      folderPath: '/custom/override',
    });
    const setSaveFolderOverride = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, saveFolderOverride: '/custom/override' })
      .mockResolvedValueOnce({ ok: true, saveFolderOverride: null });

    const api = {
      getSaveFolder,
      listSaveFiles,
      selectSaveFolder,
      setSaveFolderOverride,
    } as unknown as ElectronAPI;

    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));

    render(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveEditorSidebar />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // 1. Select new folder override
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose save directory' }));
    });

    expect(selectSaveFolder).toHaveBeenCalledTimes(1);
    expect(setSaveFolderOverride).toHaveBeenCalledWith({
      gameKey: 'game-1',
      folderPath: '/custom/override',
    });
    expect(store.getSnapshot().fileStatus).toEqual({ state: 'idle' });
    expect(screen.getByTitle('/custom/override')).toBeTruthy();
    expect(screen.getByText('Override')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'custom1.sav' })).toBeTruthy();

    // 2. Reset folder override
    act(() => {
      store.setFileLoaded(createMockDto('custom1.sav'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset to default save directory' }));
    });

    expect(setSaveFolderOverride).toHaveBeenCalledWith({
      gameKey: 'game-1',
      folderPath: null,
    });
    expect(store.getSnapshot().fileStatus).toEqual({ state: 'idle' });
    expect(screen.queryByText('Override')).toBeNull();
    expect(screen.getByRole('button', { name: 'default1.sav' })).toBeTruthy();
  });

  it('intercepts directory change and override reset with Unsaved Changes modal when dirtyKeys.size > 0', async () => {
    const selectSaveFolder = vi.fn().mockResolvedValue({
      canceled: false,
      folderPath: '/new/saves',
    });
    const setSaveFolderOverride = vi.fn().mockResolvedValue({
      ok: true,
      saveFolderOverride: null,
    });
    const api = {
      getSaveFolder: vi.fn().mockResolvedValue({
        path: '/override/saves',
        source: 'override',
      }),
      listSaveFiles: vi.fn().mockResolvedValue(['slot1.sav']),
      selectSaveFolder,
      setSaveFolderOverride,
    } as unknown as ElectronAPI;

    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));
    store.updateField('variables:1', 999);

    render(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveEditorSidebar />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Click Change... while dirty -> opens Unsaved Changes modal
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose save directory' }));
    });
    expect(selectSaveFolder).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Cancel preserves dirty state
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getSnapshot().dirtyKeys.size).toBe(1);

    // Click Reset while dirty -> opens Unsaved Changes modal, then confirm Discard Changes
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset to default save directory' }));
    });
    expect(setSaveFolderOverride).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    });

    expect(setSaveFolderOverride).toHaveBeenCalledWith({
      gameKey: 'game-1',
      folderPath: null,
    });
    expect(store.getSnapshot().fileStatus).toEqual({ state: 'idle' });
    expect(store.getSnapshot().dirtyKeys.size).toBe(0);
  });

  it('disables SaveFolderBar while saving or mutating files and forwards retryRequest and listFocusRef to SaveFileList', async () => {
    const loadSaveData = vi.fn().mockResolvedValue(createMockDto('slot1.sav'));
    const api = {
      getSaveFolder: vi.fn().mockResolvedValue({ path: '/saves', source: 'deterministic' }),
      listSaveFiles: vi.fn().mockResolvedValue(['slot1.sav']),
      loadSaveData,
    } as unknown as ElectronAPI;

    const store = createSaveEditorStore('game-1');
    const listFocusRef = React.createRef<HTMLDivElement>();

    const { rerender } = render(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveEditorSidebar listFocusRef={listFocusRef} retryRequest={null} />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(listFocusRef.current).toBe(screen.getByTestId('save-file-list'));
    listFocusRef.current?.focus();
    expect(document.activeElement).toBe(screen.getByTestId('save-file-list'));

    // Disables SaveFolderBar when mutating file
    act(() => {
      store.setMutatingFile(true);
    });
    expect(
      screen.getByRole('button', { name: 'Choose save directory' }).getAttribute('aria-disabled')
    ).toBe('true');

    act(() => {
      store.setMutatingFile(false);
    });
    expect(
      screen.getByRole('button', { name: 'Choose save directory' }).getAttribute('aria-disabled')
    ).toBe('false');

    // Forwarding retryRequest triggers loadSaveData
    rerender(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveEditorSidebar
          listFocusRef={listFocusRef}
          retryRequest={{ fileName: 'slot1.sav', requestId: 1 }}
        />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(loadSaveData).toHaveBeenCalledWith({ gameKey: 'game-1', fileName: 'slot1.sav' });
  });
});
