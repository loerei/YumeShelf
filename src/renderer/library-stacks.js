import { getGameKey, normalizeCustomOrder } from './library-order.js';

function compareGames(a, b, type, customOrder) {
    if (type === 'custom') {
        const order = Array.isArray(customOrder) ? customOrder : normalizeCustomOrder([a, b]);
        const indexA = order.indexOf(getGameKey(a));
        const indexB = order.indexOf(getGameKey(b));
        return (indexA > -1 ? indexA : 99999) - (indexB > -1 ? indexB : 99999);
    }

    if (type === 'az') return a.name.localeCompare(b.name);
    if (type === 'date') return (b.dateAdded || 0) - (a.dateAdded || 0);
    if (type === 'played') return (b.lastPlayed || 0) - (a.lastPlayed || 0);
    return 0;
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
    return game.duplicateSignature ? `duplicate:${game.duplicateSignature}` : `single:${getGameKey(game)}`;
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
            const orderedGames = [...groupGames].sort((a, b) => compareGames(a, b, type, customOrder));
            const primaryGame = choosePrimaryGame(orderedGames, sortedGames);
            const groupFavorite = orderedGames.some((game) => game.favorite);
            const representativeKey = getGameKey(primaryGame);

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

    const groupedGames = targetGame.duplicateSignature
        ? allGames.filter((game) => game.duplicateSignature === targetGame.duplicateSignature)
        : [targetGame];

    return [...groupedGames]
        .sort((a, b) => order.indexOf(getGameKey(a)) - order.indexOf(getGameKey(b)))
        .map((game) => getGameKey(game));
}
