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
      const response = await chrome.runtime.sendMessage({
        action: 'saveWithCustomName',
        folderName: folderName
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
  });

})();
