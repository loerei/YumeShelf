import { useMemo, useRef } from 'react';
import type { LibraryViewItem } from '../library-stacks';

/**
 * Returns a stable array of `@dnd-kit/sortable` IDs (`${sectionScope}::${canonicalKey}`)
 * that preserves `Object.is` array identity across 1-second playtime ticks when item keys
 * and `sectionScope` are unchanged.
 */
export function useStableItemIds(
  items: readonly LibraryViewItem[],
  sectionScope: string
): readonly string[] {
  const prevIdsRef = useRef<readonly string[]>([]);
  return useMemo(() => {
    const prev = prevIdsRef.current;
    const prefix = `${sectionScope}::`;
    if (
      prev.length === items.length &&
      items.every((item, i) => {
        const key = item.isStack ? item.groupKey : item.representativeKey;
        return (
          prev[i].length === prefix.length + key.length &&
          prev[i].startsWith(prefix) &&
          prev[i].endsWith(key)
        );
      })
    ) {
      return prev;
    }
    const next = items.map(
      (item) => `${prefix}${item.isStack ? item.groupKey : item.representativeKey}`
    );
    prevIdsRef.current = next;
    return next;
  }, [items, sectionScope]);
}
