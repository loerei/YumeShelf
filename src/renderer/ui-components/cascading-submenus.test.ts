// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { getDropdownActionIcon } from './dropdown-icons';
import { positionSubmenu, bindSubmenus } from './card-dropdown';
import * as fs from 'fs';
import * as path from 'path';

describe('Cascading Submenu Action Icons', () => {
    it('returns valid SVG markup for saves-group and addons-group', () => {
        const savesIcon = getDropdownActionIcon('saves-group');
        expect(savesIcon).toContain('<svg');
        expect(savesIcon).toContain('dropdown-item-icon');

        const addonsIcon = getDropdownActionIcon('addons-group');
        expect(addonsIcon).toContain('<svg');
        expect(addonsIcon).toContain('dropdown-item-icon');
    });

    it('returns valid SVG markup for existing actions', () => {
        expect(getDropdownActionIcon('rename')).toContain('<svg');
        expect(getDropdownActionIcon('reveal')).toContain('<svg');
        expect(getDropdownActionIcon('delete')).toContain('<svg');
        expect(getDropdownActionIcon('save-folder')).toContain('<svg');
        expect(getDropdownActionIcon('save-editor')).toContain('<svg');
        expect(getDropdownActionIcon('checkbox-on')).toContain('<svg');
        expect(getDropdownActionIcon('checkbox-off')).toContain('<svg');
    });
});

describe('positionSubmenu viewport overflow mechanics', () => {
    it('adds open-left when submenu overflows window right edge', () => {
        const mockParent = {
            getBoundingClientRect: () => ({ right: 1200, top: 100 })
        };
        const classList = new Set();
        const mockSubmenu = {
            offsetWidth: 200,
            offsetHeight: 100,
            classList: {
                add: (cls) => classList.add(cls),
                remove: (cls) => classList.delete(cls),
                contains: (cls) => classList.has(cls)
            },
            style: { top: '', bottom: '' }
        };

        // Window width 1280, parent right 1200 + submenu 200 = 1400 > 1272 -> overflows right!
        global.window = { innerWidth: 1280, innerHeight: 800 };

        positionSubmenu(mockParent, mockSubmenu);

        expect(mockSubmenu.classList.contains('open-left')).toBe(true);
        expect(mockSubmenu.style.top).toBe('');
        expect(mockSubmenu.style.bottom).toBe('');
    });

    it('does not add open-left when submenu fits within window right edge', () => {
        const mockParent = {
            getBoundingClientRect: () => ({ right: 500, top: 100 })
        };
        const classList = new Set(['open-left']);
        const mockSubmenu = {
            offsetWidth: 200,
            offsetHeight: 100,
            classList: {
                add: (cls) => classList.add(cls),
                remove: (cls) => classList.delete(cls),
                contains: (cls) => classList.has(cls)
            },
            style: { top: '', bottom: '' }
        };

        // Window width 1280, parent right 500 + submenu 200 = 700 <= 1272 -> fits!
        global.window = { innerWidth: 1280, innerHeight: 800 };

        positionSubmenu(mockParent, mockSubmenu);

        expect(mockSubmenu.classList.contains('open-left')).toBe(false);
    });

    it('adjusts top and bottom when submenu overflows window bottom edge', () => {
        const mockParent = {
            getBoundingClientRect: () => ({ right: 500, top: 750 })
        };
        const classList = new Set();
        const mockSubmenu = {
            offsetWidth: 200,
            offsetHeight: 100,
            classList: {
                add: (cls) => classList.add(cls),
                remove: (cls) => classList.delete(cls),
                contains: (cls) => classList.has(cls)
            },
            style: { top: '', bottom: '' }
        };

        // Window height 800, parent top 750 + submenu 100 = 850 > 792 -> overflows bottom!
        global.window = { innerWidth: 1280, innerHeight: 800 };

        positionSubmenu(mockParent, mockSubmenu);

        expect(mockSubmenu.style.top).toBe('auto');
        expect(mockSubmenu.style.bottom).toBe('0');
    });

    it('handles parent without getBoundingClientRect gracefully without throwing', () => {
        const mockParent = {};
        const mockSubmenu = {
            offsetWidth: 200,
            offsetHeight: 100,
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
                contains: () => false
            },
            style: { top: '', bottom: '' }
        };

        expect(() => positionSubmenu(mockParent, mockSubmenu)).not.toThrow();
    });
});

