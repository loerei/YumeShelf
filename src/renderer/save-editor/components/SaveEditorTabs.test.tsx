import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NormalizedSaveDto, SaveTabDto } from '@yumeshelf/engine/types';
import { SaveEditorTabs, SaveEditorTabsView } from './SaveEditorTabs';
import {
  createSaveEditorStore,
  SaveEditorStoreProvider,
} from '../store/save-editor-store';

const MOCK_TABS: readonly SaveTabDto[] = [
  { id: 'variables', label: 'Variables', count: 42 },
  { id: 'switches', label: 'Switches', count: 18 },
  { id: 'system', label: 'System', count: 5 },
];

describe('SaveEditorTabsView (Pure Presentational Component)', () => {
  it('renders empty nav container with save-editor-tabs--empty class when tabs are empty or undefined without SaveEditorStoreProvider', () => {
    const { rerender } = render(<SaveEditorTabsView />);
    const nav = screen.getByRole('navigation', { name: 'Save categories' });
    expect(nav).toHaveClass('save-editor-tabs', 'save-editor-tabs--empty');
    expect(nav.querySelectorAll('button')).toHaveLength(0);

    rerender(<SaveEditorTabsView tabs={[]} />);
    expect(nav).toHaveClass('save-editor-tabs', 'save-editor-tabs--empty');
    expect(nav.querySelectorAll('button')).toHaveLength(0);
  });

  it('sets aria-current="page" and .active class exclusively on the active tab while non-matching tabs omit both', () => {
    render(<SaveEditorTabsView tabs={MOCK_TABS} activeTabId="switches" />);

    const nav = screen.getByRole('navigation', { name: 'Save categories' });
    expect(nav).toHaveClass('save-editor-tabs');
    expect(nav).not.toHaveClass('save-editor-tabs--empty');

    const varBtn = screen.getByRole('button', { name: /Variables/i });
    const switchBtn = screen.getByRole('button', { name: /Switches/i });
    const sysBtn = screen.getByRole('button', { name: /System/i });

    expect(switchBtn.className).toBe('save-tab active');
    expect(switchBtn).toHaveAttribute('aria-current', 'page');
    expect(switchBtn.querySelector('.save-tab-label')?.textContent).toBe('Switches');
    expect(switchBtn.querySelector('.save-tab-count')?.textContent).toBe('(18)');

    expect(varBtn.className).toBe('save-tab');
    expect(varBtn).not.toHaveAttribute('aria-current');

    expect(sysBtn.className).toBe('save-tab');
    expect(sysBtn).not.toHaveAttribute('aria-current');
  });

  it('supports sequential Tab / Shift+Tab focus order without roving tabIndex traps and triggers onSelectTab on click, Enter, and Space', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();

    render(
      <SaveEditorTabsView
        tabs={MOCK_TABS}
        activeTabId="variables"
        onSelectTab={onSelectTab}
      />
    );

    const varBtn = screen.getByRole('button', { name: /Variables/i });
    const switchBtn = screen.getByRole('button', { name: /Switches/i });
    const sysBtn = screen.getByRole('button', { name: /System/i });

    expect(varBtn).not.toHaveAttribute('tabindex');
    expect(switchBtn).not.toHaveAttribute('tabindex');
    expect(sysBtn).not.toHaveAttribute('tabindex');

    await user.tab();
    expect(document.activeElement).toBe(varBtn);

    await user.tab();
    expect(document.activeElement).toBe(switchBtn);

    await user.keyboard('{Enter}');
    expect(onSelectTab).toHaveBeenCalledWith('switches');

    await user.tab();
    expect(document.activeElement).toBe(sysBtn);

    await user.keyboard(' ');
    expect(onSelectTab).toHaveBeenCalledWith('system');

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(switchBtn);

    await user.click(varBtn);
    expect(onSelectTab).toHaveBeenCalledWith('variables');
  });
});

