import { YumeEngine } from '@yumeshelf/engine';
import type { SaveFormatStrategy } from '../engine';

class SimpleKeyedJsonFormat implements SaveFormatStrategy {
    match(fileName: string, rawData?: Buffer, jsonData?: any, options?: any): boolean {
        return YumeEngine.detectSaveStrategy(fileName, rawData, jsonData, options) === 'keyed-json';
    }

    async decode(rawData: Buffer, paths?: any, fileName?: string): Promise<any> {
        return YumeEngine.decodeSaveFile('keyed-json', rawData, {
            fileName,
            options: { exeDir: paths?.exeDir }
        });
    }

    async encode(jsonData: any, paths?: any, fileName?: string): Promise<Buffer> {
        return YumeEngine.encodeSaveFile('keyed-json', jsonData, {
            fileName,
            options: { exeDir: paths?.exeDir }
        });
    }
}

const format = new SimpleKeyedJsonFormat();
export default format;
