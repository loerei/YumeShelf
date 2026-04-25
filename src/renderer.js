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
    
    // Custom Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'search-tooltip';
    document.body.appendChild(tooltip);

    let allGames = [];
    let currentSort = localStorage.getItem('yumeshelf_sort_pref') || 'date';
    if (currentSort === 'rj') currentSort = 'date';
    let currentLang = localStorage.getItem('yumeshelf_lang') || 'en';
    let currentTheme = localStorage.getItem('yumeshelf_theme') || 'system';

    const i18n = {
        en: { 
            title: "YumeShelf", settings: "Settings", lang: "Language", theme: "Theme Mode", path: "Library Path", change: "Change",
            welcome: "Welcome to YumeShelf", welcome_desc: "Choose how you want to manage your dreams.",
            opt_choose: "Choose Folder", opt_choose_desc: "Select an existing directory",
            opt_lazy: "I'm lazy!", opt_lazy_desc_prefix: "Create",
            zaako: "No game here, zaako~", open_btn: "Open Games Folder",
            rename: "✏️ Rename", reveal: "📁 Reveal", delete: "🗑️ Delete", confirm: "Delete into Recycle Bin?",
            status_never: "Never played", status_recent: "Just now", status_mins: " mins ago", status_hours: " hours ago",
            sort_date: "Newest", sort_played: "Recently Played", sort_az: "Name A-Z", sort_custom: "Custom Order",
            no_results: "Nobody here but us chickens!",
            placeholders: [
                "Can't even find a game? Zaako~",
                "Hurry up and type!",
                "Got lost already?",
                "Is your brain too small for this?",
                "Stop staring and type something!",
                "What are you looking for, Dummy?",
                "Your memory is terrible, isn't it?",
                "I'm bored... hurry it up!"
            ]
        },
        vi: { 
            title: "YumeShelf", settings: "Cài đặt", lang: "Ngôn ngữ", theme: "Chế độ nền", path: "Đường dẫn", change: "Thay đổi",
            welcome: "Chào mừng tới YumeShelf", welcome_desc: "Chọn cách bạn muốn quản lý giấc mơ.",
            opt_choose: "Chọn thư mục", opt_choose_desc: "Trỏ tới thư viện game có sẵn",
            opt_lazy: "Tôi lười quá!", opt_lazy_desc_prefix: "Tạo",
            zaako: "Không có game ở đây, zaako~", open_btn: "Mở thư mục Game",
            rename: "✏️ Đổi tên", reveal: "📁 Mở thư mục", delete: "🗑️ Xóa game", confirm: "Xóa vào Thùng rác?",
            status_never: "Chưa chơi lần nào", status_recent: "Vừa mới chơi", status_mins: " phút trước", status_hours: " giờ trước",
            sort_date: "Mới tải về", sort_played: "Chơi gần nhất", sort_az: "Tên A-Z", sort_custom: "Tùy chỉnh",
            no_results: "Chẳng ai lạc vào đây ngoài mấy con gà chúng ta cả!",
            placeholders: [
                "Có cái game cũng tìm không ra, Zaako~",
                "Gõ nhanh cái tay lên!",
                "Hửm? Lạc rồi chứ gì~",
                "Bộ não cậu không chứa hết chỗ này hay sao?",
                "Nhìn cái gì, gõ gì đi chứ!",
                "Tìm cái gì thế hả dummy?",
                "Trí nhớ tệ thật đấy.",
                "Tớ thấy chán rồi đấy... nhanh lên coi!"
            ]
        },
        ja: { 
            title: "ユメシェルフ", settings: "設定", lang: "言語", theme: "テーマ", path: "ライブラリパス", change: "変更",
            welcome: "ユメシェルフへようこそ", welcome_desc: "夢の管理方法を選択してください。",
            opt_choose: "フォルダを選択", opt_choose_desc: "既存のディレクトリを指定",
            opt_lazy: "面倒くさい！", opt_lazy_desc_prefix: "作成",
            zaako: "ここにはゲームがないよ、ざぁ～こ♡", open_btn: "ゲームフォルダを開く",
            rename: "✏️ 名前変更", reveal: "📁 フォルダを開く", delete: "🗑️ 削除", confirm: "ゴミ箱に移動しますか？",
            status_never: "未プレイ", status_recent: "たった今", status_mins: " 分前", status_hours: " 時間前",
            sort_date: "追加日", sort_played: "最近プレイ", sort_az: "名前順 A-Z", sort_custom: "カスタム順",
            no_results: "ここにはニワトリ以外だーれもいないわよ！",
            placeholders: [
                "ゲーム一つも見つけられないの？ざぁ～こ♡",
                "もたもたしないで、早く打ちなさいよ！",
                "あれ、もう迷子になっちゃったの？",
                "この程度で容量不足？バカね。",
                "ジロジロ見ないで、何か入力して！",
                "何探してるのよ、ばぁ～か。",
                "忘れっぽいのね、鳥頭さん。",
                "退屈なんだけど…早くしてよ！"
            ]
        },
        zh: { 
            title: "梦之架", settings: "设置", lang: "语言", theme: "主题模式", path: "库路径", change: "更改",
            welcome: "欢迎来到梦之架", welcome_desc: "选择您管理梦想的方式。",
            opt_choose: "选择文件夹", opt_choose_desc: "选择现有的游戏目录",
            opt_lazy: "我太懒了！", opt_lazy_desc_prefix: "在此创建",
            zaako: "这里没有游戏哦，杂~鱼~", open_btn: "打开游戏文件夹",
            rename: "✏️ 重命名", reveal: "📁 打开文件夹", delete: "🗑️ 删除", confirm: "确定要删除吗？",
            status_never: "从未运行", status_recent: "刚刚", status_mins: " 分钟前", status_hours: " 小时前",
            sort_date: "最新添加", sort_played: "最近游玩", sort_az: "名称 A-Z", sort_custom: "自定义排序",
            no_results: "除了我们这些弱鸡，谁也不在哦！",
            placeholders: [
                "连个游戏都找不到吗？杂~鱼~♡",
                "别磨蹭了，快点打字！",
                "哎呀，这就迷路了吗？",
                "这种程度就内存不足了吗？笨蛋。",
                "别盯着看，快输入点什么！",
                "你在找什么呢，笨~蛋。",
                "记性真差呢，你是金鱼吗？",
                "好无聊啊……快一点啦！"
            ]
        }
    };

    let draggedGameFolder = null;
    let dragPlaceholder = document.createElement('div');
    dragPlaceholder.className = 'game-card drag-placeholder';

    function flipAnimateDOMUpdate(callback, isDrop = false) {
        const getItems = () => [...document.querySelectorAll('.game-card')];
        
        const firstRects = new Map();
        getItems().forEach(item => {
            if(item.dataset.folder) {
                firstRects.set(item.dataset.folder, item.getBoundingClientRect());
            } else if (item.classList.contains('drag-placeholder') && draggedGameFolder) {
                firstRects.set(draggedGameFolder, item.getBoundingClientRect());
            }
            item.style.transition = 'none';
            item.style.transform = 'none';
        });
        
        callback();
        
        const newItems = getItems();
        newItems.forEach(item => {
            const first = firstRects.get(item.dataset.folder);
            if (first) {
                const last = item.getBoundingClientRect();
                const dx = first.left - last.left;
                const dy = first.top - last.top;
                if (dx !== 0 || dy !== 0) {
                    item.style.transform = `translate(${dx}px, ${dy}px)`;
                }
            }
        });
        
        document.body.offsetHeight; // Force reflow
        
        requestAnimationFrame(() => {
            newItems.forEach(item => {
                if (item.dataset.folder) {
                    const first = firstRects.get(item.dataset.folder);
                    const last = item.getBoundingClientRect();
                    
                    // If dragging (not drop) and card wrapped to a new row, skip animation to avoid diagonal flying chaos
                    if (!isDrop && first && Math.abs(first.top - last.top) > 20) {
                        item.style.transition = 'none';
                    } else {
                        item.style.transition = 'transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)';
                    }
                    
                    item.style.transform = '';
                }
            });
        });
    }

    let placeholderIndex = Math.floor(Math.random() * i18n[currentLang].placeholders.length);

    async function applyUIStrings() {
        const d = i18n[currentLang];
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
        
        const sortMenu = document.getElementById('sort-menu');
        if(sortMenu) {
            document.getElementById('ui-sort-date').innerText = d.sort_date;
            document.getElementById('ui-sort-played').innerText = d.sort_played;
            document.getElementById('ui-sort-az').innerText = d.sort_az;
            document.getElementById('ui-sort-custom').innerText = d.sort_custom;
            
            // Highlight current sort
            sortMenu.querySelectorAll('.sort-item').forEach(el => el.classList.remove('active'));
            const activeSort = sortMenu.querySelector(`[data-sort="${currentSort}"]`);
            if (activeSort) activeSort.classList.add('active');
        }

        // Update search placeholder and dropdown
        if (!searchInput.value.trim()) {
            searchPlaceholder.innerText = d.placeholders[placeholderIndex % d.placeholders.length];
        } else {
            updateSearch(searchInput.value);
        }
    }

    function timeSince(date) {
        const d = i18n[currentLang];
        if (!date || date === 0) return d.status_never;
        const s = Math.floor((new Date() - date) / 1000);
        if (s < 60) return d.status_recent;
        let i = s / 3600; if (i > 1) return Math.floor(i) + d.status_hours;
        i = s / 60; if (i > 1) return Math.floor(i) + d.status_mins;
        return d.status_recent;
    }

    function createCard(game) {
        const d = i18n[currentLang];
        const card = document.createElement('div');
        card.className = `game-card ${game.favorite ? 'favorited' : ''}`;
        card.dataset.folder = game.folderName;
        card.draggable = true;
        card.innerHTML = `
            <div class="fav-btn ${game.favorite ? 'active' : ''}">★</div>
            <div class="menu-btn"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
            <div class="dropdown-menu">
                <div class="dropdown-item action-rename">${d.rename}</div>
                <div class="dropdown-item action-reveal">${d.reveal}</div>
                <div class="dropdown-item danger action-delete">${d.delete}</div>
            </div>
            <div class="game-icon">🎮</div>
            <div class="game-title">${game.name}</div>
            <div class="game-status">${timeSince(game.lastPlayed)}</div>
        `;

        // Async load real icon
        window.electronAPI.getIcon(game.exePath).then(iconData => {
            if (iconData) {
                const iconDiv = card.querySelector('.game-icon');
                iconDiv.innerHTML = `<img src="${iconData}" alt="icon" draggable="false">`;
            }
        });
        card.querySelector('.fav-btn').onclick = async (e) => { e.stopPropagation(); game.favorite = await window.electronAPI.toggleFavorite(game.folderName); sortGames(currentSort); };
        card.querySelector('.menu-btn').onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.dropdown-menu').forEach(m => m !== card.querySelector('.dropdown-menu') && m.classList.remove('show')); card.querySelector('.dropdown-menu').classList.toggle('show'); };
        card.querySelector('.action-rename').onclick = (e) => {
            e.stopPropagation(); card.querySelector('.dropdown-menu').classList.remove('show');
            const titleDiv = card.querySelector('.game-title'); const input = document.createElement('input');
            input.type = 'text'; input.value = game.name; input.className = 'rename-input';
            titleDiv.replaceWith(input); input.focus(); input.select();
            const save = async () => { if (input.value.trim() && input.value.trim() !== game.name) { game.name = input.value.trim(); await window.electronAPI.renameGame({folderName: game.folderName, newName: game.name}); } if (input.parentNode) input.replaceWith(titleDiv); titleDiv.innerText = game.name; };
            input.onkeydown = (ev) => { if (ev.key === 'Enter') save(); if (ev.key === 'Escape') input.replaceWith(titleDiv); };
            input.onblur = save;
        };
        card.querySelector('.action-reveal').onclick = () => window.electronAPI.revealGame(game.exePath);
        card.querySelector('.action-delete').onclick = async () => { if(confirm(d.confirm)) { await window.electronAPI.deleteGame(game.folderPath); allGames = allGames.filter(g => g.folderName !== game.folderName); sortGames(currentSort); } };
        card.ondblclick = () => { card.style.opacity = '0.5'; window.electronAPI.launchYume({folderName: game.folderName, exePath: game.exePath}); game.lastPlayed = Date.now(); setTimeout(() => sortGames(currentSort), 1000); };
        
        // Drag and Drop
        card.ondragstart = (e) => {
            draggedGameFolder = game.folderName;
            e.dataTransfer.setData('folderName', game.folderName);
            e.dataTransfer.effectAllowed = 'move';
            
            // Match placeholder height to the actual card being dragged to prevent grid collapse
            const rect = card.getBoundingClientRect();
            dragPlaceholder.style.minHeight = `${rect.height}px`;
            
            requestAnimationFrame(() => { 
                card.style.display = 'none';
                card.parentNode.insertBefore(dragPlaceholder, card.nextSibling);
            });
        };
        card.ondragend = () => {
            if (dragPlaceholder.parentNode) {
                flipAnimateDOMUpdate(() => {
                    dragPlaceholder.parentNode.removeChild(dragPlaceholder);
                    card.style.display = 'flex';
                });
            } else {
                card.style.display = 'flex';
            }
            draggedGameFolder = null;
            document.querySelectorAll('.game-card').forEach(c => { c.classList.remove('drag-over'); });
        };
        card.ondragenter = (e) => { e.preventDefault(); };
        card.ondragleave = (e) => { e.preventDefault(); };
        card.ondragover = (e) => { e.preventDefault(); };
        card.ondrop = async (e) => { e.preventDefault(); }; // Handled by zone
        
        return card;
    }

    // Zone Drop Handlers
    [favGrid, unfavGrid, separator].forEach(zone => {
        zone.ondragover = (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
            
            // Removed sort restriction to allow visual drag anywhere
            
            const targetCard = e.target.closest('.game-card:not(.drag-placeholder)');
            
            let nextSibling;
            if (!targetCard) {
                // When hovering over the zone but not a specific card, append to the end
                nextSibling = null;
            } else {
                const rect = targetCard.getBoundingClientRect();
                const midX = rect.left + rect.width / 2;
                
                // Hysteresis deadzone to prevent flickering when mouse is on the boundary
                const threshold = rect.width * 0.15;
                if (Math.abs(e.clientX - midX) < threshold) {
                    return;
                }
                
                nextSibling = (e.clientX > midX) ? targetCard.nextElementSibling : targetCard;
            }

            if (dragPlaceholder.parentNode !== zone || dragPlaceholder.nextElementSibling !== nextSibling) {
                flipAnimateDOMUpdate(() => {
                    if (zone !== separator) {
                        zone.insertBefore(dragPlaceholder, nextSibling);
                    }
                });
            }
        };

        zone.ondragleave = (e) => { 
            if (!zone.contains(e.relatedTarget)) {
                zone.classList.remove('drag-over'); 
            }
        };
        
        zone.ondrop = (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const draggedFolder = e.dataTransfer.getData('folderName');
            if (!draggedFolder) return;
            const draggedGame = allGames.find(g => g.folderName === draggedFolder);
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
                    document.querySelectorAll('.sort-item').forEach(el => el.style.color = '#ccc');
                    document.getElementById('ui-sort-custom').style.color = 'var(--accent)';
                    document.getElementById('current-sort-label').innerText = document.getElementById('ui-sort-custom').innerText;
                }

                let customOrder = JSON.parse(localStorage.getItem('yumeshelf_custom_order') || '[]');
                if (customOrder.length === 0) customOrder = allGames.map(g => g.folderName);
                allGames.forEach(g => { if(!customOrder.includes(g.folderName)) customOrder.push(g.folderName); });

                const draggedIdx = customOrder.indexOf(draggedFolder);
                if (draggedIdx > -1) {
                    customOrder.splice(draggedIdx, 1);
                    
                    let insertIdx = customOrder.length;
                    let nextCard = dragPlaceholder.nextElementSibling;
                    while (nextCard && !nextCard.dataset.folder) {
                        nextCard = nextCard.nextElementSibling;
                    }
                    if (nextCard && nextCard.dataset.folder) {
                        const targetIdx = customOrder.indexOf(nextCard.dataset.folder);
                        if (targetIdx > -1) insertIdx = targetIdx;
                    }

                    customOrder.splice(insertIdx, 0, draggedFolder);
                    localStorage.setItem('yumeshelf_custom_order', JSON.stringify(customOrder));
                    needsSave = true;
                }
            }

            // Trigger the animation for the drop sorting (synchronously)
            flipAnimateDOMUpdate(() => {
                if (dragPlaceholder.parentNode) dragPlaceholder.parentNode.removeChild(dragPlaceholder);
                if (needsSave || doToggle) {
                    sortGames(currentSort);
                } else {
                    sortGames(currentSort); // Ensure it snaps back to original place
                }
            }, true);

            // Async API calls afterwards!
            if (doToggle) {
                window.electronAPI.toggleFavorite(draggedFolder);
            }
        };
    });

    function sortGames(type) {
        currentSort = type; localStorage.setItem('yumeshelf_sort_pref', type);
        favGrid.innerHTML = '';
        unfavGrid.innerHTML = '';
        emptyContainer.innerHTML = '';
        
        const d = i18n[currentLang];
        if (allGames.length === 0) {
            emptyContainer.innerHTML = `<div class="empty-zaako"><p>${d.zaako}</p><button class="zaako-btn" id="zaako-open-btn">${d.open_btn}</button></div>`;
            document.getElementById('zaako-open-btn').onclick = () => window.electronAPI.openFolder();
            quickFolder.style.display = 'none';
            separator.style.display = 'none';
        } else {
            quickFolder.style.display = 'flex';
            const sortFn = (arr) => {
                if (type === 'custom') {
                    let order = JSON.parse(localStorage.getItem('yumeshelf_custom_order') || '[]');
                    return [...arr].sort((a,b) => {
                        const iA = order.indexOf(a.folderName);
                        const iB = order.indexOf(b.folderName);
                        return (iA > -1 ? iA : 99999) - (iB > -1 ? iB : 99999);
                    });
                }
                return [...arr].sort((a,b) => {
                    if(type === 'az') return a.name.localeCompare(b.name);
                    if(type === 'date') return (b.dateAdded || 0) - (a.dateAdded || 0);
                    if(type === 'played') return (b.lastPlayed || 0) - (a.lastPlayed || 0);
                    return 0;
                });
            };
            
            const favs = allGames.filter(g => g.favorite);
            const unfavs = allGames.filter(g => !g.favorite);
            
            sortFn(favs).forEach(g => favGrid.appendChild(createCard(g)));
            sortFn(unfavs).forEach(g => unfavGrid.appendChild(createCard(g)));
            
            separator.style.display = (favs.length > 0 && unfavs.length > 0) ? 'flex' : 'none';
        }
        loading.style.display = 'none';
        applyUIStrings();
    }

    // SEARCH LOGIC
    function highlightMatch(text, query) {
        if (!query) return text;
        const parts = text.split(new RegExp(`(${query})`, 'gi'));
        return parts.map(p => p.toLowerCase() === query.toLowerCase() ? `<span class="search-match">${p}</span>` : p).join('');
    }

    function updateSearch(query) {
        if (!query.trim()) {
            searchDropdown.classList.remove('show');
            searchPlaceholder.style.display = 'block';
            return;
        }

        searchPlaceholder.style.display = 'none';
        const filtered = allGames.filter(g => 
            g.name.toLowerCase().includes(query.toLowerCase()) || 
            g.folderName.toLowerCase().includes(query.toLowerCase())
        );

        searchDropdown.innerHTML = '';
        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-item empty-search';
            empty.innerText = i18n[currentLang].no_results;
            searchDropdown.appendChild(empty);
            searchDropdown.classList.add('show');
            return;
        }

        filtered.forEach(game => {
            const item = document.createElement('div');
            item.className = 'search-item';
            item.draggable = true;
            item.innerHTML = `
                <div class="search-item-info">
                    <div class="search-item-icon">🎮</div>
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

            // Async load icon for search item
            window.electronAPI.getIcon(game.exePath).then(iconData => {
                if (iconData) {
                    const iconSpan = item.querySelector('.search-item-icon');
                    iconSpan.innerHTML = `<img src="${iconData}" alt="icon" draggable="false" style="width:100%; height:100%; object-fit:contain; pointer-events:none;">`;
                }
            });

            item.ondragstart = (e) => { 
                draggedGameFolder = game.folderName;
                e.dataTransfer.setData('folderName', game.folderName); 
            };
            item.ondragend = () => { draggedGameFolder = null; };

            const launchIconWrapper = item.querySelector('.search-launch-icon-wrapper');
            launchIconWrapper.onclick = (e) => {
                e.stopPropagation();
                const card = document.querySelector(`.game-card[data-folder="${game.folderName}"]`);
                if (card) {
                    searchDropdown.classList.remove('show');
                    searchInput.value = '';
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('glow');
                    setTimeout(() => card.classList.remove('glow'), 2000);
                }
            };

            item.onmouseenter = (e) => {
                tooltip.innerText = game.name;
                tooltip.style.display = 'block';
                const rect = item.getBoundingClientRect();
                tooltip.style.left = `${rect.left}px`;
                tooltip.style.top = `${rect.bottom + 5}px`;
            };
            item.onmouseleave = () => tooltip.style.display = 'none';
            item.ondblclick = (e) => {
                e.stopPropagation();
                window.electronAPI.launchYume({folderName: game.folderName, exePath: game.exePath});
                searchDropdown.classList.remove('show');
                searchInput.value = '';
            };
            
            searchDropdown.appendChild(item);
        });

        searchDropdown.classList.add('show');
    }

    searchInput.oninput = (e) => updateSearch(e.target.value);
    searchInput.onfocus = (e) => updateSearch(e.target.value);
    
    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
            searchDropdown.classList.remove('show');
        }
    });

    // Placeholder Rotation Logic
    function rotatePlaceholder() {
        if (searchInput.value.trim()) return; // Don't rotate if user is typing

        searchPlaceholder.style.opacity = '0';
        setTimeout(() => {
            const list = i18n[currentLang].placeholders;
            placeholderIndex = (placeholderIndex + 1) % list.length;
            searchPlaceholder.innerText = list[placeholderIndex];
            searchPlaceholder.style.opacity = '0.5';
        }, 2000);
    }

    setInterval(rotatePlaceholder, 60000);
    
    // Initial placeholder
    searchPlaceholder.innerText = i18n[currentLang].placeholders[placeholderIndex];

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
    document.getElementById('settings-open-btn').onclick = () => settingsOverlay.style.display = 'flex';
    document.getElementById('settings-close-btn').onclick = () => settingsOverlay.style.display = 'none';
    quickFolder.onclick = () => window.electronAPI.openFolder();
    
    // Sort logic
    const sortBtn = document.getElementById('sort-btn');
    const sortMenu = document.getElementById('sort-menu');
    sortBtn.onclick = (e) => { e.stopPropagation(); sortMenu.classList.toggle('show'); };
    document.querySelectorAll('.sort-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            sortGames(item.dataset.sort);
            sortMenu.classList.remove('show');
        };
    });

    themeSelect.onchange = (e) => { document.body.className = `${e.target.value}-theme`; localStorage.setItem('yumeshelf_theme', e.target.value); };
    langSelect.onchange = (e) => { currentLang = e.target.value; localStorage.setItem('yumeshelf_lang', currentLang); sortGames(currentSort); };
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') settingsOverlay.style.display = 'none'; });
    document.onclick = () => { document.querySelectorAll('.dropdown-menu, .sort-menu').forEach(m => m.classList.remove('show')); };
    
    document.body.className = `${currentTheme}-theme`; themeSelect.value = currentTheme;
    langSelect.value = currentLang;
    initApp();
});
