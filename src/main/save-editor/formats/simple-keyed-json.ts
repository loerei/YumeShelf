import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { YumeEngine } from '@yumeshelf/engine';

class SimpleKeyedJsonFormat {
    match(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('.json') && fileName.toLowerCase().includes('savedata');
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        return YumeEngine.decodeSaveFile('keyed-json', rawData, {
            fileName,
            options: { exeDir: paths?.exeDir }
        });
    }

    async encode(jsonData: any, paths: any, fileName: string): Promise<Buffer> {
        return YumeEngine.encodeSaveFile('keyed-json', jsonData, {
            fileName,
            options: { exeDir: paths?.exeDir }
        });
    }
}

const format = new SimpleKeyedJsonFormat();
export default format;
