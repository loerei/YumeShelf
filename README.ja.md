<div align="center">
  <img src="assets/yumeshelf_icon_highres_4096.png" alt="YumeShelf" width="180" height="180">
  <h1>YumeShelf</h1>
  <p><b>個人のゲームコレクションを美しく管理するミニマルランチャー。</b></p>

  <p>
    <a href="README.md">English</a> | 
    <a href="README.vi.md">Tiếng Việt</a> | 
    <a href="README.zh.md">简体中文</a> | 
    <a href="README.ja.md">日本語</a>
  </p>
</div>

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

### 謝辞＆クレジット (Acknowledgements & Credits)

YumeShelf および **YumeEngine** コアバイナリ解析エンジンは、以下のオープンソースプロジェクトと解析ヒューリスティクスを活用しています：

- **[Detect-It-Easy](https://github.com/horsicq/Detect-It-Easy) / [XPEViewer](https://github.com/horsicq/XPEViewer)** (`horsicq`) — バイナリ解析ヒューリスティクス、PE 構造解析、ゲームエンジンシグネチャ。
- **[XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator)** (`bbepis`) — Unity リアルタイム翻訳アーキテクチャおよびプラグインフックモデル。
- **[BepInEx](https://github.com/BepInEx/BepInEx)** — Unity および .NET Mod 開発・ランタイムインジェクションフレームワーク。

### コントリビューション

YumeShelf はオープンソースであり、継続的に進化しています。Linux 各ディストリビューションでの動作テスト、翻訳の提供、新機能の提案、バグ報告など、どなたからの PR やフィードバックも大歓迎です。
