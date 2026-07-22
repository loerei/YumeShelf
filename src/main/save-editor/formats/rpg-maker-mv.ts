import { TelemetryShipper } from '../../telemetry/shipper';
import { LZString } from '../../core/lz-string';

class RpgMakerMvFormat {
    match(fileName: string): boolean {
        return fileName.endsWith('.rpgsave');
    }

    async decode(rawData: Buffer): Promise<any> {
        // Log telemetry event for static safety preflight
        TelemetryShipper.getInstance().track(
            'src/main/save-editor/formats/rpg-maker-mv.ts',
            'RpgMakerMvFormat.decode',
            'save-editor:decode',
            9
        );

        // Convert Buffer to UTF-8 string first
        const str = rawData.toString('utf8');
        try {
            const decompressed = LZString.decompressFromBase64(str);
            if (typeof decompressed === 'string') {
                return JSON.parse(decompressed);
            }
            throw new Error('Decompression returned null');
        } catch {
            return JSON.parse(str);
        }
    }

    async encode(jsonData: any): Promise<Buffer> {
        const compressed = LZString.compressToBase64(JSON.stringify(jsonData));
        // Return as a Buffer object
        return Buffer.from(compressed, 'utf8');
    }
}

const format = new RpgMakerMvFormat();
export default format;
