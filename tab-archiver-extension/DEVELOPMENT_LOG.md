# Development Log

TabArchiver の開発ドキュメント

> **このドキュメントの目的:**  
> プロジェクトを引き継ぐ開発者が、コードベースの全体像を素早く理解し開発を継続できるようにするための引き継ぎ資料。過去の変更履歴はCHANGELOG.md、将来の実装予定はTODO.mdを参照。

---

## プロジェクト概要

### 目的
Chrome/Edge拡張機能として、全タブを日付と要約付きフォルダ名でブックマーク保存

### バージョン・設定情報
> **注:** バージョン番号とショートカットキーは `src/manifest.json` を参照

**現在のバージョン**: v2.6.0（保存時に保存先フォルダを選択）

### 主要機能
1. 全タブ一括ブックマーク
2. 自動フォルダ名生成（デフォルト形式: `月-日_要約キーワード`）
3. 手動フォルダ名編集（ポップアップUI）
4. キーボードショートカット
5. カスタムブックマークフォルダ選択
6. タブ一覧表示・編集（削除・除外）
7. 保存時に保存先フォルダを一時的に選択（v2.6.0）

---

## プロジェクト構成

```
tab-archiver/
  tab-archiver-extension/    # 現在の開発バージョン
    src/                   # Chromeにロード
       manifest.json
       background.js
       popup.html/css/js
       options.html/css/js
       constants.js        # 共通定数
       icons/
    README.md
    CHANGELOG.md
    DEVELOPMENT_LOG.md
    TODO.md
  oldversion/              # バージョンバックアップ
    v2.6.0/
    v2.5.0/
    v2.4.0/
    v2.3.0/
    v2.2.0/
    v2.1.0/
    v2.0.0/
    v1.8.0/
    ...
```

### ディレクトリ構成ルール

**開発:**
- すべてのファイル → `tab-archiver-extension/` 内
- Chrome にロード → `tab-archiver-extension/src/`

**バックアップ:**
- `tab-archiver-extension/` をまるごと `oldversion/vX.Y.Z/` にコピー
- マイナー/メジャーバージョンアップ時に作成

---

## バージョン管理

### セマンティックバージョニング (X.Y.Z)

- **パッチ (Z):** バグ修正、小改善
- **マイナー (Y):** 新機能追加 → バックアップ作成
- **メジャー (X):** 破壊的変更 → バックアップ作成

### バージョンアップ手順

```powershell
# 1. バックアップ（マイナー/メジャーの場合）
$version = "v2.2.0"
Copy-Item -Path "tab-archiver-extension" -Destination "oldversion\$version" -Recurse

# 2. manifest.json 更新
# 3. CHANGELOG.md にエントリ追加
# 4. TODO.md 更新
# 5. 拡張機能リロード
# 6. 動作確認
```

---

## アーキテクチャ

### Manifest V3 制約
- Service Worker として動作
- ES6 Module 形式（`type: "module"`）

### ファイル役割

**background.js**
- Service Worker
- ブックマーク作成処理
- 要約生成アルゴリズム

**popup.js**
- ポップアップUI制御
- フォルダ名編集
- エラー表示

**options.js**
- 設定画面
- フォルダツリー表示
- 入力値検証

**constants.js**
- 共通定数定義
- DEFAULT_SETTINGS
- STOPWORDS

### API使用状況

- **Chrome Bookmarks API:** `getTree()`, `create()`, `get()`
- **Chrome Tabs API:** `query()`, `remove()`
- **Chrome Storage API:** `get()`, `set()`
- **Chrome Runtime API:** `sendMessage()`, `onMessage`
- **Chrome Commands API:** `onCommand`, `getAll()`

---

## 重要な設計決定

### タブ一覧・編集機能 (v2.4.0)

**設計方針:**  
保存前にタブを確認・編集できる機能を提供

**実装詳細:**
- **データフロー:**
  1. background.js: `generateFolderName()` でタブID、タイトル、URL、ファビコンを取得
  2. popup.js: タブ一覧を動的に生成、ウィンドウごとにグループ化
  3. 除外されたタブIDを `excludedTabIds` セットで管理
  4. 保存時に除外リストを background.js に送信
  5. background.js: `saveAllTabs()` で除外タブをフィルタリング

- **UI設計:**
  - `<details>` 要素で折りたたみ可能（デフォルト展開）
  - position: absolute で削除・除外ボタンを配置（Flexレイアウトからの分離）
  - ホバー時のみボタン表示（opacity: 0 → 1）
  - 色分け: 削除=赤、除外=オレンジ
  - max-height: 400px でスクロール対応

- **技術的課題:**
  - 削除ボタンのサイズ制御: Flexレイアウトとの相性問題 → position: absolute で解決
  - CSS構文エラー発生 → 閉じ括弧欠損を修正

**結果:**  
保存前にタブを精査できるようになり、UXが大幅に向上

---

### フォルダ名生成アルゴリズム

**方針:**  
意味のあるキーワードを抽出してフォルダ名に含める

**実装:**
- 3文字以上の単語対象
- 長さボーナス: 6文字以上 +5点、4-5文字 +3点
- 漢字ボーナス: +1.0点/文字
- カタカナボーナス: 2文字以上 +2点
- 出現頻度でスコア加算
- ストップワード除外（助詞、冠詞、一般的な技術用語）
- 上位3単語使用

**結果:**  
`01-15_GitHub_開発_Chrome` のような意味のあるフォルダ名が生成される

---

### 並列処理化

**実装:**  
Promise.allSettledで並列実行

**理由:**
- Promise.all は1つ失敗すると全て失敗
- Promise.allSettled は個別に成功/失敗を処理（採用）

**結果:**  
約10倍高速化。50タブが1秒以内で完了

---

## デバッグ

### Service Worker ログ確認
1. `chrome://extensions/` を開く
2. 「Service Worker」をクリック
3. DevTools でログ確認

### よくある問題

**Q: ブックマークが保存されない**  
Service Worker が停止していないか確認

**Q: ショートカットキーが動作しない**  
`chrome://extensions/shortcuts` で競合確認

**Q: 設定が保存されない**  
chrome.storage.local のパーミッション確認

---

## 技術仕様

### DEFAULT_SETTINGS
```javascript
{
  language: 'ja',
  dateFormat: 'MM-DD',
  includeTime: false,
  closeTabsAfterSave: false,
  maxTitleLength: 100,
  useFolderSummary: false, // タブ要約をフォルダ名に含める
  folderSummaryMaxChars: 30,
  useCustomFolder: false,
  targetFolderId: null,
  windowSaveMode: 'all-windows' // 'current' | 'all-windows'
}
```

### STOPWORDS
日本語助詞・助動詞、英語冠詞・前置詞、技術用語を網羅的に定義（カテゴリ別整理）

---

## 参考リンク

- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome Bookmarks API](https://developer.chrome.com/docs/extensions/reference/bookmarks/)
