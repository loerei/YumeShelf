import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FolderSection as FolderSectionModel, LibrarySectionsProjection } from '../library/library-sections';
import type { LibraryViewItem } from '../library-stacks';
import type { UiStorageAdapter } from '../state/ui-runtime-state';
import { FolderAccordion } from './FolderAccordion';
import { FolderSection } from './FolderSection';

function createMemoryStorage(initial: Record<string, string> = {}): UiStorageAdapter & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      map.delete(key);
    }),
  };
}

function makeItem(id: string, favorite = false): LibraryViewItem {
  return {
    groupKey: `group:${id}`,
    representativeKey: id,
    isStack: false,
    favorite,
    primaryGame: {
      gameId: id,
      gameKey: id,
      name: `Game ${id}`,
      title: `Game ${id}`,
      folderName: id,
      relativePath: id,
      favorite,
      dateAdded: 1000,
      lastPlayed: 0,
      playtime: 0,
    },
    games: [],
  } as unknown as LibraryViewItem;
}

function makeSection(
  path: string,
  displayName: string,
  items: readonly LibraryViewItem[],
  isCollapsible = true
): FolderSectionModel {
  return {
    path,
    displayName,
    games: items,
    isEmpty: items.length === 0,
    isCollapsible,
  };
}

describe('FolderAccordion & FolderSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles collapse state, applies inert, and persists versioned envelope to UiStorageAdapter', () => {
    const storage = createMemoryStorage();
    const sections = [
      makeSection('D:/Games/VN', 'VN', [makeItem('g1')]),
      makeSection('D:/Games/RPG', 'RPG', [makeItem('g2')]),
    ];
    const projection: LibrarySectionsProjection = {
      effectiveTabId: 'all',
      favoritesSection: [],
      folderSections: sections,
      allFolderSections: sections,
    };

    const { unmount } = render(
      <FolderAccordion
        projection={projection}
        storage={storage}
        renderItem={(item, scope) => (
          <button key={`${scope}-${item.representativeKey}`} type="button">
            {item.representativeKey}
          </button>
        )}
      />
    );

    const toggles = screen.getAllByRole('button', { name: 'Toggle folder' });
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggles[0]);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');

    const gridWrapper = toggles[0].closest('.folder-section')?.querySelector('.folder-section-grid');
    expect(gridWrapper?.hasAttribute('inert')).toBe(true);

    const persisted = JSON.parse(storage.map.get('yumeshelf_collapsed_folders') ?? '{}');
    expect(persisted).toEqual({
      schemaVersion: 1,
      collapsed: ['D:/Games/VN'],
    });

    unmount();

    // Re-mount restores collapsed state
    render(
      <FolderAccordion
        projection={projection}
        storage={storage}
        renderItem={(item, scope) => (
          <button key={`${scope}-${item.representativeKey}`} type="button">
            {item.representativeKey}
          </button>
        )}
      />
    );

    const restoredToggles = screen.getAllByRole('button', { name: 'Toggle folder' });
    expect(restoredToggles[0].getAttribute('aria-expanded')).toBe('false');
    expect(restoredToggles[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('handles Expand All and Collapse All toolbar buttons on tab all only', () => {
    const storage = createMemoryStorage();
    const sections = [
      makeSection('D:/Games/VN', 'VN', [makeItem('g1')]),
      makeSection('D:/Games/RPG', 'RPG', [makeItem('g2')]),
    ];

    const { rerender } = render(
      <FolderAccordion
        projection={{
          effectiveTabId: 'all',
          favoritesSection: [],
          folderSections: sections,
          allFolderSections: sections,
        }}
        storage={storage}
        renderItem={(item) => <div key={item.representativeKey}>{item.representativeKey}</div>}
      />
    );

    const expandAllBtn = screen.getByRole('button', { name: 'Expand All' });
    const collapseAllBtn = screen.getByRole('button', { name: 'Collapse All' });

    fireEvent.click(collapseAllBtn);
    const togglesAfterCollapse = screen.getAllByRole('button', { name: 'Toggle folder' });
    expect(togglesAfterCollapse[0].getAttribute('aria-expanded')).toBe('false');
    expect(togglesAfterCollapse[1].getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(expandAllBtn);
    const togglesAfterExpand = screen.getAllByRole('button', { name: 'Toggle folder' });
    expect(togglesAfterExpand[0].getAttribute('aria-expanded')).toBe('true');
    expect(togglesAfterExpand[1].getAttribute('aria-expanded')).toBe('true');

    // Non-'all' tab omits toolbar
    rerender(
      <FolderAccordion
        projection={{
          effectiveTabId: 'fav',
          favoritesSection: [makeItem('g1', true)],
          folderSections: [],
          allFolderSections: sections,
        }}
        storage={storage}
        renderItem={(item) => <div key={item.representativeKey}>{item.representativeKey}</div>}
      />
    );
    expect(screen.queryByRole('button', { name: 'Expand All' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse All' })).toBeNull();
  });

  it('forces expanded state and omits toggle button when section.isCollapsible is false even if persisted collapsed', () => {
    const storage = createMemoryStorage({
      yumeshelf_collapsed_folders: JSON.stringify({
        schemaVersion: 1,
        collapsed: ['D:/Games/VN'],
      }),
    });
    const sections = [makeSection('D:/Games/VN', 'VN', [makeItem('g1')], false)];

    render(
      <FolderAccordion
        projection={{
          effectiveTabId: 'D:/Games/VN',
          favoritesSection: [],
          folderSections: sections,
          allFolderSections: sections,
        }}
        storage={storage}
        renderItem={(item) => <div key={item.representativeKey}>{item.representativeKey}</div>}
      />
    );

    expect(screen.queryByRole('button', { name: 'Toggle folder' })).toBeNull();
    const gridWrapper = document.querySelector('.folder-section-grid');
    expect(gridWrapper?.hasAttribute('inert')).toBe(false);
    expect(gridWrapper?.classList.contains('is-collapsed')).toBe(false);
  });

  it('quarantines malformed or unversioned collapsed payloads with sanitized diagnostics', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const payloads = ['{bad', '{"a":1}', '["C:/Users/alice/Games"]'];

    for (const badPayload of payloads) {
      warnSpy.mockClear();
      const storage = createMemoryStorage({
        yumeshelf_collapsed_folders: badPayload,
      });

      const sections = [makeSection('C:/Users/alice/Games', 'Games', [makeItem('g1')])];
      render(
        <FolderAccordion
          projection={{
            effectiveTabId: 'all',
            favoritesSection: [],
            folderSections: sections,
            allFolderSections: sections,
          }}
          storage={storage}
          nowProvider={() => 123456}
          renderItem={(item) => <div key={item.representativeKey}>{item.representativeKey}</div>}
        />
      );

      expect(storage.map.has('yumeshelf_collapsed_folders')).toBe(false);
      expect(storage.map.get('yumeshelf_collapsed_folders_corrupt_123456')).toBe(badPayload);
      expect(warnSpy).toHaveBeenCalled();
    }
  });

  it('filters non-string and whitespace-only items in schemaVersion 1 payload', () => {
    const storage = createMemoryStorage({
      yumeshelf_collapsed_folders: JSON.stringify({
        schemaVersion: 1,
        collapsed: [123, null, '', '   ', 'D:/Games/VN'],
      }),
    });
    const sections = [
      makeSection('D:/Games/VN', 'VN', [makeItem('g1')]),
      makeSection('D:/Games/RPG', 'RPG', [makeItem('g2')]),
    ];

    render(
      <FolderAccordion
        projection={{
          effectiveTabId: 'all',
          favoritesSection: [],
          folderSections: sections,
          allFolderSections: sections,
        }}
        storage={storage}
        renderItem={(item) => <div key={item.representativeKey}>{item.representativeKey}</div>}
      />
    );

    const toggles = screen.getAllByRole('button', { name: 'Toggle folder' });
    expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
    expect(toggles[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('preserves schemaVersion > 1 on read and aborts write on toggle', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const futurePayload = JSON.stringify({ schemaVersion: 99, collapsed: ['D:/Games/VN'] });
    const storage = createMemoryStorage({
      yumeshelf_collapsed_folders: futurePayload,
    });
    const sections = [makeSection('D:/Games/VN', 'VN', [makeItem('g1')])];

    render(
      <FolderAccordion
        projection={{
          effectiveTabId: 'all',
          favoritesSection: [],
          folderSections: sections,
          allFolderSections: sections,
        }}
        storage={storage}
        renderItem={(item) => <div key={item.representativeKey}>{item.representativeKey}</div>}
      />
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[FolderAccordion] Ignoring collapsed folders with newer schemaVersion:',
      { schemaVersion: 99 }
    );

    const toggle = screen.getByRole('button', { name: 'Toggle folder' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(storage.map.get('yumeshelf_collapsed_folders')).toBe(futurePayload);
    expect(warnSpy).toHaveBeenCalledWith(
      '[FolderAccordion] Aborting write: collapsed folders schema version is newer than supported version:',
      expect.objectContaining({ abort_reason: 'FUTURE_SCHEMA_VERSION' })
    );
  });

  it('recovers from write-time corrupt non-JSON value and survives throwing UiStorageAdapter', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = createMemoryStorage();
    // Read returns null initially, then getItem returns "{bad" during write probe
    vi.spyOn(storage, 'getItem')
      .mockReturnValueOnce(null)
      .mockReturnValue('{bad');

    const sections = [makeSection('D:/Games/VN', 'VN', [makeItem('g1')])];
    render(
      <FolderAccordion
        projection={{
          effectiveTabId: 'all',
          favoritesSection: [],
          folderSections: sections,
          allFolderSections: sections,
        }}
        storage={storage}
        renderItem={(item) => <div key={item.representativeKey}>{item.representativeKey}</div>}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Toggle folder' }));
    expect(JSON.parse(storage.map.get('yumeshelf_collapsed_folders') ?? '{}')).toEqual({
      schemaVersion: 1,
      collapsed: ['D:/Games/VN'],
    });

    // Throwing storage adapter
    warnSpy.mockClear();
    const throwingStorage: UiStorageAdapter = {
      getItem: () => {
        throw new Error('Access denied at C:\\Users\\John Doe\\Games');
      },
      setItem: () => {
        throw new Error('Quota exceeded at /Users/alice/Games');
      },
      removeItem: () => {},
    };

    render(
      <FolderAccordion
        projection={{
          effectiveTabId: 'all',
          favoritesSection: [],
          folderSections: sections,
          allFolderSections: sections,
        }}
        storage={throwingStorage}
        renderItem={(item) => <div key={item.representativeKey}>{item.representativeKey}</div>}
      />
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[FolderAccordion] Failed to read collapsed folders from storage:',
      expect.objectContaining({
        error: expect.not.stringContaining('John Doe'),
      })
    );
  });

  it('manages FolderSection .is-transitioning with onTransitionEnd and prefers-reduced-motion: reduce', () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);

    const section = makeSection('D:/Games/VN', 'VN', [makeItem('g1')]);
    const { rerender } = render(
      <FolderSection
        section={section}
        isExpanded={true}
        onToggleCollapse={vi.fn()}
        renderItem={(item) => (
          <div key={item.representativeKey} data-testid="child-card">
            {item.representativeKey}
          </div>
        )}
      />
    );

    const gridWrapper = document.querySelector('.folder-section-grid') as HTMLDivElement;
    expect(gridWrapper.classList.contains('is-transitioning')).toBe(false);

    rerender(
      <FolderSection
        section={section}
        isExpanded={false}
        onToggleCollapse={vi.fn()}
        renderItem={(item) => (
          <div key={item.representativeKey} data-testid="child-card">
            {item.representativeKey}
          </div>
        )}
      />
    );
    expect(gridWrapper.classList.contains('is-transitioning')).toBe(true);

    // Bubbled transitionEnd from child does not clear is-transitioning
    const childCard = screen.getByTestId('child-card');
    const bubbledEvent = Object.assign(new Event('transitionend', { bubbles: true }), {
      propertyName: 'grid-template-rows',
    });
    fireEvent(childCard, bubbledEvent);
    expect(gridWrapper.classList.contains('is-transitioning')).toBe(true);

    // Direct transitionEnd on gridWrapper clears is-transitioning
    const directEvent = Object.assign(new Event('transitionend', { bubbles: true }), {
      propertyName: 'grid-template-rows',
    });
    fireEvent(gridWrapper, directEvent);
    expect(gridWrapper.classList.contains('is-transitioning')).toBe(false);

    // Reduced motion: does not set .is-transitioning
    matchMediaSpy.mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);

    rerender(
      <FolderSection
        section={section}
        isExpanded={true}
        onToggleCollapse={vi.fn()}
        renderItem={(item) => (
          <div key={item.representativeKey} data-testid="child-card">
            {item.representativeKey}
          </div>
        )}
      />
    );
    expect(gridWrapper.classList.contains('is-transitioning')).toBe(false);
  });
});
