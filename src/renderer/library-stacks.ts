// @ts-nocheck
import { getGameKey, normalizeCustomOrder } from './library-order';

function compareGames(a, b, type, customOrder) {
    let result = 0;
    if (type === 'custom') {
        const order = Array.isArray(customOrder) ? customOrder : normalizeCustomOrder([a, b]);
        const indexA = order.indexOf(getGameKey(a));
        const indexB = order.indexOf(getGameKey(b));
        result = (indexA > -1 ? indexA : 99999) - (indexB > -1 ? indexB : 99999);
    } else if (type === 'az') {
        result = a.name.localeCompare(b.name);
    } else if (type === 'date') {
        result = (b.dateAdded || 0) - (a.dateAdded || 0);
    } else if (type === 'played') {
        result = (b.lastPlayed || 0) - (a.lastPlayed || 0);
    }

    if (result !== 0) return result;

    const depthA = (a.relativePath || '').split(/[\\/]+/).filter(Boolean).length;
    const depthB = (b.relativePath || '').split(/[\\/]+/).filter(Boolean).length;
    if (depthA !== depthB) return depthA - depthB;

    return (a.relativePath || '').localeCompare(b.relativePath || '');
}

function choosePrimaryGame(games, sortedGames) {
    const recents = games.filter((game) => (game.lastPlayed || 0) > 0)
        .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    if (recents.length > 0) {
        return recents[0];
    }

    const sortedKeySet = new Set(games.map((game) => getGameKey(game)));
    return sortedGames.find((game) => sortedKeySet.has(getGameKey(game))) || games[0];
}

function buildGroupKey(game) {
    return `game:${getGameKey(game)}`;
}

export function buildLibraryViewItems(games, type) {
    const customOrder = type === 'custom' ? normalizeCustomOrder(games) : null;
    const sortedGames = [...games].sort((a, b) => compareGames(a, b, type, customOrder));
    const grouped = new Map();

    sortedGames.forEach((game) => {
        const groupKey = buildGroupKey(game);
        const nextGroup = grouped.get(groupKey) || [];
        nextGroup.push(game);
        grouped.set(groupKey, nextGroup);
    });

    return {
        customOrder,
        items: [...grouped.entries()].map(([groupKey, groupGames]) => {
            const logicalGame = groupGames[0];
            const orderedGames = Array.isArray(logicalGame.instances)
                ? [...logicalGame.instances].sort((a, b) => {
                    const depthA = (a.relativePath || '').split(/[\\/]+/).filter(Boolean).length;
                    const depthB = (b.relativePath || '').split(/[\\/]+/).filter(Boolean).length;
                    if (depthA !== depthB) return depthA - depthB;
                    return (a.relativePath || '').localeCompare(b.relativePath || '');
                })
                : [logicalGame];
            const primaryGame = logicalGame.primaryInstance
                ? (orderedGames.find((game) => getGameKey(game) === logicalGame.primaryInstance.gameId || game.gameKey === logicalGame.primaryInstance.gameKey) || logicalGame.primaryInstance)
                : choosePrimaryGame(orderedGames, sortedGames);
            const groupFavorite = !!logicalGame.favorite;
            const representativeKey = getGameKey(logicalGame);

            return {
                favorite: groupFavorite,
                games: orderedGames,
                groupKey,
                isStack: orderedGames.length > 1,
                primaryGame,
                representativeKey,
                stackSize: orderedGames.length
            };
        })
    };
}

export function getGroupedKeysForGame(allGames, gameKey, order = normalizeCustomOrder(allGames)) {
    const targetGame = allGames.find((game) => getGameKey(game) === gameKey);
    if (!targetGame) return [];
    return [targetGame]
        .sort((a, b) => order.indexOf(getGameKey(a)) - order.indexOf(getGameKey(b)))
        .map((game) => getGameKey(game));
}
