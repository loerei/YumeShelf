import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { NormalizedSaveDto, SaveFieldDto } from '@yumeshelf/engine/types';
import { SaveEditorSearchBar } from './SaveEditorSearchBar';
import {
  createSaveEditorStore,
  SaveEditorStoreProvider,
  useActiveTabFields,
} from '../store/save-editor-store';
import type { UiStorageAdapter } from '../../state/ui-runtime-state';
import type { ElectronAPI } from '../../../shared/types/ipc';

const flushPromises = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
};

function createMockDto(
  fileName = 'file1.rpgsave',
  fields?: SaveFieldDto[]
): NormalizedSaveDto {
  return {
    gameKey: 'game-1',
    fileName,
    strategy: 'rpg-maker-mv',
    tabs: [
      { id: 'variables', label: 'Variables', count: 2 },
      { id: 'switches', label: 'Switches', count: 1 },
    ],
    fields: fields ?? [
      {
        id: 'variables:1',
        tabId: 'variables',
        key: '1',
        label: 'Hero HP/MP',
        value: 100,
        type: 'number',
      },
      {
        id: 'variables:2',
        tabId: 'variables',
        key: '2',
        label: 'Yes/No Flag',
        value: 'Active',
        type: 'string',
      },
    ],
  };
}

function createMockElectronAPI(
  overrides: Partial<ElectronAPI> = {}
): ElectronAPI {
  return {
    loadTranslations: vi.fn().mockResolvedValue({}),
    saveTranslations: vi.fn().mockResolvedValue({ ok: true }),
    translateBatch: vi.fn().mockImplementation(async (texts: string[]) => {
      const out: Record<string, string> = {};
      for (const t of texts) {
        out[t] = `[TL] ${t}`;
      }
      return out;
    }),
    cancelTranslateBatch: vi.fn().mockResolvedValue({ cancelled: true }),
    ...overrides,
  } as unknown as ElectronAPI;
}

function createMemoryStorage(
  initial: Record<string, string> = {}
): UiStorageAdapter {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: vi.fn((k: string) => (map.has(k) ? map.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => {
      map.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      map.delete(k);
    }),
  };
}

const ActiveFieldsProbe: React.FC = () => {
  const fields = useActiveTabFields();
  return (
    <ul data-testid="active-fields">
      {fields.map((f) => (
        <li key={f.id}>{f.label}</li>
      ))}
    </ul>
  );
};