describe('SaveEditorTabs (Connected Container)', () => {
  it('renders empty state when store fileStatus is idle, loading, or error', () => {
    const store = createSaveEditorStore('game-1');
    render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorTabs />
      </SaveEditorStoreProvider>
    );

    const nav = screen.getByRole('navigation', { name: 'Save categories' });
    expect(nav).toHaveClass('save-editor-tabs', 'save-editor-tabs--empty');

    act(() => {
      store.setFileLoading('file1.rpgsave');
    });
    expect(nav).toHaveClass('save-editor-tabs', 'save-editor-tabs--empty');

    act(() => {
      store.setFileError('file1.rpgsave', 'Corrupt header');
    });
    expect(nav).toHaveClass('save-editor-tabs', 'save-editor-tabs--empty');
  });

  it('derives All, conditional Pinned, and category tabs from SaveEditorStore and dispatches setActiveTab on selection', async () => {
    const user = userEvent.setup();
    const store = createSaveEditorStore('game-1');
    const dto: NormalizedSaveDto = {
      gameKey: 'game-1',
      fileName: 'file1.rpgsave',
      strategy: 'rpg-maker-mv',
      tabs: [...MOCK_TABS],
      fields: [
        {
          id: 'variables:1',
          tabId: 'variables',
          key: '1',
          label: 'Gold',
          value: 100,
          type: 'number',
        },
      ],
    };
    store.setFileLoaded(dto);

    render(
      <SaveEditorStoreProvider store={store}>
        <SaveEditorTabs />
      </SaveEditorStoreProvider>
    );

    const allBtn = screen.getByRole('button', { name: /^All/i });
    const varBtn = screen.getByRole('button', { name: /Variables/i });
    const switchBtn = screen.getByRole('button', { name: /Switches/i });

    expect(allBtn).toHaveClass('save-tab', 'active');
    expect(allBtn).toHaveAttribute('aria-current', 'page');
    expect(varBtn).not.toHaveClass('active');
    expect(switchBtn).not.toHaveClass('active');
    expect(screen.queryByRole('button', { name: /Pinned/i })).toBeNull();

    await user.click(switchBtn);

    expect(store.getSnapshot().activeTabId).toBe('switches');
    expect(switchBtn).toHaveClass('save-tab', 'active');
    expect(switchBtn).toHaveAttribute('aria-current', 'page');
    expect(allBtn).not.toHaveClass('active');
    expect(allBtn).not.toHaveAttribute('aria-current');

    await user.click(varBtn);
    expect(store.getSnapshot().activeTabId).toBe('variables');
    expect(varBtn).toHaveClass('save-tab', 'active');

    act(() => {
      store.togglePin('variables:1');
    });
    expect(screen.getByRole('button', { name: /Pinned/i })).toBeInTheDocument();
  });
});

describe('Save Editor Stylesheet Contract (AC-UXUI-4)', () => {
  it('enforces button reset, var(--accent) active/focus bindings, search width expansion without double outline, and reduced-motion rules in save-editor.css', () => {
    const cssPath = path.resolve(__dirname, '../../../styles/save-editor.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    const saveTabMatch = css.match(/\.save-tab\s*\{([^}]+)\}/);
    expect(saveTabMatch).not.toBeNull();
    const saveTabBody = saveTabMatch![1];
    const bgIndex = saveTabBody.indexOf('background: transparent');
    const borderNoneIndex = saveTabBody.indexOf('border: none');
    const borderBottomIndex = saveTabBody.indexOf('border-bottom:');
    expect(bgIndex).toBeGreaterThanOrEqual(0);
    expect(borderNoneIndex).toBeGreaterThanOrEqual(0);
    expect(borderBottomIndex).toBeGreaterThan(borderNoneIndex);

    expect(css).toMatch(
      /\.save-tab\.active,\s*\.save-tab\[aria-current="page"\]\s*\{[^}]*var\(--accent/
    );

    const searchMatch = css.match(/\.save-editor-search\s*\{([^}]+)\}/);
    expect(searchMatch).not.toBeNull();
    expect(searchMatch![1]).toMatch(/\bwidth:\s*240px/);

    const searchFocusMatch = css.match(/\.save-editor-search:focus\s*\{([^}]+)\}/);
    expect(searchFocusMatch).not.toBeNull();
    expect(searchFocusMatch![1]).toMatch(/\bwidth:\s*320px/);
    expect(searchFocusMatch![1]).toMatch(/outline:\s*none/);

    expect(css).toMatch(/\.save-editor-search:focus-visible\s*\{[^}]*outline:\s*none/);
    expect(css).toMatch(
      /\.refresh-save-btn:focus-visible,\s*\.translate-btn:focus-visible,\s*\.translate-cancel-btn:focus-visible,\s*\.save-tab:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent/
    );
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it('wraps tabs in .save-editor-tabs-container with .tabs-shadow-left and .tabs-shadow-right', () => {
    const { container } = render(<SaveEditorTabsView tabs={MOCK_TABS} activeTabId="variables" />);
    expect(container.querySelector('.save-editor-tabs-container')).not.toBeNull();
    expect(container.querySelector('.tabs-shadow.tabs-shadow-left')).not.toBeNull();
    expect(container.querySelector('.tabs-shadow.tabs-shadow-right')).not.toBeNull();
  });
});
