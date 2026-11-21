import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NormalizedSaveDto } from '@yumeshelf/engine/types';
import type { ElectronAPI } from '../../../shared/types/ipc';
import { SaveEditorFooter } from './SaveEditorFooter';
import {
  createSaveEditorStore,
  SaveEditorStoreProvider,
} from '../store/save-editor-store';

const flushPromises = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
};

function createMockDto(
  fileName = 'slot1.sav',
  overrides: Partial<NormalizedSaveDto> = {}
): NormalizedSaveDto {
  return {
    gameKey: 'game-1',
    fileName,
    strategy: 'rpg-maker-mv',
    tabs: [
      { id: 'variables', label: 'Variables', count: 2 },
      { id: 'switches', label: 'Switches', count: 1 },
    ],
    fields: [
      {
        id: 'variables:1',
        tabId: 'variables',
        key: '1',
        label: 'Gold',
        value: 100,
        type: 'number',
      },
      {
        id: 'switches:1',
        tabId: 'switches',
        key: '1',
        label: 'BossDefeated',
        value: false,
        type: 'boolean',
      },
    ],
    ...overrides,
  };
}

function createMockElectronAPI(
  overrides: Partial<ElectronAPI> = {}
): ElectronAPI {
  return {
    writeSaveData: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  } as unknown as ElectronAPI;
}

