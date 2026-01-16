
(() => {
  try{
    const title = (document.title||'').trim();
    const desc = (document.querySelector('meta[name="description"]')?.content||'').trim();
    const h1 = Array.from(document.querySelectorAll('h1')).map(el=> (el.textContent||'').trim()).join('。');
    const p = Array.from(document.querySelectorAll('p')).slice(0,3).map(el=> (el.textContent||'').trim()).join('。');
    const text = [desc,h1,p].filter(Boolean).join('。').trim();
    return { title, text };
  }catch(e){ return { title: document.title||'', text: '' }; }
})();
