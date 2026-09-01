// @ts-nocheck
const CATEGORY_FILTER_ALL_VALUE = '__all__';

function flattenCategoryTree(tree, depth = 0, bucket = [], parentNames = []) {
    for (const node of Array.isArray(tree) ? tree : []) {
        if (!node?.id) continue;
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
    container,
    getStrings,
    setActiveCategoryId,
    sortGames
}) {
    // Controller owns its DOM scope.
    const categoryFilterContainer = container;
    const categoryFilterBtn   = container.querySelector('#category-filter-btn');
    const categoryFilterLabel = container.querySelector('#category-filter-label');
    const categoryFilterMenu  = container.querySelector('#category-filter-menu');

    function getFlattenedCategories() {
        return flattenCategoryTree(getCategoryTree());
    }

    function getActiveCategory() {
        const activeCategoryId = getActiveCategoryId();
        if (!activeCategoryId) return null;
        return getFlattenedCategories().find((entry) => entry.id === activeCategoryId) ?? null;
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
        const d = typeof getStrings === 'function' ? getStrings() : {};
        const allText = d.category_filter_all || 'All categories';
        const activeCategory = getActiveCategory();
        categoryFilterLabel.innerText = activeCategory ? activeCategory.label : allText;
        categoryFilterBtn.setAttribute('data-tooltip', activeCategory ? `${activeCategory.trailLabel}` : allText);
    }

    function hideMenu() {
        categoryFilterMenu.classList.remove('show');
    }

    function renderMenu() {
        syncActiveCategory();
        const flattened = getFlattenedCategories();
        const d = typeof getStrings === 'function' ? getStrings() : {};
        const allText = d.category_filter_all || 'All categories';
        categoryFilterMenu.innerHTML = '';

        const allItem = document.createElement('div');
        allItem.className = 'sort-item category-filter-item';
        allItem.dataset.categoryId = CATEGORY_FILTER_ALL_VALUE;
        allItem.innerText = allText;
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
        categoryFilterMenu.appendChild(allItem);

        flattened.forEach((entry) => {
            const item = document.createElement('div');
            item.className = 'sort-item category-filter-item';
            item.dataset.categoryId = entry.id;
            item.innerText = entry.label;
            item.style.paddingLeft = `${15 + (entry.depth * 18)}px`;
            item.setAttribute('data-tooltip', entry.trailLabel);
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
            categoryFilterMenu.appendChild(item);
        });

        categoryFilterContainer.style.display = flattened.length > 0 ? 'block' : 'none';
        updateTriggerLabel();
    }

    function openOrToggleMenu(event) {
        event.stopPropagation();
        if (categoryFilterContainer.style.display === 'none') return;
        categoryFilterMenu.classList.toggle('show');
    }

    function clearFilter() {
        if (!getActiveCategoryId()) return;
        setActiveCategoryId(null);
        hideMenu();
        updateTriggerLabel();
        sortGames();
    }

    function getFilteredEmptyState() {
        const d = typeof getStrings === 'function' ? getStrings() : {};
        const activeCategory = getActiveCategory();
        let desc = d.category_empty_desc || 'No games match this category yet.';
        if (activeCategory) {
            desc = d.category_empty_desc_matched
                ? d.category_empty_desc_matched.replace('{name}', activeCategory.trailLabel)
                : `No games match "${activeCategory.trailLabel}" yet.`;
        }
        return {
            actionLabel: d.category_clear_filter || 'Clear filter',
            description: desc,
            title: d.category_empty_title || 'No games in this category'
        };
    }

    function initialize() {
        categoryFilterBtn.onclick = openOrToggleMenu;
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
