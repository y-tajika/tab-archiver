/**
 * TabArchiver - Background Script
 */

import { DEFAULT_SETTINGS, STOPWORDS } from './constants.js';

// 定数定義
const APP_NAME = chrome.runtime.getManifest().name;
const DEFAULT_FOLDER_NAME = 'TabArchive';

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
  return text.length <= maxLength ? text : text.slice(0, maxLength - 1) + '…';
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
  const words = cleaned.match(/[\u4E00-\u9FFF\u30A0-\u30FFa-zA-Z0-9]{3,}/g) || [];
  const scores = new Map();
  
  for (const word of words) {
    const lower = word.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    
    let score = 2; // 基本スコア（3文字以上）
    
    // 長さボーナス
    if (word.length >= 6) score += 5;
    else if (word.length >= 4) score += 3;
    
    // 漢字ボーナス
    const kanjiCount = (word.match(/[\u4E00-\u9FFF]/g) || []).length;
    score += kanjiCount * 1.0;
    
    // カタカナボーナス（固有名詞の可能性）
    const katakanaCount = (word.match(/[\u30A0-\u30FF]/g) || []).length;
    if (katakanaCount >= 2) score += 2;
    
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
      
      // URLを正確にパースしてドメインを除外
      try {
        const url = new URL(page.url);
        const domain = url.hostname.replace(/^www\./, '');
        // ドメイン名をタイトルから削除
        const domainParts = domain.split('.');
        domainParts.forEach(part => {
          title = title.replace(new RegExp(`\\b${part}\\b`, 'gi'), '');
        });
      } catch (e) {
        // URLパース失敗時は従来の処理
        title = title.replace(/https?:\/\/[^\s]+/g, '');
      }
      
      // 一般的なドメイン拡張子を除外
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

function searchFolder(nodes, targetTitle) {
  for (const node of nodes) {
    if (node.title === targetTitle && node.children !== undefined) {
      return node.id;
    }
    if (node.children) {
      const found = searchFolder(node.children, targetTitle);
      if (found) return found;
    }
  }
  return null;
}

function findOtherBookmarks(nodes) {
  const titles = ['その他のブックマーク', 'Other bookmarks', 'Other Bookmarks'];
  for (const title of titles) {
    const id = searchFolder(nodes, title);
    if (id) {
      console.log(`${APP_NAME}: その他のブックマーク発見:`, id, title);
      return id;
    }
  }
  return null;
}

async function ensureTabLoggerFolder(settings) {
  try {
    // カスタムフォルダの存在確認
    if (settings.useCustomFolder && settings.targetFolderId) {
      try {
        await new Promise((resolve, reject) => {
          chrome.bookmarks.get(settings.targetFolderId, (results) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(results);
            }
          });
        });
        console.log(`${APP_NAME}: カスタムフォルダを使用:`, settings.targetFolderId);
        return settings.targetFolderId;
      } catch (error) {
        console.warn(`${APP_NAME}: カスタムフォルダ ${settings.targetFolderId} が見つかりません。デフォルトフォルダを使用します。`);
        // フォールバック処理を継続
      }
    }

    const tree = await new Promise((resolve) => {
      chrome.bookmarks.getTree(resolve);
    });

    const folderId = searchFolder(tree, DEFAULT_FOLDER_NAME);
    if (folderId) {
      console.log(`${APP_NAME}: 既存の${DEFAULT_FOLDER_NAME}フォルダを使用:`, folderId);
      return folderId;
    }

    let otherBookmarksId = findOtherBookmarks(tree);
    if (!otherBookmarksId) {
      // ルートノードから適切な親フォルダを動的に検出
      console.log(`${APP_NAME}: その他のブックマークが見つからないため、ルートから検索します`);
      const root = tree[0];
      if (root && root.children && root.children.length > 0) {
        // 最後の子フォルダを使用（通常はその他のブックマーク）
        otherBookmarksId = root.children[root.children.length - 1].id;
        console.log(`${APP_NAME}: 親フォルダとして使用:`, otherBookmarksId);
      } else {
        throw new Error('ブックマークフォルダが見つかりません');
      }
    }

    console.log(`${APP_NAME}: ${DEFAULT_FOLDER_NAME}フォルダを作成中...`, otherBookmarksId);
    const newFolder = await createFolder(otherBookmarksId, DEFAULT_FOLDER_NAME);
    console.log(`${APP_NAME}: ${DEFAULT_FOLDER_NAME}フォルダ作成完了:`, newFolder);
    return newFolder;
  } catch (error) {
    console.error(`${APP_NAME}: フォルダ確保エラー:`, error);
    throw error;
  }
}

