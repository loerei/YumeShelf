// @ts-nocheck
import { getGameKey, normalizeCustomOrder, writeCustomOrder } from './library-order';
import { getGroupedKeysForGame } from './library-stacks';
import { getPointerDistanceToRect, isSameDragRow } from './utils/drag-math';
import { flipAnimateDOMUpdate } from './utils/flip-animation';

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

function handleDragOver(zone, event, context) {
    const {
        getActiveCategoryId,
        getDraggedGameFolder,
        setDragTargetInfo,
        dragPointerSlop,
        dragRowTolerance,
        refs
    } = context;

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
        closestCard === cardsWithRects.at(-1)?.card &&
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
}

function handleDragLeave(zone, event) {
    if (!zone.contains(event.relatedTarget)) {
        zone.classList.remove('drag-over');
    }
}

async function handleFavoriteDrop(allGames, draggedGameKey, isFavZone, electronAPI) {
    console.log('[DRAG-DROP][FAVORITE] handleFavoriteDrop. draggedGameKey:', draggedGameKey, 'isFavZone:', isFavZone);
    const favoriteGroupKeys = getGroupedKeysForGame(allGames, draggedGameKey);
    console.log('[DRAG-DROP][FAVORITE] favoriteGroupKeys:', favoriteGroupKeys);
    let needsSave = false;

    const shouldToggle = favoriteGroupKeys.some((key) => {
        const game = allGames.find((entry) => getGameKey(entry) === key);
        const diff = game && game.favorite !== isFavZone;
        console.log('[DRAG-DROP][FAVORITE] key:', key, 'game found:', !!game, 'current favorite:', game?.favorite, 'differs from isFavZone:', diff);
        return diff;
    });

    if (shouldToggle) {
        for (const key of favoriteGroupKeys) {
            const game = allGames.find((entry) => getGameKey(entry) === key);
            if (!game || game.favorite === isFavZone) {
                console.log('[DRAG-DROP][FAVORITE] skipping key:', key, 'already matches target favorite status:', isFavZone);
                continue;
            }
            console.log('[DRAG-DROP][FAVORITE] applying favorite status:', isFavZone, 'to game in-memory:', game.name);
            applyFavoriteToLogicalGame(game, isFavZone);
            console.log('[DRAG-DROP][FAVORITE] invoking toggle-favorite on backend for:', key);
            const result = await electronAPI.invoke('toggle-favorite', key, isFavZone);
            console.log('[DRAG-DROP][FAVORITE] backend toggle-favorite result:', result);
        }
        needsSave = true;
    } else {
        console.log('[DRAG-DROP][FAVORITE] no toggle needed for keys');
    }
    return needsSave;
}

function handleCustomOrderDrop(allGames, draggedGameKey, dragTargetInfo) {
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
                    ? targetIndexes.at(-1) + 1
                    : targetIndexes[0];
            }
        }

        customOrder.splice(insertIdx, 0, ...draggedGroupKeys);
        writeCustomOrder(customOrder);
        return true;
    }
    return false;
}

async function handleDrop(zone, event, context) {
    console.log('[DRAG-DROP] handleDrop triggered. Zone ID:', zone.id);
    try {
        const {
            getActiveCategoryId,
            getAllGames,
            getDragTargetInfo,
            getCurrentSort,
            setCurrentSort,
            sortGames,
            refs,
            electronAPI
        } = context;

        if (getActiveCategoryId()) {
            console.log('[DRAG-DROP] Category filter active. Aborting drop.');
            event.preventDefault();
            zone.classList.remove('drag-over');
            return;
        }
        event.preventDefault();
        zone.classList.remove('drag-over');
        
        const draggedGameKey = event.dataTransfer.getData('gameKey');
        console.log('[DRAG-DROP] draggedGameKey from dataTransfer:', draggedGameKey);
        if (!draggedGameKey) {
            console.log('[DRAG-DROP] No draggedGameKey found in dataTransfer. Aborting.');
            return;
        }
        
        const allGames = getAllGames();
        console.log('[DRAG-DROP] Total games in state:', allGames.length);
        const draggedGame = allGames.find(game => getGameKey(game) === draggedGameKey);
        console.log('[DRAG-DROP] Found draggedGame:', draggedGame ? draggedGame.name : 'null');
        if (!draggedGame) {
            console.log('[DRAG-DROP] draggedGame not found in state list. Aborting.');
            return;
        }

        const isFavZone = zone === refs.favGrid || zone === refs.separator;
        console.log('[DRAG-DROP] Drop zone is favorite zone:', isFavZone);
        
        console.log('[DRAG-DROP] calling handleFavoriteDrop...');
        let needsSave = await handleFavoriteDrop(allGames, draggedGameKey, isFavZone, electronAPI);
        console.log('[DRAG-DROP] handleFavoriteDrop completed. needsSave:', needsSave);
        
        const dragTargetInfo = getDragTargetInfo();
        console.log('[DRAG-DROP] dragTargetInfo:', dragTargetInfo);

        console.log('[DRAG-DROP] draggedGame.favorite:', draggedGame.favorite, 'isFavZone:', isFavZone);
        if (draggedGame.favorite === isFavZone && zone !== refs.separator) {
            console.log('[DRAG-DROP] game favorite status matches drop zone. Handling custom order drop.');
            if (getCurrentSort() !== 'custom') {
                console.log('[DRAG-DROP] Sort mode is not custom. Switching to custom.');
                setCurrentSort('custom');
            }
            if (handleCustomOrderDrop(allGames, draggedGameKey, dragTargetInfo)) {
                console.log('[DRAG-DROP] custom order drop handled. Setting needsSave = true');
                needsSave = true;
            }
        }

        console.log('[DRAG-DROP] Finalizing drop UI updates. needsSave:', needsSave);
        flipAnimateDOMUpdate(() => {
            document.querySelectorAll('.game-card').forEach(card => { card.style.transform = 'none'; });
            sortGames(getCurrentSort());
        }, true);
        if (!needsSave) {
            console.log('[DRAG-DROP] needsSave is false. Re-rendering grid directly.');
            sortGames(getCurrentSort());
        }
        console.log('[DRAG-DROP] handleDrop completed successfully.');
    } catch (err) {
        console.error('[DRAG-DROP] CRITICAL ERROR IN handleDrop:', err);
    }
}

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

    function resetDragState() {
        setDraggedGameFolder(null);
        setDragTargetInfo(null);
        document.querySelectorAll('.game-card').forEach((card) => {
            card.style.transform = 'none';
            card.classList.remove('drag-over');
        });
    }

    function attachZoneHandlers() {
        const context = {
            getActiveCategoryId,
            getDraggedGameFolder,
            setDragTargetInfo,
            dragPointerSlop,
            dragRowTolerance,
            getAllGames,
            getDragTargetInfo,
            getCurrentSort,
            setCurrentSort,
            sortGames,
            refs,
            electronAPI
        };

        [refs.favGrid, refs.unfavGrid, refs.separator].forEach((zone) => {
            zone.ondragover = (event) => handleDragOver(zone, event, context);
            zone.ondragleave = (event) => handleDragLeave(zone, event);
            zone.ondrop = (event) => handleDrop(zone, event, context);
        });
    }

    return {
        attachZoneHandlers,
        resetDragState,
        startDrag
    };
}
