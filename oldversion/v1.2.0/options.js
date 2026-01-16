/**
 * Options Page Script
 * 設定画面のロード・保存処理
 */

const DEFAULT_SETTINGS = {
  language: 'ja',
  dateFormat: 'YYYY-MM-DD',
  includeTime: true,
  closeTabsAfterSave: false,
  maxTitleLength: 100,
  folderSummaryMaxChars: 40,
  bookmarkTitleFormat: 'title',
  useLLM: false,
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  parentFolder: 'bookmarksBar'
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
    document.getElementById('bookmarkTitleFormat').value = settings.bookmarkTitleFormat;
    document.getElementById('useLLM').checked = settings.useLLM;
    document.getElementById('openaiApiKey').value = settings.openaiApiKey;
    document.getElementById('openaiModel').value = settings.openaiModel;
    document.getElementById('parentFolder').value = settings.parentFolder;
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
    bookmarkTitleFormat: document.getElementById('bookmarkTitleFormat').value,
    useLLM: document.getElementById('useLLM').checked,
    openaiApiKey: document.getElementById('openaiApiKey').value.trim(),
    openaiModel: document.getElementById('openaiModel').value.trim() || 'gpt-4o-mini',
    parentFolder: document.getElementById('parentFolder').value,
    closeTabsAfterSave: document.getElementById('closeTabsAfterSave').checked
  };

  chrome.storage.local.set(settings, () => {
    const statusElement = document.getElementById('status');
    statusElement.textContent = '保存しました';
    
    setTimeout(() => {
      statusElement.textContent = '';
    }, 1200);
  });
}

// ページ読み込み時の初期化
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('save').addEventListener('click', saveSettings);
});
