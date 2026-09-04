import * as path from 'node:path';
import { YumeEngine } from '@yumeshelf/engine';

class RenpyFormat {
    match(fileName: string): boolean {
        return YumeEngine.detectSaveStrategy(fileName) === 'renpy-pickle';
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        return YumeEngine.decodeSaveFile('renpy', rawData, {
            fileName,
            options: {
                savePath: paths?.saveDir ? path.join(paths.saveDir, fileName) : (paths?.savePath ?? undefined),
                stalenessTimeoutMs: paths?.stalenessTimeoutMs !== undefined ? paths.stalenessTimeoutMs : 10000,
                earlyExit: paths?.earlyExit !== undefined ? Boolean(paths.earlyExit) : true,
                onProgress: paths?.onProgress,
                shouldCancel: paths?.shouldCancel,
            }
        });
    }

    async encode(jsonData: any, paths: any, fileName: string): Promise<Buffer> {
        return YumeEngine.encodeSaveFile('renpy', jsonData, {
            fileName,
            options: {
                savePath: paths?.saveDir ? path.join(paths.saveDir, fileName) : (paths?.savePath ?? undefined)
            }
        });
    }

    async metadata(jsonData: any, paths: any, fileName: string): Promise<any> {
        // Return blank standard structure to bypass RPG Maker metadata loader
        return {
            variables: [],
            switches: [],
            items: {},
            weapons: {},
            armors: {},
            gameTitle: 'Ren\'Py Game'
        };
    }
}

const format = new RenpyFormat();
export default format;
