import { TelemetryShipper } from '../../telemetry/shipper';
import { YumeEngine } from '@yumeshelf/engine';

class RpgMakerMvFormat {
    match(fileName: string): boolean {
        return YumeEngine.detectSaveStrategy(fileName) === 'rpg-maker-mv';
    }

    async decode(rawData: Buffer): Promise<any> {
        // Log telemetry event for static safety preflight
        TelemetryShipper.getInstance().track(
            'src/main/save-editor/formats/rpg-maker-mv.ts',
            'RpgMakerMvFormat.decode',
            'save-editor:decode',
            9
        );

        return YumeEngine.decodeSaveFile('rpg-maker-mv', rawData);
    }

    async encode(jsonData: any): Promise<Buffer> {
        return YumeEngine.encodeSaveFile('rpg-maker-mv', jsonData);
    }
}

const format = new RpgMakerMvFormat();
export default format;
