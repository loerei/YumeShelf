import type { ElectronAPI } from '../../shared/types/ipc';

export interface ISaveEditorLauncher {
  open(gameKey: string, options?: { standalone?: boolean }): Promise<void>;
}

export class ElectronSaveEditorLauncher implements ISaveEditorLauncher {
  private readonly api: Pick<ElectronAPI, 'openSaveEditorWindow'> | undefined;

  constructor(
    api: Pick<ElectronAPI, 'openSaveEditorWindow'> | undefined =
      typeof window !== 'undefined' ? window.electronAPI : undefined
  ) {
    this.api = api;
  }

  async open(gameKey: string, _options?: { standalone?: boolean }): Promise<void> {
    if (!this.api?.openSaveEditorWindow) {
      throw new Error('Save editor IPC bridge is unavailable');
    }
    const sanitizedKey = typeof gameKey === 'string' ? gameKey.trim() : '';
    if (!sanitizedKey) {
      throw new Error('Missing required gameKey');
    }
    await this.api.openSaveEditorWindow(sanitizedKey);
  }
}