describe('SaveEditorFooter (Persistent Footer & Focus Continuity)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mounts independent .save-editor-footer with aria-disabled="true" and pointer-events: none when idle, loading, error, pristine, or mutating file without native disabled', async () => {
    const store = createSaveEditorStore('game-1');
    const mockApi = createMockElectronAPI();

    const { container } = render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorFooter />
      </SaveEditorStoreProvider>
    );

    const footer = container.querySelector('.save-editor-footer');
    expect(footer).not.toBeNull();

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toHaveClass('primary-btn');
    expect(saveBtn).toHaveAttribute('aria-disabled', 'true');
    expect(saveBtn).not.toBeDisabled();
    expect(saveBtn.style.pointerEvents).toBe('none');

    // Loading state
    act(() => {
      store.setFileLoading('slot1.sav');
    });
    expect(saveBtn).toHaveAttribute('aria-disabled', 'true');
    expect(saveBtn).not.toBeDisabled();

    // Error state
    act(() => {
      store.setFileError('slot1.sav', 'Read failed');
    });
    expect(saveBtn).toHaveAttribute('aria-disabled', 'true');

    // Loaded & pristine (!isDirty)
    act(() => {
      store.setFileLoaded(createMockDto('slot1.sav'));
    });
    expect(saveBtn).toHaveAttribute('aria-disabled', 'true');
    expect(saveBtn.style.pointerEvents).toBe('none');

    // Dirty -> enabled
    act(() => {
      store.updateField('variables:1', 500);
    });
    expect(saveBtn).toHaveAttribute('aria-disabled', 'false');
    expect(saveBtn.style.pointerEvents).toBe('');

    // Active file mutation (rename/delete) -> blocked with aria-disabled="true"
    act(() => {
      store.setMutatingFile(true);
    });
    expect(saveBtn).toHaveAttribute('aria-disabled', 'true');
    expect(saveBtn).not.toBeDisabled();
    expect(saveBtn.style.pointerEvents).toBe('none');

    saveBtn.focus();
    expect(document.activeElement).toBe(saveBtn);
    fireEvent.click(saveBtn);
    expect(mockApi.writeSaveData).not.toHaveBeenCalled();

    // End file mutation -> becomes actionable again
    act(() => {
      store.setMutatingFile(false);
    });
    expect(saveBtn).toHaveAttribute('aria-disabled', 'false');
    expect(document.activeElement).toBe(saveBtn);
  });

  it('consumes useSaveElectronAPI() when electronAPI prop is omitted, reads live snapshot via store.getSnapshot(), and preserves concurrent in-flight edits on post-save commit', async () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));
    store.updateField('variables:1', 250);

    let resolveWrite!: (res: { ok: boolean; error?: string; code?: string }) => void;
    const contextApi = createMockElectronAPI({
      writeSaveData: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveWrite = resolve;
          })
      ),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={contextApi}>
        <SaveEditorFooter />
      </SaveEditorStoreProvider>
    );

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    expect(contextApi.writeSaveData).toHaveBeenCalledTimes(1);
    expect(contextApi.writeSaveData).toHaveBeenCalledWith({
      gameKey: 'game-1',
      fileName: 'slot1.sav',
      updates: { 'variables:1': 250 },
    });

    // User edits another field while writeSaveData is still in flight
    act(() => {
      store.updateField('switches:1', true);
    });

    await act(async () => {
      resolveWrite({ ok: true });
      await flushPromises();
    });

    // variables:1 committed to baseline; switches:1 remains dirty
    const snap = store.getSnapshot();
    expect(snap.pristineFieldsById.get('variables:1')?.value).toBe(250);
    expect(snap.dirtyKeys.has('variables:1')).toBe(false);
    expect(snap.dirtyKeys.has('switches:1')).toBe(true);
    expect(snap.modifiedFields).toEqual({ 'switches:1': true });
    expect(snap.saveStatus).toEqual({ state: 'idle' });
    expect(saveBtn).toHaveAttribute('aria-disabled', 'false');
  });

  it('supports optional electronAPI prop override, renders inline vector SVG spinner bound to currentColor during save, retains focus through save completion, and displays "Saved" in role="status"', async () => {
    const user = userEvent.setup();
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));
    store.updateField('variables:1', 999);

    const contextApi = createMockElectronAPI();
    let resolveWrite!: (res: { ok: boolean; error?: string; code?: string }) => void;
    const propApi = createMockElectronAPI({
      writeSaveData: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveWrite = resolve;
          })
      ),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={contextApi}>
        <SaveEditorFooter electronAPI={propApi} />
      </SaveEditorStoreProvider>
    );

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    const statusRegion = screen.getByRole('status');
    expect(statusRegion).toHaveClass('save-editor-footer-status');
    expect(statusRegion).toHaveAttribute('aria-live', 'polite');
    expect(statusRegion).toHaveTextContent('');

    saveBtn.focus();
    expect(document.activeElement).toBe(saveBtn);

    await user.click(saveBtn);

    expect(contextApi.writeSaveData).not.toHaveBeenCalled();
    expect(propApi.writeSaveData).toHaveBeenCalledTimes(1);
    expect(propApi.writeSaveData).toHaveBeenCalledWith({
      gameKey: 'game-1',
      fileName: 'slot1.sav',
      updates: { 'variables:1': 999 },
    });

    // Saving state: aria-disabled, inline vector SVG spinner with currentColor and aria-hidden, focus preserved
    expect(store.getSnapshot().saveStatus).toEqual({ state: 'saving' });
    expect(saveBtn).toHaveAttribute('aria-disabled', 'true');
    expect(saveBtn).not.toBeDisabled();
    expect(saveBtn.style.pointerEvents).toBe('none');
    expect(document.activeElement).toBe(saveBtn);

    const svg = saveBtn.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('stroke', 'currentColor');

    await act(async () => {
      resolveWrite({ ok: true });
      await flushPromises();
    });

    // Post-save baseline synchronization: dirty cleared, "Saved" status shown, focus NOT evicted to document.body
    expect(store.getSnapshot().dirtyKeys.size).toBe(0);
    expect(store.getSnapshot().pristineFieldsById.get('variables:1')?.value).toBe(999);
    expect(store.getSnapshot().saveStatus).toEqual({ state: 'saved' });
    expect(statusRegion).toHaveTextContent('Saved');
    expect(saveBtn).toHaveAttribute('aria-disabled', 'true');
    expect(saveBtn).not.toBeDisabled();
    expect(saveBtn.querySelector('svg')).toBeNull();
    expect(document.activeElement).toBe(saveBtn);
  });

  it('blocks rapid back-to-back synchronous click and Enter events before React re-render via synchronous isSavingRef latch', async () => {
    const user = userEvent.setup();
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));
    store.updateField('variables:1', 420);

    let resolveWrite!: (res: { ok: boolean }) => void;
    const mockApi = createMockElectronAPI({
      writeSaveData: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveWrite = resolve;
          })
      ),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorFooter />
      </SaveEditorStoreProvider>
    );

    const saveBtn = screen.getByRole('button', { name: /save changes/i });

    // Two synchronous click events dispatched back-to-back in the same turn before React re-renders
    act(() => {
      fireEvent.click(saveBtn);
      fireEvent.click(saveBtn);
    });

    expect(mockApi.writeSaveData).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveWrite({ ok: true });
      await flushPromises();
    });

    // Now test rapid Enter key events on a new dirty change
    act(() => {
      store.updateField('variables:1', 888);
    });
    saveBtn.focus();

    let resolveSecondWrite!: (res: { ok: boolean }) => void;
    (mockApi.writeSaveData as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecondWrite = resolve;
        })
    );

    await user.keyboard('{Enter}{Enter}');
    expect(mockApi.writeSaveData).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecondWrite({ ok: true });
      await flushPromises();
    });
    expect(store.getSnapshot().pristineFieldsById.get('variables:1')?.value).toBe(888);
  });

  it('handles resolved { ok: false, error, code } failure without calling setSaved, scrubs user paths, logs structured diagnostics, renders role="alert", preserves dirtyKeys, and allows retry', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));
    store.updateField('variables:1', 777);

    const setSavedSpy = vi.spyOn(store, 'setSaved');
    const setSaveErrorSpy = vi.spyOn(store, 'setSaveError');

    const mockApi = createMockElectronAPI({
      writeSaveData: vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          error: 'Write failed at C:\\Users\\Alice\\Documents\\save\\slot1.sav',
          code: 'EBUSY',
        })
        .mockResolvedValueOnce({ ok: true }),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorFooter />
      </SaveEditorStoreProvider>
    );

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await act(async () => {
      fireEvent.click(saveBtn);
      await flushPromises();
    });

    expect(setSavedSpy).not.toHaveBeenCalled();
    expect(setSaveErrorSpy).toHaveBeenCalledTimes(1);
    expect(setSaveErrorSpy).toHaveBeenCalledWith(
      'Write failed at <USER_DIR>\\Documents\\save\\slot1.sav',
      'slot1.sav'
    );

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [logTag, logPayload] = consoleErrorSpy.mock.calls[0];
    expect(logTag).toBe('[SaveEditorFooter] Write save data rejected:');
    expect(logPayload).toEqual({
      gameKey: 'game-1',
      fileName: 'slot1.sav',
      error: 'Write failed at <USER_DIR>\\Documents\\save\\slot1.sav',
      code: 'EBUSY',
    });
    expect(JSON.stringify(logPayload)).not.toContain('Alice');

    const snapAfterFail = store.getSnapshot();
    expect(snapAfterFail.saveStatus).toEqual({
      state: 'error',
      errorMessage: 'Write failed at <USER_DIR>\\Documents\\save\\slot1.sav',
    });
    expect(snapAfterFail.dirtyKeys.has('variables:1')).toBe(true);
    expect(snapAfterFail.modifiedFields).toEqual({ 'variables:1': 777 });

    const alertEl = screen.getByRole('alert');
    expect(alertEl).toHaveClass('save-editor-error-box');
    expect(alertEl.querySelector('.save-editor-error-title')).not.toBeNull();
    expect(alertEl.textContent).toContain('<USER_DIR>\\Documents\\save\\slot1.sav');
    expect(alertEl.textContent).not.toContain('Alice');

    // Button remains actionable for retry
    expect(saveBtn).toHaveAttribute('aria-disabled', 'false');

    await act(async () => {
      fireEvent.click(saveBtn);
      await flushPromises();
    });

    expect(setSavedSpy).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().saveStatus).toEqual({ state: 'saved' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('requires result.ok === true strictly and treats malformed { ok: undefined } or missing API as save errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));
    store.updateField('variables:1', 333);

    const setSavedSpy = vi.spyOn(store, 'setSaved');
    const mockApi = createMockElectronAPI({
      writeSaveData: vi.fn().mockResolvedValueOnce({} as { ok: boolean }),
    });

    const { rerender } = render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorFooter />
      </SaveEditorStoreProvider>
    );

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await act(async () => {
      fireEvent.click(saveBtn);
      await flushPromises();
    });

    expect(setSavedSpy).not.toHaveBeenCalled();
    expect(store.getSnapshot().saveStatus).toEqual({
      state: 'error',
      errorMessage: 'Save failed',
    });
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    // Missing writeSaveData API
    const unavailableApi = {} as ElectronAPI;
    rerender(
      <SaveEditorStoreProvider store={store} electronAPI={unavailableApi}>
        <SaveEditorFooter />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      fireEvent.click(saveBtn);
      await flushPromises();
    });

    expect(store.getSnapshot().saveStatus).toEqual({
      state: 'error',
      errorMessage: 'writeSaveData API unavailable',
    });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });

  it('handles rejected IPC promises with sanitized stack and error message logging, preserves dirtyKeys, and renders role="alert"', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createSaveEditorStore('C:\\Users\\Alice\\Games\\MyGame');
    store.setFileLoaded(createMockDto('slot1.sav'));
    store.updateField('variables:1', 654);

    const setSavedSpy = vi.spyOn(store, 'setSaved');
    const setSaveErrorSpy = vi.spyOn(store, 'setSaveError');

    const transportError = new Error('EACCES: permission denied /home/alice/saves/slot1.sav');
    transportError.stack =
      'Error: EACCES: permission denied /home/alice/saves/slot1.sav\n    at writeSaveData (/home/alice/app/main.ts:42:11)';

    const mockApi = createMockElectronAPI({
      writeSaveData: vi.fn().mockRejectedValueOnce(transportError),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorFooter />
      </SaveEditorStoreProvider>
    );

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await act(async () => {
      fireEvent.click(saveBtn);
      await flushPromises();
    });

    expect(setSavedSpy).not.toHaveBeenCalled();
    expect(setSaveErrorSpy).toHaveBeenCalledWith(
      'EACCES: permission denied <USER_DIR>/saves/slot1.sav',
      'slot1.sav'
    );

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [logTag, logPayload] = consoleErrorSpy.mock.calls[0];
    expect(logTag).toBe('[SaveEditorFooter] Write save data exception:');
    expect(logPayload.gameKey).toBe('<USER_DIR>\\Games\\MyGame');
    expect(logPayload.fileName).toBe('slot1.sav');
    expect(logPayload.error).toBe('EACCES: permission denied <USER_DIR>/saves/slot1.sav');
    expect(logPayload.stack).toContain('<USER_DIR>/app/main.ts:42:11');
    expect(JSON.stringify(logPayload)).not.toContain('Alice');
    expect(JSON.stringify(logPayload)).not.toContain('alice');

    expect(store.getSnapshot().saveStatus).toEqual({
      state: 'error',
      errorMessage: 'EACCES: permission denied <USER_DIR>/saves/slot1.sav',
    });
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'EACCES: permission denied <USER_DIR>/saves/slot1.sav'
    );
    expect(saveBtn).toHaveAttribute('aria-disabled', 'false');
  });

  it('prevents failed background writes for File A from contaminating File B after active file switch', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('fileA.sav'));
    store.updateField('variables:1', 111);

    let rejectFileA!: (err: Error) => void;
    let resolveFileB!: (res: { ok: boolean }) => void;
    const mockApi = createMockElectronAPI({
      writeSaveData: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              rejectFileA = reject;
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFileB = resolve;
            })
        ),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorFooter />
      </SaveEditorStoreProvider>
    );

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);
    expect(store.getSnapshot().saveStatus).toEqual({ state: 'saving' });

    // User switches to File B before File A's write rejects
    act(() => {
      store.setFileLoaded(createMockDto('fileB.sav'));
      store.updateField('variables:1', 222);
    });

    await act(async () => {
      rejectFileA(new Error('Disk disconnected on fileA'));
      await flushPromises();
    });

    // File B must NOT transition to error state or lose its dirty changes
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().saveStatus).toEqual({ state: 'idle' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(true);
    expect(store.getSnapshot().modifiedFields['variables:1']).toBe(222);

    // isSavingRef latch was released in finally, so saving File B succeeds cleanly
    fireEvent.click(saveBtn);
    await act(async () => {
      resolveFileB({ ok: true });
      await flushPromises();
    });

    expect(mockApi.writeSaveData).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().saveStatus).toEqual({ state: 'saved' });
    expect(store.getSnapshot().pristineFieldsById.get('variables:1')?.value).toBe(222);
  });

  it('enforces disabled, reduced-motion, and verified design-token stylesheet contracts in src/styles/save-editor.css and zero Proxies/emojis in SaveEditorFooter.tsx', () => {
    const cssPath = path.resolve(__dirname, '../../../styles/save-editor.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    expect(css).toMatch(/\.save-editor-footer\s*\{[^}]*position:\s*relative;/s);
    expect(css).toMatch(
      /\.save-editor-footer\s+\.primary-btn\[aria-disabled="true"\]\s*\{[^}]*opacity:\s*0\.5;[^}]*cursor:\s*not-allowed;[^}]*pointer-events:\s*none;/s
    );
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.save-editor-footer\s+\.primary-btn\s+svg\s*\{[^}]*animation:\s*none;/s
    );
    expect(css).toContain('.save-editor-error-box');
    expect(css).toContain('var(--border-color');
    expect(css).toContain('var(--text-main');
    expect(css).not.toContain('--color-danger');

    const componentPath = path.resolve(__dirname, './SaveEditorFooter.tsx');
    const source = fs.readFileSync(componentPath, 'utf-8');
    expect(source).not.toMatch(/\bnew\s+Proxy\b/);
    expect(source).not.toMatch(/@yumeshelf\/engine(?!\/types)/);
    expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('renders .cancel-btn and invokes onClose when clicked', () => {
    const store = createSaveEditorStore('game-1');
    const onClose = vi.fn();

    render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorFooter onClose={onClose} />
      </SaveEditorStoreProvider>
    );

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelBtn).toHaveClass('secondary-btn', 'cancel-btn');
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
