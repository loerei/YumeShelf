import { randomUUID } from 'node:crypto';

export const CATEGORY_STATE_VERSION = 1;

export interface CategoryNode {
    id: string;
    name: string;
    children: CategoryNode[];
}

export type CategoryTree = CategoryNode[];

export interface CategoryAssignments {
    [gameId: string]: string[];
}

export interface CategoryState {
    version: number;
    tree: CategoryTree;
    assignments: CategoryAssignments;
}

export function isPlainObject(value: any): boolean {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeCategoryId(value: any): string | null {
    const normalized = String(value || '').trim();
    return normalized || null;
}

export function normalizeCategoryName(value: any): string {
    return String(value || '').trim();
}

export function createCategoryId(): string {
    if (typeof randomUUID === 'function') {
        return `cat_${randomUUID().replace(/-/g, '')}`;
    }
    return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function flattenTree(tree: CategoryTree, bucket: Map<string, CategoryNode> = new Map()): Map<string, CategoryNode> {
    for (const node of Array.isArray(tree) ? tree : []) {
        if (!node || !node.id) continue;
        bucket.set(node.id, node);
        flattenTree(node.children, bucket);
    }
    return bucket;
}

export function normalizeTree(tree: any): CategoryTree {
    if (!Array.isArray(tree)) return [];
    const seen = new Set<string>();

    function normalizeNode(node: any): CategoryNode | null {
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

    function normalizeTreeNodes(nodes: any): CategoryNode[] {
        return (Array.isArray(nodes) ? nodes : [])
            .map(normalizeNode)
            .filter((node): node is CategoryNode => !!node);
    }

    return normalizeTreeNodes(tree);
}

export function normalizeAssignments(assignments: any, tree: CategoryTree): CategoryAssignments {
    const categoryIds = new Set<string>(flattenTree(tree).keys());
    if (!isPlainObject(assignments)) return {};
    const normalized: CategoryAssignments = {};

    for (const [gameId, value] of Object.entries(assignments)) {
        const normalizedGameId = String(gameId || '').trim();
        if (!normalizedGameId || !Array.isArray(value)) continue;
        const nextIds = [...new Set(value
            .map((entry) => normalizeCategoryId(entry))
            .filter((entry): entry is string => !!(entry && categoryIds.has(entry))))];
        if (nextIds.length > 0) {
            normalized[normalizedGameId] = nextIds;
        }
    }

    return normalized;
}

export function normalizeCategoryState(rawState: any): CategoryState {
    const tree = normalizeTree(rawState?.tree);
    return {
        version: CATEGORY_STATE_VERSION,
        tree,
        assignments: normalizeAssignments(rawState?.assignments, tree)
    };
}

export interface RemoveCategorySubtreeResult {
    removedIds: Set<string>;
    tree: CategoryTree;
}

export function removeCategorySubtree(tree: CategoryTree, categoryId: string): RemoveCategorySubtreeResult {
    const removedIds = new Set<string>();

    function walk(nodes: CategoryNode[]): CategoryNode[] {
        const nextNodes: CategoryNode[] = [];
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

    function collectIds(node: CategoryNode): void {
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

export function pruneAssignments(assignments: CategoryAssignments, removedIds: Set<string>): CategoryAssignments {
    const nextAssignments: CategoryAssignments = {};
    for (const [gameId, categoryIds] of Object.entries(assignments || {})) {
        const keptIds = categoryIds.filter((id) => !removedIds.has(id));
        if (keptIds.length > 0) {
            nextAssignments[gameId] = keptIds;
        }
    }
    return nextAssignments;
}
