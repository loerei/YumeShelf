<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/yumeshelf_wordmark_refined_icon_dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/yumeshelf_wordmark_refined_icon.svg">
    <img alt="YumeShelf" src="assets/yumeshelf_wordmark_refined_icon.svg" width="600">
  </picture>
  <p><b>Your dreams, organized. A minimalist, modern, and fast game library for your personal collection.</b></p>

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

### ✨ For Users
**YumeShelf** is a dedicated launcher designed to bring order to your game folders. No more digging through messy sub-directories or looking at ugly file names. It scans, cleans, and presents your games in a beautiful, minimalist grid.

### 🌟 Features
* **🚀 Effortless Setup**: Just click **"I'm lazy!"** and Yume-chan handles the setup for you.
* **🔍 Game Hunter**: Yume-chan finds your games even when they're buried deep in sub-folders.
* **🧹 Tidying Up**: Yume-chan cleans up messy titles by removing ugly tags and version numbers.
* **✨ Special Glow**: Pin your favorite dreams to the top with a beautiful golden glow.
* **🎨 Dress Up**: Switch between **Dark**, **Light**, and **System** modes to suit your mood.
* **💡 Guidance**: Yume-chan guides you exactly on how to add your first game!

### 🚀 Quick Start
1. **Download**: Grab the latest version from the [Releases] page.
2. **Install**: Run `YumeShelf Setup <version>.exe` and follow the installer.
3. **Launch**: Open YumeShelf from your desktop or Start Menu, then choose your existing game folder or let YumeShelf create one for you.
4. **Enjoy**: Double-click any game to start your journey.

### 🛠️ For Developers
Welcome! If you want to contribute to **YumeShelf**, here is the technical breakdown.

#### Tech Stack
* **Core**: Electron
* **Backend**: Node.js (File system, Child processes)
* **Frontend**: Vanilla JS, HTML5, CSS3 (Zero heavy frameworks for maximum performance)
* **Storage**: Local JSON-based caching system for instant loading.

#### Project Structure
```text
YumeShelf/
├── YumeShelf/       # Default local game directory
├── src/             # Source code
│   ├── main.js      # Main process (Recursive scanning, IPC)
│   ├── renderer.js  # UI Logic, i18n & Theme Engine
│   ├── preload.js   # Secure IPC bridge
│   ├── index.html   # App layout
│   └── style.css    # Modern styling & themes
└── package.json     # Scripts & Dependencies
```

