
// Tab Logger v2
// フォルダ名を `<日付>_<タブ要約>` にする。各ブックマーク名はページタイトル中心。

const DEFAULT_SETTINGS = {
  language: 'ja',
  dateFormat: 'YYYY-MM-DD',
  includeTime: true, // HHmm
  closeTabsAfterSave: false,
  maxTitleLength: 100,
  folderSummaryMaxChars: 40, // フォルダ名用の要約最大長
  bookmarkTitleFormat: 'title', // 'title' | 'domain-title' | 'title-summary'
  useLLM: false,
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  parentFolder: 'bookmarksBar'
};

function pad(n){return n<10?'0'+n:''+n;}
function formatDate(now, fmt, includeTime){
  const y=now.getFullYear(); const m=pad(now.getMonth()+1); const d=pad(now.getDate());
  let base = fmt.replace('YYYY', y).replace('MM', m).replace('DD', d);
  if(includeTime){ base += ` ${pad(now.getHours())}${pad(now.getMinutes())}`; }
  return base;
}
function truncate(s,max){ if(!s) return ''; return s.length<=max? s : s.slice(0,max-1)+'…'; }

async function getSettings(){
  return new Promise(res=>chrome.storage.local.get(DEFAULT_SETTINGS, v=>res(Object.assign({},DEFAULT_SETTINGS,v))));
}

async function extractPageData(tabId){
  const res = await chrome.scripting.executeScript({ target:{tabId}, files:['content.js']});
  return res && res[0] && res[0].result ? res[0].result : {title:'', text:''};
}

async function llmSummarize(text, settings, targetLen){
  try{
    const payload = { model: settings.openaiModel, messages:[{role:'user', content:`以下の複数ページの内容を端的に総括し、日本語で${targetLen}文字程度の短いフレーズ（名詞句/短文）にしてください。\n\n${text}` }], temperature:0.2 };
    const resp = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${settings.openaiApiKey}`}, body: JSON.stringify(payload)});
    const json = await resp.json();
    return truncate(json.choices?.[0]?.message?.content?.trim()||'', settings.folderSummaryMaxChars);
  }catch(e){ console.warn('LLM failed', e); return ''; }
}

function localKeywordsSummary(text, maxChars){
  const cleaned = (text||'').replace(/\s+/g,' ').replace(/[\r\n]+/g,' ').trim();
  const words = cleaned.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9]{2,}/gu) || [];
  const stop = new Set(['こと','ため','これ','それ','そして','また','など','に','の','を','が','は','へ','で','と','や','も','から','まで','です','ます','する','した','して','いる','ある','ない','なる']);
  const freq = new Map();
  for(const w of words){ if(stop.has(w)) continue; freq.set(w,(freq.get(w)||0)+1); }
  const top = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([w])=>w);
  const phrase = top.join('・');
  return truncate(phrase || cleaned.slice(0, maxChars), maxChars);
}

async function buildFolderSummary(pages, settings){
  // pages: [{title,text, url}]
  const corpus = pages.map(p=>`${p.title}\n${p.text}`).join('\n---\n');
  if(settings.useLLM && settings.openaiApiKey){
    const s = await llmSummarize(corpus, settings, settings.folderSummaryMaxChars);
    if(s) return s;
  }
  return localKeywordsSummary(corpus, settings.folderSummaryMaxChars);
}

function formatBookmarkTitle(page, settings){
  const url = page.url||''; let domain=''; try{ domain=new URL(url).hostname; }catch{}
  const title = (page.title||'').trim()||domain||'Untitled';
  switch(settings.bookmarkTitleFormat){
    case 'domain-title': return truncate(`${domain?domain+' — ':''}${title}`, settings.maxTitleLength);
    case 'title-summary': {
      const s = localKeywordsSummary(page.text, Math.max(20, Math.floor(settings.maxTitleLength/3)));
      return truncate(`${title}${s? ' — '+s:''}`, settings.maxTitleLength);
    }
    default: return truncate(title, settings.maxTitleLength);
  }
}

async function createFolder(name, parent){
  const tree = await chrome.bookmarks.getTree();
  const roots = tree[0].children || [];
  const bar = roots.find(n=>n.title==='Bookmarks bar' || n.title==='ブックマーク バー' || n.id==='1');
  const other = roots.find(n=>n.title==='Other bookmarks' || n.title==='その他のブックマーク' || n.id==='2');
  const parentId = parent==='otherBookmarks' && other ? other.id : (bar?.id || '1');
  const folder = await chrome.bookmarks.create({ title:name, parentId });
  return folder.id;
}

async function run(){
  const settings = await getSettings();
  const tabs = await chrome.tabs.query({ currentWindow:true });
  const pages = [];
  for(const tab of tabs){
    try{
      const data = await extractPageData(tab.id);
      pages.push({ title: data.title || tab.title || '', text: data.text || '', url: tab.url || '' });
    }catch(e){ console.warn('extract failed', e); }
  }
  const now = new Date();
  const dateStr = formatDate(now, settings.dateFormat, settings.includeTime);
  const summary = await buildFolderSummary(pages, settings);
  const folderName = summary ? `${dateStr}_${summary}` : `${dateStr}`;
  const folderId = await createFolder(folderName, settings.parentFolder);

  for(const p of pages){
    try{
      const title = formatBookmarkTitle(p, settings);
      await chrome.bookmarks.create({ parentId: folderId, title, url: p.url });
    }catch(e){ console.warn('bookmark failed', e); }
  }

  if(settings.closeTabsAfterSave){
    const ids = tabs.map(t=>t.id);
    chrome.tabs.remove(ids);
  }
}

chrome.action.onClicked.addListener(run);
chrome.commands.onCommand.addListener(cmd=>{ if(cmd==='bookmark_all_tabs') run(); });

chrome.runtime.onInstalled.addListener(()=>{ chrome.storage.local.set(DEFAULT_SETTINGS); });
