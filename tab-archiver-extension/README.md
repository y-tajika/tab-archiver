# TabArchiver

開いているタブを日付付きフォルダにまとめてブックマーク保存。

---

## インストール

1. このプロジェクトを任意の場所に保存
2. Chrome/Edgeで `chrome://extensions/` を開く
3. 「開発者モード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」
5. `tab-archiver-extension/src` フォルダを選択

---

## 使い方

### 方法1: 保存前に確認
1. 拡張機能アイコンをクリック
2. タブ一覧で保存対象を確認・編集
3. 保存ボタンまたはEnterキー

### 方法2: ショートカットで即保存
デフォルト: Alt+Shift+S（`chrome://extensions/shortcuts` で変更可）

### 設定
拡張機能を右クリック → オプション
- 日付フォーマット
- タブ要約をフォルダ名に含める
- 保存後にタブを閉じる
- 保存先フォルダ

### AI要約（LLM）
ポップアップの ✨ ボタンで、タブタイトルからAI要約を生成できます。

#### OpenRouter/Gemini 設定
以下のどちらかでAPI設定を行います。

**方法A: オプション画面**
- AI要約の有効化
- プロバイダ選択（OpenRouter / Gemini）
- APIキー

**方法B: 外部設定ファイル（推奨）**
`tab-archiver-extension/src/ai-config.json` を作成します。

例:
{
	"provider": "openrouter",
	"apiKey": "sk-or-v1-..."
}

※ ai-config.json は機密情報のため、必ずGit管理から除外されます。

#### OpenRouterモデル
- 本体では `tngtech/deepseek-r1t-chimera:free` を指定しています。
- OpenRouter側のAllowed Modelsを設定する場合は、ダッシュボードで個別モデルを許可してください。

---

## 開発情報

更新履歴: [CHANGELOG.md](CHANGELOG.md)

---

## ライセンス

個人使用・社内使用自由



