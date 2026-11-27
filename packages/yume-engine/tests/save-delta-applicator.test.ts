import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as zlib from 'node:zlib';
import {
  YumeEngine,
  applySaveUpdates,
  normalizeSaveStrategy,
  SaveCodecError,
  DEFAULT_MAX_DECOMPRESSED_BYTES,
  type SaveFieldScalar,
  type SaveUpdatesPayload,
  type SaveCodecOptions,
  type EngineLogger,
} from '../dist/index.js';
import type {
  SaveFieldScalar as SubpathSaveFieldScalar,
  SaveUpdatesPayload as SubpathSaveUpdatesPayload,
} from '../dist/types.js';
import {
  createRpgMakerMvSaveFixture,
  createRpgMakerMzSaveFixture,
  createRenpySaveFixture,
  createWolfSavSaveFixture,
  createTincSaveFixture,
  createPureJsonSaveFixture,
  createKeyedJsonSaveFixture,
} from './fixtures/save-buffers.ts';

// Compile-time type contract checks
const _validScalar: SaveFieldScalar = 42;
const _validSubpathScalar: SubpathSaveFieldScalar = 'ok';
const _validPayload: SaveUpdatesPayload = { 'variables:1': _validScalar, 'switches:1': true };
const _validSubpathPayload: SubpathSaveUpdatesPayload = { 'variables:name': _validSubpathScalar };
void _validPayload;
void _validSubpathPayload;

// @ts-expect-error: updates record must only contain scalar values (number | string | boolean | null)
const _invalidPayloadObject: SaveUpdatesPayload = { 'variables:1': { invalid: true } };
// @ts-expect-error: updates record must not contain array values
const _invalidPayloadArray: SaveUpdatesPayload = { 'variables:1': [1, 2, 3] };
void _invalidPayloadObject;
void _invalidPayloadArray;

