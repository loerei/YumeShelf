import * as path from 'node:path';
import {
    CATEGORY_STATE_VERSION,
    normalizeCategoryId,
    normalizeCategoryName,
    createCategoryId,
    flattenTree,
    normalizeCategoryState,
    removeCategorySubtree,
    pruneAssignments,
    CategoryNode,
    CategoryTree,
    CategoryState
} from './tree-utils';

export interface CategoryStateFs {
    readFile(path: string, options: 'utf8'): Promise<string>;
    writeFile(path: string, data: string): Promise<void>;
}

export interface CategoryStateOptions {
    fs: CategoryStateFs;
    stateFile: string;
}

export interface CategoryStateService {
    assignGameCategories(gameId: string, categoryIds: string[]): Promise<{ ok: boolean; categoryIds?: string[]; reason?: string }>;
    assignGameToCategory(gameId: string, categoryId: string): Promise<{ ok: boolean; categoryIds?: string[]; reason?: string }>;
    createCategory(options: { parentId?: string | null; name: string }): Promise<{ ok: boolean; category?: CategoryNode; tree?: CategoryTree; reason?: string }>;
    deleteCategory(categoryId: string): Promise<{ ok: boolean; tree?: CategoryTree; removedIds?: string[]; reason?: string }>;
    getAssignmentsForGameId(gameId: string): Promise<string[]>;
    getCategoryTree(): Promise<CategoryTree>;
    loadCategoryState(): Promise<CategoryState>;
    removeGameFromCategory(gameId: string, categoryId: string): Promise<{ ok: boolean; categoryIds?: string[]; reason?: string }>;
    renameCategory(categoryId: string, name: string): Promise<{ ok: boolean; tree?: CategoryTree; reason?: string }>;
    saveCategoryState(nextState: CategoryState): Promise<CategoryState>;
}

export function createCategoryState({ fs, stateFile }: CategoryStateOptions): CategoryStateService {
    async function loadCategoryState(): Promise<CategoryState> {
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

    async function saveCategoryState(nextState: CategoryState): Promise<CategoryState> {
        const normalized = normalizeCategoryState(nextState);
        if (stateFile) {
            const dir = path.dirname(stateFile);
            if (typeof (fs as any)?.mkdir === 'function') {
                await (fs as any).mkdir(dir, { recursive: true });
            }
        }
        await fs.writeFile(stateFile, JSON.stringify(normalized, null, 2));
        return normalized;
    }

    async function getCategoryTree(): Promise<CategoryTree> {
        return (await loadCategoryState()).tree;
    }

    async function getAssignmentsForGameId(gameId: string): Promise<string[]> {
        const state = await loadCategoryState();
        return state.assignments[String(gameId || '').trim()] || [];
    }

    async function createCategory({ parentId = null, name }: { parentId?: string | null; name: string }): Promise<{ ok: boolean; category?: CategoryNode; tree?: CategoryTree; reason?: string }> {
        const normalizedName = normalizeCategoryName(name);
        if (!normalizedName) {
            return { ok: false, reason: 'invalid-name' };
        }
        const state = await loadCategoryState();
        const nextNode: CategoryNode = {
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
        function append(nodes: CategoryNode[]): CategoryNode[] {
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

    async function renameCategory(categoryId: string, name: string): Promise<{ ok: boolean; tree?: CategoryTree; reason?: string }> {
        const normalizedId = normalizeCategoryId(categoryId);
        const normalizedName = normalizeCategoryName(name);
        if (!normalizedId || !normalizedName) {
            return { ok: false, reason: 'invalid-input' };
        }
        const state = await loadCategoryState();
        let renamed = false;

        function rename(nodes: CategoryNode[]): CategoryNode[] {
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

    async function deleteCategory(categoryId: string): Promise<{ ok: boolean; tree?: CategoryTree; removedIds?: string[]; reason?: string }> {
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

    async function assignGameToCategory(gameId: string, categoryId: string): Promise<{ ok: boolean; categoryIds?: string[]; reason?: string }> {
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

    async function assignGameCategories(gameId: string, categoryIds: string[]): Promise<{ ok: boolean; categoryIds?: string[]; reason?: string }> {
        const normalizedGameId = String(gameId || '').trim();
        if (!normalizedGameId) {
            return { ok: false, reason: 'invalid-game-id' };
        }
        const state = await loadCategoryState();
        const categoryMap = flattenTree(state.tree);
        const nextIds = [...new Set((Array.isArray(categoryIds) ? categoryIds : [])
            .map((entry) => normalizeCategoryId(entry))
            .filter((entry): entry is string => !!(entry && categoryMap.has(entry))))];
        if (nextIds.length > 0) {
            state.assignments[normalizedGameId] = nextIds;
        } else {
            delete state.assignments[normalizedGameId];
        }
        await saveCategoryState(state);
        return { ok: true, categoryIds: state.assignments[normalizedGameId] || [] };
    }

    async function removeGameFromCategory(gameId: string, categoryId: string): Promise<{ ok: boolean; categoryIds?: string[]; reason?: string }> {
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
