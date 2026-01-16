/**
 * TabArchiver - Options Page Script
 */

import { DEFAULT_SETTINGS } from './constants.js';

// グローバル変数
let bookmarkTree = null;
let selectedFolderId = null;

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
 * ブックマークツリーを取得
 */
async function loadBookmarkTree() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      resolve(tree);
    });
  });
}

/**
 * フォルダIDからパスを生成
 */
function getFolderPath(tree, targetId) {
  const path = [];
  
  function search(nodes, currentPath) {
    for (const node of nodes) {
      const newPath = [...currentPath, node.title || 'ルート'];
      
      if (node.id === targetId) {
        return newPath;
      }
      
      if (node.children) {
        const found = search(node.children, newPath);
        if (found) return found;
      }
    }
    return null;
  }
  
  const result = search(tree, []);
  return result ? result.slice(1).join(' / ') : ''; // 最初のルートを除外
}

/**
 * モーダルでフォルダツリーを表示
 */
function buildFolderTree(container, nodes, depth = 0) {
  if (!nodes) return;
  
  for (const node of nodes) {
    // フォルダのみ表示（childrenを持つものがフォルダ）
    if (node.children !== undefined && node.id !== '0') {
      const item = document.createElement('div');
      item.className = 'folder-item';
      item.style.paddingLeft = `${depth * 20 + 12}px`;
      item.textContent = node.title || '（名前なし）';
      item.dataset.folderId = node.id;
      item.dataset.folderTitle = node.title;
      item.tabIndex = 0; // キーボードフォーカス可能に
      
      // クリックで選択
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // 既存の選択を解除
        container.querySelectorAll('.folder-item.selected').forEach(el => {
          el.classList.remove('selected');
        });
        
        // 新しい選択を適用
        item.classList.add('selected');
        selectedFolderId = node.id;
        document.getElementById('selectFolderBtn').disabled = false;
      });
      
      // ダブルクリックで名前変更
      item.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRenameFolder(item);
      });
      
      // F2キーで名前変更
      item.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
          e.preventDefault();
          startRenameFolder(item);
        }
      });
      
      container.appendChild(item);
      
      // 子フォルダを再帰的に追加
      if (node.children) {
        buildFolderTree(container, node.children, depth + 1);
      }
    }
  }
}

/**
 * 設定を読み込んでフォームに反映
 */
