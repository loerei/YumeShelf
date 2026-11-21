import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NormalizedSaveDto } from '@yumeshelf/engine/types';
import type { ElectronAPI } from '../../../../shared/types/ipc';
import {
  createSaveEditorStore,
  SaveEditorStoreProvider,
} from '../../store/save-editor-store';
import { SaveFileList, SaveFileListView } from './SaveFileList';

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
      label: 'HP',
      type: 'number',
      value: 100,
    },
  ],
});

describe('SaveFileListView (Pure Presentational Mode)', () => {
  it('renders empty state and forwards listFocusRef when files is empty', () => {
    const listFocusRef = React.createRef<HTMLDivElement>();
    render(<SaveFileListView files={[]} listFocusRef={listFocusRef} />);

    const emptyEl = screen.getByRole('status');
    expect(emptyEl.classList.contains('save-file-list-empty')).toBe(true);
    expect(emptyEl.textContent).toContain('No save files found in directory');
    expect(listFocusRef.current).toBe(emptyEl);

    listFocusRef.current?.focus();
    expect(document.activeElement).toBe(emptyEl);
  });

  it('renders semantic list and listitems with non-nested .save-file-actions and icon-only 22x22 buttons without child span or text nodes', () => {
    const listFocusRef = React.createRef<HTMLDivElement>();
    const { container } = render(
      <SaveFileListView
        files={['slot1.sav', 'slot2.sav']}
        activeFileName="slot1.sav"
        listFocusRef={listFocusRef}
      />
    );

    const listEl = screen.getByRole('list', { name: 'Save file slots' });
    expect(listFocusRef.current).toBe(listEl);
    listFocusRef.current?.focus();
    expect(document.activeElement).toBe(listEl);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('active')).toBe(true);

    for (const item of items) {
      const actionContainers = item.querySelectorAll('.save-file-actions');
      expect(actionContainers).toHaveLength(1);
    }

    const actionBtns = container.querySelectorAll<HTMLButtonElement>('.save-file-action-btn');
    expect(actionBtns).toHaveLength(4);

    const renameBtn1 = container.querySelector<HTMLButtonElement>(
      '.save-file-action-btn.rename-btn'
    )!;
    const deleteBtn1 = container.querySelector<HTMLButtonElement>(
      '.save-file-action-btn.delete-btn'
    )!;

    expect(renameBtn1.querySelector('span')).toBeNull();
    expect(renameBtn1.textContent).toBe('');
    expect(renameBtn1.getAttribute('aria-label')).toBe('Rename slot1.sav');
    expect(renameBtn1.getAttribute('title')).toBe('Rename slot1.sav');
    expect(renameBtn1.querySelector('svg.action-icon')?.getAttribute('aria-hidden')).toBe('true');

    expect(deleteBtn1.querySelector('span')).toBeNull();
    expect(deleteBtn1.textContent).toBe('');
    expect(deleteBtn1.getAttribute('aria-label')).toBe('Delete slot1.sav');
    expect(deleteBtn1.getAttribute('title')).toBe('Delete slot1.sav');
    expect(deleteBtn1.querySelector('svg.action-icon')?.getAttribute('aria-hidden')).toBe('true');

    const cssPath = path.resolve(__dirname, '../../../../styles/save-editor.css');
    const cssText = fs.readFileSync(cssPath, 'utf-8');
    expect(cssText).toMatch(
      /\.save-file-item-main-btn\s*\{[^}]*flex:\s*1\s+1\s+0%;[^}]*min-width:\s*0;[^}]*background:\s*transparent;[^}]*border:\s*none;[^}]*padding:\s*0;[^}]*text-align:\s*left;/s
    );
    expect(cssText).toMatch(
      /\.save-file-item-main-btn:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--accent,\s*#6366f1\);/s
    );
    expect(cssText).toMatch(
      /\.save-file-item:focus-within\s+\.save-file-actions,\s*\.save-file-action-btn:focus-visible\s*\{[^}]*opacity:\s*1;/s
    );
  });

  it('supports sequential Tab / Shift+Tab navigation and decoupled ArrowDown/ArrowUp/Home/End focus traversal without invoking onSelectFile', async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();

    render(
      <SaveFileListView
        files={['slot1.sav', 'slot2.sav', 'slot3.sav']}
        onSelectFile={onSelectFile}
      />
    );

    const slot1Btn = screen.getByRole('button', { name: 'slot1.sav' });
    const rename1Btn = screen.getByRole('button', { name: 'Rename slot1.sav' });
    const delete1Btn = screen.getByRole('button', { name: 'Delete slot1.sav' });
    const slot2Btn = screen.getByRole('button', { name: 'slot2.sav' });
    const slot3Btn = screen.getByRole('button', { name: 'slot3.sav' });

    await user.tab();
    expect(document.activeElement).toBe(slot1Btn);

    await user.tab();
    expect(document.activeElement).toBe(rename1Btn);

    await user.tab();
    expect(document.activeElement).toBe(delete1Btn);

    await user.tab();
    expect(document.activeElement).toBe(slot2Btn);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(delete1Btn);

    // Arrow key navigation on slot buttons moves DOM focus without invoking onSelectFile
    slot1Btn.focus();
    fireEvent.keyDown(slot1Btn, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(slot2Btn);
    expect(onSelectFile).not.toHaveBeenCalled();

    fireEvent.keyDown(slot2Btn, { key: 'End' });
    expect(document.activeElement).toBe(slot3Btn);

    fireEvent.keyDown(slot3Btn, { key: 'Home' });
    expect(document.activeElement).toBe(slot1Btn);

    fireEvent.keyDown(slot1Btn, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(slot1Btn);
    expect(onSelectFile).not.toHaveBeenCalled();

    // Pressing Enter or Space on focused button invokes onSelectFile
    await user.keyboard('{Enter}');
    expect(onSelectFile).toHaveBeenCalledWith('slot1.sav');
  });

  it('does not intercept ArrowDown, ArrowUp, Home, or End inside inline rename input or action buttons', () => {
    render(<SaveFileListView files={['slot1.sav', 'slot2.sav']} />);

    const rename1Btn = screen.getByRole('button', { name: 'Rename slot1.sav' });
    rename1Btn.focus();
    fireEvent.keyDown(rename1Btn, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rename1Btn);

    fireEvent.click(rename1Btn);
    const input = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Home' });
    fireEvent.keyDown(input, { key: 'End' });
    expect(document.activeElement).toBe(input);
  });

  it('filters row clicks on interactive descendants without stopPropagation while selecting slot on row or primary button click', () => {
    const onSelectFile = vi.fn();
    render(
      <SaveFileListView
        files={['slot1.sav', 'slot2.sav']}
        onSelectFile={onSelectFile}
      />
    );

    const items = screen.getAllByRole('listitem');
    const rename1Btn = screen.getByRole('button', { name: 'Rename slot1.sav' });
    const actionsDiv = items[0].querySelector('.save-file-actions')!;

    // Clicking inside .save-file-actions container does not trigger onSelectFile
    fireEvent.click(actionsDiv);
    expect(onSelectFile).not.toHaveBeenCalled();

    // Clicking Rename enters rename mode without selecting slot
    fireEvent.click(rename1Btn);
    expect(onSelectFile).not.toHaveBeenCalled();

    const renameContainer = items[0].querySelector('.save-file-rename-container')!;
    fireEvent.click(renameContainer);
    expect(onSelectFile).not.toHaveBeenCalled();

    // Cancel rename first
    const input = items[0].querySelector<HTMLInputElement>('.save-file-rename-input')!;
    fireEvent.keyDown(input, { key: 'Escape' });

    // Clicking row background selects slot
    fireEvent.click(items[0]);
    expect(onSelectFile).toHaveBeenCalledWith('slot1.sav');
  });

  it('blocks slot selection and disables action buttons across all rows during active saving, renaming, deletion, or same-slot loading', () => {
    const onSelectFile = vi.fn();
    const { rerender } = render(
      <SaveFileListView
        files={['slot1.sav', 'slot2.sav']}
        loadingFileName="slot1.sav"
        onSelectFile={onSelectFile}
      />
    );

    // Same loading slot cannot be re-selected, but cross-slot preemption is permitted
    fireEvent.click(screen.getByRole('button', { name: 'slot1.sav' }));
    expect(onSelectFile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'slot2.sav' }));
    expect(onSelectFile).toHaveBeenCalledWith('slot2.sav');
    onSelectFile.mockClear();

    // When isSaving is true, slot selection and action buttons are disabled
    rerender(
      <SaveFileListView
        files={['slot1.sav', 'slot2.sav']}
        isSaving={true}
        onSelectFile={onSelectFile}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'slot1.sav' }));
    expect(onSelectFile).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Rename slot1.sav' }).getAttribute('aria-disabled')
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Delete slot1.sav' }).getAttribute('aria-disabled')
    ).toBe('true');

    // When renaming slot1, slot2 action buttons are also disabled
    rerender(
      <SaveFileListView
        files={['slot1.sav', 'slot2.sav']}
        isSaving={false}
        onSelectFile={onSelectFile}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rename slot1.sav' }));
    expect(
      screen.getByRole('button', { name: 'Rename slot2.sav' }).getAttribute('aria-disabled')
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Delete slot2.sav' }).getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('manages uncontrolled delete confirmation popover lifecycle, outside pointerdown/scroll/slot-switch dismissal, Escape focus return, and sanitized error alert on rejection', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSelectFile = vi.fn();
    let rejectDelete!: (err: Error) => void;
    const onDeleteFile = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectDelete = reject;
        })
    );

    render(
      <SaveFileListView
        files={['slotA.sav', 'slotB.sav']}
        onSelectFile={onSelectFile}
        onDeleteFile={onDeleteFile}
      />
    );

    const deleteABtn = screen.getByRole('button', { name: 'Delete slotA.sav' });
    const deleteBBtn = screen.getByRole('button', { name: 'Delete slotB.sav' });
    const items = screen.getAllByRole('listitem');

    // 1. Open slot A delete popover (uncontrolled mode: openPopoverFileName omitted)
    fireEvent.click(deleteABtn);
    expect(deleteABtn.getAttribute('aria-expanded')).toBe('true');
    expect(items[0].classList.contains('has-open-popover')).toBe(true);

    const dialog = screen.getByRole('dialog', { name: 'Confirm deletion of slotA.sav' });
    expect(dialog).toBeTruthy();

    // Clicking non-button text inside popover keeps it open and does not invoke onSelectFile
    const descEl = dialog.querySelector('.save-editor-popover-desc')!;
    fireEvent.pointerDown(descEl);
    fireEvent.click(descEl);
    expect(screen.getByRole('dialog', { name: 'Confirm deletion of slotA.sav' })).toBeTruthy();
    expect(onSelectFile).not.toHaveBeenCalled();

    // 2. Escape closes popover and restores focus to deleteABtn
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(deleteABtn);
    expect(onDeleteFile).not.toHaveBeenCalled();

    // 3. Re-open slot A popover, then click Delete on slot B -> slot A popover closes and slot B popover opens
    fireEvent.click(deleteABtn);
    expect(screen.getByRole('dialog', { name: 'Confirm deletion of slotA.sav' })).toBeTruthy();
    fireEvent.click(deleteBBtn);
    expect(screen.queryByRole('dialog', { name: 'Confirm deletion of slotA.sav' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Confirm deletion of slotB.sav' })).toBeTruthy();

    // 4. Scroll on list closes open popover
    fireEvent.scroll(screen.getByRole('list'));
    expect(screen.queryByRole('dialog')).toBeNull();

    // 5. Re-open slot A popover and click outside via pointerdown
    fireEvent.click(deleteABtn);
    expect(screen.getByRole('dialog', { name: 'Confirm deletion of slotA.sav' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();

    // 6. Re-open slot A popover, click Confirm, verify in-flight guard and rejection with sanitized personal path
    fireEvent.click(deleteABtn);
    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });

    fireEvent.click(confirmBtn);
    expect(onDeleteFile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Deleting...' }).getAttribute('aria-disabled')).toBe(
      'true'
    );

    // While in-flight, Escape, Cancel, and slot selection are blocked
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(cancelBtn);
    fireEvent.click(screen.getByRole('button', { name: 'slotB.sav' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(onSelectFile).not.toHaveBeenCalled();

    await act(async () => {
      rejectDelete(
        new Error("EBUSY: resource locked, unlink 'C:\\Users\\John Doe\\Saved Games\\slotA.sav'")
      );
    });

    // Popover stays open with sanitized role="alert" banner
    const alert = screen.getByRole('alert');
    expect(alert.classList.contains('save-action-error')).toBe(true);
    expect(alert.textContent).not.toContain('John Doe');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[SaveFileListView] Failed to delete save file:',
      expect.objectContaining({
        fileName: 'slotA.sav',
        error: expect.not.stringContaining('John Doe'),
      })
    );

    consoleErrorSpy.mockRestore();
  });

  it('deterministically transfers focus to surviving sibling slot button or empty state container on delete', async () => {
    function Harness({ initial }: { initial: string[] }) {
      const [files, setFiles] = React.useState(initial);
      return (
        <SaveFileListView
          files={files}
          onDeleteFile={async (target) => {
            setFiles((prev) => prev.filter((f) => f !== target));
          }}
        />
      );
    }

    const { unmount } = render(<Harness initial={['slot1.sav', 'slot2.sav']} />);

    // Delete slot1 -> focus transfers to slot2 button
    fireEvent.click(screen.getByRole('button', { name: 'Delete slot1.sav' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'slot2.sav' }));

    // Delete last remaining slot2 -> focus transfers to .save-file-list-empty
    fireEvent.click(screen.getByRole('button', { name: 'Delete slot2.sav' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });
    const emptyEl = screen.getByRole('status');
    expect(document.activeElement).toBe(emptyEl);

    unmount();
  });

  describe('Inline Rename Synchronous Focus & e.relatedTarget Blur Matrix', () => {
    it('1a. synchronously restores focus to slot button immediately on Escape and on Enter with synchronous files update', async () => {
      function SyncRenameHarness() {
        const [files, setFiles] = React.useState(['slot1.sav', 'slot2.sav']);
        return (
          <SaveFileListView
            files={files}
            onRenameFile={async (oldName, newName) => {
              setFiles((prev) => prev.map((f) => (f === oldName ? newName : f)));
            }}
          />
        );
      }

      render(<SyncRenameHarness />);

      // Enter rename mode on slot1.sav
      fireEvent.click(screen.getByRole('button', { name: 'Rename slot1.sav' }));
      const input = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
      expect(document.activeElement).toBe(input);

      // Press Escape -> synchronously restores focus to slot1.sav button
      fireEvent.keyDown(input, { key: 'Escape' });
      const slot1Btn = screen.getByRole('button', { name: 'slot1.sav' });
      expect(document.activeElement).toBe(slot1Btn);

      // Re-enter rename mode and commit 'slot1_new.sav' via Enter
      fireEvent.click(screen.getByRole('button', { name: 'Rename slot1.sav' }));
      const input2 = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
      fireEvent.change(input2, { target: { value: 'slot1_new.sav' } });

      await act(async () => {
        fireEvent.keyDown(input2, { key: 'Enter' });
      });

      const renamedBtn = screen.getByRole('button', { name: 'slot1_new.sav' });
      expect(document.activeElement).toBe(renamedBtn);
    });

    it('1b. maintains synchronous fallback focus on slot1.sav across deferred shallow-cloned [...files] and concurrent non-rename files updates before transferring synchronously to slot1_new.sav', async () => {
      let resolveRename!: () => void;
      const onRenameFile = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveRename = resolve;
          })
      );

      const { rerender } = render(
        <SaveFileListView
          files={['slot1.sav', 'slot2.sav']}
          onRenameFile={onRenameFile}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Rename slot1.sav' }));
      const input = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
      fireEvent.change(input, { target: { value: 'slot1_new.sav' } });

      // Start Enter commit; concurrent non-rename update arrives BEFORE onRenameFile settles
      fireEvent.keyDown(input, { key: 'Enter' });
      rerender(
        <SaveFileListView
          files={['slot1.sav', 'slot2.sav', 'slot3.sav']}
          onRenameFile={onRenameFile}
        />
      );

      // Resolve onRenameFile while files still has 'slot1.sav'
      await act(async () => {
        resolveRename();
      });

      const fallbackBtn = screen.getByRole('button', { name: 'slot1.sav' });
      expect(document.activeElement).toBe(fallbackBtn);

      // Intermediate render with shallow-cloned [...files] and another non-rename addition AFTER onRenameFile settled
      rerender(
        <SaveFileListView
          files={[...['slot1.sav', 'slot2.sav', 'slot3.sav']]}
          onRenameFile={onRenameFile}
        />
      );
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'slot1.sav' }));

      rerender(
        <SaveFileListView
          files={['slot1.sav', 'slot2.sav', 'slot3.sav', 'slot4.sav']}
          onRenameFile={onRenameFile}
        />
      );
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'slot1.sav' }));

      // Finally parent updates files with 'slot1_new.sav' -> focus transfers synchronously
      rerender(
        <SaveFileListView
          files={['slot1_new.sav', 'slot2.sav', 'slot3.sav', 'slot4.sav']}
          onRenameFile={onRenameFile}
        />
      );
      const renamedBtn = screen.getByRole('button', { name: 'slot1_new.sav' });
      expect(document.activeElement).toBe(renamedBtn);
    });

    it('2. respects user focus preemption when user focuses another connected element while fallback focus is active before delayed files update arrives', async () => {
      const onRenameFile = vi.fn().mockResolvedValue(undefined);

      const { rerender } = render(
        <div>
          <button type="button" data-testid="external-btn">
            External Action
          </button>
          <SaveFileListView
            files={['slot1.sav', 'slot2.sav']}
            onRenameFile={onRenameFile}
          />
        </div>
      );

      const externalBtn = screen.getByTestId('external-btn');
      fireEvent.click(screen.getByRole('button', { name: 'Rename slot1.sav' }));
      const input = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
      fireEvent.change(input, { target: { value: 'slot1_new.sav' } });

      await act(async () => {
        fireEvent.keyDown(input, { key: 'Enter' });
      });

      // Fallback focus is currently on slot1.sav
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'slot1.sav' }));

      // User moves focus to externalBtn before delayed files update arrives
      externalBtn.focus();
      expect(document.activeElement).toBe(externalBtn);

      // Delayed files update with slot1_new.sav arrives -> focus stays on externalBtn
      rerender(
        <div>
          <button type="button" data-testid="external-btn">
            External Action
          </button>
          <SaveFileListView
            files={['slot1_new.sav', 'slot2.sav']}
            onRenameFile={onRenameFile}
          />
        </div>
      );

      expect(document.activeElement).toBe(externalBtn);
    });

    it('3. handles real DOM focus transfer (e.relatedTarget !== null) for modified draft, unchanged draft + re-entry, and in-flight Enter commit followed by external focus', async () => {
      const onRenameFile = vi.fn().mockResolvedValue(undefined);

      function BlurMatrixHarness() {
        const [files, setFiles] = React.useState(['slot1.sav', 'slot2.sav']);
        return (
          <div>
            <button type="button" data-testid="external-btn">
              External Button
            </button>
            <SaveFileListView
              files={files}
              onRenameFile={async (oldName, newName) => {
                await onRenameFile(oldName, newName);
                setFiles((prev) => prev.map((f) => (f === oldName ? newName : f)));
              }}
            />
          </div>
        );
      }

      render(<BlurMatrixHarness />);
      const externalBtn = screen.getByTestId('external-btn');

      // Case A: Unchanged draftName + real DOM focus transfer to externalBtn
      fireEvent.click(screen.getByRole('button', { name: 'Rename slot1.sav' }));
      const input1 = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
      expect(document.activeElement).toBe(input1);

      act(() => {
        externalBtn.focus();
      });

      expect(onRenameFile).not.toHaveBeenCalled();
      expect(document.querySelector('.save-file-rename-input')).toBeNull();
      expect(document.activeElement).toBe(externalBtn);

      // Re-entering rename mode on the same row afterward still commits via Enter
      fireEvent.click(screen.getByRole('button', { name: 'Rename slot1.sav' }));
      const inputReentry = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
      fireEvent.change(inputReentry, { target: { value: 'slot1_v2.sav' } });
      await act(async () => {
        fireEvent.keyDown(inputReentry, { key: 'Enter' });
      });
      expect(onRenameFile).toHaveBeenCalledWith('slot1.sav', 'slot1_v2.sav');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'slot1_v2.sav' }));
      onRenameFile.mockClear();

      // Case B: Modified draftName + real DOM focus transfer to externalBtn
      fireEvent.click(screen.getByRole('button', { name: 'Rename slot1_v2.sav' }));
      const input2 = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
      fireEvent.change(input2, { target: { value: 'slot1_v3.sav' } });

      await act(async () => {
        externalBtn.focus();
      });

      expect(onRenameFile).toHaveBeenCalledWith('slot1_v2.sav', 'slot1_v3.sav');
      expect(document.activeElement).toBe(externalBtn);
      onRenameFile.mockClear();

      // Case C: Press Enter on modified draft while onRenameFile is pending, then focus externalBtn
      let resolveInFlight!: () => void;
      onRenameFile.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveInFlight = resolve;
          })
      );

      fireEvent.click(screen.getByRole('button', { name: 'Rename slot1_v3.sav' }));
      const input3 = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
      fireEvent.change(input3, { target: { value: 'slot1_v4.sav' } });

      fireEvent.keyDown(input3, { key: 'Enter' });
      act(() => {
        externalBtn.focus();
      });
      expect(document.activeElement).toBe(externalBtn);

      await act(async () => {
        resolveInFlight();
      });

      expect(onRenameFile).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(externalBtn);
      onRenameFile.mockClear();

      // Case D: Post-settlement pre-commit blur (onRenameFile resolves inside handler, then blur fires with e.relatedTarget = externalBtn before unmount commit completes)
      fireEvent.click(screen.getByRole('button', { name: 'Rename slot1_v4.sav' }));
      const input4 = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
      fireEvent.change(input4, { target: { value: 'slot1_v5.sav' } });

      onRenameFile.mockImplementationOnce(async () => {
        // Trigger blur to externalBtn right after settlement inside the same commit cycle
        queueMicrotask(() => {
          fireEvent.blur(input4, { relatedTarget: externalBtn });
          externalBtn.focus();
        });
      });

      await act(async () => {
        fireEvent.keyDown(input4, { key: 'Enter' });
      });

      expect(onRenameFile).toHaveBeenCalledWith('slot1_v4.sav', 'slot1_v5.sav');
      expect(document.activeElement).toBe(externalBtn);
    });

    it('4. returns focus synchronously to .save-file-item-main-btn when blurring to non-interactive space (relatedTarget: null)', async () => {
      const onRenameFile = vi.fn().mockResolvedValue(undefined);
      render(
        <SaveFileListView
          files={['slot1.sav', 'slot2.sav']}
          onRenameFile={onRenameFile}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Rename slot1.sav' }));
      const input = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
      fireEvent.change(input, { target: { value: 'slot1_blur.sav' } });

      await act(async () => {
        fireEvent.blur(input, { relatedTarget: null });
      });

      expect(onRenameFile).toHaveBeenCalledWith('slot1.sav', 'slot1_blur.sav');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'slot1.sav' }));
    });
  });
});

