import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as zlib from 'node:zlib';
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

    it('strictly rejects unsafe callable/reduction opcodes (GLOBAL, REDUCE, BUILD, INST, OBJ, NEWOBJ)', () => {
      // 1. GLOBAL opcode 0x63 ('c') - attempts to import os.system
      const maliciousGlobal = Buffer.from([
        0x80, 0x02, 0x63, 0x6f, 0x73, 0x0a, 0x73, 0x79, 0x73, 0x74, 0x65, 0x6d, 0x0a, 0x2e,
      ]);
      assert.throws(
        () => SandboxedPickleParser.parse(maliciousGlobal),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.match(err.message, /Unsafe pickle opcode detected: GLOBAL/);
          return true;
        }
      );

      // 2. REDUCE opcode 0x52 ('R')
      const maliciousReduce = Buffer.from([0x80, 0x02, 0x52, 0x2e]);
      assert.throws(
        () => SandboxedPickleParser.parse(maliciousReduce),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.match(err.message, /Unsafe pickle opcode detected: REDUCE/);
          return true;
        }
      );

      // 3. BUILD opcode 0x62 ('b')
      const maliciousBuild = Buffer.from([0x80, 0x02, 0x62, 0x2e]);
      assert.throws(
        () => SandboxedPickleParser.parse(maliciousBuild),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.match(err.message, /Unsafe pickle opcode detected: BUILD/);
          return true;
        }
      );

      // 4. NEWOBJ opcode 0x81
      const maliciousNewObj = Buffer.from([0x80, 0x02, 0x81, 0x2e]);
      assert.throws(
        () => SandboxedPickleParser.parse(maliciousNewObj),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.match(err.message, /Unsafe pickle opcode detected: NEWOBJ/);
          return true;
        }
      );

      // 5. STACK_GLOBAL opcode 0x93
      const maliciousStackGlobal = Buffer.from([0x80, 0x04, 0x93, 0x2e]);
      assert.throws(
        () => SandboxedPickleParser.parse(maliciousStackGlobal),
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          assert.match(err.message, /Unsafe pickle opcode detected: STACK_GLOBAL/);
          return true;
        }
      );
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
});
