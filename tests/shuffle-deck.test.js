const test = require('node:test');
const assert = require('node:assert/strict');

// Persistent shuffle bag implementation under test
function createPersistentDeck(storage, storageKey, totalCount) {
    return function getNext() {
        if (totalCount <= 1) return 0;
        let deck = [];
        try {
            const raw = storage.getItem(storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number' && n >= 0 && n < totalCount)) {
                    deck = parsed;
                }
            }
        } catch {
            deck = [];
        }

        if (deck.length === 0) {
            deck = Array.from({ length: totalCount }, (_, i) => i);
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }
        }

        const nextIndex = deck.pop();
        try {
            storage.setItem(storageKey, JSON.stringify(deck));
        } catch {}
        return nextIndex;
    };
}

test('Persistent Shuffle Bag: never repeats items within a single cycle of N items', () => {
    const mockStorage = new Map();
    const storage = {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v))
    };

    const N = 9; // e.g. 9 titles or 9 bonk quotes
    const getNext = createPersistentDeck(storage, 'test_deck_1', N);

    // Run 5 full cycles (5 * 9 = 45 draws)
    for (let cycle = 0; cycle < 5; cycle++) {
        const drawnThisCycle = [];
        for (let i = 0; i < N; i++) {
            const index = getNext();
            drawnThisCycle.push(index);
        }

        // Assert all 9 unique indices appear exactly once in this cycle
        assert.equal(drawnThisCycle.length, N);
        const uniqueSet = new Set(drawnThisCycle);
        assert.equal(uniqueSet.size, N, `Cycle ${cycle} contained duplicates: ${drawnThisCycle.join(',')}`);
    }
});

test('Persistent Shuffle Bag: maintains progress across simulated app restarts', () => {
    const mockStorage = new Map();
    const storage = {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v))
    };

    const N = 10; // 10 idle quotes
    const getNextSession1 = createPersistentDeck(storage, 'test_deck_persist', N);

    // Draw 4 items in Session 1
    const session1Items = [getNextSession1(), getNextSession1(), getNextSession1(), getNextSession1()];
    assert.equal(new Set(session1Items).size, 4);

    // Simulate restarting the app: create a new controller instance reading the same storage
    const getNextSession2 = createPersistentDeck(storage, 'test_deck_persist', N);

    // Draw remaining 6 items in Session 2
    const session2Items = [];
    for (let i = 0; i < 6; i++) {
        session2Items.push(getNextSession2());
    }
    assert.equal(new Set(session2Items).size, 6);

    // Combining session 1 and session 2 should form a complete cycle of 10 unique items without overlap
    const fullCycle = [...session1Items, ...session2Items];
    assert.equal(new Set(fullCycle).size, 10, `Interleaved sessions produced duplicate: ${fullCycle.join(',')}`);
});
