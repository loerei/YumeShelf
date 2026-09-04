// @ts-nocheck
export function positionSubmenu(parent, submenu) {
    submenu.classList.remove('open-left');
    submenu.style.top = '';
    submenu.style.bottom = '';

    const parentRect = (parent && typeof parent.getBoundingClientRect === 'function')
        ? parent.getBoundingClientRect()
        : { right: 0, top: 0, bottom: 0, left: 0 };
    const submenuWidth = submenu.offsetWidth || 180;
    const submenuHeight = submenu.offsetHeight || 150;

    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    if (parentRect.right + submenuWidth > winWidth - 8) {
        submenu.classList.add('open-left');
    }

    if (parentRect.top + submenuHeight > winHeight - 8) {
        submenu.style.top = 'auto';
        submenu.style.bottom = '0';
    }
}

export function bindSubmenus(card) {
    if (card.dataset && card.dataset.submenusBound === 'true') return;
    if (card.dataset) card.dataset.submenusBound = 'true';

    const menu = card.querySelector('.dropdown-menu');
    if (!menu) return;

    const submenus = menu.querySelectorAll('.has-submenu');
    if (!submenus || submenus.length === 0) return;

    let activeSubmenuParent = null;
    let closeTimer = null;
    let openTimer = null;

    const closeAll = () => {
        if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
        if (openTimer) {
            clearTimeout(openTimer);
            openTimer = null;
        }
        submenus.forEach((parent) => {
            parent.classList.remove('submenu-open');
            const sub = parent.querySelector('.dropdown-submenu');
            if (sub) {
                sub.classList.remove('open-left');
                sub.style.top = '';
                sub.style.bottom = '';
            }
        });
        activeSubmenuParent = null;
    };

    const openSubmenu = (parent) => {
        if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
        if (openTimer) {
            clearTimeout(openTimer);
            openTimer = null;
        }

        if (activeSubmenuParent && activeSubmenuParent !== parent) {
            activeSubmenuParent.classList.remove('submenu-open');
            const prevSub = activeSubmenuParent.querySelector('.dropdown-submenu');
            if (prevSub) {
                prevSub.classList.remove('open-left');
                prevSub.style.top = '';
                prevSub.style.bottom = '';
            }
        }

        activeSubmenuParent = parent;
        parent.classList.add('submenu-open');

        const submenu = parent.querySelector('.dropdown-submenu');
        if (submenu) {
            positionSubmenu(parent, submenu);
        }
    };

    const scheduleClose = (parent) => {
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = setTimeout(() => {
            const submenu = parent.querySelector ? parent.querySelector('.dropdown-submenu') : null;
            let isParentHovered = false;
            let isSubmenuHovered = false;
            try {
                isParentHovered = Boolean(parent.matches && parent.matches(':hover'));
                isSubmenuHovered = Boolean(
                    submenu && (
                        (submenu.matches && submenu.matches(':hover')) ||
                        (submenu.querySelector && submenu.querySelector(':hover'))
                    )
                );
            } catch {
                isParentHovered = false;
                isSubmenuHovered = false;
            }
            const isFocusWithin = Boolean(
                typeof document !== 'undefined' &&
                document.activeElement &&
                (
                    (parent.contains && parent.contains(document.activeElement)) ||
                    (submenu && submenu.contains && submenu.contains(document.activeElement))
                )
            );

            if (isParentHovered || isSubmenuHovered || isFocusWithin) {
                return;
            }

            parent.classList.remove('submenu-open');
            if (submenu) {
                submenu.classList.remove('open-left');
                submenu.style.top = '';
                submenu.style.bottom = '';
            }
            if (activeSubmenuParent === parent) {
                activeSubmenuParent = null;
            }
        }, 220);
    };

    submenus.forEach((parent) => {
        const submenu = parent.querySelector('.dropdown-submenu');
        if (!submenu) return;

        parent.addEventListener('mouseenter', () => {
            if (activeSubmenuParent && activeSubmenuParent !== parent) {
                if (openTimer) clearTimeout(openTimer);
                openTimer = setTimeout(() => {
                    openSubmenu(parent);
                }, 150);
            } else {
                openSubmenu(parent);
            }
        });

        parent.addEventListener('mouseleave', (event) => {
            if (openTimer) {
                clearTimeout(openTimer);
                openTimer = null;
            }
            if (
                event &&
                event.relatedTarget &&
                (submenu === event.relatedTarget || (submenu.contains && submenu.contains(event.relatedTarget)))
            ) {
                return;
            }
            scheduleClose(parent);
        });

        if (submenu.addEventListener) {
            const onSubmenuOrChildEnter = () => {
                if (closeTimer) {
                    clearTimeout(closeTimer);
                    closeTimer = null;
                }
                if (openTimer) {
                    clearTimeout(openTimer);
                    openTimer = null;
                }
                activeSubmenuParent = parent;
                parent.classList.add('submenu-open');
            };

            submenu.addEventListener('mouseenter', onSubmenuOrChildEnter);

            const childItems = submenu.querySelectorAll ? submenu.querySelectorAll('.dropdown-item') : [];
            childItems.forEach((child) => {
                if (child.addEventListener) {
                    child.addEventListener('mouseenter', onSubmenuOrChildEnter);
                }
            });

            submenu.addEventListener('mouseleave', (event) => {
                if (
                    event &&
                    event.relatedTarget &&
                    (parent === event.relatedTarget || (parent.contains && parent.contains(event.relatedTarget)))
                ) {
                    return;
                }
                scheduleClose(parent);
            });
        }

        parent.addEventListener('click', (event) => {
            if (event.target && event.target.closest && event.target.closest('.dropdown-submenu')) {
                return;
            }
            event.stopPropagation();
            openSubmenu(parent);
        });
    });

    const isInsideSubmenu = (el) => {
        if (!el) return false;
        if (el.closest) return Boolean(el.closest('.dropdown-submenu'));
        let curr = el.parentElement;
        while (curr && curr !== menu) {
            if (curr.classList && curr.classList.contains && curr.classList.contains('dropdown-submenu')) {
                return true;
            }
            curr = curr.parentElement;
        }
        return false;
    };

    let nonSubmenuItems = [];
    try {
        const scoped = menu.querySelectorAll(':scope > .dropdown-item:not(.has-submenu)');
        if (scoped && scoped.length > 0) {
            nonSubmenuItems = Array.from(scoped).filter((item) => !isInsideSubmenu(item));
        }
    } catch {
        // :scope selector not supported in some environments
    }

    if (nonSubmenuItems.length === 0) {
        const allItems = menu.querySelectorAll ? menu.querySelectorAll('.dropdown-item:not(.has-submenu)') : [];
        if (allItems && allItems.length > 0) {
            nonSubmenuItems = Array.from(allItems).filter((item) => !isInsideSubmenu(item));
        }
    }

    nonSubmenuItems.forEach((item) => {
        item.addEventListener('mouseenter', () => {
            if (activeSubmenuParent) {
                if (openTimer) clearTimeout(openTimer);
                openTimer = setTimeout(() => {
                    closeAll();
                }, 150);
            }
        });

        if (item.addEventListener) {
            item.addEventListener('mouseleave', () => {
                if (openTimer) {
                    clearTimeout(openTimer);
                    openTimer = null;
                }
            });
        }
    });

    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(() => {
            if (!menu.classList.contains('show')) {
                closeAll();
            }
        });
        observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
    }
}

