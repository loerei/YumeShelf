document.addEventListener('DOMContentLoaded', async () => {
    const favGrid = document.getElementById('fav-grid');
    const unfavGrid = document.getElementById('unfav-grid');
    const separator = document.getElementById('favorites-separator');
    const emptyContainer = document.getElementById('empty-state-container');
    const loading = document.getElementById('loading');
    const welcome = document.getElementById('welcome-screen');
    const quickFolder = document.getElementById('quick-folder-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const langSelect = document.getElementById('lang-select');
    const themeSelect = document.getElementById('theme-select');
    const searchInput = document.getElementById('search-input');
    const searchDropdown = document.getElementById('search-dropdown');
    const searchPlaceholder = document.getElementById('search-placeholder');
    const moreLanguagesBtn = document.getElementById('more-languages-btn');
    const languagePackOverlay = document.getElementById('language-pack-overlay');
    const languagePackSearch = document.getElementById('language-pack-search');
    const languagePackBanner = document.getElementById('language-pack-banner');
    const languagePackSource = document.getElementById('language-pack-source');
    const languagePackResults = document.getElementById('language-pack-results');
    const languagePackEmpty = document.getElementById('language-pack-empty');
    const languagePackEmptyTitle = document.getElementById('language-pack-empty-title');
    const languagePackEmptyDesc = document.getElementById('language-pack-empty-desc');
    const languagePackRepoLink = document.getElementById('language-pack-repo-link');
    const languagePackHint = document.getElementById('language-pack-hint');
    const languagePackListBtn = document.getElementById('language-pack-list-btn');
    const languagePackRefreshBtn = document.getElementById('language-pack-refresh-btn');

    const tooltip = document.createElement('div');
    tooltip.className = 'search-tooltip';
    document.body.appendChild(tooltip);

    const BUILTIN_LANGUAGE_ORDER = ['en', 'ja', 'zh'];
    const DRAG_ROW_TOLERANCE = 15;
    const DRAG_POINTER_SLOP = 18;

    let allGames = [];
    let draggedGameFolder = null;
    let dragTargetInfo = null;
    let currentSort = localStorage.getItem('yumeshelf_sort_pref') || 'date';
    if (currentSort === 'rj') currentSort = 'date';
    let currentLang = localStorage.getItem('yumeshelf_lang') || 'en';
    let currentTheme = localStorage.getItem('yumeshelf_theme') || 'system';
    let placeholderIndex = 0;
    let localeState = {
        builtIn: [],
        installed: [],
        locales: {},
        repoUrl: 'https://github.com/loerei/YumeShelf/blob/main/TRANSLATION.md',
        manifestUrl: '',
        appVersion: ''
    };
    let remoteManifestState = {
        loaded: false,
        loading: false,
        offline: false,
        source: 'none',
        error: null,
        packs: []
    };
    let showAllLanguagePacks = false;
    let downloadingLanguageCode = null;

    function getEnglishStrings() {
        return localeState.locales.en || {};
    }

    function getLocaleStrings(code = currentLang) {
        const normalizedCode = String(code || '').toLowerCase();
        return {
            ...getEnglishStrings(),
            ...(localeState.locales[normalizedCode] || {})
        };
    }

    function getStrings() {
        return getLocaleStrings(currentLang);
    }

    function getAvailableLanguages() {
        return [...localeState.builtIn, ...localeState.installed];
    }

    function isLanguageAvailable(code) {
        const normalizedCode = String(code || '').toLowerCase();
        return getAvailableLanguages().some(language => language.code === normalizedCode);
    }

    function getLanguageMeta(code) {
        const normalizedCode = String(code || '').toLowerCase();
        return getAvailableLanguages().find(language => language.code === normalizedCode) || null;
    }

    function formatLanguageLabel(meta) {
        if (!meta) return '';
        if (!meta.englishName || meta.englishName === meta.nativeName) return meta.nativeName || meta.code;
        return `${meta.nativeName} (${meta.englishName})`;
    }

    function sortLanguageOptions(languages) {
        return [...languages].sort((left, right) => {
            if (left.source !== right.source) {
                return left.source === 'built-in' ? -1 : 1;
            }
            if (left.source === 'built-in' && right.source === 'built-in') {
                return BUILTIN_LANGUAGE_ORDER.indexOf(left.code) - BUILTIN_LANGUAGE_ORDER.indexOf(right.code);
            }
            return formatLanguageLabel(left).localeCompare(formatLanguageLabel(right));
        });
    }

    async function loadLanguageState() {
        localeState.appVersion = await window.electronAPI.getAppVersion();
        const nextState = await window.electronAPI.getLanguageState();
        if (nextState && nextState.locales && nextState.locales.en) {
            localeState = nextState;
        }
        if (!isLanguageAvailable(currentLang)) {
            currentLang = 'en';
            localStorage.setItem('yumeshelf_lang', currentLang);
        }
        refreshLanguageDropdown();
        const placeholders = getStrings().placeholders || getEnglishStrings().placeholders || ['Search...'];
        placeholderIndex = Math.floor(Math.random() * placeholders.length);
    }

    function refreshLanguageDropdown() {
        const languages = sortLanguageOptions(getAvailableLanguages());
        langSelect.innerHTML = '';
        languages.forEach((language) => {
            const option = document.createElement('option');
            option.value = language.code;
            option.textContent = formatLanguageLabel(language);
            langSelect.appendChild(option);
        });
        langSelect.value = isLanguageAvailable(currentLang) ? currentLang : 'en';
    }

    function setCurrentLanguage(nextCode, options = {}) {
        const { persist = true } = options;
        currentLang = isLanguageAvailable(nextCode) ? String(nextCode).toLowerCase() : 'en';
        if (persist) {
            localStorage.setItem('yumeshelf_lang', currentLang);
        }
        refreshLanguageDropdown();
        if (allGames.length > 0) {
            sortGames(currentSort);
        } else {
            applyUIStrings();
        }
    }

    function setLanguagePackBanner(message = '', visible = false) {
        languagePackBanner.textContent = message;
        languagePackBanner.style.display = visible && message ? 'block' : 'none';
    }

    function updateLanguagePackSourceText() {
        const d = getStrings();
        if (remoteManifestState.source === 'remote' || remoteManifestState.source === 'local') {
            languagePackSource.textContent = d.lang_modal_source_remote || '';
        } else if (remoteManifestState.source === 'cache') {
            languagePackSource.textContent = d.lang_modal_source_cache || '';
        } else {
            languagePackSource.textContent = '';
        }
    }

    function filterLanguagePacks(query) {
        const normalized = query.trim().toLowerCase();
        const manifestPacks = remoteManifestState.packs || [];
        if (!normalized) return manifestPacks;
        return manifestPacks.filter((pack) => {
            const haystack = [
                pack.code,
                pack.englishName,
                pack.nativeName,
                ...(pack.aliases || []),
                ...(pack.keywords || [])
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(normalized);
        });
    }

    async function fetchLanguagePackManifest() {
        remoteManifestState.loading = true;
        renderLanguagePackResults();

        const response = await window.electronAPI.getLanguagePackManifest();
        remoteManifestState = {
            loaded: true,
            loading: false,
            offline: !!response.offline,
            source: response.source || 'none',
            error: response.error || null,
            packs: response.packs || []
        };

        if (response.repoUrl) {
            localeState.repoUrl = response.repoUrl;
        }

        if (remoteManifestState.offline) {
            setLanguagePackBanner(getStrings().lang_modal_offline, true);
        } else {
            setLanguagePackBanner('', false);
        }
        renderLanguagePackResults();
    }

    async function openLanguagePackModal() {
        languagePackOverlay.style.display = 'flex';
        languagePackSearch.value = '';
        showAllLanguagePacks = false;
        setLanguagePackBanner(navigator.onLine === false ? getStrings().lang_modal_offline : '', navigator.onLine === false);
        renderLanguagePackResults();
        await fetchLanguagePackManifest();
    }

    function closeLanguagePackModal() {
        languagePackOverlay.style.display = 'none';
    }

    async function downloadLanguagePack(code) {
        downloadingLanguageCode = code;
        renderLanguagePackResults();
        const result = await window.electronAPI.installLanguagePack(code);
        downloadingLanguageCode = null;

        if (!result || !result.ok) {
            const d = getStrings();
            if (result && result.reason === 'checksum') {
                setLanguagePackBanner(d.lang_modal_checksum_failed, true);
            } else if (result && result.reason === 'schema') {
                setLanguagePackBanner(d.lang_modal_schema_failed, true);
            } else if (result && result.reason === 'not-compatible') {
                setLanguagePackBanner(d.lang_modal_not_compatible, true);
            } else if (result && result.reason === 'offline') {
                setLanguagePackBanner(d.lang_modal_offline, true);
            } else {
                setLanguagePackBanner(d.lang_modal_install_error, true);
            }
            renderLanguagePackResults();
            return;
        }

        localeState = result.state || localeState;
        setCurrentLanguage(code);
        closeLanguagePackModal();
    }

    function renderLanguagePackResults() {
        const d = getStrings();
        updateLanguagePackSourceText();
        languagePackSearch.placeholder = d.lang_modal_search_placeholder;
        languagePackListBtn.textContent = d.lang_modal_list_button;
        languagePackRefreshBtn.textContent = d.lang_modal_refresh_button;
        languagePackHint.textContent = d.lang_modal_hint;
        languagePackEmptyTitle.textContent = d.lang_modal_empty_title;
        languagePackEmptyDesc.textContent = d.lang_modal_empty_desc;
        languagePackRepoLink.textContent = d.lang_modal_contribute;
        languagePackRepoLink.href = localeState.repoUrl || languagePackRepoLink.href;

        languagePackResults.innerHTML = '';
        languagePackEmpty.style.display = 'none';

        if (remoteManifestState.loading) {
            languagePackResults.innerHTML = `<div class="language-pack-placeholder">${d.lang_modal_loading}</div>`;
            return;
        }

        const query = languagePackSearch.value.trim();
        if (!showAllLanguagePacks && !query) {
            languagePackResults.innerHTML = `<div class="language-pack-placeholder">${d.lang_modal_hint}</div>`;
            return;
        }

        const matches = filterLanguagePacks(query);
        if (matches.length === 0) {
            if (remoteManifestState.offline && (!remoteManifestState.packs || remoteManifestState.packs.length === 0)) {
                languagePackResults.innerHTML = `<div class="language-pack-placeholder">${d.lang_modal_offline}</div>`;
                return;
            }
            if (remoteManifestState.error && (!remoteManifestState.packs || remoteManifestState.packs.length === 0)) {
                languagePackResults.innerHTML = `<div class="language-pack-placeholder">${remoteManifestState.error}</div>`;
                return;
            }
            languagePackEmpty.style.display = 'block';
            return;
        }

        matches.forEach((pack) => {
            const installed = isLanguageAvailable(pack.code);
            const card = document.createElement('div');
            card.className = 'language-pack-card';

            const title = formatLanguageLabel(pack);
            const sourceText = installed
                ? (getLanguageMeta(pack.code)?.source === 'built-in' ? d.lang_builtin_source : d.lang_downloaded_source)
                : d.lang_modal_available_title;

            const actionDisabled = installed || downloadingLanguageCode !== null;
            const actionLabel = installed
                ? d.lang_modal_installed
                : (downloadingLanguageCode === pack.code ? d.lang_modal_downloading : d.lang_modal_download);

            card.innerHTML = `
                <div class="language-pack-card-copy">
                    <h3>${title}</h3>
                    <p>${pack.code.toUpperCase()} • ${sourceText}</p>
                    <div class="language-pack-card-meta">
                        <span class="language-pack-chip">v${pack.version}</span>
                        ${(pack.aliases || []).slice(0, 3).map(alias => `<span class="language-pack-chip">${alias}</span>`).join('')}
                    </div>
                </div>
                <button class="small-btn ${installed ? '' : 'secondary-btn'}" ${actionDisabled ? 'disabled' : ''}>${actionLabel}</button>
            `;

            const button = card.querySelector('button');
            button.onclick = async (event) => {
                event.stopPropagation();
                if (installed) return;
                await downloadLanguagePack(pack.code);
            };

            if (installed) {
                card.style.cursor = 'pointer';
                card.onclick = () => {
                    setCurrentLanguage(pack.code);
                    closeLanguagePackModal();
                };
            }

            languagePackResults.appendChild(card);
        });
    }

    function getPointerDistanceToRect(pointerX, pointerY, rect, slop = DRAG_POINTER_SLOP) {
        const left = rect.left - slop;
        const right = rect.right + slop;
        const top = rect.top - slop;
        const bottom = rect.bottom + slop;
        const dx = pointerX < left ? left - pointerX : (pointerX > right ? pointerX - right : 0);
        const dy = pointerY < top ? top - pointerY : (pointerY > bottom ? pointerY - bottom : 0);
        return Math.hypot(dx, dy);
    }

    function isSameDragRow(leftRect, rightRect) {
        return Math.abs(leftRect.top - rightRect.top) <= DRAG_ROW_TOLERANCE;
    }

    function flipAnimateDOMUpdate(mutator, isDrop = false) {
        const cards = [...document.querySelectorAll('.game-card')];
        const firstRects = new Map();
        cards.forEach((card) => {
            firstRects.set(card.dataset.folder, card.getBoundingClientRect());
        });

        mutator();

        [...document.querySelectorAll('.game-card')].forEach((card) => {
            const first = firstRects.get(card.dataset.folder);
            const last = card.getBoundingClientRect();
            if (!first) return;

            const deltaX = first.left - last.left;
            const deltaY = first.top - last.top;

            if (!deltaX && !deltaY) {
                card.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
                card.style.transform = '';
                return;
            }

            card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

            // When a drag reorder causes CSS grid wrapping, skipping the animation
            // avoids cards flying diagonally across the whole screen.
            if (!isDrop && Math.abs(first.top - last.top) > 20) {
                card.style.transition = 'none';
                card.style.transform = '';
                return;
            }

            requestAnimationFrame(() => {
                card.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
                card.style.transform = '';
            });
        });
    }

    async function applyUIStrings() {
        const d = getStrings();
        const defPath = await window.electronAPI.getDefaultPath();
        document.getElementById('ui-title').innerText = d.title;
        document.getElementById('ui-welcome-title').innerText = d.welcome;
        document.getElementById('ui-welcome-desc').innerText = d.welcome_desc;
        document.getElementById('ui-opt-choose').innerText = d.opt_choose;
        document.getElementById('ui-opt-choose-desc').innerText = d.opt_choose_desc;
        document.getElementById('ui-opt-lazy').innerText = d.opt_lazy;
        document.getElementById('ui-opt-lazy-desc').innerText = `${d.opt_lazy_desc_prefix} ${defPath}/!`;
        document.getElementById('ui-settings-title').innerText = d.settings;
        document.getElementById('ui-lang-label').innerText = d.lang;
        document.getElementById('ui-theme-label').innerText = d.theme;
        document.getElementById('ui-path-label').innerText = d.path;
        document.getElementById('btn-change-path').innerText = d.change;
        document.getElementById('ui-footer-desc').innerText = d.footer_desc || getEnglishStrings().footer_desc;
        document.getElementById('ui-app-version').innerText = `YumeShelf v${localeState.appVersion || ''}`.trim();
        document.getElementById('ui-theme-system').innerText = d.theme_system || getEnglishStrings().theme_system;
        document.getElementById('ui-theme-dark').innerText = d.theme_dark || getEnglishStrings().theme_dark;
        document.getElementById('ui-theme-light').innerText = d.theme_light || getEnglishStrings().theme_light;
        moreLanguagesBtn.innerText = d.settings_more_languages || getEnglishStrings().settings_more_languages;
        document.getElementById('ui-language-pack-title').innerText = d.lang_modal_title || getEnglishStrings().lang_modal_title;

        const sortMenu = document.getElementById('sort-menu');
        if (sortMenu) {
            document.getElementById('ui-sort-date').innerText = d.sort_date;
            document.getElementById('ui-sort-played').innerText = d.sort_played;
            document.getElementById('ui-sort-az').innerText = d.sort_az;
            document.getElementById('ui-sort-custom').innerText = d.sort_custom;
            sortMenu.querySelectorAll('.sort-item').forEach((el) => el.classList.remove('active'));
            const activeSort = sortMenu.querySelector(`[data-sort="${currentSort}"]`);
            if (activeSort) activeSort.classList.add('active');
        }

        if (!searchInput.value.trim()) {
            const placeholders = d.placeholders || getEnglishStrings().placeholders;
            searchPlaceholder.innerText = placeholders[placeholderIndex % placeholders.length];
        } else {
            updateSearch(searchInput.value);
        }

        renderLanguagePackResults();
    }

    function timeSince(date) {
        const d = getStrings();
        if (!date || date === 0) return d.status_never;
        const seconds = Math.floor((new Date() - date) / 1000);
        if (seconds < 60) return d.status_recent;
        let interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + d.status_hours;
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + d.status_mins;
        return d.status_recent;
    }

    function getDropdownActionIcon(action) {
        if (action === 'rename') {
            return `
                <svg class="dropdown-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
                </svg>
            `;
        }
        if (action === 'reveal') {
            return `
                <svg class="dropdown-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 7h5l2 2h11v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2"/>
                </svg>
            `;
        }
        if (action === 'delete') {
            return `
                <svg class="dropdown-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 6h18"/>
                    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6"/>
                    <path d="M14 11v6"/>
                </svg>
            `;
        }
        return '';
    }

    function createCard(game) {
        const d = getStrings();
        const card = document.createElement('div');
        card.className = `game-card ${game.favorite ? 'favorited' : ''}`;
        card.dataset.folder = game.folderName;
        card.draggable = true;
        card.innerHTML = `
            <div class="fav-btn ${game.favorite ? 'active' : ''}">★</div>
            <div class="menu-btn"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
            <div class="dropdown-menu">
                <div class="dropdown-item action-rename">${getDropdownActionIcon('rename')}<span>${d.rename}</span></div>
                <div class="dropdown-item action-reveal">${getDropdownActionIcon('reveal')}<span>${d.reveal}</span></div>
                <div class="dropdown-item danger action-delete">${getDropdownActionIcon('delete')}<span>${d.delete}</span></div>
            </div>
            <div class="game-icon">${game.iconData ? `<img src="${game.iconData}" alt="icon" draggable="false">` : '🎮'}</div>
            <div class="game-title">${game.name}</div>
            <div class="game-status">${timeSince(game.lastPlayed)}</div>
        `;

        if (!game.iconData) {
            window.electronAPI.getIcon(game.exePath).then((iconData) => {
                if (iconData) {
                    game.iconData = iconData;
                    const iconDiv = card.querySelector('.game-icon');
                    iconDiv.innerHTML = `<img src="${iconData}" alt="icon" draggable="false">`;
                }
            });
        }

        card.querySelector('.fav-btn').onclick = async (event) => {
            event.stopPropagation();
            game.favorite = await window.electronAPI.toggleFavorite(game.folderName);
            sortGames(currentSort);
        };
        card.querySelector('.menu-btn').onclick = (event) => {
            event.stopPropagation();
            document.querySelectorAll('.dropdown-menu').forEach(menu => menu !== card.querySelector('.dropdown-menu') && menu.classList.remove('show'));
            card.querySelector('.dropdown-menu').classList.toggle('show');
        };
        card.querySelector('.action-rename').onclick = (event) => {
            event.stopPropagation();
            card.querySelector('.dropdown-menu').classList.remove('show');
            const titleDiv = card.querySelector('.game-title');
            const input = document.createElement('input');
            input.type = 'text';
            input.value = game.name;
            input.className = 'rename-input';
            titleDiv.replaceWith(input);
            input.focus();
            input.select();

            const save = async () => {
                if (input.value.trim() && input.value.trim() !== game.name) {
                    game.name = input.value.trim();
                    await window.electronAPI.renameGame({ folderName: game.folderName, newName: game.name });
                }
                if (input.parentNode) input.replaceWith(titleDiv);
                titleDiv.innerText = game.name;
            };

            input.onkeydown = (ev) => {
                if (ev.key === 'Enter') save();
                if (ev.key === 'Escape') input.replaceWith(titleDiv);
            };
            input.onblur = save;
        };
        card.querySelector('.action-reveal').onclick = () => window.electronAPI.revealGame(game.exePath);
        card.querySelector('.action-delete').onclick = async () => {
            if (confirm(d.confirm)) {
                await window.electronAPI.deleteGame(game.folderPath);
                allGames = allGames.filter(g => g.folderName !== game.folderName);
                sortGames(currentSort);
            }
        };
        card.ondblclick = () => {
            card.style.opacity = '0.5';
            window.electronAPI.launchYume({ folderName: game.folderName, exePath: game.exePath });
            game.lastPlayed = Date.now();
            setTimeout(() => sortGames(currentSort), 1000);
        };

        card.ondragstart = (event) => {
            draggedGameFolder = game.folderName;
            event.dataTransfer.setData('folderName', game.folderName);
            event.dataTransfer.effectAllowed = 'move';
            dragTargetInfo = null;
            requestAnimationFrame(() => {
                card.style.opacity = '0.01';
            });
        };
        card.ondragend = () => {
            card.style.opacity = '1';
            draggedGameFolder = null;
            dragTargetInfo = null;
            document.querySelectorAll('.game-card').forEach((c) => {
                c.style.transform = 'none';
                c.classList.remove('drag-over');
            });
        };
        card.ondragenter = (event) => { event.preventDefault(); };
        card.ondragleave = (event) => { event.preventDefault(); };
        card.ondragover = (event) => { event.preventDefault(); };
        card.ondrop = (event) => { event.preventDefault(); };

        return card;
    }

    [favGrid, unfavGrid, separator].forEach((zone) => {
        zone.ondragover = (event) => {
            event.preventDefault();
            zone.classList.add('drag-over');
            if (zone === separator) return;

            const cards = [...zone.querySelectorAll('.game-card')];
            const cardsWithRects = cards
                .filter(card => card.dataset.folder !== draggedGameFolder)
                .map(card => ({ card, rect: card.getBoundingClientRect() }));

            cards.forEach(card => { card.style.transform = 'none'; });

            if (cardsWithRects.length === 0) {
                dragTargetInfo = { folder: null, insertAfter: true };
                return;
            }

            const maxBottom = Math.max(...cardsWithRects.map(({ rect }) => rect.bottom));
            if (event.clientY > maxBottom + DRAG_POINTER_SLOP) {
                dragTargetInfo = { folder: null, insertAfter: true };
                return;
            }

            let closest = null;
            let minDist = Infinity;
            cardsWithRects.forEach((item) => {
                const dist = getPointerDistanceToRect(event.clientX, event.clientY, item.rect);
                if (dist < minDist) {
                    minDist = dist;
                    closest = item;
                }
            });

            if (!closest) {
                dragTargetInfo = { folder: null, insertAfter: true };
                return;
            }

            const { card: closestCard, rect } = closest;
            const rowCards = cardsWithRects.filter(item => isSameDragRow(item.rect, rect));
            const rowRight = Math.max(...rowCards.map(item => item.rect.right));
            const isAppendAfterLastCard =
                closestCard === cardsWithRects[cardsWithRects.length - 1].card &&
                event.clientX > rowRight + rect.width * 0.15 &&
                event.clientY >= rect.top - DRAG_POINTER_SLOP &&
                event.clientY <= rect.bottom + rect.height * 0.6;

            if (isAppendAfterLastCard) {
                dragTargetInfo = { folder: null, insertAfter: true };
                return;
            }

            const isLeft = event.clientX < rect.left + rect.width / 2;
            dragTargetInfo = {
                folder: closestCard.dataset.folder,
                insertAfter: !isLeft
            };

            rowCards.forEach(({ card, rect: rowRect }) => {
                if (!isLeft && rowRect.left >= rect.left) {
                    card.style.transform = 'translateX(25px)';
                } else if (isLeft && rowRect.left <= rect.left) {
                    card.style.transform = 'translateX(-25px)';
                }
            });
        };

        zone.ondragleave = (event) => {
            if (!zone.contains(event.relatedTarget)) {
                zone.classList.remove('drag-over');
            }
        };

        zone.ondrop = (event) => {
            event.preventDefault();
            zone.classList.remove('drag-over');
            const draggedFolder = event.dataTransfer.getData('folderName');
            if (!draggedFolder) return;
            const draggedGame = allGames.find(game => game.folderName === draggedFolder);
            if (!draggedGame) return;

            const isFavZone = zone === favGrid || zone === separator;
            let needsSave = false;
            let doToggle = false;

            if (draggedGame.favorite !== isFavZone) {
                draggedGame.favorite = isFavZone;
                doToggle = true;
                needsSave = true;
            }

            if (draggedGame.favorite === isFavZone && zone !== separator) {
                if (currentSort !== 'custom') {
                    currentSort = 'custom';
                }

                let customOrder = JSON.parse(localStorage.getItem('yumeshelf_custom_order') || '[]');
                if (customOrder.length === 0) customOrder = allGames.map(game => game.folderName);
                allGames.forEach((game) => { if (!customOrder.includes(game.folderName)) customOrder.push(game.folderName); });

                const draggedIdx = customOrder.indexOf(draggedFolder);
                if (draggedIdx > -1) {
                    customOrder.splice(draggedIdx, 1);
                    let insertIdx = customOrder.length;
                    if (dragTargetInfo && dragTargetInfo.folder) {
                        const targetIdx = customOrder.indexOf(dragTargetInfo.folder);
                        if (targetIdx > -1) {
                            insertIdx = dragTargetInfo.insertAfter ? targetIdx + 1 : targetIdx;
                        }
                    }

                    customOrder.splice(insertIdx, 0, draggedFolder);
                    localStorage.setItem('yumeshelf_custom_order', JSON.stringify(customOrder));
                    needsSave = true;
                }
            }

            flipAnimateDOMUpdate(() => {
                document.querySelectorAll('.game-card').forEach(card => { card.style.transform = 'none'; });
                sortGames(currentSort);
            }, true);

            if (doToggle) {
                window.electronAPI.toggleFavorite(draggedFolder);
            }
            if (!needsSave) {
                sortGames(currentSort);
            }
        };
    });

    function sortGames(type) {
        currentSort = type;
        localStorage.setItem('yumeshelf_sort_pref', type);
        favGrid.innerHTML = '';
        unfavGrid.innerHTML = '';
        emptyContainer.innerHTML = '';

        const d = getStrings();
        if (allGames.length === 0) {
            emptyContainer.innerHTML = `<div class="empty-zaako"><p>${d.zaako}</p><button class="zaako-btn" id="zaako-open-btn">${d.open_btn}</button></div>`;
            document.getElementById('zaako-open-btn').onclick = () => window.electronAPI.openFolder();
            quickFolder.style.display = 'none';
            separator.style.display = 'none';
        } else {
            quickFolder.style.display = 'flex';
            const sortFn = (arr) => {
                if (type === 'custom') {
                    const order = JSON.parse(localStorage.getItem('yumeshelf_custom_order') || '[]');
                    return [...arr].sort((a, b) => {
                        const indexA = order.indexOf(a.folderName);
                        const indexB = order.indexOf(b.folderName);
                        return (indexA > -1 ? indexA : 99999) - (indexB > -1 ? indexB : 99999);
                    });
                }
                return [...arr].sort((a, b) => {
                    if (type === 'az') return a.name.localeCompare(b.name);
                    if (type === 'date') return (b.dateAdded || 0) - (a.dateAdded || 0);
                    if (type === 'played') return (b.lastPlayed || 0) - (a.lastPlayed || 0);
                    return 0;
                });
            };

            const favs = allGames.filter(game => game.favorite);
            const unfavs = allGames.filter(game => !game.favorite);

            sortFn(favs).forEach(game => favGrid.appendChild(createCard(game)));
            sortFn(unfavs).forEach(game => unfavGrid.appendChild(createCard(game)));
            separator.style.display = (favs.length > 0 && unfavs.length > 0) ? 'flex' : 'none';
        }

        loading.style.display = 'none';
        applyUIStrings();
    }

    function highlightMatch(text, query) {
        if (!query) return text;
        const parts = text.split(new RegExp(`(${query})`, 'gi'));
        return parts.map(part => part.toLowerCase() === query.toLowerCase() ? `<span class="search-match">${part}</span>` : part).join('');
    }

    function updateSearch(query) {
        if (!query.trim()) {
            searchDropdown.classList.remove('show');
            searchPlaceholder.style.display = 'block';
            return;
        }

        searchPlaceholder.style.display = 'none';
        const filtered = allGames.filter(game =>
            game.name.toLowerCase().includes(query.toLowerCase()) ||
            game.folderName.toLowerCase().includes(query.toLowerCase())
        );

        searchDropdown.innerHTML = '';
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-item empty-search';
            empty.innerText = getStrings().no_results;
            searchDropdown.appendChild(empty);
            searchDropdown.classList.add('show');
            return;
        }

        filtered.forEach((game) => {
            const item = document.createElement('div');
            item.className = 'search-item';
            item.draggable = true;
            item.innerHTML = `
                <div class="search-item-info">
                    <div class="search-item-icon">${game.iconData ? `<img src="${game.iconData}" alt="icon" draggable="false" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">` : '🎮'}</div>
                    <div class="search-item-title-container">
                        <div class="search-item-title">${highlightMatch(game.name, query)}</div>
                    </div>
                </div>
                <div class="search-launch-icon-wrapper">
                    <svg class="search-launch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 10l5 5-5 5"></path>
                        <path d="M4 4v7a4 4 0 0 0 4 4h12"></path>
                    </svg>
                </div>
            `;

            if (!game.iconData) {
                window.electronAPI.getIcon(game.exePath).then((iconData) => {
                    if (iconData) {
                        game.iconData = iconData;
                        const iconSpan = item.querySelector('.search-item-icon');
                        iconSpan.innerHTML = `<img src="${iconData}" alt="icon" draggable="false" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">`;
                    }
                });
            }

            item.ondragstart = (event) => {
                draggedGameFolder = game.folderName;
                event.dataTransfer.setData('folderName', game.folderName);
            };
            item.ondragend = () => { draggedGameFolder = null; };

            const launchIconWrapper = item.querySelector('.search-launch-icon-wrapper');
            launchIconWrapper.onclick = (event) => {
                event.stopPropagation();
                const card = document.querySelector(`.game-card[data-folder="${game.folderName}"]`);
                if (card) {
                    searchDropdown.classList.remove('show');
                    searchInput.value = '';
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('glow');
                    setTimeout(() => card.classList.remove('glow'), 2000);
                }
            };

            item.onmouseenter = () => {
                tooltip.innerText = game.name;
                tooltip.style.display = 'block';
                const rect = item.getBoundingClientRect();
                tooltip.style.left = `${rect.left}px`;
                tooltip.style.top = `${rect.bottom + 5}px`;
            };
            item.onmouseleave = () => { tooltip.style.display = 'none'; };
            item.ondblclick = (event) => {
                event.stopPropagation();
                window.electronAPI.launchYume({ folderName: game.folderName, exePath: game.exePath });
                searchDropdown.classList.remove('show');
                searchInput.value = '';
            };

            searchDropdown.appendChild(item);
        });

        searchDropdown.classList.add('show');
    }

    function rotatePlaceholder() {
        if (searchInput.value.trim()) return;
        const placeholders = getStrings().placeholders || getEnglishStrings().placeholders || ['Search...'];
        searchPlaceholder.style.opacity = '0';
        setTimeout(() => {
            placeholderIndex = (placeholderIndex + 1) % placeholders.length;
            searchPlaceholder.innerText = placeholders[placeholderIndex];
            searchPlaceholder.style.opacity = '0.5';
        }, 2000);
    }

    async function initApp() {
        const config = await window.electronAPI.checkConfig();
        if (!config) {
            loading.style.display = 'none';
            welcome.style.display = 'flex';
            applyUIStrings();
        } else {
            welcome.style.display = 'none';
            loading.style.display = 'block';
            allGames = await window.electronAPI.getGames();
            sortGames(currentSort);
        }
    }

    document.getElementById('btn-setup-default').onclick = async () => { if (await window.electronAPI.setupLibrary('default')) initApp(); };
    document.getElementById('btn-choose-custom').onclick = async () => { if (await window.electronAPI.setupLibrary('custom')) initApp(); };
    document.getElementById('btn-change-path').onclick = async () => { if (await window.electronAPI.setupLibrary('custom')) location.reload(); };
    document.getElementById('settings-open-btn').onclick = () => { settingsOverlay.style.display = 'flex'; };
    document.getElementById('settings-close-btn').onclick = () => { settingsOverlay.style.display = 'none'; };
    document.getElementById('language-pack-close-btn').onclick = closeLanguagePackModal;
    quickFolder.onclick = () => window.electronAPI.openFolder();
    moreLanguagesBtn.onclick = openLanguagePackModal;
    languagePackListBtn.onclick = () => {
        showAllLanguagePacks = true;
        languagePackSearch.value = '';
        renderLanguagePackResults();
    };
    languagePackRefreshBtn.onclick = async () => {
        showAllLanguagePacks = true;
        await fetchLanguagePackManifest();
    };
    languagePackSearch.oninput = () => {
        showAllLanguagePacks = true;
        renderLanguagePackResults();
    };

    const sortBtn = document.getElementById('sort-btn');
    const sortMenu = document.getElementById('sort-menu');
    sortBtn.onclick = (event) => { event.stopPropagation(); sortMenu.classList.toggle('show'); };
    document.querySelectorAll('.sort-item').forEach((item) => {
        item.onclick = (event) => {
            event.stopPropagation();
            sortGames(item.dataset.sort);
            sortMenu.classList.remove('show');
        };
    });

    themeSelect.onchange = (event) => {
        document.body.className = `${event.target.value}-theme`;
        localStorage.setItem('yumeshelf_theme', event.target.value);
    };
    langSelect.onchange = (event) => {
        setCurrentLanguage(event.target.value);
    };
    searchInput.oninput = (event) => updateSearch(event.target.value);
    searchInput.onfocus = (event) => updateSearch(event.target.value);

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (languagePackOverlay.style.display === 'flex') closeLanguagePackModal();
            else settingsOverlay.style.display = 'none';
        }
    });

    document.addEventListener('click', (event) => {
        if (!searchInput.contains(event.target) && !searchDropdown.contains(event.target)) {
            searchDropdown.classList.remove('show');
        }
        if (!event.target.closest('.dropdown-menu') && !event.target.closest('.menu-btn')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('show'));
        }
        if (!event.target.closest('.sort-container')) {
            document.querySelectorAll('.sort-menu').forEach(menu => menu.classList.remove('show'));
        }
    });

    document.body.className = `${currentTheme}-theme`;
    themeSelect.value = currentTheme;

    await loadLanguageState();
    searchPlaceholder.innerText = getStrings().placeholders[placeholderIndex];
    setCurrentLanguage(currentLang, { persist: false });
    setInterval(rotatePlaceholder, 60000);
    initApp();
});