describe('bindSubmenus mouse tunneling and state management', () => {
    it('sets up hover listeners and manages submenu-open and timer grace periods', () => {
        vi.useFakeTimers();

        const parentListeners = {};
        const submenuListeners = {};
        const parentClassList = new Set();
        const submenuClassList = new Set();

        const mockSubmenu = {
            offsetWidth: 180,
            offsetHeight: 120,
            classList: {
                add: (cls) => submenuClassList.add(cls),
                remove: (cls) => submenuClassList.delete(cls),
                contains: (cls) => submenuClassList.has(cls)
            },
            style: { top: '', bottom: '' },
            addEventListener: (event, handler) => {
                submenuListeners[event] = handler;
            }
        };

        const mockParent = {
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            classList: {
                add: (cls) => parentClassList.add(cls),
                remove: (cls) => parentClassList.delete(cls),
                contains: (cls) => parentClassList.has(cls)
            },
            querySelector: (selector) => {
                if (selector === '.dropdown-submenu') return mockSubmenu;
                return null;
            },
            addEventListener: (event, handler) => {
                parentListeners[event] = handler;
            }
        };

        const mockMenu = {
            classList: {
                contains: (cls) => cls === 'show'
            },
            querySelectorAll: (selector) => {
                if (selector === '.has-submenu') return [mockParent];
                return [];
            }
        };

        const mockCard = {
            querySelector: (selector) => {
                if (selector === '.dropdown-menu') return mockMenu;
                return null;
            }
        };

        global.window = { innerWidth: 1280, innerHeight: 800 };

        bindSubmenus(mockCard);

        // 1. Mouse enters parent: opens immediately
        parentListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true);

        // 2. Mouse leaves parent: grace period begins (remains open during timeout)
        parentListeners['mouseleave']();
        expect(parentClassList.has('submenu-open')).toBe(true);

        // Advance 100ms (less than 220ms grace period)
        vi.advanceTimersByTime(100);
        expect(parentClassList.has('submenu-open')).toBe(true);

        // 3. Mouse enters submenu before grace period expires: cancels close
        submenuListeners['mouseenter']();
        vi.advanceTimersByTime(300);
        expect(parentClassList.has('submenu-open')).toBe(true);

        // 4. Mouse leaves submenu: grace period expires
        submenuListeners['mouseleave']();
        vi.advanceTimersByTime(250);
        expect(parentClassList.has('submenu-open')).toBe(false);

        vi.useRealTimers();
    });

    it('does not close submenu when moving mouse from submenu back to parent', () => {
        vi.useFakeTimers();

        const parentListeners = {};
        const submenuListeners = {};
        const parentClassList = new Set();
        const submenuClassList = new Set();

        const mockSubmenu = {
            offsetWidth: 180,
            offsetHeight: 120,
            classList: {
                add: (cls) => submenuClassList.add(cls),
                remove: (cls) => submenuClassList.delete(cls),
                contains: (cls) => submenuClassList.has(cls)
            },
            style: { top: '', bottom: '' },
            addEventListener: (event, handler) => {
                submenuListeners[event] = handler;
            }
        };

        const mockParent = {
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            classList: {
                add: (cls) => parentClassList.add(cls),
                remove: (cls) => parentClassList.delete(cls),
                contains: (cls) => parentClassList.has(cls)
            },
            contains: (target) => target === mockSubmenu || target === mockParent,
            matches: (selector) => selector === ':hover',
            querySelector: (selector) => {
                if (selector === '.dropdown-submenu') return mockSubmenu;
                return null;
            },
            addEventListener: (event, handler) => {
                parentListeners[event] = handler;
            }
        };

        const mockCard = {
            dataset: {},
            querySelector: () => ({
                classList: { contains: () => true },
                querySelectorAll: (selector) => {
                    if (selector === '.has-submenu') return [mockParent];
                    return [];
                }
            })
        };

        bindSubmenus(mockCard);

        // Open submenu
        parentListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true);

        // Move to submenu
        submenuListeners['mouseenter']();

        // Move from submenu back to parent (relatedTarget is mockParent)
        submenuListeners['mouseleave']({ relatedTarget: mockParent });
        vi.advanceTimersByTime(300);

        // Submenu MUST stay open!
        expect(parentClassList.has('submenu-open')).toBe(true);

        vi.useRealTimers();
    });

    it('keeps submenu open when parent item is clicked', () => {
        const parentListeners = {};
        const parentClassList = new Set();
        const mockSubmenu = {
            offsetWidth: 180,
            offsetHeight: 120,
            classList: { add: vi.fn(), remove: vi.fn(), contains: () => false },
            style: { top: '', bottom: '' }
        };

        const mockParent = {
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            classList: {
                add: (cls) => parentClassList.add(cls),
                remove: (cls) => parentClassList.delete(cls),
                contains: (cls) => parentClassList.has(cls)
            },
            querySelector: (selector) => {
                if (selector === '.dropdown-submenu') return mockSubmenu;
                return null;
            },
            addEventListener: (event, handler) => {
                parentListeners[event] = handler;
            }
        };

        const mockCard = {
            dataset: {},
            querySelector: () => ({
                classList: { contains: () => true },
                querySelectorAll: (selector) => {
                    if (selector === '.has-submenu') return [mockParent];
                    return [];
                }
            })
        };

        bindSubmenus(mockCard);

        // Clicking parent when closed opens it
        let stopped = false;
        parentListeners['click']({
            target: mockParent,
            stopPropagation: () => { stopped = true; }
        });
        expect(parentClassList.has('submenu-open')).toBe(true);
        expect(stopped).toBe(true);

        // Clicking parent again keeps it open (does not collapse it)
        parentListeners['click']({
            target: mockParent,
            stopPropagation: () => {}
        });
        expect(parentClassList.has('submenu-open')).toBe(true);
    });

    it('dismisses open submenu when hovering a non-submenu item after debounce', () => {
        vi.useFakeTimers();

        const parentListeners = {};
        const nonSubmenuListeners = {};
        const parentClassList = new Set();
        const mockSubmenu = {
            offsetWidth: 180,
            offsetHeight: 120,
            classList: { add: vi.fn(), remove: vi.fn(), contains: () => false },
            style: { top: '', bottom: '' }
        };

        const mockParent = {
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            classList: {
                add: (cls) => parentClassList.add(cls),
                remove: (cls) => parentClassList.delete(cls),
                contains: (cls) => parentClassList.has(cls)
            },
            querySelector: (selector) => {
                if (selector === '.dropdown-submenu') return mockSubmenu;
                return null;
            },
            addEventListener: (event, handler) => {
                parentListeners[event] = handler;
            }
        };

        const mockNonSubmenuItem = {
            addEventListener: (event, handler) => {
                nonSubmenuListeners[event] = handler;
            }
        };

        const mockCard = {
            dataset: {},
            querySelector: () => ({
                classList: { contains: () => true },
                querySelectorAll: (selector) => {
                    if (selector === '.has-submenu') return [mockParent];
                    if (selector === '.dropdown-item:not(.has-submenu)') return [mockNonSubmenuItem];
                    return [];
                }
            })
        };

        bindSubmenus(mockCard);

        // Open submenu
        parentListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true);

        // Hover non-submenu item
        nonSubmenuListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true); // Still open before debounce

        // Advance debounce time (150ms)
        vi.advanceTimersByTime(160);
        expect(parentClassList.has('submenu-open')).toBe(false);

        vi.useRealTimers();
    });

    it('switches between two submenus with 150ms debounce', () => {
        vi.useFakeTimers();

        const parent1Listeners = {};
        const parent2Listeners = {};
        const p1Class = new Set();
        const p2Class = new Set();

        const mockSub1 = { offsetWidth: 180, offsetHeight: 120, classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
        const mockSub2 = { offsetWidth: 180, offsetHeight: 120, classList: { add: vi.fn(), remove: vi.fn() }, style: {} };

        const parent1 = {
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            classList: { add: (c) => p1Class.add(c), remove: (c) => p1Class.delete(c), contains: (c) => p1Class.has(c) },
            querySelector: (s) => s === '.dropdown-submenu' ? mockSub1 : null,
            addEventListener: (e, h) => { parent1Listeners[e] = h; }
        };

        const parent2 = {
            getBoundingClientRect: () => ({ right: 300, top: 140 }),
            classList: { add: (c) => p2Class.add(c), remove: (c) => p2Class.delete(c), contains: (c) => p2Class.has(c) },
            querySelector: (s) => s === '.dropdown-submenu' ? mockSub2 : null,
            addEventListener: (e, h) => { parent2Listeners[e] = h; }
        };

        const mockCard = {
            dataset: {},
            querySelector: () => ({
                classList: { contains: () => true },
                querySelectorAll: (s) => s === '.has-submenu' ? [parent1, parent2] : []
            })
        };

        bindSubmenus(mockCard);

        // Hover parent 1
        parent1Listeners['mouseenter']();
        expect(p1Class.has('submenu-open')).toBe(true);
        expect(p2Class.has('submenu-open')).toBe(false);

        // Move to parent 2: debounce starts
        parent1Listeners['mouseleave']();
        parent2Listeners['mouseenter']();
        expect(p1Class.has('submenu-open')).toBe(true); // Parent 1 still open
        expect(p2Class.has('submenu-open')).toBe(false); // Parent 2 not yet open

        // 100ms: still debouncing
        vi.advanceTimersByTime(100);
        expect(p1Class.has('submenu-open')).toBe(true);
        expect(p2Class.has('submenu-open')).toBe(false);

        // 160ms total: switch completes
        vi.advanceTimersByTime(60);
        expect(p1Class.has('submenu-open')).toBe(false);
        expect(p2Class.has('submenu-open')).toBe(true);

        vi.useRealTimers();
    });

    it('does not close submenu when hovering over child items inside the submenu', () => {
        vi.useFakeTimers();

        const parentListeners = {};
        const child1Listeners = {};
        const child2Listeners = {};
        const rootItemListeners = {};
        const submenuListeners = {};

        const parentClassList = new Set();
        const child1ClassList = new Set();
        const child2ClassList = new Set();

        const mockChild1 = {
            classList: { add: (c) => child1ClassList.add(c), contains: (c) => child1ClassList.has(c) },
            closest: (sel) => sel === '.dropdown-submenu' ? mockSubmenu : null,
            addEventListener: (e, h) => { child1Listeners[e] = h; }
        };

        const mockChild2 = {
            classList: { add: (c) => child2ClassList.add(c), contains: (c) => child2ClassList.has(c) },
            closest: (sel) => sel === '.dropdown-submenu' ? mockSubmenu : null,
            addEventListener: (e, h) => { child2Listeners[e] = h; }
        };

        const mockSubmenu = {
            offsetWidth: 180,
            offsetHeight: 120,
            classList: { add: vi.fn(), remove: vi.fn(), contains: () => false },
            style: { top: '', bottom: '' },
            contains: (target) => target === mockSubmenu || target === mockChild1 || target === mockChild2,
            matches: () => false,
            addEventListener: (e, h) => { submenuListeners[e] = h; },
            querySelectorAll: (sel) => sel === '.dropdown-item' ? [mockChild1, mockChild2] : []
        };

        const mockParent = {
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            classList: {
                add: (c) => parentClassList.add(c),
                remove: (c) => parentClassList.delete(c),
                contains: (c) => parentClassList.has(c)
            },
            contains: (target) => target === mockParent || target === mockSubmenu || target === mockChild1 || target === mockChild2,
            matches: () => false,
            querySelector: (s) => s === '.dropdown-submenu' ? mockSubmenu : null,
            addEventListener: (e, h) => { parentListeners[e] = h; }
        };

        const mockRootItem = {
            closest: (sel) => null,
            addEventListener: (e, h) => { rootItemListeners[e] = h; }
        };

        const mockCard = {
            dataset: {},
            querySelector: () => ({
                classList: { contains: () => true },
                querySelectorAll: (selector) => {
                    if (selector === '.has-submenu') return [mockParent];
                    // If queried with :scope > .dropdown-item:not(.has-submenu)
                    if (selector.includes(':scope')) return [mockRootItem];
                    // If queried without :scope, it would include both root items and child submenu items
                    if (selector === '.dropdown-item:not(.has-submenu)') return [mockRootItem, mockChild1, mockChild2];
                    return [];
                }
            })
        };

        bindSubmenus(mockCard);

        // 1. Open submenu by entering parent
        parentListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true);

        // 2. Mouse leaves parent moving into child1 of submenu
        parentListeners['mouseleave']({ relatedTarget: mockChild1 });
        expect(parentClassList.has('submenu-open')).toBe(true);

        // 3. Mouse enters child1: must NOT close submenu
        child1Listeners['mouseenter']();
        // Advance past debounce (150ms) and grace period (220ms)
        vi.advanceTimersByTime(300);
        expect(parentClassList.has('submenu-open')).toBe(true);

        // 4. Mouse enters child2: must NOT close submenu
        child2Listeners['mouseenter']();
        vi.advanceTimersByTime(300);
        expect(parentClassList.has('submenu-open')).toBe(true);

        // 5. Mouse moves to root non-submenu item: should close after debounce
        rootItemListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true);
        vi.advanceTimersByTime(160);
        expect(parentClassList.has('submenu-open')).toBe(false);

        vi.useRealTimers();
    });

    it('keeps submenu open if submenu matches :hover when close timer fires', () => {
        vi.useFakeTimers();

        const parentListeners = {};
        const parentClassList = new Set();

        let isSubmenuHovered = true;
        const mockSubmenu = {
            offsetWidth: 180,
            offsetHeight: 120,
            classList: { add: vi.fn(), remove: vi.fn(), contains: () => false },
            style: { top: '', bottom: '' },
            matches: (sel) => sel === ':hover' && isSubmenuHovered,
            contains: () => false,
            addEventListener: vi.fn()
        };

        const mockParent = {
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            classList: {
                add: (c) => parentClassList.add(c),
                remove: (c) => parentClassList.delete(c),
                contains: (c) => parentClassList.has(c)
            },
            matches: () => false,
            querySelector: (s) => s === '.dropdown-submenu' ? mockSubmenu : null,
            addEventListener: (e, h) => { parentListeners[e] = h; }
        };

        const mockCard = {
            dataset: {},
            querySelector: () => ({
                classList: { contains: () => true },
                querySelectorAll: (s) => s === '.has-submenu' ? [mockParent] : []
            })
        };

        bindSubmenus(mockCard);

        // Open submenu
        parentListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true);

        // Mouse leaves parent
        parentListeners['mouseleave']();

        // 220ms timer fires while submenu is still :hover
        vi.advanceTimersByTime(250);
        expect(parentClassList.has('submenu-open')).toBe(true);

        // When submenu is no longer :hover, mouseleave on submenu closes it
        isSubmenuHovered = false;
        mockParent.matches = () => false;
        // Schedule a close
        parentListeners['mouseleave']();
        vi.advanceTimersByTime(250);
        expect(parentClassList.has('submenu-open')).toBe(false);

        vi.useRealTimers();
    });

    it('keeps submenu open if activeElement is within parent or submenu when close timer fires', () => {
        vi.useFakeTimers();

        const parentListeners = {};
        const parentClassList = new Set();

        const mockFocusElement = {};

        const mockSubmenu = {
            offsetWidth: 180,
            offsetHeight: 120,
            classList: { add: vi.fn(), remove: vi.fn(), contains: () => false },
            style: { top: '', bottom: '' },
            matches: () => false,
            contains: (el) => el === mockFocusElement,
            addEventListener: vi.fn()
        };

        const mockParent = {
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            classList: {
                add: (c) => parentClassList.add(c),
                remove: (c) => parentClassList.delete(c),
                contains: (el) => el === mockFocusElement,
            },
            matches: () => false,
            querySelector: (s) => s === '.dropdown-submenu' ? mockSubmenu : null,
            addEventListener: (e, h) => { parentListeners[e] = h; }
        };

        const mockCard = {
            dataset: {},
            querySelector: () => ({
                classList: { contains: () => true },
                querySelectorAll: (s) => s === '.has-submenu' ? [mockParent] : []
            })
        };

        const originalDoc = global.document;
        global.document = { activeElement: mockFocusElement };

        bindSubmenus(mockCard);

        parentListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true);

        parentListeners['mouseleave']();
        vi.advanceTimersByTime(250);
        expect(parentClassList.has('submenu-open')).toBe(true);

        // Clear focus
        global.document.activeElement = null;
        parentListeners['mouseleave']();
        vi.advanceTimersByTime(250);
        expect(parentClassList.has('submenu-open')).toBe(false);

        global.document = originalDoc;
        vi.useRealTimers();
    });

    it('clears openTimer on nonSubmenuItem mouseleave so a quick brush does not close the submenu', () => {
        vi.useFakeTimers();

        const parentListeners = {};
        const nonSubmenuListeners = {};
        const parentClassList = new Set();
        const mockSubmenu = {
            offsetWidth: 180,
            offsetHeight: 120,
            classList: { add: vi.fn(), remove: vi.fn(), contains: () => false },
            style: { top: '', bottom: '' }
        };

        const mockParent = {
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            classList: {
                add: (cls) => parentClassList.add(cls),
                remove: (cls) => parentClassList.delete(cls),
                contains: (cls) => parentClassList.has(cls)
            },
            querySelector: (selector) => {
                if (selector === '.dropdown-submenu') return mockSubmenu;
                return null;
            },
            addEventListener: (event, handler) => {
                parentListeners[event] = handler;
            }
        };

        const mockNonSubmenuItem = {
            addEventListener: (event, handler) => {
                nonSubmenuListeners[event] = handler;
            }
        };

        const mockCard = {
            dataset: {},
            querySelector: () => ({
                classList: { contains: () => true },
                querySelectorAll: (selector) => {
                    if (selector === '.has-submenu') return [mockParent];
                    if (selector === '.dropdown-item:not(.has-submenu)') return [mockNonSubmenuItem];
                    return [];
                }
            })
        };

        bindSubmenus(mockCard);

        // Open submenu
        parentListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true);

        // Cursor quickly grazes across non-submenu item (enters and immediately leaves)
        nonSubmenuListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true);

        // Mouse leaves before debounce (e.g. 50ms later)
        vi.advanceTimersByTime(50);
        nonSubmenuListeners['mouseleave']();

        // Advance timers past the original 150ms debounce window
        vi.advanceTimersByTime(200);

        // Submenu MUST stay open because the quick brush was cancelled by mouseleave!
        expect(parentClassList.has('submenu-open')).toBe(true);

        vi.useRealTimers();
    });

    it('safely recovers when matches(:hover) throws DOMException in scheduleClose', () => {
        vi.useFakeTimers();

        const parentListeners = {};
        const parentClassList = new Set();

        const mockSubmenu = {
            offsetWidth: 180,
            offsetHeight: 120,
            classList: { add: vi.fn(), remove: vi.fn(), contains: () => false },
            style: { top: '', bottom: '' },
            matches: () => {
                throw new Error('DOMException: ":hover" is not a valid selector');
            },
            contains: () => false,
            addEventListener: vi.fn()
        };

        const mockParent = {
            getBoundingClientRect: () => ({ right: 300, top: 100 }),
            classList: {
                add: (c) => parentClassList.add(c),
                remove: (c) => parentClassList.delete(c),
                contains: (c) => parentClassList.has(c)
            },
            matches: () => {
                throw new Error('DOMException: ":hover" is not a valid selector');
            },
            querySelector: (s) => s === '.dropdown-submenu' ? mockSubmenu : null,
            addEventListener: (e, h) => { parentListeners[e] = h; }
        };

        const mockCard = {
            dataset: {},
            querySelector: () => ({
                classList: { contains: () => true },
                querySelectorAll: (s) => s === '.has-submenu' ? [mockParent] : []
            })
        };

        bindSubmenus(mockCard);

        parentListeners['mouseenter']();
        expect(parentClassList.has('submenu-open')).toBe(true);

        // Trigger scheduleClose
        parentListeners['mouseleave']();

        // The timer should execute without throwing an uncaught exception
        expect(() => {
            vi.advanceTimersByTime(250);
        }).not.toThrow();

        // Since hover threw, fallback closed the submenu safely
        expect(parentClassList.has('submenu-open')).toBe(false);

        vi.useRealTimers();
    });
});

