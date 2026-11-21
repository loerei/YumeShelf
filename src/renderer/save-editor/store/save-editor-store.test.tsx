import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { NormalizedSaveDto } from '@yumeshelf/engine/types';
import type { ElectronAPI } from '../../../shared/types/ipc';
import {
  createSaveEditorStore,
  getTranslation,
  SaveEditorStoreProvider,
  useActiveSaveTabId,
  useActiveTabFields,
  useActiveTabPristineFields,
  useIsMutatingFile,
  useIsTranslating,
  useSaveDirtyKeys,
  useSaveDirtyState,
  useSaveEditorDispatch,
  useSaveEditorSelector,
  useSaveEditorStore,
  useSaveElectronAPI,
  useSaveFileStatus,
  useSaveGameKey,
  useSaveModifiedFields,
  useSaveOperationStatus,
  useSaveSearchQuery,
  useSaveTranslations,
} from './save-editor-store';

function createMockSaveDto(overrides: Partial<NormalizedSaveDto> = {}): NormalizedSaveDto {
  return {
    gameKey: 'game-1',
    fileName: 'slot1.sav',
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
        id: 'variables:2',
        tabId: 'variables',
        key: '2',
        label: 'HeroName',
        value: 'Alex',
        type: 'string',
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

describe('ObservableSaveEditorStore (Core Actions & Invariants)', () => {
  it('enforces snapshot referential stability and preserves pristine map references across updateField mutations', () => {
    const store = createSaveEditorStore('game-1');
    expect(Object.is(store.getSnapshot(), store.getSnapshot())).toBe(true);

    store.setFileLoaded(createMockSaveDto());
    const snap1 = store.getSnapshot();
    expect(Object.is(snap1, store.getSnapshot())).toBe(true);

    store.updateField('variables:1', 250);
    const snap2 = store.getSnapshot();
    expect(snap2).not.toBe(snap1);
    expect(snap2.pristineFieldsById).toBe(snap1.pristineFieldsById);
    expect(snap2.pristineFieldsByTab).toBe(snap1.pristineFieldsByTab);
    expect(snap2.dirtyKeys).not.toBe(snap1.dirtyKeys);
    expect(snap2.modifiedFields).not.toBe(snap1.modifiedFields);
  });

  it('normalizes field labels to Unicode NFC at store ingress in setFileLoaded and buckets by tabId || general', () => {
    const store = createSaveEditorStore('game-1');
    const nfdLabel = 'Cafe\u0301';
    const nfcLabel = 'Caf\u00e9';

    store.setFileLoaded(
      createMockSaveDto({
        fields: [
          {
            id: 'variables:1',
            tabId: 'variables',
            key: '1',
            label: nfdLabel,
            value: 10,
            type: 'number',
          },
          {
            id: 'general:1',
            tabId: '',
            key: '1',
            label: 'FallbackTab',
            value: 'ok',
            type: 'string',
          },
        ],
      })
    );

    const snap = store.getSnapshot();
    expect(snap.pristineFieldsById.get('variables:1')?.label).toBe(nfcLabel);
    expect(snap.pristineFieldsByTab.get('variables')?.[0]?.label).toBe(nfcLabel);
    expect(snap.pristineFieldsByTab.get('general')?.[0]?.id).toBe('general:1');
    if (snap.fileStatus.state === 'loaded') {
      expect(snap.fileStatus.dto.fields[0].label).toBe(nfcLabel);
    } else {
      expect.unreachable('Expected loaded state');
    }
  });

  it('tracks O(1) dirty state, coerces scalar types, normalizes -0 to 0, ignores empty/NaN/Infinity numbers, and resets fields', () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(
      createMockSaveDto({
        fields: [
          {
            id: 'variables:0',
            tabId: 'variables',
            key: '0',
            label: 'ZeroVar',
            value: 0,
            type: 'number',
          },
          ...createMockSaveDto().fields,
        ],
      })
    );

    const beforeUnknown = store.getSnapshot();
    store.updateField('unknown:999', 42);
    expect(store.getSnapshot()).toBe(beforeUnknown);

    store.updateField('variables:1', '   ');
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(false);
    store.updateField('variables:1', 'not-a-number');
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(false);
    store.updateField('variables:1', Infinity);
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(false);

    store.updateField('variables:1', '500');
    expect(store.getSnapshot().modifiedFields['variables:1']).toBe(500);
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(true);

    store.updateField('variables:0', -0);
    expect(store.getSnapshot().dirtyKeys.has('variables:0')).toBe(false);
    store.updateField('variables:1', -0);
    expect(Object.is(store.getSnapshot().modifiedFields['variables:1'], 0)).toBe(true);

    store.updateField('variables:1', 100);
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(false);
    expect('variables:1' in store.getSnapshot().modifiedFields).toBe(false);

    store.updateField('switches:1', 'true');
    expect(store.getSnapshot().modifiedFields['switches:1']).toBe(true);
    store.updateField('switches:1', 'false');
    expect(store.getSnapshot().dirtyKeys.has('switches:1')).toBe(false);

    store.updateField('variables:2', 999);
    expect(store.getSnapshot().modifiedFields['variables:2']).toBe('999');

    store.updateField('variables:1', 300);
    store.resetField('variables:2');
    expect(store.getSnapshot().dirtyKeys.has('variables:2')).toBe(false);
    expect(store.getSnapshot().dirtyKeys.has('variables:1')).toBe(true);

    store.clearDirty();
    expect(store.getSnapshot().dirtyKeys.size).toBe(0);
    expect(store.getSnapshot().modifiedFields).toEqual({});
  });

  it('clamps setFileProgress percent between 0 and 100 and handles undefined/non-finite', () => {
    const store = createSaveEditorStore('game-1');
    store.setFileProgress('slot1.sav', -20);
    expect(store.getSnapshot().fileStatus).toEqual({
      state: 'loading',
      fileName: 'slot1.sav',
      percent: 0,
    });

    store.setFileProgress('slot1.sav', 145.6);
    expect(store.getSnapshot().fileStatus).toEqual({
      state: 'loading',
      fileName: 'slot1.sav',
      percent: 100,
    });

    store.setFileProgress('slot1.sav', 42.4);
    expect(store.getSnapshot().fileStatus).toEqual({
      state: 'loading',
      fileName: 'slot1.sav',
      percent: 42,
    });

    store.setFileProgress('slot1.sav', NaN);
    expect(store.getSnapshot().fileStatus).toEqual({
      state: 'loading',
      fileName: 'slot1.sav',
      percent: undefined,
    });
  });

  it('isolates sessions and resets searchQuery, isTranslating, isMutatingFile, modifiedFields, dirtyKeys, and pristine Maps on setFileLoading, setFileLoaded, and setFileIdle', () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockSaveDto());
    const loadedPristineById = store.getSnapshot().pristineFieldsById;
    const loadedPristineByTab = store.getSnapshot().pristineFieldsByTab;

    store.setSearchQuery('Gold');
    store.setTranslating(true);
    store.setMutatingFile(true);
    store.updateField('variables:1', 999);
    store.setSaving();

    const listener = vi.fn();
    store.subscribe(listener);

    store.setFileLoading('slot2.sav');
    const loadingSnap = store.getSnapshot();
    expect(loadingSnap.fileStatus).toEqual({ state: 'loading', fileName: 'slot2.sav' });
    expect(loadingSnap.saveStatus).toEqual({ state: 'idle' });
    expect(loadingSnap.searchQuery).toBe('');
    expect(loadingSnap.isTranslating).toBe(false);
    expect(loadingSnap.isMutatingFile).toBe(false);
    expect(loadingSnap.modifiedFields).toEqual({});
    expect(loadingSnap.dirtyKeys.size).toBe(0);
    expect(loadingSnap.pristineFieldsById).not.toBe(loadedPristineById);
    expect(loadingSnap.pristineFieldsByTab).not.toBe(loadedPristineByTab);
    expect(loadingSnap.pristineFieldsById.size).toBe(0);
    expect(loadedPristineById.size).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);

    store.setSearchQuery('Alex');
    store.setTranslating(true);
    store.setMutatingFile(true);
    store.setFileLoaded(createMockSaveDto({ fileName: 'slot2.sav' }));
    const reloadedSnap = store.getSnapshot();
    expect(reloadedSnap.searchQuery).toBe('');
    expect(reloadedSnap.isTranslating).toBe(false);
    expect(reloadedSnap.isMutatingFile).toBe(false);
    expect(reloadedSnap.modifiedFields).toEqual({});
    expect(reloadedSnap.dirtyKeys.size).toBe(0);
    expect(reloadedSnap.saveStatus).toEqual({ state: 'idle' });

    const beforeIdleById = reloadedSnap.pristineFieldsById;
    store.setSearchQuery('Boss');
    store.setTranslating(true);
    store.setMutatingFile(true);
    store.updateField('variables:1', 777);
    store.setSaveError('disk full');

    store.setFileIdle();
    const idleSnap = store.getSnapshot();
    expect(idleSnap.fileStatus).toEqual({ state: 'idle' });
    expect(idleSnap.saveStatus).toEqual({ state: 'idle' });
    expect(idleSnap.searchQuery).toBe('');
    expect(idleSnap.isTranslating).toBe(false);
    expect(idleSnap.isMutatingFile).toBe(false);
    expect(idleSnap.modifiedFields).toEqual({});
    expect(idleSnap.dirtyKeys.size).toBe(0);
    expect(idleSnap.pristineFieldsById).not.toBe(beforeIdleById);
    expect(idleSnap.pristineFieldsById.size).toBe(0);
    expect(idleSnap.pristineFieldsByTab.size).toBe(0);
    expect(beforeIdleById.size).toBe(3);
  });

  it('commits baseline race-safely via setSaved, preserving in-flight edits and reversions and guarding against file switches', () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockSaveDto({ fileName: 'slot1.sav' }));

    store.updateField('variables:1', 500);
    store.updateField('variables:2', 'Bob');
    store.setSaving();

    const inFlightUpdates = { ...store.getSnapshot().modifiedFields };

    store.updateField('variables:1', 800);
    store.updateField('variables:2', 'Alex');

    const beforeMismatch = store.getSnapshot();
    store.setSaved(inFlightUpdates, 'other_slot.sav');
    expect(store.getSnapshot()).toBe(beforeMismatch);

    store.setSaved(inFlightUpdates, 'slot1.sav');
    const afterCommit = store.getSnapshot();

    expect(afterCommit.pristineFieldsById.get('variables:1')?.value).toBe(500);
    expect(afterCommit.pristineFieldsById.get('variables:2')?.value).toBe('Bob');
    expect(afterCommit.pristineFieldsByTab.get('variables')?.[0]?.value).toBe(500);
    expect(afterCommit.pristineFieldsByTab.get('variables')?.[1]?.value).toBe('Bob');

    expect(afterCommit.modifiedFields['variables:1']).toBe(800);
    expect(afterCommit.dirtyKeys.has('variables:1')).toBe(true);

    expect(afterCommit.modifiedFields['variables:2']).toBe('Alex');
    expect(afterCommit.dirtyKeys.has('variables:2')).toBe(true);

    expect(afterCommit.saveStatus).toEqual({ state: 'idle' });

    const secondUpdates = { ...store.getSnapshot().modifiedFields };
    store.setSaved(secondUpdates, 'slot1.sav');
    const cleanSnap = store.getSnapshot();
    expect(cleanSnap.dirtyKeys.size).toBe(0);
    expect(cleanSnap.modifiedFields).toEqual({});
    expect(cleanSnap.saveStatus).toEqual({ state: 'saved' });

    store.updateField('switches:1', true);
    expect(store.getSnapshot().saveStatus).toEqual({ state: 'idle' });
  });

  it('guards setSaveError against cross-file contamination when fileName is provided', () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockSaveDto({ fileName: 'slot1.sav' }));

    const snapBefore = store.getSnapshot();
    store.setSaveError('Stale write error', 'slot2.sav');
    expect(store.getSnapshot()).toBe(snapBefore);

    store.setSaveError('Active write error', 'slot1.sav');
    expect(store.getSnapshot().saveStatus).toEqual({
      state: 'error',
      errorMessage: 'Active write error',
    });
  });

  it('renames active file with trimming, NFC normalization, expectedCurrentName verification, and preserves dirty state', () => {
    const store = createSaveEditorStore('game-1');

    const idleSnap = store.getSnapshot();
    store.renameActiveFile('slot2.sav');
    expect(Object.is(store.getSnapshot(), idleSnap)).toBe(true);

    store.setFileLoading('slot1.sav');
    const loadingSnap = store.getSnapshot();
    store.renameActiveFile('slot2.sav');
    expect(Object.is(store.getSnapshot(), loadingSnap)).toBe(true);

    store.setFileError('slot1.sav', 'Read failed');
    const errorSnap = store.getSnapshot();
    store.renameActiveFile('slot2.sav');
    expect(Object.is(store.getSnapshot(), errorSnap)).toBe(true);

    store.setFileLoaded(createMockSaveDto({ fileName: 'slot1.sav' }));
    store.setSearchQuery('Gold');
    store.updateField('variables:1', 750);
    const loadedSnap = store.getSnapshot();

    store.renameActiveFile('   ');
    expect(store.getSnapshot()).toBe(loadedSnap);
    store.renameActiveFile('slot1.sav');
    expect(store.getSnapshot()).toBe(loadedSnap);
    store.renameActiveFile('slot2.sav', 'wrong_current.sav');
    expect(store.getSnapshot()).toBe(loadedSnap);

    store.renameActiveFile('  slot2_Cafe\u0301.sav  ', '  slot1.sav  ');
    const renamedSnap = store.getSnapshot();
    expect(renamedSnap).not.toBe(loadedSnap);
    if (renamedSnap.fileStatus.state === 'loaded') {
      expect(renamedSnap.fileStatus.dto.fileName).toBe('slot2_Caf\u00e9.sav');
    } else {
      expect.unreachable('Expected loaded state');
    }
    expect(renamedSnap.searchQuery).toBe('Gold');
    expect(renamedSnap.modifiedFields['variables:1']).toBe(750);
    expect(renamedSnap.dirtyKeys.has('variables:1')).toBe(true);
    expect(renamedSnap.pristineFieldsById).toBe(loadedSnap.pristineFieldsById);
    expect(renamedSnap.pristineFieldsByTab).toBe(loadedSnap.pristineFieldsByTab);

    // Explicit test from AC: following renameActiveFile('slot2.sav', 'slot1.sav'),
    // store.setSaved(committedUpdates, 'slot2.sav') commits successfully while
    // store.setSaved(committedUpdates, 'old_slot.sav') is rejected by the session mismatch guard
    const store2 = createSaveEditorStore('game-1');
    store2.setFileLoaded(createMockSaveDto({ fileName: 'slot1.sav' }));
    store2.updateField('variables:1', 900);
    store2.renameActiveFile('slot2.sav', 'slot1.sav');

    const committedUpdates = { ...store2.getSnapshot().modifiedFields };
    store2.setSaved(committedUpdates, 'old_slot.sav');
    expect(store2.getSnapshot().dirtyKeys.has('variables:1')).toBe(true);
    expect(store2.getSnapshot().saveStatus).toEqual({ state: 'idle' });

    store2.setSaved(committedUpdates, 'slot2.sav');
    expect(store2.getSnapshot().dirtyKeys.size).toBe(0);
    expect(store2.getSnapshot().saveStatus).toEqual({ state: 'saved' });
    expect(store2.getSnapshot().pristineFieldsById.get('variables:1')?.value).toBe(900);
  });

  it('merges translations additively in setTranslations and hydrateTranslations, normalizing to NFC and stripping prototype pollution keys', () => {
    const store = createSaveEditorStore('game-1');

    const maliciousPayload = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"constructor":"bad","prototype":"bad","Cafe\\u0301":"Coffee\\u0301"}'
    );
    store.hydrateTranslations(maliciousPayload);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(store.getSnapshot().translations).toEqual({
      'Caf\u00e9': 'Coffe\u00e9',
    });

    const secondPayload = JSON.parse(
      '{"__proto__":{"polluted":"yes2"},"Gold":"Or"}'
    );
    store.setTranslations(secondPayload);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(store.getSnapshot().translations).toEqual({
      'Caf\u00e9': 'Coffe\u00e9',
      Gold: 'Or',
    });
  });
});

