import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector';
import type {
  NormalizedSaveDto,
  SaveFieldDto,
  SaveFieldScalar,
  SaveUpdatesPayload,
} from '@yumeshelf/engine/types';
import type { ElectronAPI } from '../../../shared/types/ipc';

export type SaveFileStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'loading'; readonly fileName: string; readonly percent?: number }
  | { readonly state: 'loaded'; readonly dto: NormalizedSaveDto }
  | { readonly state: 'error'; readonly fileName: string; readonly errorMessage: string };

export type SaveOperationStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'saving' }
  | { readonly state: 'saved' }
  | { readonly state: 'error'; readonly errorMessage: string };

export interface SaveEditorStoreState {
  readonly gameKey: string;
  fileStatus: SaveFileStatus;
  saveStatus: SaveOperationStatus;
  activeTabId: string;
  searchQuery: string;
  translations: Record<string, string>;
  isTranslating: boolean;
  isMutatingFile: boolean;
  modifiedFields: SaveUpdatesPayload;
  dirtyKeys: Set<string>;
  pristineFieldsByTab: Map<string, SaveFieldDto[]>;
  pristineFieldsById: Map<string, SaveFieldDto>;
}

export interface SaveEditorStoreSnapshot {
  readonly gameKey: string;
  readonly fileStatus: SaveFileStatus;
  readonly saveStatus: SaveOperationStatus;
  readonly activeTabId: string;
  readonly searchQuery: string;
  readonly translations: Readonly<Record<string, string>>;
  readonly isTranslating: boolean;
  readonly isMutatingFile: boolean;
  readonly dirtyKeys: ReadonlySet<string>;
  readonly modifiedFields: Readonly<SaveUpdatesPayload>;
  readonly pristineFieldsByTab: ReadonlyMap<string, readonly SaveFieldDto[]>;
  readonly pristineFieldsById: ReadonlyMap<string, SaveFieldDto>;
}

export interface ObservableSaveEditorStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SaveEditorStoreSnapshot;
  setFileLoading(fileName: string): void;
  setFileProgress(fileName: string, percent?: number): void;
  setFileLoaded(dto: NormalizedSaveDto): void;
  setFileError(fileName: string, errorMessage: string): void;
  setFileIdle(): void;
  renameActiveFile(newFileName: string, expectedCurrentName?: string): void;
  setMutatingFile(isMutating: boolean): void;
  setActiveTab(tabId: string): void;
  setSearchQuery(query: string): void;
  setTranslations(newTranslations: Record<string, string>): void;
  hydrateTranslations(translations: Record<string, string>): void;
  setTranslating(isTranslating: boolean): void;
  updateField(fieldId: string, value: unknown): void;
  resetField(fieldId: string): void;
  clearDirty(): void;
  setSaving(): void;
  setSaved(committedUpdates: SaveUpdatesPayload, fileName: string): void;
  setSaveError(errorMessage: string, fileName?: string): void;
}

export interface SaveEditorActionDispatchers {
  setFileLoading: (fileName: string) => void;
  setFileProgress: (fileName: string, percent?: number) => void;
  setFileLoaded: (dto: NormalizedSaveDto) => void;
  setFileError: (fileName: string, errorMessage: string) => void;
  setFileIdle: () => void;
  renameActiveFile: (newFileName: string, expectedCurrentName?: string) => void;
  setMutatingFile: (isMutating: boolean) => void;
  setActiveTab: (tabId: string) => void;
  setSearchQuery: (query: string) => void;
  setTranslations: (translations: Record<string, string>) => void;
  hydrateTranslations: (translations: Record<string, string>) => void;
  setTranslating: (isTranslating: boolean) => void;
  updateField: (key: string, value: unknown) => void;
  resetField: (key: string) => void;
  clearDirty: () => void;
  setSaving: () => void;
  setSaved: (committedUpdates: SaveUpdatesPayload, fileName: string) => void;
  setSaveError: (errorMessage: string, fileName?: string) => void;
}

export type SaveEditorContextValue = ObservableSaveEditorStore;

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeTranslationsMap(input: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input)) {
      if (!DANGEROUS_KEYS.has(k) && typeof v === 'string') {
        const normKey = k.normalize('NFC');
        if (!DANGEROUS_KEYS.has(normKey)) {
          clean[normKey] = v.normalize('NFC');
        }
      }
    }
  }
  return clean;
}

