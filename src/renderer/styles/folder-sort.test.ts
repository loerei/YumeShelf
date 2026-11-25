import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = resolve(__dirname, '../../..');
const themeCss = readFileSync(resolve(rootDir, 'src/styles/theme.css'), 'utf-8').replace(/\r\n/g, '\n');
const styleCss = readFileSync(resolve(rootDir, 'src/style.css'), 'utf-8').replace(/\r\n/g, '\n');
const folderSortCss = readFileSync(resolve(rootDir, 'src/styles/folder-sort.css'), 'utf-8').replace(/\r\n/g, '\n');

describe('Stylesheet Contract: folder-sort.css, theme.css & style.css', () => {
  it('defines --zIndex-shelf-tabs: 200 in src/styles/theme.css', () => {
    expect(themeCss).toMatch(/--zIndex-shelf-tabs:\s*200;/);
  });

  it('imports folder-sort.css strictly after settings.css and before responsive.css in src/style.css', () => {
    const settingsIdx = styleCss.indexOf('@import "./styles/settings.css";');
    const folderSortIdx = styleCss.indexOf('@import "./styles/folder-sort.css";');
    const responsiveIdx = styleCss.indexOf('@import "./styles/responsive.css";');

    expect(settingsIdx).toBeGreaterThan(-1);
    expect(folderSortIdx).toBeGreaterThan(-1);
    expect(responsiveIdx).toBeGreaterThan(-1);
    expect(settingsIdx).toBeLessThan(folderSortIdx);
    expect(folderSortIdx).toBeLessThan(responsiveIdx);
  });

  it('defines .folder-section-grid-inner with min-height: 0 and conditional overflow: hidden', () => {
    const innerMatch = folderSortCss.match(/\.folder-section-grid-inner\s*\{([^}]*)\}/);
    expect(innerMatch).toBeTruthy();
    const innerBlock = innerMatch![1];
    expect(innerBlock).toMatch(/min-height:\s*0;/);
    expect(innerBlock).not.toMatch(/overflow:\s*hidden;/);
    expect(innerBlock).toMatch(/overflow:\s*visible;/);

    expect(folderSortCss).toMatch(
      /(\.is-collapsed|\.is-transitioning)[\s\S]*?\.folder-section-grid-inner\s*\{[^}]*overflow:\s*hidden;/
    );
  });

  it('includes @media (prefers-reduced-motion: reduce) disabling transitions', () => {
    expect(folderSortCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?transition:\s*none;/
    );
  });

  it('enforces explicit <button> UA resets on interactive folder-sort controls', () => {
    const buttonSelectors = [
      /\.shelf-tab-scroll-btn\s*\{([^}]*)\}/,
      /\.shelf-tab\s*\{([^}]*)\}/,
      /\.folder-accordion-toolbar\s+button\s*\{([^}]*)\}/,
      /\.folder-section-toggle\s*\{([^}]*)\}/,
      /\.empty-folder-prompt,\s*\.manual-add-btn\s*\{([^}]*)\}/,
    ];

    for (const pattern of buttonSelectors) {
      const match = folderSortCss.match(pattern);
      expect(match, `Missing rule for ${pattern}`).toBeTruthy();
      const block = match![1];
      expect(block).toMatch(/background:\s*transparent;/);
      expect(block).toMatch(/border:\s*(none|1px\s+solid|2px\s+dashed)/);
      expect(block).toMatch(/color:\s*var\(--text-/);
      expect(block).toMatch(/font:\s*inherit;/);
    }
  });

  it('enforces shelf-tabs-list scroll containment and flex-shrink: 0 on scroll buttons', () => {
    const tabsListMatch = folderSortCss.match(/\.shelf-tabs-list\s*\{([^}]*)\}/);
    expect(tabsListMatch).toBeTruthy();
    expect(tabsListMatch![1]).toMatch(/flex:\s*1\s+1\s+0%;/);
    expect(tabsListMatch![1]).toMatch(/min-width:\s*0;/);
    expect(tabsListMatch![1]).toMatch(/overflow-x:\s*auto;/);

    const scrollBtnMatch = folderSortCss.match(/\.shelf-tab-scroll-btn\s*\{([^}]*)\}/);
    expect(scrollBtnMatch).toBeTruthy();
    expect(scrollBtnMatch![1]).toMatch(/flex-shrink:\s*0;/);
  });

  it('enforces truncation, invalid input border, and flex-shrink: 0 on badges/toggles', () => {
    expect(folderSortCss).toMatch(/\.folder-section-title-slot\s*\{[^}]*min-width:\s*0;/);
    expect(folderSortCss).toMatch(
      /\.folder-section-title\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/
    );
    expect(folderSortCss).toMatch(
      /\.library-section-header\s+\.rename-input\[aria-invalid="true"\]\s*\{[^}]*border-color:\s*var\(--danger-btn-bg\);/
    );
    expect(folderSortCss).toMatch(/\.shelf-tab-label\s*\{[^}]*text-overflow:\s*ellipsis;/);

    expect(folderSortCss).toMatch(/\.folder-section-toggle\s*\{[^}]*flex-shrink:\s*0;/);
    expect(folderSortCss).toMatch(/\.library-section-count\s*\{[^}]*flex-shrink:\s*0;/);
    expect(folderSortCss).toMatch(/\.shelf-tab-count\s*\{[^}]*flex-shrink:\s*0;/);
  });
});