describe('SaveEditorStoreProvider & Granular Selectors', () => {
  it('throws invariant error when useSaveEditorStore, useSaveEditorSelector, or useSaveEditorDispatch is called outside SaveEditorStoreProvider', () => {
    expect(() => renderHook(() => useSaveEditorStore())).toThrow(
      'useSaveEditorStore must be used within SaveEditorStoreProvider'
    );
    expect(() => renderHook(() => useSaveEditorSelector((s) => s.gameKey))).toThrow(
      'useSaveEditorSelector must be used within a SaveEditorStoreProvider'
    );
    expect(() => renderHook(() => useSaveEditorDispatch())).toThrow(
      'useSaveEditorDispatch must be used within SaveEditorStoreProvider'
    );
  });

  it('provides injected store, gameKey, electronAPI seam, and referentially stable dispatchers', () => {
    const store = createSaveEditorStore('custom-game-key');
    const mockApi = { listSaveFiles: vi.fn() } as unknown as ElectronAPI;

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        {children}
      </SaveEditorStoreProvider>
    );

    const { result, rerender } = renderHook(
      () => ({
        store: useSaveEditorStore(),
        gameKey: useSaveGameKey(),
        api: useSaveElectronAPI(),
        dispatch: useSaveEditorDispatch(),
        fileStatus: useSaveFileStatus(),
        opStatus: useSaveOperationStatus(),
        activeTabId: useActiveSaveTabId(),
        searchQuery: useSaveSearchQuery(),
        translations: useSaveTranslations(),
        isTranslating: useIsTranslating(),
        isMutatingFile: useIsMutatingFile(),
        modifiedFields: useSaveModifiedFields(),
        dirtyKeys: useSaveDirtyKeys(),
        dirtyState: useSaveDirtyState(),
      }),
      { wrapper }
    );

    expect(result.current.store).toBe(store);
    expect(result.current.gameKey).toBe('custom-game-key');
    expect(result.current.api).toBe(mockApi);
    expect(result.current.fileStatus).toEqual({ state: 'idle' });
    expect(result.current.opStatus).toEqual({ state: 'idle' });
    expect(result.current.dirtyState).toEqual({ dirtyCount: 0, isDirty: false });

    const initialDispatch = result.current.dispatch;
    const initialDirtyState = result.current.dirtyState;

    act(() => {
      result.current.dispatch.setMutatingFile(true);
    });
    rerender();

    expect(result.current.isMutatingFile).toBe(true);
    expect(result.current.dispatch).toBe(initialDispatch);
    expect(result.current.dirtyState).toBe(initialDirtyState);

    // Forward setSaveError with fileName through provider dispatchers
    act(() => {
      result.current.dispatch.setFileLoaded(createMockSaveDto({ fileName: 'slot1.sav' }));
      result.current.dispatch.setSaveError('Mismatched error', 'slot2.sav');
    });
    expect(result.current.opStatus).toEqual({ state: 'idle' });

    act(() => {
      result.current.dispatch.setSaveError('Matched error', 'slot1.sav');
    });
    expect(result.current.opStatus).toEqual({
      state: 'error',
      errorMessage: 'Matched error',
    });
  });

  it('returns referentially stable EMPTY_PRISTINE_FIELDS from useActiveTabPristineFields when not loaded and O(1) tab-bucketed pristine fields when loaded', () => {
    const store = createSaveEditorStore('game-1');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SaveEditorStoreProvider store={store}>{children}</SaveEditorStoreProvider>
    );

    const { result } = renderHook(() => useActiveTabPristineFields(), { wrapper });
    const emptyRef1 = result.current;
    expect(emptyRef1).toEqual([]);

    act(() => {
      store.setFileLoading('slot1.sav');
    });
    expect(result.current).toBe(emptyRef1);

    const dto = createMockSaveDto();
    act(() => {
      store.setFileLoaded(dto);
    });
    const snap = store.getSnapshot();
    expect(snap.activeTabId).toBe('all');
    expect(result.current).toHaveLength(3);
    expect(snap.fileStatus.state === 'loaded' ? result.current === snap.fileStatus.dto.fields : false).toBe(true);

    act(() => {
      store.setActiveTab('variables');
    });
    expect(result.current).toHaveLength(2);
    expect(result.current[0].id).toBe('variables:1');
    expect(result.current[1].id).toBe('variables:2');
    expect(result.current).toBe(store.getSnapshot().pristineFieldsByTab.get('variables'));

    act(() => {
      store.setActiveTab('switches');
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('switches:1');
  });

  it('useActiveTabFields returns unmodified SaveFieldDto items decoupled from modifiedFields and filters with NFC normalization and Object.hasOwn getTranslation', () => {
    // Verify getTranslation rejects Object.prototype properties
    expect(getTranslation({}, 'toString')).toBeUndefined();
    expect(getTranslation({}, 'constructor')).toBeUndefined();
    expect(getTranslation({}, 'valueOf')).toBeUndefined();
    expect(getTranslation({ Gold: 'Or' }, 'Gold')).toBe('Or');

    const store = createSaveEditorStore('game-1');
    const dto = createMockSaveDto({
      fields: [
        {
          id: 'variables:1',
          tabId: 'variables',
          key: '1',
          label: 'Cafe\u0301', // NFD at ingress -> normalized to NFC 'Café'
          value: 100,
          type: 'number',
        },
        {
          id: 'variables:2',
          tabId: 'variables',
          key: '2',
          label: 'toString', // Prototype collision candidate
          value: 'HeroVal',
          type: 'string',
        },
      ],
    });
    store.setFileLoaded(dto);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SaveEditorStoreProvider store={store}>{children}</SaveEditorStoreProvider>
    );

    const { result } = renderHook(() => useActiveTabFields(), { wrapper });
    const initialTabFields = result.current;
    expect(initialTabFields).toHaveLength(2);
    // Returns unmodified SaveFieldDto references without allocating derived object literals
    expect(initialTabFields[0]).toBe(store.getSnapshot().pristineFieldsById.get('variables:1'));

    // Keystrokes in updateField must NOT re-run filtering or allocate a new array
    act(() => {
      store.updateField('variables:1', 999);
    });
    expect(result.current).toBe(initialTabFields);

    // Search by NFD query matches NFC normalized field label
    act(() => {
      store.setSearchQuery('cafe\u0301');
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toBe(store.getSnapshot().pristineFieldsById.get('variables:1'));

    // Additive translation lookup with NFD key matches when searching translated label
    act(() => {
      store.setTranslations({ 'Cafe\u0301': 'Kaffeehaus' });
      store.setSearchQuery('kaffee');
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('variables:1');

    // Search by scalar value
    act(() => {
      store.setSearchQuery('heroval');
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe('variables:2');
  });

  it('registers beforeunload listener on window that prevents unload only when dirtyKeys.size > 0 and cleans up on unmount', () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockSaveDto());

    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SaveEditorStoreProvider store={store}>{children}</SaveEditorStoreProvider>
    );

    const { unmount } = renderHook(() => useSaveEditorStore(), { wrapper });
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    // When clean, beforeunload does not preventDefault
    const cleanEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    const cleanPreventSpy = vi.spyOn(cleanEvent, 'preventDefault');
    window.dispatchEvent(cleanEvent);
    expect(cleanPreventSpy).not.toHaveBeenCalled();

    // When dirty, beforeunload calls preventDefault and sets returnValue = ''
    act(() => {
      store.updateField('variables:1', 777);
    });
    const dirtyEvent = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    const dirtyPreventSpy = vi.spyOn(dirtyEvent, 'preventDefault');
    window.dispatchEvent(dirtyEvent);
    expect(dirtyPreventSpy).toHaveBeenCalledTimes(1);

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('persists pinnedIds via storage adapter, manages switchFilter & section collapse, and leaves Pinned tab when empty', () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: vi.fn((k: string) => map.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => {
        map.set(k, v);
      }),
      removeItem: vi.fn((k: string) => {
        map.delete(k);
      }),
    };

    const store = createSaveEditorStore('game-pin-test', storage);
    store.setFileLoaded(createMockSaveDto());

    store.togglePin('variables:1');
    expect(store.getSnapshot().pinnedIds.has('variables:1')).toBe(true);
    expect(map.get('yumeshelf_pinned_game-pin-test')).toBe('["variables:1"]');

    // Fresh store hydrates saved pins
    const rehydrated = createSaveEditorStore('game-pin-test', storage);
    expect(rehydrated.getSnapshot().pinnedIds.has('variables:1')).toBe(true);

    store.setActiveTab('pinned');
    expect(store.getSnapshot().activeTabId).toBe('pinned');

    // Removing the last pin on Pinned tab transitions cleanly back to All
    store.togglePin('variables:1');
    expect(store.getSnapshot().pinnedIds.size).toBe(0);
    expect(store.getSnapshot().activeTabId).toBe('all');

    // Switch filter auto-resets when navigating away from switches tab
    store.setActiveTab('switches');
    store.setFilter({ switchFilter: 'true' });
    expect(store.getSnapshot().filters.switchFilter).toBe('true');
    store.setActiveTab('variables');
    expect(store.getSnapshot().filters.switchFilter).toBe('all');

    // Section collapse/expand helpers
    store.collapseAllSections(['variables', 'switches']);
    expect(store.getSnapshot().collapsedSections.has('variables')).toBe(true);
    expect(store.getSnapshot().collapsedSections.has('switches')).toBe(true);
    store.toggleSection('variables');
    expect(store.getSnapshot().collapsedSections.has('variables')).toBe(false);
    store.expandAllSections();
    expect(store.getSnapshot().collapsedSections.size).toBe(0);
  });
});
