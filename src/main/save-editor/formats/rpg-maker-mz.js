const zlib = require('zlib');

class RpgMakerMzFormat {
    match(fileName) {
        return fileName.endsWith('.rmmzsave');
    }

    decode(rawData) {
        const rawBytes = Buffer.alloc(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
            rawBytes[i] = rawData.charCodeAt(i);
        }
        const decompressedBuffer = zlib.inflateSync(rawBytes);
        return JSON.parse(decompressedBuffer.toString('utf8'));
    }

    encode(jsonData) {
        const jsonStr = JSON.stringify(jsonData);
        const compressedBuffer = zlib.deflateSync(Buffer.from(jsonStr, 'utf8'), { level: 1 });
        let compressedStr = '';
        for (let i = 0; i < compressedBuffer.length; i++) {
            compressedStr += String.fromCharCode(compressedBuffer[i]);
        }
        return compressedStr;
    }
}

module.exports = new RpgMakerMzFormat();
