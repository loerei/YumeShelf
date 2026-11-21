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
import type {
  CanonicalSaveStrategy,
  SaveCodecContext,
  SaveCodecOptions,
  SaveUpdatesPayload,
  SupportedSaveStrategy,
} from '../types.js';
import { DEFAULT_MAX_DECOMPRESSED_BYTES } from '../types.js';
import { extractSaveSchema, safeLog, resolveMetadataLabel } from './schema/index.js';

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
export { extractSaveSchema, safeLog, resolveMetadataLabel };

export const STRATEGY_CANONICAL_MAP: Record<string, CanonicalSaveStrategy | 'generic'> = Object.assign(
  Object.create(null),
  {
    'renpy': 'renpy-pickle',
    'renpy-pickle': 'renpy-pickle',
    'tinc': 'tinc-double-aes-json',
    'tinc-double-aes-json': 'tinc-double-aes-json',
    'chrono-ecstasy': 'tinc-double-aes-json',
    'wolf': 'wolf-sav',
    'wolf-sav': 'wolf-sav',
    'unity-mono': 'unity-binary-formatter',
    'unity-mono-bin': 'unity-binary-formatter',
    'binary-formatter': 'unity-binary-formatter',
    'modern-save-converter': 'unity-binary-formatter',
    'unity-binary-formatter': 'unity-binary-formatter',
    'bakin': 'bakin-sgs',
    'bakin-sgs': 'bakin-sgs',
    'sgs': 'bakin-sgs',
    'rpgmaker': 'rpg-maker-mz',
    'rpg-maker-mv': 'rpg-maker-mv',
    'rpg-maker-mz': 'rpg-maker-mz',
    'rpg-maker-mv-mz': 'rpg-maker-mv',
    'lz-string': 'rpg-maker-mv',
    'rpgsave': 'rpg-maker-mv',
    'rmmzsave': 'rpg-maker-mz',
    'json': 'pure-json',
    'pure-json': 'pure-json',
    'keyed-json': 'keyed-json',
    'simple-keyed': 'keyed-json',
    'simple-keyed-json': 'keyed-json',
    'generic': 'generic',
  }
);

export function normalizeSaveStrategy(
  strategy?: SupportedSaveStrategy | (string & {}) | string | null
): CanonicalSaveStrategy | 'generic' {
  if (typeof strategy !== 'string' || !strategy.trim()) return 'generic';
  const clean = strategy.toLowerCase().trim();
  return Object.hasOwn(STRATEGY_CANONICAL_MAP, clean)
    ? (STRATEGY_CANONICAL_MAP[clean] as CanonicalSaveStrategy | 'generic')
    : 'generic';
}

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
      return PureJsonSaveCodec.decode(rawBuffer, context);

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
      return RpgMakerMvSaveCodec.decode(rawBuffer, context);

    case 'rpg-maker-mz':
    case 'rmmzsave':
    case 'rpgmaker':
      return RpgMakerMzSaveCodec.decode(rawBuffer, context);

    case 'wolf-sav':
    case 'wolf':
      return WolfSavSaveCodec.decode(rawBuffer);

    case 'renpy':
    case 'renpy-pickle':
      return RenpyPickleSaveCodec.decode(rawBuffer, context);

    case 'bakin-sgs':
    case 'bakin':
    case 'sgs':
      return BakinSgsSaveCodec.decode(rawBuffer);

    case 'unity-binary-formatter':
    case 'unity-mono':
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
      return PureJsonSaveCodec.encode(jsonData, context);

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
      return RpgMakerMvSaveCodec.encode(jsonData, context);

    case 'rpg-maker-mz':
    case 'rmmzsave':
    case 'rpgmaker':
      return RpgMakerMzSaveCodec.encode(jsonData, context);

    case 'wolf-sav':
    case 'wolf':
      return WolfSavSaveCodec.encode(jsonData);

    case 'renpy':
    case 'renpy-pickle':
      return RenpyPickleSaveCodec.encode(jsonData, context);

    case 'bakin-sgs':
    case 'bakin':
    case 'sgs':
      return BakinSgsSaveCodec.encode(jsonData);

    case 'unity-binary-formatter':
    case 'unity-mono':
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

