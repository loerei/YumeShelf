/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateDirectorySize, YumeEngine } from '../dist/index.js';
import { MockFileSystemProvider } from './fixtures/mock-fs-provider.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('calculateDirectorySize: MockFileSystemProvider nested tree', async () => {
  const mockFs = new MockFileSystemProvider();

  // Setup directory structure in mock FS
  mockFs.mkdir('C:/Games/TestGame/data/assets');
  mockFs.mkdir('C:/Games/TestGame/save');
  mockFs.writeFile('C:/Games/TestGame/Game.exe', Buffer.alloc(1024, 0x90)); // 1024 B
  mockFs.writeFile('C:/Games/TestGame/data/config.json', Buffer.from('{"test":true}')); // 13 B
  mockFs.writeFile('C:/Games/TestGame/data/assets/bg.png', Buffer.alloc(2048, 0xff)); // 2048 B

  const result = await calculateDirectorySize('C:/Games/TestGame', mockFs);

  assert.strictEqual(result.fileCount, 3);
  assert.strictEqual(result.sizeBytes, 1024 + 13 + 2048);
  assert.strictEqual(result.mtimeMs, 1700000000000);
});

test('calculateDirectorySize: MockFileSystemProvider empty folder', async () => {
  const mockFs = new MockFileSystemProvider();
  mockFs.mkdir('C:/Games/EmptyGame');

  const result = await calculateDirectorySize('C:/Games/EmptyGame', mockFs);

  assert.strictEqual(result.fileCount, 0);
  assert.strictEqual(result.sizeBytes, 0);
  assert.strictEqual(result.mtimeMs, 1700000000000);
});

test('calculateDirectorySize: Non-existent folder error boundary', async () => {
  const mockFs = new MockFileSystemProvider();

  const result = await calculateDirectorySize('C:/Games/NonExistentGame', mockFs);

  assert.strictEqual(result.fileCount, 0);
  assert.strictEqual(result.sizeBytes, 0);
  assert.strictEqual(result.mtimeMs, 0);
});

test('calculateDirectorySize: Native Node filesystem traversal & YumeEngine static method', async () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const result = await YumeEngine.calculateDirectorySize(fixturesDir);

  assert.ok(result.fileCount >= 2, `Expected at least 2 files in fixtures, got ${result.fileCount}`);
  assert.ok(result.sizeBytes > 0, `Expected sizeBytes > 0, got ${result.sizeBytes}`);
  assert.ok(result.mtimeMs > 0, `Expected valid mtimeMs, got ${result.mtimeMs}`);
});