class SaveEditorStore implements ObservableSaveEditorStore {
  private readonly gameKey: string;
  private fileStatus: SaveFileStatus = { state: 'idle' };
  private saveStatus: SaveOperationStatus = { state: 'idle' };
  private activeTabId = '';
  private searchQuery = '';
  private translations: Record<string, string> = {};
  private isTranslating = false;
  private isMutatingFile = false;
  private modifiedFields: SaveUpdatesPayload = {};
  private readonly dirtyKeys = new Set<string>();
  private pristineFieldsByTab = new Map<string, SaveFieldDto[]>();
  private pristineFieldsById = new Map<string, SaveFieldDto>();
  private readonly listeners = new Set<() => void>();
  private currentSnapshot: SaveEditorStoreSnapshot;

  constructor(gameKey: string) {
    this.gameKey = gameKey;
    this.currentSnapshot = this.buildSnapshot();
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
  }

  private buildSnapshot(): SaveEditorStoreSnapshot {
    return {
      gameKey: this.gameKey,
      fileStatus: this.fileStatus,
      saveStatus: this.saveStatus,
      activeTabId: this.activeTabId,
      searchQuery: this.searchQuery,
      translations: { ...this.translations },
      isTranslating: this.isTranslating,
      isMutatingFile: this.isMutatingFile,
      dirtyKeys: new Set(this.dirtyKeys),
      modifiedFields: { ...this.modifiedFields },
      pristineFieldsByTab: this.pristineFieldsByTab,
      pristineFieldsById: this.pristineFieldsById,
    };
  }

  private invalidateSnapshot(): void {
    this.currentSnapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): SaveEditorStoreSnapshot {
    return this.currentSnapshot;
  }

  setFileLoading(fileName: string): void {
    this.modifiedFields = {};
    this.dirtyKeys.clear();
    this.searchQuery = '';
    this.isTranslating = false;
    this.isMutatingFile = false;
    this.pristineFieldsById = new Map();
    this.pristineFieldsByTab = new Map();
    this.saveStatus = { state: 'idle' };
    this.fileStatus = { state: 'loading', fileName };
    this.invalidateSnapshot();
  }

  setFileProgress(fileName: string, percent?: number): void {
    const clampedPercent =
      typeof percent === 'number' && Number.isFinite(percent)
        ? Math.max(0, Math.min(100, Math.round(percent)))
        : undefined;
    this.fileStatus = { state: 'loading', fileName, percent: clampedPercent };
    this.invalidateSnapshot();
  }

  setFileLoaded(dto: NormalizedSaveDto): void {
    const normalizedFields = (dto.fields || []).map((f) => ({
      ...f,
      label: (f.label || '').normalize('NFC'),
    }));
    this.pristineFieldsById = new Map(normalizedFields.map((f) => [f.id, f]));
    this.pristineFieldsByTab = new Map();
    for (const field of normalizedFields) {
      const tabId = field.tabId || 'general';
      const list = this.pristineFieldsByTab.get(tabId) || [];
      list.push(field);
      this.pristineFieldsByTab.set(tabId, list);
    }

    this.modifiedFields = {};
    this.dirtyKeys.clear();
    this.searchQuery = '';
    this.isTranslating = false;
    this.isMutatingFile = false;

    const tabs = dto.tabs || [];
    const hasValidActiveTab =
      Boolean(this.activeTabId) && tabs.some((t) => t.id === this.activeTabId);
    if (!hasValidActiveTab) {
      this.activeTabId = tabs[0]?.id || '';
    }

    this.fileStatus = {
      state: 'loaded',
      dto: { ...dto, fields: normalizedFields },
    };
    this.saveStatus = { state: 'idle' };
    this.invalidateSnapshot();
  }

  setFileError(fileName: string, errorMessage: string): void {
    this.fileStatus = { state: 'error', fileName, errorMessage };
    this.invalidateSnapshot();
  }

  setFileIdle(): void {
    this.fileStatus = { state: 'idle' };
    this.saveStatus = { state: 'idle' };
    this.isTranslating = false;
    this.isMutatingFile = false;
    this.searchQuery = '';
    this.modifiedFields = {};
    this.dirtyKeys.clear();
    this.pristineFieldsById = new Map();
    this.pristineFieldsByTab = new Map();
    this.invalidateSnapshot();
  }