function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === null || proto === Object.prototype;
}

function normalizeScalarValue(
  rawVal: unknown,
  targetType: 'number' | 'string' | 'boolean'
): number | string | boolean {
  if (targetType === 'boolean') {
    return Boolean(rawVal);
  }
  if (typeof rawVal === 'number') {
    return Number.isFinite(rawVal) ? (Object.is(rawVal, -0) ? 0 : rawVal) : 0;
  }
  if (typeof rawVal === 'string') {
    return rawVal;
  }
  if (typeof rawVal === 'boolean') {
    return rawVal;
  }
  if (rawVal === null || rawVal === undefined) {
    return targetType === 'string' ? '' : 0;
  }
  return 0;
}

function inferScalarTargetType(
  existing: unknown,
  fallback: 'number' | 'string' | 'boolean' = 'number'
): 'number' | 'string' | 'boolean' {
  if (typeof existing === 'string') return 'string';
  if (typeof existing === 'boolean') return 'boolean';
  if (typeof existing === 'number') return 'number';
  return fallback;
}

function extractRpgMakerRootForUpdate(save: Record<string, unknown>): Record<string, unknown> {
  if (isPlainObject(save.contents)) return save.contents;
  if (isPlainObject(save.data) && !('@a' in save.data)) return save.data;
  return save;
}

function unwrapRpgMakerContainerForUpdate(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const rec = obj as Record<string, unknown>;
  if (rec._data !== undefined) return unwrapRpgMakerContainerForUpdate(rec._data);
  if (rec.data !== undefined) return unwrapRpgMakerContainerForUpdate(rec.data);
  if (rec['@a'] !== undefined) return rec['@a'];
  return obj;
}

function applyRpgMakerDelta(
  decoded: Record<string, unknown>,
  tabId: string,
  key: string,
  rawVal: unknown
): void {
  const root = extractRpgMakerRootForUpdate(decoded);

  if (tabId === 'variables') {
    const container = unwrapRpgMakerContainerForUpdate(root.variables ?? root._variables);
    if (Array.isArray(container) && /^\d+$/.test(key)) {
      const idx = Number.parseInt(key, 10);
      const val = normalizeScalarValue(rawVal, inferScalarTargetType(container[idx], 'number'));
      container[idx] = val;
      return;
    }
    if (isPlainObject(container) && (/^\d+$/.test(key) || Object.hasOwn(container, key))) {
      const val = normalizeScalarValue(rawVal, inferScalarTargetType(container[key], 'number'));
      container[key] = val;
      return;
    }
    root[key] = normalizeScalarValue(rawVal, inferScalarTargetType(root[key], 'number'));
    return;
  }

  if (tabId === 'switches') {
    const container = unwrapRpgMakerContainerForUpdate(root.switches ?? root._switches);
    const val = normalizeScalarValue(rawVal, 'boolean');
    if (Array.isArray(container) && /^\d+$/.test(key)) {
      container[Number.parseInt(key, 10)] = val;
      return;
    }
    if (isPlainObject(container)) {
      container[key] = val;
    }
    return;
  }

  const party = isPlainObject(root.party)
    ? root.party
    : isPlainObject(root._party)
      ? root._party
      : null;

  if (tabId === 'party') {
    if (key === 'gold') {
      const val = normalizeScalarValue(rawVal, 'number');
      if (party && '_gold' in party) party._gold = val;
      else if (party && 'gold' in party) party.gold = val;
      else if ('_gold' in root) root._gold = val;
      else if ('gold' in root) root.gold = val;
      else if (party) party._gold = val;
      return;
    }
    if (key === 'steps') {
      const val = normalizeScalarValue(rawVal, 'number');
      if (party && '_steps' in party) party._steps = val;
      else if (party && 'steps' in party) party.steps = val;
      else if (party) party._steps = val;
      return;
    }
    if (party) {
      party[key] = normalizeScalarValue(rawVal, inferScalarTargetType(party[key], 'number'));
    }
    return;
  }

  if (tabId === 'items' || tabId === 'weapons' || tabId === 'armors') {
    if (party) {
      const inv = unwrapRpgMakerContainerForUpdate(party[`_${tabId}`] ?? party[tabId]);
      if (isPlainObject(inv)) {
        inv[key] = normalizeScalarValue(rawVal, 'number');
      }
    }
    return;
  }

  if (tabId === 'system') {
    const system = isPlainObject(root.system)
      ? root.system
      : isPlainObject(root._system)
        ? root._system
        : null;
    if (key === 'playtime') {
      const existing = system?._playtime ?? system?.playtime ?? root._playtime ?? root.playtime;
      const val = normalizeScalarValue(rawVal, inferScalarTargetType(existing, 'string'));
      if (system && '_playtime' in system) system._playtime = val;
      else if (system && 'playtime' in system) system.playtime = val;
      else if ('_playtime' in root) root._playtime = val;
      else if ('playtime' in root) root.playtime = val;
      return;
    }
    if (key === 'framesOnSave') {
      const val = normalizeScalarValue(rawVal, 'number');
      if (system && '_framesOnSave' in system) system._framesOnSave = val;
      else if (system) system.framesOnSave = val;
      return;
    }
    if (key === 'saveCount') {
      const val = normalizeScalarValue(rawVal, 'number');
      if (system && '_saveCount' in system) system._saveCount = val;
      else if (system) system.saveCount = val;
      return;
    }
  }
}

