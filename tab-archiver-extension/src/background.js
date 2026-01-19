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

async function saveAllTabs(customFolderName = null, excludedTabIds = [], tempFolderId = null) {
  try {
    const settings = await getSettings();
    
    // ウィンドウ取得モードに応じて処理を分岐
    if (settings.windowSaveMode === 'all-windows') {
      return await saveAllTabsAllWindows(customFolderName, settings, excludedTabIds, tempFolderId);
    } else {
      return await saveAllTabsCurrentWindow(customFolderName, settings, excludedTabIds, tempFolderId);
    }
  } catch (error) {
    console.error(`${APP_NAME}: 保存処理エラー:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * 現在のウィンドウのタブのみを保存（従来の動作）
 */
async function saveAllTabsCurrentWindow(customFolderName, settings, excludedTabIds = [], tempFolderId = null) {
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  
  // 除外されたタブをフィルタリング
  const tabs = allTabs.filter(tab => !excludedTabIds.includes(tab.id));
  
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
    if (settings.useFolderSummary) {
      const summary = buildFolderSummary(pages, settings);
      folderName = `${dateStr}_${summary}`;
    } else {
      folderName = dateStr;
    }
  }
  
  console.log(`${APP_NAME}: フォルダ名`, folderName);

  // 一時的な保存先フォルダが指定されている場合はそれを使用、それ以外は設定から取得
  const parentFolderId = tempFolderId || await ensureTabLoggerFolder(settings);
  const saveFolderId = await createFolder(parentFolderId, folderName);
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
}

/**
 * 全ウィンドウのタブをウィンドウごとにサブフォルダへ保存
 */
async function saveAllTabsAllWindows(customFolderName, settings, excludedTabIds = [], tempFolderId = null) {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  
  if (windows.length === 0) {
    throw new Error('保存可能なウィンドウがありません');
  }

  // 全ウィンドウのタブを収集（除外されたタブをフィルタリング）
  const allTabs = windows.flatMap(win => win.tabs || []).filter(tab => !excludedTabIds.includes(tab.id));
  
  if (allTabs.length === 0) {
    throw new Error('保存可能なタブがありません');
  }

  // メインフォルダ名を生成
  const pages = allTabs.map(tab => ({ title: tab.title || 'Untitled', url: tab.url || '' }));
  let mainFolderName;
  if (customFolderName) {
    mainFolderName = customFolderName;
  } else {
    const now = new Date();
    const dateStr = formatDate(now, settings.dateFormat, settings.includeTime);
    if (settings.useFolderSummary) {
      const summary = buildFolderSummary(pages, settings);
      mainFolderName = `${dateStr}_${summary}`;
    } else {
      mainFolderName = dateStr;
    }
  }
  
  console.log(`${APP_NAME}: メインフォルダ名`, mainFolderName);

  // 一時的な保存先フォルダが指定されている場合はそれを使用、それ以外は設定から取得
  const parentFolderId = tempFolderId || await ensureTabLoggerFolder(settings);
  const mainFolderId = await createFolder(parentFolderId, mainFolderName);
  console.log(`${APP_NAME}: メインフォルダ作成完了`, mainFolderId);

  // ウィンドウごとにサブフォルダを作成してタブを保存
  let totalSuccess = 0;
  let totalFailed = 0;
  const allFailedPages = [];
  const tabIdsToClose = [];

  // ウィンドウが1つのみの場合はサブフォルダを作らない
  const createSubfolders = windows.length > 1;

  for (let i = 0; i < windows.length; i++) {
    const win = windows[i];
    const allWindowTabs = win.tabs || [];
    
    // 除外されたタブをフィルタリング
    const windowTabs = allWindowTabs.filter(tab => !excludedTabIds.includes(tab.id));
    
    if (windowTabs.length === 0) continue;

    // サブフォルダ作成（複数ウィンドウの場合のみ）
    let targetFolderId;
    if (createSubfolders) {
      const subFolderName = `Window${i + 1}`;
      targetFolderId = await createFolder(mainFolderId, subFolderName);
      console.log(`${APP_NAME}: サブフォルダ作成 "${subFolderName}"`, targetFolderId);
    } else {
      targetFolderId = mainFolderId;
      console.log(`${APP_NAME}: 単一ウィンドウのため、メインフォルダに直接保存`);
    }

    // このウィンドウのタブを保存
    const windowPages = windowTabs.map(tab => ({ title: tab.title || 'Untitled', url: tab.url || '' }));
    const results = await Promise.allSettled(
      windowPages.map(page => {
        const title = formatBookmarkTitle(page.title, settings.maxTitleLength);
        return createBookmark(targetFolderId, title, page.url);
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.filter(r => r.status === 'rejected').length;
    const failedPages = results
      .map((r, idx) => ({ result: r, page: windowPages[idx] }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ page }) => ({ title: page.title, url: page.url }));
    
    totalSuccess += successCount;
    totalFailed += failedCount;
    allFailedPages.push(...failedPages);

    if (failedCount > 0) {
      console.error(`${APP_NAME}: ウィンドウ${i + 1} - ブックマーク保存失敗: ${failedCount}件`);
    }

    console.log(`${APP_NAME}: ウィンドウ${i + 1} - 保存完了: ${successCount}/${windowPages.length} 件`);

    if (settings.closeTabsAfterSave) {
      tabIdsToClose.push(...windowTabs.map(tab => tab.id));
    }
  }

  console.log(`${APP_NAME}: 全ウィンドウ保存完了: ${totalSuccess}/${allTabs.length} 件`);

  if (settings.closeTabsAfterSave && tabIdsToClose.length > 0) {
    await chrome.tabs.remove(tabIdsToClose);
  }

  return { 
    success: true, 
    count: totalSuccess, 
    total: allTabs.length,
    failed: totalFailed,
    failedPages: allFailedPages,
    windowCount: windows.length
  };
}

async function generateFolderName() {
  try {
    const settings = await getSettings();
    
    // 設定に応じてタブを取得
    let tabs;
    let tabsByWindow = [];
    
    if (settings.windowSaveMode === 'all-windows') {
      const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
      tabs = windows.flatMap(win => win.tabs || []);
      
      // ウィンドウごとにグループ化
      tabsByWindow = windows.map((win, index) => ({
        windowIndex: index + 1,
        tabs: (win.tabs || []).map(tab => ({
          id: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          favIconUrl: tab.favIconUrl || ''
        }))
      })).filter(w => w.tabs.length > 0);
    } else {
      tabs = await chrome.tabs.query({ currentWindow: true });
      
      // 単一ウィンドウ
      tabsByWindow = [{
        windowIndex: 1,
        tabs: tabs.map(tab => ({
          id: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          favIconUrl: tab.favIconUrl || ''
        }))
      }];
    }
    
    if (tabs.length === 0) {
      return { folderName: 'bookmark', tabCount: 0, tabsByWindow: [] };
    }

    const pages = tabs.map(tab => ({ title: tab.title || 'Untitled', url: tab.url || '' }));
    const now = new Date();
    const dateStr = formatDate(now, settings.dateFormat, settings.includeTime);
    let folderName;
    if (settings.useFolderSummary) {
      const summary = buildFolderSummary(pages, settings);
      folderName = `${dateStr}_${summary}`;
    } else {
      folderName = dateStr;
    }
    
    return { 
      folderName, 
      tabCount: tabs.length,
      tabsByWindow: tabsByWindow,
      windowCount: tabsByWindow.length
    };
  } catch (error) {
    console.error(`${APP_NAME}: フォルダ名生成エラー:`, error);
    return { folderName: 'bookmark', tabCount: 0, tabsByWindow: [], windowCount: 0 };
  }
}

console.log(`${APP_NAME}: イベントリスナー登録`);

/**
 * LLM API経由でタブタイトルから要約を生成
 */
let lastLLMRequestAt = 0;

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

async function generateLLMSummary(tabs, apiKey, provider = 'gemini') {
  try {
    // 連打抑止（2秒クールダウン）
    const nowMs = Date.now();
    if (nowMs - lastLLMRequestAt < 2000) {
      throw new Error('リクエストが多すぎます。少し待ってから再試行してください。');
    }
    lastLLMRequestAt = nowMs;

    const titles = tabs.map(t => t.title).slice(0, 10); // 最大10タブに制限
    
    if (provider === 'gemini') {
      const prompt = `以下のブラウザタブのタイトルから、作業内容を簡潔に要約してください。
出力は40文字以内、必要なら単語をアンダースコアで区切ること。日本語OK。

タブ:
${titles.map((t, i) => `${i+1}. ${t}`).join('\n')}

要約:`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            maxOutputTokens: 64,
            temperature: 0.7
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error:', response.status, errorText);
        throw new Error(`Gemini APIエラー (${response.status}): ${errorText.slice(0, 100)}`);
      }

      const data = await response.json();
      console.log('Gemini API response:', data);
      const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      
      // 改行や余計な記号を除去（鍵かっこ含む）、40文字に制限
      const cleaned = summary.replace(/[\n\r]+/g, ' ').replace(/[。、！？「」\s]+$/g, '').slice(0, 40);
      if (!cleaned) {
        throw new Error('要約の生成に失敗しました（空の結果が返されました）');
      }
      console.log('Generated summary (Gemini):', cleaned);
      return cleaned;
    }
    
    if (provider === 'openrouter') {
      const systemPrompt = 'あなたは短い日本語の要約を生成するアシスタントです。出力は40文字以内、必要に応じて単語をアンダースコアで区切ってください。推論過程は不要で、要約のみを1行で直接出力してください。同じ語句や文の繰り返しは禁止です。';
      const userPrompt = `以下のブラウザタブのタイトルから、作業内容を簡潔に要約せよ。要約は文字数当たりの情報量が最大になる体言止めの形で。1行のみ出力し、同じ語句の繰り返しは不可。\n\n${titles.map((t, i) => `${i+1}. ${t}`).join('\n')}`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          // OpenRouterの無料モデルに固定
          model: 'tngtech/deepseek-r1t-chimera:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 100,
          temperature: 0.7,
          stop: ['\n'],
          frequency_penalty: 0.6,
          presence_penalty: 0.3
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter API error:', response.status, errorText);
        if (response.status === 429) {
          throw new Error('レート制限に達しました。しばらく待ってから再試行してください。');
        }
        if (response.status === 404) {
          throw new Error('指定モデルが利用不可です。モデル設定を変更するか、時間をおいて再試行してください。');
        }
        throw new Error(`OpenRouter APIエラー (${response.status}): ${errorText.slice(0, 100)}`);
      }

      const data = await response.json();
      console.log('OpenRouter API response:', data);
      if (data?.error) {
        const code = data.error.code;
        const message = data.error.message || 'OpenRouterのプロバイダーエラーが発生しました。';
        console.error('OpenRouter error payload:', data.error);
        if (code === 524) {
          throw new Error('プロバイダーの応答がタイムアウトしました。少し待って再試行してください。');
        }
        throw new Error(`${message} (code: ${code || 'unknown'})`);
      }
      console.log('OpenRouter choices:', JSON.stringify(data.choices, null, 2));
      console.log('OpenRouter first choice:', data.choices?.[0]);
      console.log('OpenRouter message:', data.choices?.[0]?.message);
      console.log('OpenRouter content:', data.choices?.[0]?.message?.content);
      
      const summary = data.choices?.[0]?.message?.content?.trim() || '';
      console.log('Extracted summary (raw):', JSON.stringify(summary));

      const deduped = summary
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .filter((s, i, arr) => arr.indexOf(s) === i)
        .join(' ');

      const cleaned = deduped
        .replace(/[\n\r]+/g, ' ')
        .replace(/(\S+)(\s+\1)+/g, '$1')
        .replace(/[。、！？「」\s]+$/g, '')
        .slice(0, 40);
      console.log('Cleaned summary:', JSON.stringify(cleaned));
      
      if (!cleaned) {
        console.error('Empty summary detected. Full response:', JSON.stringify(data, null, 2));
        throw new Error('要約の生成に失敗しました（空の結果が返されました）');
      }
      console.log('Generated summary (OpenRouter):', cleaned);
      return cleaned;
    }

    throw new Error('Unsupported provider');
    
  } catch (error) {
    console.error('LLM要約生成エラー:', error);
    console.error('エラー詳細:', {
      message: error.message,
      stack: error.stack,
      provider: provider,
      tabCount: tabs.length
    });
    // エラーを上位に伝える（popup.jsでユーザーに表示）
    throw error;
  }
}

/**
 * LLM API接続テスト
 */
async function testLLMAPI(apiKey, provider = 'openrouter') {
  try {
    const testPrompt = 'Hello';
    
    if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: testPrompt }]
          }],
          generationConfig: {
            maxOutputTokens: 10
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API responded with ${response.status}: ${errorText}`);
      }

      return { success: true };
    }
    if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'tngtech/deepseek-r1t-chimera:free',
          messages: [
            { role: 'user', content: testPrompt }
          ],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API応答エラー ${response.status}: ${errorText}`);
      }

      return { success: true };
    }

    throw new Error('Unsupported provider');
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

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
  
  if (request.action === 'generateLLMSummary') {
    // LLMで要約生成（外部設定ファイルがあれば優先）
    chrome.tabs.query({ currentWindow: true }).then(async (tabs) => {
      try {
        let provider = request.settings?.llmProvider;
        let apiKey = request.settings?.llmApiKey;

        const external = await loadExternalLLMConfig();
        if (external && external.apiKey) {
          provider = external.provider || provider;
          apiKey = external.apiKey || apiKey;
        }

        const summary = await generateLLMSummary(tabs, apiKey, provider);
        sendResponse({ success: true, summary });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    });
    return true; // 非同期レスポンス
  }
  
  if (request.action === 'testLLMAPI') {
    // API接続テスト（外部設定ファイルがあれば優先）
    (async () => {
      try {
        let provider = request.provider;
        let apiKey = request.apiKey;
        const external = await loadExternalLLMConfig();
        if (external && external.apiKey) {
          provider = external.provider || provider;
          apiKey = external.apiKey || apiKey;
        }
        const result = await testLLMAPI(apiKey, provider);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 非同期レスポンス
  }
  
  if (request.action === 'saveWithCustomName') {
    // カスタム名で保存
    const excludedTabIds = request.excludedTabIds || [];
    const tempFolderId = request.tempFolderId || null;
    saveAllTabs(request.folderName, excludedTabIds, tempFolderId).then(result => {
      sendResponse(result);
    });
    return true; // 非同期レスポンス
  }
});




