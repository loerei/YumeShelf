import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CURRENT_UI_STORAGE_VERSION,
  migrateUiPreferences,
} from './ui-storage-migrations';
import type { UiStorageAdapter } from './ui-runtime-state';

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, value);
    },
    removeItem(key: string): void {
      data.delete(key);
    },
  };
}

describe('migrateUiPreferences', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('migrates legacy sort preferences (rj -> date, title -> az, playtime -> played) and sets version to 1', () => {
    const s1 = createMemoryStorage({ yumeshelf_sort_pref: 'rj' });
    migrateUiPreferences(s1);
    expect(s1.getItem('yumeshelf_sort_pref')).toBe('date');
    expect(s1.getItem('yumeshelf_storage_version')).toBe(String(CURRENT_UI_STORAGE_VERSION));

    const s2 = createMemoryStorage({ yumeshelf_sort_pref: 'title' });
    migrateUiPreferences(s2);
    expect(s2.getItem('yumeshelf_sort_pref')).toBe('az');

    const s3 = createMemoryStorage({ yumeshelf_sort_pref: 'playtime' });
    migrateUiPreferences(s3);
    expect(s3.getItem('yumeshelf_sort_pref')).toBe('played');
  });

  it('migrates yumeshelf_language to yumeshelf_lang when canonical key is unset and removes legacy key', () => {
    const storage = createMemoryStorage({ yumeshelf_language: ' ja ' });
    migrateUiPreferences(storage);
    expect(storage.getItem('yumeshelf_lang')).toBe('ja');
    expect(storage.getItem('yumeshelf_language')).toBeNull();
  });

  it('prunes yumeshelf_language when yumeshelf_lang is already present, and prunes empty canonical key', () => {
    const storage = createMemoryStorage({
      yumeshelf_lang: 'en',
      yumeshelf_language: 'ja',
    });
    migrateUiPreferences(storage);
    expect(storage.getItem('yumeshelf_lang')).toBe('en');
    expect(storage.getItem('yumeshelf_language')).toBeNull();

    const emptyCanonical = createMemoryStorage({
      yumeshelf_lang: '   ',
    });
    migrateUiPreferences(emptyCanonical);
    expect(emptyCanonical.getItem('yumeshelf_lang')).toBeNull();
  });

  it('prunes empty or whitespace strings from yumeshelf_active_category_id', () => {
    const storage = createMemoryStorage({ yumeshelf_active_category_id: '   ' });
    migrateUiPreferences(storage);
    expect(storage.getItem('yumeshelf_active_category_id')).toBeNull();

    const valid = createMemoryStorage({ yumeshelf_active_category_id: 'cat-1' });
    migrateUiPreferences(valid);
    expect(valid.getItem('yumeshelf_active_category_id')).toBe('cat-1');
  });

  it('prunes orphaned legacy keys owned by LibraryDatabase', () => {
    const storage = createMemoryStorage({
      yumeshelf_title_display_mode: 'metadata',
      yumeshelf_display_product_codes: 'true',
      yumeshelf_translation_cache: '{}',
    });
    migrateUiPreferences(storage);
    expect(storage.getItem('yumeshelf_title_display_mode')).toBeNull();
    expect(storage.getItem('yumeshelf_display_product_codes')).toBeNull();
    expect(storage.getItem('yumeshelf_translation_cache')).toBeNull();
  });

  it('migrates legacy raw string[] in yumeshelf_custom_order to versioned v1 envelope', () => {
    const storage = createMemoryStorage({
      yumeshelf_custom_order: JSON.stringify(['g1', '', '  ', 'g2']),
    });
    migrateUiPreferences(storage);
    expect(JSON.parse(storage.getItem('yumeshelf_custom_order')!)).toEqual({
      schemaVersion: 1,
      order: ['g1', 'g2'],
    });
  });

  it('preserves valid v1 and forward schema (> 1) envelopes in yumeshelf_custom_order', () => {
    const v1Payload = JSON.stringify({ schemaVersion: 1, order: ['a', 'b'] });
    const s1 = createMemoryStorage({ yumeshelf_custom_order: v1Payload });
    migrateUiPreferences(s1);
    expect(s1.getItem('yumeshelf_custom_order')).toBe(v1Payload);

    const v2Payload = JSON.stringify({ schemaVersion: 2, items: [{ id: 'a' }] });
    const s2 = createMemoryStorage({ yumeshelf_custom_order: v2Payload });
    migrateUiPreferences(s2);
    expect(s2.getItem('yumeshelf_custom_order')).toBe(v2Payload);
  });

  it('quarantines malformed JSON, primitives, non-versioned objects, and malformed v1 payloads and deletes yumeshelf_custom_order', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payloads = [
      '{bad-json',
      '42',
      'true',
      'null',
      JSON.stringify({ foo: 'bar' }),
      JSON.stringify({ schemaVersion: 1, order: 'not-an-array' }),
    ];

    payloads.forEach((raw, idx) => {
      const storage = createMemoryStorage({ yumeshelf_custom_order: raw });
      migrateUiPreferences(storage, () => 1700000000000 + idx);
      expect(storage.getItem('yumeshelf_custom_order')).toBeNull();
      const quarantineKey = `yumeshelf_custom_order_corrupt_${1700000000000 + idx}`;
      expect(storage.getItem(quarantineKey)).toBe(raw);
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('catches storage adapter exceptions safely and scrubs user paths from warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwingStorage: UiStorageAdapter = {
      getItem: () => {
        throw new Error('Failed reading C:\\Users\\alice\\AppData\\Local\\yumeshelf');
      },
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      removeItem: () => {},
    };

    expect(() => migrateUiPreferences(throwingStorage)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain('alice');
    expect(logged).toContain('<USER_DIR>');
  });

  it('skips migration if storage version is already >= CURRENT_UI_STORAGE_VERSION', () => {
    const storage = createMemoryStorage({
      yumeshelf_storage_version: '1',
      yumeshelf_sort_pref: 'rj',
    });
    migrateUiPreferences(storage);
    expect(storage.getItem('yumeshelf_sort_pref')).toBe('rj');
  });
});