async function createFolder(parentId, title) {
  try {
    const folder = await new Promise((resolve, reject) => {
      chrome.bookmarks.create({ parentId, title }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
    return folder.id;
  } catch (error) {
    console.error(`${APP_NAME}: フォルダ作成エラー:`, error);
    throw error;
  }
}

async function createBookmark(parentId, title, url) {
  try {
    const bookmark = await new Promise((resolve, reject) => {
      chrome.bookmarks.create({ parentId, title, url }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
    return bookmark;
  } catch (error) {
    console.error(`${APP_NAME}: ブックマーク作成エラー:`, error);
    throw error;
  }
}

async function saveAllTabs(customFolderName = null) {
  try {
    const settings = await getSettings();
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    if (tabs.length === 0) {
      throw new Error('保存可能なタブがありません');
    }

    const pages = tabs.map(tab => ({ title: tab.title || 'Untitled', url: tab.url || '' }));
    
    let folderName;
    if (customFolderName) {
      folderName = customFolderName;
    } else {
      const now = new Date();
      const dateStr = formatDate(now, settings.dateFormat, settings.includeTime);
      const summary = buildFolderSummary(pages, settings);
      folderName = `${dateStr}_${summary}`;
    }
    
    console.log(`${APP_NAME}: フォルダ名`, folderName);

    const tabLoggerFolderId = await ensureTabLoggerFolder(settings);
    const saveFolderId = await createFolder(tabLoggerFolderId, folderName);
    console.log(`${APP_NAME}: 保存先フォルダ作成完了`, saveFolderId);

    const results = await Promise.allSettled(
      pages.map(page => {
        const title = formatBookmarkTitle(page.title, settings.maxTitleLength);
        return createBookmark(saveFolderId, title, page.url);
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.filter(r => r.status === 'rejected').length;
    const failedPages = results
      .map((r, i) => ({ result: r, page: pages[i] }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ page }) => ({ title: page.title, url: page.url }));
    
    if (failedCount > 0) {
      console.error(`${APP_NAME}: ブックマーク保存失敗: ${failedCount}件`);
      failedPages.forEach(page => {
        console.error(`  - ${page.title} (${page.url})`);
      });
    }

    console.log(`${APP_NAME}: 保存完了: ${successCount}/${pages.length} 件`);

    if (settings.closeTabsAfterSave) {
      const tabIds = tabs.map(tab => tab.id);
      await chrome.tabs.remove(tabIds);
    }

    return { 
      success: true, 
      count: successCount, 
      total: pages.length,
      failed: failedCount,
      failedPages: failedPages
    };

  } catch (error) {
    console.error(`${APP_NAME}: 保存処理エラー:`, error);
    return { success: false, message: error.message };
  }
}

async function generateFolderName() {
  try {
    const settings = await getSettings();
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    if (tabs.length === 0) {
      return { folderName: 'bookmark', tabCount: 0 };
    }

    const pages = tabs.map(tab => ({ title: tab.title || 'Untitled', url: tab.url || '' }));
    const now = new Date();
    const dateStr = formatDate(now, settings.dateFormat, settings.includeTime);
    const summary = buildFolderSummary(pages, settings);
    const folderName = `${dateStr}_${summary}`;
    
    return { folderName, tabCount: tabs.length };
  } catch (error) {
    console.error(`${APP_NAME}: フォルダ名生成エラー:`, error);
    return { folderName: 'bookmark', tabCount: 0 };
  }
}

console.log(`${APP_NAME}: イベントリスナー登録`);

// ショートカットキー：自動命名で即座に保存
chrome.commands.onCommand.addListener((command) => {
  console.log(`${APP_NAME}: コマンド受信:`, command);
  if (command === 'bookmark_all_tabs') {
    console.log(`${APP_NAME}: saveAllTabs() 実行開始（自動命名）`);
    saveAllTabs();
  }
});

// ポップアップからのメッセージ
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log(`${APP_NAME}: メッセージ受信:`, request);
  
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




