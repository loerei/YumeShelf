import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as zlib from 'node:zlib';
import {
  YumeEngine,
  extractSaveSchema,
  normalizeSaveStrategy,
  STRATEGY_CANONICAL_MAP,
  safeLog,
  SaveCodecError,
  DEFAULT_MAX_DECOMPRESSED_BYTES,
  type NormalizedSaveDto,
  type SaveFieldDto,
  type SaveTabDto,
  type SaveSchemaOptions,
  type SaveCodecOptions,
  type SaveMetadataDto,
  type EngineLogger,
  type CanonicalSaveStrategy,
  type ShorthandSaveStrategy,
  type SupportedSaveStrategy,
} from '../dist/index.js';
import type {
  NormalizedSaveDto as SubpathNormalizedSaveDto,
  SaveFieldDto as SubpathSaveFieldDto,
  SaveTabDto as SubpathSaveTabDto,
  SaveSchemaOptions as SubpathSaveSchemaOptions,
  SaveCodecOptions as SubpathSaveCodecOptions,
} from '../dist/types.js';
import {
  createRpgMakerMvSaveFixture,
  createRpgMakerMzSaveFixture,
  createRenpySaveFixture,
  createWolfSavSaveFixture,
  createTincSaveFixture,
  createPureJsonSaveFixture,
  createKeyedJsonSaveFixture,
  createUnityMonoSaveFixture,
  createNonFiniteAndUnclonableFixture,
} from './fixtures/save-buffers.ts';

