const CUSTOM_ORDER_STORAGE_KEY = 'yumeshelf_custom_order';

export function getGameKey(game) {
    if (game?.instanceId && !Array.isArray(game?.instances) && !game?.primaryInstance) {
        return game.gameKey || game.instanceId || game.relativePath || game.folderName;
    }
    return game.gameId || game.gameKey || game.relativePath || game.folderName;
}

function readStoredCustomOrder() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CUSTOM_ORDER_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()) : [];
    } catch {
        return [];
    }
}

export function writeCustomOrder(order) {
    localStorage.setItem(CUSTOM_ORDER_STORAGE_KEY, JSON.stringify(order));
}

export function normalizeCustomOrder(games) {
    const rawOrder = readStoredCustomOrder();
    const keySet = new Set(games.map((game) => getGameKey(game)));
    const aliasMatches = new Map();

    games.forEach((game) => {
        const aliases = [
            String(game.gameKey || '').trim(),
            String(game.folderName || '').trim(),
            String(game.migratedFromGameKey || '').trim(),
            String(game.primaryInstance?.gameKey || '').trim()
        ].filter(Boolean);
        aliases.forEach((alias) => {
            const matches = aliasMatches.get(alias) || [];
            matches.push(getGameKey(game));
            aliasMatches.set(alias, matches);
        });
    });

    const migratedOrder = [];
    for (const entry of rawOrder) {
        if (keySet.has(entry)) {
            migratedOrder.push(entry);
            continue;
        }

        const matches = aliasMatches.get(entry) || [];
        if (matches.length === 1) {
            migratedOrder.push(matches[0]);
        }
    }

    const nextOrder = [];
    const seen = new Set();

    for (const key of migratedOrder) {
        if (keySet.has(key) && !seen.has(key)) {
            nextOrder.push(key);
            seen.add(key);
        }
    }

    for (const game of games) {
        const key = getGameKey(game);
        if (!seen.has(key)) {
            nextOrder.push(key);
            seen.add(key);
        }
    }

    writeCustomOrder(nextOrder);
    return nextOrder;
}
