import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type CategoryNode, flattenCategoryTree } from '../domain/category-tree';
import { useLocaleStrings } from '../i18n/locale-strings';

export interface CategoryFilterProps {
  categories?: readonly CategoryNode[];
  activeCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

interface FilterOption {
  id: string | null;
  name: string;
  depth: number;
  trailLabel?: string;
}

export function CategoryFilter({
  categories = [],
  activeCategoryId,
  onSelectCategory,
}: CategoryFilterProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerBtnRef = useRef<HTMLButtonElement | null>(null);

  const strings = useLocaleStrings();
  const allCategoriesLabel = strings.category_filter_all || 'All categories';

  const flattenedCategories = useMemo(
    () => flattenCategoryTree(categories),
    [categories]
  );

  const allOptions: FilterOption[] = useMemo(
    () => [{ id: null, name: allCategoriesLabel, depth: 0 }, ...flattenedCategories],
    [flattenedCategories, allCategoriesLabel]
  );

  const activeCategory = useMemo(
    () => (activeCategoryId ? flattenedCategories.find((c) => c.id === activeCategoryId) ?? null : null),
    [activeCategoryId, flattenedCategories]
  );

  const handleSelect = (catId: string | null) => {
    setIsOpen(false);
    onSelectCategory(catId);
    triggerBtnRef.current?.focus();
  };

  const openDropdown = () => {
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerBtnRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node | null)) {
      setIsOpen(false);
    }
  };

  if (flattenedCategories.length === 0) {
    return null;
  }

  const labelText = activeCategory ? activeCategory.name : allCategoriesLabel;
  const triggerTooltip = activeCategory ? activeCategory.trailLabel : allCategoriesLabel;

  return (
    <div
      ref={containerRef}
      id="category-filter-container"
      className="category-filter-container"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <button
        ref={triggerBtnRef}
        type="button"
        id="category-filter-btn"
        className="category-filter-btn"
        aria-label="Filter by category"
        data-tooltip={triggerTooltip}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
      >
        <svg
          className="icon-svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
        <span className="category-filter-label" id="category-filter-label">
          {labelText}
        </span>
      </button>
      {isOpen && (
        <div
          id="category-filter-menu"
          className={`sort-menu category-filter-menu ${isOpen ? 'show' : ''}`}
          role="menu"
          aria-label="Categories"
          onMouseDown={(e) => e.preventDefault()}
        >
          {allOptions.map((item) => {
            const isSelected = activeCategoryId === item.id;
            return (
              <button
                key={item.id ?? '__all__'}
                type="button"
                id={`category-option-${item.id ?? 'all'}`}
                role="menuitem"
                aria-current={isSelected ? 'true' : undefined}
                className={`sort-item category-filter-item ${isSelected ? 'active' : ''}`}
                style={{ paddingLeft: `${15 + item.depth * 18}px` }}
                onClick={() => handleSelect(item.id)}
                data-tooltip={item.trailLabel}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
