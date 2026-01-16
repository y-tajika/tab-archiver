# Development Log

Tab Logger の開発ドキュメント

---

## このドキュメントについて

### 目的
このドキュメントは、プロジェクトを引き継ぐ開発者（または未来の自分）が、コードベースの全体像を素早く理解し、開発を継続できるようにするための引き継ぎ資料です。

### 対象読者
- プロジェクトを引き継ぐ開発者
- 長期間ブランクがあった後に開発を再開する開発者
- コードレビューや監査を行う技術者

### このドキュメントに記載すること
- プロジェクトの概要と目的
- 現在のバージョン状況
- 直近のコードレビュー結果（品質評価）
- アーキテクチャと設計決定の理由
- 開発フロー・バージョン管理手順
- よくある問題とデバッグ方法
- 技術的な制約事項

### このドキュメントに記載しないこと
- 過去バージョンの詳細な変更履歴（CHANGELOG.md参照）
- 将来の実装予定（TODO.md参照）
- ユーザー向けの使い方（README.md参照）

---

## プロジェクト概要

### 目的
Chrome/Edge拡張機能として、全タブを日付と要約付きフォルダ名でブックマーク保存

### バージョン・設定情報
> **注:** バージョン番号とショートカットキーは `src/manifest.json` を参照

**現在のバージョン**: v2.1.0（コード品質改善完了）

### 主要機能
1. 全タブ一括ブックマーク
2. 自動フォルダ名生成（デフォルト形式: `月-日_要約キーワード`）
3. 手動フォルダ名編集（ポップアップUI）
4. キーボードショートカット
5. カスタムブックマークフォルダ選択

---

## 直近のコードレビュー

> **注:** レビュー日時・評価は最新の実施時点のもの。継続的に更新推奨。

### レビュー対象ファイル
- background.js - Service Worker、ブックマーク操作
- options.js - 設定ページ、フォルダツリー
- popup.js - ポップアップUI制御

### 総合評価: 8.5/10

**コード品質:** 高品質。async/await、Promise.allSettled、IIFE パターンなど現代的な実装。  
**エラーハンドリング:** 充実。try-catch、chrome.runtime.lastError を適切に処理。  
**パフォーマンス:** 並列処理で10倍高速化達成。  
**保守性:** 各ファイルの責務が明確。コメント充実。  
**問題点:** マイナーな検証不足が2箇所（TODO.md参照）

### 詳細評価

#### background.js - 8/10
**強み:**  
非同期処理統一、Promise.allSettled並列実行、優れた要約アルゴリズム、適切なエラーハンドリング

**改善点:**  
カスタムフォルダID存在確認不足（優先度:低）

#### options.js - 8.5/10
**強み:**  
再帰的ツリー走査、入力値検証、UIトグル制御

**改善点:**  
targetFolderId未設定時の警告不足（優先度:低）

#### popup.js - 9/10
**強み:**  
IIFEパターン、DOMキャッシング、エラー重複防止

**改善点:**  
ほぼ完璧

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
       icons/
       icon_generator.html
    README.md
    CHANGELOG.md
    DEVELOPMENT_LOG.md
    TODO.md
  oldversion/              # バージョンバックアップ
    v1.8.0/
    v1.7.2/
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
$version = "v1.9.0"
Copy-Item -Path "tab-archiver-extension" -Destination "oldversion\$version" -Recurse

# 2. manifest.json 更新
# 3. README.md 更新
# 4. CHANGELOG.md にエントリ追加
# 5. TODO.md 更新
# 6. 拡張機能リロード
# 7. 動作確認
```

---

## アーキテクチャ

### Manifest V3 制約
- Service Worker として動作
- イベントドリブン設計

### ファイル役割

**background.js**
- Service Worker
- ブックマーク作成処理
- 要約生成アルゴリズム

**popup.js**
- ポップアップUI制御
- フォルダ名編集

**options.js**
- 設定画面
- フォルダツリー表示

### API使用状況

- **Chrome Bookmarks API:** `getTree()`, `create()`
- **Chrome Tabs API:** `query()`
- **Chrome Storage API:** `get()`, `set()`
- **Chrome Runtime API:** `sendMessage()`, `onMessage`

---

## 重要な設計決定

### フォルダ名生成アルゴリズム

**背景:**  
v1.5.0以前は単純な日付時刻のみ。しかし「あのタブセットはどこ？」と探すのが困難だった。

**方針:**  
意味のあるキーワードを抽出してフォルダ名に含める

**実装:**
- 3文字以上の単語対象（短すぎる単語は意味が薄い）
- 長さボーナス: 6文字以上 +5点、4-5文字 +3点（長い単語ほど具体的）
- カタカナボーナス: 2文字以上 +2点（技術用語や固有名詞を優先）
- 出現頻度: x2（複数タブで共通のトピックを重視）
- 上位3単語使用（多すぎると長くなる）

**結果:**  
`01-15_GitHub_開発_Chrome` のような意味のあるフォルダ名が生成される

---

### ポップアップUIの追加 (v1.6.0)

**背景:**  
自動生成されたフォルダ名が気に入らない場合、ブックマークマネージャーで手動変更する必要があった。

**決定:**  
拡張機能アイコンクリック時にポップアップを表示し、保存前に編集可能にする

**実装選択肢:**
1. options.htmlで編集 → 手順が多い
2. popup.htmlで編集 → ワンステップで完結（採用）

**結果:**  
2つの使い方が可能に（手動編集 / ショートカット自動保存）

---

### 並列処理化 (v1.7.2)

**背景:**  
50タブ以上開いている場合、保存に10秒以上かかる問題が発生

**原因:**  
ブックマーク作成を for...of で順次実行していた

**決定:**  
Promise.allSettledで並列実行に変更

**実装選択肢:**
1. Promise.all → 1つ失敗すると全て失敗
2. Promise.allSettled → 個別に成功/失敗を処理（採用）

**結果:**  
約10倍高速化。50タブが1秒以内で完了

---

### エラーハンドリング

**背景:**  
v1.7.0以前はalert()でエラー表示。ブラウザ全体をブロックする

**決定:**  
popup.html内にエラー表示領域を設け、5秒自動消去

**理由:**  
- ノンブロッキング（ユーザー操作を妨げない）
- 自動消去で再操作不要

**background.js:**  
console.errorのみ。ユーザーには見せない

---

### ショートカットキー

**変更履歴:**  
v1.4.1で Ctrl+Shift+B → Alt+Shift+S に変更

**理由:**  
Ctrl+Shift+BはChromeでブックマークマネージャーを開く予約済みキー

**決定:**  
Alt+Shift+Sを採用（他の拡張機能との競合も少ない）

**カスタマイズ:**  
ユーザーは `chrome://extensions/shortcuts` で任意のキーに変更可能