#### Windows Build Outputs
* **Official release artifact**: `npm run build` and `npm run build:fast` produce `build_output\YumeShelf Setup <version>.exe`
* **Local/dev-only artifact**: `npm run build:dir` produces `build_output\win-unpacked\`
* **Portable releases**: Retired


---

## 简体中文

### ✨ 致用户
**梦之架 (YumeShelf)** 是一款专为整理游戏文件夹而设计的专属启动器。 不再需要在混乱的子目录中翻找，也不用再看难看的文件名。 它会扫描、清理，并以美观、极简的网格展现你的游戏。

### 🌟 特色功能
* **🚀 轻松设置**: 只需点击 **"我太懒了！(I'm lazy!)"**，Yume-chan 就会帮你搞定一切设置。
* **🔍 游戏猎手**: 即使游戏藏在深深的子文件夹里，Yume-chan 也能把它们找出来。
* **🧹 整理魔法**: Yume-chan 会帮你清理掉标题里那些难看的标签和版本号。
* **✨ 特别光芒**: 为你最爱的梦想（游戏）置顶，并加上美丽的金色光晕。
* **🎨 换装游戏**: 随心所欲在 **深色 (Dark)**、**浅色 (Light)** 和 **跟随系统 (System)** 模式间切换。
* **💡 贴心指导**: 你的书架空空如也？Yume-chan 会手把手教你如何添加第一个游戏！

### 🚀 快速开始
1. **下载**: 从 [Releases] 页面获取最新版本。
2. **安装**: 运行 `YumeShelf Setup <version>.exe` 并按向导完成安装。
3. **启动**: 从桌面或开始菜单打开 YumeShelf，然后选择现有的游戏文件夹，或者让 YumeShelf 为你创建一个。
4. **享受**: 双击任意游戏，开启你的旅程。

### 🛠️ 致开发者
欢迎！如果你想为 **YumeShelf** 做出贡献，以下是技术架构简介。

#### 技术栈
* **核心**: Electron
* **后端**: Node.js (文件系统操作, 子进程)
* **前端**: Vanilla JS, HTML5, CSS3 (零重型框架，追求极致性能)
* **存储**: 基于本地 JSON 的缓存系统，实现瞬间加载。

#### 项目结构
```text
YumeShelf/
├── YumeShelf/       # 默认本地游戏目录
├── src/             # 源代码
│   ├── main.js      # 主进程 (递归扫描, IPC)
│   ├── renderer.js  # UI 逻辑, i18n & 主题引擎
│   ├── preload.js   # 安全 IPC 桥接
│   ├── index.html   # 应用布局
│   └── style.css    # 现代样式 & 主题
└── package.json     # 脚本 & 依赖项
```


---

## 日本語

### ✨ ユーザー向け
**ユメシェルフ (YumeShelf)** は、ゲームフォルダを整理するための専用ランチャーです。 面倒なサブディレクトリを探し回ったり、見苦しいファイル名を見たりする必要はもうありません。 スキャンしてクリーンアップし、美しくミニマルなグリッドにゲームを表示します。

### 🌟 機能
* **🚀 簡単セットアップ**: **「面倒くさい！」** をクリックするだけで、Yume-chanがセットアップを済ませてくれます。
* **🔍 ゲームハンター**: 深いサブフォルダに隠れていても、Yume-chanがあなたのゲームを見つけ出します。
* **🧹 お片付け**: Yume-chanが、醜いタグやバージョン番号を取り除いてタイトルをきれいにします。
* **✨ 特別な輝き**: お気に入りの夢（ゲーム）を美しい金色の輝きでトップにピン留めします。
* **🎨 お着替え**: 気分に合わせて、**Dark**、**Light**、**System** モードを切り替えられます。
* **💡 ガイダンス**: Yume-chanが、最初のゲームの追加方法を正確に教えてくれます！

### 🚀 クイックスタート
1. **ダウンロード**: [Releases] ページから最新バージョンを取得します。
2. **インストール**: `YumeShelf Setup <version>.exe` を実行し、インストーラーの案内に従います。
3. **起動**: デスクトップまたはスタートメニューから YumeShelf を開き、既存のゲームフォルダを選択するか、YumeShelf に作成させます。
4. **楽しむ**: 任意のゲームをダブルクリックして旅を始めましょう。

### 🛠️ 開発者向け
ようこそ！**YumeShelf** に貢献したい方のために、技術的な詳細を説明します。

#### 技術スタック
* **コア**: Electron
* **バックエンド**: Node.js (ファイルシステム, 子プロセス)
* **フロントエンド**: Vanilla JS, HTML5, CSS3 (最高のパフォーマンスを得るためのゼロ・ヘビー・フレームワーク)
* **ストレージ**: インスタントロードのためのローカルJSONベースのキャッシュシステム。

#### プロジェクト構成
```text
YumeShelf/
├── YumeShelf/       # デフォルトのローカルゲームディレクトリ
├── src/             # ソースコード
│   ├── main.js      # メインプロセス (再帰的スキャン, IPC)
│   ├── renderer.js  # UI ロジック, i18n & テーマエンジン
│   ├── preload.js   # セキュア IPC ブリッジ
│   ├── index.html   # アプリのレイアウト
│   └── style.css    # モダンスタイル & テーマ
└── package.json     # スクリプト & 依存関係
```


---

## Tiếng Việt

### ✨ Dành cho người dùng
**YumeShelf** là một launcher chuyên dụng được thiết kế để mang lại trật tự cho các thư mục game của bạn. Không còn phải lục lọi trong các thư mục con lộn xộn hay nhìn những tên file xấu xí nữa. Nó sẽ quét, dọn dẹp và hiển thị game của bạn trên một lưới giao diện đẹp mắt, tối giản.

### 🌟 Tính năng nổi bật
* **🚀 Thiết lập siêu lười**: Chỉ cần click **"Tôi lười quá!"** và Yume-chan sẽ lo mọi thủ tục setup cho bạn.
* **🔍 Thợ săn Game**: Yume-chan sẽ lùng sục và tìm ra game của bạn dù chúng có bị giấu sâu trong các thư mục con.
* **🧹 Dọn dẹp**: Yume-chan ghét sự bừa bộn! Cô ấy sẽ dọn sạch mấy cái tag và số phiên bản xấu xí trên tên game.
* **✨ Hào quang lấp lánh**: Ghim những "giấc mơ" yêu thích của bạn lên đầu trang với hiệu ứng viền vàng rực rỡ.
* **🎨 Lên đồ**: Thay đổi phong cách của Yume-chan bất cứ lúc nào với chế độ **Dark**, **Light**, hoặc **System**.
* **💡 Hướng dẫn tận tình**: Yume-chan sẽ chỉ dẫn bạn chính xác cách để thêm tựa game đầu tiên!

### 🚀 Bắt đầu nhanh
1. **Tải về**: Lấy phiên bản mới nhất từ trang [Releases].
2. **Cài đặt**: Chạy `YumeShelf Setup <version>.exe` và làm theo trình cài đặt.
3. **Khởi chạy**: Mở YumeShelf từ desktop hoặc Start Menu, rồi chọn thư mục game có sẵn của bạn hoặc để YumeShelf tự tạo một cái mới.
4. **Thưởng thức**: Click đúp vào bất kỳ game nào để bắt đầu hành trình.

### 🛠️ Dành cho lập trình viên
Chào mừng! Nếu bạn muốn đóng góp cho **YumeShelf**, dưới đây là tổng quan về kỹ thuật.

#### Tech Stack
* **Core**: Electron
* **Backend**: Node.js (File system, Child processes)
* **Frontend**: Vanilla JS, HTML5, CSS3 (Không sử dụng framework nặng nề để tối đa hóa hiệu suất)
* **Storage**: Hệ thống cache dựa trên JSON cục bộ giúp tải dữ liệu ngay lập tức.

#### Cấu trúc thư mục
```text
YumeShelf/
├── YumeShelf/       # Thư mục chứa game mặc định
├── src/             # Mã nguồn
│   ├── main.js      # Main process (Quét đệ quy, IPC)
│   ├── renderer.js  # UI Logic, i18n & Theme Engine
│   ├── preload.js   # Cầu nối IPC bảo mật
│   ├── index.html   # Layout ứng dụng
│   └── style.css    # Giao diện & Theme
└── package.json     # Scripts & Dependencies
```
