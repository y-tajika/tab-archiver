/**
 * Tab Logger - Options Page Script
 * v1.4.0
 */

const DEFAULT_SETTINGS = {
  language: 'ja',
  dateFormat: 'MM-DD',
  includeTime: false,
  closeTabsAfterSave: false,
  maxTitleLength: 100,
  folderSummaryMaxChars: 30
};

/**
 * 設定を読み込んでフォームに反映
 */
function loadSettings() {
  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    document.getElementById('dateFormat').value = settings.dateFormat;
    document.getElementById('includeTime').checked = settings.includeTime;
    document.getElementById('maxTitleLength').value = settings.maxTitleLength;
    document.getElementById('folderSummaryMaxChars').value = settings.folderSummaryMaxChars;
    document.getElementById('closeTabsAfterSave').checked = settings.closeTabsAfterSave;
  });
}

/**
 * フォームの値を保存
 */
function saveSettings() {
  const settings = {
    dateFormat: document.getElementById('dateFormat').value || 'YYYY-MM-DD',
    includeTime: document.getElementById('includeTime').checked,
    maxTitleLength: parseInt(document.getElementById('maxTitleLength').value || '100', 10),
    folderSummaryMaxChars: parseInt(document.getElementById('folderSummaryMaxChars').value || '40', 10),
    closeTabsAfterSave: document.getElementById('closeTabsAfterSave').checked
  };

  chrome.storage.local.set(settings, () => {
    const statusElement = document.getElementById('status');
    statusElement.textContent = '保存しました';
    
    setTimeout(() => {
      statusElement.textContent = '';
    }, 2000);
  });
}

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('save').addEventListener('click', saveSettings);
});
