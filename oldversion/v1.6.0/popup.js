/**
 * Popup Script
 */

let suggestedName = '';
let tabCount = 0;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  const folderNameInput = document.getElementById('folderName');
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const tabCountEl = document.getElementById('tabCount');
  
  try {
    // タブ情報を取得してフォルダ名を生成
    const response = await chrome.runtime.sendMessage({ action: 'generateFolderName' });
    
    if (response && response.folderName) {
      suggestedName = response.folderName;
      tabCount = response.tabCount;
      
      folderNameInput.value = suggestedName;
      folderNameInput.placeholder = suggestedName;
      tabCountEl.textContent = tabCount;
      
      // 入力フィールドを選択状態に
      folderNameInput.select();
      folderNameInput.focus();
    } else {
      folderNameInput.value = 'エラー：タブ情報を取得できませんでした';
      saveBtn.disabled = true;
    }
  } catch (error) {
    console.error('初期化エラー:', error);
    folderNameInput.value = 'エラーが発生しました';
    saveBtn.disabled = true;
  }
  
  // 保存ボタン
  saveBtn.addEventListener('click', async () => {
    const folderName = folderNameInput.value.trim();
    if (!folderName) {
      alert('フォルダ名を入力してください');
      return;
    }
    
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    
    try {
      await chrome.runtime.sendMessage({
        action: 'saveWithCustomName',
        folderName: folderName
      });
      
      window.close();
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
  });
  
  // キャンセルボタン
  cancelBtn.addEventListener('click', () => {
    window.close();
  });
  
  // Enterキーで保存
  folderNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });
});
