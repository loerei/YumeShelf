import test from 'node:test';
import assert from 'node:assert/strict';

// Mock global localStorage before importing store to prevent runtime error in Node
const mockLocalStorage: Record<string, string> = {};
global.localStorage = {
    getItem: (key: string) => mockLocalStorage[key] || null,
    setItem: (key: string, value: string) => {
        mockLocalStorage[key] = String(value);
    },
    removeItem: (key: string) => {
        delete mockLocalStorage[key];
    },
    clear: () => {
        for (const k in mockLocalStorage) {
            delete mockLocalStorage[k];
        }
    },
    length: 0,
    key: (index: number) => null
};

import { createUiRuntimeState } from '../src/renderer/state/ui-runtime-state.ts';

test('Central Store initialized with default state values', () => {
    const store = createUiRuntimeState();

    assert.deepEqual(store.getAllGames(), []);
    assert.deepEqual(store.getCategoryTree(), []);
    assert.equal(store.getActiveCategoryId(), null);
    assert.equal(store.getCurrentLibraryConfig(), null);
    assert.equal(store.getDraggedGameFolder(), null);
    assert.equal(store.getDragTargetInfo(), null);
    assert.equal(store.getCurrentSort(), 'date');
});

test('Central Store handles state mutations correctly', () => {
    const store = createUiRuntimeState();

    // Mutate simple primitive state
    store.setActiveCategoryId('cat_1');
    assert.equal(store.getActiveCategoryId(), 'cat_1');
    assert.equal(localStorage.getItem('yumeshelf_active_category_id'), 'cat_1');

    // Mutate object/array state
    const mockGames = [{ gameId: 'g1', name: 'Yume' }];
    store.setAllGames(mockGames);
    assert.deepEqual(store.getAllGames(), mockGames);

    // Verify localStorage behavior for active category removal
    store.setActiveCategoryId(null);
    assert.equal(store.getActiveCategoryId(), null);
    assert.equal(localStorage.getItem('yumeshelf_active_category_id'), null);
});

test('Central Store triggers Pub/Sub events on change', () => {
    const store = createUiRuntimeState();
    let triggerCount = 0;
    let receivedValue: string | null = null;

    // Subscribe to activeCategoryId changes
    const unsubscribe = store.subscribe('activeCategoryId', (value) => {
        triggerCount++;
        receivedValue = value;
    });

    // Mutate and trigger listener
    store.setActiveCategoryId('cat_sub');
    assert.equal(triggerCount, 1);
    assert.equal(receivedValue, 'cat_sub');

    // Mutate to identical value (should NOT trigger listener due to unchanged check)
    store.setActiveCategoryId('cat_sub');
    assert.equal(triggerCount, 1);

    // Unsubscribe and mutate again
    unsubscribe();
    store.setActiveCategoryId('cat_another');
    assert.equal(triggerCount, 1); // triggerCount stays 1
    assert.equal(store.getActiveCategoryId(), 'cat_another'); // value updated in store
});

test('Central Store trigger is scoped only to the modified property', () => {
    const store = createUiRuntimeState();
    let gamesTriggered = false;
    let sortTriggered = false;

    store.subscribe('allGames', () => {
        gamesTriggered = true;
    });

    store.subscribe('currentSort', () => {
        sortTriggered = true;
    });

    // Mutate only sort preference
    store.setCurrentSort('alphabetical');
    assert.equal(sortTriggered, true);
    assert.equal(gamesTriggered, false);
});
