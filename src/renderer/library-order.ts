import type { GameEntry } from './types/game';
import type { UiStorageAdapter } from './state/ui-runtime-state';
import { sanitizeUserPaths } from '../shared/path-sanitizer';

const CUSTOM_ORDER_STORAGE_KEY = 'yumeshelf_custom_order';

const formatSanitizedError = (err: unknown) => ({
  error: sanitizeUserPaths(err instanceof Error ? err.message : err),
  stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
});

const defaultStorage: UiStorageAdapter =
  typeof localStorage !== 'undefined'
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      };

export function getGameKey(game: Partial<GameEntry> | null | undefined): string {
  if (!game) return '';
  if (game.instanceId && !Array.isArray(game.instances) && !game.primaryInstance) {
    return game.gameKey || game.instanceId || game.relativePath || game.folderName || '';
  }
  return game.gameKey || game.gameId || game.relativePath || game.folderName || '';
}

export function readStoredCustomOrder(
  storage: UiStorageAdapter = defaultStorage,
  nowProvider: () => number = Date.now
): string[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(CUSTOM_ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed)) {
        // Defense-in-depth: support legacy raw string array if accessed outside startup migrateUiPreferences
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
      const envelope = parsed as Record<string, unknown>;
      if (typeof envelope.schemaVersion === 'number' && envelope.schemaVersion > 1) {
        // Forward schema version: return empty array to avoid mutating unknown structure
        return [];
      }
      if (envelope.schemaVersion === 1 && Array.isArray(envelope.order)) {
        return envelope.order.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
    }
    // Non-object or unrecognized malformed structure triggers quarantine recovery
    throw new SyntaxError('Stored custom order payload is malformed or invalid schema structure');
  } catch (err) {
    if (err instanceof SyntaxError && raw !== null) {
      console.warn('[LIBRARY-ORDER] Corrupt custom order payload encountered; quarantining:', formatSanitizedError(err));
      const corruptKey = `yumeshelf_custom_order_corrupt_${nowProvider()}`;
      try {
        storage.setItem(corruptKey, raw);
      } catch (storageErr) {
        console.warn('[LIBRARY-ORDER] Failed during corrupt custom order recovery:', formatSanitizedError(storageErr));
      } finally {
        try {
          storage.removeItem(CUSTOM_ORDER_STORAGE_KEY);
        } catch (removeErr) {
          console.warn('[LIBRARY-ORDER] Failed to remove corrupt custom order key:', formatSanitizedError(removeErr));
        }
      }
    } else {
      console.warn('[LIBRARY-ORDER] Failed to read custom order from storage:', formatSanitizedError(err));
    }
    return [];
  }
}

export function resolveCustomOrder(
  games: readonly GameEntry[],
  storedOrder: readonly string[] = readStoredCustomOrder()
): string[] {
  const rawOrder = Array.isArray(storedOrder) ? storedOrder : readStoredCustomOrder();
  const keySet = new Set(games.map((g) => getGameKey(g)).filter(Boolean));
  const aliasMatches = new Map<string, string[]>();

  for (const game of games) {
    const primaryKey = getGameKey(game);
    if (!primaryKey) continue;

    const aliases = [
      String(game.gameKey || '').trim(),
      String(game.gameId || '').trim(),
      String(game.folderName || '').trim(),
      String(game.primaryInstance?.gameKey || '').trim(),
    ].filter(Boolean);

    for (const alias of aliases) {
      const matches = aliasMatches.get(alias) || [];
      if (!matches.includes(primaryKey)) {
        matches.push(primaryKey);
      }
      aliasMatches.set(alias, matches);
    }
  }

  const migratedOrder: string[] = [];
  for (const entry of rawOrder) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;

    if (keySet.has(trimmed)) {
      migratedOrder.push(trimmed);
      continue;
    }

    const matches = aliasMatches.get(trimmed) || [];
    if (matches.length === 1) {
      migratedOrder.push(matches[0]);
    }
  }

  const nextOrder: string[] = [];
  const seen = new Set<string>();

  for (const key of migratedOrder) {
    if (keySet.has(key) && !seen.has(key)) {
      nextOrder.push(key);
      seen.add(key);
    }
  }

  for (const game of games) {
    const key = getGameKey(game);
    if (key && !seen.has(key)) {
      nextOrder.push(key);
      seen.add(key);
    }
  }

  return nextOrder;
}

