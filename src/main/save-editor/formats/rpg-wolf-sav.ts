import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

function sha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function byteEntropy(buffer: Buffer): number {
    if (!buffer.length) return 0;
    const counts = new Array(256).fill(0);
    for (const byte of buffer) counts[byte] += 1;

    let entropy = 0;
    for (const count of counts) {
        if (!count) continue;
        const p = count / buffer.length;
        entropy -= p * Math.log2(p);
    }
    return Number(entropy.toFixed(4));
}

function printableRatio(buffer: Buffer): number {
    if (!buffer.length) return 0;

    let printable = 0;
    for (const byte of buffer) {
        if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
            printable += 1;
        }
    }
    return Number((printable / buffer.length).toFixed(4));
}

function extractAsciiStrings(buffer: Buffer, minLength = 5, limit = 80): string[] {
    const matches = buffer
        .toString('latin1')
        .match(new RegExp(`[\\x20-\\x7e]{${minLength},}`, 'g'));

    return (matches || [])
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, limit);
}

interface JsonParseResult {
    label: string;
    ok: boolean;
    type?: string;
    keys?: string[];
    error?: string;
}

function tryJsonParse(label: string, text: string): JsonParseResult {
    try {
        const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
        return {
            label,
            ok: true,
            type: Array.isArray(parsed) ? 'array' : typeof parsed,
            keys: parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? Object.keys(parsed).slice(0, 50)
                : []
        };
    } catch (error: any) {
        return { label, ok: false, error: error.message };
    }
}

interface DecoderAttempt {
    label: string;
    ok: boolean;
    decodedSize?: number;
    decodedFirst32Hex?: string;
    json?: JsonParseResult;
    error?: string;
}

function tryDecoders(buffer: Buffer): DecoderAttempt[] {
    const attempts: DecoderAttempt[] = [
        tryJsonParse('raw utf8 json', buffer.toString('utf8')),
        tryJsonParse('raw utf16le json', buffer.toString('utf16le'))
    ];

    const zlibAttempts: [string, () => Buffer][] = [
        ['zlib.inflateSync', () => zlib.inflateSync(buffer)],
        ['zlib.inflateRawSync', () => zlib.inflateRawSync(buffer)],
        ['zlib.gunzipSync', () => zlib.gunzipSync(buffer)],
        ['zlib.brotliDecompressSync', () => zlib.brotliDecompressSync(buffer)]
    ];

    for (const [label, decode] of zlibAttempts) {
        try {
            const decoded = decode();
            attempts.push({
                label,
                ok: true,
                decodedSize: decoded.length,
                decodedFirst32Hex: decoded.subarray(0, 32).toString('hex'),
                json: tryJsonParse(`${label} -> utf8 json`, decoded.toString('utf8'))
            });
        } catch (error: any) {
            attempts.push({ label, ok: false, error: error.message });
        }
    }

    return attempts;
}

export function buildVariables(buffer: Buffer): Record<number, any> {
    const variables: Record<number, any> = {
        1: buffer.length,
        2: sha256(buffer),
        3: byteEntropy(buffer),
        4: printableRatio(buffer),
        5: buffer.subarray(0, 64).toString('hex'),
        6: buffer.subarray(0, 64).toString('latin1'),
        7: buffer.subarray(0, 64).toString('utf8')
    };

    const strings = extractAsciiStrings(buffer, 5, 30);
    strings.forEach((value, index) => {
        variables[100 + index] = value;
    });

    const decoderAttempts = tryDecoders(buffer);
    decoderAttempts.forEach((attempt, index) => {
        variables[200 + index] = attempt.ok
            ? `${attempt.label}: OK${attempt.decodedSize ? ` (${attempt.decodedSize} bytes)` : ''}`
            : `${attempt.label}: ${attempt.error}`;
    });

    return variables;
}

export function buildMetadata(): string[] {
    const variables: string[] = [];
    variables[1] = 'File size (bytes)';
    variables[2] = 'SHA-256';
    variables[3] = 'Byte entropy';
    variables[4] = 'Printable ASCII ratio';
    variables[5] = 'First 64 bytes (hex)';
    variables[6] = 'First 64 bytes (latin1 preview)';
    variables[7] = 'First 64 bytes (utf8 preview)';

    for (let i = 0; i < 30; i++) variables[100 + i] = `ASCII string sample #${i + 1}`;

    const decoderNames = [
        'raw utf8 json',
        'raw utf16le json',
        'zlib.inflateSync',
        'zlib.inflateRawSync',
        'zlib.gunzipSync',
        'zlib.brotliDecompressSync'
    ];
    decoderNames.forEach((name, index) => {
        variables[200 + index] = `Decoder attempt: ${name}`;
    });

    return variables;
}

