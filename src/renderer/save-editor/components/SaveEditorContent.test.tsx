import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NormalizedSaveDto, SaveFieldDto } from '@yumeshelf/engine/types';
import {
  NumberInput,
  TextInput,
  CheckboxSwitch,
} from './inputs/SaveFieldInputs';
import { SaveFieldRow } from './SaveFieldRow';
import { SaveEditorContent } from './SaveEditorContent';
import {
  createSaveEditorStore,
  SaveEditorStoreProvider,
} from '../store/save-editor-store';

describe('SaveFieldInputs (Pure Presentational Typed Inputs)', () => {
  it('maintains intermediate drafts ("-", ".", "-.", "12.", "") in NumberInput without premature coercion and commits negative and floating-point numbers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <NumberInput
        id="field-variables:1"
        label="Gold"
        value={100}
        onChange={onChange}
      />
    );

    const input = screen.getByRole('textbox', { name: 'Gold' }) as HTMLInputElement;
    expect(input.value).toBe('100');
    expect(input).toHaveAttribute('aria-invalid', 'false');

    // Clear with Backspace and type intermediate '-' without calling onChange
    await user.clear(input);
    expect(input.value).toBe('');
    expect(onChange).not.toHaveBeenCalled();

    await user.type(input, '-');
    expect(input.value).toBe('-');
    expect(onChange).not.toHaveBeenCalled();

    // Blurring an incomplete '-' reverts to prop value without calling onChange
    fireEvent.blur(input);
    expect(input.value).toBe('100');
    expect(onChange).not.toHaveBeenCalled();

    // Negative number '-250' commits on blur
    await user.clear(input);
    await user.type(input, '-250');
    expect(input.value).toBe('-250');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(-250);

    // Floating-point entry '12.' -> '12.5' preserves intermediate dot and commits 12.5 without integer truncation
    await user.clear(input);
    await user.type(input, '12.');
    expect(input.value).toBe('12.');
    expect(onChange).toHaveBeenCalledTimes(1);

    await user.type(input, '5');
    expect(input.value).toBe('12.5');
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(12.5);
  });

  it('retains focus on Enter for valid numbers, prevents duplicate onChange on post-Enter blur, and commits a second edit on subsequent blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function ControlledNumberHarness() {
      const [val, setVal] = useState(10);
      return (
        <NumberInput
          id="field-variables:2"
          label="HP"
          value={val}
          onChange={(next) => {
            onChange(next);
            setVal(next);
          }}
        />
      );
    }

    render(<ControlledNumberHarness />);

    const input = screen.getByRole('textbox', { name: 'HP' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '250');
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(250);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('250');

    // Immediate blur after Enter commit must not duplicate onChange
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);

    // Second edit while focused after Enter, followed by Tab/blur, commits new value
    await user.click(input);
    await user.clear(input);
    await user.type(input, '300');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(input);

    await user.clear(input);
    await user.type(input, '450');
    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith(450);
  });

  it('prevents duplicate post-Enter blur onChange even when parent value prop remains unchanged', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <NumberInput
        id="field-variables:99"
        label="StaticProp"
        value={10}
        onChange={onChange}
      />
    );

    const input = screen.getByRole('textbox', { name: 'StaticProp' });
    await user.clear(input);
    await user.type(input, '42{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(42);
    expect(document.activeElement).toBe(input);

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps invalid draft visible with aria-invalid and error message on Enter, retains focus, and reverts on blur', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <NumberInput
        id="field-variables:3"
        label="MP"
        value={50}
        onChange={onChange}
      />
    );

    const input = screen.getByRole('textbox', { name: 'MP' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'abc{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('abc');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'field-variables:3-error');

    const errorEl = document.getElementById('field-variables:3-error');
    expect(errorEl).not.toBeNull();
    expect(errorEl).toHaveAttribute('role', 'alert');
    expect(errorEl?.textContent).toBe('Invalid number');

    fireEvent.blur(input);
    expect(input.value).toBe('50');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(document.getElementById('field-variables:3-error')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders TextInput with virtualized-table-text-input class, id, aria-label, disabled, and string onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <TextInput
        id="field-variables:4"
        label="Hero Name"
        value="Alice"
        onChange={onChange}
      />
    );

    const input = screen.getByRole('textbox', { name: 'Hero Name' }) as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveClass('virtualized-table-text-input');
    expect(input).toHaveAttribute('id', 'field-variables:4');
    expect(input).toHaveAttribute('aria-label', 'Hero Name');
    expect(input).not.toBeDisabled();
    expect(input.value).toBe('Alice');

    await user.type(input, '!');
    expect(onChange).toHaveBeenCalledWith('Alice!');

    rerender(
      <TextInput
        id="field-variables:4"
        label="Hero Name"
        value="Alice"
        disabled
        onChange={onChange}
      />
    );
    expect(input).toBeDisabled();
  });

  it('renders CheckboxSwitch with .checkbox-row, label htmlFor, role="switch", dynamic aria-checked, and Space/click toggling', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function SwitchHarness() {
      const [checked, setChecked] = useState(false);
      return (
        <CheckboxSwitch
          id="field-switches:1"
          label="Boss Defeated"
          checked={checked}
          onChange={(next) => {
            onChange(next);
            setChecked(next);
          }}
        />
      );
    }

    const { container } = render(<SwitchHarness />);
    const row = container.querySelector('.checkbox-row');
    expect(row).not.toBeNull();

    const labelEl = container.querySelector('label.data-label');
    expect(labelEl).toHaveAttribute('for', 'field-switches:1');
    expect(labelEl?.textContent).toBe('Boss Defeated');

    const toggle = screen.getByRole('switch', { name: 'Boss Defeated' });
    expect(toggle).toHaveAttribute('type', 'checkbox');
    expect(toggle).toHaveAttribute('id', 'field-switches:1');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    toggle.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});