describe('SaveFileList (Connected Container Mode)', () => {
  it('queries listSaveFiles on mount, resets files synchronously on gameKey change, and triggers single-shot initialFile selection when idle', async () => {
    const loadSaveData = vi.fn().mockResolvedValue(createMockDto('slot2.sav'));
    const listSaveFiles = vi.fn(async (key: string) =>
      key === 'game-1' ? ['slot1.sav', 'slot2.sav'] : ['other.sav']
    );

    const api = {
      listSaveFiles,
      loadSaveData,
    } as unknown as ElectronAPI;

    const store = createSaveEditorStore('game-1');

    const { rerender } = render(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveFileList gameKey="game-1" initialFile="slot2.sav" />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(listSaveFiles).toHaveBeenCalledWith('game-1');
    expect(loadSaveData).toHaveBeenCalledTimes(1);
    expect(loadSaveData).toHaveBeenCalledWith({ gameKey: 'game-1', fileName: 'slot2.sav' });

    // Switching gameKey synchronously resets files to [] on render
    let resolveGame2List!: (files: string[]) => void;
    listSaveFiles.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          resolveGame2List = resolve;
        })
    );

    rerender(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveFileList gameKey="game-2" />
      </SaveEditorStoreProvider>
    );

    // Immediately empty before game-2 listSaveFiles settles
    expect(screen.getByRole('status').textContent).toContain('No save files found');

    await act(async () => {
      resolveGame2List(['other.sav']);
    });

    expect(screen.getByRole('button', { name: 'other.sav' })).toBeTruthy();
  });

  it('manages slot loading progress, preemption cancellation with sanitized console.warn on cancelLoadSaveData failure, folderRevision cancellation, and unmount teardown', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let progressCb: ((p: any) => void) | null = null;
    const unsubscribeSpy = vi.fn();

    let resolveSlot1!: (dto: NormalizedSaveDto) => void;
    let rejectSlot2!: (err: Error) => void;

    const api = {
      listSaveFiles: vi.fn().mockResolvedValue(['slot1.sav', 'slot2.sav']),
      onSaveLoadProgress: vi.fn((cb) => {
        progressCb = cb;
        return unsubscribeSpy;
      }),
      loadSaveData: vi.fn(({ fileName }) => {
        if (fileName === 'slot1.sav') {
          return new Promise<NormalizedSaveDto>((resolve) => {
            resolveSlot1 = resolve;
          });
        }
        return new Promise<NormalizedSaveDto>((_resolve, reject) => {
          rejectSlot2 = reject;
        });
      }),
      cancelLoadSaveData: vi
        .fn()
        .mockRejectedValueOnce(
          new Error("Cancel failed for 'C:\\Users\\AliceSecret\\Saves\\slot1.sav'")
        )
        .mockResolvedValue({ cancelled: true }),
    } as unknown as ElectronAPI;

    const store = createSaveEditorStore('game-1');

    const { rerender, unmount } = render(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveFileList folderRevision={0} />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Click slot1.sav to start loading
    fireEvent.click(screen.getByRole('button', { name: 'slot1.sav' }));
    expect(store.getSnapshot().fileStatus).toEqual({ state: 'loading', fileName: 'slot1.sav' });

    // Emit progress event (clamped to [0, 100])
    act(() => {
      progressCb?.({ gameKey: 'game-1', fileName: 'slot1.sav', percent: 145 });
    });
    expect(store.getSnapshot().fileStatus).toEqual({
      state: 'loading',
      fileName: 'slot1.sav',
      percent: 100,
    });

    // Preempt slot1.sav by clicking slot2.sav while slot1 is still loading
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'slot2.sav' }));
    });

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    expect(api.cancelLoadSaveData).toHaveBeenCalledWith({
      gameKey: 'game-1',
      fileName: 'slot1.sav',
    });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[SaveFileList] Failed to cancel in-flight save data load:',
      expect.objectContaining({
        error: expect.not.stringContaining('AliceSecret'),
      })
    );

    // Late resolution of slot1.sav is ignored
    await act(async () => {
      resolveSlot1(createMockDto('slot1.sav'));
    });
    expect(store.getSnapshot().fileStatus).toEqual({ state: 'loading', fileName: 'slot2.sav' });

    // Cancellation error on slot2 transitions store to idle without error banner
    await act(async () => {
      rejectSlot2(new Error('Operation cancelled by user'));
    });
    expect(store.getSnapshot().fileStatus).toEqual({ state: 'idle' });

    // Start another load and bump folderRevision -> invalidates and cancels in-flight load
    fireEvent.click(screen.getByRole('button', { name: 'slot1.sav' }));
    rerender(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveFileList folderRevision={1} />
      </SaveEditorStoreProvider>
    );
    expect(api.cancelLoadSaveData).toHaveBeenCalledWith({
      gameKey: 'game-1',
      fileName: 'slot1.sav',
    });

    unmount();
    consoleWarnSpy.mockRestore();
  });

  it('intercepts slot switching when dirtyKeys.size > 0 with Unsaved Changes modal, supporting Cancel and Discard Changes, and re-dispatches loadSaveData on retryRequest increment', async () => {
    const api = {
      listSaveFiles: vi.fn().mockResolvedValue(['slot1.sav', 'slot2.sav']),
      loadSaveData: vi.fn(({ fileName }) => Promise.resolve(createMockDto(fileName))),
    } as unknown as ElectronAPI;

    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));
    store.updateField('variables:1', 999);
    expect(store.getSnapshot().dirtyKeys.size).toBe(1);

    const listFocusRef = React.createRef<HTMLDivElement>();

    const { rerender } = render(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveFileList listFocusRef={listFocusRef} retryRequest={null} />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(listFocusRef.current).toBe(screen.getByTestId('save-file-list'));

    // Click slot2.sav while dirty -> opens Unsaved Changes modal without calling loadSaveData
    fireEvent.click(screen.getByRole('button', { name: 'slot2.sav' }));
    expect(api.loadSaveData).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Cancel preserves dirty state and active slot1.sav
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getSnapshot().dirtyKeys.size).toBe(1);

    // Click slot2.sav again and confirm Discard Changes -> loads slot2.sav
    fireEvent.click(screen.getByRole('button', { name: 'slot2.sav' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
    });

    expect(api.loadSaveData).toHaveBeenCalledWith({ gameKey: 'game-1', fileName: 'slot2.sav' });
    expect(store.getSnapshot().fileStatus).toEqual(
      expect.objectContaining({
        state: 'loaded',
        dto: expect.objectContaining({ fileName: 'slot2.sav' }),
      })
    );

    // Test retryRequest increment re-dispatching loadSaveData
    rerender(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveFileList
          listFocusRef={listFocusRef}
          retryRequest={{ fileName: 'slot1.sav', requestId: 1 }}
        />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(api.loadSaveData).toHaveBeenCalledWith({ gameKey: 'game-1', fileName: 'slot1.sav' });
  });

  it('logs structured diagnostics via console.error with sanitized paths and transitions store to error state when loadSaveData fails with non-cancellation error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = {
      listSaveFiles: vi.fn().mockResolvedValue(['corrupt.sav']),
      loadSaveData: vi
        .fn()
        .mockRejectedValue(
          new Error("Corrupt header in 'C:\\Users\\BobPrivate\\Saved Games\\corrupt.sav'")
        ),
    } as unknown as ElectronAPI;

    const store = createSaveEditorStore('game-1');

    render(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveFileList />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'corrupt.sav' }));
    });

    const fileStatus = store.getSnapshot().fileStatus;
    expect(fileStatus.state).toBe('error');
    if (fileStatus.state === 'error') {
      expect(fileStatus.fileName).toBe('corrupt.sav');
      expect(fileStatus.errorMessage).not.toContain('BobPrivate');
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[SaveFileList] Failed to load save file:',
      expect.objectContaining({
        gameKey: 'game-1',
        fileName: 'corrupt.sav',
        error: expect.not.stringContaining('BobPrivate'),
      })
    );
    consoleErrorSpy.mockRestore();
  });

  it('synchronizes active slot rename via renameActiveFile preserving dirty edits, wraps rename/delete in setMutatingFile guards, throws on { ok: false }, and resets store on active slot delete', async () => {
    const renameSaveFile = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'FILE_EXISTS' })
      .mockResolvedValueOnce({ ok: true, fileName: 'slot2.sav' });
    const deleteSaveFile = vi.fn().mockResolvedValue({ ok: true });

    const api = {
      listSaveFiles: vi.fn().mockResolvedValue(['slot1.sav']),
      renameSaveFile,
      deleteSaveFile,
    } as unknown as ElectronAPI;

    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));
    store.updateField('variables:1', 777);

    const setMutatingSpy = vi.spyOn(store, 'setMutatingFile');
    const renameActiveSpy = vi.spyOn(store, 'renameActiveFile');

    render(
      <SaveEditorStoreProvider store={store} electronAPI={api}>
        <SaveFileList />
      </SaveEditorStoreProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    // 1. Attempt rename when api.renameSaveFile returns { ok: false, error: 'FILE_EXISTS' }
    fireEvent.click(screen.getByRole('button', { name: 'Rename slot1.sav' }));
    const input = document.querySelector<HTMLInputElement>('.save-file-rename-input')!;
    fireEvent.change(input, { target: { value: 'slot2.sav' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(screen.getByRole('alert').textContent).toContain('FILE_EXISTS');
    expect(renameActiveSpy).not.toHaveBeenCalled();
    expect(setMutatingSpy).toHaveBeenNthCalledWith(1, true);
    expect(setMutatingSpy).toHaveBeenNthCalledWith(2, false);
    setMutatingSpy.mockClear();

    // 2. Retry Enter commit when api.renameSaveFile returns { ok: true, fileName: 'slot2.sav' }
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(renameActiveSpy).toHaveBeenCalledWith('slot2.sav', 'slot1.sav');
    expect(setMutatingSpy).toHaveBeenNthCalledWith(1, true);
    expect(setMutatingSpy).toHaveBeenNthCalledWith(2, false);
    const snapAfterRename = store.getSnapshot();
    expect(snapAfterRename.fileStatus).toEqual(
      expect.objectContaining({
        state: 'loaded',
        dto: expect.objectContaining({ fileName: 'slot2.sav' }),
      })
    );
    expect(snapAfterRename.dirtyKeys.has('variables:1')).toBe(true);
    expect(snapAfterRename.modifiedFields['variables:1']).toBe(777);

    // 3. Delete active slot2.sav -> resets store to idle and purges dirtyKeys
    fireEvent.click(screen.getByRole('button', { name: 'Delete slot2.sav' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    });

    expect(deleteSaveFile).toHaveBeenCalledWith({ gameKey: 'game-1', fileName: 'slot2.sav' });
    expect(store.getSnapshot().fileStatus).toEqual({ state: 'idle' });
    expect(store.getSnapshot().dirtyKeys.size).toBe(0);
  });

  it('renders 12x12 .action-icon SVGs and orders delete popover buttons [Cancel] [Confirm]', () => {
    render(<SaveFileListView files={['slot1.sav']} />);

    const actionIcons = document.querySelectorAll('.action-icon');
    expect(actionIcons.length).toBe(2);
    for (const icon of actionIcons) {
      expect(icon.getAttribute('width')).toBe('12');
      expect(icon.getAttribute('height')).toBe('12');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Delete slot1.sav' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm deletion of slot1.sav' });
    const buttons = Array.from(dialog.querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Cancel', 'Confirm']);
  });
});
