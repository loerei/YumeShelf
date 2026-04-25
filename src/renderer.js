document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.getElementById('game-grid');
    const loading = document.getElementById('loading');
    const welcome = document.getElementById('welcome-screen');
    const quickFolder = document.getElementById('quick-folder-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const langSelect = document.getElementById('lang-select');
    const themeSelect = document.getElementById('theme-select');

    let allGames = [];
    let currentSort = localStorage.getItem('launcher_sort_pref') || 'date';
    let currentLang = localStorage.getItem('launcher_lang') || 'en';
    let currentTheme = localStorage.getItem('launcher_theme') || 'system';

    const i18n = {
        en: { 
            title: "YumeShelf", settings: "Settings", lang: "Language", theme: "Theme Mode", path: "Library Path", change: "Change",
            welcome: "Welcome to YumeShelf", welcome_desc: "Choose how you want to manage your dreams.",
            opt_choose: "Choose Folder", opt_choose_desc: "Select an existing directory",
            opt_lazy: "I'm lazy!", opt_lazy_desc_prefix: "Create",
            zaako: "No game here, zaako~", open_btn: "Open Games Folder",
            rename: "✏️ Rename", reveal: "📁 Reveal", delete: "🗑️ Delete", confirm: "Delete into Recycle Bin?",
            status_never: "Never played", status_recent: "Just now", status_mins: " mins ago", status_hours: " hours ago"
        },
        vi: { 
            title: "YumeShelf", settings: "Cài đặt", lang: "Ngôn ngữ", theme: "Chế độ nền", path: "Đường dẫn", change: "Thay đổi",
            welcome: "Chào mừng tới YumeShelf", welcome_desc: "Chọn cách bạn muốn quản lý giấc mơ.",
            opt_choose: "Chọn thư mục", opt_choose_desc: "Trỏ tới thư viện game có sẵn",
            opt_lazy: "Tôi lười quá!", opt_lazy_desc_prefix: "Tạo",
            zaako: "Không có game ở đây, zaako~", open_btn: "Mở thư mục Game",
            rename: "✏️ Đổi tên", reveal: "📁 Mở thư mục", delete: "🗑️ Xóa game", confirm: "Xóa vào Thùng rác?",
            status_never: "Chưa chơi lần nào", status_recent: "Vừa mới chơi", status_mins: " phút trước", status_hours: " giờ trước"
        },
        ja: { 
            title: "ユメシェルフ", settings: "設定", lang: "言語", theme: "テーマ", path: "ライブラリパス", change: "変更",
            welcome: "ユメシェルフへようこそ", welcome_desc: "夢の管理方法を選択してください。",
            opt_choose: "フォルダを選択", opt_choose_desc: "既存のディレクトリを指定",
            opt_lazy: "面倒くさい！", opt_lazy_desc_prefix: "作成",
            zaako: "ここにはゲームがないよ、ざぁ～こ♡", open_btn: "ゲームフォルダを開く",
            rename: "✏️ 名前変更", reveal: "📁 フォルダを開く", delete: "🗑️ 削除", confirm: "ゴミ箱に移動しますか？",
            status_never: "未プレイ", status_recent: "たった今", status_mins: " 分前", status_hours: " 時間前"
        },
        zh: { 
            title: "梦之架", settings: "设置", lang: "语言", theme: "主题模式", path: "库路径", change: "更改",
            welcome: "欢迎来到梦之架", welcome_desc: "选择您管理梦想的方式。",
            opt_choose: "选择文件夹", opt_choose_desc: "选择现有的游戏目录",
            opt_lazy: "我太懒了！", opt_lazy_desc_prefix: "在此创建",
            zaako: "这里没有游戏哦，杂~鱼~", open_btn: "打开游戏文件夹",
            rename: "✏️ 重命名", reveal: "📁 打开文件夹", delete: "🗑️ 删除", confirm: "确定要删除吗？",
            status_never: "从未运行", status_recent: "刚刚", status_mins: " 分钟前", status_hours: " 小时前"
        }
    };

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
        card.ondblclick = () => { card.style.opacity = '0.5'; window.electronAPI.launchGame({folderName: game.folderName, exePath: game.exePath}); game.lastPlayed = Date.now(); setTimeout(() => sortGames(currentSort), 1000); };
        return card;
    }

    function sortGames(type) {
        currentSort = type; localStorage.setItem('launcher_sort_pref', type);
        grid.innerHTML = '';
        const d = i18n[currentLang];
        if (allGames.length === 0) {
            grid.innerHTML = `<div class="empty-zaako"><p>${d.zaako}</p><button class="zaako-btn" id="zaako-open-btn">${d.open_btn}</button></div>`;
            document.getElementById('zaako-open-btn').onclick = () => window.electronAPI.openFolder();
            quickFolder.style.display = 'none';
        } else {
            quickFolder.style.display = 'flex';
            const sortFn = (arr) => [...arr].sort((a,b) => {
                if(type === 'az') return a.name.localeCompare(b.name);
                if(type === 'date') return (b.dateAdded || 0) - (a.dateAdded || 0);
                if(type === 'played') return (b.lastPlayed || 0) - (a.lastPlayed || 0);
                if(type === 'rj') { const ah = a.name.includes('[RJ'), bh = b.name.includes('[RJ'); return (ah === bh) ? a.name.localeCompare(b.name) : ah ? -1 : 1; }
            });
            sortFn(allGames.filter(g => g.favorite)).forEach(g => grid.appendChild(createCard(g)));
            if (allGames.some(g => g.favorite) && allGames.some(g => !g.favorite)) {
                const sep = document.createElement('div'); sep.className = 'favorites-separator-container'; sep.innerHTML = '<div class="favorites-separator"></div>'; grid.appendChild(sep);
            }
            sortFn(allGames.filter(g => !g.favorite)).forEach(g => grid.appendChild(createCard(g)));
        }
        loading.style.display = 'none';
        applyUIStrings();
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
    document.getElementById('settings-open-btn').onclick = () => settingsOverlay.style.display = 'flex';
    document.getElementById('settings-close-btn').onclick = () => settingsOverlay.style.display = 'none';
    quickFolder.onclick = () => window.electronAPI.openFolder();
    themeSelect.onchange = (e) => { document.body.className = `${e.target.value}-theme`; localStorage.setItem('launcher_theme', e.target.value); };
    langSelect.onchange = (e) => { currentLang = e.target.value; localStorage.setItem('launcher_lang', currentLang); sortGames(currentSort); };
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') settingsOverlay.style.display = 'none'; });
    document.onclick = () => { document.querySelectorAll('.dropdown-menu, .sort-menu').forEach(m => m.classList.remove('show')); };
    
    document.body.className = `${currentTheme}-theme`; themeSelect.value = currentTheme;
    langSelect.value = currentLang;
    initApp();
});
