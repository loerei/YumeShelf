const CUSTOM_ORDER_STORAGE_KEY = 'yumeshelf_custom_order';

export function getGameKey(game) {
    return game.gameKey || game.relativePath || game.folderName;
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
    const folderNameMatches = new Map();

    games.forEach((game) => {
        const folderName = String(game.folderName || '').trim();
        if (!folderName) return;
        const matches = folderNameMatches.get(folderName) || [];
        matches.push(getGameKey(game));
        folderNameMatches.set(folderName, matches);
    });

    const migratedOrder = [];
    for (const entry of rawOrder) {
        if (keySet.has(entry)) {
            migratedOrder.push(entry);
            continue;
        }

        const matches = folderNameMatches.get(entry) || [];
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
