import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryFilter } from './CategoryFilter';
import type { CategoryNode } from '../domain/category-tree';

const SAMPLE_CATEGORIES: CategoryNode[] = [
  {
    id: 'vn',
    name: 'Visual Novels',
    children: [
      { id: 'vn-mystery', name: 'Mystery', parentId: 'vn' },
    ],
  },
  { id: 'rpg', name: 'RPGs' },
];

describe('CategoryFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retains .category-filter-btn with aria-disabled="true" and inline folder SVG when categories is empty', () => {
    const { container } = render(
      <CategoryFilter categories={[]} activeCategoryId={null} onSelectCategory={vi.fn()} />
    );

    const btn = screen.getByRole('button', { name: 'Filter by category' });
    expect(btn.classList.contains('category-filter-btn')).toBe(true);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.getAttribute('tabindex')).toBe('-1');
    expect(btn.querySelector('.category-filter-label')?.textContent).toBe('No categories');

    const path = btn.querySelector('svg path');
    expect(path?.getAttribute('d')).toBe('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
    expect(container.querySelector('use')).toBeNull();
  });

  it('renders hierarchical categories as native <button type="button" role="menuitem"> and displays active label', () => {
    const { rerender } = render(
      <CategoryFilter categories={SAMPLE_CATEGORIES} activeCategoryId={null} onSelectCategory={vi.fn()} />
    );

    const trigger = screen.getByRole('button', { name: 'Filter by category' });
    expect(trigger.querySelector('.category-filter-label')?.textContent).toBe('All categories');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const menu = screen.getByRole('menu', { name: 'Categories' });
    expect(menu.classList.contains('sort-menu')).toBe(true);
    expect(menu.classList.contains('category-filter-menu')).toBe(true);
    expect(menu.classList.contains('show')).toBe(true);

    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBe(4);
    expect(screen.queryAllByRole('option').length).toBe(0);

    // First item is "All categories"
    expect(items[0].textContent).toBe('All categories');
    expect(items[0].getAttribute('aria-current')).toBe('true');

    // Every item is a native <button type="button"> with .category-filter-item
    for (const item of items) {
      expect(item.tagName).toBe('BUTTON');
      expect(item.getAttribute('type')).toBe('button');
      expect(item.classList.contains('category-filter-item')).toBe(true);
    }

    // Depth indentation: 'Mystery' is depth 1 => 15 + 1*16 = 31px
    expect((items[2] as HTMLElement).style.paddingLeft).toBe('31px');

    rerender(
      <CategoryFilter categories={SAMPLE_CATEGORIES} activeCategoryId="vn-mystery" onSelectCategory={vi.fn()} />
    );
    expect(trigger.querySelector('.category-filter-label')?.textContent).toBe('Mystery');
  });

  it('supports Tab navigation, Enter/Space activation, Escape dismissal, outside click, and blur closure', async () => {
    const user = userEvent.setup();
    const onSelectCategory = vi.fn();

    render(
      <div>
        <CategoryFilter
          categories={SAMPLE_CATEGORIES}
          activeCategoryId={null}
          onSelectCategory={onSelectCategory}
        />
        <button type="button">Outside Button</button>
      </div>
    );

    const trigger = screen.getByRole('button', { name: 'Filter by category' });
    trigger.focus();

    // Open with ArrowDown
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeTruthy();

    // Tab moves sequentially into first menuitem
    await user.tab();
    const items = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);

    await user.tab();
    expect(document.activeElement).toBe(items[1]);

    // Escape closes menu and restores focus to trigger
    fireEvent.keyDown(items[1], { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    // Re-open with Enter, Tab to 'Mystery' (index 2), activate with Enter
    fireEvent.keyDown(trigger, { key: 'Enter' });
    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Mystery');
    await user.keyboard('{Enter}');

    expect(onSelectCategory).toHaveBeenCalledWith('vn-mystery');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    // Re-open and click 'RPGs' with mouse (onMouseDown prevents blur drop)
    fireEvent.click(trigger);
    const rpgItem = screen.getByRole('menuitem', { name: 'RPGs' });
    fireEvent.mouseDown(rpgItem);
    fireEvent.click(rpgItem);
    expect(onSelectCategory).toHaveBeenCalledWith('rpg');
    expect(document.activeElement).toBe(trigger);

    // Re-open and close via outside pointerdown
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
    const outsideBtn = screen.getByRole('button', { name: 'Outside Button' });
    fireEvent.pointerDown(outsideBtn);
    expect(screen.queryByRole('menu')).toBeNull();

    // Re-open and close via blur outside container
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.blur(trigger, { relatedTarget: outsideBtn });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
