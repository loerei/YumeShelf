import type {
  NormalizedSaveDto,
  SaveFieldDto,
  SaveTabDto,
} from '@yumeshelf/engine/types';

export interface SaveEditorFilterState {
  readonly showEmpty: boolean;
  readonly showImportant: boolean;
  readonly exactMatch: boolean;
  readonly searchName: boolean;
  readonly searchValue: boolean;
  readonly searchIndex: boolean;
  readonly switchFilter: 'all' | 'true' | 'false';
}

export const DEFAULT_SAVE_EDITOR_FILTERS: SaveEditorFilterState = {
  showEmpty: false,
  showImportant: true,
  exactMatch: false,
  searchName: true,
  searchValue: true,
  searchIndex: false,
  switchFilter: 'all',
};

export const IMPORTANT_VARIABLE_IDS = new Set<number>([
  12, 15, 16, 17, 18, 19, 20, 21, 25, 26, 61, 62, 63, 64, 65, 66,
]);

const MIN_GRID_CARD_WIDTH = 280;
const GRID_COLUMN_GAP = 16;

export type TranslationLookupFn = (
  translations: Record<string, string> | null | undefined,
  normLabel: string
) => string | undefined;

export type SaveVirtualRow =
  | {
      readonly kind: 'section-header';
      readonly key: string;
      readonly tabId: string;
      readonly label: string;
      readonly count: number;
      readonly isCollapsed: boolean;
    }
  | {
      readonly kind: 'field-row';
      readonly key: string;
      readonly fields: readonly SaveFieldDto[];
      readonly isBooleanRow: boolean;
    };

export interface BuildVirtualRowsParams {
  readonly dto: NormalizedSaveDto;
  readonly pristineFieldsByTab: ReadonlyMap<string, readonly SaveFieldDto[]>;
  readonly activeTabId: string;
  readonly query: string;
  readonly filters: SaveEditorFilterState;
  readonly pinnedIds: ReadonlySet<string>;
  readonly collapsedSections: ReadonlySet<string>;
  readonly translations: Readonly<Record<string, string>>;
  readonly strings: Readonly<Record<string, unknown>>;
  readonly columnCount: number;
  readonly getTranslationFn: TranslationLookupFn;
}

export interface BuiltVirtualRowsResult {
  readonly rows: readonly SaveVirtualRow[];
  readonly totalFilteredFields: number;
  readonly sectionTabIds: readonly string[];
}

function readLocalizedString(
  strings: Readonly<Record<string, unknown>>,
  key: string,
  fallback: string
): string {
  const val = strings[key];
  return typeof val === 'string' && val.length > 0 ? val : fallback;
}

/**
 * Identifies pre-310 important RPG variables surfaced even when unnamed/empty
 * if the "Always show important" filter is enabled.
 */
export function isImportantField(field: SaveFieldDto): boolean {
  if (field.tabId !== 'variables' || field.key === '') return false;
  return IMPORTANT_VARIABLE_IDS.has(Number(field.key));
}

/**
 * Detects whether a schema field carries only an engine-generated fallback name
 * rather than game metadata or user-mapped naming.
 */
export function isUnnamedField(field: SaveFieldDto): boolean {
  const trimmed = (field.label || '').trim();
  if (!trimmed) return true;
  return (
    trimmed === `Variable ${field.key}` ||
    trimmed === `Switch ${field.key}` ||
    trimmed === `Variable #${field.key}` ||
    trimmed === `ID #${field.key}`
  );
}

/**
 * Evaluates empty-entry visibility using pre-310 semantics:
 * inventory <= 0 is always treated as empty, whereas 0/false variables & switches
 * are only treated as empty when unnamed (blank string '' is always empty).
 */
export function isEmptyField(field: SaveFieldDto): boolean {
  if (field.tabId === 'items' || field.tabId === 'weapons' || field.tabId === 'armors') {
    const numeric = typeof field.value === 'number' ? field.value : Number(field.value);
    return Number.isNaN(numeric) ? true : numeric <= 0;
  }
  if (field.tabId === 'variables') {
    return field.value === '' || (field.value === 0 && isUnnamedField(field));
  }
  if (field.tabId === 'switches') {
    return field.value === false && isUnnamedField(field);
  }
  return field.value === '';
}

