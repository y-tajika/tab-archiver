# Tab Logger

Chrome/Edge拡張機能：全タブを一括ブックマーク

**現在のバージョン**: v1.8.0

---

## 機能

- 全タブを一括ブックマーク
- 自動フォルダ名生成：`月-日_要約キーワード`
- フォルダ名の手動編集
- 保存先：「その他のお気に入り > Tab_Logger」
- ショートカット：Alt+Shift+S

---

## インストール

1. このプロジェクトを任意の場所に保存
2. Chrome/Edgeで `chrome://extensions/` を開く
3. 「開発者モード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」
5. `tab-logger-extension/src` フォルダを選択

---

## 使い方

### 方法1: 手動編集
1. 拡張機能アイコンをクリック
2. フォルダ名を編集
3. 保存ボタンまたはEnterキー

### 方法2: 自動保存
Alt+Shift+S で即座に保存

### 設定
拡張機能を右クリック  オプション
- 日付フォーマット
- 要約の最大文字数
- タイトルの最大文字数
- 保存後にタブを閉じる

---

## 技術仕様

- Manifest V3
- Service Worker
- パーミッション: bookmarks, tabs, storage

### ファイル構成

```
tab-logger-extension/
 src/              # Chrome に読み込むフォルダ
    manifest.json
    background.js
    popup.html/css/js
    options.html/css/js
 README.md
 CHANGELOG.md
 DEVELOPMENT_LOG.md
 TODO.md
```

---

## 制限事項

- ページコンテンツは取得しません（タイトルとURLのみ）
- Service Worker環境のため通知機能は利用できません

---

## 開発情報

更新履歴: [CHANGELOG.md](CHANGELOG.md)

---

## ライセンス

個人使用社内使用自由


