import { SaveEditorOpenOptions, SaveEditorViewController } from './save-editor/view-controller';

declare global {
    interface Window {
        showSaveEditor?: (gameKey: string, options?: SaveEditorOpenOptions) => Promise<void>;
    }
}

export function initSaveEditorUI(): void {
    const controller = new SaveEditorViewController();
    window.showSaveEditor = async (gameKey: string, options: SaveEditorOpenOptions = {}) => {
        await controller.open(gameKey, options);
    };
}