function compareNumericRelation(left: number, op: string, right: number): boolean {
  switch (op) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '=':
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    default:
      return false;
  }
}

/**
 * Evaluates a SaveFieldDto against empty/important rules, switch state filter,
 * relational expressions (e.g. ">100"), exact/substring matching, and search scopes.
 */
export function matchesSaveFieldFilter(
  field: SaveFieldDto,
  normalizedQuery: string,
  filters: SaveEditorFilterState,
  translations: Readonly<Record<string, string>>,
  isPinned: boolean,
  getTranslationFn: TranslationLookupFn
): boolean {
  if (
    !filters.showEmpty &&
    !isPinned &&
    isEmptyField(field) &&
    !(filters.showImportant && isImportantField(field))
  ) {
    return false;
  }

  if (field.tabId === 'switches' || field.type === 'boolean') {
    if (filters.switchFilter === 'true' && field.value !== true) return false;
    if (filters.switchFilter === 'false' && field.value !== false) return false;
  }

  const q = normalizedQuery.trim().toLowerCase().normalize('NFC');
  if (!q) return true;

  const checkIndex = filters.searchIndex;
  const checkValue = filters.searchValue;
  const checkName = filters.searchName || (!checkIndex && !checkValue);

  const relMatch = q.match(/^(>=|<=|>|<|==|=|!=)\s*(-?\d+(?:\.\d+)?)$/);
  if (relMatch) {
    const op = relMatch[1];
    const targetVal = Number.parseFloat(relMatch[2]);

    if (checkIndex && field.key !== '') {
      const numericId = Number(field.key);
      if (!Number.isNaN(numericId) && compareNumericRelation(numericId, op, targetVal)) {
        return true;
      }
    }

    if (checkValue && field.value !== null && field.value !== undefined && field.value !== '') {
      const numericVal =
        typeof field.value === 'number' ? field.value : Number(field.value);
      if (!Number.isNaN(numericVal) && compareNumericRelation(numericVal, op, targetVal)) {
        return true;
      }
    }

    return false;
  }

  const matchText = (haystack: string): boolean =>
    filters.exactMatch ? haystack === q : haystack.includes(q);

  if (checkIndex) {
    const keyNorm = (field.key || '').normalize('NFC').toLowerCase();
    if (matchText(keyNorm)) return true;
  }

  if (checkValue) {
    const valStr =
      field.value !== null && field.value !== undefined
        ? String(field.value).toLowerCase().normalize('NFC')
        : '';
    if (matchText(valStr)) return true;
  }

  if (checkName) {
    const normLabel = (field.label || '').normalize('NFC');
    const rawLower = normLabel.toLowerCase();
    const translated = getTranslationFn(translations as Record<string, string>, normLabel);
    const transLower = translated ? translated.normalize('NFC').toLowerCase() : '';
    if (matchText(rawLower) || (transLower !== '' && matchText(transLower))) {
      return true;
    }
  }

  return false;
}

/**
 * Builds the Save Editor tab list by prepending synthetic "All" and conditional
 * "Pinned" tabs ahead of localized category tabs from NormalizedSaveDto.
 */
export function buildVisibleTabs(
  dtoTabs: readonly SaveTabDto[],
  fields: readonly SaveFieldDto[],
  pinnedIds: ReadonlySet<string>,
  strings: Readonly<Record<string, unknown>>
): readonly SaveTabDto[] {
  if (dtoTabs.length === 0) return [];

  const localizedTabs: SaveTabDto[] = dtoTabs.map((tab) => ({
    ...tab,
    label: readLocalizedString(strings, `save_editor_${tab.id}`, tab.label),
  }));

  const result: SaveTabDto[] = [
    {
      id: 'all',
      label: readLocalizedString(strings, 'save_editor_all', 'All'),
      count: fields.length,
    },
  ];

  if (pinnedIds.size > 0) {
    const pinnedCount = fields.reduce((acc, f) => acc + (pinnedIds.has(f.id) ? 1 : 0), 0);
    if (pinnedCount > 0) {
      result.push({
        id: 'pinned',
        label: readLocalizedString(strings, 'save_editor_pinned', 'Pinned'),
        count: pinnedCount,
      });
    }
  }

  result.push(...localizedTabs);
  return result;
}

