import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ElectronAPI } from '../../../shared/types/ipc';
import type { PlatformInput } from '../../../shared/path-subsumption';
import { sanitizeUserPaths } from '../../../shared/path-sanitizer';
import type { CategoryNode } from '../../domain/category-tree';
import { flattenCategoryTree } from '../../domain/category-tree';
import { annotateGamesForDisplay } from '../../game-annotations';
import { useLibrarySelector, useLibraryStore } from '../../hooks/useLibraryState';
import {
  LANGUAGE_CHANGED_EVENT,
  sortLanguageOptions,
  useLocaleStrings,
} from '../../i18n/locale-strings';
import { useNotification } from '../../providers/NotificationProvider';
import {
  MASCOT_STORAGE_KEYS,
  normalizeHideAndSeekMode,
  normalizeMascotScale,
  normalizeMascotSound,
  normalizeMascotVolume,
  parseMascotPreferences,
  type HideAndSeekMode,
  type MascotPreferencesState,
} from '../../mascot/mascot-domain';
import {
  useOptionalMascot,
  type MascotPreferencesPatch,
} from '../../providers/MascotProvider';
import type { UiStorageAdapter } from '../../state/ui-runtime-state';
import type { LibraryConfig } from '../../types/game';
import { applyTheme } from '../../utils/theme';
import { AboutContent } from './AboutContent';
import { Modal } from './Modal';
import { SettingsGeneralTab } from './SettingsGeneralTab';
import { SettingsLibraryTab } from './SettingsLibraryTab';
import { SettingsMascotTab } from './SettingsMascotTab';
import { SettingsSystemTab, type MascotPreferences } from './SettingsSystemTab';
import { SettingsUpdatesTab } from './SettingsUpdatesTab';

export type { MascotPreferences };

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
  electronAPI?: ElectronAPI;
  storage?: UiStorageAdapter;
  targetPlatform?: PlatformInput;
  /** Optional timeout in ms for rescan inactivity watchdog (default: 30000ms; 0 disables) */
  rescanInactivityTimeoutMs?: number;
  /** Optional callback when library directories are modified */
  onLibraryPathsUpdated?: (paths: string[]) => void;
  /** Optional callback when category hierarchy is modified */
  onCategoryTreeUpdated?: (tree: readonly CategoryNode[]) => void;
  /** Declarative callback when mascot widget preferences are modified */
  onMascotSettingsChanged?: (settings: MascotPreferences) => void;
  /** Callback to open language pack modal */
  onOpenLanguagePack?: () => void;
  /** Callback to open about modal */
  onOpenAbout?: () => void;
}

type SettingsTabId = 'general' | 'library' | 'system' | 'mascot' | 'updates' | 'about';
type AsyncStatus = 'idle' | 'submitting' | 'success' | 'error';

const SETTINGS_TABS: readonly { id: SettingsTabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'library', label: 'Library & Categories' },
  { id: 'system', label: 'System' },
  { id: 'mascot', label: 'Yume-chan' },
  { id: 'updates', label: 'Updates' },
  { id: 'about', label: 'About' },
];

function getDefaultStorage(): UiStorageAdapter | undefined {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return undefined;
}

