/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { BPlistParser, BinaryPlistParser } from '../dist/index.js';

/**
 * Lightweight synthetic bplist00 serializer for deterministic testing.
 */
function createSyntheticBPlist(
  objects: Buffer[],
  topObject: number = 0
): Buffer {
  const header = Buffer.from('bplist00');
  const offsets: number[] = [];
  let currentOffset = header.length;

  for (const obj of objects) {
    offsets.push(currentOffset);
    currentOffset += obj.length;
  }

  const offsetTableOffset = currentOffset;
  const numObjects = objects.length;
  const offsetIntSize = offsetTableOffset < 256 ? 1 : 2;
  const objectRefSize = numObjects < 256 ? 1 : 2;

  const offsetTable = Buffer.alloc(numObjects * offsetIntSize);
  for (let i = 0; i < numObjects; i++) {
    if (offsetIntSize === 1) {
      offsetTable.writeUInt8(offsets[i], i);
    } else {
      offsetTable.writeUInt16BE(offsets[i], i * 2);
    }
  }

  const trailer = Buffer.alloc(32);
  trailer.writeUInt8(offsetIntSize, 6);
  trailer.writeUInt8(objectRefSize, 7);
  trailer.writeBigUInt64BE(BigInt(numObjects), 8);
  trailer.writeBigUInt64BE(BigInt(topObject), 16);
  trailer.writeBigUInt64BE(BigInt(offsetTableOffset), 24);

  return Buffer.concat([header, ...objects, offsetTable, trailer]);
}

function encodeString(str: string): Buffer {
  const strBuf = Buffer.from(str, 'utf8');
  const len = strBuf.length;
  if (len < 15) {
    return Buffer.concat([Buffer.from([0x50 | len]), strBuf]);
  }
  // Extended length string
  let intLenMarker: Buffer;
  if (len < 256) {
    intLenMarker = Buffer.from([0x10, len]);
  } else {
    const b = Buffer.alloc(3);
    b[0] = 0x11;
    b.writeUInt16BE(len, 1);
    intLenMarker = b;
  }
  return Buffer.concat([Buffer.from([0x5f]), intLenMarker, strBuf]);
}

function encodeUtf16String(str: string): Buffer {
  const buf = Buffer.from(str, 'utf16le');
  buf.swap16(); // to UTF-16BE
  const charLen = str.length;
  if (charLen < 15) {
    return Buffer.concat([Buffer.from([0x60 | charLen]), buf]);
  }
  const intLenMarker = Buffer.from([0x10, charLen]);
  return Buffer.concat([Buffer.from([0x6f]), intLenMarker, buf]);
}

function encodeInt(val: number | bigint): Buffer {
  if (typeof val === 'bigint') {
    const buf = Buffer.alloc(9);
    buf[0] = 0x13;
    buf.writeBigInt64BE(val, 1);
    return buf;
  }
  if (val >= 0 && val <= 255) {
    return Buffer.from([0x10, val]);
  }
  if (val >= 0 && val <= 65535) {
    const b = Buffer.alloc(3);
    b[0] = 0x11;
    b.writeUInt16BE(val, 1);
    return b;
  }
  if (val >= 0 && val <= 4294967295) {
    const b = Buffer.alloc(5);
    b[0] = 0x12;
    b.writeUInt32BE(val, 1);
    return b;
  }
  const b = Buffer.alloc(9);
  b[0] = 0x13;
  b.writeBigInt64BE(BigInt(val), 1);
  return b;
}

function encodeReal(val: number): Buffer {
  const buf = Buffer.alloc(9);
  buf[0] = 0x23; // 8-byte double
  buf.writeDoubleBE(val, 1);
  return buf;
}

function encodeDate(date: Date): Buffer {
  const buf = Buffer.alloc(9);
  buf[0] = 0x33;
  const seconds = date.getTime() / 1000 - 978307200;
  buf.writeDoubleBE(seconds, 1);
  return buf;
}

function encodeData(data: Buffer): Buffer {
  const len = data.length;
  if (len < 15) {
    return Buffer.concat([Buffer.from([0x40 | len]), data]);
  }
  const intLen = Buffer.from([0x10, len]);
  return Buffer.concat([Buffer.from([0x4f]), intLen, data]);
}

function encodeDict(keyRefs: number[], valRefs: number[]): Buffer {
  const count = keyRefs.length;
  let header: Buffer;
  if (count < 15) {
    header = Buffer.from([0xd0 | count]);
  } else {
    header = Buffer.from([0xdf, 0x10, count]);
  }
  const refsBuf = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) {
    refsBuf.writeUInt8(keyRefs[i], i);
    refsBuf.writeUInt8(valRefs[i], count + i);
  }
  return Buffer.concat([header, refsBuf]);
}

