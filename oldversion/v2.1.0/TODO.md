# TODO

## このドキュメントについて

### 目的
このドキュメントは、プロジェクトの現在の状態と今後の方向性を明確にするための引き継ぎ資料です。直近のコードレビュー結果と、次に実装すべき機能の優先順位を記載します。

### 対象読者
- プロジェクトを引き継ぐ開発者
- 次のバージョンで何を実装すべきか判断する開発者

### このドキュメントに記載すること
- 現在のバージョンの状態（完了/作業中）
- 直近のコードレビュー結果と評価
- 次期バージョン候補（優先度付き）
- 実装しないと判断した項目とその理由

### このドキュメントに記載しないこと
- 実装済み機能の詳細（DEVELOPMENT_LOG.md参照）
- 過去の変更履歴（CHANGELOG.md参照）

---

## 現在の状況

> **注:** バージョン番号・ショートカットキーなどの設定は `src/manifest.json` を参照

**状態**: v2.1.0 リリース済み（コード品質改善）

---

## 直近のコードレビュー結果 (2026-01-15)

### 総合評価: 6.5/10
**実用レベルには達しているが、複数の重大な問題とコード品質の課題あり**

---

### 🔴 重大な問題（優先度: 高）

#### 1. カスタムフォルダID検証の完全欠如（background.js）
**場所**: `ensureTabLoggerFolder()`  
**問題**:
- `settings.targetFolderId` が存在するかの検証が全くない
- 削除済みフォルダIDの場合、chrome.bookmarks.create()が失敗してアプリ全体が停止
- 存在しないIDでもチェックせずにそのまま使用

**影響**: ユーザーが設定を変更してフォルダを削除すると、アプリが完全に動作不能になる

**修正案**:
```javascript
if (settings.useCustomFolder && settings.targetFolderId) {
  try {
    await chrome.bookmarks.get(settings.targetFolderId);
    return settings.targetFolderId;
  } catch (error) {
    console.warn(`カスタムフォルダ ${settings.targetFolderId} が見つかりません。デフォルトに戻します`);
    // フォールバック処理を継続
  }
}
```

#### 2. 「その他のブックマーク」検索のハードコードされたフォールバックID（background.js）
**場所**: `ensureTabLoggerFolder()`  
**問題**:
- フォールバックID "2" はChrome固有の実装に依存
- Edge、Brave、他のChromiumブラウザで異なる可能性が高い
- ブックマークバーやルートノードを誤って使用するリスク

**影響**: 他のブラウザで動作不良の可能性

**修正案**:
```javascript
if (!otherBookmarksId) {
  // ルートノードの最初のフォルダをフォールバック
  const root = tree[0];
  if (root && root.children && root.children.length > 0) {
    otherBookmarksId = root.children[1]?.id || root.children[0].id;
  } else {
    throw new Error('ブックマークフォルダが見つかりません');
  }
}
```

#### 3. エラーハンドリングの不完全性（background.js）
**場所**: `saveAllTabs()`  
**問題**:
- `Promise.allSettled()` で失敗したブックマークを記録するだけで、ユーザーに通知しない
- 全てのブックマークが失敗してもUIに何も表示されない
- `ensureTabLoggerFolder()` で例外が起きたら処理全体が停止するが、ユーザーには何も伝わらない

**影響**: ユーザーが保存失敗に気づかない

**修正案**:
- 失敗したURLをリスト化してログ出力
- ポップアップにエラー詳細を返す
- 最低限の成功率（例: 50%）を満たさない場合はロールバック検討

---

### 🟡 中程度の問題（優先度: 中）

#### 4. ストップワードの不適切な実装（background.js）
**問題**:
- Set の使用は良いが、内容が不完全
- 日本語助詞・助動詞の漏れが多い（「でも」「けど」「だけ」など）
- 英語の冠詞や前置詞が不足（'a', 'an', 'it', 'that', 'this'など）
- 「powered」「box」などドメイン固有の単語をハードコーディング（保守性低下）

**修正案**:
- より包括的なストップワードリストを外部ファイル化
- カテゴリ別に分類（助詞、助動詞、接続詞、ドメイン単語など）

#### 5. 要約アルゴリズムの脆弱性（background.js）
**問題**:
- URLからドメイン名を除去する正規表現が不完全 (`/https?:\/\/[^\s]+/g`)
  - クエリパラメータや特殊文字を含むURLで動作不良の可能性