  renameActiveFile(newFileName: string, expectedCurrentName?: string): void {
    if (
      this.fileStatus.state !== 'loaded' ||
      !newFileName ||
      typeof newFileName !== 'string'
    ) {
      return;
    }

    if (expectedCurrentName !== undefined) {
      if (
        typeof expectedCurrentName !== 'string' ||
        this.fileStatus.dto.fileName !== expectedCurrentName.trim().normalize('NFC')
      ) {
        return;
      }
    }

    const trimmed = newFileName.trim().normalize('NFC');
    if (!trimmed || trimmed === this.fileStatus.dto.fileName) {
      return;
    }

    this.fileStatus = {
      state: 'loaded',
      dto: { ...this.fileStatus.dto, fileName: trimmed },
    };
    this.invalidateSnapshot();
  }

  setMutatingFile(isMutating: boolean): void {
    const next = Boolean(isMutating);
    if (this.isMutatingFile === next) {
      return;
    }
    this.isMutatingFile = next;
    this.invalidateSnapshot();
  }

  setActiveTab(tabId: string): void {
    if (this.activeTabId === tabId) {
      return;
    }
    this.activeTabId = tabId;
    this.invalidateSnapshot();
  }

  setSearchQuery(query: string): void {
    if (this.searchQuery === query) {
      return;
    }
    this.searchQuery = query;
    this.invalidateSnapshot();
  }

  setTranslating(isTranslating: boolean): void {
    const next = Boolean(isTranslating);
    if (this.isTranslating === next) {
      return;
    }
    this.isTranslating = next;
    this.invalidateSnapshot();
  }

  setTranslations(newTranslations: Record<string, string>): void {
    const clean = sanitizeTranslationsMap(newTranslations);
    this.translations = { ...this.translations, ...clean };
    this.invalidateSnapshot();
  }

  hydrateTranslations(translations: Record<string, string>): void {
    const clean = sanitizeTranslationsMap(translations);
    this.translations = { ...this.translations, ...clean };
    this.invalidateSnapshot();
  }

  updateField(fieldId: string, value: unknown): void {
    const pristine = this.pristineFieldsById.get(fieldId);
    if (!pristine) {
      return;
    }

    let normalizedVal: SaveFieldScalar;

    if (pristine.type === 'number') {
      if (typeof value === 'string') {
        if (value.trim() === '') {
          return;
        }
      } else if (typeof value !== 'number') {
        return;
      }
      const coerced = Number(value);
      if (!Number.isFinite(coerced)) {
        return;
      }
      normalizedVal = Object.is(coerced, -0) ? 0 : coerced;
    } else if (pristine.type === 'boolean') {
      normalizedVal = typeof value === 'string' ? value === 'true' : Boolean(value);
    } else {
      normalizedVal = String(value);
    }

    if (Object.is(normalizedVal, pristine.value)) {
      delete this.modifiedFields[fieldId];
      this.dirtyKeys.delete(fieldId);
    } else {
      this.modifiedFields[fieldId] = normalizedVal;
      this.dirtyKeys.add(fieldId);
    }

    if (this.saveStatus.state === 'saved') {
      this.saveStatus = { state: 'idle' };
    }

    this.invalidateSnapshot();
  }

  resetField(fieldId: string): void {
    delete this.modifiedFields[fieldId];
    this.dirtyKeys.delete(fieldId);
    this.invalidateSnapshot();
  }

  clearDirty(): void {
    this.modifiedFields = {};
    this.dirtyKeys.clear();
    this.invalidateSnapshot();
  }

  setSaving(): void {
    this.saveStatus = { state: 'saving' };
    this.invalidateSnapshot();
  }

