import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocaleStrings } from '../i18n/locale-strings';
import type { FolderSection as FolderSectionModel } from '../library/library-sections';
import type { LibraryViewItem } from '../library-stacks';

export interface FolderSectionProps {
  readonly section: FolderSectionModel;
  readonly isExpanded: boolean;
  readonly onToggleCollapse: (folderPath: string) => void;
  readonly renderItem: (item: LibraryViewItem, sectionScope?: string) => React.ReactNode;
  readonly isFiltered?: boolean;
  readonly renderTitle?: (section: FolderSectionModel) => React.ReactNode;
  readonly renderEmptyFolder?: (section: FolderSectionModel) => React.ReactNode;
}

/**
 * Collapsible folder section with CSS Grid row animation and `inert` collapsed grid accessibility.
 */
export const FolderSection: React.FC<FolderSectionProps> = ({
  section,
  isExpanded,
  onToggleCollapse,
  renderItem,
  isFiltered = false,
  renderTitle,
  renderEmptyFolder,
}) => {
  const strings = useLocaleStrings();
  const effectiveExpanded = !section.isCollapsible || isExpanded;

  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevExpandedRef = useRef(effectiveExpanded);

  useEffect(() => {
    if (prevExpandedRef.current === effectiveExpanded) return;
    prevExpandedRef.current = effectiveExpanded;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
      setIsTransitioning(true);
    }
  }, [effectiveExpanded]);

  const handleTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows') {
      setIsTransitioning(false);
    }
  }, []);

  const sectionClassName = [
    'library-section',
    'folder-section',
    !effectiveExpanded ? 'is-collapsed' : '',
    isTransitioning ? 'is-transitioning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const gridClassName = [
    'folder-section-grid',
    !effectiveExpanded ? 'is-collapsed' : '',
    isTransitioning ? 'is-transitioning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={sectionClassName}>
      <div className="library-section-header">
        {section.isCollapsible && (
          <button
            type="button"
            className="folder-section-toggle"
            aria-expanded={effectiveExpanded}
            aria-label={strings.toggle_folder}
            onClick={() => onToggleCollapse(section.path)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}

        <div className="folder-section-title-slot">
          {renderTitle ? (
            renderTitle(section)
          ) : (
            <div role="heading" aria-level={3} className="folder-section-title">
              {section.displayName}
            </div>
          )}
        </div>

        <span className="library-section-count">{section.games.length}</span>
      </div>

      <div
        className={gridClassName}
        inert={!effectiveExpanded}
        onTransitionEnd={handleTransitionEnd}
      >
        <div className="folder-section-grid-inner">
          <div className="game-grid grid-section drop-zone">
            {section.games.length === 0 ? (
              !isFiltered && renderEmptyFolder ? (
                renderEmptyFolder(section)
              ) : (
                <div className="filtered-folder-empty-state">
                  {strings.no_matching_games_in_folder}
                </div>
              )
            ) : (
              section.games.map((item) => renderItem(item, section.path))
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
