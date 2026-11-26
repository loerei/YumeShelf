import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import type { UiStorageAdapter } from '../../state/ui-runtime-state';
import type { LibraryConfig } from '../../types/game';
import { applyTheme } from '../../utils/theme';
import { Modal } from './Modal';
import { SettingsLibraryTab } from './SettingsLibraryTab';

export interface MascotPreferences {
  show: boolean;
  scale: number;
  sound: string;
  volume: number;
}

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

type SettingsTabId = 'general' | 'library' | 'updates' | 'system';
type AsyncStatus = 'idle' | 'submitting' | 'success' | 'error';

const SETTINGS_TABS: readonly { id: SettingsTabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'library', label: 'Library & Categories' },
  { id: 'updates', label: 'Updates' },
  { id: 'system', label: 'System & Mascot' },
];

function getDefaultStorage(): UiStorageAdapter | undefined {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return undefined;
}

function MaxDepthStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    skipBlurCommitRef.current = false;
    setDraft(String(value));
  }, [value]);

  const handleCommit = (fromEnter = false) => {
    const parsed = parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      skipBlurCommitRef.current = fromEnter;
      const clamped = Math.min(12, Math.max(0, parsed));
      setDraft(String(clamped));
      if (clamped !== value) {
        onChange(clamped);
      }
    } else {
      skipBlurCommitRef.current = false;
      setDraft(String(value));
    }
  };

  const atMin = value <= 0;
  const atMax = value >= 12;
  return (
    <div className="max-depth-stepper">
      <button
        type="button"
        className="max-depth-stepper-btn"
        title="Decrease max depth"
        aria-label="Decrease max depth"
        aria-disabled={atMin}
        style={atMin ? { pointerEvents: 'none' } : undefined}
        onClick={() => {
          if (!atMin) onChange(Math.max(0, value - 1));
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 12h12" />
        </svg>
      </button>
      <input
        id="max-depth-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={draft}
        aria-label="Max scan depth"
        onChange={(e) => {
          skipBlurCommitRef.current = false;
          setDraft(e.target.value);
        }}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          handleCommit(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleCommit(true);
          }
        }}
      />
      <button
        type="button"
        className="max-depth-stepper-btn"
        title="Increase max depth"
        aria-label="Increase max depth"
        aria-disabled={atMax}
        style={atMax ? { pointerEvents: 'none' } : undefined}
        onClick={() => {
          if (!atMax) onChange(Math.min(12, value + 1));
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 6v12" />
          <path d="M6 12h12" />
        </svg>
      </button>
    </div>
  );
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
  const [mascotShow, setMascotShow] = useState<boolean>(
    () => (resolvedStorage?.getItem('yumeshelf_mascot_show') || 'on') === 'on'
  );
  const [hideAndSeek, setHideAndSeek] = useState<string>(
    () => resolvedStorage?.getItem('yumeshelf_hide_and_seek') || 'out'
  );
  const [mascotScale, setMascotScale] = useState<number>(() => {
    const raw = Number(resolvedStorage?.getItem('yumeshelf_mascot_scale') || '30');
    return Number.isFinite(raw) ? Math.min(100, Math.max(25, raw)) : 30;
  });
  const [mascotSound, setMascotSound] = useState<string>(
    () => resolvedStorage?.getItem('yumeshelf_mascot_sound') || 'squeaker'
  );
  const [mascotVolume, setMascotVolume] = useState<number>(() => {
    const raw = Number(resolvedStorage?.getItem('yumeshelf_mascot_volume') || '20');
    return Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 20;
  });

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
  const largeSavesTipId = useId();
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
      const res = await api?.renameCategory?.({ id: categoryId, name: trimmedName });
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
      await api?.setAutoLaunch?.(nextAutoLaunch as boolean);
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

  const updateMascotPreferences = (patch: Partial<MascotPreferences>) => {
    const next: MascotPreferences = {
      show: patch.show ?? mascotShow,
      scale: patch.scale ?? mascotScale,
      sound: patch.sound ?? mascotSound,
      volume: patch.volume ?? mascotVolume,
    };
    setMascotShow(next.show);
    setMascotScale(next.scale);
    setMascotSound(next.sound);
    setMascotVolume(next.volume);

    resolvedStorage?.setItem('yumeshelf_mascot_show', next.show ? 'on' : 'off');
    resolvedStorage?.setItem('yumeshelf_mascot_scale', String(next.scale));
    resolvedStorage?.setItem('yumeshelf_mascot_sound', next.sound);
    resolvedStorage?.setItem('yumeshelf_mascot_volume', String(next.volume));

    onMascotSettingsChanged?.(next);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      id="settings-modal"
      className="settings-overlay"
      panelClassName="settings-panel"
      fallbackFocusRef={fallbackFocusRef}
    >
      <Modal.Header title={strings.settings || 'Settings'} className="settings-header" />

      <div className="settings-tabs-nav" role="tablist" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          const tabLabel =
            tab.id === 'general'
              ? strings.settings_tab_general || tab.label
              : tab.id === 'library'
                ? strings.settings_tab_library || tab.label
                : tab.id === 'updates'
                  ? strings.settings_tab_updates || tab.label
                  : strings.settings_tab_system || tab.label;
          return (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              type="button"
              role="tab"
              className={`settings-tab-btn${isSelected ? ' active' : ''}`}
              aria-selected={isSelected}
              aria-controls={`settings-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tabLabel}
            </button>
          );
        })}
      </div>

      <Modal.Body className="settings-body">
        {activeTab === 'general' && (
          <div
            id="settings-panel-general"
            role="tabpanel"
            aria-labelledby="settings-tab-general"
            className="settings-tab-panel"
          >
            <div className="setting-item">
              <label htmlFor="theme-select">
                {language === 'en' ? 'Theme' : strings.theme || 'Theme'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="theme-select"
                  value={theme}
                  onChange={(e) => handleThemeChange(e.target.value)}
                >
                  <option value="system">{strings.theme_system || 'System'}</option>
                  <option value="dark">{strings.theme_dark || 'Dark'}</option>
                  <option value="light">{strings.theme_light || 'Light'}</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="language-select">{strings.lang || 'Language'}</label>
              <div className="setting-control-zone setting-field-group">
                <button
                  type="button"
                  className="small-btn secondary-btn"
                  onClick={() => onOpenLanguagePack?.()}
                >
                  {strings.settings_more_languages || 'More languages...'}
                </button>
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => {
                    const nextLang = e.target.value;
                    setLanguage(nextLang);
                    resolvedStorage?.setItem('yumeshelf_lang', nextLang);
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(
                        new CustomEvent('yumeshelf:language-changed', { detail: { code: nextLang } })
                      );
                    }
                    showToast('Language updated');
                  }}
                >
                  {installedLanguages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="location-display-select">
                {language === 'en'
                  ? 'Location Display'
                  : strings.location_display_label || 'Location Display'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="location-display-select"
                  value={locationDisplayMode}
                  onChange={(e) =>
                    handleLocationDisplayModeChange(e.target.value as 'parent' | 'full')
                  }
                >
                  <option value="parent">
                    {language === 'en'
                      ? 'Parent Folder'
                      : strings.location_display_parent || 'Parent Folder'}
                  </option>
                  <option value="full">
                    {language === 'en'
                      ? 'Full Path'
                      : strings.location_display_full || 'Full Path'}
                  </option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="title-display-select">
                {strings.title_display_label || 'Title Display'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="title-display-select"
                  value={titleDisplayMode}
                  aria-disabled={isUpdatingConfig}
                  style={isUpdatingConfig ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
                  onChange={(e) =>
                    handleUpdateDisplayConfig({
                      titleDisplayMode: e.target.value as 'metadata' | 'legacy_folder',
                    })
                  }
                >
                  <option value="metadata">
                    {language === 'en'
                      ? 'Metadata Title'
                      : strings.title_display_metadata || 'Metadata Title'}
                  </option>
                  <option value="legacy_folder">
                    {language === 'en'
                      ? 'Folder Name'
                      : strings.title_display_legacy || 'Folder Name'}
                  </option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="product-codes-select">
                {language === 'en'
                  ? 'Product Codes'
                  : strings.display_codes_label || 'Product Codes'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="product-codes-select"
                  value={displayProductCodes ? 'on' : 'off'}
                  aria-disabled={isUpdatingConfig}
                  style={isUpdatingConfig ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
                  onChange={(e) =>
                    handleUpdateDisplayConfig({
                      displayProductCodes: e.target.value === 'on',
                    })
                  }
                >
                  <option value="off">{strings.option_off || 'Off'}</option>
                  <option value="on">{strings.option_on || 'On'}</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="max-depth-input">
                {language === 'en'
                  ? 'Max Scan Depth'
                  : strings.max_depth_label || 'Max Scan Depth'}
              </label>
              <div className="setting-control-zone">
                <MaxDepthStepper value={maxDepth} onChange={handleMaxDepthChange} />
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-label-with-info">
                <label htmlFor="auto-allow-large-saves-select">
                  {strings.setting_auto_allow_large_saves_label ||
                    'Auto-Allow Large Saves (>64 MB)'}
                </label>
                <span className="setting-info-wrap">
                  <button
                    type="button"
                    className="setting-info-btn"
                    aria-label={
                      strings.setting_auto_allow_large_saves_info ||
                      'Very large save files can take longer to open and use more memory while editing.'
                    }
                    aria-describedby={largeSavesTipId}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.9.9 0 1 1 0 1.8A.9.9 0 0 1 8 4zm-.75 3h1.5v5h-1.5V7z" />
                    </svg>
                  </button>
                  <span id={largeSavesTipId} role="tooltip" className="setting-info-tooltip">
                    {strings.setting_auto_allow_large_saves_info ||
                      'Very large save files can take longer to open and use more memory while editing.'}
                  </span>
                </span>
              </div>
              <div className="setting-control-zone">
                <select
                  id="auto-allow-large-saves-select"
                  value={autoAllowLargeSaves ? 'on' : 'off'}
                  aria-disabled={isUpdatingConfig}
                  style={isUpdatingConfig ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
                  onChange={(e) =>
                    handleUpdateDisplayConfig({
                      autoAllowLargeSaves: e.target.value === 'on',
                    })
                  }
                >
                  <option value="off">{strings.option_off || 'Off'}</option>
                  <option value="on">{strings.option_on || 'On'}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <SettingsLibraryTab
            language={language}
            strings={strings}
            libraryPaths={libraryPaths}
            folderAliases={config?.folderAliases}
            targetPlatform={targetPlatform}
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
        )}

        {activeTab === 'updates' && (
          <div
            id="settings-panel-updates"
            role="tabpanel"
            aria-labelledby="settings-tab-updates"
            className="settings-tab-panel"
          >
            <div className="setting-item">
              <label htmlFor="app-updates-select">
                {strings.app_updates_label || 'App Updates'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="app-updates-select"
                  value={appUpdateMode}
                  onChange={(e) => handleAppUpdateModeChange(e.target.value)}
                >
                  <option value="automatic">
                    {strings.update_mode_automatic || 'Automatic'}
                  </option>
                  <option value="notify">
                    {language === 'en'
                      ? 'Notify Only'
                      : strings.update_mode_notify || 'Notify Only'}
                  </option>
                  <option value="off">{strings.update_mode_off || 'Off'}</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="lang-pack-updates-select">
                {strings.language_pack_updates_label || 'Language Pack Updates'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="lang-pack-updates-select"
                  value={langPackUpdateMode}
                  onChange={(e) => handleLangPackUpdateModeChange(e.target.value)}
                >
                  <option value="automatic">
                    {strings.update_mode_automatic || 'Automatic'}
                  </option>
                  <option value="notify">
                    {language === 'en'
                      ? 'Notify Only'
                      : strings.update_mode_notify || 'Notify Only'}
                  </option>
                  <option value="off">{strings.update_mode_off || 'Off'}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div
            id="settings-panel-system"
            role="tabpanel"
            aria-labelledby="settings-tab-system"
            className="settings-tab-panel"
          >
            <div className="setting-item">
              <label htmlFor="auto-launch-select">
                {language === 'en'
                  ? 'Launch on Startup'
                  : strings.auto_launch_label || 'Launch on Startup'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="auto-launch-select"
                  value={autoLaunchValue}
                  onChange={(e) => handleAutoLaunchChange(e.target.value)}
                >
                  <option value="off">{strings.option_off || 'Off'}</option>
                  <option value="on">{strings.option_on || 'On'}</option>
                  <option value="minimized">
                    {language === 'en'
                      ? 'Minimized'
                      : strings.option_minimized || 'Minimized'}
                  </option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="minimize-tray-select">
                {language === 'en'
                  ? 'Minimize to Tray'
                  : strings.minimize_to_tray_label || 'Minimize to Tray'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="minimize-tray-select"
                  value={minimizeToTray ? 'on' : 'off'}
                  onChange={(e) => handleMinimizeToTrayChange(e.target.value === 'on')}
                >
                  <option value="off">{strings.option_off || 'Off'}</option>
                  <option value="on">{strings.option_on || 'On'}</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="expose-beta-select">
                {strings.expose_beta_label || 'Expose Beta Options'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="expose-beta-select"
                  value={exposeBetaOptions ? 'on' : 'off'}
                  onChange={(e) => handleExposeBetaChange(e.target.value === 'on')}
                >
                  <option value="off">{strings.option_off || 'Off'}</option>
                  <option value="on">{strings.option_on || 'On'}</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="mascot-show-select">
                {language === 'en'
                  ? 'Show Mascot'
                  : strings.mascot_show_label || 'Show Mascot'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="mascot-show-select"
                  value={mascotShow ? 'on' : 'off'}
                  onChange={(e) =>
                    updateMascotPreferences({ show: e.target.value === 'on' })
                  }
                >
                  <option value="on">
                    {language === 'en'
                      ? 'On'
                      : strings.mascot_show_on || strings.option_on || 'On'}
                  </option>
                  <option value="off">
                    {language === 'en'
                      ? 'Off'
                      : strings.mascot_show_off || strings.option_off || 'Off'}
                  </option>
                </select>
              </div>
            </div>

            <div className="setting-item" id="setting-item-hide-and-seek">
              <label htmlFor="hide-and-seek-select">
                {strings.hide_and_seek_label || 'Hide And Seek?'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="hide-and-seek-select"
                  value={hideAndSeek}
                  disabled={!mascotShow}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setHideAndSeek(nextVal);
                    resolvedStorage?.setItem('yumeshelf_hide_and_seek', nextVal);
                  }}
                >
                  <option value="yeaaa">{strings.hide_and_seek_yeaaa || 'YEAAA'}</option>
                  <option value="out">{strings.hide_and_seek_out || "I'm out"}</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="mascot-scale-slider">
                {language === 'en'
                  ? 'Mascot Scale'
                  : strings.mascot_scale_label || 'Mascot Scale'}
              </label>
              <div className="setting-control-zone">
                <div className="volume-slider-container">
                  <input
                    id="mascot-scale-slider"
                    type="range"
                    min={25}
                    max={100}
                    value={mascotScale}
                    aria-valuetext={`${mascotScale}%`}
                    onChange={(e) =>
                      updateMascotPreferences({ scale: Number(e.target.value) })
                    }
                  />
                  <span id="mascot-scale-value" className="volume-value-label">
                    {mascotScale}%
                  </span>
                </div>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="mascot-sound-select">
                {language === 'en'
                  ? 'Bonk Sound'
                  : strings.mascot_sound_label || strings.mascot_menu_sound || 'Bonk Sound'}
              </label>
              <div className="setting-control-zone">
                <select
                  id="mascot-sound-select"
                  value={mascotSound}
                  onChange={(e) => updateMascotPreferences({ sound: e.target.value })}
                >
                  <option value="squeaker">{strings.sound_squeaker || 'Squeaky'}</option>
                  <option value="metal-pipe">{strings.sound_metal_pipe || 'Metal pipe'}</option>
                  <option value="none">{strings.sound_none || 'None'}</option>
                </select>
              </div>
            </div>

            <div className="setting-item">
              <label htmlFor="mascot-volume-slider">
                {language === 'en'
                  ? 'Mascot Volume'
                  : strings.mascot_volume_label || 'Mascot Volume'}
              </label>
              <div className="setting-control-zone">
                <div className="volume-slider-container">
                  <input
                    id="mascot-volume-slider"
                    type="range"
                    min={0}
                    max={100}
                    value={mascotVolume}
                    aria-valuetext={`${mascotVolume}%`}
                    onChange={(e) =>
                      updateMascotPreferences({ volume: Number(e.target.value) })
                    }
                  />
                  <span id="mascot-volume-value" className="volume-value-label">
                    {mascotVolume}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="settings-info">
          <p id="ui-app-version">
            {appVersion ? (
              <a
                className="settings-version-link"
                href={`https://github.com/loerei/YumeShelf/releases/tag/v${appVersion}`}
                onClick={(e) => {
                  e.preventDefault();
                  void api?.openExternalUrl?.(
                    `https://github.com/loerei/YumeShelf/releases/tag/v${appVersion}`
                  );
                }}
              >
                {`${strings.title || 'YumeShelf'} v${appVersion}`}
              </a>
            ) : (
              strings.title || 'YumeShelf'
            )}
          </p>
          <p id="ui-footer-desc">{strings.footer_desc || 'Your dreams, organized perfectly.'}</p>
          <div className="settings-about-row">
            <button
              type="button"
              id="settings-about-btn"
              className="settings-about-link"
              onClick={() => onOpenAbout?.()}
            >
              {strings.settings_about_credits || 'About & Credits'}
            </button>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
