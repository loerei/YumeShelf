const LZString = require('../../core/lz-string');

class RpgMakerMvFormat {
    match(fileName) {
        return fileName.endsWith('.rpgsave');
    }

    decode(rawData) {
        try {
            const decompressed = LZString.decompressFromBase64(rawData);
            return JSON.parse(decompressed);
        } catch (err) {
            return JSON.parse(rawData);
        }
    }

    encode(jsonData) {
        return LZString.compressToBase64(JSON.stringify(jsonData));
    }
}

module.exports = new RpgMakerMvFormat();
