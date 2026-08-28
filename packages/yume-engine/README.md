# @yumeshelf/engine (YumeEngine)

Headless Game Engine Binary Inspector, Save Resolver & Codec Core for YumeShelf.

## Features

- **Fast PE Binary Inspector**: Direct byte-level NT Headers, Section Table, Import Directory thunk tables, and `VS_VERSIONINFO` resource traversal (< 64KB RAM, < 10ms execution).
- **100% F95zone & Japanese Doujin Coverage**: Direct heuristics and declarative rule registry for Unity (Mono / IL2CPP), RPG Maker (2000/2003, XP, VX, VX Ace, MV, MZ, Bakin), Ren'Py, Wolf RPG, Godot, Unreal Engine, Flash/AIR, Java, QSP, RAGS, ADRIFT, TADS, and classic Visual Novel engines (KiriKiri, TyranoBuilder, GameMaker, BGI, CatSystem 2, SystemNNN, Siglus, Majiro, NScripter, etc.).
- **Headless Save Directory Resolvers**: Deterministic and heuristic resolution across local folders, AppData, LocalAppData, Saved Games, Documents, Wine/Proton prefixes, and Linux XDG paths.
- **Headless Save Codecs**: Pure TypeScript decode/encode support for `rpgsave` (LZString), `rvdata2`/`rxdata` (Ruby Marshal), `wolf-sav`, Ren'Py pickle (`.save`/`persistent`), and keyed JSON save formats.
- **Zero-Electron Architecture**: Fully abstract `FileSystemProvider` and `IProcessRunner` interfaces for CLI tools, serverless microservices, and Node.js environments.

## Acknowledgements & Credits

YumeEngine is built upon foundational open-source engineering, research, and heuristics from the community:

- **[Detect-It-Easy](https://github.com/horsicq/Detect-It-Easy) / [XPEViewer](https://github.com/horsicq/XPEViewer)** (`horsicq`) — Binary inspection heuristics, PE structure analysis, and engine signatures.
- **[XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator)** (`bbepis`) — Unity runtime translation architecture and plugin hooking models.
- **[BepInEx](https://github.com/BepInEx/BepInEx)** — Unity and .NET modding and runtime injection framework.

## License

MIT License - Copyright (c) 2026 loerei / YumeShelf Contributors
