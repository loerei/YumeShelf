export function flipAnimateDOMUpdate(mutator, isDrop = false) {
    const cards = [...document.querySelectorAll('.game-card')];
    const firstRects = new Map();
    cards.forEach((card) => {
        firstRects.set(card.dataset.gameKey, card.getBoundingClientRect());
    });

    mutator();

    [...document.querySelectorAll('.game-card')].forEach((card) => {
        const first = firstRects.get(card.dataset.gameKey);
        const last = card.getBoundingClientRect();
        if (!first) return;

        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;

        if (!deltaX && !deltaY) {
            card.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
            card.style.transform = '';
            return;
        }

        card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

        // When a drag reorder causes CSS grid wrapping, skipping the animation
        // avoids cards flying diagonally across the whole screen.
        if (!isDrop && Math.abs(first.top - last.top) > 20) {
            card.style.transition = 'none';
            card.style.transform = '';
            return;
        }

        requestAnimationFrame(() => {
            card.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
            card.style.transform = '';
        });
    });
}
