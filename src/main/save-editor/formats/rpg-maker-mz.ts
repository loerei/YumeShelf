import * as zlib from 'node:zlib';

class RpgMakerMzFormat {
    match(fileName: string): boolean {
        return fileName.endsWith('.rmmzsave');
    }

    async decode(rawData: Buffer): Promise<any> {
        try {
            // Try RPG Maker MZ standard UTF-8 string decoding first
            const str = rawData.toString('utf8');
            const rawBytes = Buffer.alloc(str.length);
            for (let i = 0; i < str.length; i++) {
                rawBytes[i] = str.codePointAt(i) || 0;
            }
            const decompressedBuffer = zlib.inflateSync(rawBytes);
            return JSON.parse(decompressedBuffer.toString('utf8'));
        } catch (err: any) {
            console.warn('[SAVE-EDITOR-MZ] UTF-8 decoding failed, trying raw binary zlib fallback:', err?.message);
            // Fallback for standard raw binary zlib compressed saves
            const decompressedBuffer = zlib.inflateSync(rawData);
            return JSON.parse(decompressedBuffer.toString('utf8'));
        }
    }

    async encode(jsonData: any): Promise<Buffer> {
        // Strip internal YumeShelf UI metadata before encoding
        const cleanData = { ...jsonData };
        delete cleanData._userMappings;

        const jsonStr = JSON.stringify(cleanData);
        // Compress JSON to raw zlib buffer
        const compressed = zlib.deflateSync(Buffer.from(jsonStr, 'utf8'), { level: 1 });

        // Convert raw compressed bytes to RPG Maker MZ UTF-8 string representation
        let str = '';
        for (const byte of compressed) {
            str += String.fromCodePoint(byte);
        }
        return Buffer.from(str, 'utf8');
    }
}

const format = new RpgMakerMzFormat();
export default format;
