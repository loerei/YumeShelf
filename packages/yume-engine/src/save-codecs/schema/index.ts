import { SaveCodecError } from '../errors.js';
import { isDangerousKey } from '../sanitize.js';
import { normalizeSaveStrategy } from '../index.js';
import {
  StalenessTracker,
  defaultStalenessErrorMessage,
} from '../../utils/staleness-tracker.js';
import type {
  EngineLogger,
  NormalizedSaveDto,
  SaveFieldDto,
  SaveSchemaOptions,
  SaveTabDto,
  SupportedSaveStrategy,
} from '../../types.js';

export function safeLog(
  logger: EngineLogger | undefined,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>
): void {
  try {
    logger?.[level]?.(message, context);
  } catch {
    // Telemetry and external logger failures MUST NEVER abort core business logic
  }
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object') return false;
  if (
    Array.isArray(val) ||
    val instanceof Set ||
    val instanceof Map ||
    val instanceof Date ||
    val instanceof RegExp ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(val))
  ) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  return proto === null || proto === Object.prototype;
}

function resolveUserMappingLabel(userMappings: unknown, key: string | number): string {
  if (!userMappings || typeof userMappings !== 'object') return '';
  const strKey = String(key);
  if (Array.isArray(userMappings)) {
    for (const entry of userMappings) {
      if (
        entry &&
        typeof entry === 'object' &&
        String((entry as Record<string, unknown>).offset ?? (entry as Record<string, unknown>).id ?? '') === strKey
      ) {
        const name = (entry as Record<string, unknown>).name ?? (entry as Record<string, unknown>).label;
        if (name !== null && name !== undefined && typeof name !== 'object' && typeof name !== 'function' && typeof name !== 'symbol') {
          return String(name);
        }
      }
    }
    return '';
  }
  if (Object.hasOwn(userMappings, strKey)) {
    const val = (userMappings as Record<string, unknown>)[strKey];
    if (val !== null && val !== undefined && typeof val !== 'object' && typeof val !== 'function' && typeof val !== 'symbol') {
      return String(val);
    }
  }
  return '';
}

