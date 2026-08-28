import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SaveCodecError } from './errors.js';
import { safeJsonParse } from './sanitize.js';
import type { SaveCodecContext } from '../types.js';
import { NodeProcessRunner } from '../process/node-process-runner.js';
import type { IProcessRunner } from '../process/types.js';

export class UnityBinaryFormatterSaveCodec {
  /**
   * Decodes Unity BinaryFormatter / Mono binary save data to structured JSON
   * via an external CLI converter driver using IProcessRunner.
   */
  static async decode(
    rawBuffer: Buffer,
    context?: SaveCodecContext
  ): Promise<any> {
    const runner: IProcessRunner = context?.runner ?? new NodeProcessRunner();
    const converterExecutable =
      context?.converterPath ??
      context?.options?.converterPath ??
      process.env.MODERN_SAVE_CONVERTER_PATH ??
      'ModernSaveConverter';
    const assemblyPath =
      context?.assemblyPath ?? context?.options?.assemblyPath ?? '';
    const baseArgs: string[] = context?.options?.baseArgs ?? [];

    const tempPrefix = `yumeshelf_dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tempIn = path.join(os.tmpdir(), `${tempPrefix}_in.bin`);
    const tempOut = path.join(os.tmpdir(), `${tempPrefix}_out.json`);

    try {
      await fs.writeFile(tempIn, rawBuffer);

      const args = [...baseArgs, 'to-json', assemblyPath, tempIn, tempOut];
      const result = await runner.run(converterExecutable, args, context?.options?.runnerOptions);

      if (result.exitCode !== 0) {
        throw new SaveCodecError(
          `Unity save converter failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`,
          'PARSE_FAILED'
        );
      }

      const jsonStr = await fs.readFile(tempOut, 'utf8');
      return safeJsonParse(jsonStr.replace(/^\uFEFF/, ''));
    } catch (err: any) {
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(
        `Failed to decode Unity binary save: ${err?.message || String(err)}`,
        'PARSE_FAILED'
      );
    } finally {
      await Promise.allSettled([
        fs.unlink(tempIn).catch(() => {}),
        fs.unlink(tempOut).catch(() => {}),
      ]);
    }
  }

  /**
   * Encodes structured JSON back into Unity BinaryFormatter / Mono binary save format
   * via an external CLI converter driver using IProcessRunner.
   */
  static async encode(
    jsonData: any,
    context?: SaveCodecContext
  ): Promise<Buffer> {
    const runner: IProcessRunner = context?.runner ?? new NodeProcessRunner();
    const converterExecutable =
      context?.converterPath ??
      context?.options?.converterPath ??
      process.env.MODERN_SAVE_CONVERTER_PATH ??
      'ModernSaveConverter';
    const assemblyPath =
      context?.assemblyPath ?? context?.options?.assemblyPath ?? '';
    const baseArgs: string[] = context?.options?.baseArgs ?? [];

    const tempPrefix = `yumeshelf_enc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tempBin = path.join(os.tmpdir(), `${tempPrefix}_out.bin`);
    const tempJson = path.join(os.tmpdir(), `${tempPrefix}_in.json`);

    try {
      if (context?.options?.originalBuffer) {
        await fs.writeFile(tempBin, context.options.originalBuffer);
      } else if (context?.options?.originalBinPath) {
        await fs.copyFile(context.options.originalBinPath, tempBin);
      } else {
        await fs.writeFile(tempBin, Buffer.alloc(0));
      }

      await fs.writeFile(tempJson, JSON.stringify(jsonData, null, 2), 'utf8');

      const args = [...baseArgs, 'to-bin', assemblyPath, tempBin, tempJson];
      const result = await runner.run(converterExecutable, args, context?.options?.runnerOptions);

      if (result.exitCode !== 0) {
        throw new SaveCodecError(
          `Unity save converter failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`,
          'PARSE_FAILED'
        );
      }

      return await fs.readFile(tempBin);
    } catch (err: any) {
      if (err instanceof SaveCodecError) throw err;
      throw new SaveCodecError(
        `Failed to encode Unity binary save: ${err?.message || String(err)}`,
        'PARSE_FAILED'
      );
    } finally {
      await Promise.allSettled([
        fs.unlink(tempBin).catch(() => {}),
        fs.unlink(tempJson).catch(() => {}),
      ]);
    }
  }
}
