/**
 * TabArchiver - Options Page Script
 */

import { DEFAULT_SETTINGS } from './constants.js';
import { loadBookmarkTree, getFolderPath, buildFolderTree, createNewFolder, startRenameFolder } from './folder-utils.js';

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

    // LLM設定の読み込み
    document.getElementById('enableLLMSummary').checked = settings.enableLLMSummary || false;
    document.getElementById('llmProvider').value = settings.llmProvider || 'gemini';
    document.getElementById('llmApiKey').value = settings.llmApiKey || '';

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
    // LLM設定の表示切り替え
    toggleLLMSettings(settings.enableLLMSummary || false);

    // 外部設定ファイルが存在すれば自動有効化（provider/keyは外部を優先）
    try {
      const external = await loadExternalLLMConfig();
      if (external && external.apiKey) {
        const enableChk = document.getElementById('enableLLMSummary');
        enableChk.checked = true;
        const providerSel = document.getElementById('llmProvider');
        providerSel.value = external.provider || providerSel.value || 'gemini';
        toggleLLMSettings(true);
      }
    } catch (e) {
      // 無視（ファイルがない場合など）
    }
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
 * LLM設定UIの表示切り替え
 */
function toggleLLMSettings(show) {
  const llmSettingsContainer = document.getElementById('llmSettingsContainer');
  llmSettingsContainer.style.display = show ? 'block' : 'none';
}

/**
 * API接続テスト
 */
async function testAPIConnection() {
  const provider = document.getElementById('llmProvider').value;
  const apiKey = document.getElementById('llmApiKey').value.trim();
  const resultDiv = document.getElementById('apiTestResult');
  const messageDiv = document.getElementById('apiTestMessage');
  
  if (!apiKey) {
    messageDiv.textContent = 'APIキーを入力してください';
    messageDiv.style.color = '#d32f2f';
    resultDiv.style.display = 'block';
    return;
  }
  
  messageDiv.textContent = '接続テスト中...';
  messageDiv.style.color = '#666';
  resultDiv.style.display = 'block';
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'testLLMAPI',
      provider: provider,
      apiKey: apiKey
    });
    
    if (response.success) {
      messageDiv.textContent = '✓ 接続成功！APIキーは有効です';
      messageDiv.style.color = '#2e7d32';
    } else {
      messageDiv.textContent = `✗ 接続失敗: ${response.error}`;
      messageDiv.style.color = '#d32f2f';
    }
  } catch (error) {
    messageDiv.textContent = `✗ テスト失敗: ${error.message}`;
    messageDiv.style.color = '#d32f2f';
  }
}

/**
 * リネーム完了時のコールバック
 */
async function handleFolderRename(folderId, newTitle) {
  // 選択中のフォルダの場合、パスも更新
  if (selectedFolderId === folderId) {
    bookmarkTree = await loadBookmarkTree();
    const path = getFolderPath(bookmarkTree, selectedFolderId);
    document.getElementById('targetFolderPath').value = path;
  }
}

/**
 * 新しいフォルダを作成
 */
async function handleCreateNewFolder() {
  await createNewFolder(selectedFolderId, async (newFolder) => {
    // ツリー再読み込み前に展開状態を保存
    const folderTree = document.getElementById('folderTree');
    const expandedFolderIds = new Set();
    folderTree.querySelectorAll('.folder-children').forEach(childContainer => {
      if (childContainer.style.display !== 'none') {
        const parentItem = childContainer.previousElementSibling;
        if (parentItem && parentItem.dataset.folderId) {
          expandedFolderIds.add(parentItem.dataset.folderId);
        }
      }
    });
    
    // ツリーを再読み込み
    bookmarkTree = await loadBookmarkTree();
    const selectBtn = document.getElementById('selectFolderBtn');
    folderTree.innerHTML = '';
    
    if (bookmarkTree && bookmarkTree[0] && bookmarkTree[0].children) {
      const state = { selectedFolderId: newFolder.id, selectBtnElement: selectBtn };
      buildFolderTree(
        folderTree,
        bookmarkTree[0].children,
        0,
        state,
        (folderId) => { selectedFolderId = folderId; },
        handleFolderRename
      );
    }
    
    // 展開状態を復元
    expandedFolderIds.forEach(folderId => {
      const item = folderTree.querySelector(`[data-folder-id="${folderId}"]`);
      if (item) {
        const wrapper = item.parentElement;
        const childrenContainer = wrapper.querySelector('.folder-children');
        const toggle = item.querySelector('.folder-toggle');
        if (childrenContainer && toggle) {
          childrenContainer.style.display = 'block';
          toggle.textContent = '▼';
        }
      }
    });
    
    // 作成したフォルダを自動選択
    selectedFolderId = newFolder.id;
    const newItem = folderTree.querySelector(`[data-folder-id="${newFolder.id}"]`);
    if (newItem) {
      newItem.classList.add('selected');
      newItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // 自動的にリネームモードに入る
      setTimeout(() => {
        startRenameFolder(newItem, handleFolderRename);
      }, 100);
    }
  });
}

/**
 * 外部設定ファイルからLLM設定を読み込み（存在すれば優先）
 * 期待フォーマット: ai-config.json { "provider": "gemini|openrouter", "apiKey": "..." }
 */
async function loadExternalLLMConfig() {
  try {
    const url = chrome.runtime.getURL('ai-config.json');
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.apiKey) return null;
    return {
      provider: (json.provider === 'openrouter' || json.provider === 'gemini') ? json.provider : 'gemini',
      apiKey: String(json.apiKey)
    };
  } catch (e) {
    return null;
  }
}

/**
 * モーダルを開く
 */
function openFolderModal() {
  const modal = document.getElementById('folderModal');
  const folderTree = document.getElementById('folderTree');
  const selectBtn = document.getElementById('selectFolderBtn');
  
  // ツリーをクリアして再構築
  folderTree.innerHTML = '';
  if (bookmarkTree && bookmarkTree[0] && bookmarkTree[0].children) {
    const state = { selectedFolderId, selectBtnElement: selectBtn };
    buildFolderTree(
      folderTree,
      bookmarkTree[0].children,
      0,
      state,
      (folderId) => { selectedFolderId = folderId; },
      handleFolderRename
    );
  }
  
  // 現在選択されているフォルダをハイライト
  if (selectedFolderId) {
    const selectedItem = folderTree.querySelector(`[data-folder-id="${selectedFolderId}"]`);
    if (selectedItem) {
      selectedItem.classList.add('selected');
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
    windowSaveMode: document.querySelector('input[name="windowSaveMode"]:checked')?.value || 'current',
    // LLM設定
    enableLLMSummary: document.getElementById('enableLLMSummary').checked,
    llmProvider: document.getElementById('llmProvider').value,
    llmApiKey: document.getElementById('llmApiKey').value.trim()
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

  // LLM要約使用のチェックボックス
  document.getElementById('enableLLMSummary').addEventListener('change', (e) => {
    toggleLLMSettings(e.target.checked);
  });

  // API接続テストボタン
  document.getElementById('testApiBtn').addEventListener('click', testAPIConnection);

  // 参照ボタン
  document.getElementById('browseFolderBtn').addEventListener('click', openFolderModal);
  
  // モーダル制御
  document.getElementById('closeModalBtn').addEventListener('click', closeFolderModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeFolderModal);
  document.getElementById('selectFolderBtn').addEventListener('click', selectFolder);
  document.getElementById('newFolderBtn').addEventListener('click', handleCreateNewFolder);
  
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

