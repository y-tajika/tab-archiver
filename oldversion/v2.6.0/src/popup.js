/**
 * Popup Script
 */

(function() {
  'use strict';

  const elements = {};
  const excludedTabIds = new Set(); // 除外されたタブIDを記録
  let selectedTempFolderId = null; // 一時的に選択された保存先フォルダID

  function showError(message) {
    const container = elements.container || document.querySelector('.container');
    const existingError = container.querySelector('.error-message');
    if (existingError) {
      existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = 'color: #d32f2f; padding: 10px; margin: 10px 0; border: 1px solid #d32f2f; border-radius: 4px; background: #ffebee;';
    errorDiv.textContent = message;
    container.insertBefore(errorDiv, container.firstChild);
    setTimeout(() => errorDiv.remove(), 5000);
  }

  async function initializePopup() {
    try {
      // アプリ名を動的に設定
      const manifest = chrome.runtime.getManifest();
      const appName = manifest.name;
      document.title = appName;
      elements.appTitle.textContent = appName;

      // ショートカットキーを読み込む
      const commands = await chrome.commands.getAll();
      const bookmarkCommand = commands.find(cmd => cmd.name === 'bookmark_all_tabs');
      if (bookmarkCommand && bookmarkCommand.shortcut) {
        elements.shortcutHint.textContent = `ショートカット: ${bookmarkCommand.shortcut} で即座に保存`;
      } else {
        elements.shortcutHint.textContent = 'ショートカットキー未設定';
      }

      const response = await chrome.runtime.sendMessage({ action: 'generateFolderName' });

      if (response && response.folderName) {
        elements.folderNameInput.value = response.folderName;
        elements.folderNameInput.placeholder = response.folderName;
        elements.tabCountEl.textContent = response.tabCount;

        // タブ一覧を表示
        displayTabList(response.tabsByWindow, response.windowCount);

        elements.folderNameInput.select();
        elements.folderNameInput.focus();
      } else {
        throw new Error('タブ情報を取得できませんでした');
      }
      
      // デフォルトの保存先フォルダパスを表示
      await loadDefaultFolderPath();
      
    } catch (error) {
      console.error('初期化エラー:', error);
      elements.folderNameInput.value = 'エラーが発生しました';
      elements.saveBtn.disabled = true;
      showError('タブ情報の取得に失敗しました');
    }
  }

  function displayTabList(tabsByWindow, windowCount) {
    const tabListContainer = document.getElementById('tabListContainer');
    const tabListCount = document.getElementById('tabListCount');
    
    if (!tabsByWindow || tabsByWindow.length === 0) {
      tabListContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #999;">タブがありません</div>';
      tabListCount.textContent = '0';
      return;
    }

    const totalTabs = tabsByWindow.reduce((sum, win) => sum + win.tabs.length, 0);
    tabListCount.textContent = totalTabs;

    tabListContainer.innerHTML = '';

    tabsByWindow.forEach(windowData => {
      const windowGroup = document.createElement('div');
      windowGroup.className = 'window-group';

      // 複数ウィンドウの場合のみヘッダーを表示
      let windowHeader = null;
      if (windowCount > 1) {
        windowHeader = document.createElement('div');
        windowHeader.className = 'window-header';
        windowHeader.textContent = `Window${windowData.windowIndex} (${windowData.tabs.length}タブ)`;
        windowGroup.appendChild(windowHeader);
      }

      // タブアイテムを追加
      windowData.tabs.forEach(tab => {
        const tabItem = document.createElement('div');
        tabItem.className = 'tab-item';
        tabItem.title = tab.url; // ツールチップにURL表示
        tabItem.dataset.tabId = tab.id;

        // ファビコン
        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        if (tab.favIconUrl) {
          favicon.src = tab.favIconUrl;
          favicon.onerror = () => {
            favicon.style.display = 'none';
            const placeholder = document.createElement('div');
            placeholder.className = 'tab-favicon default';
            tabItem.insertBefore(placeholder, favicon);
          };
        } else {
          favicon.className = 'tab-favicon default';
        }

        // タイトル
        const title = document.createElement('div');
        title.className = 'tab-title';
        title.textContent = tab.title;

        // 除外ボタン
        const ignoreBtn = document.createElement('button');
        ignoreBtn.className = 'tab-ignore-btn';
        ignoreBtn.textContent = '-';
        ignoreBtn.title = 'アーカイブ対象から除外';

        // 削除ボタン
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tab-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'このタブを閉じる';
        ignoreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // 除外リストに追加
          excludedTabIds.add(tab.id);
          // タブを閉じずにUIから削除のみ
          tabItem.remove();
          // カウントを更新
          const currentCount = parseInt(tabListCount.textContent);
          tabListCount.textContent = currentCount - 1;
          elements.tabCountEl.textContent = currentCount - 1;
          
          // ウィンドウ内のタブ数を更新
          const remainingTabs = windowGroup.querySelectorAll('.tab-item').length;
          if (windowCount > 1 && windowHeader) {
            windowHeader.textContent = `Window${windowData.windowIndex} (${remainingTabs}タブ)`;
          }
          
          // ウィンドウ内のタブがすべて除外された場合
          if (remainingTabs === 0) {
            windowGroup.remove();
          }
        });
        
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await chrome.tabs.remove(tab.id);
            // UIから削除
            tabItem.remove();
            // カウントを更新
            const currentCount = parseInt(tabListCount.textContent);
            tabListCount.textContent = currentCount - 1;
            elements.tabCountEl.textContent = currentCount - 1;
            
            // ウィンドウ内のタブ数を更新
            const remainingTabs = windowGroup.querySelectorAll('.tab-item').length;
            if (windowCount > 1 && windowHeader) {
              windowHeader.textContent = `Window${windowData.windowIndex} (${remainingTabs}タブ)`;
            }
            
            // ウィンドウ内のタブがすべて削除された場合
            if (remainingTabs === 0) {
              windowGroup.remove();
            }
          } catch (error) {
            console.error('タブの削除に失敗:', error);
          }
        });

        tabItem.appendChild(favicon);
        tabItem.appendChild(title);
        tabItem.appendChild(ignoreBtn);
        tabItem.appendChild(deleteBtn);
        windowGroup.appendChild(tabItem);
      });

      tabListContainer.appendChild(windowGroup);
    });
  }

  async function handleSave() {
    const folderName = elements.folderNameInput.value.trim();
    
    if (!folderName) {
      showError('フォルダ名を入力してください');
      return;
    }

    elements.saveBtn.disabled = true;
    elements.saveBtn.textContent = '保存中...';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveWithCustomName',
        folderName: folderName,
        excludedTabIds: Array.from(excludedTabIds), // Setを配列に変換
        tempFolderId: selectedTempFolderId // 一時保存先フォルダID
      });
      
      if (response && response.failed > 0) {
        let errorMsg = `${response.failed}件のブックマークの保存に失敗しました`;
        if (response.failedPages && response.failedPages.length > 0) {
          const titles = response.failedPages.slice(0, 3).map(p => p.title).join(', ');
          errorMsg += `: ${titles}`;
          if (response.failedPages.length > 3) {
            errorMsg += ` 他${response.failedPages.length - 3}件`;
          }
        }
        showError(errorMsg);
        setTimeout(() => window.close(), 3000);
      } else {
        window.close();
      }
    } catch (error) {
      console.error('保存エラー:', error);
      showError('保存に失敗しました');
      elements.saveBtn.disabled = false;
      elements.saveBtn.textContent = '保存';
    }
  }

  function handleCancel() {
    window.close();
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter') {
      handleSave();
    }
  }

  // フォルダ選択機能
  let bookmarkTreeData = null;
  
  async function loadDefaultFolderPath() {
    try {
      const tree = await chrome.bookmarks.getTree();
      bookmarkTreeData = tree[0];
      
      const result = await chrome.storage.local.get(['useCustomFolder', 'targetFolderId']);
      
      let folderId = null;
      
      // カスタムフォルダが設定されている場合
      if (result.useCustomFolder && result.targetFolderId) {
        folderId = result.targetFolderId;
      } else {
        // デフォルト: TabArchiveフォルダを探す
        folderId = searchFolder(tree, 'TabArchive');
        
        if (!folderId) {
          // その他のブックマークを探す
          const otherBookmarks = findOtherBookmarks(tree);
          if (otherBookmarks) {
            folderId = otherBookmarks;
          }
        }
      }
      
      if (folderId) {
        const folderPath = getFolderPath(folderId);
        if (folderPath) {
          document.getElementById('saveFolderPath').placeholder = folderPath;
        }
      }
    } catch (error) {
      console.error('デフォルトフォルダパスの読み込みエラー:', error);
    }
  }
  
  function searchFolder(tree, folderName) {
    function search(nodes) {
      for (const node of nodes) {
        if (node.title === folderName && node.children !== undefined) {
          return node.id;
        }
        if (node.children) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return null;
    }
    return search(tree);
  }
  
  function findOtherBookmarks(tree) {
    function search(nodes) {
      for (const node of nodes) {
        if (node.title === 'その他のブックマーク' || node.title === 'Other Bookmarks') {
          return node.id;
        }
        if (node.children) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return null;
    }
    return search(tree);
  }
  
  async function openFolderModal() {
    const modal = document.getElementById('folderModal');
    const container = document.getElementById('folderTreeContainer');
    
    container.innerHTML = '<p>ブックマークツリーを読み込み中...</p>';
    modal.style.display = 'block';
    
    try {
      const tree = await chrome.bookmarks.getTree();
      bookmarkTreeData = tree[0];
      container.innerHTML = '';
      buildFolderTree(container, tree[0].children, 0);
    } catch (error) {
      container.innerHTML = '<p>エラー: ブックマークの読み込みに失敗しました</p>';
    }
  }

  function buildFolderTree(container, nodes, depth) {
    for (const node of nodes) {
      if (node.children) {
        const item = document.createElement('div');
        item.className = 'folder-item';
        item.style.paddingLeft = `${depth * 20 + 12}px`;
        item.textContent = '📁 ' + (node.title || '(名前なし)');
        item.onclick = () => {
          container.querySelectorAll('.folder-item.selected').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          selectedTempFolderId = node.id;
        };
        container.appendChild(item);
        buildFolderTree(container, node.children, depth + 1);
      }
    }
  }

  function getFolderPath(folderId) {
    if (!bookmarkTreeData || !folderId) return '';
    
    const path = [];
    function findPath(node, targetId) {
      if (node.id === targetId) {
        return true;
      }
      if (node.children) {
        for (const child of node.children) {
          if (findPath(child, targetId)) {
            path.unshift(child.title || '(名前なし)');
            return true;
          }
        }
      }
      return false;
    }
    
    findPath(bookmarkTreeData, folderId);
    return path.join(' / ');
  }
  
  function closeFolderModal() {
    document.getElementById('folderModal').style.display = 'none';
  }

  function selectFolder() {
    if (selectedTempFolderId) {
      const folderPath = getFolderPath(selectedTempFolderId);
      document.getElementById('saveFolderPath').value = folderPath || '選択済み';
    }
    closeFolderModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    elements.container = document.querySelector('.container');
    elements.appTitle = document.getElementById('appTitle');
    elements.folderNameInput = document.getElementById('folderName');
    elements.saveBtn = document.getElementById('saveBtn');
    elements.cancelBtn = document.getElementById('cancelBtn');
    elements.tabCountEl = document.getElementById('tabCount');
    elements.shortcutHint = document.getElementById('shortcutHint');

    initializePopup();
    
    elements.saveBtn.addEventListener('click', handleSave);
    elements.cancelBtn.addEventListener('click', handleCancel);
    elements.folderNameInput.addEventListener('keypress', handleKeyPress);
    
    // フォルダ選択ボタン
    const browseBtn = document.getElementById('browseSaveFolderBtn');
    if (browseBtn) browseBtn.onclick = openFolderModal;
    
    const closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) closeBtn.onclick = closeFolderModal;
    
    const cancelBtn = document.getElementById('cancelModalBtn');
    if (cancelBtn) cancelBtn.onclick = closeFolderModal;
    
    const selectBtn = document.getElementById('selectFolderBtn');
    if (selectBtn) selectBtn.onclick = selectFolder;
  });

})();
