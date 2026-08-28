import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { YumeEngine } from '@yumeshelf/engine';

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
        .match(new RegExp(String.raw`[\x20-\x7e]{${minLength},}`, 'g'));

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
        let statusText = `${attempt.label}: ${attempt.error}`;
        if (attempt.ok) {
            const sizeText = attempt.decodedSize ? ` (${attempt.decodedSize} bytes)` : '';
            statusText = `${attempt.label}: OK${sizeText}`;
        }
        variables[200 + index] = statusText;
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

const metadataCache = new Map<string, { dbFile: string | null; mtime: number; customNames: Record<number, string> }>();

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
        const result = await YumeEngine.decodeSaveFile('wolf-sav', rawData, { fileName });
        if (result) {
            result.fileName = fileName;
        }
        return result;
    }

    async encode(jsonData: any): Promise<Buffer> {
        console.log(`[WOLF-SAV] encode called for file: ${jsonData?.fileName}`);
        return YumeEngine.encodeSaveFile('wolf-sav', jsonData);
    }

    async metadata(jsonData: any, paths: any, fileName: string): Promise<any> {
        const metadata: any = {
            variables: {},
            switches: {},
            items: {},
            weapons: {},
            armors: {},
            gameTitle: jsonData?.gameTitle || 'WOLF RPG Game'
        };

        if (!paths?.exeDir) return metadata;
        
        try {
            const dataDir = path.join(paths.exeDir, 'Data', 'BasicData');
            
            async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }

            let dbFile: string | null = path.join(dataDir, 'SysDatabase.project');
            if (!(await exists(dbFile))) dbFile = path.join(dataDir, 'SysDataBase.project');
            if (!(await exists(dbFile))) dbFile = path.join(dataDir, 'SysDatabase.dat');
            if (!(await exists(dbFile))) dbFile = path.join(dataDir, 'SysDataBase.dat');
            if (!(await exists(dbFile))) dbFile = null;

            if (dbFile) {
                const stat = await fs.stat(dbFile);
                const currentMtime = stat.mtimeMs;
                const cached = metadataCache.get(paths.exeDir);

                if (cached?.dbFile === dbFile && cached.mtime === currentMtime) {
                    console.log(`[WOLF-SAV] metadata cache hit for: ${paths.exeDir} (${Object.keys(cached.customNames).length} custom names)`);
                    metadata.variables = { ...cached.customNames };
                    return metadata;
                }

                console.log(`[WOLF-SAV] extracting fresh metadata from: ${dbFile}`);
                const buffer = await fs.readFile(dbFile);
                
                // Robust heuristic string extraction
                const strings: string[] = [];
                let currentStr: number[] = [];
                for (const b of buffer) {
                    if ((b >= 0x20 && b <= 0x7E) || b >= 0x80) {
                        currentStr.push(b);
                    } else {
                        if (currentStr.length >= 2) {
                            try {
                                const s = Buffer.from(currentStr).toString('utf8');
                                if (/[^\x00-\x7F]/.test(s) || /[a-zA-Z0-9]/.test(s)) {
                                    strings.push(s);
                                }
                            } catch {}
                        }
                        currentStr = [];
                    }
                }

                // Look for '通常変数名' (Normal Variable Names)
                const customNames: Record<number, string> = {};
                const markerIndex = strings.findIndex(s => s.includes('通常変数名'));
                if (markerIndex !== -1) {
                    for (let i = 0; i < 800; i++) {
                        if (markerIndex + 1 + i < strings.length) {
                            let name = strings[markerIndex + 1 + i];
                            if (name && !name.includes('<なし>') && !name.includes('<変化なし>')) {
                                customNames[i] = name.replaceAll('\0', '').trim();
                            }
                        }
                    }
                }

                metadataCache.set(paths.exeDir, {
                    dbFile,
                    mtime: currentMtime,
                    customNames
                });
                metadata.variables = { ...customNames };
            }
        } catch (e) {
            console.warn('[SAVE-EDITOR] Failed to parse WOLF RPG SysDatabase:', e);
        }

        return metadata;
    }
}

const format = new RpgWolfSavFormat();
export default format;