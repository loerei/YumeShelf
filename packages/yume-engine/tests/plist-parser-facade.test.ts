/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlist, PlistParser } from '../dist/index.js';

function encodeString(str: string): Buffer {
  const strBuf = Buffer.from(str, 'utf8');
  const len = strBuf.length;
  if (len < 15) {
    return Buffer.concat([Buffer.from([0x50 | len]), strBuf]);
  }
  return Buffer.concat([Buffer.from([0x5f, 0x10, len]), strBuf]);
}

function createBasicBPlist(key: string, val: string): Buffer {
  const header = Buffer.from('bplist00');
  const keyBuf = encodeString(key);
  const valBuf = encodeString(val);
  const dictBuf = Buffer.from([0xd1, 1, 2]); // dict count 1, key index 1, val index 2

  const objects = [dictBuf, keyBuf, valBuf];
  const offsets: number[] = [];
  let cur = 8;
  for (const obj of objects) {
    offsets.push(cur);
    cur += obj.length;
  }

  const offsetTable = Buffer.from(offsets);
  const trailer = Buffer.alloc(32);
  trailer.writeUInt8(1, 6);
  trailer.writeUInt8(1, 7);
  trailer.writeBigUInt64BE(BigInt(objects.length), 8);
  trailer.writeBigUInt64BE(0n, 16);
  trailer.writeBigUInt64BE(BigInt(cur), 24);

  return Buffer.concat([header, ...objects, offsetTable, trailer]);
}

test('Unified PlistParser Facade (@yumeshelf/engine)', async (t) => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>YumeShelfXML</string>
</dict>
</plist>`;

  await t.test('parses XML plist from string', () => {
    const res = parsePlist(sampleXml);
    assert.equal(res.CFBundleName, 'YumeShelfXML');
  });

  await t.test('parses XML plist from Buffer', () => {
    const buf = Buffer.from(sampleXml, 'utf8');
    const res = parsePlist(buf);
    assert.equal(res.CFBundleName, 'YumeShelfXML');
  });

  await t.test('parses XML plist from Uint8Array', () => {
    const uint8 = new Uint8Array(Buffer.from(sampleXml, 'utf8'));
    const res = parsePlist(uint8);
    assert.equal(res.CFBundleName, 'YumeShelfXML');
  });

  await t.test('parses binary bplist00 from Buffer', () => {
    const bplistBuf = createBasicBPlist('CFBundleName', 'YumeShelfBinary');
    const res = parsePlist(bplistBuf);
    assert.equal(res.CFBundleName, 'YumeShelfBinary');
  });

  await t.test('parses binary bplist00 from Uint8Array', () => {
    const bplistBuf = createBasicBPlist('CFBundleName', 'YumeShelfBinaryUint8');
    const uint8 = new Uint8Array(bplistBuf);
    const res = parsePlist(uint8);
    assert.equal(res.CFBundleName, 'YumeShelfBinaryUint8');
  });

  await t.test('parses binary bplist00 from string', () => {
    const bplistBuf = createBasicBPlist('CFBundleName', 'YumeShelfBinaryString');
    const binaryStr = bplistBuf.toString('binary');
    const res = parsePlist(binaryStr);
    assert.equal(res.CFBundleName, 'YumeShelfBinaryString');
  });

  await t.test('PlistParser static parse method behaves identically to parsePlist', () => {
    const resXml = PlistParser.parse(sampleXml);
    assert.equal(resXml.CFBundleName, 'YumeShelfXML');

    const bplistBuf = createBasicBPlist('CFBundleName', 'StaticMethod');
    const resBin = PlistParser.parse(bplistBuf);
    assert.equal(resBin.CFBundleName, 'StaticMethod');
  });

  await t.test('forwards parser options such as nullProto', () => {
    const resXml = parsePlist(sampleXml, { nullProto: true });
    assert.equal(Object.getPrototypeOf(resXml), null);

    const bplistBuf = createBasicBPlist('CFBundleName', 'NullProtoBin');
    const resBin = parsePlist(bplistBuf, { nullProto: true });
    assert.equal(Object.getPrototypeOf(resBin), null);
  });

  await t.test('rejects null or undefined input with TypeError', () => {
    assert.throws(() => parsePlist(null as any), TypeError);
    assert.throws(() => parsePlist(undefined as any), TypeError);
  });
});