class RpgWolfSavFormat {
    match(fileName: string): boolean {
        const normalized = fileName.toLowerCase();
        return normalized.endsWith('.sav') && !normalized.endsWith('.rpgsave');
    }

    _crypt(data: Buffer, seeds: number[]): Buffer {
        // WOLF RPG LCG-based XOR stream cipher
        // seeds = [header[0], header[3], header[9]]
        const intervals = [1, 2, 5];
        const out = Buffer.from(data); // copy
        
        for (let s = 0; s < seeds.length; s++) {
            const interval = intervals[s];
            let currentSeed = seeds[s];
            
            for (let i = 0; i < out.length; i += interval) {
                // LCG: seed = (seed * 0x343FD + 0x269EC3) & 0xFFFFFFFF
                currentSeed = Math.imul(currentSeed, 0x343FD) + 0x269EC3;
                currentSeed >>>= 0; // force unsigned 32-bit
                
                // XOR with top 3 bits
                const keystream = (currentSeed >>> 28) & 7;
                out[i] ^= keystream;
            }
        }
        return out;
    }

    async decode(rawData: Buffer, paths: any, fileName: string): Promise<any> {
        console.log(`[WOLF-SAV] decode called for file: ${fileName}, length: ${rawData.length}`);
        if (rawData.length < 20) {
            throw new Error("File too short to be a valid WOLF RPG save.");
        }
        
        const header = rawData.subarray(0, 20);
        const payload = rawData.subarray(20);
        const seeds = [header[0], header[3], header[9]];
        console.log(`[WOLF-SAV] decode header: ${header.toString('hex')}`);
        console.log(`[WOLF-SAV] decode seeds: ${JSON.stringify(seeds)}`);
        
        // Decrypt payload
        const decrypted = this._crypt(payload, seeds);
        console.log(`[WOLF-SAV] decrypted payload length: ${decrypted.length}`);
        
        // Search for the global variable array length (usually 800)
        // In Little Endian: 800 = 0x0320 -> [0x20, 0x03, 0x00, 0x00]
        let varArrayOffset = -1;
        for (let i = 0; i < decrypted.length - 4; i++) {
            if (decrypted.readInt32LE(i) === 800) {
                varArrayOffset = i + 4; // Start of the array elements
                break;
            }
        }
        console.log(`[WOLF-SAV] varArrayOffset found at: ${varArrayOffset}`);
        
        const variables: Record<number, number> = {};
        if (varArrayOffset !== -1) {
            for (let i = 0; i < 800; i++) {
                if (varArrayOffset + i * 4 + 4 > decrypted.length) break;
                variables[i] = decrypted.readInt32LE(varArrayOffset + i * 4);
            }
        }
        console.log(`[WOLF-SAV] decode finished. variables[7] (Gold) = ${variables[7]}`);

        return {
            $type: 'RpgWolfSavBinaryInspection',
            fileName,
            format: 'rpg-wolf-sav',
            variables: variables,
            switches: {},
            items: {},
            weapons: {},
            armors: {},
            rawBase64: rawData.toString('base64'), // Store original just in case
            _decryptedBase64: decrypted.toString('base64'),
            _varArrayOffset: varArrayOffset,
            canSemanticEdit: true
        };
    }

