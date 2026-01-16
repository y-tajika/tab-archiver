/**
 * Tab Logger - Background Script
 */

console.log('Tab Logger: Service Worker 起動');

const DEFAULT_SETTINGS = {
  language: 'ja',
  dateFormat: 'MM-DD',
  includeTime: false,
  closeTabsAfterSave: false,
  maxTitleLength: 100,
  folderSummaryMaxChars: 30
};

const STOPWORDS = new Set([
  'こと', 'ため', 'これ', 'それ', 'そして', 'また', 'など',
  'に', 'の', 'を', 'が', 'は', 'へ', 'で', 'と', 'や', 'も',
  'から', 'まで', 'です', 'ます', 'する', 'した', 'して',
  'いる', 'ある', 'ない', 'なる', 'について', 'による',
  'the', 'and', 'for', 'with', 'by', 'in', 'on', 'at', 'to', 'of',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'powered', 'box', 'github', 'sharepoint', 'microsoft', 'google',
  'chrome', 'edge', 'firefox', 'safari', 'windows', 'mac', 'linux',
  'com', 'net', 'org', 'co', 'jp', 'www', 'http', 'https',
  'page', 'site', 'web', 'home', 'new', 'tab', 'untitled'
]);

const PROTECTED_URL_PREFIXES = ['chrome://', 'about:', 'chrome-extension://', 'edge://'];

function padZero(num) {
  return num < 10 ? `0${num}` : `${num}`;
}

function formatDate(now, format, includeTime) {
  const year = now.getFullYear();
  const month = padZero(now.getMonth() + 1);
  const date = padZero(now.getDate());
  
  let result = format.replace('YYYY', year).replace('MM', month).replace('DD', date);
  
  if (includeTime) {
    const hours = padZero(now.getHours());
    const minutes = padZero(now.getMinutes());
    result += `_${hours}${minutes}`;
  }
  
  return result;
}

function truncate(text, maxLength) {
  if (!text) return '';
  return text.length <= maxLength ? text : text.slice(0, maxLength - 1) + '';
}

function isProtectedUrl(url) {
  if (!url) return true;
  return PROTECTED_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
      resolve(Object.assign({}, DEFAULT_SETTINGS, stored));
    });
  });
}

function generateSummary(text, maxChars) {
  const cleaned = (text || '').replace(/\s+/g, ' ').replace(/[\r\n]+/g, ' ').trim();
  const words = cleaned.match(/[\u4E00-\u9FFF\u30A0-\u30FFa-zA-Z0-9]{2,}/g) || [];
  const scores = new Map();
  
  for (const word of words) {
    const lower = word.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    
    let score = word.length >= 3 ? 2 : 1;
    const kanjiCount = (word.match(/[\u4E00-\u9FFF]/g) || []).length;
    if (kanjiCount >= 2) score += 2;
    
    const current = scores.get(word) || 0;
    scores.set(word, current + score);
  }

  const topWords = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);

  const phrase = topWords.join('_');
  return truncate(phrase || 'bookmark', maxChars);
}

function buildFolderSummary(pages, settings) {
  const titles = pages
    .map(page => {
      let title = page.title || '';
      title = title.replace(/https?:\/\/[^\s]+/g, '');
      title = title.replace(/\b(com|net|org|co|jp)\b/gi, '');
      return title;
    })
    .filter(Boolean)
    .join(' ');
  
  return generateSummary(titles, settings.folderSummaryMaxChars);
}

function formatBookmarkTitle(title, maxLength) {
  if (!title) return 'Untitled';
  const cleaned = title.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return truncate(cleaned, maxLength);
}

async function ensureTabLoggerFolder() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((tree) => {
      // まずTab_Loggerフォルダを検索
      const searchFolder = (nodes) => {
        for (const node of nodes) {
          if (node.title === 'Tab_Logger' && node.children !== undefined) {
            return node.id;
          }
          if (node.children) {
            const found = searchFolder(node.children);
            if (found) return found;
          }
        }
        return null;
      };

      const folderId = searchFolder(tree);
      if (folderId) {
        console.log('Tab Logger: 既存のTab_Loggerフォルダを使用:', folderId);
        resolve(folderId);
        return;
      }

      // Tab_Loggerが見つからなければ作成
      // ツリーから「その他のブックマーク」を探す
      const findOtherBookmarks = (nodes) => {
        for (const node of nodes) {
          if (node.title === 'その他のブックマーク' || node.title === 'Other bookmarks' || node.title === 'Other Bookmarks') {
            console.log('Tab Logger: その他のブックマーク発見:', node.id, node.title);
            return node.id;
          }
          if (node.children) {
            const found = findOtherBookmarks(node.children);
            if (found) return found;
          }
        }
        return null;
      };

      let otherBookmarksId = findOtherBookmarks(tree);
      
      // 見つからなければID "2" を試す（Chrome/Edgeの標準）
      if (!otherBookmarksId) {
        console.log('Tab Logger: その他のブックマークが見つからないため、ID "2" を使用');
        otherBookmarksId = '2';
      }

      console.log('Tab Logger: Tab_Loggerフォルダを作成中...', otherBookmarksId);
      chrome.bookmarks.create({
        parentId: otherBookmarksId,
        title: 'Tab_Logger'
      }, (newFolder) => {
        if (chrome.runtime.lastError) {
          console.error('Tab Logger: フォルダ作成エラー:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('Tab Logger: Tab_Loggerフォルダ作成完了:', newFolder.id);
          resolve(newFolder.id);
        }
      });
    });
  });
}

