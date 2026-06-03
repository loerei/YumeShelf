<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/yumeshelf_wordmark_refined_icon_dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/yumeshelf_wordmark_refined_icon.svg">
    <img alt="YumeShelf" src="assets/yumeshelf_wordmark_refined_icon.svg" width="600">
  </picture>
  <p><b>VN Launcher, offline save editing, and automated translations—rescuing you from drowning in File Explorer.</b></p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Electron](https://img.shields.io/badge/Framework-Electron-blue)](https://www.electronjs.org/)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/loerei/YumeShelf/pulls)

  <p>
    <a href="#english">English</a> | 
    <a href="#简体中文">简体中文</a> | 
    <a href="#日本語">日本語</a> | 
    <a href="#tiếng-việt">Tiếng Việt</a>
  </p>
</div>

---

## English

* **Tried to open your game folder and find your `.exe` among thousands of game files?**  
  We introduce a plug-and-play **library and launcher** where you can just double click to open any game, tell it the folder where you leave your game, and that's it.
* **Tired of setting up [XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator) for your games?**  
  We make it happen in **one click**.
* **Tired of uploading your saves to the internet to edit them?**  
  Here you are, **local save editor**.

**All in one app, YumeShelf.**

### 🌟 Features
* **🚀 Effortless Setup**: Just click **"I'm lazy!"** and Yume-chan handles the setup for you.
* **🔍 Game Hunter**: Yume-chan finds your games even when they're buried deep in sub-folders.
* **🧹 Tidying Up**: Yume-chan cleans up messy titles by removing ugly tags and version numbers.
* **✨ Special Glow**: Pin your favorite dreams to the top with a beautiful golden glow.
* **🎨 Dress Up**: Switch between **Dark**, **Light**, and **System** modes to suit your mood.
* **💡 Guidance**: Yume-chan guides you exactly on how to add your first game!

### 🚀 Quick Start
1. **Download**: Grab [the latest version](https://github.com/loerei/YumeShelf/releases/latest).
2. **Install**: Run `YumeShelf-Setup-<version>.exe` and follow the installer.
3. **Launch**: Open YumeShelf from your desktop or Start Menu, then choose your existing game folder or let YumeShelf create one for you.
4. **Enjoy**: Double-click any game to start your journey.

### 🛠️ For Developers
Welcome! If you want to contribute to **YumeShelf**, here is the technical breakdown.

#### Tech Stack
* **Core**: [Electron](https://www.electronjs.org/)
* **Main Process (Backend)**: [Node.js](https://nodejs.org/) & [TypeScript](https://www.typescriptlang.org/)
* **Renderer Process (Frontend)**: [Vite](https://vite.dev/), Vanilla [TypeScript](https://www.typescriptlang.org/), [HTML5](https://developer.mozilla.org/en-US/docs/Web/HTML), [CSS3](https://developer.mozilla.org/en-US/docs/Web/CSS) (Zero heavy frameworks for maximum performance)
* **Native Helpers**: [Rust](https://www.rust-lang.org/) (playtime helper), [C++](https://isocpp.org/) (background injector), and [C# (.NET)](https://learn.microsoft.com/en-us/dotnet/csharp/) (save converter)
* **Storage**: Local [JSON](https://www.json.org/)-based file storage.

#### Project Structure
```text
YumeShelf/
├── src/
│   ├── main.ts              # Main process entry point
│   ├── main/                # Main process modules
│   │   ├── core/            # Shared utilities and I/O helpers
│   │   ├── ipc/             # IPC channel handlers
│   │   ├── library-state/   # Game library management
│   │   ├── save-editor/     # Save file parsing and editing
│   │   ├── translation/     # XUnity.AutoTranslator setup and proxy
│   │   └── window/          # Electron window and lifecycle
│   ├── renderer/            # Renderer process (Vite, TypeScript, CSS)
│   ├── preload/             # Secure IPC bridge
│   └── shared/              # Types shared between processes
└── package.json
```

#### Windows Build Outputs
* **Official release artifact**: `npm run build` and `npm run build:fast` produce `build_output\YumeShelf-Setup-<version>.exe`
* **Local/dev-only artifact**: `npm run build:dir` produces `build_output\win-unpacked\`
* **Portable releases**: Retired


---

## 简体中文

* **厌倦了打开游戏文件夹，并在成千上万个杂乱文件中苦苦翻找 `.exe` 启动程序？**  
  我们为你带来即插即用的**游戏库与启动器**：只需指定游戏目录，双击即可直接启动任何游戏。
* **懒得为每个游戏繁琐配置 [XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator) 自动翻译？**  
  我们实现了一键部署，**只需一步点击**。
* **不想再把存档上传到互联网去进行修改？**  
  为你提供完全本地化的**存档编辑器**，安全且省心。

**万象包罗，尽在 YumeShelf。**

### 🌟 特色功能
* **🚀 轻松设置**: 只需点击 **"我太懒了！(I'm lazy!)"**，Yume-chan 就会帮你搞定一切设置。
* **🔍 游戏猎手**: 即使游戏藏在深深的子文件夹里，Yume-chan 也能把它们找出来。
* **🧹 整理魔法**: Yume-chan 会帮你清理掉标题里那些难看的标签和版本号。
* **✨ 特别光芒**: 为你最爱的梦想（游戏）置顶，并加上美丽的金色光晕。
* **🎨 换装游戏**: 随心所欲在 **深色 (Dark)**、**浅色 (Light)** 和 **跟随系统 (System)** 模式间切换。
* **💡 贴心指导**: 你的书架空空如也？Yume-chan 会手把手教你如何添加第一个游戏！

### 🚀 快速开始
1. **下载**: 获取 [最新版本](https://github.com/loerei/YumeShelf/releases/latest)。
2. **安装**: 运行 `YumeShelf-Setup-<version>.exe` 并按向导完成安装。
3. **启动**: 从桌面或开始菜单打开 YumeShelf，然后选择现有的游戏文件夹，或者让 YumeShelf 为你创建一个。
4. **享受**: 双击任意游戏，开启你的旅程。

### 🛠️ 致开发者
欢迎！如果你想为 **YumeShelf** 做出贡献，以下是技术架构简介。

#### 技术栈
* **核心 (Core)**: [Electron](https://www.electronjs.org/)
* **主进程 (Backend)**: [Node.js](https://nodejs.org/) & [TypeScript](https://www.typescriptlang.org/)
* **渲染进程 (Frontend)**: [Vite](https://vite.dev/), 原生 [TypeScript](https://www.typescriptlang.org/), [HTML5](https://developer.mozilla.org/en-US/docs/Web/HTML), [CSS3](https://developer.mozilla.org/en-US/docs/Web/CSS)
* **原生辅助 (Native)**: [Rust](https://www.rust-lang.org/) (playtime 辅助), [C++](https://isocpp.org/) (后台注入器), 以及 [C# (.NET)](https://learn.microsoft.com/en-us/dotnet/csharp/) (存档转换器)
* **存储 (Storage)**: 基于本地 [JSON](https://www.json.org/) 的文件存储。

#### 项目结构
```text
YumeShelf/
├── src/
│   ├── main.ts              # 主进程入口
│   ├── main/                # 主进程模块
│   │   ├── core/            # 共享工具与 I/O
│   │   ├── ipc/             # IPC 通道处理
│   │   ├── library-state/   # 游戏库管理
│   │   ├── save-editor/     # 存档解析与编辑
│   │   ├── translation/     # XUnity 配置与代理
│   │   └── window/          # Electron 窗口与生命周期
│   ├── renderer/            # 渲染进程（Vite, TypeScript, CSS）
│   ├── preload/             # 安全 IPC 桥接
│   └── shared/              # 进程间共享类型
└── package.json
```


---

## 日本語

* **数千ものゲームファイルが散らばるフォルダーを開き、そこから `.exe` ファイルを探し出すのにうんざりしていませんか？**  
  ゲームの保存先を指定するだけで、ダブルクリックするだけで簡単に起動できる、プラグアンドプレイの**ライブラリ＆ランチャー**をご紹介します。
* **ゲームごとに [XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator) を手動でセットアップする手間に悩んでいませんか？**  
  **ワンクリック**で自動翻訳のセットアップを完了できます。
* **セーブデータを編集するためだけに、わざわざネット上にアップロードするのが面倒ではありませんか？**  
  完全オフラインで安心な**ローカルセーブエディター**がここにあります。

**すべてを一つに、YumeShelf。**

### 🌟 機能
* **🚀 簡単セットアップ**: **「面倒くさい！」** をクリックするだけで、Yume-chanがセットアップを済ませてくれます。
* **🔍 ゲームハンター**: 深いサブフォルダに隠れていても、Yume-chanがあなたのゲームを見つけ出します。
* **🧹 お片付け**: Yume-chanが、醜いタグやバージョン番号を取り除いてタイトルをきれいにします。
* **✨ 特別な輝き**: お気に入りの夢（ゲーム）を美しい金色の輝きでトップにピン留めします。
* **🎨 お着替え**: 気分に合わせて、**Dark**、**Light**、**System** モードを切り替えられます。
* **💡 ガイダンス**: Yume-chanが、最初のゲームの追加方法を正確に教えてくれます！

### 🚀 クイックスタート
1. **ダウンロード**: [最新バージョン](https://github.com/loerei/YumeShelf/releases/latest)を取得します。
2. **インストール**: `YumeShelf-Setup-<version>.exe` を実行し、インストーラーの案内に従います。
3. **起動**: デスクトップまたはスタートメニューから YumeShelf を開き、既存のゲームフォルダを選択するか、YumeShelf に作成させます。
4. **楽しむ**: 任意のゲームをダブルクリックして旅を始めましょう。

### 🛠️ 開発者向け
ようこそ！**YumeShelf** に貢献したい方のために、技術的な詳細を説明します。

#### 技術スタック
* **コア (Core)**: [Electron](https://www.electronjs.org/)
* **メインプロセス (Backend)**: [Node.js](https://nodejs.org/) & [TypeScript](https://www.typescriptlang.org/)
* **レンダラープロセス (Frontend)**: [Vite](https://vite.dev/), バニラ [TypeScript](https://www.typescriptlang.org/), [HTML5](https://developer.mozilla.org/en-US/docs/Web/HTML), [CSS3](https://developer.mozilla.org/en-US/docs/Web/CSS)
* **ネイティブ補助 (Native)**: [Rust](https://www.rust-lang.org/) (プレイ時間ヘルパー), [C++](https://isocpp.org/) (バックグラウンドインジェクター), および [C# (.NET)](https://learn.microsoft.com/en-us/dotnet/csharp/) (セーブデータコンバーター)
* **ストレージ (Storage)**: ローカル [JSON](https://www.json.org/) ベースのファイルストレージ。

#### プロジェクト構成
```text
YumeShelf/
├── src/
│   ├── main.ts              # メインプロセス エントリーポイント
│   ├── main/                # メインプロセス モジュール
│   │   ├── core/            # 共有ユーティリティ & I/O
│   │   ├── ipc/             # IPC チャンネル ハンドラー
│   │   ├── library-state/   # ゲームライブラリ管理
│   │   ├── save-editor/     # セーブデータの解析と編集
│   │   ├── translation/     # XUnity 設定とプロキシ
│   │   └── window/          # Electron ウィンドウとライフサイクル
│   ├── renderer/            # レンダラープロセス（Vite, TypeScript, CSS）
│   ├── preload/             # セキュア IPC ブリッジ
│   └── shared/              # プロセス間共有型
└── package.json
```


---

## Tiếng Việt

* **Mệt mỏi vì phải mở thư mục game rồi lục lọi tìm file `.exe` giữa hàng ngàn file linh tinh?**  
  Chúng tôi mang đến một **thư viện và trình khởi chạy** cắm-là-chạy (plug-and-play) cực kỳ tiện lợi: chỉ cần chỉ định thư mục chứa game, rồi double-click để chiến game ngay lập tức.
* **Ngại thiết lập [XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator) thủ công cho từng tựa game?**  
  Chúng tôi giúp bạn cấu hình tự động chỉ với **một cú click**.
* **Phát ngán vì phải tải file save lên các trang web trực tuyến để chỉnh sửa?**  
  Đây là giải pháp dành cho bạn: **trình chỉnh sửa save local** tiện lợi và bảo mật.

**Tất cả trong một ứng dụng duy nhất, YumeShelf.**

### 🌟 Tính năng nổi bật
* **🚀 Thiết lập siêu lười**: Chỉ cần click **"Tôi lười quá!"** và Yume-chan sẽ lo mọi thủ tục setup cho bạn.
* **🔍 Thợ săn Game**: Yume-chan sẽ lùng sục và tìm ra game của bạn dù chúng có bị giấu sâu trong các thư mục con.
* **🧹 Dọn dẹp**: Yume-chan ghét sự bừa bộn! Cô ấy sẽ dọn sạch mấy cái tag và số phiên bản xấu xí trên tên game.
* **✨ Hào quang lấp lánh**: Ghim những "giấc mơ" yêu thích của bạn lên đầu trang với hiệu ứng viền vàng rực rỡ.
* **🎨 Lên đồ**: Thay đổi phong cách của Yume-chan bất cứ lúc nào với chế độ **Dark**, **Light**, hoặc **System**.
* **💡 Hướng dẫn tận tình**: Yume-chan sẽ chỉ dẫn bạn chính xác cách để thêm tựa game đầu tiên!

### 🚀 Bắt đầu nhanh
1. **Tải về**: Tải [phiên bản mới nhất](https://github.com/loerei/YumeShelf/releases/latest).
2. **Cài đặt**: Chạy `YumeShelf-Setup-<version>.exe` và làm theo trình cài đặt.
3. **Khởi chạy**: Mở YumeShelf từ desktop hoặc Start Menu, rồi chọn thư mục game có sẵn của bạn hoặc để YumeShelf tự tạo một cái mới.
4. **Thưởng thức**: Click đúp vào bất kỳ game nào để bắt đầu hành trình.

### 🛠️ Dành cho lập trình viên
Chào mừng! Nếu bạn muốn đóng góp cho **YumeShelf**, dưới đây là tổng quan về kỹ thuật.

#### Tech Stack
* **Core**: [Electron](https://www.electronjs.org/)
* **Main Process (Backend)**: [Node.js](https://nodejs.org/) & [TypeScript](https://www.typescriptlang.org/)
* **Renderer Process (Frontend)**: [Vite](https://vite.dev/), Vanilla [TypeScript](https://www.typescriptlang.org/), [HTML5](https://developer.mozilla.org/en-US/docs/Web/HTML), [CSS3](https://developer.mozilla.org/en-US/docs/Web/CSS) (Không sử dụng framework nặng nề để tối đa hóa hiệu suất)
* **Native Helpers**: [Rust](https://www.rust-lang.org/) (playtime helper), [C++](https://isocpp.org/) (background injector), và [C# (.NET)](https://learn.microsoft.com/en-us/dotnet/csharp/) (save converter)
* **Storage**: Lưu trữ dữ liệu cục bộ dựa trên [JSON](https://www.json.org/).

#### Cấu trúc thư mục
```text
YumeShelf/
├── src/
│   ├── main.ts              # Entry point của Main Process
│   ├── main/                # Các module của Main Process
│   │   ├── core/            # Tiện ích dùng chung & I/O
│   │   ├── ipc/             # Xử lý các kênh IPC
│   │   ├── library-state/   # Quản lý thư viện game
│   │   ├── save-editor/     # Phân tích và chỉnh sửa file save
│   │   ├── translation/     # Cấu hình XUnity và proxy dịch thuật
│   │   └── window/          # Cửa sổ Electron và vòng đời tiến trình
│   ├── renderer/            # Renderer Process (Vite, TypeScript, CSS)
│   ├── preload/             # Cầu nối IPC bảo mật
│   └── shared/              # Kiểu dữ liệu dùng chung giữa các tiến trình
└── package.json
```