describe('SaveEditorSearchBar', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces search query updates by 150ms, flushes synchronously on Enter keydown, and preserves slash labels ("HP/MP", "Yes/No")', async () => {
    vi.useFakeTimers();
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto());
    const mockApi = createMockElectronAPI();

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar interBatchDelayMs={0} />
        <ActiveFieldsProbe />
      </SaveEditorStoreProvider>
    );

    const searchInput = screen.getByRole('searchbox', {
      name: /search variables/i,
    });

    fireEvent.change(searchInput, { target: { value: 'HP/MP' } });
    expect(searchInput).toHaveValue('HP/MP');
    expect(store.getSnapshot().searchQuery).toBe('');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(store.getSnapshot().searchQuery).toBe('');

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(store.getSnapshot().searchQuery).toBe('HP/MP');
    expect(screen.getByTestId('active-fields').textContent).toBe('Hero HP/MP');

    // Enter keydown immediately clears pending timer and flushes synchronously
    fireEvent.change(searchInput, { target: { value: 'Yes/No' } });
    expect(store.getSnapshot().searchQuery).toBe('HP/MP');

    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
    expect(store.getSnapshot().searchQuery).toBe('Yes/No');
    expect(screen.getByTestId('active-fields').textContent).toBe('Yes/No Flag');
  });

  it('synchronously flushes pending search debounce query when switching category tabs without aborting in-flight translation', async () => {
    vi.useFakeTimers();
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto());

    let resolveTranslate!: (val: Record<string, string>) => void;
    const mockApi = createMockElectronAPI({
      translateBatch: vi.fn().mockImplementation(
        () =>
          new Promise<Record<string, string>>((r) => {
            resolveTranslate = r;
          })
      ),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar interBatchDelayMs={0} />
      </SaveEditorStoreProvider>
    );

    const translateBtn = screen.getByRole('button', {
      name: /translate save fields/i,
    });
    fireEvent.click(translateBtn);
    expect(store.getSnapshot().isTranslating).toBe(true);

    const searchInput = screen.getByRole('searchbox', {
      name: /search variables/i,
    });
    fireEvent.change(searchInput, { target: { value: 'Active' } });
    expect(store.getSnapshot().searchQuery).toBe('');

    // Switch category tab while debounce timer is in-flight
    act(() => {
      store.setActiveTab('switches');
    });

    // Pending search query flushed synchronously to store, and translation stays active
    expect(store.getSnapshot().searchQuery).toBe('Active');
    expect(searchInput).toHaveValue('Active');
    expect(store.getSnapshot().isTranslating).toBe(true);
    expect(mockApi.cancelTranslateBatch).not.toHaveBeenCalled();

    await act(async () => {
      resolveTranslate({ 'Hero HP/MP': '英雄 HP/MP' });
      await vi.runAllTimersAsync();
    });
    expect(store.getSnapshot().isTranslating).toBe(false);
  });

  it('synchronizes search input when store searchQuery is modified externally, and resets draftQuery on file switch, idle, or error without mutating store on unmount', () => {
    vi.useFakeTimers();
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));
    const mockApi = createMockElectronAPI();

    const { unmount } = render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar />
      </SaveEditorStoreProvider>
    );

    const searchInput = screen.getByRole('searchbox', {
      name: /search variables/i,
    });

    // 1. Dispatched query cleared externally
    fireEvent.change(searchInput, { target: { value: 'Hero' } });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(store.getSnapshot().searchQuery).toBe('Hero');

    act(() => {
      store.setSearchQuery('');
    });
    expect(searchInput).toHaveValue('');

    // 2. Buffered in-flight draftQuery reset on setFileLoading
    fireEvent.change(searchInput, { target: { value: 'Buffered' } });
    expect(searchInput).toHaveValue('Buffered');
    act(() => {
      store.setFileLoading('slot2.sav');
    });
    expect(searchInput).toHaveValue('');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(store.getSnapshot().searchQuery).toBe('');

    // 3. Buffered in-flight draftQuery reset on setFileError and setFileIdle
    act(() => {
      store.setFileLoaded(createMockDto('slot2.sav'));
    });
    fireEvent.change(searchInput, { target: { value: 'ErrorTest' } });
    act(() => {
      store.setFileError('slot2.sav', 'Read failed');
    });
    expect(searchInput).toHaveValue('');

    act(() => {
      store.setFileLoaded(createMockDto('slot2.sav'));
    });
    fireEvent.change(searchInput, { target: { value: 'IdleTest' } });
    act(() => {
      store.setFileIdle();
    });
    expect(searchInput).toHaveValue('');

    // 4. Unmount with pending debounce timer does NOT mutate store
    act(() => {
      store.setFileLoaded(createMockDto('slot2.sav'));
    });
    fireEvent.change(searchInput, { target: { value: 'UnmountPending' } });
    unmount();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(store.getSnapshot().searchQuery).toBe('');
  });

  it('resolves yumeshelf_lang from injectable storage?: UiStorageAdapter seam and hydrates persisted translations via loadTranslations', async () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto());
    const storage = createMemoryStorage({ yumeshelf_lang: 'ja-JP' });
    const mockApi = createMockElectronAPI({
      loadTranslations: vi.fn().mockResolvedValue({
        'Hero HP/MP': '勇者 HP/MP',
      }),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar storage={storage} />
      </SaveEditorStoreProvider>
    );

    expect(storage.getItem).toHaveBeenCalledWith('yumeshelf_lang');
    expect(mockApi.loadTranslations).toHaveBeenCalledWith('ja-JP');

    await act(async () => {
      await flushPromises();
    });

    expect(store.getSnapshot().translations['Hero HP/MP']).toBe('勇者 HP/MP');
  });

  it('renders inline vector SVG icon on .translate-btn, sets aria-disabled="true" and .loading without native disabled, and retains focus across start and completion', async () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto());

    let resolveBatch!: (res: Record<string, string>) => void;
    const mockApi = createMockElectronAPI({
      translateBatch: vi.fn().mockImplementation(
        () =>
          new Promise<Record<string, string>>((r) => {
            resolveBatch = r;
          })
      ),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar interBatchDelayMs={0} />
      </SaveEditorStoreProvider>
    );

    const translateBtn = screen.getByRole('button', {
      name: /translate save fields/i,
    });
    const svg = translateBtn.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('aria-hidden', 'true');

    translateBtn.focus();
    expect(document.activeElement).toBe(translateBtn);

    fireEvent.click(translateBtn);

    expect(translateBtn).toHaveClass('translate-btn', 'loading');
    expect(translateBtn).toHaveAttribute('aria-disabled', 'true');
    expect(translateBtn).not.toBeDisabled();
    expect(document.activeElement).toBe(translateBtn);

    // Immediate progress initialization on Batch 1 (CLS = 0)
    expect(screen.getByRole('status')).toHaveTextContent('Batch 1 of 1');

    await act(async () => {
      resolveBatch({
        'Hero HP/MP': '勇者 HP/MP',
        'Yes/No Flag': 'はい/いいえ',
      });
      await flushPromises();
    });

    expect(translateBtn).not.toHaveClass('loading');
    expect(translateBtn).toHaveAttribute('aria-disabled', 'false');
    expect(document.activeElement).toBe(translateBtn);
    expect(screen.getByRole('status')).toHaveTextContent(
      'All labels translated'
    );
  });

  it('partitions labels by batchSize, character length (<= 300), and URL-encoded byte length (<= 1500) with lone surrogate sanitization while skipping cached, numeric, and Object.prototype collisions', async () => {
    const store = createSaveEditorStore('game-1');
    // Pre-populate cached translation and verify Object.prototype keys like "toString" are NOT falsely treated as cached
    store.setTranslations({ 'Cached Label': 'キャッシュ済み' });

    const cjkLabel1 = 'あ'.repeat(160); // 160 chars, 160 * 9 = 1440 URL-encoded bytes (fits 1 per batch)
    const cjkLabel2 = 'い'.repeat(160); // 1440 URL-encoded bytes (must partition into batch 2)
    const oversizedChars = 'A'.repeat(301); // > 300 chars -> skipped
    const oversizedBytes = 'う'.repeat(170); // 170 chars <= 300, but 1530 encoded bytes > 1500 -> skipped
    const loneSurrogateLabel = ' Bad\uD800Surrogate ';

    const fields: SaveFieldDto[] = [
      { id: 'v:1', tabId: 'variables', key: '1', label: '12345', value: 1, type: 'number' },
      { id: 'v:2', tabId: 'variables', key: '2', label: '   ', value: 1, type: 'number' },
      { id: 'v:3', tabId: 'variables', key: '3', label: 'Cached Label', value: 1, type: 'number' },
      { id: 'v:4', tabId: 'variables', key: '4', label: 'toString', value: 1, type: 'number' },
      { id: 'v:5', tabId: 'variables', key: '5', label: cjkLabel1, value: 1, type: 'number' },
      { id: 'v:6', tabId: 'variables', key: '6', label: cjkLabel2, value: 1, type: 'number' },
      { id: 'v:7', tabId: 'variables', key: '7', label: oversizedChars, value: 1, type: 'number' },
      { id: 'v:8', tabId: 'variables', key: '8', label: oversizedBytes, value: 1, type: 'number' },
      { id: 'v:9', tabId: 'variables', key: '9', label: loneSurrogateLabel, value: 1, type: 'number' },
    ];

    store.setFileLoaded(createMockDto('slot1.sav', fields));
    const mockApi = createMockElectronAPI();

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar batchSize={15} interBatchDelayMs={0} targetLang="en" />
      </SaveEditorStoreProvider>
    );

    const translateBtn = screen.getByRole('button', {
      name: /translate save fields/i,
    });
    await act(async () => {
      fireEvent.click(translateBtn);
      await flushPromises();
    });

    // Batch 1: ['toString'] (8 bytes) + cjkLabel1 (1440 bytes + 3 for \n = 1451 <= 1500)
    // Batch 2: [cjkLabel2] (1440 bytes) + ['Bad\uD800Surrogate'] (12 + 9 + 3 = 24 bytes -> 1464 <= 1500)
    expect(mockApi.translateBatch).toHaveBeenCalledTimes(2);
    expect(mockApi.translateBatch).toHaveBeenNthCalledWith(
      1,
      ['toString', cjkLabel1],
      'en',
      expect.objectContaining({ timeoutMs: 30000 })
    );
    expect(mockApi.translateBatch).toHaveBeenNthCalledWith(
      2,
      [cjkLabel2, 'Bad\uD800Surrogate'],
      'en',
      expect.objectContaining({ timeoutMs: 30000 })
    );
    expect(mockApi.saveTranslations).toHaveBeenCalledTimes(2);
  });

  it('displays transient "All labels translated" when all labels are already cached, and "No translatable labels (oversized fields skipped)" when all candidates exceed size ceilings', async () => {
    vi.useFakeTimers();
    const store = createSaveEditorStore('game-1');
    store.setTranslations({ 'Hero HP/MP': '勇者 HP/MP', 'Yes/No Flag': 'フラグ' });
    store.setFileLoaded(createMockDto());
    const mockApi = createMockElectronAPI();

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar />
      </SaveEditorStoreProvider>
    );

    const translateBtn = screen.getByRole('button', {
      name: /translate save fields/i,
    });
    await act(async () => {
      fireEvent.click(translateBtn);
    });

    expect(mockApi.translateBatch).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'All labels translated'
    );

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('status')).toHaveTextContent('');

    // Now load a file with only oversized labels
    act(() => {
      store.setFileLoaded(
        createMockDto('oversized.sav', [
          {
            id: 'v:1',
            tabId: 'variables',
            key: '1',
            label: 'X'.repeat(305),
            value: 1,
            type: 'number',
          },
        ])
      );
    });

    await act(async () => {
      fireEvent.click(translateBtn);
    });

    expect(mockApi.translateBatch).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'No translatable labels (oversized fields skipped)'
    );
  });

  it('restores focus to .translate-btn when clicking Cancel, invokes api.cancelTranslateBatch({ jobId }), and clears progress without error alerts', async () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto());

    let resolveBatch!: (res: Record<string, string>) => void;
    const mockApi = createMockElectronAPI({
      translateBatch: vi.fn().mockImplementation(
        () =>
          new Promise<Record<string, string>>((r) => {
            resolveBatch = r;
          })
      ),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar interBatchDelayMs={0} />
      </SaveEditorStoreProvider>
    );

    const translateBtn = screen.getByRole('button', {
      name: /translate save fields/i,
    });
    fireEvent.click(translateBtn);

    const cancelBtn = screen.getByRole('button', {
      name: /cancel batch translation/i,
    });
    cancelBtn.focus();
    expect(document.activeElement).toBe(cancelBtn);

    await act(async () => {
      fireEvent.click(cancelBtn);
      await flushPromises();
    });

    expect(document.activeElement).toBe(translateBtn);
    expect(mockApi.cancelTranslateBatch).toHaveBeenCalledTimes(1);
    expect(mockApi.cancelTranslateBatch).toHaveBeenCalledWith({
      jobId: expect.stringContaining('file1.rpgsave_'),
    });
    expect(store.getSnapshot().isTranslating).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('');

    // Late resolution is discarded cleanly
    await act(async () => {
      resolveBatch({ 'Hero HP/MP': 'Late' });
      await flushPromises();
    });
    expect(store.getSnapshot().translations['Hero HP/MP']).toBeUndefined();
  });

  it('enforces progressive staleness watchdog timeout with fake timers and microtask draining, displaying retry alert and restoring focus when owned or evicted', async () => {
    vi.useFakeTimers();
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto());

    const mockApi = createMockElectronAPI({
      translateBatch: vi.fn().mockImplementation(
        () => new Promise<Record<string, string>>(() => {})
      ),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar watchdogTimeoutMs={30000} interBatchDelayMs={0} />
      </SaveEditorStoreProvider>
    );

    const translateBtn = screen.getByRole('button', {
      name: /translate save fields/i,
    });
    // Simulate evicted focus (document.body)
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement).toBe(document.body);

    fireEvent.click(translateBtn);
    expect(translateBtn).toHaveAttribute('aria-disabled', 'true');

    vi.advanceTimersByTime(30000);
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      /translation timed out/i
    );
    expect(translateBtn).not.toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(translateBtn);
  });

  it('never steals focus from .save-editor-search or <SaveFileList /> controls across normal completion, rejection, watchdog timeout, or file switch', async () => {
    vi.useFakeTimers();
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto('slot1.sav'));

    let rejectBatch!: (err: Error) => void;
    const mockApi = createMockElectronAPI({
      translateBatch: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Record<string, string>>((_, rej) => {
              rejectBatch = rej;
            })
        )
        .mockImplementationOnce(
          () => new Promise<Record<string, string>>(() => {})
        )
        .mockImplementationOnce(
          () => new Promise<Record<string, string>>(() => {})
        ),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <button type="button" data-testid="file-list-btn">
          slot2.sav
        </button>
        <SaveEditorSearchBar watchdogTimeoutMs={5000} interBatchDelayMs={0} />
      </SaveEditorStoreProvider>
    );

    const translateBtn = screen.getByRole('button', {
      name: /translate save fields/i,
    });
    const searchInput = screen.getByRole('searchbox', {
      name: /search variables/i,
    });
    const fileListBtn = screen.getByTestId('file-list-btn');

    // (a) Rejection while focused on .save-editor-search
    fireEvent.click(translateBtn);
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    await act(async () => {
      rejectBatch(new Error('Network failure at C:\\Users\\Alice\\save'));
      await vi.runAllTimersAsync();
    });

    expect(document.activeElement).toBe(searchInput);
    expect(screen.getByRole('status')).toHaveTextContent(
      /Network failure at <USER_DIR>\\save/i
    );

    // (b) Watchdog timeout while focused on .save-editor-search
    fireEvent.click(translateBtn);
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    vi.advanceTimersByTime(5000);
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(document.activeElement).toBe(searchInput);
    expect(screen.getByRole('status')).toHaveTextContent(
      /translation timed out/i
    );

    // (c) File switch while focused on a <SaveFileList /> control
    fireEvent.click(translateBtn);
    fileListBtn.focus();
    expect(document.activeElement).toBe(fileListBtn);

    await act(async () => {
      store.setFileLoaded(createMockDto('slot2.sav'));
      await vi.runAllTimersAsync();
    });

    expect(document.activeElement).toBe(fileListBtn);
    expect(mockApi.cancelTranslateBatch).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().isTranslating).toBe(false);
  });

  it('updates progress from Batch 1 of N to Batch N of N across multi-batch delays, resets watchdog per batch delta, and removes abort listeners on delay completion (AC-EDGE-2)', async () => {
    vi.useFakeTimers();
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(
      createMockDto('multi.sav', [
        { id: 'v:1', tabId: 'variables', key: '1', label: 'Label One', value: 1, type: 'number' },
        { id: 'v:2', tabId: 'variables', key: '2', label: 'Label Two', value: 2, type: 'number' },
      ])
    );

    const resolvers: Array<(res: Record<string, string>) => void> = [];
    const mockApi = createMockElectronAPI({
      translateBatch: vi.fn().mockImplementation(
        () =>
          new Promise<Record<string, string>>((r) => {
            resolvers.push(r);
          })
      ),
    });

    const removeListenerSpy = vi.spyOn(
      AbortSignal.prototype,
      'removeEventListener'
    );

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar
          batchSize={1}
          interBatchDelayMs={200}
          watchdogTimeoutMs={1000}
        />
      </SaveEditorStoreProvider>
    );

    const translateBtn = screen.getByRole('button', {
      name: /translate save fields/i,
    });
    const searchInput = screen.getByRole('searchbox', {
      name: /search variables/i,
    });

    fireEvent.click(translateBtn);

    // Zero delay before batch index 0: called immediately
    expect(mockApi.translateBatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Batch 1 of 2');

    // Move focus to search input during in-flight translation to verify normal completion does not steal focus
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    // Advance 700ms (< 1000ms watchdog) then resolve Batch 1
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
      resolvers[0]({ 'Label One': 'ラベル1' });
      await flushPromises();
    });

    // Now in 200ms inter-batch delay; batch 2 not started yet
    expect(mockApi.translateBatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
      await flushPromises();
    });

    // Batch 2 started, progress updated to Batch 2 of 2, and delayWithSignal cleaned up its abort listener
    expect(mockApi.translateBatch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Batch 2 of 2');
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'abort',
      expect.any(Function)
    );

    // Advance another 700ms (total elapsed 1600ms > 1000ms single watchdog window, proving watchdog reset on batch 2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(store.getSnapshot().isTranslating).toBe(true);

    await act(async () => {
      resolvers[1]({ 'Label Two': 'ラベル2' });
      await flushPromises();
    });

    expect(store.getSnapshot().isTranslating).toBe(false);
    expect(document.activeElement).toBe(searchInput);
    expect(screen.getByRole('status')).toHaveTextContent(
      'All labels translated'
    );
  });

  it('invokes api.cancelTranslateBatch strictly once when unmounting during an active translation batch', async () => {
    const store = createSaveEditorStore('game-1');
    store.setFileLoaded(createMockDto());

    const mockApi = createMockElectronAPI({
      translateBatch: vi.fn().mockImplementation(
        () => new Promise<Record<string, string>>(() => {})
      ),
    });

    const { unmount } = render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar interBatchDelayMs={0} />
      </SaveEditorStoreProvider>
    );

    const translateBtn = screen.getByRole('button', {
      name: /translate save fields/i,
    });
    fireEvent.click(translateBtn);
    expect(store.getSnapshot().isTranslating).toBe(true);

    unmount();

    expect(mockApi.cancelTranslateBatch).toHaveBeenCalledTimes(1);
    expect(mockApi.cancelTranslateBatch).toHaveBeenCalledWith({
      jobId: expect.stringContaining('file1.rpgsave_'),
    });
  });

  it('renders Translate label inside .translate-btn and reloads active save file from disk via .refresh-save-btn', async () => {
    const store = createSaveEditorStore('game-1');
    const dto = createMockDto('slot1.sav', [
      { id: 'variables:1', tabId: 'variables', key: '1', label: 'Gold', value: 100, type: 'number' },
    ]);
    store.setFileLoaded(dto);

    const reloadedDto = createMockDto('slot1.sav', [
      { id: 'variables:1', tabId: 'variables', key: '1', label: 'Gold', value: 999, type: 'number' },
    ]);
    const mockApi = createMockElectronAPI({
      loadSaveData: vi.fn().mockResolvedValue(reloadedDto),
    });

    render(
      <SaveEditorStoreProvider store={store} electronAPI={mockApi}>
        <SaveEditorSearchBar />
      </SaveEditorStoreProvider>
    );

    const translateBtn = screen.getByRole('button', { name: /translate save fields/i });
    expect(translateBtn).toHaveTextContent('Translate');

    const reloadBtn = screen.getByRole('button', { name: /reload from disk/i });
    expect(reloadBtn).toHaveClass('refresh-save-btn');
    await act(async () => {
      fireEvent.click(reloadBtn);
      await flushPromises();
    });

    expect(mockApi.loadSaveData).toHaveBeenCalledWith({
      gameKey: 'game-1',
      fileName: 'slot1.sav',
    });
    expect(store.getSnapshot().pristineFieldsById.get('variables:1')?.value).toBe(999);
  });
});