function applyRenpyDelta(
  decoded: Record<string, unknown>,
  tabId: string,
  key: string,
  rawVal: unknown
): void {
  if (tabId === 'switches') {
    const val = normalizeScalarValue(rawVal, 'boolean');
    if (isPlainObject(decoded.switches)) {
      decoded.switches[key] = val;
    } else {
      decoded[key] = val;
    }
    return;
  }

  if (Object.hasOwn(decoded, key)) {
    decoded[key] = normalizeScalarValue(rawVal, inferScalarTargetType(decoded[key], 'number'));
    return;
  }

  if (key.startsWith('store.') && isPlainObject(decoded.store)) {
    const shortKey = key.slice(6);
    const targetKey = Object.hasOwn(decoded.store, key) ? key : shortKey;
    decoded.store[targetKey] = normalizeScalarValue(
      rawVal,
      inferScalarTargetType(decoded.store[targetKey], 'number')
    );
    return;
  }

  if (key.startsWith('persistent.') && isPlainObject(decoded.persistent)) {
    const shortKey = key.slice(11);
    const targetKey = Object.hasOwn(decoded.persistent, key) ? key : shortKey;
    decoded.persistent[targetKey] = normalizeScalarValue(
      rawVal,
      inferScalarTargetType(decoded.persistent[targetKey], 'boolean')
    );
    return;
  }

  if (isPlainObject(decoded.variables)) {
    decoded.variables[key] = normalizeScalarValue(
      rawVal,
      inferScalarTargetType(decoded.variables[key], 'number')
    );
    return;
  }

  decoded[key] = normalizeScalarValue(rawVal, 'number');
}

