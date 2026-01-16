
/**
 * Tab Logger v2
 * 開いているタブを一括ブックマーク。
 * フォルダ名: <日付>_<タブ内容の要約>
 */

const DEFAULT_SETTINGS = {
  language: 'ja',
  dateFormat: 'YYYY-MM-DD',
  includeTime: true,
  closeTabsAfterSave: false,
  maxTitleLength: 100,
  folderSummaryMaxChars: 40,
  bookmarkTitleFormat: 'title', // 'title' | 'domain-title' | 'title-summary'
  useLLM: false,
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  parentFolder: 'bookmarksBar'
};

/**
 * 数値を2桁でパディング
 */
function padZero(num) {
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * 日付をフォーマット
 * @param {Date} now - 日付
 * @param {string} format - YYYY-MM-DD形式
 * @param {boolean} includeTime - HHmmを含めるか
 */
function formatDate(now, format, includeTime) {
  const year = now.getFullYear();
  const month = padZero(now.getMonth() + 1);
  const date = padZero(now.getDate());
  
  let result = format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', date);
  
  if (includeTime) {
    const hours = padZero(now.getHours());
    const minutes = padZero(now.getMinutes());
    result += ` ${hours}${minutes}`;
  }
  
  return result;
}

/**
 * 文字列を指定長でトリミング
 */
function truncate(text, maxLength) {
  if (!text) return '';
  return text.length <= maxLength ? text : text.slice(0, maxLength - 1) + '…';
}

/**
 * ストレージから設定を取得
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
      resolve(Object.assign({}, DEFAULT_SETTINGS, stored));
    });
  });
}

/**
 * ページデータを抽出（タイトル・テキスト）
 */
async function extractPageData(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    
    if (result && result[0] && result[0].result) {
      return result[0].result;
    }
  } catch (error) {
    console.warn(`Failed to extract data from tab ${tabId}:`, error);
  }
  
  return { title: '', text: '' };
}

/**
 * OpenAI APIを使用してテキストを要約
 */
async function summarizeWithLLM(text, settings, targetLength) {
  if (!settings.openaiApiKey) {
    console.warn('OpenAI API key not configured');
    return '';
  }

  try {
    const payload = {
      model: settings.openaiModel,
      messages: [{
        role: 'user',
        content: `以下の複数ページの内容を端的に総括し、日本語で${targetLength}文字程度の短いフレーズ（名詞句/短文）にしてください。\n\n${text}`
      }],
      temperature: 0.2
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openaiApiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const json = await response.json();
    const summary = json.choices?.[0]?.message?.content?.trim() || '';
    
    return truncate(summary, settings.folderSummaryMaxChars);
  } catch (error) {
    console.warn('LLM summarization failed:', error);
    return '';
  }
}

/**
 * キーワード抽出による要約（LLM未使用時）
 */
function summarizeWithKeywords(text, maxChars) {
  const cleaned = (text || '')
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim();

  // 日本語・英数字を抽出
  const words = cleaned.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9]{2,}/gu) || [];

  // ストップワード（助詞など）
  const stopwords = new Set([
    'こと', 'ため', 'これ', 'それ', 'そして', 'また', 'など',
    'に', 'の', 'を', 'が', 'は', 'へ', 'で', 'と', 'や', 'も',
    'から', 'まで', 'です', 'ます', 'する', 'した', 'して',
    'いる', 'ある', 'ない', 'なる'
  ]);

  // 単語頻度をカウント
  const frequency = new Map();
  for (const word of words) {
    if (stopwords.has(word)) continue;
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }

  // 頻度の高い単語 top4を取得
  const topWords = Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);

  const phrase = topWords.join('・');
  
  return truncate(phrase || cleaned.slice(0, maxChars), maxChars);
}

/**
 * 複数ページから要約を生成
 * @param {Array} pages - [{title, text, url}]
 * @param {Object} settings
 */
async function buildFolderSummary(pages, settings) {
  const corpus = pages
    .map(page => `${page.title}\n${page.text}`)
    .join('\n---\n');

  // LLMが有効かつAPIキーがある場合
  if (settings.useLLM && settings.openaiApiKey) {
    const summary = await summarizeWithLLM(corpus, settings, settings.folderSummaryMaxChars);
    if (summary) return summary;
  }

  // フォールバック: キーワード抽出
  return summarizeWithKeywords(corpus, settings.folderSummaryMaxChars);
}

/**
 * ブックマークのタイトルをフォーマット
 */
