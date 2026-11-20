import * as zlib from 'node:zlib';
import * as crypto from 'node:crypto';
import {
  LZString,
  RenpyPickleSaveCodec,
  SandboxedPickleParser,
  WolfSavSaveCodec,
  KeyedJsonSaveCodec,
} from '../../dist/index.js';

const DEFAULT_OUTER_KEY = Buffer.from('d5wAqPJLlmJCZowMt1phICUyBSA9wErz', 'utf8');
const DEFAULT_OUTER_IV = Buffer.from('d5wAqPJLlmJCZowM', 'utf8');
const DEFAULT_INNER_KEY = Buffer.from('PJC7HnliwcxXw4FM8Ep3sX9NIL3R5CZn', 'utf8');
const DEFAULT_INNER_IV = Buffer.from('PJC7HnliwcxXw4FM', 'utf8');

export function createRpgMakerMvSaveFixture(overrides: Record<string, any> = {}) {
  const rawData: Record<string, any> = {
    party: {
      _gold: 1500,
      _steps: 320,
      _items: { '1': 5, '2': 2 },
      _weapons: { '1': 1 },
      _armors: { '1': 1 },
    },
    system: {
      _saveCount: 4,
      _versionId: 101,
      _framesOnSave: 3600,
      playtime: '00:01:00',
    },
    variables: {
      _data: [null, 100, 250, 'HeroName', null],
    },
    switches: {
      _data: [null, true, false, null],
    },
    actors: {
      _data: [null, { _name: 'Harold', _level: 10, _hp: 450 }],
    },
    ...overrides,
  };

  const jsonStr = JSON.stringify(rawData);
  const compressedB64 = LZString.compressToBase64(jsonStr);
  const buffer = Buffer.from(compressedB64, 'utf8');
  const uncompressedBuffer = Buffer.from(jsonStr, 'utf8');

  return { rawData, buffer, uncompressedBuffer };
}

export function createRpgMakerMzSaveFixture(overrides: Record<string, any> = {}) {
  const rawData: Record<string, any> = {
    party: {
      _gold: 7777,
      _steps: 120,
    },
    system: {
      _saveCount: 2,
      _framesOnSave: 7200,
    },
    variables: {
      _data: [null, 10, 20, 30],
    },
    switches: {
      _data: [null, false, true],
    },
    ...overrides,
  };

  const jsonStr = JSON.stringify(rawData);
  const deflated = zlib.deflateSync(Buffer.from(jsonStr, 'utf8'), { level: 1 });
  let str = '';
  for (const byte of deflated) {
    str += String.fromCodePoint(byte);
  }
  const buffer = Buffer.from(str, 'utf8');

  return { rawData, buffer };
}

export function createRenpySaveFixture(overrides: Record<string, any> = {}) {
  const storeVars: Record<string, any> = {
    'store.money': 5000,
    'store.player_name': 'Protagonist',
    'store.cleared_prologue': true,
    'store.chapter': 3,
    'persistent.gallery_unlocked': true,
    ...overrides,
  };

  const buffer = RenpyPickleSaveCodec.encode(storeVars, true);
  const rawPickleBuffer = SandboxedPickleParser.serialize([storeVars]);
  const rawData: Record<string, any> = {
    $type: 'RenpySave',
    ...storeVars,
  };

  return { rawData, buffer, rawPickleBuffer };
}

export function createWolfSavSaveFixture(options?: {
  sysVars?: Record<number, number>;
  matrixVars?: Record<number, number>;
  gameTitle?: string;
}) {
  const sysVars: Record<number, number> = options?.sysVars ?? { 0: 42, 1: 77 };
  const matrixVars: Record<number, number> = options?.matrixVars ?? { 0: 100, 1: 250, 100: 999 };
  const gameTitle = options?.gameTitle ?? 'WolfTestGame';

  const titleBytes = Buffer.from(gameTitle, 'utf8');
  const sysVarCount = 50;
  const numTables = 10;
  const markerStr = Buffer.from('save/system.sav\0', 'latin1');

  // Layout of decrypted payload:
  // [0]: 1 (uint8)
  // [1..2]: titleBytes.length (uint16le)
  // [3..3+titleLen]: titleBytes
  // [align]: Tag 10 (int32le = 10), sysVarCount (int32le = 50), 50 * 4 bytes
  // markerStr ('save/system.sav\0'), numTables (int32le = 10), firstMarker (uint8 = 100), 10 * 401 bytes
  const headerPartLen = 3 + titleBytes.length;
  const tag10Pos = headerPartLen;
  const sysVarOffset = tag10Pos + 8;
  const markerPos = sysVarOffset + sysVarCount * 4;
  const afterMarkerPos = markerPos + markerStr.length;
  const matrixOffset = afterMarkerPos + 5;
  const totalPayloadLen = matrixOffset + numTables * 401 + 16;

  const payload = Buffer.alloc(totalPayloadLen);
  payload.writeUInt8(1, 0);
  payload.writeUInt16LE(titleBytes.length, 1);
  titleBytes.copy(payload, 3);

  payload.writeInt32LE(10, tag10Pos);
  payload.writeInt32LE(sysVarCount, tag10Pos + 4);
  for (const [k, v] of Object.entries(sysVars)) {
    const idx = Number(k);
    if (Number.isInteger(idx) && idx >= 0 && idx < sysVarCount) {
      payload.writeInt32LE(v, sysVarOffset + idx * 4);
    }
  }

  markerStr.copy(payload, markerPos);
  payload.writeInt32LE(numTables, afterMarkerPos);
  payload.writeUInt8(100, afterMarkerPos + 4);

  for (const [k, v] of Object.entries(matrixVars)) {
    const idx = Number(k);
    if (Number.isInteger(idx) && idx >= 0) {
      const t = Math.floor(idx / 100);
      const vIdx = idx % 100;
      if (t < numTables) {
        const off = matrixOffset + t * 401 + vIdx * 4;
        payload.writeInt32LE(v, off);
      }
    }
  }

  let sum = 0;
  for (const byte of payload) {
    sum = (sum + byte) & 0xff;
  }

  const header = Buffer.alloc(20);
  header[0] = 0x41;
  header[2] = sum;
  header[3] = 0x5a;
  header[9] = 0x1f;

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

  const buffer = Buffer.concat([header, encrypted]);
  const rawData = WolfSavSaveCodec.decode(buffer);

  return { rawData, buffer };
}

