// @ts-nocheck
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

module.exports = {
    CATEGORY_STATE_VERSION,
    isPlainObject,
    normalizeCategoryId,
    normalizeCategoryName,
    createCategoryId,
    flattenTree,
    normalizeTree,
    normalizeAssignments,
    normalizeCategoryState,
    removeCategorySubtree,
    pruneAssignments
};
