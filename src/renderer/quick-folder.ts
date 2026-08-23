export interface QuickFolderControllerOptions {
    container: HTMLElement | null;
    electronAPI: any;
    getLibraryConfig: () => any;
}

export interface QuickFolderController {
    handleQuickFolderClick: () => void;
    hideMenu: () => void;
    isOpen: () => boolean;
    renderMenu: () => void;
}

export function createQuickFolderController({
    container,
    electronAPI,
    getLibraryConfig
}: QuickFolderControllerOptions): QuickFolderController {
    const quickFolderContainer = container;
    const quickFolderMenu = container ? container.querySelector('#quick-folder-menu') as HTMLElement | null : null;

    function getLibraryPaths(): string[] {
        const config = typeof getLibraryConfig === 'function' ? getLibraryConfig() : null;
        if (Array.isArray(config?.libraryPaths) && config.libraryPaths.length > 0) {
            return config.libraryPaths.filter((p: unknown) => typeof p === 'string' && p.trim().length > 0);
        }
        if (typeof config?.libraryPath === 'string' && config.libraryPath.trim().length > 0) {
            return [config.libraryPath.trim()];
        }
        return [];
    }

    function hideMenu(): void {
        if (quickFolderMenu) {
            quickFolderMenu.classList.remove('show');
        }
    }

    function isOpen(): boolean {
        return Boolean(quickFolderMenu?.classList.contains('show'));
    }

    function renderMenu(): void {
        if (!quickFolderMenu) return;
        quickFolderMenu.innerHTML = '';
        const paths = getLibraryPaths();

        for (const p of paths) {
            const item = document.createElement('div');
            item.className = 'quick-folder-item';
            item.title = p;
            item.innerHTML = `
                <svg class="quick-folder-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="quick-folder-item-path">${p}</span>
            `;
            item.onclick = (event: MouseEvent) => {
                event.stopPropagation();
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

    function handleQuickFolderClick(): void {
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
