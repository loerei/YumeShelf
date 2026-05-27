import { TelemetryShipper } from '../../telemetry/shipper';

class PureJsonFormat {
    match(fileName: string): boolean {
        return fileName.toLowerCase().endsWith('.json');
    }

    async decode(rawData: Buffer): Promise<any> {
        // Log telemetry event for static safety preflight
        TelemetryShipper.getInstance().track(
            'src/main/save-editor/formats/pure-json.ts',
            'PureJsonFormat.decode',
            'save-editor:decode',
            10
        );

        const str = rawData.toString('utf8');
        try {
            const data = JSON.parse(str);
            if (data && typeof data === 'object') {
                data.$type = 'PureJsonSave';
            }
            return data;
        } catch (err) {
            console.error('[SAVE-EDITOR-JSON] Failed to parse JSON:', err);
            throw err;
        }
    }

    async encode(jsonData: any): Promise<Buffer> {
        const cleanData = { ...jsonData };
        delete cleanData.$type;
        delete cleanData._userMappings;
        
        const outputStr = JSON.stringify(cleanData);
        return Buffer.from(outputStr, 'utf8');
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
