import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './renderer/App';
import { bindIpcEvents } from './renderer/events/ipc-events';
import {
  createUiRuntimeState,
  type UiStorageAdapter,
} from './renderer/state/ui-runtime-state';
import { migrateUiPreferences } from './renderer/state/ui-storage-migrations';
import { registerGlobalErrorSanitizer } from './shared/path-sanitizer';
import type { ElectronAPI } from './shared/types/ipc';

export interface InitRendererOptions {
  container?: HTMLElement | null;
  storage?: UiStorageAdapter;
  electronAPI?: ElectronAPI;
  targetWindow?: Window;
}

export function initRenderer(options: InitRendererOptions = {}): () => void {
  const targetWin =
    options.targetWindow ?? (typeof window !== 'undefined' ? window : undefined);
  const unregisterSanitizer = targetWin
    ? registerGlobalErrorSanitizer(targetWin, '[Renderer]')
    : undefined;

  const defaultStorage =
    options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (defaultStorage) {
    migrateUiPreferences(defaultStorage);
  }
  const store = createUiRuntimeState(defaultStorage);
  const container =
    options.container ??
    (typeof document !== 'undefined' ? document.getElementById('react-root') : null);
  if (!container) throw new Error('Failed to find #react-root container');

  const root = createRoot(container);
  root.render(
    React.createElement(App, {
      store,
      storage: defaultStorage,
      electronAPI: options.electronAPI,
    })
  );

  const unbindIpc = bindIpcEvents(store, undefined, options.electronAPI);

  const beforeUnloadHandler = () => {
    unbindIpc();
  };
  targetWin?.addEventListener('beforeunload', beforeUnloadHandler);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    targetWin?.removeEventListener('beforeunload', beforeUnloadHandler);
    unbindIpc();
    unregisterSanitizer?.();
    root.unmount();
  };
}

if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
  initRenderer();
}
