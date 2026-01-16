# Development Log

Tab Logger の開発ドキュメント - 引き継ぎ完全版

---

## プロジェクト概要

### 目的
Chrome/Edge拡張機能として、現在開いている全タブを日付と要約付きのフォルダ名でブックマーク保存する。

### 現在のバージョン
**v1.8.0** (2026-01-15)

### 主要機能
1. 全タブ一括ブックマーク
2. 自動フォルダ名生成: `月-日_要約キーワード`
3. 手動フォルダ名編集（ポップアップUI）
4. キーボードショートカット: Alt+Shift+S

---

## プロジェクト構成

```
tab-logger/
  tab-logger-extension/    # 現在の開発バージョン
    src/                   # 拡張機能本体（Chromeにロード）
       manifest.json       # 拡張機能設定 (Manifest V3)
       background.js       # Service Worker
       popup.html/css/js   # ポップアップUI
       options.html/css/js # 設定ページ
       icons/              # アイコン (16/48/128px)
       icon_generator.html # アイコン生成ツール
    README.md              # ユーザー向けドキュメント
    CHANGELOG.md           # 全バージョンの変更履歴
    DEVELOPMENT_LOG.md     # このファイル（開発者向け）
    TODO.md                # 現在のタスク管理
  oldversion/              # バージョンバックアップ
    v1.8.0/
       src/
       README.md
       CHANGELOG.md
       DEVELOPMENT_LOG.md
       TODO.md
```

### ディレクトリ構成の重要なルール

**開発ファイルの配置**
- すべてのファイル → `tab-logger-extension/` 内
- Chrome にロード → `tab-logger-extension/src/`
- バックアップ → `tab-logger-extension/` をまるごと `oldversion/vX.Y.Z/` にコピー

**バックアップ命名規則**
- 形式: `vX.Y.Z` (例: v1.8.0)
- 場所: `oldversion/` (tab-logger直下)
- 内容: tab-logger-extension/ フォルダ全体（src/ + ドキュメント）
- マイナー/メジャーバージョンアップ時に作成

---

## バージョン管理

### セマンティックバージョニング (X.Y.Z)

- **パッチ (Z)**: バグ修正、ドキュメント更新、小さな改善
  - 例: コンソールログの削除、typo修正
  - バックアップ不要
  
- **マイナー (Y)**: 新機能追加、機能改善
  - 例: ポップアップUI追加、アイコン追加
  - **必ずバックアップ作成（マイナーバージョン完了時は必須）**
  
- **メジャー (X)**: 破壊的変更、全面書き直し
  - 例: Manifest V2V3移行
  - **必ずバックアップ作成**

### バージョンアップ手順

```powershell
# 1. バックアップ作成（マイナー/メジャーの場合）
cd C:\Users\ZZ22397\Documents\myscripts\tab-logger
$version = "v1.9.0"
Copy-Item -Path "tab-logger-extension" -Destination "oldversion\$version" -Recurse -Force

# 2. manifest.json のバージョン更新
# "version": "1.8.0" → "1.9.0"

# 3. README.md のバージョン更新
# **現在のバージョン**: v1.7.0 → v1.8.0

# 4. CHANGELOG.md に新エントリ追加
# ## [1.8.0] - YYYY-MM-DD
# ### Added / Changed / Fixed

# 5. TODO.md 更新
# 完了したタスクを [x] に、新しいタスク追加

# 6. 拡張機能リロード (chrome://extensions/)

# 7. 動作確認
```

### 変更時の必須更新ファイル
**すべての変更時:**
1. **TODO.md** - タスク状況
2. **DEVELOPMENT_LOG.md** - 現在の状況セクション

**バージョン変更時:**
1. **manifest.json** - version フィールド
2. **README.md** - 現在のバージョン
3. **CHANGELOG.md** - 変更内容
4. **DEVELOPMENT_LOG.md** - 現在の状況 + 過去の主要な変更（必要なら）

---

## アーキテクチャ

### Manifest V3 制約
- Service Worker として動作（background.js）
- DOM API 使用不可
- イベントドリブン設計
- 長時間実行タスク非推奨

### ファイル役割