function applyGenericJsonDelta(
  decoded: Record<string, unknown>,
  tabId: string,
  key: string,
  rawVal: unknown
): void {
  if (tabId === 'switches') {
    const val = normalizeScalarValue(rawVal, 'boolean');
    if (isPlainObject(decoded.bool_map) && (Object.hasOwn(decoded.bool_map, key) || !isPlainObject(decoded.switches))) {
      decoded.bool_map[key] = val;
    } else if (isPlainObject(decoded.switches)) {
      decoded.switches[key] = val;
    } else {
      decoded[key] = val;
    }
    return;
  }

  if (isPlainObject(decoded.int_map) && Object.hasOwn(decoded.int_map, key)) {
    decoded.int_map[key] = normalizeScalarValue(rawVal, 'number');
    return;
  }
  if (isPlainObject(decoded.float_map) && Object.hasOwn(decoded.float_map, key)) {
    decoded.float_map[key] = normalizeScalarValue(rawVal, 'number');
    return;
  }
  if (isPlainObject(decoded.string_map) && Object.hasOwn(decoded.string_map, key)) {
    decoded.string_map[key] = normalizeScalarValue(rawVal, 'string');
    return;
  }
  if (isPlainObject(decoded.variables) && (Object.hasOwn(decoded.variables, key) || !Object.hasOwn(decoded, key))) {
    decoded.variables[key] = normalizeScalarValue(
      rawVal,
      inferScalarTargetType(decoded.variables[key], 'number')
    );
    return;
  }

  decoded[key] = normalizeScalarValue(rawVal, inferScalarTargetType(decoded[key], 'number'));
}

