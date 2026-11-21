import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import type { UiStorageAdapter } from './ui-runtime-state';

export const CURRENT_UI_STORAGE_VERSION = 1;

export function migrateUiPreferences(
  storage: UiStorageAdapter,
  nowProvider: () => number = Date.now
): void {
  try {
    const rawVersion = storage.getItem('yumeshelf_storage_version');
    let version = rawVersion ? parseInt(rawVersion, 10) : 0;
    if (isNaN(version)) version = 0;

    if (version < 1) {
      // 1. Sort preference canonicalization
      const sortPref = storage.getItem('yumeshelf_sort_pref');
      if (sortPref === 'rj') {
        storage.setItem('yumeshelf_sort_pref', 'date');
      } else if (sortPref === 'title') {
        storage.setItem('yumeshelf_sort_pref', 'az');
      } else if (sortPref === 'playtime') {
        storage.setItem('yumeshelf_sort_pref', 'played');
      }

      // 2. Language synonym migration and dirty key pruning
      const rawCanonical = storage.getItem('yumeshelf_lang');
      const trimmedCanonical = rawCanonical?.trim() || '';
      const rawLegacy = storage.getItem('yumeshelf_language');
      const trimmedLegacy = rawLegacy?.trim() || '';

      if (!trimmedCanonical && trimmedLegacy) {
        storage.setItem('yumeshelf_lang', trimmedLegacy);
      } else if (!trimmedCanonical && rawCanonical !== null) {
        storage.removeItem('yumeshelf_lang');
      }
      if (rawLegacy !== null) {
        storage.removeItem('yumeshelf_language');
      }

      // 3. Category ID dirty key pruning
      const activeCat = storage.getItem('yumeshelf_active_category_id');
      if (activeCat !== null && activeCat.trim() === '') {
        storage.removeItem('yumeshelf_active_category_id');
      }

      // 4. Prune orphaned legacy keys authoritatively owned by LibraryDatabase (library.json)
      storage.removeItem('yumeshelf_title_display_mode');
      storage.removeItem('yumeshelf_display_product_codes');
      storage.removeItem('yumeshelf_translation_cache');

      // 5. Migrate yumeshelf_custom_order to versioned envelope
      const rawCustomOrder = storage.getItem('yumeshelf_custom_order');
      if (rawCustomOrder !== null) {
        const purgeCorruptCustomOrder = (raw: string) => {
          try {
            const quarantineKey = `yumeshelf_custom_order_corrupt_${nowProvider()}`;
            storage.setItem(quarantineKey, raw);
            console.warn(
              '[UI-STORAGE-MIGRATIONS] Quarantined corrupted custom order payload to',
              quarantineKey
            );
          } catch (quarantineErr) {
            console.warn(
              '[UI-STORAGE-MIGRATIONS] Failed to quarantine corrupt custom order payload (storage quota exceeded):',
              {
                error: sanitizeUserPaths(
                  quarantineErr instanceof Error ? quarantineErr.message : quarantineErr
                ),
                stack:
                  quarantineErr instanceof Error && quarantineErr.stack
                    ? sanitizeUserPaths(quarantineErr.stack)
                    : undefined,
              }
            );
          } finally {
            storage.removeItem('yumeshelf_custom_order');
          }
        };

        try {
          const parsed = JSON.parse(rawCustomOrder);
          if (Array.isArray(parsed)) {
            // Legacy raw string[]: wrap in versioned envelope
            const sanitized = parsed.filter(
              (id): id is string => typeof id === 'string' && id.trim().length > 0
            );
            storage.setItem(
              'yumeshelf_custom_order',
              JSON.stringify({ schemaVersion: 1, order: sanitized })
            );
          } else if (parsed && typeof parsed === 'object') {
            const obj = parsed as { schemaVersion?: unknown; order?: unknown };
            if (typeof obj.schemaVersion === 'number' && obj.schemaVersion >= 1) {
              if (obj.schemaVersion === 1 && !Array.isArray(obj.order)) {
                // Malformed v1 payload: quarantine and purge key to prevent render flooding
                purgeCorruptCustomOrder(rawCustomOrder);
              }
              // Valid v1 or forward schema (schemaVersion > 1): preserve intact
            } else {
              // Non-versioned object: quarantine and purge key
              purgeCorruptCustomOrder(rawCustomOrder);
            }
          } else {
            // Primitive non-array (e.g. number, boolean, null string): quarantine and purge key
            purgeCorruptCustomOrder(rawCustomOrder);
          }
        } catch {
          // SyntaxError on JSON parse: quarantine and purge key immediately to halt storage flooding
          purgeCorruptCustomOrder(rawCustomOrder);
        }
      }

      storage.setItem('yumeshelf_storage_version', String(CURRENT_UI_STORAGE_VERSION));
    }
  } catch (err) {
    console.warn('[UI-STORAGE-MIGRATIONS] Failed to migrate UI preferences from localStorage:', {
      error: sanitizeUserPaths(err instanceof Error ? err.message : err),
      stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
    });
  }
}