export function bindDropdownToggle(card) {
    const menuButton = card.querySelector('.menu-btn');
    if (!menuButton) return;

    const toggleMenu = (event) => {
        event.stopPropagation();
        event.preventDefault(); // Prevent native browser context menu
        document.querySelectorAll('.dropdown-menu').forEach((menu) => {
            if (menu !== card.querySelector('.dropdown-menu')) {
                menu.classList.remove('show');
            }
        });
        card.querySelector('.dropdown-menu').classList.toggle('show');
    };

    menuButton.onclick = toggleMenu;
    card.oncontextmenu = toggleMenu;

    bindSubmenus(card);
}

export function bindRenameAction({
    card,
    currentName,
    electronAPI,
    gameKey,
    onRefreshRequested,
    onRenamed,
    onSaveData
}) {
    const renameBtn = card.querySelector('.action-rename');
    if (!renameBtn) return;

    renameBtn.onclick = (event) => {
        event.stopPropagation();
        card.querySelector('.dropdown-menu').classList.remove('show');
        const titleDiv = card.querySelector('.game-title');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName();
        input.className = 'rename-input';
        titleDiv.replaceWith(input);
        input.focus();
        input.select();

        const save = async () => {
            const nextName = input.value.trim();
            const originalName = currentName();
            if (nextName && nextName !== originalName) {
                if (onSaveData) {
                    onSaveData(nextName);
                }
                await electronAPI.renameGame({ gameKey, newName: nextName });
                if (typeof onRenamed === 'function') {
                    onRenamed(gameKey, nextName);
                }
            }
            if (input.parentNode) input.replaceWith(titleDiv);
            titleDiv.innerText = currentName();
            if (typeof onRefreshRequested === 'function') {
                onRefreshRequested();
            }
        };

        input.onkeydown = (ev) => {
            if (ev.key === 'Enter') save();
            if (ev.key === 'Escape') input.replaceWith(titleDiv);
        };
        input.onblur = save;
    };
}
