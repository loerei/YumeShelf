import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as zlib from 'node:zlib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import {
  YumeEngine,
  SaveCodecError,
  PureJsonSaveCodec,
  KeyedJsonSaveCodec,
  RpgMakerMvSaveCodec,
  RpgMakerMzSaveCodec,
  WolfSavSaveCodec,
  RenpyPickleSaveCodec,
  BakinSgsSaveCodec,
  SandboxedPickleParser,
  StalenessTracker,
  PickleGlobal,
  PickleInstance,
  ZipContainer,
  LZString,
  safeJsonParse,
  sanitizeDeep,
} from '../dist/index.js';

describe('Headless Save Codecs & Sandboxing (@yumeshelf/engine)', () => {
  describe('SaveCodecError Domain Error Hierarchy', () => {
    it('instantiates typed SaveCodecError with specific codes', () => {
      const err1 = new SaveCodecError('Checksum failure', 'CHECKSUM_FAILED');
      assert.equal(err1.name, 'SaveCodecError');
      assert.equal(err1.code, 'CHECKSUM_FAILED');
      assert.ok(err1 instanceof Error);
      assert.ok(err1 instanceof SaveCodecError);

      const err2 = new SaveCodecError('Decompression error', 'DECOMPRESSION_FAILED');
      assert.equal(err2.code, 'DECOMPRESSION_FAILED');

      const err3 = new SaveCodecError('Parse syntax error', 'PARSE_FAILED');
      assert.equal(err3.code, 'PARSE_FAILED');

      const err4 = new SaveCodecError('Unsupported format', 'UNSUPPORTED_FORMAT');
      assert.equal(err4.code, 'UNSUPPORTED_FORMAT');
    });
  });

  describe('Prototype Pollution Defense', () => {
    it('strips __proto__, constructor, and prototype from parsed JSON objects', () => {
      const maliciousJson =
        '{"title":"Hero","__proto__":{"polluted":"yes"},"constructor":{"prototype":{"hacked":true}},"nested":{"prototype":"bad","score":100}}';

      const parsed = safeJsonParse(maliciousJson);
      assert.equal(parsed.title, 'Hero');
      assert.equal(parsed.nested.score, 100);
      assert.equal((parsed as any).__proto__?.polluted, undefined);
      assert.equal((parsed as any).constructor?.prototype?.hacked, undefined);
      assert.equal(parsed.nested.prototype, undefined);

      // Verify global Object.prototype was NOT polluted
      assert.equal(({} as any).polluted, undefined);
      assert.equal(({} as any).hacked, undefined);
    });

    it('sanitizeDeep recursively strips dangerous keys across nested structures and arrays', () => {
      const complexObject: any = {
        name: 'GameSave',
        items: [
          { id: 1, __proto__: { evil: true } },
          { id: 2, constructor: 'evil' },
        ],
        stats: {
          hp: 100,
          prototype: 'corrupt',
        },
      };

      const sanitized = sanitizeDeep(complexObject);
      assert.equal(sanitized.name, 'GameSave');
      assert.equal(sanitized.items[0].id, 1);
      assert.equal(sanitized.items[0].evil, undefined);
      assert.equal(sanitized.items[1].id, 2);
      assert.equal(sanitized.items[1].constructor, Object);
      assert.equal(sanitized.stats.hp, 100);
      assert.equal(sanitized.stats.prototype, undefined);
      assert.equal(({} as any).evil, undefined);
    });
  });

  describe('Pure JSON Codec (pure-json)', () => {
    it('decodes and encodes pure JSON save files with roundtrip fidelity', async () => {
      const sampleData = {
        player: 'Alice',
        level: 42,
        gold: 9999,
        inventory: ['Potion', 'Elixir'],
      };

      const rawBuffer = Buffer.from(JSON.stringify(sampleData), 'utf8');

      // Decode
      const decoded = await YumeEngine.decodeSaveFile('pure-json', rawBuffer);
      assert.equal(decoded.player, 'Alice');
      assert.equal(decoded.level, 42);
      assert.equal(decoded.gold, 9999);
      assert.equal(decoded.$type, 'PureJsonSave');

      // Modify
      decoded.gold = 50000;

      // Encode
      const encodedBuffer = await YumeEngine.encodeSaveFile('pure-json', decoded);
      const reDecoded = JSON.parse(encodedBuffer.toString('utf8'));
      assert.equal(reDecoded.gold, 50000);
      assert.equal(reDecoded.player, 'Alice');
      assert.equal(reDecoded.$type, undefined); // Internal $type stripped on encode
    });

    it('throws typed SaveCodecError on corrupted JSON', async () => {
      const corruptBuffer = Buffer.from('{ player: "Alice", invalid_json }', 'utf8');

      await assert.rejects(
        async () => {
          await YumeEngine.decodeSaveFile('pure-json', corruptBuffer);
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          return true;
        }
      );
    });
  });

  describe('Keyed JSON Codec (keyed-json)', () => {
    it('decodes and encodes reverse base64 key-wrapped JSON with 100% fidelity', async () => {
      const sample = { partyGold: 12345, character: 'Sora', flags: [true, false, true] };
      const secretKey = 'SpecialSecretKey99';

      // Manually construct keyed json
      const payload = secretKey + JSON.stringify(sample) + secretKey;
      const b64 = Buffer.from(payload, 'utf8').toString('base64');
      const reversed = b64.split('').reverse().join('');
      const rawBuffer = Buffer.from(reversed, 'utf8');

      // Decode
      const decoded = await YumeEngine.decodeSaveFile('keyed-json', rawBuffer, {
        gameKey: secretKey,
      });
      assert.equal(decoded.partyGold, 12345);
      assert.equal(decoded.character, 'Sora');
      assert.equal(decoded.$type, 'SimpleKeyedSave');

      // Modify and re-encode
      decoded.partyGold = 99999;
      const encodedBuffer = await YumeEngine.encodeSaveFile('keyed-json', decoded, {
        gameKey: secretKey,
      });

      // Decode again
      const reDecoded = await YumeEngine.decodeSaveFile('keyed-json', encodedBuffer, {
        gameKey: secretKey,
      });
      assert.equal(reDecoded.partyGold, 99999);
      assert.equal(reDecoded.character, 'Sora');
    });

    it('throws SaveCodecError when keyed payload is unparseable', async () => {
      const corruptBuffer = Buffer.from('NOT_VALID_BASE64_AT_ALL!!!', 'utf8');
      await assert.rejects(
        async () => {
          await YumeEngine.decodeSaveFile('keyed-json', corruptBuffer);
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          return true;
        }
      );
    });
  });

  describe('RPG Maker MV Codec (lz-string / .rpgsave)', () => {
    it('decodes and encodes LZString base64 compressed RPG Maker MV save data', async () => {
      const mvData = {
        actors: { _data: [{ name: 'Harold', level: 10, hp: 450 }] },
        party: { _gold: 1500, _steps: 320 },
        system: { _saveCount: 4, _versionId: 101 },
      };

      const compressedBase64 = LZString.compressToBase64(JSON.stringify(mvData));
      const rawBuffer = Buffer.from(compressedBase64, 'utf8');

      // Decode
      const decoded = await YumeEngine.decodeSaveFile('rpg-maker-mv', rawBuffer);
      assert.equal(decoded.party._gold, 1500);
      assert.equal(decoded.actors._data[0].name, 'Harold');

      // Modify and re-encode
      decoded.party._gold = 999999;
      const encodedBuffer = await YumeEngine.encodeSaveFile('rpg-maker-mv', decoded);

      // Re-decode
      const reDecoded = await YumeEngine.decodeSaveFile('rpg-maker-mv', encodedBuffer);
      assert.equal(reDecoded.party._gold, 999999);
    });

    it('throws SaveCodecError on empty RPG Maker MV save file', async () => {
      const emptyBuffer = Buffer.from('', 'utf8');
      await assert.rejects(
        async () => {
          await YumeEngine.decodeSaveFile('rpg-maker-mv', emptyBuffer);
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          return true;
        }
      );
    });
  });

  describe('RPG Maker MZ Codec (zlib / .rmmzsave)', () => {
    it('decodes and encodes zlib-compressed RPG Maker MZ saves', async () => {
      const mzData = {
        party: { _gold: 7777 },
        system: { _saveCount: 1 },
        variables: { _data: [0, 10, 20, 30] },
      };

      const jsonStr = JSON.stringify(mzData);
      const deflated = zlib.deflateSync(Buffer.from(jsonStr, 'utf8'));

      // Convert to MZ UTF-8 string format
      let str = '';
      for (const byte of deflated) {
        str += String.fromCodePoint(byte);
      }
      const rawBuffer = Buffer.from(str, 'utf8');

      // Decode
      const decoded = await YumeEngine.decodeSaveFile('rpg-maker-mz', rawBuffer);
      assert.equal(decoded.party._gold, 7777);
      assert.deepEqual(decoded.variables._data, [0, 10, 20, 30]);

      // Modify and re-encode
      decoded.party._gold = 88888;
      const encodedBuffer = await YumeEngine.encodeSaveFile('rpg-maker-mz', decoded);

      // Re-decode
      const reDecoded = await YumeEngine.decodeSaveFile('rpg-maker-mz', encodedBuffer);
      assert.equal(reDecoded.party._gold, 88888);
    });

    it('throws SaveCodecError on corrupt zlib stream', async () => {
      const corruptBuffer = Buffer.from([0x78, 0x9c, 0xff, 0xff, 0x00, 0x00]);
      await assert.rejects(
        async () => {
          await YumeEngine.decodeSaveFile('rpg-maker-mz', corruptBuffer);
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'DECOMPRESSION_FAILED');
          return true;
        }
      );
    });
  });

  describe('Wolf RPG Save Codec (wolf-sav)', () => {
    function createSyntheticWolfSave(variables: Record<string, number>): Buffer {
      // 1. Build decrypted payload with Tag 10 system variables block
      const sysVarCount = 50;
      const payload = Buffer.alloc(8 + sysVarCount * 4 + 10);

      // Title header
      payload.writeUInt8(1, 0);
      payload.writeUInt16LE(8, 1);
      payload.write('WolfGame', 3, 8, 'utf8');

      const sysVarOffset = 12;
      payload.writeInt32LE(10, sysVarOffset - 8); // Tag 10
      payload.writeInt32LE(sysVarCount, sysVarOffset - 4); // Count 50

      for (const [k, v] of Object.entries(variables)) {
        const idx = Number.parseInt(k.replace('sys_', ''), 10);
        if (!Number.isNaN(idx) && idx >= 0 && idx < sysVarCount) {
          payload.writeInt32LE(v, sysVarOffset + idx * 4);
        }
      }

      // Calculate payload sum
      let sum = 0;
      for (const byte of payload) {
        sum = (sum + byte) & 0xff;
      }

      // Header (20 bytes)
      const header = Buffer.alloc(20);
      header[0] = 0x41; // seed 0
      header[2] = sum; // checksum byte
      header[3] = 0x5a; // seed 1
      header[9] = 0x1f; // seed 2

      // Encrypt payload with seeds
      const seeds = [header[0], header[3], header[9]];
      const intervals = [1, 2, 5];
      const encrypted = Buffer.from(payload);
      for (let s = 0; s < seeds.length; s++) {
        const interval = intervals[s];
        let currentSeed = seeds[s];
        for (let i = 0; i < encrypted.length; i += interval) {
          currentSeed = Math.imul(currentSeed, 0x343fd) + 0x269ec3;
          currentSeed >>>= 0;
          const keystream = (currentSeed >>> 28) & 7;
          encrypted[i] ^= keystream;
        }
      }

      return Buffer.concat([header, encrypted]);
    }

    it('decodes and encodes Wolf RPG save files with 3-seed LCG stream cipher and checksum', async () => {
      const initialVars: Record<string, number> = {
        '0': 100,
        '1': 250,
        '5': 9999,
      };

      const rawBuffer = createSyntheticWolfSave(initialVars);

      // Decode
      const decoded = await YumeEngine.decodeSaveFile('wolf-sav', rawBuffer);
      assert.equal(decoded.$type, 'RpgWolfSavBinaryInspection');
      assert.equal(decoded.variables['0'], 100);
      assert.equal(decoded.variables['1'], 250);
      assert.equal(decoded.variables['5'], 9999);

      // Modify variables and re-encode
      decoded.variables['5'] = 88888;
      const encodedBuffer = await YumeEngine.encodeSaveFile('wolf-sav', decoded);

      // Verify checksum byte calculated in header[2]
      assert.ok(encodedBuffer.length >= 20);
      assert.notEqual(encodedBuffer[2], 0);

      // Re-decode encoded save
      const reDecoded = await YumeEngine.decodeSaveFile('wolf-sav', encodedBuffer);
      assert.equal(reDecoded.variables['5'], 88888);
      assert.equal(reDecoded.variables['0'], 100);
    });

    it('throws SaveCodecError("PARSE_FAILED") on truncated Wolf SAV buffer (< 20 bytes)', async () => {
      const truncated = Buffer.from([0x01, 0x02, 0x03]);
      await assert.rejects(
        async () => {
          await YumeEngine.decodeSaveFile('wolf-sav', truncated);
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          return true;
        }
      );
    });
  });

  describe('Ren\'Py Pure TypeScript Sandboxed Pickle Parser (renpy-pickle)', () => {
    it('decodes primitive pickle values (integers, strings, booleans, lists, dicts, sets, tuples)', () => {
      // Create pickle protocol 2 stream
      const storeObj = {
        'store.money': 5000,
        'store.playerName': 'Protagonist',
        'store.cleared': true,
        'store.skills': ['Fireball', 'Heal'],
        'store.affinity': { hero: 90, companion: 75 },
      };

      const pickleBuf = SandboxedPickleParser.serialize([storeObj]);
      const parsed = SandboxedPickleParser.parse(pickleBuf);

      assert.ok(Array.isArray(parsed));
      assert.equal(parsed[0]['store.money'], 5000);
      assert.equal(parsed[0]['store.playerName'], 'Protagonist');
      assert.equal(parsed[0]['store.cleared'], true);
      assert.deepEqual(parsed[0]['store.skills'], ['Fireball', 'Heal']);
      assert.equal(parsed[0]['store.affinity'].hero, 90);
    });

    it('decodes and encodes full Ren\'Py .save ZIP containers round-trip', async () => {
      const saveState = {
        'store.money': 12000,
        'store.chapter': 3,
        'store.unlocked_gallery': true,
      };

      // Encode into zip
      const zipBuffer = RenpyPickleSaveCodec.encode(saveState, true);
      assert.ok(zipBuffer.length > 30);
      assert.equal(zipBuffer.readUInt32LE(0), 0x04034b50); // ZIP signature

      // Decode
      const decoded = await YumeEngine.decodeSaveFile('renpy-pickle', zipBuffer);
      assert.equal(decoded.$type, 'RenpySave');
      assert.equal(decoded['store.money'], 12000);
      assert.equal(decoded['store.chapter'], 3);
      assert.equal(decoded['store.unlocked_gallery'], true);

      // Modify and re-encode
      decoded['store.money'] = 999999;
      const modifiedZip = await YumeEngine.encodeSaveFile('renpy-pickle', decoded);

      // Re-decode
      const reDecoded = await YumeEngine.decodeSaveFile('renpy-pickle', modifiedZip);
      assert.equal(reDecoded['store.money'], 999999);
      assert.equal(reDecoded['store.chapter'], 3);
    });

    it('safely deserializes callable and reduction opcodes (GLOBAL, STACK_GLOBAL, NEWOBJ, REDUCE, BUILD) into sandbox instances without code execution', () => {
      // 1. GLOBAL opcode 0x63 ('c') - os.system deserializes to PickleGlobal('os', 'system')
      const globalBuf = Buffer.from([
        0x80, 0x02, 0x63, 0x6f, 0x73, 0x0a, 0x73, 0x79, 0x73, 0x74, 0x65, 0x6d, 0x0a, 0x2e,
      ]);
      const globalParsed = SandboxedPickleParser.parse(globalBuf);
      assert.ok(globalParsed instanceof PickleGlobal);
      assert.equal(globalParsed.module, 'os');
      assert.equal(globalParsed.name, 'system');

      // 2. STACK_GLOBAL opcode 0x93 (protocol 4)
      const stackGlobalBuf = Buffer.from([
        0x80, 0x04, 0x8c, 0x02, 0x6f, 0x73, 0x8c, 0x06, 0x73, 0x79, 0x73, 0x74, 0x65, 0x6d, 0x93, 0x2e,
      ]);
      const stackGlobalParsed = SandboxedPickleParser.parse(stackGlobalBuf);
      assert.ok(stackGlobalParsed instanceof PickleGlobal);
      assert.equal(stackGlobalParsed.module, 'os');
      assert.equal(stackGlobalParsed.name, 'system');

      // 3. renpy.rollback.deleted maps to { $renpy_deleted: true }
      const deletedBuf = Buffer.from([
        0x80, 0x04, 0x8c, 0x0e, 0x72, 0x65, 0x6e, 0x70, 0x79, 0x2e, 0x72, 0x6f, 0x6c, 0x6c, 0x62,
        0x61, 0x63, 0x6b, 0x8c, 0x07, 0x64, 0x65, 0x6c, 0x65, 0x74, 0x65, 0x64, 0x93, 0x2e,
      ]);
      const deletedParsed = SandboxedPickleParser.parse(deletedBuf);
      assert.deepEqual(deletedParsed, { $renpy_deleted: true });

      // 4. NEWOBJ opcode 0x81 on custom class constructs safe PickleInstance
      const newObjBuf = Buffer.from([
        0x80, 0x02, 0x63, 0x6d, 0x79, 0x6d, 0x6f, 0x64, 0x0a, 0x4d, 0x79, 0x43, 0x6c, 0x61, 0x73,
        0x73, 0x0a, 0x29, 0x81, 0x2e,
      ]);
      const newObjParsed = SandboxedPickleParser.parse(newObjBuf);
      assert.ok(newObjParsed instanceof PickleInstance);
      assert.equal(newObjParsed.cls.module, 'mymod');
      assert.equal(newObjParsed.cls.name, 'MyClass');

      // 5. REDUCE opcode 0x52 on callable
      const reduceBuf = Buffer.from([
        0x80, 0x02, 0x63, 0x6d, 0x79, 0x6d, 0x6f, 0x64, 0x0a, 0x6d, 0x79, 0x66, 0x75, 0x6e, 0x63,
        0x0a, 0x28, 0x4b, 0x01, 0x4b, 0x02, 0x74, 0x52, 0x2e,
      ]);
      const reduceParsed = SandboxedPickleParser.parse(reduceBuf);
      assert.ok(reduceParsed instanceof PickleInstance);
      assert.deepEqual(reduceParsed.args, [1, 2]);

      // 6. BUILD opcode 0x62 on PickleInstance populates dict safely and blocks prototype pollution
      const buildBuf = Buffer.from([
        0x80, 0x02, 0x63, 0x6d, 0x79, 0x6d, 0x6f, 0x64, 0x0a, 0x4d, 0x79, 0x43, 0x6c, 0x61, 0x73,
        0x73, 0x0a, 0x29, 0x81, 0x7d, 0x28, 0x8c, 0x05, 0x73, 0x63, 0x6f, 0x72, 0x65, 0x4b, 0x64,
        0x8c, 0x09, 0x5f, 0x5f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x5f, 0x5f, 0x8c, 0x03, 0x62, 0x61,
        0x64, 0x75, 0x62, 0x2e,
      ]);
      const buildParsed = SandboxedPickleParser.parse(buildBuf);
      assert.ok(buildParsed instanceof PickleInstance);
      assert.equal(buildParsed.dict.score, 100);
      assert.equal((buildParsed.dict as any).__proto__?.polluted, undefined);
    });

    it('safely handles protocol 4/5 extended opcodes (BINUNICODE8, BINBYTES8, BYTEARRAY8, PERSID, BINPERSID)', () => {
      // 1. BINUNICODE8 (0x8d)
      const u8Payload = Buffer.from('hello_unicode_8', 'utf8');
      const u8Buf = Buffer.alloc(11 + u8Payload.length + 1);
      u8Buf[0] = 0x80;
      u8Buf[1] = 0x05;
      u8Buf[2] = 0x8d;
      u8Buf.writeBigUInt64LE(BigInt(u8Payload.length), 3);
      u8Payload.copy(u8Buf, 11);
      u8Buf[u8Buf.length - 1] = 0x2e;
      assert.equal(SandboxedPickleParser.parse(u8Buf), 'hello_unicode_8');

      // 2. BINBYTES8 (0x8e)
      const b8Payload = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const b8Buf = Buffer.alloc(11 + b8Payload.length + 1);
      b8Buf[0] = 0x80;
      b8Buf[1] = 0x05;
      b8Buf[2] = 0x8e;
      b8Buf.writeBigUInt64LE(BigInt(b8Payload.length), 3);
      b8Payload.copy(b8Buf, 11);
      b8Buf[b8Buf.length - 1] = 0x2e;
      assert.deepEqual(SandboxedPickleParser.parse(b8Buf), b8Payload);

      // 3. BYTEARRAY8 (0x96)
      const ba8Payload = Buffer.from([0xaa, 0xbb, 0xcc]);
      const ba8Buf = Buffer.alloc(11 + ba8Payload.length + 1);
      ba8Buf[0] = 0x80;
      ba8Buf[1] = 0x05;
      ba8Buf[2] = 0x96;
      ba8Buf.writeBigUInt64LE(BigInt(ba8Payload.length), 3);
      ba8Payload.copy(ba8Buf, 11);
      ba8Buf[ba8Buf.length - 1] = 0x2e;
      assert.deepEqual(SandboxedPickleParser.parse(ba8Buf), ba8Payload);

      // 4. PERSID (0x50) & BINPERSID (0x51)
      const persidBuf = Buffer.from([0x80, 0x02, 0x50, 0x6d, 0x79, 0x5f, 0x70, 0x69, 0x64, 0x0a, 0x2e]);
      assert.deepEqual(SandboxedPickleParser.parse(persidBuf), { $persid: 'my_pid' });

      const binpersidBuf = Buffer.from([
        0x80, 0x02, 0x8c, 0x07, 0x62, 0x69, 0x6e, 0x5f, 0x70, 0x69, 0x64, 0x51, 0x2e,
      ]);
      assert.deepEqual(SandboxedPickleParser.parse(binpersidBuf), { $persid: 'bin_pid' });
    });

    it('scanRootsOffsets accurately skips nested marks and only targets root store variables', () => {
      const storeWithNested = {
        'store.count': 42,
        'store.nested_items': ['sub_a', 'sub_b'],
        'store.nested_map': { inner_key: 'inner_val' },
        'store.player': 'Hero',
      };
      const logBuf = SandboxedPickleParser.serialize([storeWithNested]);
      const scan = SandboxedPickleParser.scanRootsOffsets(logBuf);

      assert.ok(scan.rootsOffsets.has('store.count'));
      assert.ok(scan.rootsOffsets.has('store.player'));
      // Internal list elements and inner_key must NOT be top-level roots
      assert.equal(scan.rootsOffsets.has('sub_a'), false);
      assert.equal(scan.rootsOffsets.has('sub_b'), false);
      assert.equal(scan.rootsOffsets.has('inner_key'), false);
      assert.equal(scan.rootsOffsets.has('inner_val'), false);
    });

    it('preserves hadMemoize opcode when primitive types change during surgical encode', () => {
      const numBuf = SandboxedPickleParser.serializePrimitiveValue(100, true);
      assert.equal(numBuf[numBuf.length - 1], 0x94);

      const boolBuf = SandboxedPickleParser.serializePrimitiveValue(true, true);
      assert.equal(boolBuf[boolBuf.length - 1], 0x94);

      const nullBuf = SandboxedPickleParser.serializePrimitiveValue(null, true);
      assert.equal(nullBuf[nullBuf.length - 1], 0x94);

      const strBuf = SandboxedPickleParser.serializePrimitiveValue('hello', true);
      assert.equal(strBuf[strBuf.length - 1], 0x94);

      // Without memoize
      const unmemoizedNum = SandboxedPickleParser.serializePrimitiveValue(100, false);
      assert.notEqual(unmemoizedNum[unmemoizedNum.length - 1], 0x94);
    });

    it('preserves multi-entry ZIP containers (screenshot.png, json, extra_info, signatures) and performs surgical variable patching', async () => {
      // 1. Build a multi-entry synthetic ZIP matching Ren'Py container structure
      const initialStore = {
        'store.money': 500,
        'store.chapter': 1,
        'store.character_name': 'Protagonist',
      };
      const initialLogPickle = SandboxedPickleParser.serialize([initialStore]);
      const fakeScreenshot = Buffer.from('FAKE_PNG_IMAGE_DATA_BYTES');
      const fakeJson = Buffer.from('{"_version": "1.0", "_save_name": "Test Save"}', 'utf8');
      const fakeExtraInfo = Buffer.from('extra_game_info', 'utf8');
      const fakeRenpyVersion = Buffer.from("Ren'Py 8.3.0", 'utf8');
      const fakeSignatures = Buffer.from('signature test_signature_data\n', 'utf8');

      const originalZip = ZipContainer.buildZip([
        { fileName: 'screenshot.png', data: fakeScreenshot, compressionMethod: 8 },
        { fileName: 'extra_info', data: fakeExtraInfo, compressionMethod: 8 },
        { fileName: 'json', data: fakeJson, compressionMethod: 8 },
        { fileName: 'renpy_version', data: fakeRenpyVersion, compressionMethod: 8 },
        { fileName: 'log', data: initialLogPickle, compressionMethod: 8 },
        { fileName: 'signatures', data: fakeSignatures, compressionMethod: 8 },
      ]);

      // 2. Decode save via YumeEngine
      const decoded = await YumeEngine.decodeSaveFile('renpy-pickle', originalZip);
      assert.equal(decoded.$type, 'RenpySave');
      assert.equal(decoded['store.money'], 500);
      assert.equal(decoded['store.chapter'], 1);
      assert.equal(decoded['store.character_name'], 'Protagonist');

      // 3. Modify existing variable and insert a new variable
      decoded['store.money'] = 999999;
      decoded['store.new_bonus_item'] = 'DragonSword';

      // 4. Encode save with original buffer context
      const modifiedZip = await YumeEngine.encodeSaveFile('renpy-pickle', decoded, {
        options: { originalBuffer: originalZip },
      });

      // 5. Verify all non-log entries are preserved
      const extractedEntries = ZipContainer.extractEntries(modifiedZip);
      const fileNames = extractedEntries.map((e) => e.fileName);
      assert.ok(fileNames.includes('screenshot.png'));
      assert.ok(fileNames.includes('extra_info'));
      assert.ok(fileNames.includes('json'));
      assert.ok(fileNames.includes('renpy_version'));
      assert.ok(fileNames.includes('log'));
      assert.ok(fileNames.includes('signatures'));

      const screenshotEntry = extractedEntries.find((e) => e.fileName === 'screenshot.png')!;
      assert.deepEqual(screenshotEntry.data, fakeScreenshot);
      const jsonEntry = extractedEntries.find((e) => e.fileName === 'json')!;
      assert.deepEqual(jsonEntry.data, fakeJson);

      // 6. Decode modified save and verify variables
      const reDecoded = await YumeEngine.decodeSaveFile('renpy-pickle', modifiedZip);
      assert.equal(reDecoded['store.money'], 999999);
      assert.equal(reDecoded['store.chapter'], 1);
      assert.equal(reDecoded['store.new_bonus_item'], 'DragonSword');
    });

    it('loads, surgically modifies, and verifies real Sukidara save files without corruption', async () => {
      const sukidaraSaveDir = 'D:\\Games\\H Games\\Sukidara-v1.70-pc\\Sukidara-v1.70-pc\\game\\saves';
      const sampleSavePath = path.join(sukidaraSaveDir, '3-4-LT1.save');
      const pythonExe = 'D:\\Games\\H Games\\Sukidara-v1.70-pc\\Sukidara-v1.70-pc\\lib\\py3-windows-x86_64\\python.exe';

      if (!fs.existsSync(sampleSavePath)) {
        return; // Skip if game directory is not mounted on the current machine
      }

      const originalSaveBuf = fs.readFileSync(sampleSavePath);

      // 1. Decode real Ren'Py save
      const decoded = await YumeEngine.decodeSaveFile('renpy-pickle', originalSaveBuf, {
        fileName: '3-4-LT1.save',
        options: { savePath: sampleSavePath },
      });

      assert.equal(decoded.$type, 'RenpySave');
      assert.ok(typeof decoded['store.money'] === 'number');
      const originalMoney = decoded['store.money'];

      // 2. Modify money and insert new variable
      decoded['store.money'] = 987654;
      decoded['store.yumeshelf_test_token'] = 424242;

      // 3. Surgically encode modified save
      const modifiedSaveBuf = await YumeEngine.encodeSaveFile('renpy-pickle', decoded, {
        fileName: '3-4-LT1.save',
        options: { originalBuffer: originalSaveBuf },
      });

      assert.ok(modifiedSaveBuf.length > 30);
      assert.equal(modifiedSaveBuf.readUInt32LE(0), 0x04034b50); // ZIP magic

      // 4. Verify round-trip decoding in YumeEngine
      const reDecoded = await YumeEngine.decodeSaveFile('renpy-pickle', modifiedSaveBuf, {
        fileName: '3-4-LT1.save',
      });
      assert.equal(reDecoded['store.money'], 987654);
      assert.equal(reDecoded['store.yumeshelf_test_token'], 424242);

      // 5. Verify unpickling with Sukidara bundled CPython runtime if available
      if (fs.existsSync(pythonExe)) {
        const tempTestPath = path.join(sukidaraSaveDir, '_headless_test_temp.save');
        try {
          fs.writeFileSync(tempTestPath, modifiedSaveBuf);
          const pyScript = `
import zipfile, pickle, io, sys

with zipfile.ZipFile(r'${tempTestPath.replace(/\\/g, '\\\\')}') as z:
    log_data = z.read('log')

class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if name == 'RevertableList':
            class RL(list):
                def __setstate__(self, s): pass
            return RL
        if name == 'RevertableDict':
            class RD(dict):
                def __setstate__(self, s): pass
            return RD
        if name == 'RevertableSet':
            class RS(set):
                def __setstate__(self, s): pass
            return RS
        class St:
            def __init__(self, *a): pass
            def __setstate__(self, s): pass
        return St

roots, rollback = SafeUnpickler(io.BytesIO(log_data)).load()
assert roots['store.money'] == 987654, f"store.money mismatch: {roots.get('store.money')}"
assert roots['store.yumeshelf_test_token'] == 424242, f"new var mismatch: {roots.get('store.yumeshelf_test_token')}"
print("PYTHON_UNPICKLE_OK")
`;
          const result = child_process.execFileSync(pythonExe, ['-c', pyScript], {
            encoding: 'utf8',
            timeout: 10000,
          });
          assert.ok(result.includes('PYTHON_UNPICKLE_OK'));
        } finally {
          try {
            if (fs.existsSync(tempTestPath)) fs.unlinkSync(tempTestPath);
          } catch {}
        }
      }
    });

    it('loads, surgically modifies, and verifies multi-frame real Sukidara save files (_tracesave-1-LT1.save)', async () => {
      const sukidaraSaveDir = 'D:\\Games\\H Games\\Sukidara-v1.70-pc\\Sukidara-v1.70-pc\\game\\saves';
      const sampleSavePath = path.join(sukidaraSaveDir, '_tracesave-1-LT1.save');
      const pythonExe =
        'D:\\Games\\H Games\\Sukidara-v1.70-pc\\Sukidara-v1.70-pc\\lib\\py3-windows-x86_64\\python.exe';

      if (!fs.existsSync(sampleSavePath)) {
        return; // Skip if game directory is not mounted
      }

      const originalSaveBuf = fs.readFileSync(sampleSavePath);

      // 1. Decode multi-frame save
      const decoded = await YumeEngine.decodeSaveFile('renpy-pickle', originalSaveBuf, {
        fileName: '_tracesave-1-LT1.save',
        options: { savePath: sampleSavePath },
      });

      assert.equal(decoded.$type, 'RenpySave');
      assert.ok(typeof decoded['store.current_inset_id'] === 'number');

      // 2. Modify existing variable in frame 0 and insert new variable before SETITEMS in frame 1
      decoded['store.current_inset_id'] = 777888;
      decoded['store.yumeshelf_multiframe_token'] = 'MultiFrameSuccess';

      // 3. Surgically encode modified save
      const modifiedSaveBuf = await YumeEngine.encodeSaveFile('renpy-pickle', decoded, {
        fileName: '_tracesave-1-LT1.save',
        options: { originalBuffer: originalSaveBuf },
      });

      assert.ok(modifiedSaveBuf.length > 30);
      assert.equal(modifiedSaveBuf.readUInt32LE(0), 0x04034b50);

      // 4. Verify round-trip decoding in YumeEngine
      const reDecoded = await YumeEngine.decodeSaveFile('renpy-pickle', modifiedSaveBuf, {
        fileName: '_tracesave-1-LT1.save',
      });
      assert.equal(reDecoded['store.current_inset_id'], 777888);
      assert.equal(reDecoded['store.yumeshelf_multiframe_token'], 'MultiFrameSuccess');

      // 5. Verify unpickling with Sukidara bundled CPython runtime
      if (fs.existsSync(pythonExe)) {
        const tempTestPath = path.join(sukidaraSaveDir, '_headless_multiframe_temp.save');
        try {
          fs.writeFileSync(tempTestPath, modifiedSaveBuf);
          const pyScript = `
import zipfile, pickle, io, sys

with zipfile.ZipFile(r'${tempTestPath.replace(/\\/g, '\\\\')}') as z:
    log_data = z.read('log')

class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if name == 'RevertableList':
            class RL(list):
                def __setstate__(self, s): pass
            return RL
        if name == 'RevertableDict':
            class RD(dict):
                def __setstate__(self, s): pass
            return RD
        if name == 'RevertableSet':
            class RS(set):
                def __setstate__(self, s): pass
            return RS
        class St:
            def __init__(self, *a): pass
            def __setstate__(self, s): pass
        return St

roots, rollback = SafeUnpickler(io.BytesIO(log_data)).load()
assert roots['store.current_inset_id'] == 777888, f"current_inset_id mismatch: {roots.get('store.current_inset_id')}"
assert roots['store.yumeshelf_multiframe_token'] == 'MultiFrameSuccess', f"new token mismatch: {roots.get('store.yumeshelf_multiframe_token')}"
print("MULTIFRAME_PYTHON_UNPICKLE_OK")
`;
          const result = child_process.execFileSync(pythonExe, ['-c', pyScript], {
            encoding: 'utf8',
            timeout: 10000,
          });
          assert.ok(result.includes('MULTIFRAME_PYTHON_UNPICKLE_OK'));
        } finally {
          try {
            if (fs.existsSync(tempTestPath)) fs.unlinkSync(tempTestPath);
          } catch {}
        }
      }
    });

    it('enforces memory and recursion limit protections', () => {
      // Pickle with infinite nested marks exceeding MAX_STACK_SIZE
      const depth = 25000;
      const stackOverflowBuf = Buffer.alloc(depth + 3);
      stackOverflowBuf[0] = 0x80;
      stackOverflowBuf[1] = 0x02;
      for (let i = 0; i < depth; i++) {
        stackOverflowBuf[2 + i] = 0x28; // MARK
      }
      stackOverflowBuf[depth + 2] = 0x2e; // STOP

      assert.throws(
        () => SandboxedPickleParser.parse(stackOverflowBuf),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          return true;
        }
      );
    });

    it('decodes large Electric Sheep save (1-3-LT1.save, 5MB log, 1M+ opcodes) with early exit and surgically modifies without corruption', async () => {
      const sheepSaveDir = 'D:\\Games\\H Games\\ElectricSheep-0.8.10-pc\\game\\saves';
      const sampleSavePath = path.join(sheepSaveDir, '1-3-LT1.save');
      const pythonExe = 'D:\\Games\\H Games\\ElectricSheep-0.8.10-pc\\lib\\py3-windows-x86_64\\python.exe';

      if (!fs.existsSync(sampleSavePath)) {
        return; // Skip if game directory is not mounted
      }

      const originalSaveBuf = fs.readFileSync(sampleSavePath);

      // 1. Decode real 5MB save via YumeEngine (must finish quickly via early exit)
      const startTime = Date.now();
      const decoded = await YumeEngine.decodeSaveFile('renpy-pickle', originalSaveBuf, {
        fileName: '1-3-LT1.save',
        options: { savePath: sampleSavePath },
      });
      const decodeDuration = Date.now() - startTime;

      assert.equal(decoded.$type, 'RenpySave');
      assert.ok(typeof decoded['store.nightpasscost'] === 'number');
      assert.ok(decodeDuration < 5000, `Decode took too long: ${decodeDuration}ms`);

      // 2. Modify existing store variable and add a new store variable
      decoded['store.nightpasscost'] = 777888;
      decoded['store.yumeshelf_early_exit_token'] = 'EarlyExitBoostSuccess';

      // 3. Surgically encode modified save
      const modifiedSaveBuf = await YumeEngine.encodeSaveFile('renpy-pickle', decoded, {
        fileName: '1-3-LT1.save',
        options: { originalBuffer: originalSaveBuf },
      });

      assert.ok(modifiedSaveBuf.length > 30);
      assert.equal(modifiedSaveBuf.readUInt32LE(0), 0x04034b50); // ZIP magic

      // 4. Verify round-trip decoding in YumeEngine
      const reDecoded = await YumeEngine.decodeSaveFile('renpy-pickle', modifiedSaveBuf, {
        fileName: '1-3-LT1.save',
      });
      assert.equal(reDecoded['store.nightpasscost'], 777888);
      assert.equal(reDecoded['store.yumeshelf_early_exit_token'], 'EarlyExitBoostSuccess');

      // 5. Verify unpickling with Electric Sheep bundled CPython runtime
      if (fs.existsSync(pythonExe)) {
        const tempTestPath = path.join(sheepSaveDir, '_headless_sheep_test_temp.save');
        try {
          fs.writeFileSync(tempTestPath, modifiedSaveBuf);
          const pyScript = `
import zipfile, pickle, io, sys

with zipfile.ZipFile(r'${tempTestPath.replace(/\\/g, '\\\\')}') as z:
    log_data = z.read('log')

class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if name == 'RevertableList':
            class RL(list):
                def __setstate__(self, s): pass
            return RL
        if name == 'RevertableDict':
            class RD(dict):
                def __setstate__(self, s): pass
            return RD
        if name == 'RevertableSet':
            class RS(set):
                def __setstate__(self, s): pass
            return RS
        class St:
            def __init__(self, *a, **k): pass
            def __setstate__(self, s): pass
        return St

roots, rollback = SafeUnpickler(io.BytesIO(log_data)).load()
assert roots['store.nightpasscost'] == 777888, f"nightpasscost mismatch: {roots.get('store.nightpasscost')}"
assert roots['store.yumeshelf_early_exit_token'] == 'EarlyExitBoostSuccess', f"token mismatch: {roots.get('store.yumeshelf_early_exit_token')}"
print("SHEEP_PYTHON_UNPICKLE_OK")
`;
          const result = child_process.execFileSync(pythonExe, ['-c', pyScript], {
            encoding: 'utf8',
            timeout: 15000,
          });
          assert.ok(result.includes('SHEEP_PYTHON_UNPICKLE_OK'));
        } finally {
          try {
            if (fs.existsSync(tempTestPath)) fs.unlinkSync(tempTestPath);
          } catch {}
        }
      }
    });

    it('supports chunked asynchronous parsing with progress reporting and cancellation', async () => {
      // Create a multi-item pickle buffer
      const testObj = {
        'store.gold': 1000,
        'store.name': 'Alice',
        'store.items': [1, 2, 3],
      };
      const pickleBuf = SandboxedPickleParser.serialize([testObj]);

      const progressSnapshots: any[] = [];
      const parsed = await SandboxedPickleParser.parseAsync(pickleBuf, {
        onProgress: (p) => progressSnapshots.push(p),
      });

      assert.ok(Array.isArray(parsed));
      assert.equal(parsed[0]['store.gold'], 1000);

      // Verify standardized progress format with unit: bytes
      if (progressSnapshots.length > 0) {
        const last = progressSnapshots[progressSnapshots.length - 1];
        assert.equal(typeof last.current, 'number');
        assert.equal(typeof last.total, 'number');
        assert.equal(typeof last.percent, 'number');
        assert.equal(last.unit, 'bytes');
        assert.equal(last.pos, last.current);
        assert.equal(last.totalBytes, last.total);
      }

      // Verify cancellation
      await assert.rejects(
        async () => {
          await SandboxedPickleParser.parseAsync(pickleBuf, {
            shouldCancel: () => true,
          });
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.ok(err.message.includes('cancelled'));
          return true;
        }
      );
    });

    it('enforces staleness timeout when parsing stalls without byte progress', async () => {
      const infiniteLoopBuf = Buffer.from([0x80, 0x02, 0x7d, 0x2e]);
      await assert.rejects(
        async () => {
          await SandboxedPickleParser.parseAsync(infiniteLoopBuf, {
            stalenessTimeoutMs: -1, // Force immediate staleness timeout
          });
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.ok(err.message.includes('stalled'));
          return true;
        }
      );
    });

    it('early exits cleanly without parsing trailing rollback log even when globals or instances precede roots dict', () => {
      // Stream structure: PROTO 2, GLOBAL foo.bar, MARK, POP_MARK, EMPTY_DICT (roots), MARK, 'store.key', 123, SETITEMS, trailing unpickled opcodes
      const prefixOpcodes = [
        0x80, 0x02,
        0x63, ...Buffer.from('foo\nbar\n', 'latin1'), // GLOBAL foo.bar
        0x28, // MARK
        0x31, // POP_MARK
        0x7d, // EMPTY_DICT (roots dict)
        0x28, // MARK (roots dict items)
        0x58, 0x09, 0x00, 0x00, 0x00, ...Buffer.from('store.key'), // BINUNICODE
        0x4b, 0x7b, // BININT1 123
        0x75, // SETITEMS
      ];
      // Append 1,000 POP opcodes to simulate a large trailing rollback history
      const trailing = new Array(1000).fill(0x30);
      const fullStream = Buffer.concat([
        Buffer.from(prefixOpcodes),
        Buffer.from(trailing),
        Buffer.from([0x2e]), // STOP
      ]);

      // Verify early exit extracts roots dict immediately
      const parsed = SandboxedPickleParser.parse(fullStream, { earlyExitRoots: true });
      assert.ok(parsed && typeof parsed === 'object');
      assert.equal(parsed['store.key'], 123);

      // Verify scanRootsOffsets correctly identifies rootsOffsets and setitemsPos
      const scan = SandboxedPickleParser.scanRootsOffsets(fullStream);
      assert.notEqual(scan.setitemsPos, -1);
      assert.ok(scan.rootsOffsets.has('store.key'));
      assert.equal(scan.rootsOffsets.get('store.key')?.oldVal, 123);
    });

    it('supports context.options.earlyExit to choose between fast early exit and full rollback parsing', async () => {
      // Stream: PROTO 2, EMPTY_DICT (roots), MARK, 'store.val', 10, SETITEMS, trailing MARK/POP_MARK pairs, STOP
      const trailing = [];
      for (let i = 0; i < 500; i++) {
        trailing.push(0x28, 0x31); // MARK (0x28), POP_MARK (0x31)
      }
      const stream = Buffer.concat([
        Buffer.from([0x80, 0x02, 0x7d, 0x28]),
        Buffer.from([0x58, 0x09, 0x00, 0x00, 0x00]),
        Buffer.from('store.val'),
        Buffer.from([0x4b, 0x0a]),
        Buffer.from([0x75]),
        Buffer.from(trailing),
        Buffer.from([0x2e]), // STOP
      ]);

      // 1. Default (earlyExit: true) fast path with progress completion reporting
      let defaultProgressCalled = false;
      const decodedDefault = await RenpyPickleSaveCodec.decode(stream, {
        fileName: 'test.save',
        options: {
          onProgress: (p) => {
            defaultProgressCalled = true;
            assert.equal(p.unit, 'bytes');
            assert.equal(p.percent, 100);
          },
        },
      });
      assert.equal(decodedDefault['store.val'], 10);
      assert.ok(defaultProgressCalled);

      // 2. Explicit earlyExit: true
      const decodedEarly = await RenpyPickleSaveCodec.decode(stream, {
        fileName: 'test.save',
        options: { earlyExit: true },
      });
      assert.equal(decodedEarly['store.val'], 10);

      // 3. Explicit earlyExit: false parses full history, reports progress, and exposes _rollback non-enumerably
      const streamWithRollback = Buffer.concat([
        Buffer.from([0x80, 0x02, 0x28]), // PROTO 2, MARK
        Buffer.from([0x7d, 0x28, 0x58, 0x09, 0x00, 0x00, 0x00]),
        Buffer.from('store.val'),
        Buffer.from([0x4b, 0x0a, 0x75]), // SETITEMS for roots
        Buffer.from([0x58, 0x08, 0x00, 0x00, 0x00]),
        Buffer.from('rollback'), // second item in tuple: rollback history
        Buffer.from([0x74, 0x2e]), // TUPLE, STOP
      ]);

      let progressReported = false;
      const decodedFull = await RenpyPickleSaveCodec.decode(streamWithRollback, {
        fileName: 'test.save',
        options: {
          earlyExit: false,
          onProgress: (p) => {
            progressReported = true;
            assert.equal(p.unit, 'bytes');
          },
        },
      });
      assert.equal(decodedFull['store.val'], 10);
      assert.ok(progressReported);
      assert.equal((decodedFull as any)._rollback, 'rollback');
      assert.equal(Object.keys(decodedFull).includes('_rollback'), false);
    });

    it('configures staleness timeout via context.options.stalenessTimeoutMs and does not hardcode 10s', async () => {
      const infiniteLoopBuf = Buffer.from([0x80, 0x02, 0x7d, 0x2e]);

      // 1. When stalenessTimeoutMs is configured with earlyExit: false
      await assert.rejects(
        async () => {
          await RenpyPickleSaveCodec.decode(infiniteLoopBuf, {
            fileName: 'test.save',
            options: { earlyExit: false, stalenessTimeoutMs: -1 },
          });
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.ok(err.message.includes('stalled'));
          return true;
        }
      );

      // 2. When stalenessTimeoutMs is configured with earlyExit: true (default) - must NOT swallow stall error
      await assert.rejects(
        async () => {
          await RenpyPickleSaveCodec.decode(infiniteLoopBuf, {
            fileName: 'test.save',
            options: { earlyExit: true, stalenessTimeoutMs: -1 },
          });
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.ok(err.message.includes('stalled'));
          return true;
        }
      );

      // 3. When custom stalenessTracker instance is provided via context.options
      const customTracker = new StalenessTracker({
        timeoutMs: -1,
        operationName: 'CustomRenpyTracker',
      });
      await assert.rejects(
        async () => {
          await RenpyPickleSaveCodec.decode(infiniteLoopBuf, {
            fileName: 'test.save',
            options: { stalenessTracker: customTracker },
          });
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.ok(err.message.includes('CustomRenpyTracker stalled'));
          return true;
        }
      );

      // 4. When stalenessTimeoutMs is undefined, it does not fail with stalled error
      const validBuf = Buffer.from([0x80, 0x02, 0x7d, 0x2e]);
      const result = await RenpyPickleSaveCodec.decode(validBuf, {
        fileName: 'test.save',
        // No stalenessTimeoutMs provided -> no hardcoded 10s timeout enforced
      });
      assert.ok(result && result.$type === 'RenpySave');
    });

    it('throws typed SaveCodecError(PARSE_FAILED) on truncated pickle buffers without leaking RangeError', async () => {
      // 1. Truncated 4-byte int opcode (0x4a)
      const truncatedIntBuf = Buffer.from([0x80, 0x02, 0x4a, 0x01]);
      assert.throws(
        () => SandboxedPickleParser.parse(truncatedIntBuf),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.ok(err.message.includes('Corrupted or truncated'));
          return true;
        }
      );

      // 2. Truncated frame header (0x95) in parseAsync
      const truncatedFrameBuf = Buffer.from([0x80, 0x04, 0x95, 0x01]);
      await assert.rejects(
        async () => {
          await SandboxedPickleParser.parseAsync(truncatedFrameBuf);
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          return true;
        }
      );

      // 3. Truncated frame header in scanRootsOffsets
      assert.throws(
        () => SandboxedPickleParser.scanRootsOffsets(truncatedFrameBuf),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          return true;
        }
      );

      // 4. decodeSaveFile facade rejects with SaveCodecError(PARSE_FAILED)
      await assert.rejects(
        async () => {
          await YumeEngine.decodeSaveFile('renpy-pickle', truncatedIntBuf);
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          return true;
        }
      );
    });

    it('preserves Python 2 opcode parity by encoding strings with BINUNICODE (0x58) in Protocol 2 streams', () => {
      // serialize outputs Protocol 2 stream without Protocol 4 opcode 0x8c
      const serialized = SandboxedPickleParser.serialize([{ 'store.short': 'abc' }]);
      assert.equal(serialized[0], 0x80);
      assert.equal(serialized[1], 0x02);
      // Opcode 0x8c (SHORT_BINUNICODE) must NOT appear in protocol 2 stream
      assert.equal(serialized.indexOf(0x8c), -1);
      // Opcode 0x58 (BINUNICODE) must be used
      assert.notEqual(serialized.indexOf(0x58), -1);

      // Verify decodeSync parses it correctly
      const decodedSync = RenpyPickleSaveCodec.decodeSync(serialized);
      assert.equal(decodedSync['store.short'], 'abc');
    });

    it('supports decodeSync with cooperative cancellation', () => {
      const testBuf = SandboxedPickleParser.serialize([{ 'store.money': 500 }]);
      assert.throws(
        () => {
          RenpyPickleSaveCodec.decodeSync(testBuf, {
            options: { shouldCancel: () => true },
          });
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.ok(err.message.includes('cancelled'));
          return true;
        }
      );
    });
  });

  describe('RPG Developer Bakin Codec (bakin-sgs)', () => {
    it('throws SaveCodecError("UNSUPPORTED_FORMAT") on decode and encode', async () => {
      const dummyBuf = Buffer.from('BAKIN_SGS_DATA');

      await assert.rejects(
        async () => {
          await YumeEngine.decodeSaveFile('bakin-sgs', dummyBuf);
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'UNSUPPORTED_FORMAT');
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await YumeEngine.encodeSaveFile('bakin-sgs', {});
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'UNSUPPORTED_FORMAT');
          return true;
        }
      );
    });
  });

  describe('YumeEngine Automatic Strategy Matching via fileName Context', () => {
    it('dispatches to correct codec based on fileName extension', async () => {
      // .rpgsave
      const mvBuf = Buffer.from(LZString.compressToBase64(JSON.stringify({ gold: 100 })), 'utf8');
      const decodedMv = await YumeEngine.decodeSaveFile('', mvBuf, { fileName: 'file1.rpgsave' });
      assert.equal(decodedMv.gold, 100);

      // .save (Ren'Py)
      const renpyBuf = RenpyPickleSaveCodec.encode({ 'store.val': 42 });
      const decodedRenpy = await YumeEngine.decodeSaveFile('', renpyBuf, { fileName: '1-1-LT1.save' });
      assert.equal(decodedRenpy['store.val'], 42);

      // unknown strategy throws UNSUPPORTED_FORMAT
      await assert.rejects(
        async () => {
          await YumeEngine.decodeSaveFile('non_existent_engine_strategy', Buffer.from('data'));
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'UNSUPPORTED_FORMAT');
          return true;
        }
      );
    });

    it('detectSaveStrategy correctly identifies canonical strategy IDs', () => {
      assert.equal(YumeEngine.detectSaveStrategy('file.rpgsave'), 'rpg-maker-mv');
      assert.equal(YumeEngine.detectSaveStrategy('C:\\Games\\save\\file.RPGSAVE'), 'rpg-maker-mv');
      assert.equal(YumeEngine.detectSaveStrategy('save01.rmmzsave'), 'rpg-maker-mz');
      assert.equal(YumeEngine.detectSaveStrategy('SaveData01.sav'), 'wolf-sav');
      assert.equal(YumeEngine.detectSaveStrategy('1-LT1.save'), 'renpy-pickle');
      assert.equal(YumeEngine.detectSaveStrategy('slot1.sgs'), 'bakin-sgs');
      assert.equal(YumeEngine.detectSaveStrategy('GameSave.bin'), 'unity-binary-formatter');
      assert.equal(YumeEngine.detectSaveStrategy('savedata0.json'), 'keyed-json');
      assert.equal(YumeEngine.detectSaveStrategy('config.json'), 'pure-json');
      assert.equal(YumeEngine.detectSaveStrategy('save_01.json'), 'pure-json');

      // Invalid / unsupported
      assert.equal(YumeEngine.detectSaveStrategy(''), null);
      assert.equal(YumeEngine.detectSaveStrategy('   '), null);
      assert.equal(YumeEngine.detectSaveStrategy(null as any), null);
      assert.equal(YumeEngine.detectSaveStrategy(undefined as any), null);
      assert.equal(YumeEngine.detectSaveStrategy('game.exe'), null);
      assert.equal(YumeEngine.detectSaveStrategy('screenshot.png'), null);
    });

    it('isSupportedSaveFile returns true for supported formats and false otherwise', () => {
      assert.equal(YumeEngine.isSupportedSaveFile('save.rmmzsave'), true);
      assert.equal(YumeEngine.isSupportedSaveFile('save.rpgsave'), true);
      assert.equal(YumeEngine.isSupportedSaveFile('save.sav'), true);
      assert.equal(YumeEngine.isSupportedSaveFile('save.save'), true);
      assert.equal(YumeEngine.isSupportedSaveFile('save.sgs'), true);
      assert.equal(YumeEngine.isSupportedSaveFile('save.bin'), true);
      assert.equal(YumeEngine.isSupportedSaveFile('save.json'), true);
      assert.equal(YumeEngine.isSupportedSaveFile('savedata.json'), true);

      assert.equal(YumeEngine.isSupportedSaveFile('save.txt'), false);
      assert.equal(YumeEngine.isSupportedSaveFile('save.dat'), false);
      assert.equal(YumeEngine.isSupportedSaveFile(''), false);
    });

    it('listSupportedSaveExtensions returns sorted canonical extension list', () => {
      const extensions = YumeEngine.listSupportedSaveExtensions();
      assert.deepEqual(extensions, ['.bin', '.json', '.rmmzsave', '.rpgsave', '.sav', '.save', '.sgs']);
    });
  });

  describe('StalenessTracker Reusable Utility (@yumeshelf/engine)', () => {
    it('initializes with default options or number', () => {
      const tracker1 = new StalenessTracker();
      assert.equal(tracker1.isEnabled, false);
      assert.equal(tracker1.timeoutMs, undefined);
      assert.equal(tracker1.operationName, 'Operation');
      assert.equal(tracker1.lastPos, 0);

      const tracker2 = new StalenessTracker(5000);
      assert.equal(tracker2.isEnabled, true);
      assert.equal(tracker2.timeoutMs, 5000);
      assert.equal(tracker2.operationName, 'Operation');

      const tracker3 = new StalenessTracker({ timeoutMs: 10000, operationName: 'Pickle parser' });
      assert.equal(tracker3.isEnabled, true);
      assert.equal(tracker3.timeoutMs, 10000);
      assert.equal(tracker3.operationName, 'Pickle parser');
    });

    it('advances position and updates timestamp on positive progress', () => {
      const tracker = new StalenessTracker({ timeoutMs: 5000 });
      const initialTime = tracker.lastTime;
      tracker.update(100, initialTime + 1000);
      assert.equal(tracker.lastPos, 100);
      assert.equal(tracker.lastTime, initialTime + 1000);

      tracker.update(200, initialTime + 2000);
      assert.equal(tracker.lastPos, 200);
      assert.equal(tracker.lastTime, initialTime + 2000);
    });

    it('throws SaveCodecError(PARSE_FAILED) when progress stalls beyond timeoutMs', () => {
      const tracker = new StalenessTracker({ timeoutMs: 2000, operationName: 'Save codec' });
      const baseTime = 10000;
      tracker.reset(50, baseTime);

      // Same position, within timeout -> no throw
      tracker.update(50, baseTime + 1500);

      // Same position, exceeds timeout -> throws
      assert.throws(
        () => tracker.update(50, baseTime + 2500),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.ok(err.message.includes('Save codec stalled'));
          assert.ok(err.message.includes('2s'));
          return true;
        }
      );
    });

    it('triggers immediately when timeoutMs <= 0 and no progress is made even in the same millisecond', () => {
      const tracker = new StalenessTracker({ timeoutMs: 0 });
      assert.throws(
        () => tracker.update(0, tracker.lastTime),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.ok(err.message.includes('stalled (no byte progress detected)'));
          return true;
        }
      );
    });

    it('supports custom unit option in StalenessTrackerOptions', () => {
      const tracker = new StalenessTracker({
        timeoutMs: 1000,
        operationName: 'RecordProcessor',
        unit: 'records',
      });
      assert.equal(tracker.unit, 'records');
      assert.throws(
        () => tracker.update(0, tracker.lastTime + 1500),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.ok(err.message.includes('RecordProcessor stalled (no records progress for 1s)'));
          return true;
        }
      );
    });

    it('does not throw when disabled (timeoutMs undefined)', () => {
      const tracker = new StalenessTracker();
      tracker.update(0, tracker.lastTime + 999999);
      assert.equal(tracker.lastPos, 0);
    });

    it('supports custom formatErrorMessage callback', () => {
      const tracker = new StalenessTracker({
        timeoutMs: 1000,
        operationName: 'CustomOp',
        formatErrorMessage: (timeout, op) => `Custom error: ${op} timed out after ${timeout}ms`,
      });
      assert.throws(
        () => tracker.update(0, tracker.lastTime + 2000),
        (err: any) => {
          assert.equal(err.message, 'Custom error: CustomOp timed out after 1000ms');
          return true;
        }
      );
    });

    it('resets progress position and timestamp', () => {
      const tracker = new StalenessTracker(5000);
      tracker.update(500, 12345);
      assert.equal(tracker.lastPos, 500);
      assert.equal(tracker.lastTime, 12345);

      tracker.reset(0, 50000);
      assert.equal(tracker.lastPos, 0);
      assert.equal(tracker.lastTime, 50000);
    });
  });
});
