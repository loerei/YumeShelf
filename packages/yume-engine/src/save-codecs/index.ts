import { SaveCodecError, type SaveCodecErrorCode } from './errors.js';
import { PureJsonSaveCodec } from './pure-json.js';
import { KeyedJsonSaveCodec } from './keyed-json.js';
import { RpgMakerMvSaveCodec } from './rpg-maker-mv.js';
import { RpgMakerMzSaveCodec } from './rpg-maker-mz.js';
import { WolfSavSaveCodec } from './wolf-sav.js';
import { RenpyPickleSaveCodec } from './renpy-pickle.js';
import { BakinSgsSaveCodec } from './bakin-sgs.js';
import { UnityBinaryFormatterSaveCodec } from './unity-binary-formatter.js';
import { isDangerousKey, sanitizeDeep, createSafeDict, safeJsonParse } from './sanitize.js';
import type { SaveCodecContext } from '../types.js';

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
export * from './staleness-tracker.js';

export function detectSaveStrategy(fileName: string): string | null {
  if (!fileName || typeof fileName !== 'string' || fileName.trim() === '') {
    return null;
  }
  const clean = fileName.trim().replace(/\\/g, '/');
  const baseName = clean.substring(clean.lastIndexOf('/') + 1).toLowerCase();

  if (baseName.endsWith('.rpgsave')) return 'rpg-maker-mv';
  if (baseName.endsWith('.rmmzsave')) return 'rpg-maker-mz';
  if (baseName.endsWith('.sav')) return 'wolf-sav';
  if (baseName.endsWith('.save')) return 'renpy-pickle';
  if (baseName.endsWith('.sgs')) return 'bakin-sgs';
  if (baseName.endsWith('.bin')) return 'unity-binary-formatter';
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

function normalizeStrategy(strategy: string, context?: SaveCodecContext): string {
  const norm = (strategy || '').toLowerCase().trim();
  if (norm) return norm;

  if (context?.fileName) {
    const detected = detectSaveStrategy(context.fileName);
    if (detected) return detected;
  }

  return 'unknown';
}

export async function decodeSaveFile(
  strategy: string,
  rawBuffer: Buffer,
  context?: SaveCodecContext
): Promise<any> {
  const norm = normalizeStrategy(strategy, context);

  switch (norm) {
    case 'pure-json':
    case 'json':
      return PureJsonSaveCodec.decode(rawBuffer);

    case 'keyed-json':
    case 'simple-keyed':
    case 'simple-keyed-json':
      return KeyedJsonSaveCodec.decode(rawBuffer, context);

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
  const norm = normalizeStrategy(strategy, context);

  switch (norm) {
    case 'pure-json':
    case 'json':
      return PureJsonSaveCodec.encode(jsonData);

    case 'keyed-json':
    case 'simple-keyed':
    case 'simple-keyed-json':
      return KeyedJsonSaveCodec.encode(jsonData, context);

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
