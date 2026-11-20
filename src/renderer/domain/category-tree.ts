export interface CategoryNode {
  id: string;
  name: string;
  parentId?: string | null;
  children?: CategoryNode[];
}

export interface FlattenedCategoryItem {
  id: string;
  name: string;
  label?: string;
  depth: number;
  trailLabel: string;
}

export function flattenCategoryTree(
  tree: readonly CategoryNode[],
  depth = 0,
  parentNames: string[] = [],
  visited: Set<string> = new Set<string>()
): FlattenedCategoryItem[] {
  const result: FlattenedCategoryItem[] = [];
  if (depth > 32) return result;
  for (const node of Array.isArray(tree) ? tree : []) {
    if (!node || !node.id || visited.has(node.id)) continue;
    const nodeName = typeof node?.name === 'string' ? node.name.trim() : '';
    if (!nodeName) continue;
    visited.add(node.id);
    const trail = [...parentNames, nodeName];
    result.push({
      id: node.id,
      name: nodeName,
      label: nodeName,
      depth,
      trailLabel: trail.join(' / '),
    });
    if (Array.isArray(node.children) && node.children.length > 0) {
      result.push(...flattenCategoryTree(node.children, depth + 1, trail, visited));
    }
  }
  return result;
}