    async encode(jsonData: any): Promise<Buffer> {
        console.log(`[WOLF-SAV] encode called for file: ${jsonData.fileName}`);
        if (!jsonData || jsonData.$type !== 'RpgWolfSavBinaryInspection') {
            throw new Error('Invalid RPG/Wolf .sav inspection payload');
        }

        const rawData = Buffer.from(jsonData.rawBase64 || '', 'base64');
        const header = rawData.subarray(0, 20);
        const seeds = [header[0], header[3], header[9]];
        
        const decrypted = Buffer.from(jsonData._decryptedBase64 || '', 'base64');
        const varArrayOffset = jsonData._varArrayOffset;
        console.log(`[WOLF-SAV] encode seeds: ${JSON.stringify(seeds)}`);
        console.log(`[WOLF-SAV] encode varArrayOffset: ${varArrayOffset}`);
        
        if (varArrayOffset !== -1 && jsonData.variables) {
            console.log(`[WOLF-SAV] encode writing variables...`);
            console.log(`[WOLF-SAV] variables[7] value to write: ${jsonData.variables[7]}`);
            for (const [key, value] of Object.entries(jsonData.variables)) {
                const index = Number.parseInt(key);
                if (!Number.isNaN(index) && index < 800) {
                    const offset = varArrayOffset + index * 4;
                    if (offset + 4 <= decrypted.length) {
                        decrypted.writeInt32LE(Number.parseInt(value as string), offset);
                    }
                }
            }
        }

        // Re-encrypt the payload
        const reEncryptedPayload = this._crypt(decrypted, seeds);
        
        // Construct a safe, mutable copy of the header and update the checksum (payload sum LSB)
        const headerCopy = Buffer.from(header);
        let sum = 0;
        for (let i = 0; i < decrypted.length; i++) {
            sum = (sum + decrypted[i]) & 0xFF;
        }
        console.log(`[WOLF-SAV] decrypted payload byte sum (lower 8 bits): 0x${sum.toString(16).toUpperCase()}`);
        console.log(`[WOLF-SAV] original header checksum byte:        0x${header[2].toString(16).toUpperCase()}`);
        console.log(`[WOLF-SAV] writing new checksum byte to header:  0x${sum.toString(16).toUpperCase()}`);
        headerCopy[2] = sum;
        
        // Construct final file
        const finalFile = Buffer.concat([headerCopy, reEncryptedPayload]);
        console.log(`[WOLF-SAV] final encoded file length: ${finalFile.length}`);
        return finalFile;
    }


    async resolveDbFile(dataDir: string): Promise<string | null> {
        const files = [
            'SysDatabase.project',
            'SysDataBase.project',
            'SysDatabase.dat',
            'SysDataBase.dat'
        ];
        for (const file of files) {
            const p = path.join(dataDir, file);
            try {
                await fs.access(p);
                return p;
            } catch {
                // Try next
            }
        }
        return null;
    }

    extractStringsFromBuffer(buffer: Buffer): string[] {
        const strings: string[] = [];
        let currentStr: number[] = [];
        for (let i = 0; i < buffer.length; i++) {
            const b = buffer[i];
            if ((b >= 0x20 && b <= 0x7E) || b >= 0x80) {
                currentStr.push(b);
            } else {
                if (currentStr.length >= 2) {
                    try {
                        const s = Buffer.from(currentStr).toString('utf8');
                        if (/[^\x00-\x7F]/.test(s) || /[a-zA-Z0-9]/.test(s)) {
                            strings.push(s);
                        }
                    } catch (e) {
                        console.warn('[WOLF-SAV] Failed to decode string candidate:', e);
                    }
                }
                currentStr = [];
            }
        }
        return strings;
    }

    async metadata(jsonData: any, paths: any, fileName: string): Promise<any> {
        const metadata: any = {
            variables: [],
            switches: [],
            items: {},
            weapons: {},
            armors: {},
            gameTitle: 'WOLF RPG Game'
        };

        if (!paths?.exeDir) return metadata;
        
        try {
            const dataDir = path.join(paths.exeDir, 'Data', 'BasicData');
            const dbFile = await this.resolveDbFile(dataDir);

            if (dbFile) {
                const buffer = await fs.readFile(dbFile);
                const strings = this.extractStringsFromBuffer(buffer);

                // Look for '通常変数名' (Normal Variable Names)
                const markerIndex = strings.findIndex(s => s.includes('通常変数名'));
                if (markerIndex !== -1) {
                    for (let i = 0; i < 800; i++) {
                        if (markerIndex + 1 + i < strings.length) {
                            let name = strings[markerIndex + 1 + i];
                            if (name && !name.includes('<なし>') && !name.includes('<変化なし>')) {
                                metadata.variables[i] = name.replaceAll('\0', '').trim();
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[SAVE-EDITOR] Failed to parse WOLF RPG SysDatabase:', e);
        }

        // Generate fallbacks for any missing variables, since Wolf allows 800 normally
        for (let i = 0; i < 800; i++) {
            if (!metadata.variables[i]) {
                metadata.variables[i] = `Variable #${i}`;
            }
        }

        return metadata;
    }
}

const format = new RpgWolfSavFormat();
export default format;