  setSaved(committedUpdates: SaveUpdatesPayload, fileName: string): void {
    if (
      this.fileStatus.state !== 'loaded' ||
      this.fileStatus.dto.fileName !== fileName
    ) {
      return;
    }

    for (const [key, committedVal] of Object.entries(committedUpdates)) {
      const prevPristine = this.pristineFieldsById.get(key);
      if (!prevPristine) continue;
      const currentEffectiveVal = this.dirtyKeys.has(key)
        ? this.modifiedFields[key]
        : prevPristine.value;

      if (Object.is(currentEffectiveVal, committedVal)) {
        delete this.modifiedFields[key];
        this.dirtyKeys.delete(key);
      } else {
        this.modifiedFields[key] = currentEffectiveVal;
        this.dirtyKeys.add(key);
      }
    }

    const committedFields = this.fileStatus.dto.fields.map((field) =>
      Object.prototype.hasOwnProperty.call(committedUpdates, field.id) &&
      committedUpdates[field.id] !== null &&
      committedUpdates[field.id] !== undefined
        ? { ...field, value: committedUpdates[field.id] as number | string | boolean }
        : field
    );
    this.fileStatus = {
      state: 'loaded',
      dto: { ...this.fileStatus.dto, fields: committedFields },
    };
    this.pristineFieldsById = new Map(committedFields.map((f) => [f.id, f]));

    this.pristineFieldsByTab = new Map();
    for (const field of committedFields) {
      const tabId = field.tabId || 'general';
      const list = this.pristineFieldsByTab.get(tabId) || [];
      list.push(field);
      this.pristineFieldsByTab.set(tabId, list);
    }

    this.saveStatus = this.dirtyKeys.size === 0 ? { state: 'saved' } : { state: 'idle' };
    this.invalidateSnapshot();
  }

  setSaveError(errorMessage: string, fileName?: string): void {
    if (
      fileName !== undefined &&
      (this.fileStatus.state !== 'loaded' || this.fileStatus.dto.fileName !== fileName)
    ) {
      return;
    }
    this.saveStatus = { state: 'error', errorMessage };
    this.invalidateSnapshot();
  }
}

export function createSaveEditorStore(gameKey: string): ObservableSaveEditorStore {
  return new SaveEditorStore(gameKey);
}

export const SaveEditorStoreContext = createContext<ObservableSaveEditorStore | null>(null);
export const SaveEditorDispatchContext = createContext<SaveEditorActionDispatchers | null>(null);
export const SaveEditorElectronApiContext = createContext<ElectronAPI | undefined>(undefined);

export interface SaveEditorStoreProviderProps {
  gameKey?: string;
  store?: ObservableSaveEditorStore;
  electronAPI?: ElectronAPI;
  children: React.ReactNode;
}