export function areStringArraysEqual(
  a?: readonly string[] | null,
  b?: readonly string[] | null
): boolean {
  if (a === b) return true;
  const aLen = a?.length ?? 0;
  const bLen = b?.length ?? 0;
  if (aLen === 0 && bLen === 0) return true;
  if (aLen !== bLen || !a || !b) return false;
  for (let i = 0; i < aLen; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function writeCustomOrder(
  order: readonly string[],
  storage: UiStorageAdapter = defaultStorage
): void {
  try {
    // Forward schema defense: probe existing storage before writing
    const existingRaw = storage.getItem(CUSTOM_ORDER_STORAGE_KEY);
    if (existingRaw) {
      try {
        const existing: unknown = JSON.parse(existingRaw);
        if (
          existing &&
          typeof existing === 'object' &&
          !Array.isArray(existing) &&
          typeof (existing as Record<string, unknown>).schemaVersion === 'number' &&
          ((existing as Record<string, unknown>).schemaVersion as number) > 1
        ) {
          const existingVersion = (existing as Record<string, unknown>).schemaVersion;
          console.warn('[LIBRARY-ORDER] Aborting write: custom order schema version is newer than supported version:', {
            existingVersion,
            maxSupportedVersion: 1,
            internal_outcome: 'ABORTED',
            abort_reason: 'FUTURE_SCHEMA_VERSION',
          });
          return;
        }
      } catch {
        // SyntaxError in existing value is ignored here (readStoredCustomOrder handles quarantine)
      }
    }
    const sanitized = Array.isArray(order)
      ? order.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    storage.setItem(CUSTOM_ORDER_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, order: sanitized }));
  } catch (err) {
    console.warn('[LIBRARY-ORDER] Failed to persist custom order:', formatSanitizedError(err));
  }
}

export function migrateStoredCustomOrderAliases(
  games: readonly GameEntry[],
  storedOrder: readonly string[]
): string[] | null {
  if (!Array.isArray(storedOrder) || storedOrder.length === 0 || !Array.isArray(games) || games.length === 0) {
    return null;
  }

  const keySet = new Set(games.map((g) => getGameKey(g)).filter(Boolean));
  const aliasMatches = new Map<string, string[]>();

  for (const game of games) {
    const primaryKey = getGameKey(game);
    if (!primaryKey) continue;

    const aliases = [
      String(game.gameKey || '').trim(),
      String(game.gameId || '').trim(),
      String(game.folderName || '').trim(),
      String(game.primaryInstance?.gameKey || '').trim(),
    ].filter(Boolean);

    for (const alias of aliases) {
      if (alias === primaryKey) continue;
      const matches = aliasMatches.get(alias) || [];
      if (!matches.includes(primaryKey)) {
        matches.push(primaryKey);
      }
      aliasMatches.set(alias, matches);
    }
  }

  let didMutate = false;
  const migrated: string[] = [];
  const seen = new Set<string>();

  for (const entry of storedOrder) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;

    let targetKey = trimmed;
    // 1. Canonical Key Precedence: If keySet has trimmed, strictly preserve as canonical key; NEVER remap to another game's alias
    if (keySet.has(trimmed)) {
      targetKey = trimmed;
    } else {
      // 2. Ambiguity Elimination: Remap ONLY if matches.length === 1 (unambiguous 1:1 match)
      const matches = aliasMatches.get(trimmed) || [];
      if (matches.length === 1) {
        targetKey = matches[0];
        didMutate = true;
      }
      // Ambiguous matches (> 1) and unknown keys (0, such as disconnected drives) MUST be preserved intact without modification
    }

    if (!seen.has(targetKey)) {
      migrated.push(targetKey);
      seen.add(targetKey);
    } else {
      didMutate = true;
    }
  }

  return didMutate || !areStringArraysEqual(storedOrder, migrated) ? migrated : null;
}
