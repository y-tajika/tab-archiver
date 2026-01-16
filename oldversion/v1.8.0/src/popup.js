/**
 * Popup Script
 */

(function() {
  'use strict';

  const elements = {};

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
      const response = await chrome.runtime.sendMessage({ action: 'generateFolderName' });

      if (response && response.folderName) {
        elements.folderNameInput.value = response.folderName;
        elements.folderNameInput.placeholder = response.folderName;
        elements.tabCountEl.textContent = response.tabCount;

        elements.folderNameInput.select();
        elements.folderNameInput.focus();
      } else {
        throw new Error('タブ情報を取得できませんでした');
      }
    } catch (error) {
      console.error('初期化エラー:', error);
      elements.folderNameInput.value = 'エラーが発生しました';
      elements.saveBtn.disabled = true;
      showError('タブ情報の取得に失敗しました');
    }
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
      await chrome.runtime.sendMessage({
        action: 'saveWithCustomName',
        folderName: folderName
      });
      window.close();
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

  document.addEventListener('DOMContentLoaded', () => {
    elements.container = document.querySelector('.container');
    elements.folderNameInput = document.getElementById('folderName');
    elements.saveBtn = document.getElementById('saveBtn');
    elements.cancelBtn = document.getElementById('cancelBtn');
    elements.tabCountEl = document.getElementById('tabCount');

    initializePopup();
    
    elements.saveBtn.addEventListener('click', handleSave);
    elements.cancelBtn.addEventListener('click', handleCancel);
    elements.folderNameInput.addEventListener('keypress', handleKeyPress);
  });

})();
