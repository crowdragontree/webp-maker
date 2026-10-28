/* Colour-coded HTML boxes (the Introduction's "View as HTML" and the Introduction style box under the Live preview).
   A box is a normal textarea with transparent text over a <pre> that paints the same text in colours. The <pre> decides the height, so the box always
   shows ALL of its HTML (no inner scrolling, no row count) and both lines wrap the same way. Only how the code looks changes, never the text. */
(function () {
  'use strict';
  const E = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sp = (c, s) => s ? `<span class="${c}">${E(s)}</span>` : '';
  function styleValue(q, css) {                                    // style="prop: value; prop: value"
    const inner = css.slice(1, -1), open = q ? E(css[0]) : '';
    const parts = inner.split(';').map((d, i, a) => {
      const m = /^(\s*)([A-Za-z-]+)(\s*:\s*)([\s\S]*)$/.exec(d);
      const tail = i < a.length - 1 ? ';' : '';
      return m ? `${E(m[1])}${sp('hl-cp', m[2])}${sp('hl-p', m[3])}${sp('hl-cv', m[4])}${E(tail)}` : E(d) + E(tail);
    }).join('');
    return `${sp('hl-v', css[0])}${parts}${sp('hl-v', css[css.length - 1])}`;
  }
  function tag(t) {
    const m = /^<(\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?)>$/.exec(t); if (!m) return E(t);
    let out = sp('hl-p', '<' + m[1]) + sp('hl-t', m[2]), rest = m[3], last = 0, a;
    const re = /(\s+)([^\s=\/>"']+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
    while ((a = re.exec(rest))) {
      out += E(rest.slice(last, a.index)) + E(a[1]) + sp('hl-a', a[2]);
      if (a[3] != null) out += sp('hl-p', a[3]) + (a[2].toLowerCase() === 'style' && /^["']/.test(a[4]) ? styleValue(true, a[4]) : sp('hl-v', a[4]));
      last = re.lastIndex;
    }
    return out + E(rest.slice(last)) + sp('hl-p', m[4] + '>');
  }
  function highlight(src) {
    return String(src || '').replace(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|&[#A-Za-z0-9]+;|[^<&]+|[<&]/g, tok =>
      tok.startsWith('<!--') ? sp('hl-c', tok) : tok[0] === '<' && tok.length > 1 ? tag(tok) : tok[0] === '&' && tok.length > 1 ? sp('hl-e', tok) : E(tok));
  }
  function attach(ta) {
    if (!ta || ta.dataset.hl) return; ta.dataset.hl = '1';
    const wrap = document.createElement('div'), pre = document.createElement('pre');
    wrap.className = 'hl-wrap'; pre.className = 'hl-pre'; pre.setAttribute('aria-hidden', 'true');
    ta.parentNode.insertBefore(wrap, ta); wrap.appendChild(pre); wrap.appendChild(ta); ta.classList.add('hl-in'); ta.spellcheck = false;
    const paint = () => { pre.innerHTML = highlight(ta.value) + '\n'; };
    const d = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    Object.defineProperty(ta, 'value', {configurable: true, get() { return d.get.call(ta); }, set(v) { d.set.call(ta, v); paint(); }});   // the app fills these boxes by code too
    ta.addEventListener('input', paint); paint();
  }
  const SEL = 'textarea[data-ihtml], textarea[data-lp="html"]';
  const scan = () => document.querySelectorAll(SEL).forEach(attach);
  window.HtmlEditor = {highlight, attach, scan};
  scan();
  if (typeof MutationObserver !== 'undefined') new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});
})();