export function SaveEditorStoreProvider({
  gameKey,
  store,
  electronAPI,
  children,
}: SaveEditorStoreProviderProps): React.JSX.Element {
  const resolvedStore = useMemo(
    () => store ?? createSaveEditorStore(gameKey ?? ''),
    [store, gameKey]
  );
  const dispatchers: SaveEditorActionDispatchers = useMemo(
    () => ({
      setFileLoading: (fileName) => resolvedStore.setFileLoading(fileName),
      setFileProgress: (fileName, percent) => resolvedStore.setFileProgress(fileName, percent),
      setFileLoaded: (dto) => resolvedStore.setFileLoaded(dto),
      setFileError: (fileName, errorMessage) =>
        resolvedStore.setFileError(fileName, errorMessage),
      setFileIdle: () => resolvedStore.setFileIdle(),
      setActiveTab: (tabId) => resolvedStore.setActiveTab(tabId),
      setSearchQuery: (query) => resolvedStore.setSearchQuery(query),
      setTranslations: (translations) => resolvedStore.setTranslations(translations),
      hydrateTranslations: (translations) => resolvedStore.hydrateTranslations(translations),
      setTranslating: (isTranslating) => resolvedStore.setTranslating(isTranslating),
      setMutatingFile: (isMutating) => resolvedStore.setMutatingFile(isMutating),
      renameActiveFile: (newFileName, expectedCurrentName) =>
        resolvedStore.renameActiveFile(newFileName, expectedCurrentName),
      updateField: (key, value) => resolvedStore.updateField(key, value),
      resetField: (key) => resolvedStore.resetField(key),
      clearDirty: () => resolvedStore.clearDirty(),
      setSaving: () => resolvedStore.setSaving(),
      setSaved: (committedUpdates, fileName) =>
        resolvedStore.setSaved(committedUpdates, fileName),
      setSaveError: (errorMessage, fileName) =>
        resolvedStore.setSaveError(errorMessage, fileName),
    }),
    [resolvedStore]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (resolvedStore.getSnapshot().dirtyKeys.size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [resolvedStore]);

  return React.createElement(
    SaveEditorElectronApiContext.Provider,
    { value: electronAPI },
    React.createElement(
      SaveEditorStoreContext.Provider,
      { value: resolvedStore },
      React.createElement(
        SaveEditorDispatchContext.Provider,
        { value: dispatchers },
        children
      )
    )
  );
}

export function useSaveEditorSelector<T>(
  selector: (state: SaveEditorStoreSnapshot) => T,
  isEqual?: (a: T, b: T) => boolean
): T {
  const store = useContext(SaveEditorStoreContext);
  if (!store) {
    throw new Error('useSaveEditorSelector must be used within a SaveEditorStoreProvider');
  }
  return useSyncExternalStoreWithSelector(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
    selector,
    isEqual
  );
}

export function useSaveFileStatus(): SaveFileStatus {
  return useSaveEditorSelector((s) => s.fileStatus);
}

export function useSaveOperationStatus(): SaveOperationStatus {
  return useSaveEditorSelector((s) => s.saveStatus);
}

export function useActiveSaveTabId(): string {
  return useSaveEditorSelector((s) => s.activeTabId);
}

export function useSaveSearchQuery(): string {
  return useSaveEditorSelector((s) => s.searchQuery);
}

export function useSaveTranslations(): Readonly<Record<string, string>> {
  return useSaveEditorSelector((s) => s.translations);
}

export function useIsTranslating(): boolean {
  return useSaveEditorSelector((s) => s.isTranslating);
}

export function useIsMutatingFile(): boolean {
  return useSaveEditorSelector((s) => s.isMutatingFile);
}

export function useSaveModifiedFields(): Readonly<SaveUpdatesPayload> {
  return useSaveEditorSelector((s) => s.modifiedFields);
}

export function useSaveDirtyKeys(): ReadonlySet<string> {
  return useSaveEditorSelector((s) => s.dirtyKeys);
}

export function useSaveDirtyState(): { dirtyCount: number; isDirty: boolean } {
  return useSaveEditorSelector(
    (s) => ({ dirtyCount: s.dirtyKeys.size, isDirty: s.dirtyKeys.size > 0 }),
    (a, b) => a.dirtyCount === b.dirtyCount && a.isDirty === b.isDirty
  );
}

export function useSaveGameKey(): string {
  return useSaveEditorSelector((s) => s.gameKey);
}

export function useSaveElectronAPI(): ElectronAPI | undefined {
  return (
    useContext(SaveEditorElectronApiContext) ??
    (typeof window !== 'undefined' ? window.electronAPI : undefined)
  );
}

export function useSaveEditorStore(): ObservableSaveEditorStore {
  const store = useContext(SaveEditorStoreContext);
  if (!store) {
    throw new Error('useSaveEditorStore must be used within SaveEditorStoreProvider');
  }
  return store;
}

export function useSaveEditorDispatch(): SaveEditorActionDispatchers {
  const dispatch = useContext(SaveEditorDispatchContext);
  if (!dispatch) {
    throw new Error('useSaveEditorDispatch must be used within SaveEditorStoreProvider');
  }
  return dispatch;
}

const EMPTY_PRISTINE_FIELDS: readonly SaveFieldDto[] = [];

export function useActiveTabPristineFields(): readonly SaveFieldDto[] {
  return useSaveEditorSelector((s) => {
    if (s.fileStatus.state !== 'loaded' || !s.pristineFieldsByTab) {
      return EMPTY_PRISTINE_FIELDS;
    }
    return s.pristineFieldsByTab.get(s.activeTabId) ?? EMPTY_PRISTINE_FIELDS;
  });
}

export function getTranslation(
  translations: Record<string, string> | null | undefined,
  normLabel: string
): string | undefined {
  return translations != null &&
    Object.hasOwn(translations, normLabel) &&
    typeof translations[normLabel] === 'string'
    ? translations[normLabel]
    : undefined;
}

export function useActiveTabFields(): readonly SaveFieldDto[] {
  const tabFields = useActiveTabPristineFields();
  const query = useSaveSearchQuery().trim().toLowerCase().normalize('NFC');
  const translations = useSaveTranslations();

  return useMemo(() => {
    if (!query) return tabFields;

    return tabFields.filter((f) => {
      const normLabel = (f.label || '').normalize('NFC');
      const effectiveLabel = (getTranslation(translations, normLabel) || normLabel).toLowerCase();
      const rawLabel = normLabel.toLowerCase();
      const key = (f.key || '').normalize('NFC').toLowerCase();
      const valStr =
        f.value !== null && f.value !== undefined
          ? String(f.value).toLowerCase().normalize('NFC')
          : '';
      return (
        effectiveLabel.includes(query) ||
        rawLabel.includes(query) ||
        key.includes(query) ||
        valStr.includes(query)
      );
    });
  }, [tabFields, query, translations]);
}
