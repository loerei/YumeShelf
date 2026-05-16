const { randomUUID } = require('crypto');

const CATEGORY_STATE_VERSION = 1;

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCategoryId(value) {
    const normalized = String(value || '').trim();
    return normalized || null;
}

function normalizeCategoryName(value) {
    return String(value || '').trim();
}

function createCategoryId() {
    if (typeof randomUUID === 'function') {
        return `cat_${randomUUID().replace(/-/g, '')}`;
    }
    return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function flattenTree(tree, bucket = new Map()) {
    for (const node of Array.isArray(tree) ? tree : []) {
        if (!node || !node.id) continue;
        bucket.set(node.id, node);
        flattenTree(node.children, bucket);
    }
    return bucket;
}

function normalizeTree(tree) {
    if (!Array.isArray(tree)) return [];
    const seen = new Set();

    function normalizeNode(node) {
        if (!isPlainObject(node)) return null;
        const id = normalizeCategoryId(node.id);
        const name = normalizeCategoryName(node.name);
        if (!id || !name || seen.has(id)) return null;
        seen.add(id);
        return {
            id,
            name,
            children: normalizeTreeNodes(node.children)
        };
    }

    function normalizeTreeNodes(nodes) {
        return (Array.isArray(nodes) ? nodes : [])
            .map(normalizeNode)
            .filter(Boolean);
    }

    return normalizeTreeNodes(tree);
}

function normalizeAssignments(assignments, tree) {
    const categoryIds = new Set(flattenTree(tree).keys());
    if (!isPlainObject(assignments)) return {};
    const normalized = {};

    for (const [gameId, value] of Object.entries(assignments)) {
        const normalizedGameId = String(gameId || '').trim();
        if (!normalizedGameId || !Array.isArray(value)) continue;
        const nextIds = [...new Set(value
            .map((entry) => normalizeCategoryId(entry))
            .filter((entry) => entry && categoryIds.has(entry)))];
        if (nextIds.length > 0) {
            normalized[normalizedGameId] = nextIds;
        }
    }

    return normalized;
}

function normalizeCategoryState(rawState) {
    const tree = normalizeTree(rawState?.tree);
    return {
        version: CATEGORY_STATE_VERSION,
        tree,
        assignments: normalizeAssignments(rawState?.assignments, tree)
    };
}

function removeCategorySubtree(tree, categoryId) {
    const removedIds = new Set();

    function walk(nodes) {
        const nextNodes = [];
        for (const node of nodes) {
            if (node.id === categoryId) {
                collectIds(node);
                continue;
            }
            nextNodes.push({
                ...node,
                children: walk(node.children || [])
            });
        }
        return nextNodes;
    }

    function collectIds(node) {
        removedIds.add(node.id);
        for (const child of node.children || []) {
            collectIds(child);
        }
    }

    return {
        removedIds,
        tree: walk(Array.isArray(tree) ? tree : [])
    };
}

function pruneAssignments(assignments, removedIds) {
    const nextAssignments = {};
    for (const [gameId, categoryIds] of Object.entries(assignments || {})) {
        const keptIds = categoryIds.filter((id) => !removedIds.has(id));
        if (keptIds.length > 0) {
            nextAssignments[gameId] = keptIds;
        }
    }
    return nextAssignments;
}

function createCategoryState({ fs, stateFile }) {
    async function loadCategoryState() {
        try {
            const raw = JSON.parse(await fs.readFile(stateFile, 'utf8'));
            const normalized = normalizeCategoryState(raw);
            await saveCategoryState(normalized);
            return normalized;
        } catch {
            return {
                version: CATEGORY_STATE_VERSION,
                tree: [],
                assignments: {}
            };
        }
    }

    async function saveCategoryState(nextState) {
        const normalized = normalizeCategoryState(nextState);
        await fs.writeFile(stateFile, JSON.stringify(normalized, null, 2));
        return normalized;
    }

    async function getCategoryTree() {
        return (await loadCategoryState()).tree;
    }

    async function getAssignmentsForGameId(gameId) {
        const state = await loadCategoryState();
        return state.assignments[String(gameId || '').trim()] || [];
    }

    async function createCategory({ parentId = null, name }) {
        const normalizedName = normalizeCategoryName(name);
        if (!normalizedName) {
            return { ok: false, reason: 'invalid-name' };
        }
        const state = await loadCategoryState();
        const nextNode = {
            id: createCategoryId(),
            name: normalizedName,
            children: []
        };
        const parentKey = normalizeCategoryId(parentId);
        if (!parentKey) {
            state.tree = [...state.tree, nextNode];
            await saveCategoryState(state);
            return { ok: true, category: nextNode, tree: state.tree };
        }

        let inserted = false;
        function append(nodes) {
            return nodes.map((node) => {
                if (node.id === parentKey) {
                    inserted = true;
                    return {
                        ...node,
                        children: [...node.children, nextNode]
                    };
                }
                return {
                    ...node,
                    children: append(node.children || [])
                };
            });
        }

        state.tree = append(state.tree);
        if (!inserted) {
            return { ok: false, reason: 'parent-not-found' };
        }
        await saveCategoryState(state);
        return { ok: true, category: nextNode, tree: state.tree };
    }

    async function renameCategory(categoryId, name) {
        const normalizedId = normalizeCategoryId(categoryId);
        const normalizedName = normalizeCategoryName(name);
        if (!normalizedId || !normalizedName) {
            return { ok: false, reason: 'invalid-input' };
        }
        const state = await loadCategoryState();
        let renamed = false;

        function rename(nodes) {
            return nodes.map((node) => {
                if (node.id === normalizedId) {
                    renamed = true;
                    return { ...node, name: normalizedName };
                }
                return {
                    ...node,
                    children: rename(node.children || [])
                };
            });
        }

        state.tree = rename(state.tree);
        if (!renamed) {
            return { ok: false, reason: 'not-found' };
        }
        await saveCategoryState(state);
        return { ok: true, tree: state.tree };
    }

    async function deleteCategory(categoryId) {
        const normalizedId = normalizeCategoryId(categoryId);
        if (!normalizedId) {
            return { ok: false, reason: 'invalid-id' };
        }
        const state = await loadCategoryState();
        const { removedIds, tree } = removeCategorySubtree(state.tree, normalizedId);
        if (removedIds.size === 0) {
            return { ok: false, reason: 'not-found' };
        }
        state.tree = tree;
        state.assignments = pruneAssignments(state.assignments, removedIds);
        await saveCategoryState(state);
        return { ok: true, tree: state.tree, removedIds: [...removedIds] };
    }

    async function assignGameToCategory(gameId, categoryId) {
        const normalizedGameId = String(gameId || '').trim();
        const normalizedCategoryId = normalizeCategoryId(categoryId);
        if (!normalizedGameId || !normalizedCategoryId) {
            return { ok: false, reason: 'invalid-input' };
        }
        const state = await loadCategoryState();
        const categoryMap = flattenTree(state.tree);
        if (!categoryMap.has(normalizedCategoryId)) {
            return { ok: false, reason: 'category-not-found' };
        }
        const nextIds = new Set(state.assignments[normalizedGameId] || []);
        nextIds.add(normalizedCategoryId);
        state.assignments[normalizedGameId] = [...nextIds];
        await saveCategoryState(state);
        return { ok: true, categoryIds: state.assignments[normalizedGameId] };
    }

    async function assignGameCategories(gameId, categoryIds) {
        const normalizedGameId = String(gameId || '').trim();
        if (!normalizedGameId) {
            return { ok: false, reason: 'invalid-game-id' };
        }
        const state = await loadCategoryState();
        const categoryMap = flattenTree(state.tree);
        const nextIds = [...new Set((Array.isArray(categoryIds) ? categoryIds : [])
            .map((entry) => normalizeCategoryId(entry))
            .filter((entry) => entry && categoryMap.has(entry)))];
        if (nextIds.length > 0) {
            state.assignments[normalizedGameId] = nextIds;
        } else {
            delete state.assignments[normalizedGameId];
        }
        await saveCategoryState(state);
        return { ok: true, categoryIds: state.assignments[normalizedGameId] || [] };
    }

    async function removeGameFromCategory(gameId, categoryId) {
        const normalizedGameId = String(gameId || '').trim();
        const normalizedCategoryId = normalizeCategoryId(categoryId);
        if (!normalizedGameId || !normalizedCategoryId) {
            return { ok: false, reason: 'invalid-input' };
        }
        const state = await loadCategoryState();
        const existing = state.assignments[normalizedGameId] || [];
        const nextIds = existing.filter((id) => id !== normalizedCategoryId);
        if (nextIds.length > 0) {
            state.assignments[normalizedGameId] = nextIds;
        } else {
            delete state.assignments[normalizedGameId];
        }
        await saveCategoryState(state);
        return { ok: true, categoryIds: state.assignments[normalizedGameId] || [] };
    }

    return {
        assignGameCategories,
        assignGameToCategory,
        createCategory,
        deleteCategory,
        getAssignmentsForGameId,
        getCategoryTree,
        loadCategoryState,
        removeGameFromCategory,
        renameCategory,
        saveCategoryState
    };
}

module.exports = {
    CATEGORY_STATE_VERSION,
    createCategoryState
};
