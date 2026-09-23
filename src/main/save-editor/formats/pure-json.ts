import { TelemetryShipper } from '../../telemetry/shipper';
import { YumeEngine } from '@yumeshelf/engine';
import type { SaveFormatStrategy } from '../engine';

class PureJsonFormat implements SaveFormatStrategy {
    match(fileName: string, rawData?: Buffer, jsonData?: any, options?: any): boolean {
        return YumeEngine.detectSaveStrategy(fileName, rawData, jsonData, options) === 'pure-json';
    }

    async decode(rawData: Buffer): Promise<any> {
        // Log telemetry event for static safety preflight
        TelemetryShipper.getInstance().track(
            'src/main/save-editor/formats/pure-json.ts',
            'PureJsonFormat.decode',
            'save-editor:decode',
            10
        );

        return YumeEngine.decodeSaveFile('pure-json', rawData);
    }

    async encode(jsonData: any): Promise<Buffer> {
        return YumeEngine.encodeSaveFile('pure-json', jsonData);
    }

    async metadata(jsonData: any): Promise<any> {
        return {
            variables: [],
            switches: [],
            items: {},
            weapons: {},
            armors: {},
            gameTitle: 'JSON Save File'
        };
    }
}

const format = new PureJsonFormat();
export default format;