describe('Localization keys for cascading submenus', () => {
    const root = path.resolve(__dirname, '../../../');
    const en = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/builtins/en.json'), 'utf8'));
    const ja = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/builtins/ja.json'), 'utf8'));
    const zh = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/builtins/zh.json'), 'utf8'));
    const viLocale = JSON.parse(fs.readFileSync(path.join(root, 'language-packs/packs/vi.json'), 'utf8'));
    const enSample = JSON.parse(fs.readFileSync(path.join(root, 'language-packs/templates/en.sample.json'), 'utf8'));

    it('contains action_saves_group in all language packs with correct translations', () => {
        expect(en.strings.action_saves_group).toBe('Saves');
        expect(ja.strings.action_saves_group).toBe('セーブデータ');
        expect(zh.strings.action_saves_group).toBe('存档');
        expect(viLocale.strings.action_saves_group).toBe('Dữ liệu lưu');
        expect(enSample.strings.action_saves_group).toBe('Saves');
    });

    it('contains action_addons_group in all language packs with correct translations', () => {
        expect(en.strings.action_addons_group).toBe('Add-ons');
        expect(ja.strings.action_addons_group).toBe('アドオン');
        expect(zh.strings.action_addons_group).toBe('附加组件');
        expect(viLocale.strings.action_addons_group).toBe('Tiện ích');
        expect(enSample.strings.action_addons_group).toBe('Add-ons');
    });
});

