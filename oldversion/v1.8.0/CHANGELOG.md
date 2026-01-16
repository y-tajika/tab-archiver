# Changelog

All notable changes to Tab Logger will be documented in this file.

---

## [1.8.0] - 2026-01-15

### Added
- ブックマーク保存先フォルダ選択UI
  - カスタムフォルダを指定可能
  - 「Tab_Logger」以外のフォルダに保存できる
- ショートカットキー設定ページへのリンク
  - chrome://extensions/shortcuts への案内追加

### Changed
- 設定ページのUIを拡充

---

## [1.7.2] - 2026-01-15

### Changed
- ブックマーク保存を並列処理化（Promise.allSettled使用）
- popup.js の未使用変数削除とDOM要素キャッシュ化
- options.js に入力値検証を追加（範囲チェック）

### Improved
- パフォーマンス大幅向上（多数のタブ保存時に約10倍高速化）
- エラー表示の重複防止
- コードの可読性と保守性向上

---

## [1.7.1] - 2026-01-15

### Changed
- ensureTabLoggerFolder() を async/await パターンにリファクタリング（Promiseネスト改善）
- popup.js を IIFE パターンに変更（グローバル変数削減）
- background.js のエラーハンドリング強化（try-catch 追加、ログ統一）

### Improved
- コードの可読性と保守性向上

---

## [1.7.0] - 2026-01-15

### Added
- アイコン追加（16x16, 48x48, 128x128）
- popup.js にUI内エラー表示機能

### Changed
- 拡張機能名を "Tab Logger" に簡潔化
- alert() をUI内エラー表示に変更（UX改善）

---
## [1.6.2] - 2026-01-15

### Removed
- 不要なURLフィルタリング機能を削除（chrome://などのURLも保存可能に）
- 冗長なコンソールログを削除

### Changed
- ドキュメントを簡潔化（README, DEVELOPMENT_LOG）
- コードをクリーンアップ

---
## [1.6.1] - 2026-01-15

### Fixed
- `truncate()` 関数の省略記号()が空文字になっていた問題を修正
- `options.js` のUTF-8エンコーディング修正（文字化け解消）

### Changed
- `generateSummary()` にv1.5.0のアルゴリズムを実装:
  - 3文字以上の単語のみ対象
  - 長さボーナス強化: 6文字以上 +5点、4-5文字 +3点
  - カタカナボーナス: 2文字以上 +2点（固有名詞優先）
  - 出現頻度スコア: x2に変更

---

## [1.6.0] - 2026-01-15

### Added
- ポップアップUIからフォルダ名を手動編集可能に
- 2つの保存方法:
  - 拡張機能アイコンクリック  ポップアップで編集して保存
  - Alt+Shift+S  自動命名で即座に保存
- 新規ファイル: `popup.html` / `popup.css` / `popup.js`

### Changed
- `saveAllTabs(customFolderName = null)` - カスタムフォルダ名対応
- `generateFolderName()` - ポップアップ用API追加
- `chrome.runtime.onMessage` - メッセージハンドラ追加

---

## [1.5.0] - 2026-01-14

### Changed
- 要約アルゴリズム改善設計:
  - 3文字以上の単語を優先抽出
  - 長い単語に高スコア（6文字以上は特に重視）
  - 漢字3文字以上を重視
  - カタカナ技術用語を優先

**注**: 設計のみで実装はv1.6.1で完了

---

## [1.4.1] - 2026-01-14

### Changed
- ショートカットキー変更: Ctrl+Shift+B  Alt+Shift+S
- 拡張機能タイトル更新: "Tab Logger (Alt+Shift+S)"

### Fixed
- Ctrl+Shift+BがChrome予約済みのため競合を回避

---

## [1.4.0] - 2026-01-14

### Changed
- "その他のブックマーク" の動的検索を実装
- IDハードコーディングからツリー検索方式へ変更

### Added
- フォールバック機能追加（ID "2" を使用）

### Technical
- `chrome.bookmarks.getTree()` で全ツリーを取得
- タイトルマッチで "その他のブックマーク" を検索
- 見つからない場合はID "2" にフォールバック

---

## [1.3.0] - 2026-01-14

### Added
- 設定画面（Options Page）追加
- フォルダ名の最大文字数を設定可能（デフォルト: 50文字）
- 新規ファイル: `options.html` / `options.css` / `options.js`

---

## [1.2.0] - 2026-01-14

### Added
- タブタイトルから要約を生成してフォルダ名に使用
- フォーマット: `YYYYMMDD_要約`

### Technical
- 日本語（漢字カタカナ）とアルファベットを抽出
- 出現頻度と文字数でスコアリング
- 上位3単語を使用
- ストップワード: "google", "youtube", "twitter", "facebook" など除外

---

## [1.1.0] - 2026-01-14

### Added
- キーボードショートカット: Ctrl+Shift+B
- `manifest.json` に `commands` セクション追加

---

## [1.0.0] - Initial Release

### Added
- 全タブを一括ブックマーク
- フォルダ名: `YYYYMMDD_HHMMSS`
- "その他のブックマーク" 配下に保存

### Technical
- Manifest V3
- Service Worker
- Chrome Bookmarks API


