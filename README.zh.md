<div align="center">
  <img src="assets/yumeshelf_icon_highres_4096.png" alt="YumeShelf" width="180" height="180">
  <h1>YumeShelf</h1>
  <p><b>专为个人收藏打造的极简游戏库与启动器。</b></p>

  <p>
    <a href="README.md">English</a> | 
    <a href="README.vi.md">Tiếng Việt</a> | 
    <a href="README.zh.md">简体中文</a> | 
    <a href="README.ja.md">日本語</a>
  </p>
</div>

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

### 鸣谢与致敬 (Acknowledgements & Credits)

YumeShelf 与 **YumeEngine** 核心解析引擎基于社区杰出的开源工程与启发式算法构建：

- **[Detect-It-Easy](https://github.com/horsicq/Detect-It-Easy) / [XPEViewer](https://github.com/horsicq/XPEViewer)** (`horsicq`) — 二进制启发式分析、PE 结构检测与游戏引擎特征码。
- **[XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator)** (`bbepis`) — Unity 运行时动态翻译架构与插件 Hook 模型。
- **[BepInEx](https://github.com/BepInEx/BepInEx)** — Unity 与 .NET 模组开发及运行时注入框架。

### 贡献与反馈

YumeShelf 是一款开源软件并且在持续迭代中。如果您想帮助在不同的 Linux 发行版上进行测试、提交多语言翻译、提出新功能建议或反馈 Bug，欢迎提交 PR 与 Issue。
