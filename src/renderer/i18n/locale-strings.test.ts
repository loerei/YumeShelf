import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatLanguageLabel,
  resetLocaleCacheForTests,
  resolveStringsFromState,
  sortLanguageOptions,
} from './locale-strings';

describe('locale-strings & 4-language pack schema parity', () => {
  afterEach(() => {
    resetLocaleCacheForTests();
  });

  it('maintains 100% key parity across en, ja, zh, vi, and en.sample language packs', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const packPaths: Record<string, string> = {
      en: path.join(repoRoot, 'src/locales/builtins/en.json'),
      ja: path.join(repoRoot, 'src/locales/builtins/ja.json'),
      zh: path.join(repoRoot, 'src/locales/builtins/zh.json'),
      vi: path.join(repoRoot, 'language-packs/packs/vi.json'),
      sample: path.join(repoRoot, 'language-packs/templates/en.sample.json'),
    };

    const keySets: Record<string, string[]> = {};
    for (const [code, filePath] of Object.entries(packPaths)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
        strings: Record<string, unknown>;
      };
      keySets[code] = Object.keys(parsed.strings).sort();
    }

    expect(keySets.ja).toEqual(keySets.en);
    expect(keySets.zh).toEqual(keySets.en);
    expect(keySets.vi).toEqual(keySets.en);
    expect(keySets.sample).toEqual(keySets.en);
  });

  it('resolves installed and built-in language pack strings from state.locales[code]', () => {
    const state = {
      builtIn: [{ code: 'en', nativeName: 'English', englishName: 'English' }],
      installed: [{ code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese' }],
      locales: {
        en: {
          title: 'YumeShelf',
          no_results: 'Nobody here but us chickens!',
          placeholders: ['What are you looking for, Dummy?'],
        },
        vi: {
          no_results: 'Ở đây chỉ có gà thôi, không thấy game nào hết!',
          placeholders: ['Đang tìm cái gì đó đồ ngốc?'],
        },
      },
    };

    const viStrings = resolveStringsFromState('vi', state);
    expect(viStrings.no_results).toBe('Ở đây chỉ có gà thôi, không thấy game nào hết!');
    expect(viStrings.placeholders).toEqual(['Đang tìm cái gì đó đồ ngốc?']);
    expect(viStrings.title).toBe('YumeShelf');
  });

  it('formats language labels as Native (English) and sorts built-ins before installed packs', () => {
    const sorted = sortLanguageOptions(
      [
        { code: 'zh', nativeName: '简体中文', englishName: 'Simplified Chinese' },
        { code: 'en', nativeName: 'English', englishName: 'English' },
        { code: 'ja', nativeName: '日本語', englishName: 'Japanese' },
      ],
      [{ code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese' }]
    );

    expect(sorted.map((item) => item.code)).toEqual(['en', 'ja', 'zh', 'vi']);
    expect(sorted[0].label).toBe('English');
    expect(sorted[1].label).toBe('日本語 (Japanese)');
    expect(sorted[3].label).toBe('Tiếng Việt (Vietnamese)');
    expect(formatLanguageLabel({ code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese' })).toBe(
      'Tiếng Việt (Vietnamese)'
    );
  });
});
