const {
    CATEGORY_STATE_VERSION,
    normalizeCategoryId,
    normalizeCategoryName,
    createCategoryId,
    flattenTree,
    normalizeCategoryState,
    removeCategorySubtree,
    pruneAssignments
} = require('./tree-utils');

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