describe('CSS cascading submenu definitions', () => {
    const root = path.resolve(__dirname, '../../../');
    const cssContent = fs.readFileSync(path.join(root, 'src/styles/menus-tooltips.css'), 'utf8');

    it('includes .has-submenu styling with chevron indicator', () => {
        expect(cssContent).toContain('.dropdown-item.has-submenu');
        expect(cssContent).toContain("content: '›'");
    });

    it('includes .dropdown-submenu with absolute positioning and matching theme variables', () => {
        expect(cssContent).toContain('.dropdown-submenu {');
        expect(cssContent).toContain('position: absolute');
        expect(cssContent).toContain('background-color: var(--menu-bg)');
        expect(cssContent).toContain('border: 1px solid var(--menu-border)');
        expect(cssContent).toContain('box-shadow: var(--menu-shadow)');
    });

    it('includes hover bridge / mouse tunneling pseudo-element support with generous overlap', () => {
        expect(cssContent).toContain('.dropdown-submenu::before');
        expect(cssContent).toContain('left: -16px');
        expect(cssContent).toContain('width: 22px');
        expect(cssContent).toContain('top: -10px');
        expect(cssContent).toContain('bottom: -10px');
        expect(cssContent).toContain('.dropdown-submenu.open-left::before');
        expect(cssContent).toContain('right: -16px');
    });

    it('includes viewport overflow open-left rule', () => {
        expect(cssContent).toContain('.dropdown-submenu.open-left');
        expect(cssContent).toContain('right: 100%');
        expect(cssContent).toContain('left: auto');
    });

    it('does not display submenu via raw CSS :hover to prevent bypass of debounce and position calculation', () => {
        expect(cssContent).not.toContain('.dropdown-item.has-submenu:hover > .dropdown-submenu');
    });
});
