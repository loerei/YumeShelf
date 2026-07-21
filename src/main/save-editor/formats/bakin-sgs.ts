import { SaveFormat } from '../index';

class BakinSgsFormat implements SaveFormat {
    match(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('.sgs');
    }

    async decode(rawData: Buffer): Promise<any> {
        throw new Error('SGS (RPG Developer Bakin) save file format is currently not supported for editing.');
    }

    async encode(jsonData: any): Promise<Buffer> {
        throw new Error('SGS (RPG Developer Bakin) save file format is currently not supported for editing.');
    }
}

const format = new BakinSgsFormat();
export default format;
