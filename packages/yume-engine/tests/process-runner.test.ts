import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {
  NodeProcessRunner,
  MockProcessRunner,
  UnityBinaryFormatterSaveCodec,
  SaveCodecError,
  decodeSaveFile,
  encodeSaveFile,
  DEFAULT_PROCESS_TIMEOUT_MS,
  DEFAULT_GRACE_PERIOD_MS,
  DEFAULT_MAX_BUFFER_BYTES,
} from '../dist/index.js';

describe('IProcessRunner & Save Converter Seam (@yumeshelf/engine)', () => {
  describe('Constants & Security Defaults', () => {
    it('has standard timeout, grace period, and max buffer constants', () => {
      assert.strictEqual(DEFAULT_PROCESS_TIMEOUT_MS, 30000);
      assert.strictEqual(DEFAULT_GRACE_PERIOD_MS, 3000);
      assert.strictEqual(DEFAULT_MAX_BUFFER_BYTES, 10 * 1024 * 1024);
    });
  });

  describe('NodeProcessRunner (Live Executable Invocations)', () => {
    const runner = new NodeProcessRunner();

    it('executes standard node process and captures stdout and exit code 0', async () => {
      const result = await runner.run(process.execPath, ['-e', 'console.log("HELLO_YUME_ENGINE")']);
      assert.strictEqual(result.exitCode, 0);
      assert.match(result.stdout, /HELLO_YUME_ENGINE/);
      assert.strictEqual(result.stderr, '');
    });

    it('captures stderr and non-zero exit code', async () => {
      const result = await runner.run(process.execPath, ['-e', 'console.error("CRITICAL_FAILURE"); process.exit(42)']);
      assert.strictEqual(result.exitCode, 42);
      assert.match(result.stderr, /CRITICAL_FAILURE/);
    });

    it('enforces buffer limit and throws SaveCodecError(PROCESS_BUFFER_OVERFLOW)', async () => {
      // Output 100KB with a 10KB maxBuffer limit
      await assert.rejects(
        async () => {
          await runner.run(
            process.execPath,
            ['-e', 'process.stdout.write("A".repeat(100 * 1024))'],
            { maxBuffer: 10 * 1024 }
          );
        },
        (err: any) => {
          assert.strictEqual(err instanceof SaveCodecError, true);
          assert.strictEqual(err.code, 'PROCESS_BUFFER_OVERFLOW');
          assert.match(err.message, /buffer limit/i);
          return true;
        }
      );
    });

    it('enforces process timeout with 2-stage escalation and throws SaveCodecError(PROCESS_TIMEOUT)', async () => {
      const startTime = Date.now();
      await assert.rejects(
        async () => {
          await runner.run(
            process.execPath,
            ['-e', 'setInterval(() => {}, 1000)'],
            { timeout: 100, gracePeriod: 100 }
          );
        },
        (err: any) => {
          assert.strictEqual(err instanceof SaveCodecError, true);
          assert.strictEqual(err.code, 'PROCESS_TIMEOUT');
          assert.match(err.message, /timed out/i);
          return true;
        }
      );
      const duration = Date.now() - startTime;
      assert.ok(duration >= 90, `Duration ${duration}ms should be >= timeout`);
    });

    it('throws SaveCodecError(PROCESS_EXECUTION_FAILED) when binary does not exist', async () => {
      await assert.rejects(
        async () => {
          await runner.run('non_existent_yume_binary_xyz_123.exe', ['--version']);
        },
        (err: any) => {
          assert.strictEqual(err instanceof SaveCodecError, true);
          assert.strictEqual(err.code, 'PROCESS_EXECUTION_FAILED');
          return true;
        }
      );
    });
  });

  describe('MockProcessRunner (CI Fixture & Hermetic Testing)', () => {
    let mockRunner: MockProcessRunner;

    beforeEach(() => {
      mockRunner = new MockProcessRunner();
    });

    it('records executed commands, args, and options', async () => {
      mockRunner.registerCommand('ModernSaveConverter', {
        exitCode: 0,
        stdout: 'Success',
        stderr: '',
      });

      const res = await mockRunner.run('ModernSaveConverter', ['to-json', 'Assembly-CSharp.dll'], {
        cwd: '/test/dir',
        timeout: 5000,
      });

      assert.strictEqual(res.exitCode, 0);
      assert.strictEqual(mockRunner.calls.length, 1);
      assert.strictEqual(mockRunner.calls[0].command, 'ModernSaveConverter');
      assert.deepStrictEqual(mockRunner.calls[0].args, ['to-json', 'Assembly-CSharp.dll']);
      assert.strictEqual(mockRunner.calls[0].options?.cwd, '/test/dir');
      assert.strictEqual(mockRunner.calls[0].options?.timeout, 5000);
    });

    it('dispatches to matching handlers by predicate', async () => {
      mockRunner.registerHandler(
        (cmd, args) => cmd.includes('python') && args[0] === 'pickle_dump.py',
        () => ({
          exitCode: 0,
          stdout: JSON.stringify({ hero: 'Alice', level: 99 }),
          stderr: '',
        })
      );

      const res = await mockRunner.run('/usr/bin/python3', ['pickle_dump.py', 'save.rpy']);
      assert.strictEqual(res.exitCode, 0);
      assert.strictEqual(JSON.parse(res.stdout).hero, 'Alice');
    });

    it('uses fallback default handler when no matching command is found', async () => {
      mockRunner.setDefaultHandler((cmd) => ({
        exitCode: 1,
        stdout: '',
        stderr: `Unknown command ${cmd}`,
      }));

      const res = await mockRunner.run('unknown_tool', []);
      assert.strictEqual(res.exitCode, 1);
      assert.strictEqual(res.stderr, 'Unknown command unknown_tool');
    });

    it('enforces buffer limit check on mock responses', async () => {
      mockRunner.registerCommand('huge_output', {
        exitCode: 0,
        stdout: 'X'.repeat(2000),
        stderr: '',
      });

      await assert.rejects(
        async () => {
          await mockRunner.run('huge_output', [], { maxBuffer: 1000 });
        },
        (err: any) => {
          assert.strictEqual(err instanceof SaveCodecError, true);
          assert.strictEqual(err.code, 'PROCESS_BUFFER_OVERFLOW');
          return true;
        }
      );
    });

    it('supports simulateTimeout helper for rapid failure path assertions', () => {
      assert.throws(
        () => mockRunner.simulateTimeout(15000),
        (err: any) => {
          assert.strictEqual(err instanceof SaveCodecError, true);
          assert.strictEqual(err.code, 'PROCESS_TIMEOUT');
          assert.match(err.message, /15000ms/);
          return true;
        }
      );
    });

    it('resets recorded calls and handlers cleanly', async () => {
      mockRunner.registerCommand('test', { exitCode: 0, stdout: 'ok', stderr: '' });
      await mockRunner.run('test', []);
      assert.strictEqual(mockRunner.calls.length, 1);

      mockRunner.reset();
      assert.strictEqual(mockRunner.calls.length, 0);
      const res = await mockRunner.run('test', []);
      assert.strictEqual(res.stdout, '');
    });
  });

  describe('Unity BinaryFormatter / ModernSaveConverter Driver Bridge', () => {
    let mockRunner: MockProcessRunner;

    beforeEach(() => {
      mockRunner = new MockProcessRunner();
    });

    it('decodes Unity binary save via ModernSaveConverter mock driver', async () => {
      mockRunner.registerHandler(
        (cmd, args) => args.includes('to-json'),
        async (_cmd, args) => {
          const tempOut = args[args.length - 1];
          const mockJson = {
            playerName: 'Sayuki',
            gold: 50000,
            inventory: ['Elixir', 'Excalibur'],
          };
          await fs.writeFile(tempOut, JSON.stringify(mockJson), 'utf8');
          return { exitCode: 0, stdout: 'Conversion complete', stderr: '' };
        }
      );

      const fakeBin = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff]);
      const decoded = await UnityBinaryFormatterSaveCodec.decode(fakeBin, {
        runner: mockRunner,
        converterPath: 'ModernSaveConverter.exe',
        assemblyPath: 'C:/Games/SistersConnect/Assembly-CSharp.dll',
      });

      assert.strictEqual(decoded.playerName, 'Sayuki');
      assert.strictEqual(decoded.gold, 50000);
      assert.deepStrictEqual(decoded.inventory, ['Elixir', 'Excalibur']);
      assert.strictEqual(mockRunner.calls.length, 1);
      assert.strictEqual(mockRunner.calls[0].command, 'ModernSaveConverter.exe');
      assert.strictEqual(mockRunner.calls[0].args[0], 'to-json');
      assert.strictEqual(mockRunner.calls[0].args[1], 'C:/Games/SistersConnect/Assembly-CSharp.dll');
    });

    it('encodes JSON back into Unity binary save format via ModernSaveConverter mock driver', async () => {
      mockRunner.registerHandler(
        (cmd, args) => args.includes('to-bin'),
        async (_cmd, args) => {
          const tempBin = args[args.length - 2];
          await fs.writeFile(tempBin, Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]));
          return { exitCode: 0, stdout: 'Binary serialized', stderr: '' };
        }
      );

      const jsonPayload = { playerName: 'Sayuki', gold: 999999 };
      const encoded = await UnityBinaryFormatterSaveCodec.encode(jsonPayload, {
        runner: mockRunner,
        converterPath: 'ModernSaveConverter.exe',
        assemblyPath: 'C:/Games/SistersConnect/Assembly-CSharp.dll',
      });

      assert.ok(Buffer.isBuffer(encoded));
      assert.strictEqual(encoded.length, 4);
      assert.strictEqual(encoded[0], 0xDE);
      assert.strictEqual(encoded[3], 0xEF);
      assert.strictEqual(mockRunner.calls.length, 1);
      assert.strictEqual(mockRunner.calls[0].args[0], 'to-bin');
    });

    it('throws typed SaveCodecError when ModernSaveConverter fails with non-zero exit code', async () => {
      mockRunner.registerCommand('ModernSaveConverter.exe', {
        exitCode: 1,
        stdout: '',
        stderr: 'Mono.Cecil assembly resolution error: Assembly-CSharp.dll missing',
      });

      const fakeBin = Buffer.from([0x00, 0x01, 0x02]);
      await assert.rejects(
        async () => {
          await UnityBinaryFormatterSaveCodec.decode(fakeBin, {
            runner: mockRunner,
            converterPath: 'ModernSaveConverter.exe',
            assemblyPath: 'invalid/path.dll',
          });
        },
        (err: any) => {
          assert.strictEqual(err instanceof SaveCodecError, true);
          assert.strictEqual(err.code, 'PARSE_FAILED');
          assert.match(err.message, /Mono\.Cecil assembly resolution error/);
          return true;
        }
      );
    });

    it('dispatches to unity-binary-formatter via decodeSaveFile and encodeSaveFile facade', async () => {
      mockRunner.registerHandler(
        (cmd, args) => args.includes('to-json'),
        async (_cmd, args) => {
          const tempOut = args[args.length - 1];
          await fs.writeFile(tempOut, JSON.stringify({ score: 100 }), 'utf8');
          return { exitCode: 0, stdout: '', stderr: '' };
        }
      );

      const fakeBin = Buffer.from([0x11, 0x22]);
      const decoded = await decodeSaveFile('unity-binary-formatter', fakeBin, {
        runner: mockRunner,
      });
      assert.strictEqual(decoded.score, 100);

      // Auto-dispatch via .bin extension
      const decodedAuto = await decodeSaveFile('', fakeBin, {
        fileName: 'Save01.bin',
        runner: mockRunner,
      });
      assert.strictEqual(decodedAuto.score, 100);
    });
  });
});
