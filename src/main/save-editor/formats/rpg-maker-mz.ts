// @ts-nocheck
const zlib = require('zlib');

class RpgMakerMzFormat {
    match(fileName) {
        return fileName.endsWith('.rmmzsave');
    }

    async decode(rawData) {
        try {
            // Try standard raw binary decompression first (correct format)
            const decompressedBuffer = zlib.inflateSync(rawData);
            return JSON.parse(decompressedBuffer.toString('utf8'));
        } catch (err) {
            console.warn('[SAVE-EDITOR-MZ] Standard decompression failed, falling back to legacy UTF-8 charCode decoding...', err.message);
            // Fallback for saves written by previous mangled YumeShelf versions
            const str = rawData.toString('utf8');
            const rawBytes = Buffer.alloc(str.length);
            for (let i = 0; i < str.length; i++) {
                rawBytes[i] = str.charCodeAt(i);
            }
            const decompressedBuffer = zlib.inflateSync(rawBytes);
            return JSON.parse(decompressedBuffer.toString('utf8'));
        }
    }

    async encode(jsonData) {
        const jsonStr = JSON.stringify(jsonData);
        // Return standard zlib-compressed binary buffer
        return zlib.deflateSync(Buffer.from(jsonStr, 'utf8'), { level: 1 });
    }
}

module.exports = new RpgMakerMzFormat();