export function SettingsModal({
  isOpen,
  onClose,
  fallbackFocusRef,
  electronAPI,
  storage,
  targetPlatform,
  rescanInactivityTimeoutMs,
  onLibraryPathsUpdated,
  onCategoryTreeUpdated,
  onMascotSettingsChanged,
  onOpenLanguagePack,
  onOpenAbout,
}: SettingsModalProps): React.JSX.Element {
  const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);
  const resolvedStorage = storage ?? getDefaultStorage();

  const store = useLibraryStore();
  const strings = useLocaleStrings(resolvedStorage);
  const config = useLibrarySelector((s) => s.currentLibraryConfig);
  const categoryTree = useLibrarySelector((s) => s.categoryTree);
  const locationDisplayMode = useLibrarySelector((s) => s.locationDisplayMode);
  const { showToast } = useNotification();

  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [appVersion, setAppVersion] = useState<string>('');

  // General / Interface preferences
  const [theme, setTheme] = useState<string>(() => resolvedStorage?.getItem('yumeshelf_theme') || 'system');
  const [language, setLanguage] = useState<string>(
    () => resolvedStorage?.getItem('yumeshelf_lang') || 'en'
  );
  const [installedLanguages, setInstalledLanguages] = useState<
    Array<{ code: string; label: string }>
  >([{ code: 'en', label: 'English' }]);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);

  // Updates preferences
  const [appUpdateMode, setAppUpdateMode] = useState<string>(
    () => resolvedStorage?.getItem('yumeshelf_app_updates_pref') || 'notify'
  );
  const [langPackUpdateMode, setLangPackUpdateMode] = useState<string>(
    () => resolvedStorage?.getItem('yumeshelf_language_pack_updates_pref') || 'automatic'
  );

  // Mascot preferences
  const mascot = useOptionalMascot();
  const [standaloneMascotPrefs, setStandaloneMascotPrefs] = useState<MascotPreferencesState>(() =>
    parseMascotPreferences(resolvedStorage)
  );
  const mascotShow = mascot ? mascot.show : standaloneMascotPrefs.show;
  const hideAndSeek = mascot ? mascot.hideAndSeek : standaloneMascotPrefs.hideAndSeek;
  const mascotScale = mascot ? mascot.scale : standaloneMascotPrefs.scale;
  const mascotSound = mascot ? mascot.sound : standaloneMascotPrefs.sound;
  const mascotVolume = mascot ? mascot.volume : standaloneMascotPrefs.volume;

  // Library path & scan state
  const [isMutating, setIsMutating] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isAddingGame, setIsAddingGame] = useState(false);

  // Category creation state
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryCreateStatus, setCategoryCreateStatus] = useState<AsyncStatus>('idle');
  const [categoryCreateError, setCategoryCreateError] = useState<string | null>(null);
  const newCategoryInputRef = useRef<HTMLInputElement | null>(null);

  // Category rename state
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renameCategoryDraft, setRenameCategoryDraft] = useState('');
  const [categoryRenameStatus, setCategoryRenameStatus] = useState<AsyncStatus>('idle');
  const [categoryRenameError, setCategoryRenameError] = useState<string | null>(null);

  // Category deletion confirmation state
  const [pendingDeleteCategoryId, setPendingDeleteCategoryId] = useState<string | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [categoryDeleteError, setCategoryDeleteError] = useState<string | null>(null);

  // Refs for deterministic focus retention & lifecycle guards
  const categoryItemRefs = useRef(new Map<string, HTMLElement>());
  const categoryListContainerRef = useRef<HTMLDivElement | null>(null);
  const deleteTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pathItemRefs = useRef(new Map<string, HTMLElement>());
  const pathListContainerRef = useRef<HTMLDivElement | null>(null);
  const rescanWatchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rescanTokenRef = useRef(0);
  const reorderSeqRef = useRef(0);
  const isMountedRef = useRef(true);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<SettingsTabId, HTMLElement | null>>({
    general: null,
    library: null,
    updates: null,
    system: null,
    mascot: null,
    about: null,
  });

  const jumpToSection = useCallback((id: SettingsTabId) => {
    setActiveTab(id);
    sectionRefs.current[id]?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleSettingsScroll = useCallback(() => {
    const container = scrollBodyRef.current;
    if (!container) return;
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 8) {
      setActiveTab('about');
      return;
    }
    let current: SettingsTabId = 'general';
    for (const tab of SETTINGS_TABS) {
      const el = sectionRefs.current[tab.id];
      if (el && el.offsetTop - container.offsetTop <= container.scrollTop + 32) {
        current = tab.id;
      }
    }
    setActiveTab(current);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (rescanWatchdogTimerRef.current) {
        clearTimeout(rescanWatchdogTimerRef.current);
        rescanWatchdogTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    if (api?.getAppVersion) {
      Promise.resolve(api.getAppVersion())
        .then((ver) => {
          if (active && isMountedRef.current && typeof ver === 'string') {
            setAppVersion(ver);
          }
        })
        .catch(() => {
          // Non-critical metadata fetch
        });
    }
    const loadLanguages = () => {
      if (!api?.getLanguageState) return;
      Promise.resolve(api.getLanguageState())
        .then((state) => {
          if (!active || !isMountedRef.current || !state) return;
          const items = sortLanguageOptions(state.builtIn, state.installed);
          if (items.length > 0) {
            setInstalledLanguages(items);
          }
        })
        .catch(() => {
          // Non-critical language list fetch
        });
    };

    loadLanguages();

    const handleLangChanged = (e: Event) => {
      const code = (e as CustomEvent<{ code?: string }>).detail?.code;
      if (typeof code === 'string' && code.trim()) {
        setLanguage(code.trim());
      }
      loadLanguages();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(LANGUAGE_CHANGED_EVENT, handleLangChanged);
    }

    return () => {
      active = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener(LANGUAGE_CHANGED_EVENT, handleLangChanged);
      }
    };
  }, [isOpen, api]);

  useEffect(() => {
    if (isCreatingCategory) {
      newCategoryInputRef.current?.focus();
    }
  }, [isCreatingCategory]);

  const flattenedCategories = useMemo(() => flattenCategoryTree(categoryTree), [categoryTree]);

  const libraryPaths = config?.libraryPaths ?? [];
  const maxDepth = typeof config?.maxDepth === 'number' ? config.maxDepth : 5;
  const titleDisplayMode = config?.titleDisplayMode ?? 'metadata';
  const displayProductCodes = Boolean(config?.displayProductCodes);
  const autoAllowLargeSaves = Boolean(config?.autoAllowLargeSaves);
  const autoLaunchValue =
    config?.autoLaunch === 'minimized' ? 'minimized' : config?.autoLaunch ? 'on' : 'off';
  const minimizeToTray = Boolean(config?.minimizeToTray);
  const exposeBetaOptions = Boolean(config?.exposeBetaOptions);

  // --- Handlers: General / Interface ---

  const handleThemeChange = (nextTheme: string) => {
    const resolved = applyTheme(nextTheme, resolvedStorage);
    setTheme(resolved);
    showToast('Theme updated');
  };

  const handleLanguageChange = (nextLang: string) => {
    setLanguage(nextLang);
    resolvedStorage?.setItem('yumeshelf_lang', nextLang);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('yumeshelf:language-changed', { detail: { code: nextLang } })
      );
    }
    showToast('Language updated');
  };

  const handleLocationDisplayModeChange = (nextMode: 'parent' | 'full') => {
    resolvedStorage?.setItem('yumeshelf_location_display_mode', nextMode);
    store.setLocationDisplayMode(nextMode);
    const snapshot = store.getSnapshot();
    store.setAllGames(
      annotateGamesForDisplay(
        [...snapshot.allGames],
        snapshot.currentLibraryConfig ?? '',
        nextMode
      )
    );
    showToast('Location display updated');
  };

  const handleUpdateDisplayConfig = async (updates: {
    titleDisplayMode?: 'metadata' | 'legacy_folder';
    displayProductCodes?: boolean;
    autoAllowLargeSaves?: boolean;
  }) => {
    if (isUpdatingConfig) return;
    setIsUpdatingConfig(true);
    try {
      const updatedConfig = await api?.updateLibraryConfig?.(updates);
      const nextConfig: LibraryConfig = updatedConfig ?? {
        ...(config ?? {
          libraryPaths: [],
          libraryPath: '',
          maxDepth: 5,
          autoLaunch: false,
          minimizeToTray: false,
        }),
        ...updates,
      };
      store.setCurrentLibraryConfig(nextConfig);
      const rawGames = await api?.getGames?.();
      if (Array.isArray(rawGames)) {
        store.setAllGames(
          annotateGamesForDisplay(
            rawGames,
            nextConfig,
            store.getSnapshot().locationDisplayMode
          )
        );
      }
      showToast('Display settings updated');
    } catch (err) {
      console.error('[SettingsModal] Failed to update display config:', {
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      showToast('Failed to update display settings');
    } finally {
      if (isMountedRef.current) {
        setIsUpdatingConfig(false);
      }
    }
  };

  const handleMaxDepthChange = async (nextDepth: number) => {
    if (isUpdatingConfig) return;
    setIsUpdatingConfig(true);
    try {
      const updatedConfig = await api?.updateLibraryConfig?.({ maxDepth: nextDepth });
      const nextConfig: LibraryConfig = updatedConfig ?? {
        ...(config ?? {
          libraryPaths: [],
          libraryPath: '',
          maxDepth: nextDepth,
          autoLaunch: false,
          minimizeToTray: false,
        }),
        maxDepth: nextDepth,
      };
      store.setCurrentLibraryConfig(nextConfig);
      showToast('Max scan depth updated');
    } catch (err) {
      console.error('[SettingsModal] Failed to update max depth:', {
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      showToast('Failed to update max scan depth');
    } finally {
      if (isMountedRef.current) {
        setIsUpdatingConfig(false);
      }
    }
  };

  // --- Handlers: Library Paths & Rescan Watchdog ---

  const handleAddLibraryPath = async () => {
    if (isMutating || isScanning) return;
    let updatedConfig: LibraryConfig | null = null;
    setIsMutating(true);
    try {
      // 1. Native OS picker runs in Main process; returns null if cancelled
      updatedConfig = (await api?.addLibraryPath?.()) ?? null;
    } catch (err) {
      console.error('[SettingsModal] Failed to add library path:', {
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      showToast('Failed to add library path');
      return;
    } finally {
      if (isMountedRef.current) setIsMutating(false);
    }

    if (!updatedConfig) return; // User cancelled OS picker; zero timer armed

    // 2. Arm watchdog timer & loading state strictly for subsequent scan
    setIsScanning(true);
    const token = ++rescanTokenRef.current;
    const timeoutMs =
      typeof rescanInactivityTimeoutMs === 'number'
        ? rescanInactivityTimeoutMs <= 0
          ? 0
          : rescanInactivityTimeoutMs
        : 30000;

    if (timeoutMs > 0) {
      rescanWatchdogTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && rescanTokenRef.current === token) {
          setIsScanning(false);
          showToast('Library scan taking longer than expected. Continuing in background...');
        }
      }, timeoutMs);
    }

    try {
      const [games, checkedConfig] = await Promise.all([
        api?.getGames?.() ?? [],
        api?.checkConfig?.() ?? updatedConfig,
      ]);
      const resolvedConfig = checkedConfig ?? updatedConfig;
      if (rescanTokenRef.current === token) {
        store.setCurrentLibraryConfig(resolvedConfig);
        store.setAllGames(
          annotateGamesForDisplay(
            games,
            resolvedConfig,
            store.getSnapshot().locationDisplayMode
          )
        );
        onLibraryPathsUpdated?.(resolvedConfig.libraryPaths);
      }
    } catch (err) {
      if (rescanTokenRef.current === token) {
        console.error('[SettingsModal] Library scan failed:', {
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
        showToast('Library scan failed');
      }
    } finally {
      if (rescanWatchdogTimerRef.current) {
        clearTimeout(rescanWatchdogTimerRef.current);
        rescanWatchdogTimerRef.current = null;
      }
      if (isMountedRef.current && rescanTokenRef.current === token) {
        setIsScanning(false);
      }
    }
  };

  const handleRemovePath = async (pathToRemove: string) => {
    if (isMutating || isScanning) return;
    setIsMutating(true);

    const currentPaths = config?.libraryPaths || [];
    const idx = currentPaths.indexOf(pathToRemove);
    const neighbor = currentPaths[idx + 1] ?? currentPaths[idx - 1] ?? null;

    try {
      const updatedConfig = await api?.removeLibraryPath?.(pathToRemove);
      if (updatedConfig) {
        if (isMountedRef.current) {
          if (neighbor && pathItemRefs.current.get(neighbor)) {
            pathItemRefs.current.get(neighbor)?.focus();
          } else {
            pathListContainerRef.current?.focus();
          }
        }
        const [games, tree] = await Promise.all([
          api?.getGames?.() ?? [],
          api?.getCategoryTree?.() ?? [],
        ]);
        store.setCurrentLibraryConfig(updatedConfig);
        store.setCategoryTree(tree);
        store.setAllGames(
          annotateGamesForDisplay(
            games,
            updatedConfig,
            store.getSnapshot().locationDisplayMode
          )
        );
        onLibraryPathsUpdated?.(updatedConfig.libraryPaths);
      }
    } catch (err) {
      console.error('[SettingsModal] Failed to remove library path:', {
        pathToRemove: sanitizeUserPaths(pathToRemove),
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      showToast('Failed to remove library path');
    } finally {
      if (isMountedRef.current) {
        setIsMutating(false);
      }
    }
  };

  const handleChangePath = async (pathToChange: string) => {
    if (isMutating || isScanning) return;
    setIsMutating(true);
    try {
      const updatedConfig = await api?.changeLibraryPath?.(pathToChange);
      if (updatedConfig) {
        const [games, tree] = await Promise.all([
          api?.getGames?.() ?? [],
          api?.getCategoryTree?.() ?? [],
        ]);
        store.setCurrentLibraryConfig(updatedConfig);
        store.setCategoryTree(tree);
        store.setAllGames(
          annotateGamesForDisplay(
            games,
            updatedConfig,
            store.getSnapshot().locationDisplayMode
          )
        );
        onLibraryPathsUpdated?.(updatedConfig.libraryPaths);
      }
    } catch (err) {
      console.error('[SettingsModal] Failed to change library path:', {
        pathToChange: sanitizeUserPaths(pathToChange),
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      showToast('Failed to change library path');
    } finally {
      if (isMountedRef.current) {
        setIsMutating(false);
      }
    }
  };

  const handleReorderPaths = async (newPaths: string[]): Promise<void> => {
    if (isMutating || isScanning) {
      throw new Error('Cannot reorder library paths while another operation is in progress');
    }
    setIsMutating(true);
    const seq = ++reorderSeqRef.current;
    try {
      const updatedConfig = await api?.updateLibraryConfig?.({ libraryPaths: newPaths });
      const latestConfig = store.getSnapshot().currentLibraryConfig;
      if (seq === reorderSeqRef.current) {
        const nextConfig =
          updatedConfig ?? (latestConfig ? { ...latestConfig, libraryPaths: newPaths } : null);
        if (nextConfig) {
          store.setCurrentLibraryConfig(nextConfig);
          onLibraryPathsUpdated?.(nextConfig.libraryPaths);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsMutating(false);
      }
    }
  };

  const handleAddManualGame = async () => {
    if (isMutating || isScanning) return;
    setIsMutating(true);
    setIsAddingGame(true);
    try {
      const res = await api?.addManualGame?.();
      if (!res || res.canceled) return;
      if (!res.ok) {
        const sanitized = res.error ? sanitizeUserPaths(String(res.error)) : 'Failed to add game';
        console.error('[SettingsModal] Failed to add manual game:', { error: sanitized });
        showToast(sanitized);
        return;
      }
      const games = await api?.getGames?.();
      const snapshot = store.getSnapshot();
      if (Array.isArray(games)) {
        store.setAllGames(
          annotateGamesForDisplay(
            games,
            snapshot.currentLibraryConfig ?? '',
            snapshot.locationDisplayMode
          )
        );
      }
      showToast('Game added to library');
    } catch (err) {
      console.error('[SettingsModal] Failed to add manual game:', {
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      showToast('Failed to add game');
    } finally {
      if (isMountedRef.current) {
        setIsAddingGame(false);
        setIsMutating(false);
      }
    }
  };

  // --- Handlers: Categories ---

  const validateCategoryName = (rawName: string, excludeId?: string): string | null => {
    const trimmed = rawName.trim();
    if (!trimmed) {
      return 'Category name cannot be empty';
    }
    const lower = trimmed.toLowerCase();
    const isDuplicate = flattenedCategories.some(
      (cat) => cat.id !== excludeId && cat.name.trim().toLowerCase() === lower
    );
    if (isDuplicate) {
      return 'A category with this name already exists';
    }
    return null;
  };

  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (categoryCreateStatus === 'submitting') return;

    const validationError = validateCategoryName(newCategoryName);
    if (validationError) {
      setCategoryCreateError(validationError);
      setCategoryCreateStatus('error');
      showToast(validationError);
      return;
    }

    setCategoryCreateStatus('submitting');
    setCategoryCreateError(null);
    const trimmedName = newCategoryName.trim();

    try {
      const res = await api?.createCategory?.({ name: trimmedName });
      if (!res?.ok) {
        const reason = sanitizeUserPaths(res?.reason || res?.error || 'Failed to create category');
        if (isMountedRef.current) {
          setCategoryCreateStatus('error');
          setCategoryCreateError(reason);
        }
        showToast(reason);
        return;
      }
      const updatedTree = res.tree ?? res.categoryTree;
      if (Array.isArray(updatedTree)) {
        store.setCategoryTree(updatedTree);
        onCategoryTreeUpdated?.(updatedTree);
      }
      if (isMountedRef.current) {
        setCategoryCreateStatus('success');
        setNewCategoryName('');
        setIsCreatingCategory(false);
      }
      showToast('Category created');
    } catch (err) {
      const reason = sanitizeUserPaths(err instanceof Error ? err.message : String(err));
      console.error('[SettingsModal] Failed to create category:', {
        error: reason,
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      if (isMountedRef.current) {
        setCategoryCreateStatus('error');
        setCategoryCreateError(reason || 'Failed to create category');
      }
      showToast(reason || 'Failed to create category');
    }
  };

  const handleRenameCategorySubmit = async (e: React.FormEvent, categoryId: string) => {
    e.preventDefault();
    if (categoryRenameStatus === 'submitting') return;

    const validationError = validateCategoryName(renameCategoryDraft, categoryId);
    if (validationError) {
      setCategoryRenameError(validationError);
      setCategoryRenameStatus('error');
      showToast(validationError);
      return;
    }

    setCategoryRenameStatus('submitting');
    setCategoryRenameError(null);
    const trimmedName = renameCategoryDraft.trim();

    try {
      const res = await api?.renameCategory?.({ categoryId, name: trimmedName });
      if (!res?.ok) {
        const reason = sanitizeUserPaths(res?.reason || res?.error || 'Failed to rename category');
        if (isMountedRef.current) {
          setCategoryRenameStatus('error');
          setCategoryRenameError(reason);
        }
        showToast(reason);
        return;
      }
      const updatedTree = res.tree ?? res.categoryTree;
      if (Array.isArray(updatedTree)) {
        store.setCategoryTree(updatedTree);
        onCategoryTreeUpdated?.(updatedTree);
      }
      if (isMountedRef.current) {
        setCategoryRenameStatus('success');
        setRenamingCategoryId(null);
        setRenameCategoryDraft('');
      }
      showToast('Category renamed');
    } catch (err) {
      const reason = sanitizeUserPaths(err instanceof Error ? err.message : String(err));
      console.error('[SettingsModal] Failed to rename category:', {
        categoryId,
        error: reason,
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      if (isMountedRef.current) {
        setCategoryRenameStatus('error');
        setCategoryRenameError(reason || 'Failed to rename category');
      }
      showToast(reason || 'Failed to rename category');
    }
  };

  const handleRequestDeleteCategory = (categoryId: string) => {
    setPendingDeleteCategoryId(categoryId);
    setCategoryDeleteError(null);
  };

  const handleCancelDeleteCategory = (categoryId: string) => {
    if (isDeletingCategory) return;
    setPendingDeleteCategoryId(null);
    setCategoryDeleteError(null);
    // Restore focus to delete trigger button that opened prompt
    deleteTriggerRefs.current.get(categoryId)?.focus();
  };

  const handleConfirmDeleteCategory = async (categoryId: string, index: number) => {
    if (isDeletingCategory) return;
    setIsDeletingCategory(true);
    setCategoryDeleteError(null);

    // Resolve adjacent surviving category before deletion mutation
    const survivingCategory = flattenedCategories[index + 1] ?? flattenedCategories[index - 1];

    try {
      const res = await api?.deleteCategory?.(categoryId);
      if (!res?.ok) {
        throw new Error(res?.reason || 'Failed to delete category');
      }
      const updatedTree = res?.tree ?? res?.categoryTree;
      if (updatedTree) {
        store.setCategoryTree(updatedTree);
        onCategoryTreeUpdated?.(updatedTree);
      }
      setPendingDeleteCategoryId(null);
      // Symmetrical focus handoff to adjacent surviving row or container fallback
      queueMicrotask(() => {
        if (survivingCategory && categoryItemRefs.current.get(survivingCategory.id)) {
          categoryItemRefs.current.get(survivingCategory.id)?.focus();
        } else {
          categoryListContainerRef.current?.focus();
        }
      });
    } catch (err) {
      console.error('[SettingsModal] Failed to delete category:', {
        categoryId,
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      setCategoryDeleteError(
        sanitizeUserPaths(err instanceof Error ? err.message : 'Failed to delete category')
      );
    } finally {
      setIsDeletingCategory(false);
    }
  };

  // --- Handlers: Updates & System / Mascot ---

  const handleAppUpdateModeChange = (nextMode: string) => {
    setAppUpdateMode(nextMode);
    resolvedStorage?.setItem('yumeshelf_app_updates_pref', nextMode);
    showToast('App update preference saved');
  };

  const handleLangPackUpdateModeChange = (nextMode: string) => {
    setLangPackUpdateMode(nextMode);
    resolvedStorage?.setItem('yumeshelf_language_pack_updates_pref', nextMode);
    showToast('Language pack update preference saved');
  };

  const handleAutoLaunchChange = async (value: string) => {
    const nextAutoLaunch: boolean | 'minimized' =
      value === 'minimized' ? 'minimized' : value === 'on';
    try {
      await api?.setAutoLaunch?.(nextAutoLaunch);
      const updatedConfig = await api?.updateLibraryConfig?.({ autoLaunch: nextAutoLaunch });
      if (updatedConfig) {
        store.setCurrentLibraryConfig(updatedConfig);
      }
      showToast('Startup setting updated');
    } catch (err) {
      console.error('[SettingsModal] Failed to update auto-launch:', {
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
      });
      showToast('Failed to update startup setting');
    }
  };

  const handleMinimizeToTrayChange = async (enabled: boolean) => {
    try {
      api?.setMinimizeToTray?.(enabled);
      const updatedConfig = await api?.updateLibraryConfig?.({ minimizeToTray: enabled });
      if (updatedConfig) {
        store.setCurrentLibraryConfig(updatedConfig);
      }
      showToast('Tray setting updated');
    } catch (err) {
      console.error('[SettingsModal] Failed to update minimize to tray:', {
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
      });
      showToast('Failed to update tray setting');
    }
  };

  const handleExposeBetaChange = async (enabled: boolean) => {
    try {
      const updatedConfig = await api?.updateLibraryConfig?.({ exposeBetaOptions: enabled });
      if (updatedConfig) {
        store.setCurrentLibraryConfig(updatedConfig);
      }
      showToast('Beta options setting updated');
    } catch (err) {
      console.error('[SettingsModal] Failed to update beta options:', {
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
      });
      showToast('Failed to update beta options');
    }
  };

  const persistStandaloneMascotSetting = (key: string, value: string) => {
    if (!resolvedStorage) return;
    try {
      resolvedStorage.setItem(key, value);
    } catch (err) {
      console.warn('[SettingsModal] Failed to persist mascot setting:', {
        key,
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
    }
  };

  const updateMascotPreferences = (patch: MascotPreferencesPatch) => {
    const nextShow = patch.show ?? mascotShow;
    const nextScale =
      patch.scale !== undefined ? normalizeMascotScale(patch.scale, mascotScale) : mascotScale;
    const nextSound =
      patch.sound !== undefined ? normalizeMascotSound(patch.sound) : mascotSound;
    const nextVolume =
      patch.volume !== undefined ? normalizeMascotVolume(patch.volume, mascotVolume) : mascotVolume;
    const nextHideAndSeek: HideAndSeekMode =
      patch.hideAndSeek !== undefined
        ? normalizeHideAndSeekMode(patch.hideAndSeek)
        : hideAndSeek;

    if (mascot) {
      mascot.updatePreferences(patch);
    } else {
      setStandaloneMascotPrefs({
        show: nextShow,
        scale: nextScale,
        sound: nextSound,
        volume: nextVolume,
        hideAndSeek: nextHideAndSeek,
      });

      if (patch.show !== undefined) {
        persistStandaloneMascotSetting(MASCOT_STORAGE_KEYS.show, nextShow ? 'on' : 'off');
      }
      if (patch.scale !== undefined) {
        persistStandaloneMascotSetting(MASCOT_STORAGE_KEYS.scale, String(nextScale));
      }
      if (patch.sound !== undefined) {
        persistStandaloneMascotSetting(MASCOT_STORAGE_KEYS.sound, nextSound);
      }
      if (patch.volume !== undefined) {
        persistStandaloneMascotSetting(MASCOT_STORAGE_KEYS.volume, String(nextVolume));
      }
      if (patch.hideAndSeek !== undefined) {
        persistStandaloneMascotSetting(MASCOT_STORAGE_KEYS.hideAndSeek, nextHideAndSeek);
      }
    }

    onMascotSettingsChanged?.({
      show: nextShow,
      scale: nextScale,
      sound: nextSound,
      volume: nextVolume,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      modalType="settings"
      id="settings-modal"
      className="settings-overlay"
      panelClassName="settings-panel"
      fallbackFocusRef={fallbackFocusRef}
    >
      <Modal.Header title={strings.settings || 'Settings'} className="settings-header" />

      <div className="settings-shell">
        <nav
          className="settings-sidebar"
          role="tablist"
          aria-orientation="vertical"
          aria-label="Settings sections"
        >
          {SETTINGS_TABS.map((tab) => {
            const isSelected = activeTab === tab.id;
            const tabLabel =
              tab.id === 'general'
                ? strings.settings_tab_general || tab.label
                : tab.id === 'library'
                  ? exposeBetaOptions
                    ? strings.settings_tab_library || tab.label
                    : 'Library'
                  : tab.id === 'updates'
                    ? strings.settings_tab_updates || tab.label
                    : tab.id === 'system'
                      ? strings.settings_tab_system_only || 'System'
                      : tab.id === 'mascot'
                        ? strings.settings_tab_mascot || 'Yume-chan'
                        : strings.settings_tab_about || 'About';
            return (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                type="button"
                role="tab"
                className={`settings-nav-btn${isSelected ? ' active' : ''}`}
                aria-selected={isSelected}
                aria-controls={`settings-panel-${tab.id}`}
                onClick={() => jumpToSection(tab.id)}
              >
                {tabLabel}
              </button>
            );
          })}
        </nav>

        <Modal.Body className="settings-body">
          <div
            ref={scrollBodyRef}
            className="settings-scroll-body"
            onScroll={handleSettingsScroll}
          >
            <section
              ref={(el) => {
                sectionRefs.current.general = el;
              }}
              className="settings-section-block"
            >
              <h3 className="settings-section-heading">
                {strings.settings_tab_general || 'General'}
              </h3>
              <SettingsGeneralTab
                language={language}
                strings={strings}
                theme={theme}
                installedLanguages={installedLanguages}
                onThemeChange={handleThemeChange}
                onLanguageChange={handleLanguageChange}
                onOpenLanguagePack={onOpenLanguagePack}
              />
            </section>

            <div className="favorites-separator-container settings-section-separator" aria-hidden="true">
              <div className="favorites-separator" />
            </div>

            <section
              ref={(el) => {
                sectionRefs.current.library = el;
              }}
              className="settings-section-block"
            >
              <h3 className="settings-section-heading">
                {exposeBetaOptions ? strings.settings_tab_library || 'Library & Categories' : 'Library'}
              </h3>
              <SettingsLibraryTab
                language={language}
                strings={strings}
                libraryPaths={libraryPaths}
                folderAliases={config?.folderAliases}
                targetPlatform={targetPlatform}
                exposeBetaOptions={exposeBetaOptions}
                locationDisplayMode={locationDisplayMode}
                titleDisplayMode={titleDisplayMode}
                displayProductCodes={displayProductCodes}
                maxDepth={maxDepth}
                isUpdatingConfig={isUpdatingConfig}
                onLocationDisplayModeChange={handleLocationDisplayModeChange}
                onUpdateDisplayConfig={(updates) => void handleUpdateDisplayConfig(updates)}
                onMaxDepthChange={(nextDepth) => void handleMaxDepthChange(nextDepth)}
                isMutating={isMutating}
                isScanning={isScanning}
                isAddingGame={isAddingGame}
                onAddLibraryPath={handleAddLibraryPath}
                onAddManualGame={handleAddManualGame}
                onOpenPath={(dirPath) => void api?.openPath?.(dirPath)}
                onChangePath={(dirPath) => void handleChangePath(dirPath)}
                onRemovePath={(dirPath) => void handleRemovePath(dirPath)}
                onReorderPaths={handleReorderPaths}
                onShowToast={showToast}
                pathListContainerRef={pathListContainerRef}
                pathItemRefs={pathItemRefs}
                flattenedCategories={flattenedCategories}
                isCreatingCategory={isCreatingCategory}
                newCategoryName={newCategoryName}
                categoryCreateStatus={categoryCreateStatus}
                categoryCreateError={categoryCreateError}
                newCategoryInputRef={newCategoryInputRef}
                onStartCreateCategory={() => {
                  setIsCreatingCategory(true);
                  setCategoryCreateError(null);
                  setCategoryCreateStatus('idle');
                }}
                onCancelCreateCategory={() => {
                  setIsCreatingCategory(false);
                  setNewCategoryName('');
                  setCategoryCreateError(null);
                  setCategoryCreateStatus('idle');
                }}
                onNewCategoryNameChange={(name) => {
                  setNewCategoryName(name);
                  if (categoryCreateError) setCategoryCreateError(null);
                }}
                onCreateCategorySubmit={handleCreateCategorySubmit}
                renamingCategoryId={renamingCategoryId}
                renameCategoryDraft={renameCategoryDraft}
                categoryRenameStatus={categoryRenameStatus}
                categoryRenameError={categoryRenameError}
                onStartRenameCategory={(categoryId, currentName) => {
                  setRenamingCategoryId(categoryId);
                  setRenameCategoryDraft(currentName);
                  setCategoryRenameError(null);
                  setCategoryRenameStatus('idle');
                }}
                onCancelRenameCategory={() => {
                  setRenamingCategoryId(null);
                  setRenameCategoryDraft('');
                  setCategoryRenameError(null);
                  setCategoryRenameStatus('idle');
                }}
                onRenameCategoryDraftChange={(draft) => {
                  setRenameCategoryDraft(draft);
                  if (categoryRenameError) setCategoryRenameError(null);
                }}
                onRenameCategorySubmit={handleRenameCategorySubmit}
                pendingDeleteCategoryId={pendingDeleteCategoryId}
                isDeletingCategory={isDeletingCategory}
                categoryDeleteError={categoryDeleteError}
                onRequestDeleteCategory={handleRequestDeleteCategory}
                onCancelDeleteCategory={handleCancelDeleteCategory}
                onConfirmDeleteCategory={handleConfirmDeleteCategory}
                categoryListContainerRef={categoryListContainerRef}
                categoryItemRefs={categoryItemRefs}
                deleteTriggerRefs={deleteTriggerRefs}
              />
            </section>

            <div className="favorites-separator-container settings-section-separator" aria-hidden="true">
              <div className="favorites-separator" />
            </div>

            <section
              ref={(el) => {
                sectionRefs.current.system = el;
              }}
              className="settings-section-block"
            >
              <h3 className="settings-section-heading">
                {strings.settings_tab_system_only || 'System'}
              </h3>
              <SettingsSystemTab
                language={language}
                strings={strings}
                autoLaunchValue={autoLaunchValue}
                minimizeToTray={minimizeToTray}
                autoAllowLargeSaves={autoAllowLargeSaves}
                isUpdatingConfig={isUpdatingConfig}
                exposeBetaOptions={exposeBetaOptions}
                onAutoLaunchChange={(value) => void handleAutoLaunchChange(value)}
                onMinimizeToTrayChange={(enabled) => void handleMinimizeToTrayChange(enabled)}
                onUpdateDisplayConfig={(updates) => void handleUpdateDisplayConfig(updates)}
                onExposeBetaChange={(enabled) => void handleExposeBetaChange(enabled)}
              />
            </section>

            <div className="favorites-separator-container settings-section-separator" aria-hidden="true">
              <div className="favorites-separator" />
            </div>

            <section
              ref={(el) => {
                sectionRefs.current.mascot = el;
              }}
              className="settings-section-block"
            >
              <h3 className="settings-section-heading">
                {strings.settings_tab_mascot || 'Yume-chan'}
              </h3>
              <SettingsMascotTab
                language={language}
                strings={strings}
                mascotShow={mascotShow}
                hideAndSeek={hideAndSeek}
                mascotScale={mascotScale}
                mascotSound={mascotSound}
                mascotVolume={mascotVolume}
                onUpdateMascotPreferences={updateMascotPreferences}
              />
            </section>

            <div className="favorites-separator-container settings-section-separator" aria-hidden="true">
              <div className="favorites-separator" />
            </div>

            <section
              ref={(el) => {
                sectionRefs.current.updates = el;
              }}
              className="settings-section-block"
            >
              <h3 className="settings-section-heading">
                {strings.settings_tab_updates || 'Updates'}
              </h3>
              <SettingsUpdatesTab
                language={language}
                strings={strings}
                appUpdateMode={appUpdateMode}
                langPackUpdateMode={langPackUpdateMode}
                onAppUpdateModeChange={handleAppUpdateModeChange}
                onLangPackUpdateModeChange={handleLangPackUpdateModeChange}
              />
            </section>

            <div className="favorites-separator-container settings-section-separator" aria-hidden="true">
              <div className="favorites-separator" />
            </div>

            <section
              ref={(el) => {
                sectionRefs.current.about = el;
              }}
              id="settings-panel-about"
              role="tabpanel"
              aria-labelledby="settings-tab-about"
              className="settings-section-block"
            >
              <h3 className="settings-section-heading">
                {strings.about_modal_title || 'About & Credits'}
              </h3>
              <AboutContent electronAPI={api} version={appVersion} />
            </section>
          </div>
        </Modal.Body>
      </div>
    </Modal>
  );
}
