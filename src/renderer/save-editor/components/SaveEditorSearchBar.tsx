import React, { useEffect, useRef, useState } from 'react';
import {
  getTranslation,
  useActiveSaveTabId,
  useIsTranslating,
  useSaveEditorDispatch,
  useSaveEditorStore,
  useSaveElectronAPI,
  useSaveFileStatus,
  useSaveGameKey,
  useSaveSearchQuery,
  useSaveTranslations,
} from '../store/save-editor-store';
import type { UiStorageAdapter } from '../../state/ui-runtime-state';
import type { ElectronAPI } from '../../../shared/types/ipc';
import {
  sanitizeLoneSurrogates,
  sanitizeUserPaths,
} from '../../../shared/path-sanitizer';
import { isCancellationError } from '../../utils/errors';
import { useLocaleStrings } from '../../i18n/locale-strings';

export interface SaveEditorSearchBarProps {
  batchSize?: number;
  watchdogTimeoutMs?: number;
  interBatchDelayMs?: number;
  targetLang?: string;
  storage?: UiStorageAdapter;
  electronAPI?: ElectronAPI;
}

function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  const createAbortError = () =>
    typeof DOMException !== 'undefined'
      ? new DOMException('Aborted', 'AbortError')
      : new Error('Aborted');
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? createAbortError());
  }
  return new Promise<T>((resolve, reject) => {
    // Late-rejection suppression on underlying IPC promise to eliminate unhandled rejections
    promise.catch(() => {});

    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason ?? createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

function delayWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  const createAbortError = () =>
    typeof DOMException !== 'undefined'
      ? new DOMException('Aborted', 'AbortError')
      : new Error('Aborted');
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? createAbortError());
  }
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason ?? createAbortError());
    };
    timer = setTimeout(() => {
      timer = null;
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export const SaveEditorSearchBar: React.FC<SaveEditorSearchBarProps> = ({
  batchSize = 15,
  watchdogTimeoutMs = 30000,
  interBatchDelayMs = 600,
  targetLang,
  storage,
  electronAPI,
}) => {
  const gameKey = useSaveGameKey();
  const store = useSaveEditorStore();
  const fileStatus = useSaveFileStatus();
  const activeTabId = useActiveSaveTabId();
  const storeSearchQuery = useSaveSearchQuery();
  const translations = useSaveTranslations();
  const isTranslating = useIsTranslating();
  const dispatch = useSaveEditorDispatch();
  const contextElectronAPI = useSaveElectronAPI();

  const api =
    electronAPI ??
    contextElectronAPI ??
    (typeof window !== 'undefined' ? window.electronAPI : undefined);
  const apiRef = useRef(api);
  apiRef.current = api;

  const resolvedStorage =
    storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  const strings = useLocaleStrings(resolvedStorage, api ?? null);
  const rawLang = targetLang || resolvedStorage?.getItem('yumeshelf_lang') || 'en';
  const currentLang = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(rawLang)
    ? rawLang
    : 'en';

  const [draftQuery, setDraftQuery] = useState(storeSearchQuery);
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDispatchedQueryRef = useRef(storeSearchQuery);

  const [translationProgress, setTranslationProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateAbortRef = useRef<AbortController | null>(null);
  const translateBtnRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWatchdogTimeoutRef = useRef(false);
  const activeJobIdRef = useRef<string | null>(null);
  const jobCounterRef = useRef<number>(0);

  const activeFileName =
    fileStatus.state === 'loaded' ? fileStatus.dto.fileName : null;

  useEffect(() => {
    let cancelled = false;
    if (api?.loadTranslations) {
      api
        .loadTranslations(currentLang)
        .then((loaded) => {
          if (!cancelled && loaded && Object.keys(loaded).length > 0) {
            dispatch.hydrateTranslations(loaded);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('[SaveEditorSearchBar] Failed to load translations:', {
              lang: currentLang,
              error: sanitizeUserPaths(
                err instanceof Error ? err.message : String(err)
              ),
              stack:
                err instanceof Error && err.stack
                  ? sanitizeUserPaths(err.stack)
                  : undefined,
            });
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [currentLang, api, dispatch]);

  const flushSearchQuery = (query: string) => {
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }
    lastDispatchedQueryRef.current = query;
    dispatch.setSearchQuery(query);
  };

  // 1. Synchronize ONLY when storeSearchQuery was modified externally
  useEffect(() => {
    if (storeSearchQuery !== lastDispatchedQueryRef.current) {
      lastDispatchedQueryRef.current = storeSearchQuery;
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
      setDraftQuery(storeSearchQuery);
    }
  }, [storeSearchQuery]);

  // 2. Dedicated session boundary reset: clears draftQuery when active file session unloads, switches, or errors
  const prevActiveFileNameRef = useRef<string | null>(activeFileName);
  useEffect(() => {
    const fileChanged = prevActiveFileNameRef.current !== activeFileName;
    prevActiveFileNameRef.current = activeFileName;

    if (
      fileStatus.state === 'loading' ||
      fileStatus.state === 'idle' ||
      fileStatus.state === 'error' ||
      (fileChanged && storeSearchQuery === '')
    ) {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
      lastDispatchedQueryRef.current = '';
      setDraftQuery('');
    }
  }, [
    fileStatus.state,
    fileStatus.state === 'loading' || fileStatus.state === 'error'
      ? fileStatus.fileName
      : activeFileName,
    activeFileName,
    storeSearchQuery,
  ]);

  // 3. Search debounce teardown: fires on file switch (or unmount)
  useEffect(() => {
    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
    };
  }, [activeFileName]);

  // 4. Category tab switch reconciliation: synchronously flushes in-flight draft query to destination tab
  const prevTabIdRef = useRef(activeTabId);
  const prevTabFileNameRef = useRef(activeFileName);
  useEffect(() => {
    const sameFile = prevTabFileNameRef.current === activeFileName;
    prevTabFileNameRef.current = activeFileName;
    if (prevTabIdRef.current !== activeTabId) {
      prevTabIdRef.current = activeTabId;
      if (sameFile && searchDebounceTimerRef.current) {
        flushSearchQuery(draftQuery);
      }
    }
  }, [activeTabId, activeFileName, draftQuery]);

  const cancelActiveTranslationJob = () => {
    const jobId = activeJobIdRef.current;
    activeJobIdRef.current = null;
    if (!jobId) return;
    const currentApi = apiRef.current ?? api;
    void currentApi?.cancelTranslateBatch?.({ jobId })?.catch((err: unknown) => {
      console.warn('[SaveEditorSearchBar] Failed to cancel translation batch:', {
        jobId: sanitizeUserPaths(jobId),
        error: sanitizeUserPaths(err instanceof Error ? err.message : err),
        stack:
          err instanceof Error && err.stack
            ? sanitizeUserPaths(err.stack)
            : undefined,
      });
    });
  };

  // Translation session teardown: fires ONLY on file switch (or unmount)
  useEffect(() => {
    return () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
      isWatchdogTimeoutRef.current = false;
      cancelActiveTranslationJob();
      translateAbortRef.current?.abort();
      setTranslationProgress(null);
    };
  }, [activeFileName]);

  // Unmount Cleanup & Watchdog Teardown
  useEffect(
    () => () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
      cancelActiveTranslationJob();
      translateAbortRef.current?.abort();
    },
    []
  );

  const showStatusNotice = (msg: string) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusNotice(msg);
    statusTimerRef.current = setTimeout(() => {
      setStatusNotice(null);
      statusTimerRef.current = null;
    }, 2500);
  };

  const restoreFocusToTranslateTriggerIfOwned = () => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    const isOwnedByTranslateControls =
      active === translateBtnRef.current ||
      active === cancelBtnRef.current ||
      active === document.body ||
      active === document.documentElement ||
      active === null;
    if (isOwnedByTranslateControls) {
      translateBtnRef.current?.focus();
    }
  };

  const handleSearchChange = (value: string) => {
    setDraftQuery(value);
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }
    searchDebounceTimerRef.current = setTimeout(() => {
      searchDebounceTimerRef.current = null;
      lastDispatchedQueryRef.current = value;
      dispatch.setSearchQuery(value);
    }, 150);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      flushSearchQuery(draftQuery);
    }
  };

  const handleCancel = () => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    isWatchdogTimeoutRef.current = false;
    restoreFocusToTranslateTriggerIfOwned();
    cancelActiveTranslationJob();
    translateAbortRef.current?.abort();
    dispatch.setTranslating(false);
    setTranslationProgress(null);
  };

  const handleTranslate = async () => {
    const initialStatus = store.getSnapshot().fileStatus;
    if (isTranslating || initialStatus.state !== 'loaded') return;
    translateAbortRef.current?.abort();
    const controller = new AbortController();
    translateAbortRef.current = controller;
    let localTimedOut = false;
    let localWatchdogId: ReturnType<typeof setTimeout> | null = null;
    activeJobIdRef.current = `${initialStatus.dto.fileName}_${Date.now()}_${++jobCounterRef.current}`;
    dispatch.setTranslating(true);
    setTranslationError(null);
    setStatusNotice(null);

    const targetFileName = initialStatus.dto.fileName;
    const loadedFields = initialStatus.dto.fields;

    try {
      const liveRawLang =
        targetLang || resolvedStorage?.getItem('yumeshelf_lang') || 'en';
      const liveLang = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(liveRawLang)
        ? liveRawLang
        : 'en';
      const currentTranslations = store.getSnapshot().translations;
      const uniqueLabels = Array.from(
        new Set(
          loadedFields
            .map((f) =>
              (f.label || '')
                .replace(/[\r\n]+/g, ' ')
                .trim()
                .normalize('NFC')
            )
            .filter(
              (normLabel) =>
                Boolean(normLabel) &&
                !/^\d+$/.test(normLabel) &&
                !getTranslation(currentTranslations, normLabel) &&
                !getTranslation(translations, normLabel)
            )
        )
      );
      const MAX_BATCH_COUNT = Math.min(Math.max(1, batchSize ?? 15), 100);
      const MAX_STRING_LENGTH = 300;
      const MAX_ENCODED_BYTES = 1500;
      const MAX_BATCH_CHARS = 2000;

      const batches: string[][] = [];
      let currentBatch: string[] = [];
      let currentEncodedLength = 0;
      let currentCharLength = 0;

      for (const label of uniqueLabels) {
        if (typeof label !== 'string' || label.length === 0) continue;
        const sanitizedLabel = sanitizeLoneSurrogates(label);
        const labelEncodedLen = encodeURIComponent(sanitizedLabel).length;
        if (
          label.length > MAX_STRING_LENGTH ||
          labelEncodedLen > MAX_ENCODED_BYTES
        ) {
          console.warn(
            '[SaveEditorSearchBar] Skipping oversized field label from translation batch:',
            {
              labelPreview: label.slice(0, 30) + '...',
              charLength: label.length,
              encodedByteLength: labelEncodedLen,
            }
          );
          continue;
        }

        const prospective = (currentBatch.length > 0 ? '\n' : '') + label;
        const prospectiveEncodedLen = encodeURIComponent(
          sanitizeLoneSurrogates(prospective)
        ).length;

        if (
          currentBatch.length >= MAX_BATCH_COUNT ||
          currentCharLength + prospective.length > MAX_BATCH_CHARS ||
          currentEncodedLength + prospectiveEncodedLen > MAX_ENCODED_BYTES
        ) {
          if (currentBatch.length > 0) {
            batches.push(currentBatch);
          }
          currentBatch = [];
          currentEncodedLength = 0;
          currentCharLength = 0;
        }

        const addedSegment = (currentBatch.length > 0 ? '\n' : '') + label;
        currentBatch.push(label);
        currentCharLength += addedSegment.length;
        currentEncodedLength += encodeURIComponent(
          sanitizeLoneSurrogates(addedSegment)
        ).length;
      }

      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      if (batches.length === 0) {
        restoreFocusToTranslateTriggerIfOwned();
        const notice =
          uniqueLabels.length > 0
            ? 'No translatable labels (oversized fields skipped)'
            : 'All labels translated';
        showStatusNotice(notice);
        return;
      }

      // Immediately initialize progress on batch 1 to guarantee zero cumulative layout shift (CLS = 0)
      setTranslationProgress({ current: 1, total: batches.length });

      isWatchdogTimeoutRef.current = false;
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const liveStatusPre = store.getSnapshot().fileStatus;
        if (
          controller.signal.aborted ||
          liveStatusPre.state !== 'loaded' ||
          liveStatusPre.dto.fileName !== targetFileName
        ) {
          break;
        }

        // Inter-batch delay to respect upstream rate limits
        if (i > 0 && (interBatchDelayMs ?? 600) > 0) {
          await delayWithSignal(
            interBatchDelayMs ?? 600,
            controller.signal
          ).catch((err) => {
            if (controller.signal.aborted) throw err;
          });
          if (controller.signal.aborted) break;
        }

        // Progressive staleness watchdog reset on batch progress deltas
        if (localWatchdogId) {
          clearTimeout(localWatchdogId);
        }
        localWatchdogId = setTimeout(() => {
          localTimedOut = true;
          isWatchdogTimeoutRef.current = true;
          console.warn(
            '[SaveEditorSearchBar] Translation watchdog triggered: batch timed out',
            {
              jobId: sanitizeUserPaths(activeJobIdRef.current ?? ''),
              targetLang: liveLang,
              elapsedMs: watchdogTimeoutMs ?? 30000,
            }
          );
          controller.abort(
            new Error(
              'Translation watchdog timeout: inactivity threshold exceeded'
            )
          );
        }, watchdogTimeoutMs ?? 30000);
        watchdogTimerRef.current = localWatchdogId;

        setTranslationProgress({ current: i + 1, total: batches.length });
        const currentApi =
          electronAPI ??
          contextElectronAPI ??
          (typeof window !== 'undefined' ? window.electronAPI : undefined);
        if (!currentApi?.translateBatch) {
          throw new Error('translateBatch API unavailable');
        }

        const rawPromise = currentApi.translateBatch(batch, liveLang, {
          timeoutMs: watchdogTimeoutMs ?? 30000,
          jobId: activeJobIdRef.current ?? undefined,
        });
        const batchResults = await raceWithSignal(
          rawPromise,
          controller.signal
        );

        const liveStatusPost = store.getSnapshot().fileStatus;
        if (
          controller.signal.aborted ||
          liveStatusPost.state !== 'loaded' ||
          liveStatusPost.dto.fileName !== targetFileName
        ) {
          break;
        }
        dispatch.setTranslations(batchResults);
        if (currentApi.saveTranslations) {
          await currentApi
            .saveTranslations(liveLang, batchResults)
            .catch((err) =>
              console.error(
                '[SaveEditorSearchBar] Failed to persist translations:',
                {
                  gameKey: sanitizeUserPaths(gameKey),
                  targetFileName: sanitizeUserPaths(targetFileName),
                  targetLang: liveLang,
                  error: sanitizeUserPaths(
                    err instanceof Error ? err.message : String(err)
                  ),
                  stack:
                    err instanceof Error && err.stack
                      ? sanitizeUserPaths(err.stack)
                      : undefined,
                }
              )
            );
        }
      }

      if (!controller.signal.aborted) {
        restoreFocusToTranslateTriggerIfOwned();
        showStatusNotice('All labels translated');
      }
    } catch (err) {
      if (translateAbortRef.current === controller) {
        if (!isCancellationError(err) || localTimedOut) {
          restoreFocusToTranslateTriggerIfOwned();
        }
        if (localTimedOut || isWatchdogTimeoutRef.current) {
          setTranslationError(
            'Translation timed out: inactivity threshold exceeded. Please check your network connection and retry.'
          );
        } else if (!isCancellationError(err)) {
          console.error('[SaveEditorSearchBar] Translation batch failed:', {
            gameKey: sanitizeUserPaths(gameKey),
            targetFileName: sanitizeUserPaths(targetFileName),
            targetLang: currentLang,
            error: sanitizeUserPaths(
              err instanceof Error ? err.message : String(err)
            ),
            stack:
              err instanceof Error && err.stack
                ? sanitizeUserPaths(err.stack)
                : undefined,
          });
          setTranslationError(
            sanitizeUserPaths(
              err instanceof Error
                ? err.message
                : 'Batch translation failed. Please check network connection and retry.'
            )
          );
        }
      }
    } finally {
      if (localWatchdogId) {
        clearTimeout(localWatchdogId);
      }
      if (translateAbortRef.current === controller) {
        if (watchdogTimerRef.current === localWatchdogId) {
          watchdogTimerRef.current = null;
        }
        isWatchdogTimeoutRef.current = false;
        restoreFocusToTranslateTriggerIfOwned();
        dispatch.setTranslating(false);
        setTranslationProgress(null);
        translateAbortRef.current = null;
        activeJobIdRef.current = null;
      }
    }
  };

  const isTranslateDisabled = isTranslating || fileStatus.state !== 'loaded';
  const isReloadDisabled = isTranslating || fileStatus.state !== 'loaded';

  const handleReload = async () => {
    if (isReloadDisabled || fileStatus.state !== 'loaded') return;
    const currentApi = apiRef.current ?? api;
    if (typeof currentApi?.loadSaveData !== 'function') return;
    const targetFileName = fileStatus.dto.fileName;
    const targetGameKey = gameKey || fileStatus.dto.gameKey;
    dispatch.setFileLoading(targetFileName);
    try {
      const reloaded = await currentApi.loadSaveData({
        gameKey: targetGameKey,
        fileName: targetFileName,
      });
      dispatch.setFileLoaded(reloaded);
    } catch (err) {
      if (isCancellationError(err)) {
        dispatch.setFileIdle();
      } else {
        const rawMsg = err instanceof Error ? err.message : String(err);
        dispatch.setFileError(targetFileName, sanitizeUserPaths(rawMsg));
      }
    }
  };

  return (
    <>
      <input
        type="search"
        className="save-editor-search"
        placeholder="Search variables..."
        value={draftQuery}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        aria-label="Search variables"
      />
      <div className="save-editor-search-actions">
        <button
          type="button"
          className="refresh-save-btn"
          aria-label="Reload from disk"
          title="Reload from disk"
          aria-disabled={isReloadDisabled}
          style={{
            pointerEvents: isReloadDisabled ? 'none' : undefined,
          }}
          onClick={handleReload}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <button
          ref={translateBtnRef}
          type="button"
          className={isTranslating ? 'translate-btn loading' : 'translate-btn'}
          aria-label="Translate save fields"
          title="Translate save fields"
          aria-disabled={isTranslateDisabled}
          style={{
            pointerEvents: isTranslateDisabled ? 'none' : undefined,
          }}
          onClick={handleTranslate}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M5 8l6 6M11 8L5 14M2 5h12M7 2v3M22 22l-5-10-5 10M14 18h6" />
          </svg>
          <span>{strings.save_editor_translate || 'Translate'}</span>
        </button>
        <div
          className="translation-progress-container"
          role="status"
          aria-live="polite"
        >
          {isTranslating && translationProgress && (
            <>
              <span className="translation-progress-text">
                Batch {translationProgress.current} of {translationProgress.total}
              </span>
              <button
                ref={cancelBtnRef}
                type="button"
                className="translate-cancel-btn"
                aria-label="Cancel batch translation"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </>
          )}
          {!isTranslating && statusNotice && (
            <span className="translation-status-text">{statusNotice}</span>
          )}
          {!isTranslating && translationError && (
            <span className="translation-error-text" role="alert">
              {translationError}
            </span>
          )}
        </div>
      </div>
    </>
  );
};
