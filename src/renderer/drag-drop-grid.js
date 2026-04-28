import { getGameKey, normalizeCustomOrder, writeCustomOrder } from './library-order.js';

export function createDragDropGridController({
    dragPointerSlop,
    dragRowTolerance,
    electronAPI,
    getAllGames,
    getCurrentSort,
    getDraggedGameFolder,
    getDragTargetInfo,
    refs,
    setCurrentSort,
    setDraggedGameFolder,
    setDragTargetInfo,
    sortGames
}) {
    function getPointerDistanceToRect(pointerX, pointerY, rect, slop = dragPointerSlop) {
        const left = rect.left - slop;
        const right = rect.right + slop;
        const top = rect.top - slop;
        const bottom = rect.bottom + slop;
        const dx = pointerX < left ? left - pointerX : (pointerX > right ? pointerX - right : 0);
        const dy = pointerY < top ? top - pointerY : (pointerY > bottom ? pointerY - bottom : 0);
        return Math.hypot(dx, dy);
    }

    function isSameDragRow(leftRect, rightRect) {
        return Math.abs(leftRect.top - rightRect.top) <= dragRowTolerance;
    }

    function flipAnimateDOMUpdate(mutator, isDrop = false) {
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

    function startDrag(gameKey) {
        setDraggedGameFolder(gameKey);
        setDragTargetInfo(null);
    }

    function resetDragState() {
        setDraggedGameFolder(null);
        setDragTargetInfo(null);
        document.querySelectorAll('.game-card').forEach((card) => {
            card.style.transform = 'none';
            card.classList.remove('drag-over');
        });
    }

    function attachZoneHandlers() {
        [refs.favGrid, refs.unfavGrid, refs.separator].forEach((zone) => {
            zone.ondragover = (event) => {
                event.preventDefault();
                zone.classList.add('drag-over');
                if (zone === refs.separator) {
                    setDragTargetInfo({ gameKey: null, insertAfter: true });
                    return;
                }

                const cards = [...zone.querySelectorAll('.game-card')];
                const cardsWithRects = cards
                    .filter(card => card.dataset.gameKey !== getDraggedGameFolder())
                    .map(card => ({ card, rect: card.getBoundingClientRect() }));

                cards.forEach(card => { card.style.transform = 'none'; });

                if (cardsWithRects.length === 0) {
                    setDragTargetInfo({ gameKey: null, insertAfter: true });
                    return;
                }

                const maxBottom = Math.max(...cardsWithRects.map(({ rect }) => rect.bottom));
                if (event.clientY > maxBottom + dragPointerSlop) {
                    setDragTargetInfo({ gameKey: null, insertAfter: true });
                    return;
                }

                let closest = null;
                let minDist = Infinity;
                cardsWithRects.forEach((item) => {
                    const dist = getPointerDistanceToRect(event.clientX, event.clientY, item.rect);
                    if (dist < minDist) {
                        minDist = dist;
                        closest = item;
                    }
                });

                if (!closest) {
                    setDragTargetInfo({ gameKey: null, insertAfter: true });
                    return;
                }

                const { card: closestCard, rect } = closest;
                const rowCards = cardsWithRects.filter(item => isSameDragRow(item.rect, rect));
                const rowRight = Math.max(...rowCards.map(item => item.rect.right));
                const isAppendAfterLastCard =
                    closestCard === cardsWithRects[cardsWithRects.length - 1].card &&
                    event.clientX > rowRight + rect.width * 0.15 &&
                    event.clientY >= rect.top - dragPointerSlop &&
                    event.clientY <= rect.bottom + rect.height * 0.6;

                if (isAppendAfterLastCard) {
                    setDragTargetInfo({ gameKey: null, insertAfter: true });
                    return;
                }

                const isLeft = event.clientX < rect.left + rect.width / 2;
                setDragTargetInfo({
                    gameKey: closestCard.dataset.gameKey,
                    insertAfter: !isLeft
                });

                rowCards.forEach(({ card, rect: rowRect }) => {
                    if (!isLeft && rowRect.left >= rect.left) {
                        card.style.transform = 'translateX(25px)';
                    } else if (isLeft && rowRect.left <= rect.left) {
                        card.style.transform = 'translateX(-25px)';
                    }
                });
            };

            zone.ondragleave = (event) => {
                if (!zone.contains(event.relatedTarget)) {
                    zone.classList.remove('drag-over');
                }
            };

            zone.ondrop = (event) => {
                event.preventDefault();
                zone.classList.remove('drag-over');
                const draggedGameKey = event.dataTransfer.getData('gameKey');
                if (!draggedGameKey) return;
                const allGames = getAllGames();
                const draggedGame = allGames.find(game => getGameKey(game) === draggedGameKey);
                if (!draggedGame) return;

                const isFavZone = zone === refs.favGrid || zone === refs.separator;
                let needsSave = false;
                let doToggle = false;
                const dragTargetInfo = getDragTargetInfo();

                if (draggedGame.favorite !== isFavZone) {
                    draggedGame.favorite = isFavZone;
                    doToggle = true;
                    needsSave = true;
                }

                if (draggedGame.favorite === isFavZone && zone !== refs.separator) {
                    if (getCurrentSort() !== 'custom') {
                        setCurrentSort('custom');
                    }

                    const customOrder = normalizeCustomOrder(allGames);

                    const draggedIdx = customOrder.indexOf(draggedGameKey);
                    if (draggedIdx > -1) {
                        customOrder.splice(draggedIdx, 1);
                        let insertIdx = customOrder.length;
                        if (dragTargetInfo && dragTargetInfo.gameKey) {
                            const targetIdx = customOrder.indexOf(dragTargetInfo.gameKey);
                            if (targetIdx > -1) {
                                insertIdx = dragTargetInfo.insertAfter ? targetIdx + 1 : targetIdx;
                            }
                        }

                        customOrder.splice(insertIdx, 0, draggedGameKey);
                        writeCustomOrder(customOrder);
                        needsSave = true;
                    }
                }

                flipAnimateDOMUpdate(() => {
                    document.querySelectorAll('.game-card').forEach(card => { card.style.transform = 'none'; });
                    sortGames(getCurrentSort());
                }, true);

                if (doToggle) {
                    electronAPI.toggleFavorite(draggedGameKey);
                }
                if (!needsSave) {
                    sortGames(getCurrentSort());
                }
            };
        });
    }

    return {
        attachZoneHandlers,
        resetDragState,
        startDrag
    };
}