describe('Surgical Save Delta Applicator (applySaveUpdates)', () => {
  describe('Strategy normalization & ingress guards', () => {
    it('resolves prototype property keys safely to generic without throwing', () => {
      assert.equal(normalizeSaveStrategy('constructor'), 'generic');
      assert.equal(normalizeSaveStrategy('__proto__'), 'generic');
      assert.equal(normalizeSaveStrategy('toString'), 'generic');
      assert.equal(normalizeSaveStrategy('valueOf'), 'generic');
      assert.equal(normalizeSaveStrategy(null), 'generic');
      assert.equal(normalizeSaveStrategy(''), 'generic');
    });

    it('normalizes shorthand aliases, case variations, and whitespace variants identically', () => {
      assert.equal(normalizeSaveStrategy('rpg-maker-mv-mz'), 'rpg-maker-mv');
      assert.equal(normalizeSaveStrategy('lz-string'), 'rpg-maker-mv');
      assert.equal(normalizeSaveStrategy('rpgsave'), 'rpg-maker-mv');
      assert.equal(normalizeSaveStrategy('rmmzsave'), 'rpg-maker-mz');
      assert.equal(normalizeSaveStrategy('RenPy'), 'renpy-pickle');
      assert.equal(normalizeSaveStrategy('TINC'), 'tinc-double-aes-json');
      assert.equal(normalizeSaveStrategy('  wolf  '), 'wolf-sav');
    });

    it('returns rawBuffer immediately when updates is null, undefined, non-object, or empty', async () => {
      const { buffer } = createPureJsonSaveFixture();
      assert.strictEqual(await applySaveUpdates('pure-json', buffer, null as unknown as SaveUpdatesPayload), buffer);
      assert.strictEqual(await applySaveUpdates('pure-json', buffer, undefined as unknown as SaveUpdatesPayload), buffer);
      assert.strictEqual(await applySaveUpdates('pure-json', buffer, 'bad' as unknown as SaveUpdatesPayload), buffer);
      assert.strictEqual(await applySaveUpdates('pure-json', buffer, {}), buffer);
    });

    it('preserves cause chaining in SaveCodecError', () => {
      const rootCause = new Error('underlying failure');
      const err = new SaveCodecError('outer message', 'PARSE_FAILED', { cause: rootCause });
      assert.equal(err.cause, rootCause);
      assert.equal(err.code, 'PARSE_FAILED');
    });

    it('isolates external logger exceptions via safeLog without aborting delta application', async () => {
      const { buffer } = createPureJsonSaveFixture();
      const throwingLogger: EngineLogger = {
        warn: () => {
          throw new Error('logger crashed');
        },
        error: () => {
          throw new Error('logger crashed');
        },
        info: () => {
          throw new Error('logger crashed');
        },
        debug: () => {
          throw new Error('logger crashed');
        },
      };

      const updatedBuf = await YumeEngine.applySaveUpdates(
        'pure-json',
        buffer,
        {
          malformedNoColon: 1,
          'variables:gold': 5555,
        },
        { logger: throwingLogger }
      );
      const decoded = await YumeEngine.decodeSaveFile('pure-json', updatedBuf);
      assert.equal(decoded.gold, 5555);
    });
  });

  describe('Prototype pollution defense & malformed key telemetry', () => {
    it('skips dangerous and malformed keys, logs warnings with { qualifiedKey }, and never pollutes Object.prototype', async () => {
      const warnCalls: Array<{ message: string; context?: Record<string, unknown> }> = [];
      const mockLogger: EngineLogger = {
        warn: (message, context) => {
          warnCalls.push({ message, context });
        },
      };
      const options: SaveCodecOptions = { logger: mockLogger };

      const badUpdates: SaveUpdatesPayload = {
        '__proto__:foo': 'polluted',
        'variables:constructor': 'polluted',
        'data:prototype.polluted': 'polluted',
        '__proto__.polluted': true,
        gold: 100,
        variables: 5,
        'variables:': 10,
        ':key': 10,
      };

      // Pure JSON
      const pure = createPureJsonSaveFixture();
      const pureOut = await applySaveUpdates('pure-json', pure.buffer, { ...badUpdates, 'variables:gold': 8888 }, options);
      const pureDecoded = await YumeEngine.decodeSaveFile('pure-json', pureOut);
      assert.equal(pureDecoded.gold, 8888);
      assert.equal(({} as Record<string, unknown>).foo, undefined);
      assert.equal(({} as Record<string, unknown>).polluted, undefined);

      // Keyed JSON
      const keyed = createKeyedJsonSaveFixture();
      const keyedOut = await applySaveUpdates(
        'keyed-json',
        keyed.buffer,
        { ...badUpdates, 'variables:partyGold': 4321 },
        { ...options, key: keyed.gameKey }
      );
      const keyedDecoded = await YumeEngine.decodeSaveFile('keyed-json', keyedOut, {
        options: { key: keyed.gameKey },
      });
      assert.equal(keyedDecoded.partyGold, 4321);
      assert.equal(({} as Record<string, unknown>).polluted, undefined);

      // TINC
      const tinc = createTincSaveFixture();
      const tincOut = await applySaveUpdates('tinc', tinc.buffer, { ...badUpdates, 'variables:data_resource_money': '900' }, options);
      const tincDecoded = await YumeEngine.decodeSaveFile('tinc', tincOut);
      assert.equal(tincDecoded.data_resource_money, '900');

      // Ren'Py
      const renpy = createRenpySaveFixture();
      const renpyOut = await applySaveUpdates('RenPy', renpy.buffer, { ...badUpdates, 'variables:store.money': 7777 }, options);
      const renpyDecoded = await YumeEngine.decodeSaveFile('renpy-pickle', renpyOut);
      assert.equal(renpyDecoded['store.money'], 7777);

      // Verify logger.warn recorded { qualifiedKey } for malformed and dangerous keys
      const loggedKeys = new Set(warnCalls.map((c) => c.context?.qualifiedKey));
      for (const badKey of Object.keys(badUpdates)) {
        assert.ok(loggedKeys.has(badKey), `Expected logger.warn to record qualifiedKey "${badKey}"`);
      }
      assert.equal(({} as Record<string, unknown>).foo, undefined);
      assert.equal(({} as Record<string, unknown>).polluted, undefined);
    });
  });

  describe('Round-trip zero data loss & format-specific coercion', { timeout: 10000 }, () => {
    it('updates RPG Maker MV variables and switches without collision and preserves unmodified state', async () => {
      const { buffer } = createRpgMakerMvSaveFixture();
      const updated = await YumeEngine.applySaveUpdates('rpg-maker-mv-mz', buffer, {
        'variables:1': 3.14159,
        'variables:2': Number.MAX_SAFE_INTEGER,
        'variables:3': 'UpdatedHero',
        'switches:1': false,
        'switches:2': 1,
        'party:gold': 99999,
      });

      const decoded = await YumeEngine.decodeSaveFile('rpg-maker-mv', updated);
      assert.equal(decoded.variables._data[1], 3.14159);
      assert.equal(decoded.variables._data[2], Number.MAX_SAFE_INTEGER);
      assert.equal(decoded.variables._data[3], 'UpdatedHero');
      assert.equal(decoded.switches._data[1], false);
      assert.equal(decoded.switches._data[2], true);
      assert.equal(decoded.party._gold, 99999);
      // Unmodified state preserved
      assert.equal(decoded.party._steps, 320);
      assert.deepEqual(decoded.party._items, { '1': 5, '2': 2 });
      assert.deepEqual(decoded.actors._data[1], { _name: 'Harold', _level: 10, _hp: 450 });
    });

    it('updates RPG Maker MZ variables and switches and normalizes non-finite numbers to 0', async () => {
      const { buffer } = createRpgMakerMzSaveFixture();
      const updated = await YumeEngine.applySaveUpdates('rmmzsave', buffer, {
        'variables:1': Number.NaN,
        'variables:2': Number.POSITIVE_INFINITY,
        'variables:3': Number.NEGATIVE_INFINITY,
        'switches:1': true,
      });

      const decoded = await YumeEngine.decodeSaveFile('rpg-maker-mz', updated);
      assert.equal(decoded.variables._data[1], 0);
      assert.equal(decoded.variables._data[2], 0);
      assert.equal(decoded.variables._data[3], 0);
      assert.equal(decoded.switches._data[1], true);
      assert.equal(decoded.switches._data[2], true);
      assert.equal(decoded.party._gold, 7777);
    });

    it('updates RenPy store variables via surgicalEncode preserving floats, strings, and unmodified fields', async () => {
      const { buffer } = createRenpySaveFixture();
      const updated = await YumeEngine.applySaveUpdates('RenPy', buffer, {
        'variables:store.money': 123.45,
        'variables:store.player_name': 'Alice',
        'variables:store.cleared_prologue': false,
        'variables:store.chapter': Number.NaN,
      });

      const decoded = await YumeEngine.decodeSaveFile('renpy-pickle', updated);
      assert.equal(decoded['store.money'], 123.45);
      assert.equal(decoded['store.player_name'], 'Alice');
      assert.equal(decoded['store.cleared_prologue'], false);
      assert.equal(decoded['store.chapter'], 0);
      assert.equal(decoded['persistent.gallery_unlocked'], true);
    });

    it('updates TINC double-AES save preserving strings, numbers, and unmodified nested objects', async () => {
      const { buffer } = createTincSaveFixture();
      const updated = await YumeEngine.applySaveUpdates('TINC', buffer, {
        'variables:data_resource_money': '9999',
        'variables:data_playerName': 'Yume',
      });

      const decoded = await YumeEngine.decodeSaveFile('tinc-double-aes-json', updated);
      assert.equal(decoded.data_resource_money, '9999');
      assert.equal(decoded.data_playerName, 'Yume');
      assert.deepEqual(decoded.data_ownedItems, ['item_1', 'item_2']);
      assert.deepEqual(decoded.data_userTierData, { tier: 'gold', count: 5 });
    });

    it('handles Wolf RPG dual key routing, 32-bit clamping, float truncation, tab filtering, and out-of-bounds telemetry', async () => {
      const { buffer } = createWolfSavSaveFixture({
        sysVars: { 0: 42, 1: 77 },
        matrixVars: { 0: 100, 1: 250, 100: 999 },
      });
      const warnCalls: Array<{ message: string; context?: Record<string, unknown> }> = [];
      const logger: EngineLogger = {
        warn: (message, context) => warnCalls.push({ message, context }),
      };

      const updated = await YumeEngine.applySaveUpdates(
        '  wolf  ',
        buffer,
        {
          'variables:sys_0': 999999999999, // clamps to 2147483647
          'variables:sys_1': -999999999999, // clamps to -2147483648
          'variables:0': 123.89, // truncates to 123
          'variables:1': Number.POSITIVE_INFINITY, // normalizes to 0
          'variables:100': -45.7, // truncates to -45
          'switches:1': true, // non-variable tab skipped
          'variables:sys_9999': 10, // out-of-bounds sys var skipped
          'variables:999999': 10, // out-of-bounds numeric var skipped
          'variables:foo': 10, // non-numeric key skipped
        },
        { logger }
      );

      const decoded = await YumeEngine.decodeSaveFile('wolf-sav', updated);
      assert.equal(decoded.variables.sys_0, 2147483647);
      assert.equal(decoded.variables.sys_1, -2147483648);
      assert.equal(decoded.variables['0'], 123);
      assert.equal(decoded.variables['1'], 0);
      assert.equal(decoded.variables['100'], -45);

      const warnedKeys = new Set(warnCalls.map((c) => c.context?.qualifiedKey));
      assert.ok(warnedKeys.has('switches:1'));
      assert.ok(warnedKeys.has('variables:sys_9999'));
      assert.ok(warnedKeys.has('variables:999999'));
      assert.ok(warnedKeys.has('variables:foo'));
    });

    it('rejects payloads exceeding the 64MB default ceiling and allows bypass with allowLargeSaves or Infinity', async () => {
      assert.equal(DEFAULT_MAX_DECOMPRESSED_BYTES, 64 * 1024 * 1024);

      // Valid >64MB JSON payload compressed into a small MZ buffer
      const oversizedJson = JSON.stringify({
        variables: { _data: [0, 1] },
        pad: ' '.repeat(65 * 1024 * 1024),
      });
      const deflated = zlib.deflateSync(Buffer.from(oversizedJson, 'utf8'), { level: 1 });
      await assert.rejects(
        () => YumeEngine.applySaveUpdates('rpg-maker-mz', deflated, { 'variables:1': 10 }),
        (err: unknown) =>
          err instanceof SaveCodecError &&
          err.code === 'DECOMPRESSION_FAILED' &&
          err.message.includes('SAVE_TOO_LARGE:')
      );

      const updatedBuf = await YumeEngine.applySaveUpdates(
        'rpg-maker-mz',
        deflated,
        { 'variables:1': 42 },
        { allowLargeSaves: true }
      );
      const decoded = await YumeEngine.decodeSaveFile('rpg-maker-mz', updatedBuf, {
        options: { maxBufferSizeBytes: Number.POSITIVE_INFINITY },
      });
      assert.equal(decoded.variables._data[1], 42);
    });
  });
});
