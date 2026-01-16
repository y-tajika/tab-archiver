
/**
 * Content Script: ページのメタデータを抽出
 * - タイトル
 * - Meta description
 * - H1見出し
 * - 最初の3段落
 */

function extractPageMetadata() {
  try {
    const title = (document.title || '').trim();
    
    const description = (
      document.querySelector('meta[name="description"]')?.content || ''
    ).trim();
    
    const headings = Array.from(document.querySelectorAll('h1'))
      .map(element => (element.textContent || '').trim())
      .join('。');
    
    const paragraphs = Array.from(document.querySelectorAll('p'))
      .slice(0, 3)
      .map(element => (element.textContent || '').trim())
      .join('。');
    
    // テキストを結合
    const text = [description, headings, paragraphs]
      .filter(Boolean)
      .join('。')
      .trim();

    return { title, text };
  } catch (error) {
    console.error('Failed to extract page metadata:', error);
    return {
      title: document.title || '',
      text: ''
    };
  }
}

// バックグラウンドスクリプトから呼び出される
extractPageMetadata();
