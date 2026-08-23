const test = require('node:test');
const assert = require('node:assert/strict');

function createMockElement(tagName = 'div', id = '') {
    const classSet = new Set();
    const children = [];
    const element = {
        tagName: tagName.toUpperCase(),
        id,
        classList: {
            add: (c) => classSet.add(c),
            remove: (c) => classSet.delete(c),
            contains: (c) => classSet.has(c),
            toggle: (c) => {
                if (classSet.has(c)) {
                    classSet.delete(c);
                    return false;
                }
                classSet.add(c);
                return true;
            }
        },
        innerHTML: '',
        title: '',
        style: {},
        children,
        appendChild: (child) => {
            children.push(child);
            return child;
        },
        querySelector: (selector) => {
            if (selector === '#quick-folder-menu') {
                return children.find(c => c.id === 'quick-folder-menu') || null;
            }
            return null;
        },
        onclick: null
    };
    return element;
}

// Inline pure controller implementation matching src/renderer/quick-folder.ts
function createQuickFolderController({
    container,
    electronAPI,
    getLibraryConfig,
    doc = global.document
}) {
    const quickFolderMenu = container ? container.querySelector('#quick-folder-menu') : null;

    function getLibraryPaths() {
        const config = typeof getLibraryConfig === 'function' ? getLibraryConfig() : null;
        if (Array.isArray(config?.libraryPaths) && config.libraryPaths.length > 0) {
            return config.libraryPaths.filter((p) => typeof p === 'string' && p.trim().length > 0);
        }
        if (typeof config?.libraryPath === 'string' && config.libraryPath.trim().length > 0) {
            return [config.libraryPath.trim()];
        }
        return [];
    }

    function hideMenu() {
        if (quickFolderMenu) {
            quickFolderMenu.classList.remove('show');
        }
    }

    function isOpen() {
        return Boolean(quickFolderMenu?.classList.contains('show'));
    }

    function renderMenu() {
        if (!quickFolderMenu) return;
        quickFolderMenu.innerHTML = '';
        quickFolderMenu.children.length = 0;
        const paths = getLibraryPaths();

        for (const p of paths) {
            const item = doc.createElement('div');
            item.className = 'quick-folder-item';
            item.title = p;
            item.innerHTML = `
                <svg class="quick-folder-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="quick-folder-item-path">${p}</span>
            `;
            item.onclick = (event) => {
                if (event?.stopPropagation) event.stopPropagation();
                if (electronAPI?.openPath) {
                    electronAPI.openPath(p);
                } else if (electronAPI?.openFolder) {
                    electronAPI.openFolder();
                }
                hideMenu();
            };
            quickFolderMenu.appendChild(item);
        }
    }

    function handleQuickFolderClick() {
        const paths = getLibraryPaths();
        if (paths.length <= 1) {
            hideMenu();
            if (paths.length === 1 && electronAPI?.openPath) {
                electronAPI.openPath(paths[0]);
            } else if (electronAPI?.openFolder) {
                electronAPI.openFolder();
            }
            return;
        }

        if (!quickFolderMenu) return;
        if (quickFolderMenu.classList.contains('show')) {
            hideMenu();
        } else {
            renderMenu();
            quickFolderMenu.classList.add('show');
        }
    }

    return {
        handleQuickFolderClick,
        hideMenu,
        isOpen,
        renderMenu
    };
}

test('QuickFolderController: single path directly opens folder without showing menu', () => {
    const openedPaths = [];
    let openedFolderCalls = 0;

    const electronAPI = {
        openPath: (p) => openedPaths.push(p),
        openFolder: () => { openedFolderCalls++; }
    };

    const container = createMockElement('div', 'quick-folder-container');
    const menu = createMockElement('div', 'quick-folder-menu');
    container.appendChild(menu);

    const controller = createQuickFolderController({
        container,
        electronAPI,
        getLibraryConfig: () => ({ libraryPaths: ['D:\\Games\\Main'] }),
        doc: { createElement: (tag) => createMockElement(tag) }
    });

    controller.handleQuickFolderClick();

    assert.equal(controller.isOpen(), false);
    assert.deepEqual(openedPaths, ['D:\\Games\\Main']);
    assert.equal(openedFolderCalls, 0);
});

