import { YumeEngine } from '@yumeshelf/engine';

class RpgMakerMzFormat {
    match(fileName: string): boolean {
        return YumeEngine.detectSaveStrategy(fileName) === 'rpg-maker-mz';
    }

    async decode(rawData: Buffer): Promise<any> {
        return YumeEngine.decodeSaveFile('rpg-maker-mz', rawData);
    }

    async encode(jsonData: any): Promise<Buffer> {
        return YumeEngine.encodeSaveFile('rpg-maker-mz', jsonData);
    }
}

const format = new RpgMakerMzFormat();
export default format;