function formatBookmarkTitle(page, settings) {
  const url = page.url || '';
  let domain = '';
  
  try {
    domain = new URL(url).hostname;
  } catch (error) {
    console.debug('Failed to parse URL:', url);
  }

  const title = (page.title || '').trim() || domain || 'Untitled';

  switch (settings.bookmarkTitleFormat) {
    case 'domain-title':
      return truncate(
        `${domain ? domain + ' — ' : ''}${title}`,
        settings.maxTitleLength
      );

    case 'title-summary': {
      const summary = summarizeWithKeywords(
        page.text,
        Math.max(20, Math.floor(settings.maxTitleLength / 3))
      );
      return truncate(
        `${title}${summary ? ' — ' + summary : ''}`,
        settings.maxTitleLength
      );
    }

    default:
      return truncate(title, settings.maxTitleLength);
  }
}

/**
 * 「その他のお気に入り」の下に「Tab_Logger」フォルダを取得または作成
 */
async function ensureTabLoggerFolder() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const roots = tree[0].children || [];

    // 「その他のお気に入り」を取得
    const otherBookmarks = roots.find(
      node =>
        node.title === 'Other bookmarks' ||
        node.title === 'その他のブックマーク' ||
        node.id === '2'
    );

    if (!otherBookmarks) {
      throw new Error('Other bookmarks folder not found');
    }

    // 既存の「Tab_Logger」フォルダを検索
    let tabLoggerFolder = null;
    if (otherBookmarks.children) {
      tabLoggerFolder = otherBookmarks.children.find(
        node => node.title === 'Tab_Logger'
      );
    }

    // なければ作成
    if (!tabLoggerFolder) {
      tabLoggerFolder = await chrome.bookmarks.create({
        title: 'Tab_Logger',
        parentId: otherBookmarks.id
      });
    }

    return tabLoggerFolder.id;
  } catch (error) {
    console.error('Failed to ensure Tab_Logger folder:', error);
    throw error;
  }
}

/**
 * ブックマークフォルダを作成（Tab_Loggerフォルダの下に）
 */
async function createFolder(name) {
  try {
    const tabLoggerFolderId = await ensureTabLoggerFolder();

    const folder = await chrome.bookmarks.create({
      title: name,
      parentId: tabLoggerFolderId
    });

    return folder.id;
  } catch (error) {
    console.error('Failed to create folder:', error);
    throw error;
  }
}

/**
 * メイン処理：現在のウィンドウの全タブをブックマークに保存
 */
async function saveAllTabs() {
  try {
    const settings = await getSettings();
    const tabs = await chrome.tabs.query({ currentWindow: true });

    // 各タブのページデータを取得
    const pages = [];
    for (const tab of tabs) {
      try {
        const data = await extractPageData(tab.id);
        pages.push({
          title: data.title || tab.title || '',
          text: data.text || '',
          url: tab.url || ''
        });
      } catch (error) {
        console.warn(`Failed to process tab ${tab.id}:`, error);
      }
    }

    // フォルダ名を生成（日付 + 要約）
    const now = new Date();
    const dateStr = formatDate(now, settings.dateFormat, settings.includeTime);
    const summary = await buildFolderSummary(pages, settings);
    const folderName = summary ? `${dateStr}_${summary}` : `${dateStr}`;

    // フォルダを作成（「その他のお気に入り > Tab_Logger」の下に）
    const folderId = await createFolder(folderName);

    // 各ページをブックマークに追加
    for (const page of pages) {
      try {
        const title = formatBookmarkTitle(page, settings);
        await chrome.bookmarks.create({
          parentId: folderId,
          title,
          url: page.url
        });
      } catch (error) {
        console.warn('Failed to create bookmark:', error);
      }
    }

    // 完了後、タブを閉じるオプション
    if (settings.closeTabsAfterSave) {
      const tabIds = tabs.map(tab => tab.id);
      chrome.tabs.remove(tabIds);
    }

    console.log(`Successfully saved ${pages.length} tabs to "${folderName}"`);
  } catch (error) {
    console.error('Tab Logger error:', error);
  }
}

// アイコンクリック時
chrome.action.onClicked.addListener(saveAllTabs);

// キーボードショートカット（Ctrl+Shift+L）
chrome.commands.onCommand.addListener((command) => {
  if (command === 'bookmark_all_tabs') {
    saveAllTabs();
  }
});

// 拡張機能インストール時
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(DEFAULT_SETTINGS);
});
