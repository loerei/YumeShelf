export function createDuplicateStackOverlayController({
    createCard,
    onOpen,
    refs
}) {
    let activeStackKey = null;

    function renderStack(stack) {
        refs.grid.innerHTML = '';

        stack.games.forEach((game, index) => {
            const shell = document.createElement('div');
            shell.className = 'stack-overlay-item';
            shell.style.setProperty('--stack-delay', `${index * 40}ms`);

            const card = createCard(game, {
                draggable: false,
                launchMode: 'double',
                showDuplicateChip: false,
                showPath: false
            });
            card.classList.add('stack-overlay-card');
            shell.appendChild(card);

            const location = document.createElement('div');
            location.className = 'stack-overlay-location';
            location.innerText = game.locationLabel;
            shell.appendChild(location);

            refs.grid.appendChild(shell);
        });
    }

    function isOpen() {
        return refs.overlay.style.display === 'flex';
    }

    function close() {
        if (!isOpen()) return;
        refs.overlay.classList.remove('show');
        const finalize = () => {
            if (refs.overlay.classList.contains('show')) return;
            refs.overlay.style.display = 'none';
            refs.grid.innerHTML = '';
            activeStackKey = null;
        };
        window.setTimeout(finalize, 220);
    }

    function open(stack) {
        activeStackKey = stack.groupKey;
        renderStack(stack);

        if (typeof onOpen === 'function') {
            onOpen();
        }
        refs.overlay.style.display = 'flex';
        requestAnimationFrame(() => {
            refs.overlay.classList.add('show');
        });
    }

    refs.overlay.addEventListener('click', (event) => {
        if (event.target.closest('.stack-overlay-item')) return;
        close();
    });

    return {
        close,
        getActiveStackKey: () => activeStackKey,
        isOpen,
        open,
        refresh(stack) {
            if (!isOpen()) return;
            if (!stack || stack.groupKey !== activeStackKey || !stack.isStack) {
                close();
                return;
            }
            renderStack(stack);
        }
    };
}