test('QuickFolderController: fallback to openFolder when libraryPaths is empty', () => {
    const openedPaths = [];
    let openedFolderCalls = 0;

    const electronAPI = {
        openPath: (p) => openedPaths.push(p),
        openFolder: () => { openedFolderCalls++; }
    };

    const container = createMockElement('div', 'quick-folder-container');
    const menu = createMockElement('div', 'quick-folder-menu');
    container.appendChild(menu);

    const controller = createQuickFolderController({
        container,
        electronAPI,
        getLibraryConfig: () => ({ libraryPaths: [] }),
        doc: { createElement: (tag) => createMockElement(tag) }
    });

    controller.handleQuickFolderClick();

    assert.equal(controller.isOpen(), false);
    assert.equal(openedPaths.length, 0);
    assert.equal(openedFolderCalls, 1);
});

test('QuickFolderController: multiple paths toggle popup menu and clicking item opens path', () => {
    const openedPaths = [];

    const electronAPI = {
        openPath: (p) => openedPaths.push(p),
        openFolder: () => {}
    };

    const container = createMockElement('div', 'quick-folder-container');
    const menu = createMockElement('div', 'quick-folder-menu');
    container.appendChild(menu);

    const libraryPaths = [
        'D:\\Games\\VN',
        'E:\\SteamLibrary\\steamapps\\common',
        'F:\\Archive\\Games'
    ];

    const controller = createQuickFolderController({
        container,
        electronAPI,
        getLibraryConfig: () => ({ libraryPaths }),
        doc: { createElement: (tag) => createMockElement(tag) }
    });

    // 1. Initial state
    assert.equal(controller.isOpen(), false);

    // 2. Click toggles menu open
    controller.handleQuickFolderClick();
    assert.equal(controller.isOpen(), true);
    assert.equal(menu.children.length, 3);
    assert.equal(menu.children[0].title, 'D:\\Games\\VN');
    assert.equal(menu.children[1].title, 'E:\\SteamLibrary\\steamapps\\common');
    assert.equal(menu.children[2].title, 'F:\\Archive\\Games');

    // 3. Click an item to open that folder
    menu.children[1].onclick({ stopPropagation: () => {} });
    assert.deepEqual(openedPaths, ['E:\\SteamLibrary\\steamapps\\common']);
    assert.equal(controller.isOpen(), false);

    // 4. Click toggles open again, then click again toggles closed
    controller.handleQuickFolderClick();
    assert.equal(controller.isOpen(), true);
    controller.handleQuickFolderClick();
    assert.equal(controller.isOpen(), false);
});

test('QuickFolderController: handles > 4 paths correctly for scrollable display', () => {
    const electronAPI = {
        openPath: () => {},
        openFolder: () => {}
    };

    const container = createMockElement('div', 'quick-folder-container');
    const menu = createMockElement('div', 'quick-folder-menu');
    container.appendChild(menu);

    const libraryPaths = [
        'D:\\Games\\Path1',
        'D:\\Games\\Path2',
        'D:\\Games\\Path3',
        'D:\\Games\\Path4',
        'D:\\Games\\Path5',
        'D:\\Games\\Path6'
    ];

    const controller = createQuickFolderController({
        container,
        electronAPI,
        getLibraryConfig: () => ({ libraryPaths }),
        doc: { createElement: (tag) => createMockElement(tag) }
    });

    controller.handleQuickFolderClick();
    assert.equal(controller.isOpen(), true);
    assert.equal(menu.children.length, 6);
    assert.equal(menu.children[5].title, 'D:\\Games\\Path6');

    controller.hideMenu();
    assert.equal(controller.isOpen(), false);
});
