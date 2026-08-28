import * as path from 'node:path';
import { YumeEngine } from '@yumeshelf/engine';

class RenpyFormat {
    match(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('.save');
    }

    getConverterScriptPath(): string {
        const candidate = path.resolve(__dirname, '..', 'bin', 'renpy_save_converter.py');
        if (candidate.includes('app.asar')) {
            return candidate.replace('app.asar', 'app.asar.unpacked');
        }
        return candidate;
    }

    getPythonCommand(): string {
        return process.platform === 'win32' ? 'python' : 'python3';
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        return YumeEngine.decodeSaveFile('renpy', rawData, {
            fileName,
            options: {
                savePath: path.join(paths.saveDir, fileName)
            }
        });
    }

    async encode(jsonData: any, paths: any, fileName: string): Promise<Buffer> {
        return YumeEngine.encodeSaveFile('renpy', jsonData, {
            fileName,
            options: {
                savePath: path.join(paths.saveDir, fileName)
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
