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
            firstRects.set(card.dataset.folder, card.getBoundingClientRect());
        });

        mutator();

        [...document.querySelectorAll('.game-card')].forEach((card) => {
            const first = firstRects.get(card.dataset.folder);
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

    function startDrag(folderName) {
        setDraggedGameFolder(folderName);
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
                if (zone === refs.separator) return;

                const cards = [...zone.querySelectorAll('.game-card')];
                const cardsWithRects = cards
                    .filter(card => card.dataset.folder !== getDraggedGameFolder())
                    .map(card => ({ card, rect: card.getBoundingClientRect() }));

                cards.forEach(card => { card.style.transform = 'none'; });

                if (cardsWithRects.length === 0) {
                    setDragTargetInfo({ folder: null, insertAfter: true });
                    return;
                }

                const maxBottom = Math.max(...cardsWithRects.map(({ rect }) => rect.bottom));
                if (event.clientY > maxBottom + dragPointerSlop) {
                    setDragTargetInfo({ folder: null, insertAfter: true });
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
                    setDragTargetInfo({ folder: null, insertAfter: true });
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
                    setDragTargetInfo({ folder: null, insertAfter: true });
                    return;
                }

                const isLeft = event.clientX < rect.left + rect.width / 2;
                setDragTargetInfo({
                    folder: closestCard.dataset.folder,
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
                const draggedFolder = event.dataTransfer.getData('folderName');
                if (!draggedFolder) return;
                const allGames = getAllGames();
                const draggedGame = allGames.find(game => game.folderName === draggedFolder);
                if (!draggedGame) return;

                const isFavZone = zone === refs.favGrid || zone === refs.separator;
                let needsSave = false;
                let doToggle = false;

                if (draggedGame.favorite !== isFavZone) {
                    draggedGame.favorite = isFavZone;
                    doToggle = true;
                    needsSave = true;
                }

                if (draggedGame.favorite === isFavZone && zone !== refs.separator) {
                    if (getCurrentSort() !== 'custom') {
                        setCurrentSort('custom');
                    }

                    let customOrder = JSON.parse(localStorage.getItem('yumeshelf_custom_order') || '[]');
                    if (customOrder.length === 0) customOrder = allGames.map(game => game.folderName);
                    allGames.forEach((game) => { if (!customOrder.includes(game.folderName)) customOrder.push(game.folderName); });

                    const draggedIdx = customOrder.indexOf(draggedFolder);
                    if (draggedIdx > -1) {
                        customOrder.splice(draggedIdx, 1);
                        let insertIdx = customOrder.length;
                        if (getDragTargetInfo() && getDragTargetInfo().folder) {
                            const targetIdx = customOrder.indexOf(getDragTargetInfo().folder);
                            if (targetIdx > -1) {
                                insertIdx = getDragTargetInfo().insertAfter ? targetIdx + 1 : targetIdx;
                            }
                        }

                        customOrder.splice(insertIdx, 0, draggedFolder);
                        localStorage.setItem('yumeshelf_custom_order', JSON.stringify(customOrder));
                        needsSave = true;
                    }
                }

                flipAnimateDOMUpdate(() => {
                    document.querySelectorAll('.game-card').forEach(card => { card.style.transform = 'none'; });
                    sortGames(getCurrentSort());
                }, true);

                if (doToggle) {
                    electronAPI.toggleFavorite(draggedFolder);
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