async function createFolder(parentId, title) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create({ parentId, title }, (folder) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(folder.id);
      }
    });
  });
}

async function createBookmark(parentId, title, url) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create({ parentId, title, url }, (bookmark) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(bookmark);
      }
    });
  });
}

async function saveAllTabs(customFolderName = null) {
  try {
    console.log('Tab Logger: saveAllTabs() 開始');
    const settings = await getSettings();
    const tabs = await chrome.tabs.query({ currentWindow: true });
    console.log('Tab Logger: タブ取得完了', tabs.length, '件');
    
    const validTabs = tabs.filter(tab => !isProtectedUrl(tab.url));
    console.log('Tab Logger: 有効なタブ', validTabs.length, '件');
    
    if (validTabs.length === 0) {
      console.log('Tab Logger: 保存可能なタブがありません');
      return { success: false, message: '保存可能なタブがありません' };
    }

    const pages = validTabs.map(tab => ({ title: tab.title || 'Untitled', url: tab.url || '' }));
    
    // フォルダ名：カスタム名がある場合はそれを使用、なければ自動生成
    let folderName;
    if (customFolderName) {
      folderName = customFolderName;
    } else {
      const now = new Date();
      const dateStr = formatDate(now, settings.dateFormat, settings.includeTime);
      const summary = buildFolderSummary(pages, settings);
      folderName = `${dateStr}_${summary}`;
    }
    
    console.log('Tab Logger: フォルダ名', folderName);

    const tabLoggerFolderId = await ensureTabLoggerFolder();
    const saveFolderId = await createFolder(tabLoggerFolderId, folderName);
    console.log('Tab Logger: 保存先フォルダ作成完了', saveFolderId);

    let successCount = 0;
    for (const page of pages) {
      try {
        const title = formatBookmarkTitle(page.title, settings.maxTitleLength);
        await createBookmark(saveFolderId, title, page.url);
        successCount++;
      } catch (err) {
        console.error('Tab Logger: ブックマーク保存失敗:', err);
      }
    }

    console.log(`Tab Logger: 保存完了: ${successCount}/${pages.length} 件`);

    if (settings.closeTabsAfterSave) {
      const tabIds = validTabs.map(tab => tab.id);
      await chrome.tabs.remove(tabIds);
    }

    return { success: true, count: successCount, total: pages.length };

  } catch (error) {
    console.error('Tab Logger: エラー:', error);
    return { success: false, message: error.message };
  }
}

async function generateFolderName() {
  try {
    const settings = await getSettings();
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const validTabs = tabs.filter(tab => !isProtectedUrl(tab.url));
    
    if (validTabs.length === 0) {
      return { folderName: 'bookmark', tabCount: 0 };
    }

    const pages = validTabs.map(tab => ({ title: tab.title || 'Untitled', url: tab.url || '' }));
    const now = new Date();
    const dateStr = formatDate(now, settings.dateFormat, settings.includeTime);
    const summary = buildFolderSummary(pages, settings);
    const folderName = `${dateStr}_${summary}`;
    
    return { folderName, tabCount: validTabs.length };
  } catch (error) {
    console.error('Tab Logger: フォルダ名生成エラー:', error);
    return { folderName: 'bookmark', tabCount: 0 };
  }
}

console.log('Tab Logger: イベントリスナー登録');

// ショートカットキー：自動命名で即座に保存
chrome.commands.onCommand.addListener((command) => {
  console.log('Tab Logger: コマンド受信:', command);
  if (command === 'bookmark_all_tabs') {
    console.log('Tab Logger: saveAllTabs() 実行開始（自動命名）');
    saveAllTabs();
  }
});

// ポップアップからのメッセージ
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Tab Logger: メッセージ受信:', request);
  
  if (request.action === 'generateFolderName') {
    // フォルダ名を生成して返す
    generateFolderName().then(result => {
      sendResponse(result);
    });
    return true; // 非同期レスポンス
  }
  
  if (request.action === 'saveWithCustomName') {
    // カスタム名で保存
    saveAllTabs(request.folderName).then(result => {
      sendResponse(result);
    });
    return true; // 非同期レスポンス
  }
});

