<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/yumeshelf_wordmark_refined_icon_dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/yumeshelf_wordmark_refined_icon.svg">
    <img alt="YumeShelf" src="assets/yumeshelf_wordmark_refined_icon.svg" width="600">
  </picture>
  <p><b>A minimalist game library and launcher for your personal collection.</b></p>

  <p>
    <a href="#english">English</a> | 
    <a href="#tiếng-việt">Tiếng Việt</a> | 
    <a href="#简体中文">简体中文</a> | 
    <a href="#日本語">日本語</a>
  </p>
</div>

---

## English

If your game folder is a mess of `[v1.2.5]_game_name_pc` and random `RJ123456` subfolders, this is for you.

Point YumeShelf to your games directory and it puts everything into a clean grid with real titles and icons so you never have to hunt for the right executable again.

### What It Does

- **Zero Digging**: Finds the actual game executable deep inside nested subfolders and cleans up ugly uploader names.
- **Save Finder & Built-in Editor**: Automatically tracks down hidden save folders (AppData, Ren'Py folders, Linux XDG paths, Wine prefixes) and lets you tweak gold, variables, and switches for RPG Maker, Ren'Py, Unity, and Wolf RPG games directly from the app.
- **Windows & Linux**: Works out of the box on Windows (installer / portable) and Linux (`.AppImage` and `.tar.gz`) with zero setup.
- **Translation Setup**: Deploys XUnity.AutoTranslator shims in one click without manual file copying.
- **Playtime Tracking**: Tracks the hours you spend on each game.

### Quick Start

1. Download the latest release from [GitHub Releases](https://github.com/loerei/YumeShelf/releases/latest).
   - **Windows**: Run `YumeShelf-Setup-<version>.exe`.
   - **Linux**: Download `YumeShelf-<version>.AppImage`, make it executable (`chmod +x`), and run it.
2. Choose your existing game directory on first launch, or click "I'm lazy" to let YumeShelf create a default folder for you.
3. Double-click any game card to launch.

### Disclaimer (Antivirus False Positives)

Since this is an indie open-source tool and is not signed with an expensive enterprise certificate, Windows SmartScreen or Windows Defender might flag it as a false positive. This is normal for open-source desktop software. You can click "More info" -> "Run anyway" or inspect the source code on GitHub.

### For Developers

#### Tech Stack
- **Framework**: Electron
- **Main Process**: Node.js and TypeScript
- **Renderer**: Vite, TypeScript, Vanilla HTML5/CSS3 (no heavy UI frameworks)
- **Native Helpers**: Rust (playtime helper and process monitor), C# (.NET save converter)
- **Storage**: Local JSON files (`~/.config/YumeShelf/` on Linux, `%APPDATA%\YumeShelf\` on Windows)

#### Project Structure
```text
YumeShelf/
├── src/
│   ├── main.ts              # Main process entry point
│   ├── main/                # Main process architecture
│   │   ├── core/            # Platform adapters, zip extraction, app paths
│   │   ├── game-runner/     # Wine, Proton, and native Linux launcher
│   │   ├── icon-pipeline/   # PE resource decoder, desktop entry resolver
│   │   ├── ipc/             # IPC controllers and handlers
│   │   ├── library-state/   # Scanner, title resolution, database state
│   │   ├── save-editor/     # Local save file parsers and editor engine
│   │   ├── save-folder-resolver/ # Engine save directory resolution
│   │   ├── translation/     # Translation shims and asset deployer
│   │   └── window/          # App lifecycle and window management
│   ├── renderer/            # Frontend UI (TypeScript, CSS)
│   ├── preload.ts           # Context bridge
│   └── shared/              # Shared types and interfaces
├── native/
│   └── playtime-helper/     # Cross-platform Rust helper (Windows Win32 / Linux /proc)
└── package.json
```

#### Building from Source
```bash
# 1. Install dependencies
npm install

# 2. Build TypeScript & Frontend
npm run build:main
npm run build:renderer

# 3. Start development mode
npm start

# 4. Package binaries
npm run build         # Windows installer
npm run build:linux   # Linux AppImage & tarball
```

### Contributing

YumeShelf is open-source and constantly evolving. If anyone wants to help test on different Linux distros, submit translations, suggest new features, or report bugs, PRs and feedback are welcome.

Uhhh, I might make a Discord server too if this somehow reaches a bunch of users.

---

## Tiếng Việt

Nếu ổ game của bạn là một đống lộn xộn mấy thư mục kiểu `[v1.2.5]_game_name_pc` với mã `RJ123456`, cái này dành cho bạn.

Chỉ cần trỏ YumeShelf vào folder game là xong. Nó sẽ tự gom mọi thứ vào một giao diện gọn gàng, lấy đúng tên game với icon để bạn khỏi phải đi mò file .exe nữa.

### Nó làm được gì

- **Khỏi phải đi mò file**: Tự tìm file chạy nằm sâu trong mấy folder con, tự xóa mấy cái tag linh tinh của uploader.
- **Tự tìm và sửa file save**: Tự mò ra chỗ game giấu save (AppData, Ren'Py, Linux XDG, Wine prefix) và có sẵn trình sửa save để chỉnh vàng, biến số, switch cho game RPG Maker, Ren'Py, Unity, Wolf RPG ngay trong app.
- **Dùng tốt trên cả Windows lẫn Linux**: Chạy được luôn trên Windows và Linux (`.AppImage` & `.tar.gz`), không cần cài đặt rườm rà.
- **Cài dịch tự động 1-click**: Tự thả bộ XUnity.AutoTranslator vào game khỏi mất công copy tay.
- **Đếm giờ chơi**: Xem bạn đã chơi mỗi game được bao nhiêu tiếng.

### Bắt đầu nhanh

1. Tải bản mới nhất ở [GitHub Releases](https://github.com/loerei/YumeShelf/releases/latest).
   - **Windows**: Chạy file `YumeShelf-Setup-<version>.exe`.
   - **Linux**: Tải `YumeShelf-<version>.AppImage`, cấp quyền chạy (`chmod +x`) rồi mở lên.
2. Lần đầu mở thì chọn folder game của bạn, hoặc bấm "Tôi lười quá" để app tự tạo folder mặc định.
3. Click đúp vào game để chơi.

### Cảnh báo Antivirus (Báo nhầm)

Vì đây là tool mã nguồn mở tự làm và không có tiền mua chứng chỉ doanh nghiệp đắt đỏ, Windows SmartScreen hay Windows Defender có thể sẽ báo linh tinh. Đây là chuyện bình thường với app desktop nguồn mở. Bạn cứ bấm "More info" -> "Run anyway" là được, hoặc vào GitHub tự xem code.

---

## 简体中文

如果你的游戏文件夹里也是一堆乱七八糟的 `[v1.2.5]_game_name_pc` 和各种 `RJ123456` 子文件夹，每次找 `.exe` 都找得头大，那这个工具应该挺适合你。

把 YumeShelf 指向你的游戏目录就行。它会自动把所有游戏整理成干净的网格，提取真正的游戏名字和图标，省得你再去翻子文件夹找启动程序。

### 它能做什么

- **不用到处翻 .exe**: 自动在层层子文件夹里定位真正的游戏启动文件，顺便清掉上传者加的那些乱七八糟的版本号和来源标签。
- **自动找存档 & 内置存档修改器**: 自动找出游戏藏在 AppData、Ren'Py 目录、Linux XDG 路径或者 Wine 前缀里的存档。可以直接在软件里修改 RPG Maker (MV/MZ)、Wolf RPG (`.sav`)、Ren'Py、Unity 存档里的金币、变量和开关。
- **支持 Windows 和 Linux**: Windows 和 Linux (`.AppImage` 和 `.tar.gz`) 都能直接开箱即用，免安装。
- **一键部署自动翻译**: 一键把 XUnity.AutoTranslator 补丁放进游戏，不用自己手动解压复制。
- **记录游玩时间**: 自动统计每个游戏玩了多久。

### 快速上手

1. 从 [GitHub Releases](https://github.com/loerei/YumeShelf/releases/latest) 下载最新版本。
   - **Windows**: 运行 `YumeShelf-Setup-<version>.exe`。
   - **Linux**: 下载 `YumeShelf-<version>.AppImage`，给执行权限 (`chmod +x`) 就能直接开。
2. 第一次打开时选你放游戏的文件夹，或者直接点 "我太懒了" 让它自动建一个。
3. 双击游戏卡片就能玩了。

### 杀毒软件误报说明

因为这是个人开发的开源小工具，买不起死贵的企业代码签名证书，Windows SmartScreen 或 Windows Defender 可能会弹警告。开源软件经常这样。直接点 "更多信息" -> "仍要运行" 就行，心里没底的话也可以去 GitHub 看源码。

---

## 日本語

ゲームフォルダの中に `[v1.2.5]_game_name_pc` とか `RJ123456` みたいなフォルダが散らばってて、どれが起動ファイルか分からなくなってる人向けです。

YumeShelf にゲームフォルダを指定するだけで、フォルダの奥底から実行ファイルを拾い出して、きれいなタイトルとアイコンでグリッドに並べてくれます。もう毎回 .exe を探してフォルダを掘り返す必要はありません。

### できること

- **.exe 探しからの解放**: 深いサブフォルダの中にある実行ファイルを自動で見つけて、アップローダーの余計なタグを消してくれます。
- **セーブデータ検索＆編集**: AppData や Ren'Py フォルダ、Linux の XDG パス、Wine プレフィックスに隠れたセーブデータを自動で探し出します。RPG Maker (MV/MZ)、Wolf RPG (`.sav`)、Ren'Py、Unity のセーブデータをアプリ内で直接いじって、所持金や変数、スイッチを変更できます。
- **Windows / Linux 両対応**: Windows でも Linux (`.AppImage` / `.tar.gz`) でも、インストール不要でそのまま動きます。
- **ワンクリック自動翻訳**: XUnity.AutoTranslator のファイルを自動で配置します。
- **プレイ時間カウント**: 各ゲームのプレイ時間を記録します。

### 使い方

1. [GitHub Releases](https://github.com/loerei/YumeShelf/releases/latest) から最新版をダウンロードします。
   - **Windows**: `YumeShelf-Setup-<version>.exe` を実行します。
   - **Linux**: `YumeShelf-<version>.AppImage` をダウンロードして、実行権限をつけて (`chmod +x`) 起動します。
2. 初回起動時にゲームフォルダを選ぶか、「面倒くさい」を押してデフォルトフォルダを作らせます。
3. カードをダブルクリックすればゲームが始まります。

### セキュリティ警告について

個人開発のオープンソースで高価な企業用証明書を買っていないため、Windows SmartScreen 等に引っかかることがあります。オープンソースアプリではよくあることなので、「詳細情報」→「実行」を押してください。気になるなら GitHub でソースコードを見てもらって大丈夫です。