/**
 * Computes responsive grid column count matching `.save-grid` minmax(280px, 1fr) + 16px gap.
 */
export function computeGridColumnCount(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1;
  return Math.max(
    1,
    Math.floor((containerWidth + GRID_COLUMN_GAP) / (MIN_GRID_CARD_WIDTH + GRID_COLUMN_GAP))
  );
}

function appendChunkedFieldRows(
  rows: SaveVirtualRow[],
  fields: readonly SaveFieldDto[],
  columnCount: number,
  usedKeys: Set<string>
): void {
  const cols = Math.max(1, Math.floor(columnCount));
  for (let i = 0; i < fields.length; i += cols) {
    const slice = fields.slice(i, i + cols);
    const isBooleanRow = slice.every(
      (f) => f.type === 'boolean' || typeof f.value === 'boolean'
    );
    const baseKey = slice[0]?.id ?? `row:${i}`;
    let key = baseKey;
    if (usedKeys.has(key)) {
      key = `${baseKey}:${i}`;
    }
    usedKeys.add(key);

    rows.push({
      kind: 'field-row',
      key,
      fields: slice,
      isBooleanRow,
    });
  }
}

/**
 * Projects NormalizedSaveDto fields into virtualized rows supporting multi-column
 * grids and collapsible category sections under the synthetic "All" tab.
 */
export function buildVirtualRows({
  dto,
  pristineFieldsByTab,
  activeTabId,
  query,
  filters,
  pinnedIds,
  collapsedSections,
  translations,
  strings,
  columnCount,
  getTranslationFn,
}: BuildVirtualRowsParams): BuiltVirtualRowsResult {
  const normalizedQuery = query.trim().toLowerCase().normalize('NFC');
  const rows: SaveVirtualRow[] = [];
  const usedKeys = new Set<string>();
  const sectionTabIds: string[] = [];
  let totalFilteredFields = 0;

  if (activeTabId === 'all') {
    for (const tab of dto.tabs || []) {
      const sourceFields = pristineFieldsByTab.get(tab.id) ?? [];
      const filtered = sourceFields.filter((field) =>
        matchesSaveFieldFilter(
          field,
          normalizedQuery,
          filters,
          translations,
          pinnedIds.has(field.id),
          getTranslationFn
        )
      );
      if (filtered.length === 0) continue;

      totalFilteredFields += filtered.length;
      sectionTabIds.push(tab.id);
      const isCollapsed = collapsedSections.has(tab.id);
      rows.push({
        kind: 'section-header',
        key: `section:${tab.id}`,
        tabId: tab.id,
        label: readLocalizedString(strings, `save_editor_${tab.id}`, tab.label),
        count: filtered.length,
        isCollapsed,
      });

      if (!isCollapsed) {
        appendChunkedFieldRows(rows, filtered, columnCount, usedKeys);
      }
    }

    return { rows, totalFilteredFields, sectionTabIds };
  }

  if (activeTabId === 'pinned') {
    const pinnedSource = (dto.fields || []).filter((f) => pinnedIds.has(f.id));
    const filtered = pinnedSource.filter((field) =>
      matchesSaveFieldFilter(
        field,
        normalizedQuery,
        filters,
        translations,
        true,
        getTranslationFn
      )
    );
    totalFilteredFields = filtered.length;
    appendChunkedFieldRows(rows, filtered, columnCount, usedKeys);
    return { rows, totalFilteredFields, sectionTabIds };
  }

  const sourceFields = pristineFieldsByTab.get(activeTabId) ?? [];
  const filtered = sourceFields.filter((field) =>
    matchesSaveFieldFilter(
      field,
      normalizedQuery,
      filters,
      translations,
      pinnedIds.has(field.id),
      getTranslationFn
    )
  );
  totalFilteredFields = filtered.length;
  appendChunkedFieldRows(rows, filtered, columnCount, usedKeys);
  return { rows, totalFilteredFields, sectionTabIds };
}
