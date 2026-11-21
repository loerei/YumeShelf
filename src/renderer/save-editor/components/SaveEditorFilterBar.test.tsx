import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NormalizedSaveDto } from '@yumeshelf/engine/types';
import {
  createSaveEditorStore,
  SaveEditorStoreProvider,
} from '../store/save-editor-store';
import { SaveEditorFilterBar } from './SaveEditorFilterBar';

const MOCK_DTO: NormalizedSaveDto = {
  gameKey: 'game-1',
  fileName: 'slot1.sav',
  strategy: 'rpg-maker-mv',
  tabs: [
    { id: 'variables', label: 'Variables', count: 1 },
    { id: 'switches', label: 'Switches', count: 1 },
  ],
  fields: [
    { id: 'variables:1', tabId: 'variables', key: '1', label: 'Gold', value: 100, type: 'number' },
    { id: 'switches:1', tabId: 'switches', key: '1', label: 'Flag', value: true, type: 'boolean' },
  ],
};

describe('SaveEditorFilterBar', () => {
  it('renders default filter checkboxes, updates store filters, and shows mutually exclusive ON/OFF filters only on switches tab', () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(MOCK_DTO);

    render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorFilterBar />
      </SaveEditorStoreProvider>
    );

    const showEmpty = screen.getByRole('checkbox', { name: 'Show empty variables' }) as HTMLInputElement;
    const showImportant = screen.getByRole('checkbox', { name: 'Always show important' }) as HTMLInputElement;
    const exactMatch = screen.getByRole('checkbox', { name: 'Exact match' }) as HTMLInputElement;
    const searchName = screen.getByRole('checkbox', { name: 'Name' }) as HTMLInputElement;
    const searchValue = screen.getByRole('checkbox', { name: 'Value' }) as HTMLInputElement;
    const searchIndex = screen.getByRole('checkbox', { name: 'Index (ID)' }) as HTMLInputElement;

    expect(showEmpty.checked).toBe(false);
    expect(showImportant.checked).toBe(true);
    expect(exactMatch.checked).toBe(false);
    expect(searchName.checked).toBe(true);
    expect(searchValue.checked).toBe(true);
    expect(searchIndex.checked).toBe(false);
    expect(screen.queryByRole('checkbox', { name: 'ON only' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'OFF only' })).toBeNull();

    fireEvent.click(showEmpty);
    fireEvent.click(exactMatch);
    fireEvent.click(searchIndex);
    fireEvent.click(showImportant);

    expect(store.getSnapshot().filters).toMatchObject({
      showEmpty: true,
      showImportant: false,
      exactMatch: true,
      searchIndex: true,
    });

    act(() => {
      store.setActiveTab('switches');
    });

    const onOnly = screen.getByRole('checkbox', { name: 'ON only' }) as HTMLInputElement;
    const offOnly = screen.getByRole('checkbox', { name: 'OFF only' }) as HTMLInputElement;
    expect(onOnly.checked).toBe(false);
    expect(offOnly.checked).toBe(false);

    fireEvent.click(onOnly);
    expect(store.getSnapshot().filters.switchFilter).toBe('true');
    expect(onOnly.checked).toBe(true);
    expect(offOnly.checked).toBe(false);

    // Switching to OFF only clears ON only
    fireEvent.click(offOnly);
    expect(store.getSnapshot().filters.switchFilter).toBe('false');
    expect(onOnly.checked).toBe(false);
    expect(offOnly.checked).toBe(true);

    // Leaving switches tab resets switchFilter
    act(() => {
      store.setActiveTab('variables');
    });
    expect(store.getSnapshot().filters.switchFilter).toBe('all');
    expect(screen.queryByRole('checkbox', { name: 'ON only' })).toBeNull();
  });
});