- タイトルから `.com` などを削除する処理が単純すぎる
  - "welcome.com" のような正当な単語も削除される
- 同じ単語の繰り返しをカウントするが、最終的にトップ3しか使わない（非効率）

**修正案**:
- URLパース用に `new URL()` を使用して正確にドメイン抽出
- 単語境界を考慮した正規表現を使用 (`\b(com|net)\b` は良いが、前後の文脈チェックが必要)

#### 6. 入力値検証の不一致（options.js）
**問題**:
- `maxTitleLength` は 20～200 の範囲チェックあり
- `folderSummaryMaxChars` は 10～100 の範囲チェックあり
- **しかし、manifest.jsonのデフォルト値（30, 100）がハードコーディングされている**
- background.jsの DEFAULT_SETTINGS と options.js の DEFAULT_SETTINGS が重複定義

**修正案**:
- デフォルト値を共通の設定ファイル（constants.js）に移動
- または manifest.json から動的に読み込む

#### 7. UI/UXの問題（popup.js）
**問題**:
- エラーメッセージが5秒で自動削除されるが、ユーザーが読む時間が不足する可能性
- フォルダ名入力欄の placeholder が実際の生成値と同じため、視覚的な区別がつかない
- キャンセルボタンの動作がwindow.close()だけで、保存失敗時の状態復元がない

---

### 🟢 軽微な問題（優先度: 低）

#### 8. 定数の重複定義
**場所**: background.js, options.js  
**問題**: `DEFAULT_SETTINGS` が両方のファイルで定義されている

**修正案**: 共通ファイル（constants.js）に移動

#### 9. 不適切なコメント（background.js）
**場所**: 冒頭  
**問題**: `Tab Logger` と記載されているが、プロジェクト名は `TabArchiver` に変更済み

**修正案**: コメントを `TabArchiver` に統一

#### 10. 非同期処理の戻り値型が不統一（background.js）
**問題**:
- `saveAllTabs()` は `{success, count, total}` または `{success, message}` を返す
- `generateFolderName()` は `{folderName, tabCount}` を返す
- 成功時と失敗時で構造が異なる

**修正案**: 統一されたレスポンス型を定義
```javascript
{
  success: boolean,
  data?: any,
  error?: string
}
```

---

### 各ファイル再評価

#### background.js - 5/10 → 重大な問題あり
**強み**:
- Promise.allSettled による並列処理は適切
- 要約アルゴリズムの基本コンセプトは良い

**致命的な問題**:
- カスタムフォルダID検証なし（クラッシュリスク）
- ハードコードされたフォールバックID "2"（移植性ゼロ）
- エラー時のユーザー通知なし
- コメントとコードの不一致（Tab Logger vs TabArchiver）

#### options.js - 6.5/10 → 中程度の問題あり
**強み**:
- 再帰的ツリー走査は正しく実装されている
- 入力値検証は存在する

**問題**:
- DEFAULT_SETTINGS が重複定義
- カスタムフォルダ使用時にフォルダ未選択の警告がない
- chrome.bookmarks.getTree() のエラーハンドリングなし

#### popup.js - 7.5/10 → 比較的良好
**強み**:
- IIFE パターンで名前空間汚染を回避
- DOM要素のキャッシング

**問題**:
- エラーメッセージの表示時間が短すぎる
- コマンド取得時のエラーハンドリングが不十分

---

## 改善候補

### パッチ更新候補 - 優先度: 🔴 最高（即座に対応推奨）
**バグ修正とセキュリティ**

#### 必須修正項目

- [ ] **カスタムフォルダID存在チェック追加**
  - ファイル: `src/background.js` - `ensureTabLoggerFolder()`
  - 実装: `chrome.bookmarks.get(targetFolderId)` でID検証
  - エラー時: デフォルトフォルダにフォールバック + コンソール警告
  - 工数: 中（2時間）
  - **影響度**: アプリクラッシュ防止

- [ ] **ハードコードID "2" を削除**
  - ファイル: `src/background.js` - `ensureTabLoggerFolder()`
  - 実装: ブックマークツリーのルートノードから適切な親フォルダを動的に検出
  - 工数: 中（2-3時間）
  - **影響度**: 他のChromiumブラウザでの動作保証

