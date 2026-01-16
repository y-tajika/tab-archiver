# Development Log

開発者向けドキュメント

---

## バージョン管理

### セマンティックバージョニング (X.Y.Z)

- **パッチ (Z)**: バグ修正、ドキュメント更新
- **マイナー (Y)**: 新機能追加
- **メジャー (X)**: 破壊的変更

### バックアップ

```powershell
$version = "v1.7.0"
Copy-Item -Path . -Destination "../tab-logger_old_version/$version" -Recurse -Force
```

---

## プロジェクト構造

```
tab-logger/
 tab-logger-extension/      # 開発バージョン
 tab-logger_old_version/    # バックアップ
```

---

## 開発フロー

1. バックアップ作成（マイナー/メジャーの場合）
2. コード修正
3. `manifest.json` のバージョン更新
4. `chrome://extensions/` でリロード
5. 動作確認
6. `CHANGELOG.md` 更新

---

## 技術メモ

### Service Worker

- Manifest V3
- DOM API 使用不可
- イベントドリブン

### Bookmarks API

```javascript
chrome.bookmarks.getTree((tree) => { ... })
chrome.bookmarks.create({ parentId, title, url })
```

### Storage

```javascript
chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => { ... })
chrome.storage.local.set({ key: value })
```

---

## デバッグ

`chrome://extensions/`  Service Worker  DevTools

---

## コーディング規約

- 関数: camelCase
- 定数: UPPER_SNAKE_CASE
- ファイル: kebab-case
- エンコーディング: UTF-8

---

## TODO

- [ ] エラーハンドリング改善
- [ ] Promise ネスト解消
- [ ] グローバル変数削減
- [ ] ユニットテスト

---

## 参考

- [Chrome Extensions](https://developer.chrome.com/docs/extensions/)
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Bookmarks API](https://developer.chrome.com/docs/extensions/reference/bookmarks/)