export function createTincSaveFixture(overrides: Record<string, any> = {}) {
  function encryptInner(plain: string): string {
    const c = crypto.createCipheriv('aes-256-cbc', DEFAULT_INNER_KEY, DEFAULT_INNER_IV);
    return Buffer.concat([c.update(Buffer.from(plain, 'utf8')), c.final()]).toString('base64');
  }

  const rawData: Record<string, any> = {
    $type: 'TincDoubleAesJsonSave',
    creationDate: '2026-11-20T12:00:00Z',
    creationUpdate: '1.0.0',
    data_resource_money: '600',
    data_playerName: 'Hero',
    data_ownedItems: ['item_1', 'item_2'],
    data_userTierData: { tier: 'gold', count: 5 },
    ...overrides,
  };

  const outerPayload: Record<string, any> = {
    creationDate: rawData.creationDate,
    creationUpdate: rawData.creationUpdate,
  };

  for (const [k, v] of Object.entries(rawData)) {
    if (!k.startsWith('data_')) continue;
    if (k === 'data_ownedItems' || k === 'data_userTierData') {
      outerPayload[k] = v;
    } else if (v === null || v === undefined) {
      outerPayload[k] = v;
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      outerPayload[k] = encryptInner(String(v));
    } else {
      outerPayload[k] = v;
    }
  }

  const cOuter = crypto.createCipheriv('aes-256-cbc', DEFAULT_OUTER_KEY, DEFAULT_OUTER_IV);
  const outerEnc = Buffer.concat([
    cOuter.update(Buffer.from(JSON.stringify(outerPayload), 'utf8')),
    cOuter.final(),
  ]);
  const buffer = Buffer.from(outerEnc.toString('base64'), 'utf8');

  return { rawData, buffer };
}

export function createPureJsonSaveFixture(overrides: Record<string, any> = {}) {
  const rawData: Record<string, any> = {
    $type: 'PureJsonSave',
    player: 'Alice',
    level: 42,
    gold: 9999,
    hardMode: true,
    inventory: ['Potion', 'Elixir'],
    stats: { str: 10, agi: 15 },
    ...overrides,
  };

  const clean = { ...rawData };
  delete clean.$type;
  const buffer = Buffer.from(JSON.stringify(clean), 'utf8');

  return { rawData, buffer };
}

export function createKeyedJsonSaveFixture(
  overrides: Record<string, any> = {},
  gameKey = 'TestGameKey2026'
) {
  const rawData: Record<string, any> = {
    $type: 'SimpleKeyedSave',
    partyGold: 12345,
    character: 'Sora',
    cleared: false,
    flags: [true, false, true],
    ...overrides,
  };

  const buffer = KeyedJsonSaveCodec.encode(rawData, { gameKey });
  return { rawData, buffer, gameKey };
}

export function createUnityMonoSaveFixture(overrides: Record<string, any> = {}) {
  const rawData: Record<string, any> = {
    $type: 'GameSettingInfo',
    moneypoint: 8500,
    int_map: {
      hp: 300,
      mp: 120,
    },
    bool_map: {
      tutorial_done: true,
      boss_defeated: false,
    },
    ...overrides,
  };

  const buffer = Buffer.from(JSON.stringify(rawData), 'utf8');
  return { rawData, buffer };
}

export function createNonFiniteAndUnclonableFixture(): Record<string, any> {
  return {
    finiteInt: 123,
    finiteFloat: 45.67,
    negativeZero: -0,
    nanValue: Number.NaN,
    posInfinity: Number.POSITIVE_INFINITY,
    negInfinity: Number.NEGATIVE_INFINITY,
    validString: 'Valid Text',
    validBool: true,
    uninitializedNull: null,
    uninitializedUndefined: undefined,
    fnRef: () => 'should be excluded',
    symRef: Symbol('test_symbol'),
    bigintRef: 100n,
    nestedObject: { deep: 'excluded' },
    nestedArray: [1, 2, 3],
  };
}
