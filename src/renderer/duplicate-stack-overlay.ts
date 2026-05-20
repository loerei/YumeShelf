// @ts-nocheck
export function createDuplicateStackOverlayController({
    createCard,
    onOpen,
    container
}) {
    // Controller owns its DOM scope.
    const overlay = container;
    const grid    = container.querySelector('#duplicate-stack-grid');

    let activeStackKey = null;

    function renderStack(stack) {
        grid.innerHTML = '';

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

            grid.appendChild(shell);
        });
    }

    function isOpen() {
        return overlay.style.display === 'flex';
    }

    function close() {
        if (!isOpen()) return;
        overlay.classList.remove('show');
        const finalize = () => {
            if (overlay.classList.contains('show')) return;
            overlay.style.display = 'none';
            grid.innerHTML = '';
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
        overlay.style.display = 'flex';
        requestAnimationFrame(() => {
            overlay.classList.add('show');
        });
    }

    overlay.addEventListener('click', (event) => {
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
