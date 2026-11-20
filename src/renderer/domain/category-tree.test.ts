import { describe, it, expect } from 'vitest';
import { flattenCategoryTree, type CategoryNode } from './category-tree';

describe('flattenCategoryTree', () => {
  it('returns an empty array for empty or non-array trees', () => {
    expect(flattenCategoryTree([])).toEqual([]);
  });

  it('flattens multi-level nested trees with accurate depth and trailLabel', () => {
    const tree: CategoryNode[] = [
      {
        id: 'root-1',
        name: '  Action  ',
        children: [
          {
            id: 'child-1',
            name: 'RPG',
            children: [{ id: 'grandchild-1', name: 'JRPG' }],
          },
          { id: 'child-2', name: 'Platformer' },
        ],
      },
      { id: 'root-2', name: 'Visual Novel' },
    ];

    expect(flattenCategoryTree(tree)).toEqual([
      { id: 'root-1', name: 'Action', label: 'Action', depth: 0, trailLabel: 'Action' },
      { id: 'child-1', name: 'RPG', label: 'RPG', depth: 1, trailLabel: 'Action / RPG' },
      {
        id: 'grandchild-1',
        name: 'JRPG',
        label: 'JRPG',
        depth: 2,
        trailLabel: 'Action / RPG / JRPG',
      },
      {
        id: 'child-2',
        name: 'Platformer',
        label: 'Platformer',
        depth: 1,
        trailLabel: 'Action / Platformer',
      },
      {
        id: 'root-2',
        name: 'Visual Novel',
        label: 'Visual Novel',
        depth: 0,
        trailLabel: 'Visual Novel',
      },
    ]);
  });

  it('skips nodes with missing/whitespace names and guards against cycles', () => {
    const cyclicNode: CategoryNode = { id: 'cyc', name: 'Cyclic', children: [] };
    cyclicNode.children!.push(cyclicNode);

    const tree: CategoryNode[] = [
      { id: 'empty', name: '   ' },
      { id: '', name: 'NoId' },
      cyclicNode,
    ];

    expect(flattenCategoryTree(tree)).toEqual([
      { id: 'cyc', name: 'Cyclic', label: 'Cyclic', depth: 0, trailLabel: 'Cyclic' },
    ]);
  });
});