async function loadSettings() {
  bookmarkTree = await loadBookmarkTree();
  
  chrome.storage.local.get(DEFAULT_SETTINGS, async (settings) => {
    document.getElementById('dateFormat').value = settings.dateFormat;
    document.getElementById('includeTime').checked = settings.includeTime;
    document.getElementById('useFolderSummary').checked = settings.useFolderSummary;
    document.getElementById('maxTitleLength').value = settings.maxTitleLength;
    document.getElementById('folderSummaryMaxChars').value = settings.folderSummaryMaxChars;
    document.getElementById('closeTabsAfterSave').checked = settings.closeTabsAfterSave;
    document.getElementById('useCustomFolder').checked = settings.useCustomFolder;

    // ウィンドウ保存モードの設定
    const windowSaveMode = settings.windowSaveMode || 'current';
    if (windowSaveMode === 'all-windows') {
      document.getElementById('windowModeAllWindows').checked = true;
    } else {
      document.getElementById('windowModeCurrent').checked = true;
    }

    // 選択されているフォルダのパスを表示
    if (settings.targetFolderId) {
      selectedFolderId = settings.targetFolderId;
      const path = getFolderPath(bookmarkTree, settings.targetFolderId);
      document.getElementById('targetFolderPath').value = path || 'フォルダが見つかりません';
    }

    // カスタムフォルダ設定の表示切り替え
    toggleFolderSelect(settings.useCustomFolder);
    // 要約設定の表示切り替え
    toggleFolderSummary(settings.useFolderSummary);
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
 * 要約設定UIの表示切り替え
 */
function toggleFolderSummary(show) {
  const folderSummaryRow = document.getElementById('folderSummaryRow');
  folderSummaryRow.style.display = show ? 'block' : 'none';
}

/**
 * フォルダ名の編集を開始
 */
function startRenameFolder(item) {
  const folderId = item.dataset.folderId;
  const currentTitle = item.dataset.folderTitle;
  
  // 既に編集中の場合は無視
  if (item.classList.contains('editing')) return;
  
  item.classList.add('editing');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'folder-rename';
  input.value = currentTitle;
  
  // 編集完了処理
  const finishEdit = async (save) => {
    const newTitle = input.value.trim();
    
    if (save && newTitle && newTitle !== currentTitle) {
      try {
        await chrome.bookmarks.update(folderId, { title: newTitle });
        item.textContent = newTitle;
        item.dataset.folderTitle = newTitle;
        
        // 選択中のフォルダの場合、パスも更新
        if (selectedFolderId === folderId) {
          bookmarkTree = await loadBookmarkTree();
          const path = getFolderPath(bookmarkTree, selectedFolderId);
          document.getElementById('targetFolderPath').value = path;
        }
      } catch (error) {
        console.error('フォルダ名の変更に失敗:', error);
        alert('フォルダ名の変更に失敗しました');
      }
    }
    
    item.classList.remove('editing');
    if (input.parentNode) {
      item.textContent = item.dataset.folderTitle;
    }
  };
  
  input.addEventListener('blur', () => finishEdit(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishEdit(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishEdit(false);
    }
  });
  
  item.textContent = '';
  item.appendChild(input);
  input.focus();
  input.select();
}

/**
 * 新しいフォルダを作成
 */
async function createNewFolder() {
  const parentId = selectedFolderId || '1'; // デフォルトはブックマークバー
  const folderName = prompt('新しいフォルダの名前を入力してください:', '新しいフォルダ');
  
  if (folderName && folderName.trim()) {
    try {
      const newFolder = await chrome.bookmarks.create({
        parentId: parentId,
        title: folderName.trim()
      });
      
      // ツリーを再読み込み
      bookmarkTree = await loadBookmarkTree();
      const folderTree = document.getElementById('folderTree');
      folderTree.innerHTML = '';
      if (bookmarkTree && bookmarkTree[0]) {
        buildFolderTree(folderTree, bookmarkTree[0].children);
      }
      
      // 作成したフォルダを自動選択
      selectedFolderId = newFolder.id;
      const newItem = folderTree.querySelector(`[data-folder-id="${newFolder.id}"]`);
      if (newItem) {
        newItem.classList.add('selected');
        newItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('selectFolderBtn').disabled = false;
      }
    } catch (error) {
      console.error('フォルダの作成に失敗:', error);
      alert('フォルダの作成に失敗しました');
    }
  }
}

/**
 * モーダルを開く
 */
function openFolderModal() {
  const modal = document.getElementById('folderModal');
  const folderTree = document.getElementById('folderTree');
  
  // ツリーをクリアして再構築
  folderTree.innerHTML = '';
  if (bookmarkTree && bookmarkTree[0]) {
    buildFolderTree(folderTree, bookmarkTree[0].children);
  }
  
  // 現在選択されているフォルダをハイライト
  if (selectedFolderId) {
    const selectedItem = folderTree.querySelector(`[data-folder-id="${selectedFolderId}"]`);
    if (selectedItem) {
      selectedItem.classList.add('selected');
      document.getElementById('selectFolderBtn').disabled = false;
    }
  }
  
  modal.style.display = 'flex';
}

/**
 * モーダルを閉じる
 */
function closeFolderModal() {
  document.getElementById('folderModal').style.display = 'none';
}

/**
 * フォルダ選択を確定
 */
function selectFolder() {
  if (selectedFolderId && bookmarkTree) {
    const path = getFolderPath(bookmarkTree, selectedFolderId);
    document.getElementById('targetFolderPath').value = path;
    closeFolderModal();
  }
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
    useFolderSummary: document.getElementById('useFolderSummary').checked,
    maxTitleLength: maxTitleLength,
    folderSummaryMaxChars: folderSummaryMaxChars,
    closeTabsAfterSave: document.getElementById('closeTabsAfterSave').checked,
    useCustomFolder: document.getElementById('useCustomFolder').checked,
    targetFolderId: selectedFolderId || null,
    windowSaveMode: document.querySelector('input[name="windowSaveMode"]:checked')?.value || 'current'
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

  // タブ要約使用のチェックボックス
  document.getElementById('useFolderSummary').addEventListener('change', (e) => {
    toggleFolderSummary(e.target.checked);
  });

  // 参照ボタン
  document.getElementById('browseFolderBtn').addEventListener('click', openFolderModal);
  
  // モーダル制御
  document.getElementById('closeModalBtn').addEventListener('click', closeFolderModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeFolderModal);
  document.getElementById('selectFolderBtn').addEventListener('click', selectFolder);
  document.getElementById('newFolderBtn').addEventListener('click', createNewFolder);
  
  // モーダル背景クリックで閉じる
  document.getElementById('folderModal').addEventListener('click', (e) => {
    if (e.target.id === 'folderModal') {
      closeFolderModal();
    }
  });

  // ショートカット設定ページへのリンク
  document.getElementById('shortcutLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
});