export function resolveMetadataLabel(
  metadataCollection: unknown,
  key: string | number,
  userMappings: unknown,
  fallback: string
): string {
  let rawLabel: unknown = '';
  if (metadataCollection && typeof metadataCollection === 'object') {
    if (Array.isArray(metadataCollection)) {
      const idx = typeof key === 'number' ? key : Number(key);
      if (Number.isInteger(idx) && idx >= 0 && idx < metadataCollection.length) {
        rawLabel = metadataCollection[idx];
      }
    } else if (Object.hasOwn(metadataCollection, String(key))) {
      rawLabel = (metadataCollection as Record<string, unknown>)[String(key)];
    }
  }

  if (rawLabel && typeof rawLabel === 'object' && 'name' in (rawLabel as Record<string, unknown>)) {
    rawLabel = (rawLabel as { name?: unknown }).name;
  }

  if (
    rawLabel === null ||
    rawLabel === undefined ||
    typeof rawLabel === 'object' ||
    typeof rawLabel === 'function' ||
    typeof rawLabel === 'symbol'
  ) {
    rawLabel = '';
  }

  const normalizedMeta = String(rawLabel ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .normalize('NFC');
  if (normalizedMeta) return normalizedMeta;

  const normalizedUser = resolveUserMappingLabel(userMappings, key)
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .normalize('NFC');
  if (normalizedUser) return normalizedUser;

  return fallback.replace(/[\r\n]+/g, ' ').trim().normalize('NFC');
}

function coerceScalar(
  rawVal: unknown,
  defaultScalar: number | string | boolean,
  defaultType: 'number' | 'string' | 'boolean'
): { value: number | string | boolean; type: 'number' | 'string' | 'boolean' } | null {
  if (typeof rawVal === 'number') {
    const value = Number.isFinite(rawVal) ? (Object.is(rawVal, -0) ? 0 : rawVal) : 0;
    return { value, type: 'number' };
  }
  if (typeof rawVal === 'string') {
    return { value: rawVal, type: 'string' };
  }
  if (typeof rawVal === 'boolean') {
    return { value: rawVal, type: 'boolean' };
  }
  if (rawVal === null || rawVal === undefined) {
    return { value: defaultScalar, type: defaultType };
  }
  return null;
}

function extractRpgMakerRoot(save: Record<string, unknown>): Record<string, unknown> {
  if (isPlainRecord(save.contents)) return save.contents;
  if (isPlainRecord(save.data) && !('@a' in save.data)) return save.data;
  return save;
}

function unwrapRpgMakerContainer(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const rec = obj as Record<string, unknown>;
  if (rec._data !== undefined) return unwrapRpgMakerContainer(rec._data);
  if (rec.data !== undefined) return unwrapRpgMakerContainer(rec.data);
  if (rec['@a'] !== undefined) return rec['@a'];
  return obj;
}

const TAB_LABELS: Record<string, string> = {
  variables: 'Variables',
  switches: 'Switches',
  party: 'Party',
  system: 'System',
  items: 'Items',
  weapons: 'Weapons',
  armors: 'Armors',
};

const RPG_MAKER_RESERVED_KEYS = new Set([
  '$type',
  '_userMappings',
  'contents',
  'data',
  'variables',
  '_variables',
  'switches',
  '_switches',
  'party',
  '_party',
  'system',
  '_system',
  'actors',
  '_actors',
  'map',
  '_map',
  'player',
  '_player',
  'timer',
  '_timer',
  'screen',
  '_screen',
]);

const WOLF_RESERVED_KEYS = new Set([
  '$type',
  '_userMappings',
  'format',
  'gameTitle',
  'rawBase64',
  '_decryptedBase64',
  '_sysVarOffset',
  '_sysVarCount',
  '_matrixOffset',
  '_numTables',
  'canSemanticEdit',
  'variables',
  'strings',
  'stringVariables',
  'switches',
  'tables',
  'aux_n14',
  'items',
  'weapons',
  'armors',
]);

const RENPY_RESERVED_KEYS = new Set([
  '$type',
  '_userMappings',
  '_rawBuffer',
  '_rollback',
  'store',
  'persistent',
  'variables',
  'switches',
]);

const UNITY_RESERVED_KEYS = new Set([
  '$type',
  '_userMappings',
  'int_map',
  'float_map',
  'string_map',
  'bool_map',
  'flag_map',
  'variables',
  'switches',
]);

export function extractSaveSchema(
  strategy: SupportedSaveStrategy | (string & {}),
  rawData: any,
  options?: SaveSchemaOptions
): NormalizedSaveDto {
  const canonical = normalizeSaveStrategy(strategy);
  const gameKey = options?.gameKey ?? '';
  const fileName = options?.fileName ?? '';

  safeLog(options?.logger, 'debug', 'Starting save schema extraction', {
    strategy,
    canonical,
    gameKey,
    fileName,
  });

  if (options?.shouldCancel?.()) {
    throw new SaveCodecError('Save schema extraction cancelled by user', 'PARSE_FAILED');
  }

  if (!isPlainRecord(rawData)) {
    safeLog(options?.logger, 'warn', 'Non-object or null rawData passed to extractSaveSchema', {
      strategy: canonical,
      rawType: rawData === null ? 'null' : typeof rawData,
    });
    return {
      gameKey,
      fileName,
      strategy: canonical,
      tabs: [],
      fields: [],
    };
  }

  const tracker =
    options?.stalenessTracker ??
    (options?.stalenessTimeoutMs !== undefined
      ? new StalenessTracker({
          timeoutMs: options.stalenessTimeoutMs,
          operationName: 'Save schema extraction',
          unit: 'items',
          errorFactory: (timeoutMs, operationName, unit) =>
            new SaveCodecError(defaultStalenessErrorMessage(timeoutMs, operationName, unit), 'PARSE_FAILED'),
        })
      : null);

  if (tracker && tracker.timeoutMs !== undefined && tracker.timeoutMs <= 0) {
    tracker.update(0);
  }

  const fields: SaveFieldDto[] = [];
  const tabCounts = new Map<string, number>();
  const userMappings = rawData._userMappings;

  function addField(
    tabId: string,
    key: string,
    rawVal: unknown,
    defaultScalar: number | string | boolean,
    defaultType: 'number' | 'string' | 'boolean',
    customLabel?: string,
    readOnly?: boolean
  ): void {
    if (options?.shouldCancel?.()) {
      throw new SaveCodecError('Save schema extraction cancelled by user', 'PARSE_FAILED');
    }
    if (isDangerousKey(key) || isDangerousKey(tabId)) {
      return;
    }

    const coerced = coerceScalar(rawVal, defaultScalar, defaultType);
    if (!coerced) {
      return;
    }

    let label: string;
    if (customLabel !== undefined) {
      label = customLabel.replace(/[\r\n]+/g, ' ').trim().normalize('NFC');
    } else if (tabId === 'switches') {
      label = resolveMetadataLabel(options?.metadata?.switches, key, userMappings, `Switch ${key}`);
    } else if (tabId === 'items' || tabId === 'weapons' || tabId === 'armors') {
      const singular = tabId === 'items' ? 'Item' : tabId === 'weapons' ? 'Weapon' : 'Armor';
      label = resolveMetadataLabel(options?.metadata?.[tabId], key, userMappings, `${singular} ${key}`);
    } else {
      label = resolveMetadataLabel(options?.metadata?.variables, key, userMappings, `Variable ${key}`);
    }

    const field: SaveFieldDto = {
      id: `${tabId}:${key}`,
      tabId,
      key,
      label,
      value: coerced.value,
      type: coerced.type,
    };
    if (readOnly !== undefined) {
      field.readOnly = readOnly;
    }

    fields.push(field);
    tabCounts.set(tabId, (tabCounts.get(tabId) ?? 0) + 1);

    if (tracker && fields.length % 250 === 0) {
      tracker.update(fields.length);
    }
  }

  function extractCollection(
    tabId: string,
    collection: unknown,
    defaultScalar: number | string | boolean,
    defaultType: 'number' | 'string' | 'boolean',
    oneBasedArray = false
  ): void {
    if (!collection || typeof collection !== 'object') return;
    if (Array.isArray(collection)) {
      const startIdx = oneBasedArray ? 1 : 0;
      for (let i = startIdx; i < collection.length; i++) {
        addField(tabId, String(i), collection[i], defaultScalar, defaultType);
      }
    } else if (isPlainRecord(collection)) {
      for (const key of Object.keys(collection)) {
        if (key === '@c' || key.startsWith('@') || (oneBasedArray && key === '0')) continue;
        addField(tabId, key, collection[key], defaultScalar, defaultType);
      }
    }
  }

  switch (canonical) {
    case 'rpg-maker-mv':
    case 'rpg-maker-mz': {
      const root = extractRpgMakerRoot(rawData);
      const varsContainer = unwrapRpgMakerContainer(root.variables ?? root._variables);
      const switchesContainer = unwrapRpgMakerContainer(root.switches ?? root._switches);

      extractCollection('variables', varsContainer, 0, 'number', true);
      extractCollection('switches', switchesContainer, false, 'boolean', true);

      const party = isPlainRecord(root.party)
        ? root.party
        : isPlainRecord(root._party)
          ? root._party
          : null;
      const goldVal =
        party?._gold !== undefined
          ? party._gold
          : party?.gold !== undefined
            ? party.gold
            : root._gold !== undefined
              ? root._gold
              : root.gold;
      if (goldVal !== undefined) {
        addField('party', 'gold', goldVal, 0, 'number', 'Gold');
      }
      const stepsVal = party?._steps !== undefined ? party._steps : party?.steps;
      if (stepsVal !== undefined) {
        addField('party', 'steps', stepsVal, 0, 'number', 'Steps');
      }

      if (party) {
        for (const invTab of ['items', 'weapons', 'armors'] as const) {
          const rawInv = unwrapRpgMakerContainer(party[`_${invTab}`] ?? party[invTab]);
          if (isPlainRecord(rawInv)) {
            extractCollection(invTab, rawInv, 0, 'number', false);
          }
        }
      }

      const system = isPlainRecord(root.system)
        ? root.system
        : isPlainRecord(root._system)
          ? root._system
          : null;
      const playtimeVal =
        system?._playtime !== undefined
          ? system._playtime
          : system?.playtime !== undefined
            ? system.playtime
            : root._playtime !== undefined
              ? root._playtime
              : root.playtime;
      if (playtimeVal !== undefined) {
        const defaultPlaytime = typeof playtimeVal === 'string' ? '' : 0;
        const defaultPlaytimeType = typeof playtimeVal === 'string' ? 'string' : 'number';
        addField('system', 'playtime', playtimeVal, defaultPlaytime, defaultPlaytimeType, 'Playtime');
      }
      const framesVal =
        system?._framesOnSave !== undefined ? system._framesOnSave : system?.framesOnSave;
      if (framesVal !== undefined) {
        addField('system', 'framesOnSave', framesVal, 0, 'number', 'Playtime Frames');
      }
      const saveCountVal =
        system?._saveCount !== undefined ? system._saveCount : system?.saveCount;
      if (saveCountVal !== undefined) {
        addField('system', 'saveCount', saveCountVal, 0, 'number', 'Save Count');
      }

      if (fields.length === 0) {
        for (const key of Object.keys(root)) {
          if (RPG_MAKER_RESERVED_KEYS.has(key)) continue;
          addField('variables', key, root[key], 0, 'number');
        }
      }
      break;
    }

    case 'wolf-sav': {
      if (rawData.variables && typeof rawData.variables === 'object') {
        extractCollection('variables', rawData.variables, 0, 'number', false);
      }
      const stringVars = rawData.strings ?? rawData.stringVariables;
      if (stringVars && typeof stringVars === 'object') {
        extractCollection('variables', stringVars, '', 'string', false);
      }
      if (rawData.switches && typeof rawData.switches === 'object') {
        extractCollection('switches', rawData.switches, false, 'boolean', false);
      }
      if (fields.length === 0 && !rawData.variables && !rawData.switches) {
        for (const key of Object.keys(rawData)) {
          if (WOLF_RESERVED_KEYS.has(key)) continue;
          addField('variables', key, rawData[key], 0, 'number');
        }
      }
      break;
    }

    case 'renpy-pickle': {
      if (isPlainRecord(rawData.store)) {
        for (const key of Object.keys(rawData.store)) {
          if (key.startsWith('_')) continue;
          const qualifiedKey = key.startsWith('store.') ? key : `store.${key}`;
          addField('variables', qualifiedKey, rawData.store[key], 0, 'number');
        }
      }
      if (isPlainRecord(rawData.variables)) {
        extractCollection('variables', rawData.variables, 0, 'number', false);
      }
      for (const key of Object.keys(rawData)) {
        if (
          RENPY_RESERVED_KEYS.has(key) ||
          key.startsWith('$_') ||
          key.startsWith('store._') ||
          key.startsWith('_')
        ) {
          continue;
        }
        addField('variables', key, rawData[key], 0, 'number');
      }
      if (isPlainRecord(rawData.persistent)) {
        for (const key of Object.keys(rawData.persistent)) {
          if (key.startsWith('_')) continue;
          const pKey = key.startsWith('persistent.') ? key : `persistent.${key}`;
          addField('variables', pKey, rawData.persistent[key], false, 'boolean');
        }
      }
      if (isPlainRecord(rawData.switches)) {
        extractCollection('switches', rawData.switches, false, 'boolean', false);
      }
      break;
    }

    case 'tinc-double-aes-json': {
      let foundDataPrefix = false;
      for (const key of Object.keys(rawData)) {
        if (!key.startsWith('data_')) continue;
        foundDataPrefix = true;
        addField('variables', key, rawData[key], '', 'string');
      }
      if (!foundDataPrefix) {
        for (const key of Object.keys(rawData)) {
          if (
            key === '$type' ||
            key === '_userMappings' ||
            key === 'creationDate' ||
            key === 'creationUpdate'
          ) {
            continue;
          }
          addField('variables', key, rawData[key], '', 'string');
        }
      }
      break;
    }

    case 'bakin-sgs': {
      // Bakin SGS is unsupported for editing; return empty tabs/fields safely
      break;
    }

    case 'unity-binary-formatter':
    case 'pure-json':
    case 'keyed-json':
    case 'generic':
    default: {
      if (isPlainRecord(rawData.int_map)) {
        extractCollection('variables', rawData.int_map, 0, 'number', false);
      }
      if (isPlainRecord(rawData.float_map)) {
        extractCollection('variables', rawData.float_map, 0, 'number', false);
      }
      if (isPlainRecord(rawData.string_map)) {
        extractCollection('variables', rawData.string_map, '', 'string', false);
      }
      if (isPlainRecord(rawData.bool_map)) {
        extractCollection('switches', rawData.bool_map, false, 'boolean', false);
      }
      if (rawData.variables && typeof rawData.variables === 'object') {
        extractCollection('variables', rawData.variables, 0, 'number', false);
      }
      if (rawData.switches && typeof rawData.switches === 'object') {
        extractCollection('switches', rawData.switches, false, 'boolean', false);
      }
      for (const key of Object.keys(rawData)) {
        if (UNITY_RESERVED_KEYS.has(key)) continue;
        addField('variables', key, rawData[key], 0, 'number');
      }
      break;
    }
  }

  const tabs: SaveTabDto[] = [];
  for (const [tabId, count] of tabCounts.entries()) {
    if (count > 0) {
      tabs.push({
        id: tabId,
        label: TAB_LABELS[tabId] ?? tabId,
        count,
      });
    }
  }

  options?.onProgress?.({
    current: fields.length,
    total: fields.length,
    percent: 100,
    unit: 'items',
  });

  safeLog(options?.logger, 'info', 'Completed save schema extraction', {
    strategy: canonical,
    tabCount: tabs.length,
    fieldCount: fields.length,
  });

  return {
    gameKey,
    fileName,
    strategy: canonical,
    tabs,
    fields,
  };
}
