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
