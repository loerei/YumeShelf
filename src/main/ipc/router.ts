import { AppIpcController } from './controllers/app.controller';
import { LibraryIpcController } from './controllers/library.controller';
import { SaveEditorIpcController } from './controllers/save-editor.controller';
import { TranslationIpcController } from './controllers/translation.controller';
import { RegisterIpcOptions } from './types';

export class IpcRouter {
    private appController: AppIpcController;
    private libraryController: LibraryIpcController;
    private translationController: TranslationIpcController;
    private saveEditorController: SaveEditorIpcController;

    constructor(options: RegisterIpcOptions) {
        this.appController = new AppIpcController(options);
        this.libraryController = new LibraryIpcController(options);
        this.translationController = new TranslationIpcController(options);
        this.saveEditorController = new SaveEditorIpcController(options);
    }

    public registerAll(): void {
        this.appController.registerHandlers();
        this.libraryController.registerHandlers();
        this.translationController.registerHandlers();
        this.saveEditorController.registerHandlers();
    }
}
