const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
    writeAtomicJson,
    readJsonWithRetry,
    createSerializedQueue
} = require('../dist/main/core/shared-io');

async function makeTempDir() {
    return fs.mkdtemp(path.join(os.tmpdir(), 'yumeshelf-shared-io-test-'));
}

test('writeAtomicJson writes data atomically and handles nested dirs', async () => {
    const tmpDir = await makeTempDir();
    const targetFile = path.join(tmpDir, 'nested', 'subdir', 'data.json');
    const data = { hello: 'world', count: 42 };

    await writeAtomicJson(targetFile, data);

    const content = await fs.readFile(targetFile, 'utf8');
    assert.deepEqual(JSON.parse(content), data);
});

test('writeAtomicJson falls back to direct writeFile when rename is not implemented', async () => {
    const tmpDir = await makeTempDir();
    const targetFile = path.join(tmpDir, 'mock.json');
    const calls = [];

    const mockFs = {
        async writeFile(p, d) {
            calls.push({ type: 'writeFile', p, d });
        },
        async mkdir(p, opts) {
            calls.push({ type: 'mkdir', p, opts });
        }
    };

    await writeAtomicJson(targetFile, { test: 123 }, { fs: mockFs });

    assert.equal(calls.some(c => c.type === 'writeFile' && c.p === targetFile), true);
    assert.equal(calls.some(c => c.type === 'rename'), false);
});

test('writeAtomicJson retries on transient file locks (EBUSY/EPERM)', async () => {
    const tmpDir = await makeTempDir();
    const targetFile = path.join(tmpDir, 'locked.json');
    let attempts = 0;

    const realRename = fs.rename;
    const mockFs = {
        writeFile: (p, d) => fs.writeFile(p, d),
        mkdir: (p, opts) => fs.mkdir(p, opts),
        unlink: (p) => fs.unlink(p),
        async rename(oldPath, newPath) {
            attempts++;
            if (attempts < 3) {
                const err = new Error('resource busy or locked');
                err.code = 'EBUSY';
                throw err;
            }
            return realRename(oldPath, newPath);
        }
    };

    await writeAtomicJson(targetFile, { locked: false }, {
        fs: mockFs,
        retryCount: 4,
        retryDelayMs: 10
    });

    assert.equal(attempts, 3);
    const content = await fs.readFile(targetFile, 'utf8');
    assert.deepEqual(JSON.parse(content), { locked: false });
});

test('writeAtomicJson cleans up temporary file on unrecoverable failure', async () => {
    const tmpDir = await makeTempDir();
    const targetFile = path.join(tmpDir, 'fail.json');
    let createdTmpPath = null;
    let unlinkedTmpPath = null;

    const mockFs = {
        async writeFile(p, d) {
            createdTmpPath = p;
            await fs.writeFile(p, d);
        },
        async mkdir(p, opts) {
            await fs.mkdir(p, opts);
        },
        async unlink(p) {
            unlinkedTmpPath = p;
            await fs.unlink(p);
        },
        async rename() {
            const err = new Error('permanent failure');
            err.code = 'EIO';
            throw err;
        }
    };

    await assert.rejects(
        () => writeAtomicJson(targetFile, { will: 'fail' }, { fs: mockFs, retryCount: 1, retryDelayMs: 5 }),
        /permanent failure/
    );

    assert.ok(createdTmpPath);
    assert.equal(unlinkedTmpPath, createdTmpPath);
    await assert.rejects(() => fs.stat(createdTmpPath), { code: 'ENOENT' });
});

test('readJsonWithRetry fast-fails on ENOENT without retrying', async () => {
    const nonExistent = path.join(await makeTempDir(), 'missing.json');
    const start = Date.now();

    await assert.rejects(
        () => readJsonWithRetry(nonExistent, { retryCount: 5, retryDelayMs: 50 }),
        { code: 'ENOENT' }
    );

    const elapsed = Date.now() - start;
    // If it entered the 5 x 50ms retry loop, elapsed would be >= 250ms
    assert.ok(elapsed < 200, `Expected fast fail on ENOENT, took ${elapsed}ms`);
});

test('readJsonWithRetry retries on transient read error or truncated file', async () => {
    let attempts = 0;
    const mockFs = {
        async readFile() {
            attempts++;
            if (attempts === 1) {
                return ''; // empty string (truncated read race)
            }
            if (attempts === 2) {
                return '{"partial": '; // invalid json parse error
            }
            return JSON.stringify({ success: true });
        }
    };

    const res = await readJsonWithRetry('test.json', {
        fs: mockFs,
        retryCount: 3,
        retryDelayMs: 10
    });

    assert.equal(attempts, 3);
    assert.deepEqual(res, { success: true });
});

test('createSerializedQueue executes tasks in strict FIFO order and isolates errors', async () => {
    const queue = createSerializedQueue();
    const executionOrder = [];

    const task1 = queue(async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        executionOrder.push('task1');
        return 1;
    });

    const task2 = queue(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        executionOrder.push('task2-error');
        throw new Error('task2 exploded');
    });

    const task3 = queue(async () => {
        executionOrder.push('task3');
        return 3;
    });

    const r1 = await task1;
    assert.equal(r1, 1);

    await assert.rejects(() => task2, /task2 exploded/);

    const r3 = await task3;
    assert.equal(r3, 3);

    assert.deepEqual(executionOrder, ['task1', 'task2-error', 'task3']);
});