export async function applySaveUpdates(
  strategy: SupportedSaveStrategy | (string & {}),
  rawBuffer: Buffer,
  updates: SaveUpdatesPayload,
  options?: SaveCodecOptions
): Promise<Buffer> {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).length === 0) {
    return rawBuffer;
  }

  const maxDecompressedBytes = options?.maxBufferSizeBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
  if (rawBuffer.length > maxDecompressedBytes) {
    throw new SaveCodecError(
      `Save buffer exceeds maximum allowed payload size (${maxDecompressedBytes} bytes)`,
      'DECOMPRESSION_FAILED'
    );
  }

  const canonical = normalizeSaveStrategy(strategy);
  const effectiveStrategy: CanonicalSaveStrategy | 'generic' =
    canonical !== 'generic'
      ? canonical
      : (() => {
          const detected = detectSaveStrategy(options?.fileName, rawBuffer, undefined, options);
          return detected ? normalizeSaveStrategy(detected) : 'generic';
        })();

  const mergedOptions: SaveCodecOptions = {
    ...options,
    originalBuffer: options?.originalBuffer ?? rawBuffer,
    maxBufferSizeBytes: maxDecompressedBytes,
    exeDir: options?.exeDir ?? options?.paths?.exeDir,
    saveDir: options?.saveDir ?? options?.paths?.saveDir,
    dataDir: options?.dataDir ?? options?.paths?.dataDir,
    langDataDir: options?.langDataDir ?? options?.paths?.langDataDir,
    paths: options?.paths ?? {
      exeDir: options?.exeDir,
      saveDir: options?.saveDir,
      dataDir: options?.dataDir,
      langDataDir: options?.langDataDir,
    },
  };

  const context: SaveCodecContext = {
    fileName: options?.fileName,
    gameKey: options?.gameKey,
    options: mergedOptions,
    assemblyPath: options?.assemblyPath,
    converterPath: options?.converterPath,
  };

  const decoded = await decodeSaveFile(effectiveStrategy, rawBuffer, context);
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new SaveCodecError('Decoded save payload is not a plain object', 'PARSE_FAILED');
  }

  for (const [qualifiedKey, rawVal] of Object.entries(updates)) {
    const colonIdx = qualifiedKey.indexOf(':');
    if (colonIdx === -1) {
      safeLog(options?.logger, 'warn', '[applySaveUpdates] Skipping malformed qualified key without delimiter', {
        qualifiedKey,
      });
      continue;
    }

    const tabId = qualifiedKey.slice(0, colonIdx);
    const key = qualifiedKey.slice(colonIdx + 1);

    if (
      !tabId ||
      !key ||
      isDangerousKey(tabId) ||
      isDangerousKey(key) ||
      key.split('.').some((seg) => isDangerousKey(seg))
    ) {
      safeLog(options?.logger, 'warn', '[applySaveUpdates] Prototype pollution attempt or dangerous key rejected', {
        qualifiedKey,
      });
      continue;
    }

    switch (effectiveStrategy) {
      case 'wolf-sav': {
        if (tabId !== 'variables') {
          safeLog(options?.logger, 'warn', '[applySaveUpdates:wolf] Skipping non-variable tab for Wolf RPG save', {
            qualifiedKey,
          });
          continue;
        }

        const sysMatch = /^sys_(\d+)$/.exec(key);
        const numMatch = /^\d+$/.test(key);
        if (!sysMatch && !numMatch) {
          safeLog(options?.logger, 'warn', '[applySaveUpdates:wolf] Skipping non-variable key for Wolf RPG save', {
            qualifiedKey,
          });
          continue;
        }

        const numVal = typeof rawVal === 'number' ? rawVal : Number(rawVal);
        const finiteTrunc = Number.isFinite(numVal) ? Math.trunc(numVal) : 0;
        const clampedVal = Math.max(
          -2147483648,
          Math.min(2147483647, Object.is(finiteTrunc, -0) ? 0 : finiteTrunc)
        );

        const wolfData = decoded as Record<string, unknown>;
        if (!isPlainObject(wolfData.variables)) {
          wolfData.variables = {};
        }
        const wolfVars = wolfData.variables as Record<string, number>;

        if (sysMatch) {
          const sysIndex = Number.parseInt(sysMatch[1], 10);
          const maxSysVars =
            typeof wolfData._sysVarCount === 'number' && wolfData._sysVarCount > 0
              ? wolfData._sysVarCount
              : 5000;
          if (sysIndex >= maxSysVars) {
            safeLog(options?.logger, 'warn', '[applySaveUpdates:wolf] Out-of-bounds sys variable index', {
              sysIndex,
              max: maxSysVars,
              qualifiedKey,
            });
            continue;
          }
          wolfVars[key] = clampedVal;
        } else {
          const numericIndex = Number.parseInt(key, 10);
          const maxNumVars =
            typeof wolfData._numTables === 'number' && wolfData._numTables > 0
              ? wolfData._numTables * 100
              : typeof wolfData._sysVarCount === 'number' && wolfData._sysVarCount > 0
                ? wolfData._sysVarCount
                : 5000;
          if (numericIndex >= maxNumVars) {
            safeLog(options?.logger, 'warn', '[applySaveUpdates:wolf] Out-of-bounds numeric variable index', {
              numericIndex,
              max: maxNumVars,
              qualifiedKey,
            });
            continue;
          }
          wolfVars[key] = clampedVal;
        }
        break;
      }

      case 'rpg-maker-mv':
      case 'rpg-maker-mz': {
        applyRpgMakerDelta(decoded as Record<string, unknown>, tabId, key, rawVal);
        break;
      }

      case 'renpy-pickle': {
        applyRenpyDelta(decoded as Record<string, unknown>, tabId, key, rawVal);
        break;
      }

      case 'tinc-double-aes-json': {
        const tincData = decoded as Record<string, unknown>;
        if (tabId === 'switches' && isPlainObject(tincData.switches)) {
          tincData.switches[key] = normalizeScalarValue(rawVal, 'boolean');
        } else {
          tincData[key] = normalizeScalarValue(
            rawVal,
            inferScalarTargetType(tincData[key], 'number')
          );
        }
        break;
      }

      case 'pure-json':
      case 'keyed-json':
      case 'unity-binary-formatter':
      default: {
        applyGenericJsonDelta(decoded as Record<string, unknown>, tabId, key, rawVal);
        break;
      }
    }
  }

  return await encodeSaveFile(effectiveStrategy, decoded, context);
}
