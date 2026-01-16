/**
 * TabArchiver - 共通定数定義
 */

// デフォルト設定
export const DEFAULT_SETTINGS = {
  language: 'ja',
  dateFormat: 'MM-DD',
  includeTime: false,
  closeTabsAfterSave: false,
  maxTitleLength: 100,
  folderSummaryMaxChars: 30,
  useCustomFolder: false,
  targetFolderId: null,
  windowSaveMode: 'all-windows' // 'current' | 'all-windows'
};

// ストップワード（要約から除外する単語）
export const STOPWORDS = new Set([
  // 日本語: 助詞
  'が', 'の', 'を', 'に', 'へ', 'と', 'から', 'より', 'で', 'や',
  'か', 'も', 'は', 'ば', 'まで', 'し', 'て', 'な', 'だ', 'ね',
  
  // 日本語: 助動詞・接続詞
  'です', 'ます', 'だ', 'である', 'でした', 'ました',
  'する', 'した', 'して', 'される', 'された',
  'いる', 'いた', 'いて', 'ある', 'あった', 'あって',
  'ない', 'なかった', 'なくて', 'なる', 'なった', 'なって',
  'そして', 'また', 'しかし', 'でも', 'けど', 'だけど',
  'ただし', 'なお', 'そこで', 'それで', 'そのため',
  
  // 日本語: 代名詞・一般的な語
  'これ', 'それ', 'あれ', 'この', 'その', 'あの',
  'こと', 'もの', 'ため', 'とき', 'ところ', 'よう',
  'など', 'なに', 'なん', 'だれ', 'どこ', 'いつ',
  'について', 'における', 'による', 'とは', 'として',
  
  // 英語: 冠詞・前置詞
  'a', 'an', 'the',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'over',
  
  // 英語: 代名詞
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'this', 'that', 'these', 'those',
  
  // 英語: be動詞・助動詞
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'will', 'would', 'shall', 'should', 'can', 'could',
  'may', 'might', 'must',
  
  // 英語: 接続詞
  'and', 'or', 'but', 'so', 'yet', 'nor',
  
  // 技術・ドメイン関連（一般的すぎる単語）
  'powered', 'by', 'box', 'github', 'gitlab', 'bitbucket',
  'sharepoint', 'microsoft', 'google', 'apple', 'amazon',
  'chrome', 'edge', 'firefox', 'safari', 'opera', 'brave',
  'windows', 'mac', 'macos', 'linux', 'ubuntu', 'android', 'ios',
  'com', 'net', 'org', 'co', 'jp', 'uk', 'io', 'ai', 'dev',
  'www', 'http', 'https', 'ftp', 'api', 'cdn',
  'page', 'site', 'web', 'blog', 'home', 'index',
  'new', 'tab', 'window', 'untitled', 'blank', 'default'
]);