**background.js** (286行)
- Service Worker（常駐）
- ブックマーク作成処理
- 要約生成アルゴリズム
- メッセージハンドラ（popup/optionsとの通信）

**popup.js** (75行)
- ポップアップUI制御
- フォルダ名編集
- エラー表示（UI内）

**options.js** (49行)
- 設定画面
- chrome.storage.local との同期

### API使用状況

**Chrome Bookmarks API**
```javascript
chrome.bookmarks.getTree()      // ツリー取得
chrome.bookmarks.create()       // フォルダ/ブックマーク作成
```

**Chrome Tabs API**
```javascript
chrome.tabs.query({ currentWindow: true })  // タブ一覧
```

**Chrome Storage API**
```javascript
chrome.storage.local.get()      // 設定取得
chrome.storage.local.set()      // 設定保存
```

**Chrome Runtime API**
```javascript
chrome.runtime.sendMessage()    // popup  background 通信
chrome.runtime.onMessage        // メッセージ受信
```

---

## 重要な設計決定

### 1. フォルダ名生成アルゴリズム (v1.5.0/v1.6.1)

**方針**: 意味のあるキーワードを抽出

**実装**:
- 3文字以上の単語のみ対象
- 長さボーナス: 6文字以上 +5点、4-5文字 +3点
- カタカナボーナス: 2文字以上 +2点（固有名詞優先）
- 出現頻度: x2
- 上位3単語を使用

**正規表現**: `/[\u4E00-\u9FFF\u30A0-\u30FFa-zA-Z0-9]{3,}/g`

### 2. URLフィルタリング廃止 (v1.6.2)

**以前**: `chrome://`, `edge://` などを除外
**現在**: 全URLを保存可能
**理由**: Chrome Bookmarks APIは特殊URLも保存可能

### 3. エラーハンドリング (v1.7.0)

**popup.js**: `alert()`  `showError()` (UI内表示)
- 5秒後自動消去
- 赤背景のエラーメッセージ

### 4. ショートカットキー変更 (v1.4.1)

**変更**: Ctrl+Shift+B  Alt+Shift+S
**理由**: Ctrl+Shift+B はChrome予約済み

### 5. ブックマークフォルダ検索 (v1.4.0)

**方式**: 動的ツリー検索 + フォールバック
1. `chrome.bookmarks.getTree()` で全ツリー取得
2. タイトル "その他のブックマーク" を検索
3. 見つからない場合 ID "2" を使用

---

## コーディング規約

### 命名規則
- **関数**: camelCase (`generateSummary`, `saveAllTabs`)
- **定数**: UPPER_SNAKE_CASE (`DEFAULT_SETTINGS`, `STOPWORDS`)
- **ファイル**: kebab-case (`popup.js`, `icon-generator.html`)

### ファイルエンコーディング
- **必須**: UTF-8
- **PowerShell編集時**: `-Encoding UTF8` 必須指定
- **問題**: エンコーディング指定なしで文字化けした過去あり

### コメント規則
- 冗長なコメント禁止
- 「なぜ」を書く、「何を」は書かない
- 不要な仕様削除の理由は書かない（履歴に残す）

### エラーハンドリング
- ユーザー向け: UI内エラー表示（showError）
- デバッグ用: console.error のみ
- 冗長なログ禁止

---

## 開発フロー

### 通常の修正
1. コード修正
2. `chrome://extensions/` でリロード
3. 動作確認
4. パッチバージョン +1
5. TODO.md 更新
6. **DEVELOPMENT_LOG.md 更新（現在の状況セクション）**

### 機能追加（マイナーバージョンアップ）
1. コード修正
2. manifest.json, README.md 更新
3. CHANGELOG.md にエントリ追加
4. TODO.md 更新
5. 動作確認
6. **DEVELOPMENT_LOG.md 更新（現在の状況 + 設計決定の追加）**
7. **バックアップ作成（完了後必須）**

---

## デバッグ

### Service Worker ログ確認
1. `chrome://extensions/` を開く
2. 「Service Worker」をクリック
3. DevTools でログ確認

### よくある問題

**Q: ブックマークが保存されない**
- Service Worker が停止していないか確認
- DevTools で `chrome.runtime.lastError` 確認

