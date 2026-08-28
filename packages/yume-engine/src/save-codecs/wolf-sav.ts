import { SaveCodecError } from './errors.js';
import { sanitizeDeep } from './sanitize.js';

export class WolfSavSaveCodec {
  private static crypt(data: Buffer, seeds: number[]): Buffer {
    const intervals = [1, 2, 5];
    const out = Buffer.from(data);

    for (let s = 0; s < seeds.length; s++) {
      const interval = intervals[s];
      let currentSeed = seeds[s];

      for (let i = 0; i < out.length; i += interval) {
        currentSeed = Math.imul(currentSeed, 0x343fd) + 0x269ec3;
        currentSeed >>>= 0;
        const keystream = (currentSeed >>> 28) & 7;
        out[i] ^= keystream;
      }
    }
    return out;
  }

  static decode(rawData: Buffer): any {
    if (rawData.length < 20) {
      throw new SaveCodecError(
        'File too short to be a valid WOLF RPG save (minimum 20 bytes required)',
        'PARSE_FAILED'
      );
    }

    const header = rawData.subarray(0, 20);
    const payload = rawData.subarray(20);
    const seeds = [header[0], header[3], header[9]];

    // Decrypt payload with 3-seed LCG stream cipher
    const decrypted = WolfSavSaveCodec.crypt(payload, seeds);

    // Validate Checksum (header[2] is lower 8-bit sum of decrypted payload)
    let sum = 0;
    for (const byte of decrypted) {
      sum = (sum + byte) & 0xff;
    }

    if (header[2] !== sum) {
      throw new SaveCodecError(
        `Wolf RPG save checksum mismatch: expected 0x${header[2].toString(16)}, calculated 0x${sum.toString(16)}`,
        'CHECKSUM_FAILED'
      );
    }

    // Read Game Title if header format is present
    let gameTitle = 'WOLF RPG Game';
    if (decrypted.length >= 3) {
      const titleLen = decrypted.readUInt16LE(1);
      if (titleLen > 0 && titleLen < 256 && 3 + titleLen <= decrypted.length) {
        gameTitle =
          decrypted
            .subarray(3, 3 + titleLen)
            .toString('utf8')
            .split('\0')[0]
            .trim() || 'WOLF RPG Game';
      }
    }

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

    const variables: Record<string, number> = {};
    const tables: Record<number, Record<number, number>> = {};
    const aux_n14: Record<string, Record<number, number>> = {};

    if (matrixOffset !== -1) {
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
    } else if (sysVarOffset !== -1) {
      for (let v = 0; v < sysVarCount; v++) {
        const off = sysVarOffset + v * 4;
        const val = decrypted.readInt32LE(off);
        variables[`${v}`] = val;
        variables[`sys_${v}`] = val;
      }
    }

    const result = {
      $type: 'RpgWolfSavBinaryInspection',
      gameTitle,
      format: 'rpg-wolf-sav',
      variables,
      tables,
      aux_n14,
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
      canSemanticEdit: true,
    };

    return sanitizeDeep(result);
  }

  static encode(jsonData: any): Buffer {
    if (!jsonData?.rawBase64 || !jsonData?._decryptedBase64) {
      throw new SaveCodecError(
        'Invalid RPG/Wolf .sav payload: missing raw or decrypted binary base64 buffer',
        'PARSE_FAILED'
      );
    }

    const rawData = Buffer.from(jsonData.rawBase64, 'base64');
    if (rawData.length < 20) {
      throw new SaveCodecError(
        'Invalid RPG/Wolf .sav binary data: header must be at least 20 bytes',
        'PARSE_FAILED'
      );
    }

    const header = rawData.subarray(0, 20);
    const seeds = [header[0], header[3], header[9]];
    const decrypted = Buffer.from(jsonData._decryptedBase64, 'base64');
    const sysVarOffset = jsonData._sysVarOffset ?? -1;
    const matrixOffset = jsonData._matrixOffset ?? -1;

    if (jsonData.variables && typeof jsonData.variables === 'object') {
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

    // Re-encrypt payload
    const reEncryptedPayload = WolfSavSaveCodec.crypt(decrypted, seeds);

    // Compute checksum (sum of decrypted payload bytes modulo 256)
    const headerCopy = Buffer.from(header);
    let sum = 0;
    for (const byte of decrypted) {
      sum = (sum + byte) & 0xff;
    }
    headerCopy[2] = sum;

    return Buffer.concat([headerCopy, reEncryptedPayload]);
  }
}