function encodeArray(refs: number[]): Buffer {
  const count = refs.length;
  let header: Buffer;
  if (count < 15) {
    header = Buffer.from([0xa0 | count]);
  } else {
    header = Buffer.from([0xaf, 0x10, count]);
  }
  const refsBuf = Buffer.alloc(count);
  for (let i = 0; i < count; i++) {
    refsBuf.writeUInt8(refs[i], i);
  }
  return Buffer.concat([header, refsBuf]);
}

test('Headless Binary bplist00 Deserializer (@yumeshelf/engine)', async (t) => {
  await t.test('deserializes diverse primitive types and complex dictionary', () => {
    // Objects:
    // 0: Dict with 10 keys
    // Keys: 1..10
    // Values: 11..20
    const keys = [
      'CFBundleIdentifier',
      'CFBundleVersion',
      'VersionCode',
      'IsAdmin',
      'IsHidden',
      'NullVal',
      'Scale',
      'ReleaseDate',
      'RawBytes',
      'UnicodeTitle',
    ];

    const keyBuffers = keys.map((k) => encodeString(k));
    const valBuffers = [
      encodeString('com.yumeshelf.binarytest'),
      encodeString('2.2.0'),
      encodeInt(20202),
      Buffer.from([0x09]), // true
      Buffer.from([0x08]), // false
      Buffer.from([0x00]), // null
      encodeReal(2.75),
      encodeDate(new Date('2026-09-02T12:00:00.000Z')),
      encodeData(Buffer.from([0xca, 0xfe, 0xba, 0xbe])),
      encodeUtf16String('夢棚'),
    ];

    const dictBuf = encodeDict(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    );

    const bplist = createSyntheticBPlist([
      dictBuf,
      ...keyBuffers,
      ...valBuffers,
    ]);

    const result = BPlistParser.parse(bplist);
    assert.equal(result.CFBundleIdentifier, 'com.yumeshelf.binarytest');
    assert.equal(result.CFBundleVersion, '2.2.0');
    assert.equal(result.VersionCode, 20202);
    assert.equal(result.IsAdmin, true);
    assert.equal(result.IsHidden, false);
    assert.equal(result.NullVal, null);
    assert.equal(result.Scale, 2.75);
    assert.ok(result.ReleaseDate instanceof Date);
    assert.equal(result.ReleaseDate.toISOString(), '2026-09-02T12:00:00.000Z');
    assert.ok(Buffer.isBuffer(result.RawBytes));
    assert.deepEqual(result.RawBytes, Buffer.from([0xca, 0xfe, 0xba, 0xbe]));
    assert.equal(result.UnicodeTitle, '夢棚');
  });

  await t.test('deserializes arrays and nested structures', () => {
    // 0: Dict { items: [1, 2, 3], nested: { inner: "value" } }
    // 1: String "items"
    // 2: String "nested"
    // 3: Array [4, 5, 6]
    // 4: Int 10
    // 5: Int 20
    // 6: Int 30
    // 7: Dict { inner: 8 }
    // 8: String "inner"
    // 9: String "value"
    const objects = [
      encodeDict([1, 2], [3, 7]), // 0: root dict
      encodeString('items'), // 1
      encodeString('nested'), // 2
      encodeArray([4, 5, 6]), // 3
      encodeInt(10), // 4
      encodeInt(20), // 5
      encodeInt(30), // 6
      encodeDict([8], [9]), // 7: nested dict
      encodeString('inner'), // 8
      encodeString('value'), // 9
    ];

    const bplist = createSyntheticBPlist(objects);
    const result = BPlistParser.parse(bplist);
    assert.deepEqual(result.items, [10, 20, 30]);
    assert.deepEqual(result.nested, { inner: 'value' });
  });

  await t.test('handles extended length strings (> 14 bytes) and extended count arrays', () => {
    const longString = 'This is a long string that exceeds fourteen bytes in length';
    const items = Array.from({ length: 20 }, (_, i) => encodeInt(i));
    const itemRefs = items.map((_, i) => i + 3);

    const objects = [
      encodeDict([1, 2], [itemRefs[0], 0]), // dummy
      encodeString('longString'),
      encodeString('longArray'),
    ];

    const rootDict = encodeDict([1, 2], [3, 4]);
    const longStringBuf = encodeString(longString);
    const longArrayBuf = encodeArray(Array.from({ length: 20 }, (_, i) => i + 5));
    const allObjects = [
      rootDict,
      encodeString('longString'),
      encodeString('longArray'),
      longStringBuf,
      longArrayBuf,
      ...items,
    ];

    const bplist = createSyntheticBPlist(allObjects);
    const result = BPlistParser.parse(bplist);
    assert.equal(result.longString, longString);
    assert.equal(result.longArray.length, 20);
    assert.equal(result.longArray[19], 19);
  });

  await t.test('handles Cocoa epoch offset (978307200 seconds) correctly', () => {
    // Exactly at Cocoa epoch: 2001-01-01T00:00:00Z -> seconds = 0
    const epochDateBuf = Buffer.alloc(9);
    epochDateBuf[0] = 0x33;
    epochDateBuf.writeDoubleBE(0, 1);

    const bplist = createSyntheticBPlist([epochDateBuf]);
    const result = BPlistParser.parse(bplist);
    assert.ok(result instanceof Date);
    assert.equal(result.toISOString(), '2001-01-01T00:00:00.000Z');
  });

  await t.test('detects cyclic object references and throws descriptive error', () => {
    // Object 0 (Dict) references Object 0 as value for key 1
    // 0: Dict { self: 0 }
    // 1: String "self"
    const objects = [
      encodeDict([1], [0]), // 0 points to 0!
      encodeString('self'), // 1
    ];

    const bplist = createSyntheticBPlist(objects);
    assert.throws(() => {
      BPlistParser.parse(bplist);
    }, /Cyclic object reference detected/i);
  });

  await t.test('enforces maximum recursion depth of 64 levels', () => {
    // Chain of 65 nested arrays
    const numLevels = 65;
    const objects: Buffer[] = [];
    for (let i = 0; i < numLevels; i++) {
      if (i === numLevels - 1) {
        objects.push(Buffer.from([0x09])); // true
      } else {
        objects.push(encodeArray([i + 1]));
      }
    }

    const bplist = createSyntheticBPlist(objects);
    assert.throws(() => {
      BPlistParser.parse(bplist);
    }, /Maximum recursion depth of 64 exceeded/i);

    // Chain of 64 levels should succeed
    const validLevels = 64;
    const validObjects: Buffer[] = [];
    for (let i = 0; i < validLevels; i++) {
      if (i === validLevels - 1) {
        validObjects.push(Buffer.from([0x09])); // true
      } else {
        validObjects.push(encodeArray([i + 1]));
      }
    }

    const validBplist = createSyntheticBPlist(validObjects);
    const result = BPlistParser.parse(validBplist);
    assert.ok(Array.isArray(result));
  });

  await t.test('enforces 5 MB buffer limit', () => {
    const overSize = 5 * 1024 * 1024 + 1;
    const fakeBuffer = Buffer.alloc(overSize);
    assert.throws(() => {
      BPlistParser.parse(fakeBuffer);
    }, /5 MB/i);
  });

  await t.test('rejects buffers smaller than 40 bytes or invalid magic', () => {
    assert.throws(() => {
      BPlistParser.parse(Buffer.from('short'));
    }, /buffer too small/i);

    assert.throws(() => {
      BPlistParser.parse(Buffer.alloc(45)); // all zeros, no bplist00
    }, /Invalid binary plist header/i);
  });

  await t.test('rejects corrupted trailer offset values', () => {
    const validBplist = createSyntheticBPlist([encodeString('test')]);

    // Corrupt trailer offset table offset to point beyond trailer
    const corruptedTrailer = Buffer.from(validBplist);
    const trailerPos = corruptedTrailer.length - 32;
    corruptedTrailer.writeBigUInt64BE(BigInt(corruptedTrailer.length + 100), trailerPos + 24);

    assert.throws(() => {
      BPlistParser.parse(corruptedTrailer);
    }, /Offset table exceeds buffer bounds|Invalid offsetTableOffset/i);
  });

  await t.test('strips dangerous prototype keys and defends against prototype pollution', () => {
    // Dict with keys: legitimate, __proto__, constructor, prototype
    const keyLegit = encodeString('appTitle');
    const keyProto = encodeString('__proto__');
    const keyConstructor = encodeString('constructor');
    const keyPrototype = encodeString('prototype');

    const valLegit = encodeString('YumeShelf');
    const valBad = encodeString('hacked');

    const dict = encodeDict([1, 2, 3, 4], [5, 6, 6, 6]);
    const bplist = createSyntheticBPlist([
      dict,
      keyLegit,
      keyProto,
      keyConstructor,
      keyPrototype,
      valLegit,
      valBad,
    ]);

    const parsed = BPlistParser.parse(bplist);
    assert.equal(parsed.appTitle, 'YumeShelf');
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'constructor'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'prototype'), false);

    // Ensure global prototype was NOT polluted
    assert.equal(({} as any).hacked, undefined);
  });

  await t.test('supports nullProto option constructing dict with Object.create(null)', () => {
    const dict = encodeDict([1], [2]);
    const bplist = createSyntheticBPlist([
      dict,
      encodeString('name'),
      encodeString('Yume'),
    ]);

    const parsed = BPlistParser.parse(bplist, { nullProto: true });
    assert.equal(parsed.name, 'Yume');
    assert.equal(Object.getPrototypeOf(parsed), null);
  });

  await t.test('BinaryPlistParser alias is exported and behaves identically', () => {
    assert.strictEqual(BinaryPlistParser, BPlistParser);
    const bplist = createSyntheticBPlist([encodeString('aliasTest')]);
    const result = BinaryPlistParser.parse(bplist);
    assert.equal(result, 'aliasTest');
  });
});