**Q: ショートカットキーが動作しない**
- `chrome://extensions/shortcuts` で競合確認
- Alt+Shift+S が他の拡張機能と競合していないか

**Q: 設定が保存されない**
- `chrome.storage.local` のパーミッション確認
- DevTools  Application  Storage  Extension Storage

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
  folderSummaryMaxChars: 30
}
```

### STOPWORDS
日本語助詞、英語冠詞、サイト名（google, youtube等）を除外

---

## 未解決の技術的負債

### 優先度: 低
- なし（v1.7.1 でリファクタリング完了）

### 優先度: なし
- DEFAULT_SETTINGS の重複（background.js と options.js）
   Service Worker の制約上、共通モジュール化困難

---

## 現在の状況 (v1.8.0)

### 実装状況
- **バージョン**: 1.8.0
- **最終更新**: 2026-01-15
- **状態**: ✅ 完了（新機能追加完了・動作確認済み）

### 完了したタスク
1. ✅ ブックマーク保存先フォルダ選択UI実装
   - options.html にカスタムフォルダ設定追加
   - options.js でブックマークツリー取得・表示
   - background.js でカスタムフォルダ使用に対応
   - useCustomFolder, targetFolderId を DEFAULT_SETTINGS に追加
2. ✅ ショートカットキー設定ページへのリンク追加
   - chrome://extensions/shortcuts への案内を追加
   - API制約により動的変更は不可のため、ガイド方式
3. ✅ manifest.json のバージョン更新（1.8.0）
4. ✅ README.md のバージョン更新
5. ✅ CHANGELOG.md に v1.8.0 エントリ追加
6. ✅ TODO.md 更新
7. ✅ DEVELOPMENT_LOG.md 更新
8. ✅ 動作確認

### 次のステップ
1. ✅ バックアップ作成完了（backups/v1.8.0/）
2. 次期バージョンの検討

### ファイル状態
```
src/
├── manifest.json          ✅ v1.8.0
├── background.js          ✅ v1.8.0 (カスタムフォルダ対応)
├── popup.js              ✅ v1.7.2 から継承
├── options.js            ✅ v1.8.0 (フォルダ選択UI実装)
├── options.html          ✅ v1.8.0 (UI拡充)
├── icon_generator.html   ✅ v1.7.0 から継承
└── icons/
    ├── icon16.png        ✅ v1.7.0 から継承
    ├── icon48.png        ✅ v1.7.0 から継承
    └── icon128.png       ✅ v1.7.0 から継承
```

---

## 過去の主要な変更

### v1.8.0 (2026-01-15) - マイナーバージョン
- ブックマーク保存先フォルダ選択UI追加
- ショートカットキー設定ページへのリンク追加
- カスタムフォルダ使用機能

### v1.7.2 (2026-01-15) - パッチ
- コードレビュー改善対応
- 並列処理化（パフォーマンス向上）
- コード整理と入力値検証

### v1.7.1 (2026-01-15) - パッチ
- コードリファクタリング（可読性・保守性向上）
- async/await パターン導入
- IIFE パターン導入
- エラーハンドリング強化

### v1.7.0 (2026-01-15) - マイナーバージョン
- アイコン追加
- 拡張機能名簡潔化
- エラーハンドリング改善

### v1.6.2 (2026-01-15) - パッチ
- URLフィルタリング削除
- コンソールログ簡潔化
- ドキュメント簡潔化

### v1.6.0 (2026-01-15) - マイナーバージョン
- ポップアップUI追加
- 手動フォルダ名編集機能

### v1.5.0 (2026-01-14) - マイナーバージョン
- 要約アルゴリズム改善（設計のみ、実装は v1.6.1）

### v1.4.1 (2026-01-14) - パッチ
- ショートカットキー変更（Alt+Shift+S）

---

## 参考リンク

- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome Bookmarks API](https://developer.chrome.com/docs/extensions/reference/bookmarks/)

---

**最終更新**: 2026-01-15 (v1.8.0)
**次回更新時**: 毎回の変更時（コード修正、バージョン変更、タスク進捗など）