- [ ] **エラー時のユーザー通知実装**
  - ファイル: `src/background.js` - `saveAllTabs()`
  - 実装: 失敗したブックマークのURLリストを返す + popup.js で表示
  - 工数: 小～中（1-2時間）
  - **影響度**: UX向上、ユーザーが問題を認識可能

- [ ] **コメントの統一**
  - ファイル: `src/background.js`, `src/options.js`, `src/popup.js`
  - 実装: "Tab Logger" → "TabArchiver" に変更
  - 工数: 極小（10分）
  - **影響度**: ドキュメント整合性

---

### コード品質改善候補 - 優先度: 🟡 中
**リファクタリングと最適化**

- [ ] **DEFAULT_SETTINGS を共通化**
  - ファイル: 新規 `src/constants.js` を作成
  - 移行: background.js, options.js の定義を統合
  - 工数: 小（1時間）

- [ ] **ストップワード改善**
  - ファイル: `src/background.js` または新規 `src/stopwords.js`
  - 実装:
    - 日本語助詞・助動詞を網羅的に追加
    - 英語の冠詞・前置詞を追加
    - カテゴリ別に分類（コメント付き）
  - 工数: 小（1-2時間）

- [ ] **要約アルゴリズムのURL処理改善**
  - ファイル: `src/background.js` - `buildFolderSummary()`
  - 実装:
    - `new URL()` を使用して正確にドメイン抽出
    - try-catch でURL解析失敗に対応
  - 工数: 小（1時間）

- [ ] **入力値検証にフォルダ未選択警告追加**
  - ファイル: `src/options.js` - `saveSettings()`
  - 実装: `useCustomFolder && !targetFolderId` の場合に警告表示
  - 工数: 極小（30分）

---

### 追加機能候補 - 優先度: 🟢 低

#### タブフィルタリング

- [ ] **除外ドメイン設定**
  - 実装: `src/options.js` に除外ドメインリスト追加（配列管理）
  - UI: 入力欄 + 削除ボタン付きリスト表示
  - ファイル: `src/background.js` の `saveAllTabs()` でドメインチェック追加
  - 工数: 中（3-4時間）

- [ ] **ピン留めタブ除外オプション**
  - 実装: settings に `excludePinnedTabs` 追加
  - ファイル: `src/background.js` の `tabs.query()` で pinned プロパティをフィルタ
  - 工数: 小（1時間）

#### フォルダ名テンプレート

- [ ] **カスタムフォルダ名形式**
  - 実装: プレースホルダー置換システム
  - 対応変数: `{date}`, `{time}`, `{summary}`, `{count}`
  - UI: `src/options.js` にテンプレート入力欄 + プレビュー表示
  - 例: `[{date}] {summary} ({count}タブ)` → `[MM-DD] GitHub_開発 (8タブ)`
  - 工数: 大（6-8時間）
  - 技術的考慮: 不正な形式の検証、デフォルトへのフォールバック

#### 保存履歴

**背景:** 過去に保存したフォルダを再度開きたいケースがある

- [ ] 最近保存したフォルダ表示
  - ファイル: src/popup.html
  - 実装: chrome.storage.local に履歴保存（最大10件、FIFO）
  - UI: popup.htmlに履歴セクション追加
  - クリック: chrome.bookmarks.get() → 新しいタブで開く
  - 工数: 中（4-5時間）
  - 技術的考慮: フォルダ削除時のエラーハンドリング

#### タブグループ対応

**背景:** Chrome 88+でタブグループ機能が追加された

- [ ] グループごとにサブフォルダ作成
  - 実装: chrome.tabGroups API 使用
  - グループ情報取得 → グループ名でサブフォルダ作成
  - 工数: 大（8-10時間）
  - 技術的考慮: 
    - グループ未対応ブラウザ（Edge古いバージョン）の互換性
    - グループ化されていないタブの扱い（ルートに配置 or "未分類"フォルダ）
    - src/manifest.json に tabGroups パーミッション追加必要

**判断:** 現状で十分なら実装不要。ユーザーからの要望次第で判断。

---

## 実装しない項目

### テスト
- 単体テストの追加
  - 理由: 小規模プロジェクト、手動テストで十分
  - 再検討時期: 機能が10個以上になった場合

### リファクタリング
- DEFAULT_SETTINGS の共通モジュール化
  - 理由: Manifest V3 の Service Worker 制約で困難
  - 現状: background.js と options.js で重複（許容）
  - 代替策なし

---

**最終更新**: 2026-01-15