---

### ブックマークフォルダ検索

**背景:**  
"その他のブックマーク"のIDをハードコーディング（"2"）していた

**問題:**  
ブラウザ設定や言語環境でIDが変わる可能性

**決定:**  
動的ツリー検索を実装

**実装:**
1. `chrome.bookmarks.getTree()` で全ツリー取得
2. タイトル "その他のブックマーク" を検索
3. 見つからない場合 ID "2" をフォールバック

**結果:**  
異なる環境でも動作する柔軟性を確保

---

### カスタムフォルダ選択 (v1.8.0)

**背景:**  
"その他のブックマーク > Tab_Logger" 固定では、既存の分類体系に合わない

**決定:**  
options.htmlでブックマークツリーを表示し、任意のフォルダを選択可能に

**実装:**
- buildFolderOptions()で再帰的にツリー走査
- インデント表示で階層構造を可視化
- useCustomFolder フラグで機能ON/OFF

**結果:**  
既存のブックマーク構造に柔軟に統合可能

---

## コーディング規約

### 命名規則
- 関数: camelCase
- 定数: UPPER_SNAKE_CASE
- ファイル: kebab-case

### エンコーディング
UTF-8 必須

### エラーハンドリング
- ユーザー向け: UI内エラー表示
- デバッグ用: console.error のみ

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

## 技術メモ

### DEFAULT_SETTINGS
```javascript
{
  language: 'ja',
  dateFormat: 'MM-DD',
  includeTime: false,
  closeTabsAfterSave: false,
  maxTitleLength: 100,
  folderSummaryMaxChars: 30,
  useCustomFolder: false,
  targetFolderId: null
}
```

### STOPWORDS
日本語助詞、英語冠詞、サイト名（google, youtube等）除外

---

## 現在の状況

### 実装状況
- **状態**: ✅ 完了・動作確認済み

### v1.8.0に至った経緯

**v1.7.0 (アイコン追加・UI改善)**
- ユーザビリティ向上のためアイコン追加
- エラー表示をalert()からUI内表示に変更（UX改善）

**v1.7.1 (リファクタリング)**
- コードレビューによる品質改善
- async/awaitパターン統一、IIFEパターン導入
- 保守性向上が目的

**v1.7.2 (パフォーマンス改善)**
- タブ数が多い場合の保存速度が遅い問題に対応
- Promise.allSettledで並列処理化（約10倍高速化達成）
- 実用上の問題を解決

**v1.8.0 (カスタムフォルダ選択)**
- ユーザーから保存先を変更したいという要望
- ブックマークツリーから任意のフォルダを選択可能に
- 柔軟性向上

### 完了タスク
1. ✅ ブックマーク保存先フォルダ選択UI実装
2. ✅ ショートカットキー設定ページリンク追加
3. ✅ manifest.json 更新（1.8.0）
4. ✅ ドキュメント更新
5. ✅ 動作確認
6. ✅ バックアップ作成（oldversion/v1.8.0/）

### ファイル状態
```
src/
├── manifest.json          ✅ 最新
├── background.js          ✅ 最新 (カスタムフォルダ対応)
├── popup.js              ✅ 最新
├── options.js            ✅ 最新 (フォルダ選択UI)
├── options.html          ✅ 最新
└── icons/                ✅ 最新
```

> **注:** 各ファイルのバージョン履歴は CHANGELOG.md を参照

### 既知の問題・未解決課題

**優先度: 低**
1. カスタムフォルダID存在チェック不足
   - 削除されたフォルダIDが設定されている場合のフォールバック処理なし
   - 影響: 稀なケースのためユーザー影響は小さい
   
2. targetFolderId未設定時の警告なし
   - useCustomFolder=trueだがフォルダ未選択の矛盾状態を警告しない
   - 影響: UIフローでは発生しにくい

**優先度: なし（仕様として許容）**
- DEFAULT_SETTINGS の重複（background.js と options.js）
  - Service Worker制約により共通モジュール化は困難
  - 現状維持で問題なし

---

## 参考リンク

- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome Bookmarks API](https://developer.chrome.com/docs/extensions/reference/bookmarks/)

---

**最終更新**: 2026-01-15 (v1.8.0)