describe('SaveFieldRow (Memoized Presentational Row)', () => {
  it('renders typed inputs by field schema without store context and bails out unchanged rows via React.memo', () => {
    const numberField: SaveFieldDto = {
      id: 'variables:1',
      tabId: 'variables',
      key: '1',
      label: 'Gold',
      value: 100,
      type: 'number',
    };
    const stringField: SaveFieldDto = {
      id: 'variables:2',
      tabId: 'variables',
      key: '2',
      label: 'Title',
      value: 'Hero',
      type: 'string',
      readOnly: true,
    };
    const boolField: SaveFieldDto = {
      id: 'switches:1',
      tabId: 'switches',
      key: '1',
      label: 'Clear Flag',
      value: true,
      type: 'boolean',
    };

    const onChange = vi.fn();
    const { container, rerender } = render(
      <>
        <SaveFieldRow
          field={numberField}
          value={100}
          isDirty={false}
          label="Gold"
          onChange={onChange}
        />
        <SaveFieldRow
          field={stringField}
          value="Hero"
          isDirty={true}
          label="Title"
          onChange={onChange}
        />
        <SaveFieldRow
          field={boolField}
          value={true}
          isDirty={false}
          label="Clear Flag"
          onChange={onChange}
        />
      </>
    );

    const rows = container.querySelectorAll('.save-field-row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveClass('is-dirty');
    expect(rows[1]).toHaveAttribute('data-dirty', 'true');

    expect(screen.getByRole('textbox', { name: 'Gold' })).toHaveClass(
      'virtualized-table-number-input'
    );
    const titleInput = screen.getByRole('textbox', { name: 'Title' });
    expect(titleInput).toHaveClass('virtualized-table-text-input');
    expect(titleInput).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Clear Flag' })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    // Verify React.memo bailout on sibling row without re-running render body
    let siblingRenderAccessCount = 0;
    const spiedStringField: SaveFieldDto = {
      id: 'variables:2',
      tabId: 'variables',
      key: '2',
      label: 'Title',
      value: 'Hero',
      type: 'string',
      get readOnly() {
        siblingRenderAccessCount += 1;
        return true;
      },
    };

    rerender(
      <>
        <SaveFieldRow
          field={numberField}
          value={100}
          isDirty={false}
          label="Gold"
          onChange={onChange}
        />
        <SaveFieldRow
          field={spiedStringField}
          value="Hero"
          isDirty={true}
          label="Title"
          onChange={onChange}
        />
      </>
    );

    expect(siblingRenderAccessCount).toBe(1);
    siblingRenderAccessCount = 0;

    // Update only row-1 value; row-2 must bail out via React.memo
    rerender(
      <>
        <SaveFieldRow
          field={numberField}
          value={200}
          isDirty={true}
          label="Gold"
          onChange={onChange}
        />
        <SaveFieldRow
          field={spiedStringField}
          value="Hero"
          isDirty={true}
          label="Title"
          onChange={onChange}
        />
      </>
    );

    expect(siblingRenderAccessCount).toBe(0);

    // Changing row-2 scalar prop triggers re-render as expected
    rerender(
      <>
        <SaveFieldRow
          field={numberField}
          value={200}
          isDirty={true}
          label="Gold"
          onChange={onChange}
        />
        <SaveFieldRow
          field={spiedStringField}
          value="Hero"
          isDirty={false}
          label="Title"
          onChange={onChange}
        />
      </>
    );

    expect(siblingRenderAccessCount).toBe(1);
  });
});

function createSaveDto(
  fileName = 'slot1.sav',
  fields: SaveFieldDto[] = [],
  tabs = [
    { id: 'variables', label: 'Variables', count: fields.filter((f) => f.tabId === 'variables').length },
    { id: 'switches', label: 'Switches', count: fields.filter((f) => f.tabId === 'switches').length },
  ]
): NormalizedSaveDto {
  return {
    gameKey: 'game-1',
    fileName,
    strategy: 'rpg-maker-mv',
    tabs,
    fields,
  };
}

describe('SaveEditorContent (Virtualized Table Container)', () => {
  it('handles idle, loading, and error states cleanly while calling useActiveTabFields unconditionally across transitions', () => {
    const store = createSaveEditorStore('game-1');
    const onRetryLoad = vi.fn();
    const onChangeFile = vi.fn();

    const { container } = render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorContent
          onRetryLoad={onRetryLoad}
          onChangeFile={onChangeFile}
        />
      </SaveEditorStoreProvider>
    );

    // Idle state: clear slot-selection guidance without mounting virtualizer rows
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.textContent).toMatch(/Select Save File|Select a save file from the sidebar/i);
    expect(container.querySelectorAll('[data-index]')).toHaveLength(0);
    expect(screen.queryByRole('searchbox')).toBeNull();

    // Loading state
    act(() => {
      store.setFileLoading('slot1.sav');
      store.setFileProgress('slot1.sav', 45);
    });
    const loadingStatus = screen.getByRole('status');
    expect(loadingStatus).toHaveAttribute('aria-busy', 'true');
    expect(loadingStatus.textContent).toMatch(/slot1\.sav/i);
    expect(container.querySelectorAll('[data-index]')).toHaveLength(0);

    // Error state: retry and choose-another-file actions
    act(() => {
      store.setFileError('slot1.sav', 'Corrupted header');
    });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/Corrupted header/);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
    expect(onRetryLoad).toHaveBeenCalledWith('slot1.sav');

    fireEvent.click(screen.getByRole('button', { name: 'Choose Another File' }));
    expect(onChangeFile).toHaveBeenCalledTimes(1);

    // Transitioning to loaded succeeds without React hook-order violations
    act(() => {
      store.setFileLoaded(
        createSaveDto('slot1.sav', [
          {
            id: 'variables:1',
            tabId: 'variables',
            key: '1',
            label: 'Gold',
            value: 500,
            type: 'number',
          },
        ])
      );
    });
    expect(screen.getByRole('textbox', { name: 'Gold' })).toHaveValue('500');
  });

  it('virtualizes 10,000+ fields deterministically in HappyDOM via initialRect with calibrated estimateSize (48 section / 64 boolean / 104 number row) and getItemKey', () => {
    const store = createSaveEditorStore('game-1');
    const fields: SaveFieldDto[] = [];
    for (let i = 0; i < 10000; i++) {
      const isBool = i >= 5000;
      fields.push({
        id: `variables:${i}`,
        tabId: 'variables',
        key: String(i),
        label: `Field ${i}`,
        value: isBool ? i % 2 === 1 : i * 10,
        type: isBool ? 'boolean' : 'number',
      });
    }
    store.setFileLoaded(createSaveDto('huge.sav', fields));
    store.setActiveTab('variables');

    const { container } = render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorContent />
      </SaveEditorStoreProvider>
    );

    const renderedRows = container.querySelectorAll('[data-index]');
    // 600px initialRect + overscan 8 yields ~15-25 virtual 2-column rows rather than 5,000
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(40);

    // 2500 2-col number rows * 104 + 2500 2-col boolean rows * 64 = 420,000px total height
    const spacer = container.querySelector('.save-editor-virtual-spacer') as HTMLElement;
    expect(spacer).not.toBeNull();
    expect(spacer.style.height).toBe('420000px');

    const row0 = container.querySelector('[data-index="0"]') as HTMLElement;
    const row1 = container.querySelector('[data-index="1"]') as HTMLElement;
    const row2 = container.querySelector('[data-index="2"]') as HTMLElement;
    expect(row0.style.transform).toBe('translateY(0px)');
    expect(row0.style.isolation).toBe('isolate');
    expect(row1.style.transform).toBe('translateY(104px)');
    expect(row2.style.transform).toBe('translateY(208px)');
  });

  it('renders accessible empty-state feedback for empty categories and empty search queries, transferring focus to scroll container before clearing search', async () => {
    const user = userEvent.setup();
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(
      createSaveDto(
        'slot1.sav',
        [
          {
            id: 'variables:1',
            tabId: 'variables',
            key: '1',
            label: 'Gold',
            value: 100,
            type: 'number',
          },
        ],
        [
          { id: 'variables', label: 'Variables', count: 1 },
          { id: 'switches', label: 'Switches', count: 0 },
        ]
      )
    );

    const { container } = render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorContent />
      </SaveEditorStoreProvider>
    );

    // Empty category notice (no search filter button)
    act(() => {
      store.setActiveTab('switches');
    });
    const emptyCategory = screen.getByRole('status');
    expect(emptyCategory).toHaveAttribute('aria-live', 'polite');
    expect(emptyCategory.textContent).toMatch(/No data found in this category|no variables/i);
    expect(screen.queryByRole('button', { name: /clear search filter/i })).toBeNull();

    // Empty search query result -> Clear search filter button transfers focus to .save-editor-content (tabIndex=-1) across pointer click, Enter, and Space
    act(() => {
      store.setActiveTab('variables');
      store.setSearchQuery('nonexistent-xyz');
    });

    const scrollContainer = container.querySelector('.save-editor-content') as HTMLElement;
    expect(scrollContainer).toHaveAttribute('tabindex', '-1');

    const clearBtnClick = screen.getByRole('button', { name: /clear search filter/i });
    clearBtnClick.focus();
    await user.click(clearBtnClick);
    expect(store.getSnapshot().searchQuery).toBe('');
    expect(document.activeElement).toBe(scrollContainer);
    expect(screen.getByRole('textbox', { name: 'Gold' })).toBeInTheDocument();

    // Activate via Enter
    act(() => {
      store.setSearchQuery('missing-enter');
    });
    const clearBtnEnter = screen.getByRole('button', { name: /clear search filter/i });
    clearBtnEnter.focus();
    await user.keyboard('{Enter}');
    expect(store.getSnapshot().searchQuery).toBe('');
    expect(document.activeElement).toBe(scrollContainer);

    // Activate via Space
    act(() => {
      store.setSearchQuery('missing-space');
    });
    const clearBtnSpace = screen.getByRole('button', { name: /clear search filter/i });
    clearBtnSpace.focus();
    await user.keyboard(' ');
    expect(store.getSnapshot().searchQuery).toBe('');
    expect(document.activeElement).toBe(scrollContainer);
  });

  it('derives translations safely via getTranslation (NFC + Object.prototype guard), preserves focus on Enter inside virtual table, and toggles CheckboxSwitch', async () => {
    const user = userEvent.setup();
    const store = createSaveEditorStore('game-1');
    store.hydrateTranslations({
      'Cafe\u0301': 'Coffee Shop',
    });
    store.setFileLoaded(
      createSaveDto('slot1.sav', [
        {
          id: 'variables:1',
          tabId: 'variables',
          key: '1',
          label: 'Caf\u00e9',
          value: 25,
          type: 'number',
        },
        {
          id: 'variables:2',
          tabId: 'variables',
          key: '2',
          label: 'toString',
          value: 'safe',
          type: 'string',
        },
        {
          id: 'variables:3',
          tabId: 'variables',
          key: '3',
          label: 'constructor',
          value: 'safe2',
          type: 'string',
        },
        {
          id: 'switches:1',
          tabId: 'switches',
          key: '1',
          label: 'Flag Alpha',
          value: false,
          type: 'boolean',
        },
      ])
    );

    const { container } = render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorContent />
      </SaveEditorStoreProvider>
    );

    // Translated NFC label and Object.prototype-named labels render safely
    const coffeeInput = screen.getByRole('textbox', { name: 'Coffee Shop' }) as HTMLInputElement;
    expect(coffeeInput).toHaveValue('25');
    expect(screen.getByRole('textbox', { name: 'toString' })).toHaveValue('safe');
    expect(screen.getByRole('textbox', { name: 'constructor' })).toHaveValue('safe2');

    // Focus retention and non-duplicate blur commit on Enter inside virtualized SaveEditorContent
    const updateSpy = vi.spyOn(store, 'updateField');
    await user.click(coffeeInput);
    await user.clear(coffeeInput);
    await user.type(coffeeInput, '75{Enter}');

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith('variables:1', 75);
    expect(store.getSnapshot().modifiedFields['variables:1']).toBe(75);
    expect(document.activeElement).toBe(coffeeInput);

    fireEvent.blur(coffeeInput);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // Switch tab to switches and verify CheckboxSwitch DOM + Space/pointer toggling
    act(() => {
      store.setActiveTab('switches');
    });

    const checkboxRow = container.querySelector('.checkbox-row');
    expect(checkboxRow).not.toBeNull();
    const labelEl = checkboxRow?.querySelector('label.data-label');
    expect(labelEl).toHaveAttribute('for', 'field-switches:1');
    const switchEl = screen.getByRole('switch', { name: 'Flag Alpha' });
    expect(switchEl).toHaveAttribute('type', 'checkbox');
    expect(switchEl).toHaveAttribute('aria-checked', 'false');

    await user.click(switchEl);
    expect(store.getSnapshot().modifiedFields['switches:1']).toBe(true);
    expect(switchEl).toHaveAttribute('aria-checked', 'true');

    switchEl.focus();
    await user.keyboard(' ');
    expect(store.getSnapshot().dirtyKeys.has('switches:1')).toBe(false);
    expect(switchEl).toHaveAttribute('aria-checked', 'false');
  });

  it('resets scroll offset to 0 via scrollToOffset on file, tab, and search query transitions', () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(
      createSaveDto('slot1.sav', [
        { id: 'variables:1', tabId: 'variables', key: '1', label: 'A', value: 1, type: 'number' },
        { id: 'switches:1', tabId: 'switches', key: '1', label: 'B', value: false, type: 'boolean' },
      ])
    );

    const scrollToSpy = vi.fn();
    const origScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollToSpy;

    try {
      render(
        <SaveEditorStoreProvider store={store}>
          <SaveEditorContent />
        </SaveEditorStoreProvider>
      );

      scrollToSpy.mockClear();

      act(() => {
        store.setActiveTab('switches');
      });
      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));

      scrollToSpy.mockClear();
      act(() => {
        store.setSearchQuery('B');
      });
      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));

      scrollToSpy.mockClear();
      act(() => {
        store.setFileLoaded(
          createSaveDto('slot2.sav', [
            { id: 'switches:1', tabId: 'switches', key: '1', label: 'B', value: true, type: 'boolean' },
          ])
        );
      });
      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    } finally {
      HTMLElement.prototype.scrollTo = origScrollTo;
    }
  });

  it('re-measures virtual row positions via ResizeObserver callback and disconnects observer on unmount', () => {
    const callbacks: ResizeObserverCallback[] = [];
    const disconnectSpy = vi.fn();
    const observeSpy = vi.fn();
    const origResizeObserver = window.ResizeObserver;

    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        callbacks.push(cb);
      }
      observe = observeSpy;
      unobserve = vi.fn();
      disconnect = disconnectSpy;
    }
    window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    try {
      const store = createSaveEditorStore('game-1');
      store.setFileLoaded(
        createSaveDto('slot1.sav', [
          { id: 'variables:1', tabId: 'variables', key: '1', label: 'Row 0', value: 1, type: 'number' },
          { id: 'variables:2', tabId: 'variables', key: '2', label: 'Row 1', value: 2, type: 'number' },
          { id: 'variables:3', tabId: 'variables', key: '3', label: 'Row 2', value: 3, type: 'number' },
          { id: 'variables:4', tabId: 'variables', key: '4', label: 'Row 3', value: 4, type: 'number' },
        ])
      );
      store.setActiveTab('variables');

      const { container, unmount } = render(
        <SaveEditorStoreProvider store={store}>
          <SaveEditorContent />
        </SaveEditorStoreProvider>
      );

      const row0 = container.querySelector('[data-index="0"]') as HTMLElement;
      const row1 = container.querySelector('[data-index="1"]') as HTMLElement;
      expect(row1.style.transform).toBe('translateY(104px)');

      // Simulate row 0 label wrapping to 140px height without relying on browser layout engine
      vi.spyOn(row0, 'getBoundingClientRect').mockReturnValue({
        width: 800,
        height: 140,
        top: 0,
        left: 0,
        right: 800,
        bottom: 140,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      expect(callbacks.length).toBeGreaterThan(0);
      act(() => {
        for (const cb of callbacks) {
          cb([], {} as ResizeObserver);
        }
      });

      const spacer = container.querySelector('.save-editor-virtual-spacer') as HTMLElement;
      expect(spacer.style.height).toBe('244px');
      expect(row1.style.transform).toBe('translateY(140px)');

      unmount();
      expect(disconnectSpy).toHaveBeenCalled();
    } finally {
      window.ResizeObserver = origResizeObserver;
    }
  });

  it('preserves virtualRow.key (field.id) DOM node identity across filtering and remounts cleanly across tab switches', () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(
      createSaveDto('slot1.sav', [
        { id: 'variables:10', tabId: 'variables', key: '10', label: 'Alpha', value: 'one', type: 'string' },
        { id: 'variables:15', tabId: 'variables', key: '15', label: 'Mid', value: 'mid', type: 'string' },
        { id: 'variables:20', tabId: 'variables', key: '20', label: 'Beta', value: 'two', type: 'string' },
        { id: 'switches:10', tabId: 'switches', key: '10', label: 'Gamma', value: false, type: 'boolean' },
      ])
    );
    store.setActiveTab('variables');

    const { container } = render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorContent />
      </SaveEditorStoreProvider>
    );

    const betaInputBefore = screen.getByRole('textbox', { name: 'Beta' });
    const row1Before = container.querySelector('[data-index="1"]') as HTMLElement;

    // Filter so Beta shifts from index 1 -> index 0; key={virtualRow.key} keeps same DOM nodes
    act(() => {
      store.setSearchQuery('Beta');
    });

    const betaInputAfter = screen.getByRole('textbox', { name: 'Beta' });
    const row0After = container.querySelector('[data-index="0"]') as HTMLElement;
    expect(betaInputAfter).toBe(betaInputBefore);
    expect(row0After).toBe(row1Before);

    // Clear filter and switch tab -> Beta unmounts, Gamma mounts cleanly without stale wrapper node
    act(() => {
      store.setSearchQuery('');
      store.setActiveTab('switches');
    });

    const switchRow0 = container.querySelector('[data-index="0"]') as HTMLElement;
    expect(switchRow0).not.toBe(row0After);
    expect(screen.getByRole('switch', { name: 'Gamma' })).toBeInTheDocument();
  });

  it('supports Expand All / Collapse All sections in All tab and interactive pin button (★) with Pinned tab view', () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(
      createSaveDto('slot1.sav', [
        { id: 'variables:1', tabId: 'variables', key: '1', label: 'Gold', value: 100, type: 'number' },
        { id: 'switches:1', tabId: 'switches', key: '1', label: 'Boss', value: true, type: 'boolean' },
      ])
    );

    render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorContent />
      </SaveEditorStoreProvider>
    );

    const expandAllBtn = screen.getByRole('button', { name: 'Expand All' });
    const collapseAllBtn = screen.getByRole('button', { name: 'Collapse All' });
    expect(screen.getByRole('textbox', { name: 'Gold' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Boss' })).toBeInTheDocument();

    fireEvent.click(collapseAllBtn);
    expect(screen.queryByRole('textbox', { name: 'Gold' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Boss' })).toBeNull();

    fireEvent.click(expandAllBtn);
    expect(screen.getByRole('textbox', { name: 'Gold' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Variables/i }));
    expect(screen.queryByRole('textbox', { name: 'Gold' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Boss' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Variables/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Pin Gold' }));
    expect(store.getSnapshot().pinnedIds.has('variables:1')).toBe(true);
    expect(screen.getByRole('button', { name: 'Unpin Gold' })).toHaveClass('data-pin-btn', 'active');

    act(() => {
      store.setActiveTab('pinned');
    });
    expect(screen.getByRole('textbox', { name: 'Gold' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Boss' })).toBeNull();
  });
});

describe('Save Editor Content & Typed Inputs Stylesheet Contract', () => {
  it('defines scrollbar-gutter, focus outline suppression, row sizing, label wrapping, and tokenized input rules in src/styles/save-editor.css', () => {
    const cssPath = path.resolve(__dirname, '../../../styles/save-editor.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    const contentBlock = css.match(/\.save-editor-content\s*\{([^}]+)\}/);
    expect(contentBlock).not.toBeNull();
    expect(contentBlock![1]).toMatch(/scrollbar-gutter:\s*stable/);

    expect(css).toMatch(
      /\.save-editor-content:focus,\s*\.save-editor-content:focus-visible\s*\{[^}]*outline:\s*none/
    );
    expect(css).toMatch(/\.save-editor-content\s+\.loading\s*\{[^}]*height:\s*100%/s);
    expect(css).not.toMatch(/^\.loading\s*\{/m);
    expect(css).toMatch(/@keyframes\s+save-editor-fade-in\s*\{/);
    expect(css).toMatch(/\.save-editor-loaded-stage\s*\{[^}]*animation:\s*save-editor-fade-in/s);
    expect(css).toMatch(/\.save-editor-tabs-wrapper\.is-loaded\s*\{[^}]*animation:\s*save-editor-fade-in/s);
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.save-editor-loaded-stage,\s*\.save-editor-tabs-wrapper\.is-loaded\s*\{[^}]*animation:\s*none;/s
    );
    expect(css).toMatch(/\.save-grid-virtual-row--expanding\s*\{[^}]*animation:\s*save-editor-fade-in/s);
    expect(css).toMatch(/\.save-field-row\s+\.checkbox-row\s*\{[^}]*box-sizing:\s*border-box/s);
    expect(css).toMatch(/\.save-editor-scroll-viewport\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable/s);
    expect(css).toMatch(/\.standalone-save-editor\s+\.save-editor-panel\s*\{[^}]*width:\s*100%/s);

    const rowBlock = css.match(/\.save-field-row\s*\{([^}]+)\}/);
    expect(rowBlock).not.toBeNull();
    expect(rowBlock![1]).toMatch(/box-sizing:\s*border-box/);
    expect(rowBlock![1]).toMatch(/min-height:\s*88px/);
    expect(rowBlock![1]).toMatch(/background:\s*rgba\(255,\s*255,\s*255,\s*0\.02\)/);
    expect(rowBlock![1]).toMatch(/border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.05\)/);
    expect(rowBlock![1]).toMatch(/isolation:\s*isolate/);

    const boolRowBlock = css.match(/\.save-field-row:has\(\.checkbox-row\)\s*\{([^}]+)\}/);
    expect(boolRowBlock).not.toBeNull();
    expect(boolRowBlock![1]).toMatch(/min-height:\s*48px/);

    const labelBlock = css.match(/\.save-field-label\s*\{([^}]+)\}/);
    expect(labelBlock).not.toBeNull();
    expect(labelBlock![1]).toMatch(/color:\s*var\(--text-sub\)/);
    expect(labelBlock![1]).toMatch(/overflow-wrap:\s*anywhere/);

    expect(css).toMatch(/\.virtualized-table-number-input-wrapper\s*\{[^}]*\}/);
    expect(css).toMatch(
      /\.virtualized-table-number-input,\s*\.virtualized-table-text-input\s*\{[^}]*#0a0a0a[^}]*var\(--text-main/s
    );
    expect(css).toMatch(
      /\.virtualized-table-number-input:focus,\s*\.virtualized-table-text-input:focus\s*\{[^}]*var\(--accent[^}]*#000[^}]*box-shadow:/s
    );
    expect(css).toMatch(/\.virtualized-table-number-input\[aria-invalid="true"\]\s*\{[^}]*#ef4444/i);
    expect(css).toMatch(/\.number-input-error\s*\{[^}]*#ff6b6b/i);
  });

  it('renders .data-id, .data-delta, .is-translated, and idle .empty-state SVG icon', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <SaveFieldRow
        field={{
          id: 'variables:1',
          tabId: 'variables',
          key: '1',
          label: 'ゴールド',
          value: 100,
          type: 'number',
        }}
        value={250}
        isDirty={true}
        isTranslated={true}
        label="Gold"
        onChange={onChange}
      />
    );

    expect(container.querySelector('.data-id')?.textContent).toBe('#1');
    expect(container.querySelector('.data-delta')?.textContent).toBe('+150');
    expect(container.querySelector('.save-field-label.is-translated')).not.toBeNull();

    rerender(
      <SaveFieldRow
        field={{
          id: 'switches:2',
          tabId: 'switches',
          key: '2',
          label: 'Boss',
          value: false,
          type: 'boolean',
        }}
        value={true}
        isDirty={true}
        isTranslated={false}
        label="Boss"
        onChange={onChange}
      />
    );
    expect(container.querySelector('.data-delta')?.textContent).toBe('(was: false)');

    const store = createSaveEditorStore('game-1');
    const { container: idleContainer } = render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorContent />
      </SaveEditorStoreProvider>
    );
    const idleSvg = idleContainer.querySelector('.empty-state svg');
    expect(idleSvg).not.toBeNull();
    expect(idleSvg?.getAttribute('width')).toBe('48');
    expect(idleSvg?.getAttribute('height')).toBe('48');
  });

  it('applies save-grid-virtual-row--expanding briefly when expanding a collapsed section in All tab', () => {
    vi.useFakeTimers();
    try {
      const store = createSaveEditorStore('game-1');
      store.setFileLoaded(
        createSaveDto('slot1.sav', [
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
            label: 'Flag Alpha',
            value: false,
            type: 'boolean',
          },
        ])
      );
      store.setActiveTab('all');

      const { container } = render(
        <SaveEditorStoreProvider store={store}>
          <SaveEditorContent />
        </SaveEditorStoreProvider>
      );

      expect(container.querySelector('.save-grid-virtual-row--expanding')).toBeNull();

      act(() => {
        store.toggleSection('switches');
      });
      expect(container.querySelector('.save-grid-virtual-row--expanding')).toBeNull();

      act(() => {
        store.toggleSection('switches');
      });
      const expandingRows = container.querySelectorAll('.save-grid-virtual-row--expanding');
      expect(expandingRows).toHaveLength(1);
      expect(expandingRows[0]?.textContent).toContain('Flag Alpha');

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(container.querySelector('.save-grid-virtual-row--expanding')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows sticky active section header with push-off transform and collapses with scroll-back on click', () => {
    const store = createSaveEditorStore('game-1');
    const fields: SaveFieldDto[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `variables:${i + 1}`,
        tabId: 'variables',
        key: String(i + 1),
        label: `Var ${i + 1}`,
        value: i + 1,
        type: 'number' as const,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `switches:${i + 1}`,
        tabId: 'switches',
        key: String(i + 1),
        label: `Switch ${i + 1}`,
        value: true,
        type: 'boolean' as const,
      })),
    ];
    store.setFileLoaded(createSaveDto('slot1.sav', fields));
    store.setActiveTab('all');

    const scrollToSpy = vi.fn();
    const origScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollToSpy;

    try {
      const { container } = render(
        <SaveEditorStoreProvider store={store}>
          <SaveEditorContent />
        </SaveEditorStoreProvider>
      );

      expect(container.querySelector('.save-section-header--sticky')).toBeNull();

      const viewport = container.querySelector('.save-editor-scroll-viewport') as HTMLDivElement;
      expect(viewport).not.toBeNull();

      // Scroll past the Variables header (index 0, start = 0) into Variables rows
      Object.defineProperty(viewport, 'scrollTop', { value: 120, configurable: true, writable: true });
      fireEvent.scroll(viewport);

      const stickyBtn = container.querySelector('.save-section-header--sticky') as HTMLButtonElement;
      expect(stickyBtn).not.toBeNull();
      expect(stickyBtn.textContent).toContain('Variables');
      expect(stickyBtn.textContent).toContain('(12)');

      // Read actual Switches header Y offset from virtualizer DOM and scroll 15px before it
      const switchesBtn = Array.from(container.querySelectorAll('.save-section-header')).find(
        (el) => !el.classList.contains('save-section-header--sticky') && el.textContent?.includes('Switches')
      );
      const switchesWrapper = switchesBtn?.parentElement as HTMLElement | null;
      const matchY = switchesWrapper?.style.transform.match(/translateY\((\d+(?:\.\d+)?)px\)/);
      expect(matchY).not.toBeNull();
      const switchesTop = Number(matchY![1]);

      Object.defineProperty(viewport, 'scrollTop', {
        value: switchesTop - 15,
        configurable: true,
        writable: true,
      });
      fireEvent.scroll(viewport);
      expect(stickyBtn.style.transform).toMatch(/^translateY\(-\d+(\.\d+)?px\)$/);

      // Click sticky header: collapses Variables and scrolls back to its header offset (0)
      scrollToSpy.mockClear();
      fireEvent.click(stickyBtn);
      expect(store.getSnapshot().collapsedSections.has('variables')).toBe(true);
      expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    } finally {
      HTMLElement.prototype.scrollTo = origScrollTo;
    }
  });
});
