<div align="center">
  <h1>🌸 YumeShelf</h1>
  <p><b>Your dreams, organized. A minimalist, modern, and light-speed game library for your personal collection.</b></p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Electron](https://img.shields.io/badge/Framework-Electron-blue)](https://www.electronjs.org/)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/your-username/YumeShelf/pulls)

  English | [Tiếng Việt] | [日本語] | [简体中文]
</div>

---

## ✨ For Users

**YumeShelf** is a dedicated launcher designed to bring order to your game folders. No more digging through messy sub-directories or looking at ugly file names. It scans, cleans, and presents your games in a beautiful, minimalist grid.

## 🌟 Features
- **🚀 Effortless Setup**: Just click **"I'm lazy!"** and Yume-chan handles the setup for you.
- **🔍 Game Hunter**: Yume-chan finds your games even when they're buried deep in sub-folders.
- **🧹 Tidying Up**: Yume-chan cleans up messy titles by removing ugly tags and version numbers.
- **✨ Special Glow**: Pin your favorite dreams to the top with a beautiful golden glow.
- **🎨 Dress Up**: Switch between **Dark**, **Light**, and **System** modes to suit your mood.
- **💡 Guidance**: Yume-chan guides you exactly on how to add your first game!

### 🚀 Quick Start
1. **Download**: Grab the latest version from the [Releases] page.
2. **Launch**: Run `YumeShelf.exe`.
3. **Setup**: Choose your existing game folder or let YumeShelf create one for you.
4. **Enjoy**: Double-click any game to start your journey.

---

## 🛠️ For Developers

Welcome! If you want to contribute to **YumeShelf**, here is the technical breakdown.

### Tech Stack
- **Core**: Electron
- **Backend**: Node.js (File system, Child processes)
- **Frontend**: Vanilla JS, HTML5, CSS3 (Zero heavy frameworks for maximum performance)
- **Storage**: Local JSON-based caching system for instant loading.

### Project Structure
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