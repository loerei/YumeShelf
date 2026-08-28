import { SaveFormat } from '../index';
import { YumeEngine } from '@yumeshelf/engine';

class BakinSgsFormat implements SaveFormat {
    match(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('.sgs');
    }

    async decode(rawData: Buffer): Promise<any> {
        return YumeEngine.decodeSaveFile('bakin-sgs', rawData);
    }

    async encode(jsonData: any): Promise<Buffer> {
        return YumeEngine.encodeSaveFile('bakin-sgs', jsonData);
    }
}

const format = new BakinSgsFormat();
export default format;
