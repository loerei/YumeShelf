import * as zlib from 'node:zlib';

class RpgMakerMzFormat {
    match(fileName: string): boolean {
        return fileName.endsWith('.rmmzsave');
    }

    async decode(rawData: Buffer): Promise<any> {
        try {
            // Try standard raw binary decompression first (correct format)
            const decompressedBuffer = zlib.inflateSync(rawData);
            return JSON.parse(decompressedBuffer.toString('utf8'));
        } catch (err: any) {
            console.warn('[SAVE-EDITOR-MZ] Standard decompression failed, falling back to legacy UTF-8 charCode decoding...', err.message);
            // Fallback for saves written by previous mangled YumeShelf versions
            const str = rawData.toString('utf8');
            const rawBytes = Buffer.alloc(str.length);
            for (let i = 0; i < str.length; i++) {
                rawBytes[i] = str.codePointAt(i) || 0;
            }
            const decompressedBuffer = zlib.inflateSync(rawBytes);
            return JSON.parse(decompressedBuffer.toString('utf8'));
        }
    }

    async encode(jsonData: any): Promise<Buffer> {
        const jsonStr = JSON.stringify(jsonData);
        // Return standard zlib-compressed binary buffer
        return zlib.deflateSync(Buffer.from(jsonStr, 'utf8'), { level: 1 });
    }
}

const format = new RpgMakerMzFormat();
export default format;