describe('Headless Save Schema Extraction & DTO Contracts (Ticket 08.1.1)', () => {
  describe('Compile-Time & Runtime Public Entrypoint Contract', () => {
    it('enforces strict excess property checks and scalar field types at compile time', () => {
      // Compile-time negative type assertion: extractSaveSchema rejects unlisted options
      // @ts-expect-error: nonExistentOption is not a valid property of SaveSchemaOptions
      const dto = extractSaveSchema('rpg-maker-mv', {}, { nonExistentOption: true });
      assert.equal(dto.strategy, 'rpg-maker-mv');

      const _badFieldVal: SaveFieldDto = {
        id: 'variables:1',
        tabId: 'variables',
        key: '1',
        label: 'Bad',
        // @ts-expect-error: non-scalar object is not assignable to SaveFieldDto.value
        value: { nested: 1 },
        type: 'number',
      };
      assert.ok(_badFieldVal);

      // @ts-expect-error: unknownCodecOption is not a valid property of SaveCodecOptions
      const _badCodecOpts: SaveCodecOptions = { unknownCodecOption: 'invalid' };
      assert.ok(_badCodecOpts);

      // Verify subpath type equivalence
      const validOpts: SubpathSaveSchemaOptions = {
        gameKey: 'game_1',
        fileName: 'file1.rpgsave',
      };
      const typedDto: SubpathNormalizedSaveDto = YumeEngine.extractSaveSchema(
        'rpg-maker-mv',
        {},
        validOpts
      );
      const _tabs: SubpathSaveTabDto[] = typedDto.tabs;
      const _fields: SubpathSaveFieldDto[] = typedDto.fields;
      const _codecOpts: SubpathSaveCodecOptions = {
        ...validOpts,
        savePath: '/tmp/save',
        maxBufferSizeBytes: DEFAULT_MAX_DECOMPRESSED_BYTES,
      };
      const _strategyCheck: SupportedSaveStrategy = typedDto.strategy;
      const _canonicalCheck: CanonicalSaveStrategy = 'rpg-maker-mv';
      const _shorthandCheck: ShorthandSaveStrategy = 'rpg-maker-mv-mz';
      assert.equal(_tabs.length, 0);
      assert.equal(_fields.length, 0);
      assert.equal(_codecOpts.maxBufferSizeBytes, Number.POSITIVE_INFINITY);
      assert.equal(_strategyCheck, _canonicalCheck);
      assert.equal(normalizeSaveStrategy(_shorthandCheck), 'rpg-maker-mv');
    });
  });

  describe('Strategy Normalization & Null-Prototype Dictionary Guard', () => {
    it('defines STRATEGY_CANONICAL_MAP with null prototype and guards against prototype keys', () => {
      assert.equal(Object.getPrototypeOf(STRATEGY_CANONICAL_MAP), null);

      // Prototype property keys must resolve safely to 'generic'
      assert.equal(normalizeSaveStrategy('constructor'), 'generic');
      assert.equal(normalizeSaveStrategy('__proto__'), 'generic');
      assert.equal(normalizeSaveStrategy('toString'), 'generic');
      assert.equal(normalizeSaveStrategy('valueOf'), 'generic');
      assert.equal(normalizeSaveStrategy('hasOwnProperty'), 'generic');
      assert.equal(normalizeSaveStrategy('prototype'), 'generic');

      // Non-string, empty, and whitespace-only inputs resolve to 'generic'
      assert.equal(normalizeSaveStrategy(undefined), 'generic');
      assert.equal(normalizeSaveStrategy(null), 'generic');
      assert.equal(normalizeSaveStrategy(''), 'generic');
      assert.equal(normalizeSaveStrategy('   '), 'generic');
      assert.equal(normalizeSaveStrategy(123 as any), 'generic');
      assert.equal(normalizeSaveStrategy({} as any), 'generic');
    });

    it('normalizes canonical, shorthand, case-varied, and whitespace-padded strategies identically', () => {
      // Concrete pre-calculated literal assertions on extractSaveSchema DTOs
      let dto = extractSaveSchema('renpy', {});
      assert.equal(dto.strategy, 'renpy-pickle');

      dto = extractSaveSchema('wolf', {});
      assert.equal(dto.strategy, 'wolf-sav');

      dto = extractSaveSchema('tinc', {});
      assert.equal(dto.strategy, 'tinc-double-aes-json');

      dto = extractSaveSchema('bakin', {});
      assert.equal(dto.strategy, 'bakin-sgs');

      dto = extractSaveSchema('rpg-maker-mv', {});
      assert.equal(dto.strategy, 'rpg-maker-mv');

      dto = extractSaveSchema('constructor', {});
      assert.equal(dto.strategy, 'generic');

      dto = extractSaveSchema('__proto__', {});
      assert.equal(dto.strategy, 'generic');

      dto = extractSaveSchema('toString', {});
      assert.equal(dto.strategy, 'generic');

      // Shorthand aliases
      assert.equal(normalizeSaveStrategy('rpg-maker-mv-mz'), 'rpg-maker-mv');
      assert.equal(normalizeSaveStrategy('lz-string'), 'rpg-maker-mv');
      assert.equal(normalizeSaveStrategy('rpgsave'), 'rpg-maker-mv');
      assert.equal(normalizeSaveStrategy('rmmzsave'), 'rpg-maker-mz');
      assert.equal(normalizeSaveStrategy('rpgmaker'), 'rpg-maker-mz');
      assert.equal(normalizeSaveStrategy('chrono-ecstasy'), 'tinc-double-aes-json');
      assert.equal(normalizeSaveStrategy('sgs'), 'bakin-sgs');
      assert.equal(normalizeSaveStrategy('bakin-sgs'), 'bakin-sgs');
      assert.equal(normalizeSaveStrategy('unity-mono'), 'unity-binary-formatter');
      assert.equal(normalizeSaveStrategy('unity-mono-bin'), 'unity-binary-formatter');
      assert.equal(normalizeSaveStrategy('binary-formatter'), 'unity-binary-formatter');
      assert.equal(normalizeSaveStrategy('modern-save-converter'), 'unity-binary-formatter');
      assert.equal(normalizeSaveStrategy('json'), 'pure-json');
      assert.equal(normalizeSaveStrategy('pure-json'), 'pure-json');
      assert.equal(normalizeSaveStrategy('simple-keyed'), 'keyed-json');
      assert.equal(normalizeSaveStrategy('simple-keyed-json'), 'keyed-json');
      assert.equal(normalizeSaveStrategy('keyed-json'), 'keyed-json');

      // Case variations & whitespace variants
      assert.equal(normalizeSaveStrategy('RenPy'), 'renpy-pickle');
      assert.equal(normalizeSaveStrategy('TINC'), 'tinc-double-aes-json');
      assert.equal(normalizeSaveStrategy('  wolf  '), 'wolf-sav');
      assert.equal(normalizeSaveStrategy('  RPG-MAKER-MV-MZ \n'), 'rpg-maker-mv');

      // Verify handler parity between shorthand/case variants and canonical names
      const { rawData: wolfData } = createWolfSavSaveFixture();
      const wolfCanonicalDto = extractSaveSchema('wolf-sav', wolfData);
      const wolfVariantDto = extractSaveSchema('  wolf  ', wolfData);
      assert.deepEqual(wolfVariantDto, wolfCanonicalDto);

      const { rawData: renpyData } = createRenpySaveFixture();
      const renpyCanonicalDto = extractSaveSchema('renpy-pickle', renpyData);
      const renpyVariantDto = extractSaveSchema('RenPy', renpyData);
      assert.deepEqual(renpyVariantDto, renpyCanonicalDto);

      const { rawData: tincData } = createTincSaveFixture();
      const tincCanonicalDto = extractSaveSchema('tinc-double-aes-json', tincData);
      const tincVariantDto = extractSaveSchema('TINC', tincData);
      assert.deepEqual(tincVariantDto, tincCanonicalDto);

      const { rawData: mvData } = createRpgMakerMvSaveFixture();
      const mvCanonicalDto = extractSaveSchema('rpg-maker-mv', mvData);
      const mvAlias1Dto = extractSaveSchema('rpg-maker-mv-mz', mvData);
      const mvAlias2Dto = extractSaveSchema('lz-string', mvData);
      assert.deepEqual(mvAlias1Dto, mvCanonicalDto);
      assert.deepEqual(mvAlias2Dto, mvCanonicalDto);
    });
  });

  describe('Ingress Boundary Guard', () => {
    it('returns an empty schema DTO with canonical strategy on null, undefined, or non-object rawData', () => {
      const invalidInputs: unknown[] = [null, undefined, 42, 'raw string', true, false, [1, 2, 3]];

      for (const input of invalidInputs) {
        const dto = extractSaveSchema('rpgsave', input, {
          gameKey: 'test_game',
          fileName: 'file1.rpgsave',
        });
        assert.deepEqual(dto, {
          gameKey: 'test_game',
          fileName: 'file1.rpgsave',
          strategy: 'rpg-maker-mv',
          tabs: [],
          fields: [],
        });
      }
    });
  });

  describe('Extraction Across All 5 Engine Formats & Qualified Field IDs', () => {
    it('extracts RPG Maker MV and MZ variables, switches, party gold, and playtime with qualified IDs', () => {
      const { rawData: mvData } = createRpgMakerMvSaveFixture();
      const mvDto = extractSaveSchema('rpg-maker-mv', mvData, {
        gameKey: 'mv_game',
        fileName: 'file1.rpgsave',
        metadata: {
          variables: [null, 'Hero Level', 'Dungeon Floor', 'Hero Title', null],
          switches: [null, 'Intro Seen', 'Boss Cleared', null],
        },
      });

      assert.equal(mvDto.gameKey, 'mv_game');
      assert.equal(mvDto.fileName, 'file1.rpgsave');
      assert.equal(mvDto.strategy, 'rpg-maker-mv');

      const fieldMap = new Map(mvDto.fields.map((f) => [f.id, f]));

      // Verify cross-tab collision protection: variables:1 vs switches:1
      assert.ok(fieldMap.has('variables:1'));
      assert.ok(fieldMap.has('switches:1'));
      assert.equal(fieldMap.get('variables:1')?.tabId, 'variables');
      assert.equal(fieldMap.get('variables:1')?.key, '1');
      assert.equal(fieldMap.get('variables:1')?.label, 'Hero Level');
      assert.equal(fieldMap.get('variables:1')?.value, 100);
      assert.equal(fieldMap.get('variables:1')?.type, 'number');

      assert.equal(fieldMap.get('switches:1')?.tabId, 'switches');
      assert.equal(fieldMap.get('switches:1')?.key, '1');
      assert.equal(fieldMap.get('switches:1')?.label, 'Intro Seen');
      assert.equal(fieldMap.get('switches:1')?.value, true);
      assert.equal(fieldMap.get('switches:1')?.type, 'boolean');

      // String variable in RPG Maker variables._data
      assert.equal(fieldMap.get('variables:3')?.value, 'HeroName');
      assert.equal(fieldMap.get('variables:3')?.type, 'string');

      // Uninitialized null in variables._data normalizes to 0
      assert.equal(fieldMap.get('variables:4')?.value, 0);
      assert.equal(fieldMap.get('variables:4')?.type, 'number');
      assert.equal(fieldMap.get('variables:4')?.label, 'Variable 4');

      // Uninitialized null in switches._data normalizes to false
      assert.equal(fieldMap.get('switches:3')?.value, false);
      assert.equal(fieldMap.get('switches:3')?.type, 'boolean');
      assert.equal(fieldMap.get('switches:3')?.label, 'Switch 3');

      // Party gold & system playtime
      assert.equal(fieldMap.get('party:gold')?.value, 1500);
      assert.equal(fieldMap.get('party:gold')?.type, 'number');
      assert.equal(fieldMap.get('system:playtime')?.value, '00:01:00');
      assert.equal(fieldMap.get('system:framesOnSave')?.value, 3600);

      // RPG Maker MZ
      const { rawData: mzData } = createRpgMakerMzSaveFixture();
      const mzDto = extractSaveSchema('rpg-maker-mz', mzData, {
        gameKey: 'mz_game',
        fileName: 'file1.rmmzsave',
      });
      assert.equal(mzDto.strategy, 'rpg-maker-mz');
      const mzMap = new Map(mzDto.fields.map((f) => [f.id, f]));
      assert.equal(mzMap.get('variables:1')?.value, 10);
      assert.equal(mzMap.get('switches:2')?.value, true);
      assert.equal(mzMap.get('party:gold')?.value, 7777);
      assert.equal(mzMap.get('system:framesOnSave')?.value, 7200);
    });

    it('extracts Ren\'Py store variables, gold/money, and persistent flags', () => {
      const { rawData } = createRenpySaveFixture();
      const dto = extractSaveSchema('renpy-pickle', rawData, {
        gameKey: 'renpy_game',
        fileName: '1-1-LT1.save',
      });

      assert.equal(dto.strategy, 'renpy-pickle');
      const fieldMap = new Map(dto.fields.map((f) => [f.id, f]));

      assert.equal(fieldMap.get('variables:store.money')?.value, 5000);
      assert.equal(fieldMap.get('variables:store.money')?.type, 'number');
      assert.equal(fieldMap.get('variables:store.player_name')?.value, 'Protagonist');
      assert.equal(fieldMap.get('variables:store.player_name')?.type, 'string');
      assert.equal(fieldMap.get('variables:store.cleared_prologue')?.value, true);
      assert.equal(fieldMap.get('variables:store.cleared_prologue')?.type, 'boolean');
      assert.equal(fieldMap.get('variables:persistent.gallery_unlocked')?.value, true);
      assert.equal(fieldMap.get('variables:persistent.gallery_unlocked')?.type, 'boolean');
      // Internal $type must never leak into fields
      assert.equal(fieldMap.has('variables:$type'), false);
    });

    it('extracts Wolf RPG system variables (variables:sys_<N>) and numeric matrix variables (variables:<N>)', () => {
      const { rawData } = createWolfSavSaveFixture({
        sysVars: { 0: 42, 1: 77 },
        matrixVars: { 0: 100, 1: 250, 100: 999 },
      });

      const dto = extractSaveSchema('wolf-sav', rawData, {
        gameKey: 'wolf_game',
        fileName: 'SaveData01.sav',
        metadata: {
          variables: {
            sys_0: 'System Brightness',
            '0': 'Player HP',
            '100': 'Table 1 Variable 0',
          },
        },
      });

      assert.equal(dto.strategy, 'wolf-sav');
      const fieldMap = new Map(dto.fields.map((f) => [f.id, f]));

      // Verify both variables:sys_0 and variables:0 are distinctly qualified
      assert.ok(fieldMap.has('variables:sys_0'));
      assert.ok(fieldMap.has('variables:0'));
      assert.equal(fieldMap.get('variables:sys_0')?.key, 'sys_0');
      assert.equal(fieldMap.get('variables:sys_0')?.value, 42);
      assert.equal(fieldMap.get('variables:sys_0')?.label, 'System Brightness');

      assert.equal(fieldMap.get('variables:0')?.key, '0');
      assert.equal(fieldMap.get('variables:0')?.value, 100);
      assert.equal(fieldMap.get('variables:0')?.label, 'Player HP');

      assert.equal(fieldMap.get('variables:1')?.value, 250);
      assert.equal(fieldMap.get('variables:100')?.value, 999);
      assert.equal(fieldMap.get('variables:100')?.label, 'Table 1 Variable 0');

      // Internal binary buffers must not leak into fields
      assert.equal(fieldMap.has('variables:rawBase64'), false);
      assert.equal(fieldMap.has('variables:_decryptedBase64'), false);
    });

    it('extracts TINC data_* properties while excluding root metadata and complex non-scalars', () => {
      const { rawData } = createTincSaveFixture({
        data_nullField: null,
      });

      const dto = extractSaveSchema('tinc-double-aes-json', rawData, {
        gameKey: 'tinc_game',
        fileName: 'saveSlot1.json',
      });

      assert.equal(dto.strategy, 'tinc-double-aes-json');
      const fieldMap = new Map(dto.fields.map((f) => [f.id, f]));

      assert.equal(fieldMap.get('variables:data_resource_money')?.value, '600');
      assert.equal(fieldMap.get('variables:data_resource_money')?.type, 'string');
      assert.equal(fieldMap.get('variables:data_playerName')?.value, 'Hero');
      assert.equal(fieldMap.get('variables:data_nullField')?.value, '');
      assert.equal(fieldMap.get('variables:data_nullField')?.type, 'string');

      // Non-data_* root metadata and non-scalar complex structures are excluded
      assert.equal(fieldMap.has('variables:creationDate'), false);
      assert.equal(fieldMap.has('variables:creationUpdate'), false);
      assert.equal(fieldMap.has('variables:data_ownedItems'), false);
      assert.equal(fieldMap.has('variables:data_userTierData'), false);
    });

    it('extracts Unity Mono, Pure JSON, and Keyed JSON key-value fields', () => {
      const { rawData: unityData } = createUnityMonoSaveFixture();
      const unityDto = extractSaveSchema('unity-mono', unityData);
      assert.equal(unityDto.strategy, 'unity-binary-formatter');
      const unityMap = new Map(unityDto.fields.map((f) => [f.id, f]));
      assert.equal(unityMap.get('variables:moneypoint')?.value, 8500);
      assert.equal(unityMap.get('variables:hp')?.value, 300);
      assert.equal(unityMap.get('switches:tutorial_done')?.value, true);
      assert.equal(unityMap.get('switches:boss_defeated')?.value, false);

      const { rawData: pureJsonData } = createPureJsonSaveFixture();
      const pureDto = extractSaveSchema('pure-json', pureJsonData);
      assert.equal(pureDto.strategy, 'pure-json');
      const pureMap = new Map(pureDto.fields.map((f) => [f.id, f]));
      assert.equal(pureMap.get('variables:player')?.value, 'Alice');
      assert.equal(pureMap.get('variables:level')?.value, 42);
      assert.equal(pureMap.get('variables:gold')?.value, 9999);
      assert.equal(pureMap.get('variables:hardMode')?.value, true);
      assert.equal(pureMap.has('variables:inventory'), false);
      assert.equal(pureMap.has('variables:stats'), false);

      const { rawData: keyedData } = createKeyedJsonSaveFixture();
      const keyedDto = extractSaveSchema('simple-keyed-json', keyedData);
      assert.equal(keyedDto.strategy, 'keyed-json');
      const keyedMap = new Map(keyedDto.fields.map((f) => [f.id, f]));
      assert.equal(keyedMap.get('variables:partyGold')?.value, 12345);
      assert.equal(keyedMap.get('variables:character')?.value, 'Sora');
    });
  });

  describe('Metadata Label Coercion, Unicode NFC & User Mappings', () => {
    it('coerces non-string metadata scalars, normalizes newlines and NFC Unicode, and falls back on blank entries', () => {
      const sparseVarsMeta: any[] = [];
      sparseVarsMeta[1] = '  First\r\nLine\nVariable  ';
      sparseVarsMeta[2] = '';
      sparseVarsMeta[3] = null;
      sparseVarsMeta[4] = 9001; // numeric metadata label
      sparseVarsMeta[5] = 'Cafe\u0301'; // NFD decomposed "Café"
      // index 6 is an uninitialized sparse hole (undefined)

      const rawData = {
        variables: {
          _data: [null, 10, 20, 30, 40, 50, 60],
        },
        switches: {
          _data: [null, true, false, true],
        },
      };

      const metadata: SaveMetadataDto = {
        variables: sparseVarsMeta,
        switches: {
          1: 'Switch\r\nOne',
          2: '   ',
          3: null,
        },
      };

      const dto = extractSaveSchema('rpg-maker-mv', rawData, { metadata });
      const fieldMap = new Map(dto.fields.map((f) => [f.id, f]));

      assert.equal(fieldMap.get('variables:1')?.label, 'First Line Variable');
      assert.equal(fieldMap.get('variables:2')?.label, 'Variable 2');
      assert.equal(fieldMap.get('variables:3')?.label, 'Variable 3');
      assert.equal(fieldMap.get('variables:4')?.label, '9001');
      assert.equal(fieldMap.get('variables:5')?.label, 'Caf\u00e9');
      assert.equal(fieldMap.get('variables:6')?.label, 'Variable 6');

      assert.equal(fieldMap.get('switches:1')?.label, 'Switch One');
      assert.equal(fieldMap.get('switches:2')?.label, 'Switch 2');
      assert.equal(fieldMap.get('switches:3')?.label, 'Switch 3');
    });

    it('consumes _userMappings when metadata label is absent', () => {
      const rawData = {
        variables: {
          sys_0: 10,
          '0': 55,
        },
        _userMappings: [{ offset: 0, name: 'Mapped\nHero\r\nStamina' }],
      };

      const dto = extractSaveSchema('wolf-sav', rawData);
      const fieldMap = new Map(dto.fields.map((f) => [f.id, f]));
      assert.equal(fieldMap.get('variables:0')?.label, 'Mapped Hero Stamina');
      assert.equal(fieldMap.get('variables:sys_0')?.label, 'Variable sys_0');
    });
  });

  describe('Non-Finite Normalization, Unclonable Exclusion & IPC Membrane Cloning', () => {
    it('normalizes NaN/Infinity/-Infinity to 0, excludes unclonables/objects, and survives structuredClone and JSON.stringify', () => {
      const rawData = createNonFiniteAndUnclonableFixture();
      const dto = extractSaveSchema('pure-json', rawData, {
        gameKey: 'clone_test',
        fileName: 'save.json',
      });

      const fieldMap = new Map(dto.fields.map((f) => [f.id, f]));

      // Valid scalars preserved
      assert.equal(fieldMap.get('variables:finiteInt')?.value, 123);
      assert.equal(fieldMap.get('variables:finiteFloat')?.value, 45.67);
      assert.equal(fieldMap.get('variables:validString')?.value, 'Valid Text');
      assert.equal(fieldMap.get('variables:validBool')?.value, true);

      // -0 and non-finite numbers normalized to finite 0
      assert.equal(fieldMap.get('variables:negativeZero')?.value, 0);
      assert.equal(Object.is(fieldMap.get('variables:negativeZero')?.value, -0), false);
      assert.equal(fieldMap.get('variables:nanValue')?.value, 0);
      assert.equal(fieldMap.get('variables:posInfinity')?.value, 0);
      assert.equal(fieldMap.get('variables:negInfinity')?.value, 0);

      // Uninitialized null/undefined normalized to 0
      assert.equal(fieldMap.get('variables:uninitializedNull')?.value, 0);
      assert.equal(fieldMap.get('variables:uninitializedUndefined')?.value, 0);

      // Unclonable references and complex objects excluded
      assert.equal(fieldMap.has('variables:fnRef'), false);
      assert.equal(fieldMap.has('variables:symRef'), false);
      assert.equal(fieldMap.has('variables:bigintRef'), false);
      assert.equal(fieldMap.has('variables:nestedObject'), false);
      assert.equal(fieldMap.has('variables:nestedArray'), false);

      // Every emitted field value is strictly finite scalar
      for (const field of dto.fields) {
        assert.ok(
          typeof field.value === 'number' ||
            typeof field.value === 'string' ||
            typeof field.value === 'boolean'
        );
        if (typeof field.value === 'number') {
          assert.ok(Number.isFinite(field.value));
        }
      }

      // Verify V8 structuredClone and JSON.stringify preserve non-null numerical values
      const cloned = structuredClone(dto);
      assert.deepEqual(cloned, dto);

      const jsonRoundTrip: NormalizedSaveDto = JSON.parse(JSON.stringify(dto));
      assert.deepEqual(jsonRoundTrip, dto);
      for (const field of jsonRoundTrip.fields) {
        assert.notEqual(field.value, null);
      }
    });
  });

  describe('Cancellation, Progress, Logger Isolation & Error Cause Chaining', () => {
    it('honors options.onProgress and options.shouldCancel hooks', () => {
      const { rawData } = createRpgMakerMvSaveFixture();
      const progressCalls: any[] = [];

      const dto = extractSaveSchema('rpg-maker-mv', rawData, {
        onProgress: (p) => progressCalls.push(p),
      });

      assert.ok(progressCalls.length >= 1);
      const lastProgress = progressCalls[progressCalls.length - 1];
      assert.equal(lastProgress.current, dto.fields.length);
      assert.equal(lastProgress.total, dto.fields.length);
      assert.equal(lastProgress.percent, 100);
      assert.equal(lastProgress.unit, 'items');

      // Immediate cancellation
      assert.throws(
        () => {
          extractSaveSchema('rpg-maker-mv', rawData, {
            shouldCancel: () => true,
          });
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'PARSE_FAILED');
          return true;
        }
      );
    });

    it('isolates exceptions thrown by caller options.logger via safeLog', () => {
      const throwingLogger: EngineLogger = {
        debug() {
          throw new Error('Logger debug crashed');
        },
        info() {
          throw new Error('Logger info crashed');
        },
        warn() {
          throw new Error('Logger warn crashed');
        },
        error() {
          throw new Error('Logger error crashed');
        },
      };

      // safeLog directly swallows logger errors
      assert.doesNotThrow(() => {
        safeLog(throwingLogger, 'debug', 'test');
        safeLog(throwingLogger, 'info', 'test');
        safeLog(throwingLogger, 'warn', 'test');
        safeLog(throwingLogger, 'error', 'test');
      });

      // extractSaveSchema succeeds even when logger throws on every level
      const { rawData } = createPureJsonSaveFixture();
      const dto = extractSaveSchema('pure-json', rawData, {
        logger: throwingLogger,
      });
      assert.ok(dto.fields.length > 0);

      const emptyDto = extractSaveSchema('pure-json', null, {
        logger: throwingLogger,
      });
      assert.equal(emptyDto.fields.length, 0);
    });

    it('preserves error cause chaining in SaveCodecError and enforces 64MB decompression ceiling', async () => {
      const rootCause = new SyntaxError('Unexpected token in JSON');
      const codecErr = new SaveCodecError('Failed to parse save', 'PARSE_FAILED', {
        cause: rootCause,
      });
      assert.equal(codecErr.cause, rootCause);
      assert.equal(codecErr.code, 'PARSE_FAILED');

      // Verify codec rethrow preserves cause
      await assert.rejects(
        async () => {
          await YumeEngine.decodeSaveFile('pure-json', Buffer.from('{bad json', 'utf8'));
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.ok(err.cause instanceof Error);
          return true;
        }
      );

      // Verify default is unlimited while explicit maxBufferSizeBytes still enforces the ceiling
      assert.equal(DEFAULT_MAX_DECOMPRESSED_BYTES, Number.POSITIVE_INFINITY);
      const largePayload = JSON.stringify({ data: 'x'.repeat(2048) });
      const compressedMz = zlib.deflateSync(Buffer.from(largePayload, 'utf8'));

      await assert.rejects(
        async () => {
          await YumeEngine.decodeSaveFile('rpg-maker-mz', compressedMz, {
            options: { maxBufferSizeBytes: 512 },
          });
        },
        (err: any) => {
          assert.ok(err instanceof SaveCodecError);
          assert.equal(err.code, 'DECOMPRESSION_FAILED');
          assert.ok(err.cause instanceof Error);
          return true;
        }
      );
    });
  });
});
