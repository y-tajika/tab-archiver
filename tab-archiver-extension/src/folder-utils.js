/**
 * TabArchiver - Folder Utilities
 * フォルダ選択・作成・リネーム等の共通機能
 */

/**
 * ブックマークツリーを取得
 */
export async function loadBookmarkTree() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      resolve(tree);
    });
  });
}

/**
 * フォルダIDからパスを生成
 */
export function getFolderPath(tree, targetId) {
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
 * @param {HTMLElement} container - ツリーを表示するコンテナ
 * @param {Array} nodes - ブックマークノードの配列
 * @param {number} depth - 現在の深さ（インデント用）
 * @param {Object} state - 状態オブジェクト { selectedFolderId, selectBtnElement }
 * @param {Function} onSelect - フォルダ選択時のコールバック
 * @param {Function} onRename - 名前変更時のコールバック（オプション）
 */
export function buildFolderTree(container, nodes, depth = 0, state = {}, onSelect = null, onRename = null) {
  if (!nodes || !Array.isArray(nodes)) {
    console.error('buildFolderTree: nodes is not an array', nodes, typeof nodes);
    return;
  }
  
  for (const node of nodes) {
    // フォルダのみ表示（childrenを持つものがフォルダ）
    if (node.children !== undefined && node.id !== '0') {
      const itemWrapper = document.createElement('div');
      itemWrapper.className = 'folder-item-wrapper';
      
      const item = document.createElement('div');
      item.className = 'folder-item';
      item.style.paddingLeft = `${depth * 20 + 12}px`;
      item.dataset.folderId = node.id;
      item.dataset.folderTitle = node.title;
      item.tabIndex = 0; // キーボードフォーカス可能に
      
      // 子フォルダがある場合は展開アイコンを追加
      const hasChildren = node.children && node.children.some(child => child.children !== undefined);
      if (hasChildren) {
        const toggle = document.createElement('span');
        toggle.className = 'folder-toggle';
        toggle.textContent = '▶';
        item.appendChild(toggle);
        
        // 展開アイコンのクリックで開閉
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const childrenContainer = itemWrapper.querySelector('.folder-children');
          if (childrenContainer) {
            const isExpanded = childrenContainer.style.display !== 'none';
            childrenContainer.style.display = isExpanded ? 'none' : 'block';
            toggle.textContent = isExpanded ? '▶' : '▼';
          }
        });
      } else {
        // 子フォルダがない場合はスペーサー
        const spacer = document.createElement('span');
        spacer.className = 'folder-spacer';
        item.appendChild(spacer);
      }
      
      // フォルダ名
      const title = document.createElement('span');
      title.textContent = node.title || '（名前なし）';
      item.appendChild(title);
      
      // クリックで選択
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // 既存の選択を解除
        container.querySelectorAll('.folder-item.selected').forEach(el => {
          el.classList.remove('selected');
        });
        
        // 新しい選択を適用
        item.classList.add('selected');
        if (state) {
          state.selectedFolderId = node.id;
        }
        if (state.selectBtnElement) {
          state.selectBtnElement.disabled = false;
        }
        
        if (onSelect) {
          onSelect(node.id, node.title);
        }
      });
      
      // ダブルクリックで名前変更（onRenameが提供されている場合のみ）
      if (onRename) {
        item.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          startRenameFolder(item, onRename);
        });
        
        // F2キーで名前変更
        item.addEventListener('keydown', (e) => {
          if (e.key === 'F2') {
            e.preventDefault();
            startRenameFolder(item, onRename);
          }
        });
      }
      
      itemWrapper.appendChild(item);
      
      // 子フォルダがある場合は折りたたみ可能なコンテナを作成
      if (hasChildren) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'folder-children';
        childrenContainer.style.display = 'none'; // デフォルトで閉じる
        buildFolderTree(childrenContainer, node.children, depth + 1, state, onSelect, onRename);
        itemWrapper.appendChild(childrenContainer);
      }
      
      container.appendChild(itemWrapper);
    }
  }
}

/**
 * フォルダ名の編集を開始
 */
export function startRenameFolder(item, onRename) {
  const folderId = item.dataset.folderId;
  const currentTitle = item.dataset.folderTitle;
  
  // 既に編集中の場合は無視
  if (item.classList.contains('editing')) return;
  
  item.classList.add('editing');
  
  // 既存の子要素を保存
  const toggle = item.querySelector('.folder-toggle');
  const spacer = item.querySelector('.folder-spacer');
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'folder-rename';
  input.value = currentTitle;
  
  // 既存の内容をクリアして入力フィールドを追加
  item.innerHTML = '';
  if (toggle) item.appendChild(toggle);
  if (spacer) item.appendChild(spacer);
  item.appendChild(input);
  input.focus();
  input.select();
  
  // 確定処理
  const finishEdit = async (save) => {
    const newTitle = input.value.trim();
    
    if (save && newTitle && newTitle !== currentTitle) {
      try {
        await chrome.bookmarks.update(folderId, { title: newTitle });
        item.dataset.folderTitle = newTitle;
        
        // 内容を復元
        item.innerHTML = '';
        if (toggle) item.appendChild(toggle);
        if (spacer) item.appendChild(spacer);
        const titleSpan = document.createElement('span');
        titleSpan.textContent = newTitle;
        item.appendChild(titleSpan);
        
        if (onRename) {
          onRename(folderId, newTitle);
        }
      } catch (error) {
        console.error('フォルダ名の変更に失敗:', error);
        
        // エラー時も復元
        item.innerHTML = '';
        if (toggle) item.appendChild(toggle);
        if (spacer) item.appendChild(spacer);
        const titleSpan = document.createElement('span');
        titleSpan.textContent = currentTitle;
        item.appendChild(titleSpan);
      }
    } else {
      // キャンセル時も復元
      item.innerHTML = '';
      if (toggle) item.appendChild(toggle);
      if (spacer) item.appendChild(spacer);
      const titleSpan = document.createElement('span');
      titleSpan.textContent = currentTitle;
      item.appendChild(titleSpan);
    }
    
    item.classList.remove('editing');
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
}

/**
 * 新しいフォルダを作成
 * @param {string} parentId - 親フォルダのID
 * @param {Function} onCreated - 作成完了時のコールバック (newFolder) => void
 */
export async function createNewFolder(parentId, onCreated) {
  const effectiveParentId = parentId || '1'; // デフォルトはブックマークバー
  
  try {
    const newFolder = await chrome.bookmarks.create({
      parentId: effectiveParentId,
      title: '新しいフォルダ'
    });
    
    if (onCreated) {
      onCreated(newFolder);
    }
    
    return newFolder;
  } catch (error) {
    console.error('フォルダの作成に失敗:', error);
    alert('フォルダの作成に失敗しました');
    return null;
  }
  
  return null;
}
