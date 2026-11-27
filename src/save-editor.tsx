import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SaveEditorApp } from './renderer/save-editor/SaveEditorApp';
import type { ObservableSaveEditorStore } from './renderer/save-editor/store/save-editor-store';
import type { ElectronAPI } from './shared/types/ipc';
import { registerGlobalErrorSanitizer, sanitizeUserPaths } from './shared/path-sanitizer';
import { applyTheme } from './renderer/utils/theme';

declare global {
  interface Window {
    __IS_STANDALONE_SAVE_EDITOR__?: boolean;
    __VITEST__?: boolean;
  }
}

export interface StandaloneMountOptions {
  electronAPI?: ElectronAPI;
  store?: ObservableSaveEditorStore;
  controllerFactory?: () => unknown;
}

/**
 * Mounts the standalone Save Editor React tree into #save-editor-root and returns
 * an idempotent disposer for React root, body class, and global window listeners.
 */
export async function mountStandaloneSaveEditor(
  root: HTMLElement | null = typeof document !== 'undefined'
    ? document.getElementById('save-editor-root')
    : null,
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  options: StandaloneMountOptions = {}
): Promise<() => void> {
  if (!root) throw new Error('Failed to find #save-editor-root container');

  window.__IS_STANDALONE_SAVE_EDITOR__ = true;
  const bodyHadClass =
    typeof document !== 'undefined' && document.body
      ? document.body.classList.contains('standalone-save-editor')
      : false;
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('standalone-save-editor');
    applyTheme(undefined, typeof window !== 'undefined' ? window.localStorage : undefined);
  }
  const unbindSanitizer = registerGlobalErrorSanitizer(window, '[SaveEditor]');

  let gameKey = '';
  let initialFile: string | undefined;
  try {
    const urlParams = new URLSearchParams(search);
    gameKey = urlParams.get('gameKey')?.trim() ?? '';
    initialFile = urlParams.get('file')?.trim() || undefined;
  } catch {
    gameKey = '';
    initialFile = undefined;
  }

  let reactRoot: Root | null = createRoot(root);
  reactRoot.render(
    <SaveEditorApp
      gameKey={gameKey}
      initialFile={initialFile}
      store={options.store}
      electronAPI={options.electronAPI}
    />
  );

  let disposed = false;
  const cleanup = (event?: Event): void => {
    if (disposed) return;
    // Defer beforeunload teardown check so SaveEditorStoreProvider can cancel dirty closes first
    if (event && event.type === 'beforeunload') {
      queueMicrotask(() => {
        if (!disposed && !event.defaultPrevented) {
          cleanup();
        }
      });
      return;
    }
    disposed = true;
    window.removeEventListener('beforeunload', cleanup);
    unbindSanitizer();
    if (!bodyHadClass && typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('standalone-save-editor');
    }
    if (reactRoot) {
      reactRoot.unmount();
      reactRoot = null;
    }
  };

  window.addEventListener('beforeunload', cleanup);
  return cleanup;
}

export function bootstrapStandaloneSaveEditor(): Promise<(() => void) | undefined> {
  return mountStandaloneSaveEditor().catch((err: unknown) => {
    const rawMsg = err instanceof Error ? (err.stack || err.message) : String(err);
    console.error('[SaveEditor] Failed to mount standalone save editor:', {
      error: sanitizeUserPaths(rawMsg),
    });
    return undefined;
  });
}

const isTestEnv =
  (typeof window !== 'undefined' && window.__VITEST__ === true) ||
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test') ||
  (typeof globalThis !== 'undefined' &&
    (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ===
      'test');

if (typeof window !== 'undefined' && !isTestEnv) {
  void bootstrapStandaloneSaveEditor();
}
