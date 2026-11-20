import { registerGlobalErrorSanitizer, sanitizeUserPaths } from './shared/path-sanitizer';

declare global {
  interface Window {
    __IS_STANDALONE_SAVE_EDITOR__?: boolean;
  }
}

export interface StandaloneMountOptions {
  controllerFactory?: () => {
    open: (gameKey: string, options: { isStandaloneWindow: boolean }) => Promise<unknown>;
    destroy: () => void;
  };
}

export async function mountStandaloneSaveEditor(
  root: HTMLElement | null = document.getElementById('save-editor-root'),
  search: string = window.location.search,
  options: StandaloneMountOptions = {}
): Promise<() => void> {
  window.__IS_STANDALONE_SAVE_EDITOR__ = true;
  const unbindSanitizer = registerGlobalErrorSanitizer(window, '[SaveEditor]');

  const urlParams = new URLSearchParams(search);
  const gameKey = urlParams.get('gameKey')?.trim();

  let controller: ReturnType<NonNullable<StandaloneMountOptions['controllerFactory']>> | null = null;
  let disposed = false;

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('beforeunload', cleanup);
    unbindSanitizer();
    if (controller) {
      controller.destroy();
      controller = null;
    }
  };

  window.addEventListener('beforeunload', cleanup);

  if (!gameKey) {
    console.error('[SaveEditor] Missing or empty gameKey parameter in standalone window.');
    if (root) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'save-editor-error';
      errorDiv.textContent = 'Missing required gameKey parameter.';
      root.replaceChildren(errorDiv);
    }
    return cleanup;
  }

  // Dynamic import ensures window flag is initialized before controller evaluates
  const { SaveEditorViewController } = await import('./renderer/save-editor/view-controller');
  controller = options.controllerFactory ? options.controllerFactory() : new SaveEditorViewController();

  try {
    await controller.open(gameKey, { isStandaloneWindow: true });
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : String(err || 'Unknown error');
    const sanitizedMessage = sanitizeUserPaths(rawMessage);
    const sanitizedStack = err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined;

    console.error('[SaveEditor] Failed to mount standalone view controller:', {
      gameKey: sanitizeUserPaths(gameKey),
      error: sanitizedMessage,
      stack: sanitizedStack,
    });
    controller.destroy();
    controller = null;
    if (root) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'save-editor-error';
      errorDiv.textContent = `Failed to load save editor: ${sanitizedMessage}`;
      root.replaceChildren(errorDiv);
    }
  }

  return cleanup;
}

// Auto-bootstrap in browser/standalone window environment (skip under Vitest/test runner)
const isTestEnv =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test') ||
  (typeof globalThis !== 'undefined' &&
    (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === 'test');

if (!isTestEnv) {
  mountStandaloneSaveEditor().catch((err) => {
    console.error('[SaveEditor] Bootstrap failed unexpectedly:', {
      error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
    });
  });
}
