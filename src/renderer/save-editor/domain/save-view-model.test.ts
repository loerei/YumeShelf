import { describe, expect, it } from 'vitest';
import type { NormalizedSaveDto, SaveFieldDto } from '@yumeshelf/engine/types';
import {
  buildVirtualRows,
  buildVisibleTabs,
  computeGridColumnCount,
  DEFAULT_SAVE_EDITOR_FILTERS,
  isEmptyField,
  isImportantField,
  isUnnamedField,
  matchesSaveFieldFilter,
} from './save-view-model';

const lookupTranslation = (
  translations: Record<string, string> | null | undefined,
  normLabel: string
): string | undefined => {
  return translations && Object.hasOwn(translations, normLabel)
    ? translations[normLabel]
    : undefined;
};

describe('save-view-model (Pure Save Editor Projection)', () => {
  it('identifies unnamed fallback labels and important RPG Maker variables', () => {
    const unnamedVar: SaveFieldDto = {
      id: 'variables:5',
      tabId: 'variables',
      key: '5',
      label: 'Variable 5',
      value: 0,
      type: 'number',
    };
    const blankLabelVar: SaveFieldDto = {
      id: 'variables:6',
      tabId: 'variables',
      key: '6',
      label: '   ',
      value: 0,
      type: 'number',
    };
    const namedVar: SaveFieldDto = {
      id: 'variables:12',
      tabId: 'variables',
      key: '12',
      label: 'Day Counter',
      value: 0,
      type: 'number',
    };
    const unnamedImportantVar: SaveFieldDto = {
      id: 'variables:15',
      tabId: 'variables',
      key: '15',
      label: 'Variable 15',
      value: 0,
      type: 'number',
    };
    const unnamedSwitch: SaveFieldDto = {
      id: 'switches:3',
      tabId: 'switches',
      key: '3',
      label: 'Switch 3',
      value: false,
      type: 'boolean',
    };

    expect(isUnnamedField(unnamedVar)).toBe(true);
    expect(isUnnamedField(blankLabelVar)).toBe(true);
    expect(isUnnamedField(namedVar)).toBe(false);
    expect(isUnnamedField(unnamedSwitch)).toBe(true);

    expect(isImportantField(unnamedVar)).toBe(false);
    expect(isImportantField(namedVar)).toBe(true);
    expect(isImportantField(unnamedImportantVar)).toBe(true);
    expect(
      isImportantField({
        id: 'switches:12',
        tabId: 'switches',
        key: '12',
        label: 'Switch 12',
        value: true,
        type: 'boolean',
      })
    ).toBe(false);
  });

  it('evaluates isEmptyField using pre-310 semantics (named 0/false preserved, unnamed 0/false & inventory <= 0 & blanks empty)', () => {
    expect(
      isEmptyField({
        id: 'items:1',
        tabId: 'items',
        key: '1',
        label: 'Potion',
        value: 0,
        type: 'number',
      })
    ).toBe(true);
    expect(
      isEmptyField({
        id: 'items:2',
        tabId: 'items',
        key: '2',
        label: 'Hi-Potion',
        value: 2,
        type: 'number',
      })
    ).toBe(false);
    expect(
      isEmptyField({
        id: 'variables:1',
        tabId: 'variables',
        key: '1',
        label: 'Variable 1',
        value: 0,
        type: 'number',
      })
    ).toBe(true);
    expect(
      isEmptyField({
        id: 'variables:2',
        tabId: 'variables',
        key: '2',
        label: 'Mana',
        value: 0,
        type: 'number',
      })
    ).toBe(false);
    expect(
      isEmptyField({
        id: 'variables:3',
        tabId: 'variables',
        key: '3',
        label: 'EmptyString',
        value: '',
        type: 'string',
      })
    ).toBe(true);
    expect(
      isEmptyField({
        id: 'switches:1',
        tabId: 'switches',
        key: '1',
        label: 'Switch 1',
        value: false,
        type: 'boolean',
      })
    ).toBe(true);
    expect(
      isEmptyField({
        id: 'switches:2',
        tabId: 'switches',
        key: '2',
        label: 'Boss Cleared',
        value: false,
        type: 'boolean',
      })
    ).toBe(false);
  });

  it('filters by showEmpty, showImportant, pinned bypass, switchFilter, scopes, exactMatch, and relational expressions', () => {
    const emptyUnnamed: SaveFieldDto = {
      id: 'variables:5',
      tabId: 'variables',
      key: '5',
      label: 'Variable 5',
      value: 0,
      type: 'number',
    };
    const importantUnnamed: SaveFieldDto = {
      id: 'variables:15',
      tabId: 'variables',
      key: '15',
      label: 'Variable 15',
      value: 0,
      type: 'number',
    };
    const hpVar: SaveFieldDto = {
      id: 'variables:24',
      tabId: 'variables',
      key: '24',
      label: 'Hero HP',
      value: 250,
      type: 'number',
    };
    const trueSwitch: SaveFieldDto = {
      id: 'switches:1',
      tabId: 'switches',
      key: '1',
      label: 'Intro Done',
      value: true,
      type: 'boolean',
    };
    const falseSwitch: SaveFieldDto = {
      id: 'switches:2',
      tabId: 'switches',
      key: '2',
      label: 'Boss Cleared',
      value: false,
      type: 'boolean',
    };

    expect(
      matchesSaveFieldFilter(emptyUnnamed, '', DEFAULT_SAVE_EDITOR_FILTERS, {}, false, lookupTranslation)
    ).toBe(false);
    expect(
      matchesSaveFieldFilter(emptyUnnamed, '', DEFAULT_SAVE_EDITOR_FILTERS, {}, true, lookupTranslation)
    ).toBe(true);
    expect(
      matchesSaveFieldFilter(
        emptyUnnamed,
        '',
        { ...DEFAULT_SAVE_EDITOR_FILTERS, showEmpty: true },
        {},
        false,
        lookupTranslation
      )
    ).toBe(true);

    expect(
      matchesSaveFieldFilter(
        importantUnnamed,
        '',
        DEFAULT_SAVE_EDITOR_FILTERS,
        {},
        false,
        lookupTranslation
      )
    ).toBe(true);
    expect(
      matchesSaveFieldFilter(
        importantUnnamed,
        '',
        { ...DEFAULT_SAVE_EDITOR_FILTERS, showImportant: false },
        {},
        false,
        lookupTranslation
      )
    ).toBe(false);

    // Switch filter
    expect(
      matchesSaveFieldFilter(
        trueSwitch,
        '',
        { ...DEFAULT_SAVE_EDITOR_FILTERS, switchFilter: 'true' },
        {},
        false,
        lookupTranslation
      )
    ).toBe(true);
    expect(
      matchesSaveFieldFilter(
        falseSwitch,
        '',
        { ...DEFAULT_SAVE_EDITOR_FILTERS, switchFilter: 'true' },
        {},
        false,
        lookupTranslation
      )
    ).toBe(false);
    expect(
      matchesSaveFieldFilter(
        falseSwitch,
        '',
        { ...DEFAULT_SAVE_EDITOR_FILTERS, switchFilter: 'false' },
        {},
        false,
        lookupTranslation
      )
    ).toBe(true);

    // Scopes & exact match
    expect(
      matchesSaveFieldFilter(
        hpVar,
        '24',
        { ...DEFAULT_SAVE_EDITOR_FILTERS, searchName: true, searchValue: true, searchIndex: false },
        {},
        false,
        lookupTranslation
      )
    ).toBe(false);
    expect(
      matchesSaveFieldFilter(
        hpVar,
        '24',
        { ...DEFAULT_SAVE_EDITOR_FILTERS, searchIndex: true },
        {},
        false,
        lookupTranslation
      )
    ).toBe(true);
    expect(
      matchesSaveFieldFilter(
        hpVar,
        'hero',
        { ...DEFAULT_SAVE_EDITOR_FILTERS, exactMatch: true },
        {},
        false,
        lookupTranslation
      )
    ).toBe(false);
    expect(
      matchesSaveFieldFilter(
        hpVar,
        'hero hp',
        { ...DEFAULT_SAVE_EDITOR_FILTERS, exactMatch: true },
        {},
        false,
        lookupTranslation
      )
    ).toBe(true);

    // Relational numeric query
    expect(
      matchesSaveFieldFilter(
        hpVar,
        '>200',
        DEFAULT_SAVE_EDITOR_FILTERS,
        {},
        false,
        lookupTranslation
      )
    ).toBe(true);
    expect(
      matchesSaveFieldFilter(
        hpVar,
        '<100',
        DEFAULT_SAVE_EDITOR_FILTERS,
        {},
        false,
        lookupTranslation
      )
    ).toBe(false);
  });

  it('builds localized All, conditional Pinned, and category tabs and computes responsive grid columns', () => {
    const fields: SaveFieldDto[] = [
      { id: 'variables:1', tabId: 'variables', key: '1', label: 'Gold', value: 100, type: 'number' },
      { id: 'switches:1', tabId: 'switches', key: '1', label: 'Flag', value: true, type: 'boolean' },
    ];
    const dtoTabs = [
      { id: 'variables', label: 'Variables', count: 1 },
      { id: 'switches', label: 'Switches', count: 1 },
    ];
    const strings = {
      save_editor_all: 'Tất cả',
      save_editor_pinned: 'Đã ghim',
      save_editor_variables: 'Biến số',
    };

    expect(buildVisibleTabs([], fields, new Set(), strings)).toEqual([]);
    expect(buildVisibleTabs(dtoTabs, fields, new Set(), strings)).toEqual([
      { id: 'all', label: 'Tất cả', count: 2 },
      { id: 'variables', label: 'Biến số', count: 1 },
      { id: 'switches', label: 'Switches', count: 1 },
    ]);
    expect(buildVisibleTabs(dtoTabs, fields, new Set(['variables:1']), strings)).toEqual([
      { id: 'all', label: 'Tất cả', count: 2 },
      { id: 'pinned', label: 'Đã ghim', count: 1 },
      { id: 'variables', label: 'Biến số', count: 1 },
      { id: 'switches', label: 'Switches', count: 1 },
    ]);

    expect(computeGridColumnCount(0)).toBe(1);
    expect(computeGridColumnCount(500)).toBe(1);
    expect(computeGridColumnCount(576)).toBe(2);
    expect(computeGridColumnCount(800)).toBe(2);
    expect(computeGridColumnCount(900)).toBe(3);
  });

  it('projects All sections with collapse state, Pinned view, and chunked multi-column rows', () => {
    const fields: SaveFieldDto[] = [
      { id: 'variables:1', tabId: 'variables', key: '1', label: 'Gold', value: 100, type: 'number' },
      { id: 'variables:2', tabId: 'variables', key: '2', label: 'HP', value: 50, type: 'number' },
      { id: 'variables:3', tabId: 'variables', key: '3', label: 'MP', value: 20, type: 'number' },
      { id: 'switches:1', tabId: 'switches', key: '1', label: 'Intro', value: true, type: 'boolean' },
    ];
    const dto: NormalizedSaveDto = {
      gameKey: 'game-1',
      fileName: 'slot1.sav',
      strategy: 'rpg-maker-mv',
      tabs: [
        { id: 'variables', label: 'Variables', count: 3 },
        { id: 'switches', label: 'Switches', count: 1 },
      ],
      fields,
    };
    const byTab = new Map<string, readonly SaveFieldDto[]>([
      ['variables', fields.slice(0, 3)],
      ['switches', fields.slice(3)],
    ]);

    const allResult = buildVirtualRows({
      dto,
      pristineFieldsByTab: byTab,
      activeTabId: 'all',
      query: '',
      filters: DEFAULT_SAVE_EDITOR_FILTERS,
      pinnedIds: new Set(['variables:2']),
      collapsedSections: new Set(['variables']),
      translations: {},
      strings: {},
      columnCount: 2,
      getTranslationFn: lookupTranslation,
    });

    expect(allResult.sectionTabIds).toEqual(['variables', 'switches']);
    expect(allResult.totalFilteredFields).toBe(4);
    expect(allResult.rows.map((r) => `${r.kind}:${r.key}`)).toEqual([
      'section-header:section:variables',
      'section-header:section:switches',
      'field-row:switches:1',
    ]);

    const pinnedResult = buildVirtualRows({
      dto,
      pristineFieldsByTab: byTab,
      activeTabId: 'pinned',
      query: '',
      filters: DEFAULT_SAVE_EDITOR_FILTERS,
      pinnedIds: new Set(['variables:2']),
      collapsedSections: new Set(),
      translations: {},
      strings: {},
      columnCount: 2,
      getTranslationFn: lookupTranslation,
    });
    expect(pinnedResult.totalFilteredFields).toBe(1);
    expect(pinnedResult.rows).toHaveLength(1);
    expect(pinnedResult.rows[0].kind).toBe('field-row');
    if (pinnedResult.rows[0].kind === 'field-row') {
      expect(pinnedResult.rows[0].fields.map((f) => f.id)).toEqual(['variables:2']);
    }

    const vars2Col = buildVirtualRows({
      dto,
      pristineFieldsByTab: byTab,
      activeTabId: 'variables',
      query: '',
      filters: DEFAULT_SAVE_EDITOR_FILTERS,
      pinnedIds: new Set(),
      collapsedSections: new Set(),
      translations: {},
      strings: {},
      columnCount: 2,
      getTranslationFn: lookupTranslation,
    });
    expect(vars2Col.rows).toHaveLength(2);
    if (vars2Col.rows[0].kind === 'field-row' && vars2Col.rows[1].kind === 'field-row') {
      expect(vars2Col.rows[0].fields.map((f) => f.id)).toEqual(['variables:1', 'variables:2']);
      expect(vars2Col.rows[1].fields.map((f) => f.id)).toEqual(['variables:3']);
    }
  });
});
