import { SaveCodecError, type SaveCodecErrorCode } from './errors.js';
import { PureJsonSaveCodec } from './pure-json.js';
import { KeyedJsonSaveCodec } from './keyed-json.js';
import { RpgMakerMvSaveCodec } from './rpg-maker-mv.js';
import { RpgMakerMzSaveCodec } from './rpg-maker-mz.js';
import { WolfSavSaveCodec } from './wolf-sav.js';
import { RenpyPickleSaveCodec } from './renpy-pickle.js';
import { BakinSgsSaveCodec } from './bakin-sgs.js';
import { UnityBinaryFormatterSaveCodec } from './unity-binary-formatter.js';
import { TincDoubleAesJsonSaveCodec } from './tinc-double-aes-json.js';
import { isDangerousKey, sanitizeDeep, createSafeDict, safeJsonParse } from './sanitize.js';
import type { SaveCodecContext, SaveCodecOptions } from '../types.js';

export * from './errors.js';
export * from './sanitize.js';
export * from './lz-string.js';
export * from './pure-json.js';
export * from './keyed-json.js';
export * from './rpg-maker-mv.js';
export * from './rpg-maker-mz.js';
export * from './wolf-sav.js';
export * from './renpy-pickle.js';
export * from './bakin-sgs.js';
export * from './unity-binary-formatter.js';
export * from './tinc-double-aes-json.js';

export function detectSaveStrategy(
  fileName?: string,
  rawBuffer?: Buffer,
  jsonData?: any,
  options?: SaveCodecOptions
): string | null {
  // 1. Prioritize $type check first
  if (jsonData?.$type === 'TincDoubleAesJsonSave') {
    return 'tinc-double-aes-json';
  }

  // 2. Preserve dedicated non-JSON format invariants
  let baseName = '';
  const hasFileName = typeof fileName === 'string' && fileName.trim() !== '';
  if (hasFileName) {
    const clean = fileName.trim().replace(/\\/g, '/');
    baseName = clean.substring(clean.lastIndexOf('/') + 1).toLowerCase();

    if (baseName.endsWith('.rpgsave')) return 'rpg-maker-mv';
    if (baseName.endsWith('.rmmzsave')) return 'rpg-maker-mz';
    if (baseName.endsWith('.sav')) return 'wolf-sav';
    if (baseName.endsWith('.save')) return 'renpy-pickle';
    if (baseName.endsWith('.sgs')) return 'bakin-sgs';
    if (baseName.endsWith('.bin')) return 'unity-binary-formatter';
  }

  // 3. Conditional TINC buffer sniffing check
  if (rawBuffer) {
    if (TincDoubleAesJsonSaveCodec.sniff(rawBuffer, options)) {
      return 'tinc-double-aes-json';
    }
  }

  // 4. If content checks do not match or buffer is absent: check fileName guard
  if (!hasFileName) {
    return null;
  }

  if (baseName.endsWith('.json')) {
    if (baseName.includes('savedata')) return 'keyed-json';
    return 'pure-json';
  }

  return null;
}

export function isSupportedSaveFile(fileName: string): boolean {
  return detectSaveStrategy(fileName) !== null;
}

export function listSupportedSaveExtensions(): string[] {
  return ['.bin', '.json', '.rmmzsave', '.rpgsave', '.sav', '.save', '.sgs'];
}

function normalizeStrategy(
  strategy: string,
  context?: SaveCodecContext,
  rawBuffer?: Buffer,
  jsonData?: any
): string {
  const norm = (strategy || '').toLowerCase().trim();
  if (norm) return norm;

  const detected = detectSaveStrategy(
    context?.fileName,
    rawBuffer,
    jsonData,
    context?.options
  );
  if (detected) return detected;

  return 'unknown';
}

export async function decodeSaveFile(
  strategy: string,
  rawBuffer: Buffer,
  context?: SaveCodecContext
): Promise<any> {
  const norm = normalizeStrategy(strategy, context, rawBuffer, undefined);

  switch (norm) {
    case 'pure-json':
    case 'json':
      return PureJsonSaveCodec.decode(rawBuffer);

    case 'keyed-json':
    case 'simple-keyed':
    case 'simple-keyed-json':
      return KeyedJsonSaveCodec.decode(rawBuffer, context);

    case 'tinc-double-aes-json':
    case 'chrono-ecstasy':
    case 'tinc':
      return TincDoubleAesJsonSaveCodec.decode(rawBuffer, context);

    case 'rpg-maker-mv':
    case 'rpg-maker-mv-mz':
    case 'rpgsave':
    case 'lz-string':
      return RpgMakerMvSaveCodec.decode(rawBuffer);

    case 'rpg-maker-mz':
    case 'rmmzsave':
      return RpgMakerMzSaveCodec.decode(rawBuffer);

    case 'wolf-sav':
    case 'wolf':
      return WolfSavSaveCodec.decode(rawBuffer);

    case 'renpy':
    case 'renpy-pickle':
      return RenpyPickleSaveCodec.decode(rawBuffer, context);

    case 'bakin-sgs':
    case 'sgs':
      return BakinSgsSaveCodec.decode(rawBuffer);

    case 'unity-binary-formatter':
    case 'unity-mono-bin':
    case 'binary-formatter':
    case 'modern-save-converter':
      return UnityBinaryFormatterSaveCodec.decode(rawBuffer, context);

    default:
      throw new SaveCodecError(
        `Unsupported save codec strategy: "${strategy}"`,
        'UNSUPPORTED_FORMAT'
      );
  }
}

export async function encodeSaveFile(
  strategy: string,
  jsonData: any,
  context?: SaveCodecContext
): Promise<Buffer> {
  const norm = normalizeStrategy(strategy, context, undefined, jsonData);

  switch (norm) {
    case 'pure-json':
    case 'json':
      return PureJsonSaveCodec.encode(jsonData);

    case 'keyed-json':
    case 'simple-keyed':
    case 'simple-keyed-json':
      return KeyedJsonSaveCodec.encode(jsonData, context);

    case 'tinc-double-aes-json':
    case 'chrono-ecstasy':
    case 'tinc':
      return TincDoubleAesJsonSaveCodec.encode(jsonData, context);

    case 'rpg-maker-mv':
    case 'rpg-maker-mv-mz':
    case 'rpgsave':
    case 'lz-string':
      return RpgMakerMvSaveCodec.encode(jsonData);

    case 'rpg-maker-mz':
    case 'rmmzsave':
      return RpgMakerMzSaveCodec.encode(jsonData);

    case 'wolf-sav':
    case 'wolf':
      return WolfSavSaveCodec.encode(jsonData);

    case 'renpy':
    case 'renpy-pickle':
      return RenpyPickleSaveCodec.encode(jsonData, context);

    case 'bakin-sgs':
    case 'sgs':
      return BakinSgsSaveCodec.encode(jsonData);

    case 'unity-binary-formatter':
    case 'unity-mono-bin':
    case 'binary-formatter':
    case 'modern-save-converter':
      return UnityBinaryFormatterSaveCodec.encode(jsonData, context);

    default:
      throw new SaveCodecError(
        `Unsupported save codec strategy: "${strategy}"`,
        'UNSUPPORTED_FORMAT'
      );
  }
}
