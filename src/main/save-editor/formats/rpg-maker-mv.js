const LZString = require('../../core/lz-string');

class RpgMakerMvFormat {
    match(fileName) {
        return fileName.endsWith('.rpgsave');
    }

    decode(rawData) {
        // Convert Buffer to UTF-8 string first
        const str = rawData.toString('utf8');
        try {
            const decompressed = LZString.decompressFromBase64(str);
            return JSON.parse(decompressed);
        } catch (err) {
            return JSON.parse(str);
        }
    }

    encode(jsonData) {
        const compressed = LZString.compressToBase64(JSON.stringify(jsonData));
        // Return as a Buffer object
        return Buffer.from(compressed, 'utf8');
    }
}

module.exports = new RpgMakerMvFormat();
