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
        if (rawData.length < 20) {
            throw new Error("File too short to be a valid WOLF RPG save.");
        }
        
        const header = rawData.subarray(0, 20);
        const payload = rawData.subarray(20);
        const seeds = [header[0], header[3], header[9]];
        console.log(`[WOLF-SAV] decode header: ${header.toString('hex')}`);
        console.log(`[WOLF-SAV] decode seeds: ${JSON.stringify(seeds)}`);
        
        // Decrypt payload with 3-seed LCG stream cipher
        const decrypted = this._crypt(payload, seeds);
        console.log(`[WOLF-SAV] decrypted payload length: ${decrypted.length}`);

        // Read Game Title if header format is present
        let gameTitle = 'WOLF RPG Game';
        if (decrypted.length >= 3) {
            const titleLen = decrypted.readUInt16LE(1);
            if (titleLen > 0 && titleLen < 256 && 3 + titleLen <= decrypted.length) {
                gameTitle = decrypted.subarray(3, 3 + titleLen).toString('utf8').split('\0')[0].trim() || 'WOLF RPG Game';
            }
        }
        console.log(`[WOLF-SAV] detected gameTitle: "${gameTitle}"`);

        // 1. Locate System Variables Block (Tag 10 / aux_n14)
        let sysVarOffset = -1;
        let sysVarCount = 0;
        for (let i = 0; i < decrypted.length - 8; i++) {
            if (decrypted.readInt32LE(i) === 10) {
                const count = decrypted.readInt32LE(i + 4);
                if (count >= 50 && count <= 5000 && (count % 10 === 0 || count === 502 || count === 800)) {
                    if (i + 8 + count * 4 <= decrypted.length) {
                        sysVarOffset = i + 8;
                        sysVarCount = count;
                        break;
                    }
                }
            }
        }

        // Fallback: search for flat variable array without Tag 10
        if (sysVarOffset === -1) {
            for (let i = 0; i < decrypted.length - 4; i++) {
                const count = decrypted.readInt32LE(i);
                if (count >= 50 && count <= 5000 && count % 10 === 0) {
                    if (i + 4 + count * 4 <= decrypted.length) {
                        sysVarOffset = i + 4;
                        sysVarCount = count;
                        break;
                    }
                }
            }
        }

        // 2. Locate Database Table Matrix (n: after "save/system.sav\0")
        let matrixOffset = -1;
        let numTables = 0;
        const sysSavRegex = /save\/system\.sav\0/gi;
        const decLatin1 = decrypted.toString('latin1');
        let match: RegExpExecArray | null;
        while ((match = sysSavRegex.exec(decLatin1)) !== null) {
            const afterStr = match.index + match[0].length;
            if (afterStr + 8 <= decrypted.length) {
                const tCount = decrypted.readInt32LE(afterStr);
                const firstMarker = decrypted.readUInt8(afterStr + 4);
                if (tCount >= 10 && tCount <= 2000 && firstMarker === 100) {
                    matrixOffset = afterStr + 5;
                    numTables = tCount;
                    break;
                }
            }
        }

        console.log(`[WOLF-SAV] sysVarOffset: ${sysVarOffset} (count: ${sysVarCount}), matrixOffset: ${matrixOffset} (numTables: ${numTables})`);
        
        const variables: Record<string, number> = {};
        const tables: Record<number, Record<number, number>> = {};
        const aux_n14: Record<string, Record<number, number>> = {};

        // Case A: Game has Database Table Matrix (e.g. 吸血鬼○○日記)
        if (matrixOffset !== -1) {
            // Extract System Variables (aux_n14)
            if (sysVarOffset !== -1) {
                const aux0: Record<number, number> = {};
                for (let v = 0; v < sysVarCount; v++) {
                    const off = sysVarOffset + v * 4;
                    const val = decrypted.readInt32LE(off);
                    if (val !== 0) aux0[v] = val;
                    variables[`sys_${v}`] = val;
                }
                aux_n14['0'] = aux0;
            }

            // Extract Table Matrix (n)
            for (let t = 0; t < numTables; t++) {
                const tVars: Record<number, number> = {};
                let hasNonZero = false;
                const tableStart = matrixOffset + t * 401;
                for (let v = 0; v < 100; v++) {
                    const off = tableStart + v * 4;
                    if (off + 4 > decrypted.length) break;
                    const val = decrypted.readInt32LE(off);
                    variables[`${t * 100 + v}`] = val;
                    if (val !== 0) {
                        tVars[v] = val;
                        hasNonZero = true;
                    }
                }
                if (hasNonZero) {
                    tables[t] = tVars;
                }
            }
        } 
        // Case B: Game has Flat System Variables only (e.g. Sister Monochrome Fantasy)
        else if (sysVarOffset !== -1) {
            for (let v = 0; v < sysVarCount; v++) {
                const off = sysVarOffset + v * 4;
                const val = decrypted.readInt32LE(off);
                variables[`${v}`] = val;
            }
        }
        
        console.log(`[WOLF-SAV] decode finished. Total variables extracted: ${Object.keys(variables).length}, active tables: ${Object.keys(tables).length}`);

        return {
            $type: 'RpgWolfSavBinaryInspection',
            fileName,
            gameTitle,
            format: 'rpg-wolf-sav',
            variables: variables,
            tables: tables,
            aux_n14: aux_n14,
            switches: {},
            items: {},
            weapons: {},
            armors: {},
            rawBase64: rawData.toString('base64'),
            _decryptedBase64: decrypted.toString('base64'),
            _sysVarOffset: sysVarOffset,
            _sysVarCount: sysVarCount,
            _matrixOffset: matrixOffset,
            _numTables: numTables,
            canSemanticEdit: true
        };
    }

    async encode(jsonData: any): Promise<Buffer> {
        console.log(`[WOLF-SAV] encode called for file: ${jsonData?.fileName}`);
        if (!jsonData || (jsonData.$type !== 'RpgWolfSavBinaryInspection' && !jsonData.rawBase64)) {
            throw new Error('Invalid RPG/Wolf .sav inspection payload');
        }

        const rawData = Buffer.from(jsonData.rawBase64 || '', 'base64');
        const header = rawData.subarray(0, 20);
        const seeds = [header[0], header[3], header[9]];
        
        const decrypted = Buffer.from(jsonData._decryptedBase64 || '', 'base64');
        const sysVarOffset = jsonData._sysVarOffset ?? -1;
        const matrixOffset = jsonData._matrixOffset ?? -1;

        console.log(`[WOLF-SAV] encode seeds: ${JSON.stringify(seeds)}`);
        console.log(`[WOLF-SAV] encode sysVarOffset: ${sysVarOffset}, matrixOffset: ${matrixOffset}`);
        
        if (jsonData.variables) {
            console.log(`[WOLF-SAV] encode writing variables...`);
            for (const [key, value] of Object.entries(jsonData.variables)) {
                const intVal = Number.parseInt(value as string, 10);
                if (Number.isNaN(intVal)) continue;

                if (key.startsWith('sys_') && sysVarOffset !== -1) {
                    const idx = Number.parseInt(key.replace('sys_', ''), 10);
                    if (!Number.isNaN(idx)) {
                        const offset = sysVarOffset + idx * 4;
                        if (offset + 4 <= decrypted.length) {
                            decrypted.writeInt32LE(intVal, offset);
                        }
                    }
                } else {
                    const idx = Number.parseInt(key, 10);
                    if (!Number.isNaN(idx)) {
                        if (matrixOffset !== -1) {
                            const t = Math.floor(idx / 100);
                            const v = idx % 100;
                            const offset = matrixOffset + t * 401 + v * 4;
                            if (offset + 4 <= decrypted.length) {
                                decrypted.writeInt32LE(intVal, offset);
                            }
                        } else if (sysVarOffset !== -1) {
                            const offset = sysVarOffset + idx * 4;
                            if (offset + 4 <= decrypted.length) {
                                decrypted.writeInt32LE(intVal, offset);
                            }
                        }
                    }
                }
            }
        }

        // Re-encrypt the payload
        const reEncryptedPayload = this._crypt(decrypted, seeds);
        
        // Construct a safe, mutable copy of the header and update the checksum (payload sum LSB)
        const headerCopy = Buffer.from(header);
        let sum = 0;
        for (const byte of decrypted) {
            sum = (sum + byte) & 0xFF;
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