const CATEGORY_FILTER_ALL_VALUE = '__all__';

function flattenCategoryTree(tree, depth = 0, bucket = [], parentNames = []) {
    for (const node of Array.isArray(tree) ? tree : []) {
        if (!node || !node.id) continue;
        const ancestry = [...parentNames, node.name];
        bucket.push({
            depth,
            id: node.id,
            label: node.name,
            trailLabel: ancestry.join(' / ')
        });
        flattenCategoryTree(node.children, depth + 1, bucket, ancestry);
    }
    return bucket;
}

export function createCategoryFilterController({
    getActiveCategoryId,
    getCategoryTree,
    getVisibleGames,
    refs,
    setActiveCategoryId,
    sortGames
}) {
    function getFlattenedCategories() {
        return flattenCategoryTree(getCategoryTree());
    }

    function getActiveCategory() {
        const activeCategoryId = getActiveCategoryId();
        if (!activeCategoryId) return null;
        return getFlattenedCategories().find((entry) => entry.id === activeCategoryId) || null;
    }

    function syncActiveCategory() {
        const activeCategoryId = getActiveCategoryId();
        if (!activeCategoryId) return null;
        const exists = getFlattenedCategories().some((entry) => entry.id === activeCategoryId);
        if (!exists) {
            setActiveCategoryId(null);
            return null;
        }
        return activeCategoryId;
    }

    function updateTriggerLabel() {
        const activeCategory = getActiveCategory();
        refs.categoryFilterLabel.innerText = activeCategory ? activeCategory.label : 'All categories';
        refs.categoryFilterBtn.title = activeCategory ? `Category: ${activeCategory.trailLabel}` : 'All categories';
    }

    function hideMenu() {
        refs.categoryFilterMenu.classList.remove('show');
    }

    function renderMenu() {
        syncActiveCategory();
        const flattened = getFlattenedCategories();
        refs.categoryFilterMenu.innerHTML = '';

        const allItem = document.createElement('div');
        allItem.className = 'sort-item category-filter-item';
        allItem.dataset.categoryId = CATEGORY_FILTER_ALL_VALUE;
        allItem.innerText = 'All categories';
        if (!getActiveCategoryId()) {
            allItem.classList.add('active');
        }
        allItem.onclick = (event) => {
            event.stopPropagation();
            setActiveCategoryId(null);
            hideMenu();
            updateTriggerLabel();
            sortGames();
        };
        refs.categoryFilterMenu.appendChild(allItem);

        flattened.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'sort-item category-filter-item';
            item.dataset.categoryId = entry.id;
            item.innerText = entry.label;
            item.style.paddingLeft = `${15 + (entry.depth * 18)}px`;
            item.title = entry.trailLabel;
            if (getActiveCategoryId() === entry.id) {
                item.classList.add('active');
            }
            item.onclick = (event) => {
                event.stopPropagation();
                setActiveCategoryId(entry.id);
                hideMenu();
                updateTriggerLabel();
                sortGames();
            };
            refs.categoryFilterMenu.appendChild(item);
        });

        refs.categoryFilterContainer.style.display = flattened.length > 0 ? 'block' : 'none';
        updateTriggerLabel();
    }

    function openOrToggleMenu(event) {
        event.stopPropagation();
        if (refs.categoryFilterContainer.style.display === 'none') return;
        refs.categoryFilterMenu.classList.toggle('show');
    }

    function clearFilter() {
        if (!getActiveCategoryId()) return;
        setActiveCategoryId(null);
        hideMenu();
        updateTriggerLabel();
        sortGames();
    }

    function getFilteredEmptyState() {
        const activeCategory = getActiveCategory();
        return {
            actionLabel: 'Clear filter',
            description: activeCategory
                ? `No games match "${activeCategory.trailLabel}" yet.`
                : 'No games match this category yet.',
            title: 'No games in this category'
        };
    }

    function initialize() {
        refs.categoryFilterBtn.onclick = openOrToggleMenu;
        renderMenu();
    }

    return {
        clearFilter,
        getFilteredEmptyState,
        getFlattenedCategories,
        getVisibleGames,
        hideMenu,
        initialize,
        renderMenu,
        updateTriggerLabel
    };
}
