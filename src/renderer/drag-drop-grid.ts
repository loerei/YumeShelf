// @ts-nocheck
import { getGameKey, normalizeCustomOrder, writeCustomOrder } from './library-order';
import { getGroupedKeysForGame } from './library-stacks';
import { getPointerDistanceToRect, isSameDragRow } from './utils/drag-math';
import { flipAnimateDOMUpdate } from './utils/flip-animation';

export function createDragDropGridController({
    dragPointerSlop,
    dragRowTolerance,
    electronAPI,
    getActiveCategoryId,
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


    function startDrag(gameKey) {
        if (getActiveCategoryId()) {
            return false;
        }
        setDraggedGameFolder(gameKey);
        setDragTargetInfo(null);
        return true;
    }

    function applyFavoriteToLogicalGame(game, favorite) {
        game.favorite = favorite;
        if (Array.isArray(game.instances)) {
            game.instances.forEach((instance) => {
                instance.favorite = favorite;
            });
        }
        if (game.primaryInstance) {
            game.primaryInstance.favorite = favorite;
        }
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
                if (getActiveCategoryId()) {
                    return;
                }
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
                    const dist = getPointerDistanceToRect(event.clientX, event.clientY, item.rect, dragPointerSlop);
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
                const rowCards = cardsWithRects.filter(item => isSameDragRow(item.rect, rect, dragRowTolerance));
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
                if (getActiveCategoryId()) {
                    event.preventDefault();
                    zone.classList.remove('drag-over');
                    return;
                }
                event.preventDefault();
                zone.classList.remove('drag-over');
                const draggedGameKey = event.dataTransfer.getData('gameKey');
                if (!draggedGameKey) return;
                const allGames = getAllGames();
                const draggedGame = allGames.find(game => getGameKey(game) === draggedGameKey);
                if (!draggedGame) return;

                const isFavZone = zone === refs.favGrid || zone === refs.separator;
                let needsSave = false;
                const dragTargetInfo = getDragTargetInfo();
                const favoriteGroupKeys = getGroupedKeysForGame(allGames, draggedGameKey);

                if (favoriteGroupKeys.some((key) => {
                    const game = allGames.find((entry) => getGameKey(entry) === key);
                    return game && game.favorite !== isFavZone;
                })) {
                    favoriteGroupKeys.forEach((key) => {
                        const game = allGames.find((entry) => getGameKey(entry) === key);
                        if (!game || game.favorite === isFavZone) return;
                        applyFavoriteToLogicalGame(game, isFavZone);
                        electronAPI.invoke('toggle-favorite', key);
                    });
                    needsSave = true;
                }

                if (draggedGame.favorite === isFavZone && zone !== refs.separator) {
                    if (getCurrentSort() !== 'custom') {
                        setCurrentSort('custom');
                    }

                    const customOrder = normalizeCustomOrder(allGames);
                    const draggedGroupKeys = getGroupedKeysForGame(allGames, draggedGameKey, customOrder);
                    const dragIndexEntries = draggedGroupKeys
                        .map((key) => customOrder.indexOf(key))
                        .filter((index) => index > -1)
                        .sort((a, b) => b - a);

                    if (dragIndexEntries.length > 0) {
                        dragIndexEntries.forEach((index) => {
                            customOrder.splice(index, 1);
                        });

                        let insertIdx = customOrder.length;
                        if (dragTargetInfo?.gameKey) {
                            const targetGroupKeys = getGroupedKeysForGame(allGames, dragTargetInfo.gameKey, customOrder);
                            const draggingIntoOwnGroup = targetGroupKeys.every((key) => draggedGroupKeys.includes(key));
                            const targetIndexes = targetGroupKeys
                                .map((key) => customOrder.indexOf(key))
                                .filter((index) => index > -1)
                                .sort((a, b) => a - b);
                            if (!draggingIntoOwnGroup && targetIndexes.length > 0) {
                                insertIdx = dragTargetInfo.insertAfter
                                    ? targetIndexes[targetIndexes.length - 1] + 1
                                    : targetIndexes[0];
                            }
                        }

                        customOrder.splice(insertIdx, 0, ...draggedGroupKeys);
                        writeCustomOrder(customOrder);
                        needsSave = true;
                    }
                }

                flipAnimateDOMUpdate(() => {
                    document.querySelectorAll('.game-card').forEach(card => { card.style.transform = 'none'; });
                    sortGames(getCurrentSort());
                }, true);
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
