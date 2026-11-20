import { type ISaveEditorLauncher, ElectronSaveEditorLauncher } from './services/save-editor-launcher';

declare global {
  interface Window {
    __IS_STANDALONE_SAVE_EDITOR__?: boolean;
    showSaveEditor?: (gameKey: string) => Promise<void>;
  }
}

export function initSaveEditorUI(launcher: ISaveEditorLauncher = new ElectronSaveEditorLauncher()): void {
  const isStandaloneWindow =
    typeof window !== 'undefined' &&
    (window.__IS_STANDALONE_SAVE_EDITOR__ === true ||
      window.location.pathname.includes('save-editor') ||
      window.location.search.includes('gameKey='));

  if (typeof window !== 'undefined' && !isStandaloneWindow) {
    window.showSaveEditor = async (gameKey: string) => {
      await launcher.open(gameKey);
    };
  }
}
