import { YumeEngine } from '@yumeshelf/engine';
import type { SaveFormatStrategy } from '../engine';

class TincDoubleAesJsonFormat implements SaveFormatStrategy {
    match(fileName: string, rawData?: Buffer, jsonData?: any, options?: any): boolean {
        if (!rawData && !jsonData) {
            return false;
        }
        return YumeEngine.detectSaveStrategy(fileName, rawData, jsonData, options) === 'tinc-double-aes-json';
    }

    async decode(rawData: Buffer, paths?: any, fileName?: string): Promise<any> {
        return YumeEngine.decodeSaveFile('tinc-double-aes-json', rawData, {
            fileName,
            options: paths
        });
    }

    async encode(jsonData: any, paths?: any, fileName?: string): Promise<Buffer> {
        return YumeEngine.encodeSaveFile('tinc-double-aes-json', jsonData, {
            fileName,
            options: paths
        });
    }

    async metadata(jsonData: any): Promise<any> {
        return {
            variables: [],
            switches: [],
            items: {},
            weapons: {},
            armors: {},
            gameTitle: 'TINC Save File'
        };
    }
}

const format = new TincDoubleAesJsonFormat();
export default format;
