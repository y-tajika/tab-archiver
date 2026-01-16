/**
 * TabArchiver - Options Page Script
 */

import { DEFAULT_SETTINGS } from './constants.js';

/**
 * アプリ名とタイトルを動的に設定
 */
function loadAppTitle() {
  const manifest = chrome.runtime.getManifest();
  const appName = manifest.name;
  document.title = `${appName} 設定`;
  document.getElementById('pageTitle').textContent = `${appName} 設定`;
}

/**
 * ショートカットキーを取得して表示
 */
async function loadShortcutKey() {
  try {
    const commands = await chrome.commands.getAll();
    const bookmarkCommand = commands.find(cmd => cmd.name === 'bookmark_all_tabs');
    const shortcutEl = document.getElementById('currentShortcut');
    
    if (bookmarkCommand && bookmarkCommand.shortcut) {
      shortcutEl.textContent = bookmarkCommand.shortcut;
    } else {
      shortcutEl.textContent = '設定されていません';
    }
  } catch (error) {
    console.error('ショートカットキー取得エラー:', error);
    document.getElementById('currentShortcut').textContent = '取得失敗';
  }
}

/**
 * ブックマークツリーを再帰的に走査してオプション要素を生成
 */
function buildFolderOptions(nodes, depth = 0) {
  let options = [];
  for (const node of nodes) {
    if (node.children !== undefined) {
      const indent = '\u00A0\u00A0'.repeat(depth);
      options.push({ id: node.id, title: indent + (node.title || 'ルート') });
      if (node.children) {
        options = options.concat(buildFolderOptions(node.children, depth + 1));
      }
    }
  }
  return options;
}

/**
 * ブックマークフォルダ一覧を読み込む
 */
async function loadBookmarkFolders() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      const options = buildFolderOptions(tree);
      resolve(options);
    });
  });
}

/**
 * 設定を読み込んでフォームに反映
 */
async function loadSettings() {
  chrome.storage.local.get(DEFAULT_SETTINGS, async (settings) => {
    document.getElementById('dateFormat').value = settings.dateFormat;
    document.getElementById('includeTime').checked = settings.includeTime;
    document.getElementById('maxTitleLength').value = settings.maxTitleLength;
    document.getElementById('folderSummaryMaxChars').value = settings.folderSummaryMaxChars;
    document.getElementById('closeTabsAfterSave').checked = settings.closeTabsAfterSave;
    document.getElementById('useCustomFolder').checked = settings.useCustomFolder;

    // フォルダ一覧を読み込み
    const folders = await loadBookmarkFolders();
    const selectElement = document.getElementById('targetFolder');
    selectElement.innerHTML = '<option value="">選択してください</option>';
    folders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder.id;
      option.textContent = folder.title;
      if (folder.id === settings.targetFolderId) {
        option.selected = true;
      }
      selectElement.appendChild(option);
    });

    // カスタムフォルダ設定の表示切り替え
    toggleFolderSelect(settings.useCustomFolder);
  });
}

/**
 * フォルダ選択UIの表示切り替え
 */
function toggleFolderSelect(show) {
  const folderSelectRow = document.getElementById('folderSelectRow');
  folderSelectRow.style.display = show ? 'block' : 'none';
}

/**
 * フォームの値を保存
 */
function saveSettings() {
  const maxTitleLength = parseInt(document.getElementById('maxTitleLength').value || '100', 10);
  const folderSummaryMaxChars = parseInt(document.getElementById('folderSummaryMaxChars').value || '40', 10);
  const statusElement = document.getElementById('status');

  if (maxTitleLength < 20 || maxTitleLength > 200) {
    statusElement.textContent = 'エラー: タイトルの最大文字数は20～200の範囲で指定してください';
    statusElement.style.color = '#d32f2f';
    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.style.color = '';
    }, 3000);
    return;
  }

  if (folderSummaryMaxChars < 10 || folderSummaryMaxChars > 100) {
    statusElement.textContent = 'エラー: 要約の最大文字数は10～100の範囲で指定してください';
    statusElement.style.color = '#d32f2f';
    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.style.color = '';
    }, 3000);
    return;
  }

  const settings = {
    dateFormat: document.getElementById('dateFormat').value || 'YYYY-MM-DD',
    includeTime: document.getElementById('includeTime').checked,
    maxTitleLength: maxTitleLength,
    folderSummaryMaxChars: folderSummaryMaxChars,
    closeTabsAfterSave: document.getElementById('closeTabsAfterSave').checked,
    useCustomFolder: document.getElementById('useCustomFolder').checked,
    targetFolderId: document.getElementById('targetFolder').value || null
  };

  // カスタムフォルダ使用時にフォルダ未選択の警告
  if (settings.useCustomFolder && !settings.targetFolderId) {
    statusElement.textContent = '警告: カスタムフォルダを使用する場合はフォルダを選択してください';
    statusElement.style.color = '#f57c00';
    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.style.color = '';
    }, 4000);
    return;
  }

  chrome.storage.local.set(settings, () => {
    statusElement.textContent = '保存しました';
    statusElement.style.color = '#2e7d32';
    
    setTimeout(() => {
      statusElement.textContent = '';
      statusElement.style.color = '';
    }, 2000);
  });
}

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', async () => {
  loadAppTitle();
  await loadSettings();
  await loadShortcutKey();
  document.getElementById('save').addEventListener('click', saveSettings);
  
  // カスタムフォルダ使用のチェックボックス
  document.getElementById('useCustomFolder').addEventListener('change', (e) => {
    toggleFolderSelect(e.target.checked);
  });

  // ショートカット設定ページへのリンク
  document.getElementById('shortcutLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
});

