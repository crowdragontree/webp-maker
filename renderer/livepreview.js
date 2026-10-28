// Live preview of the Greeting and the Introduction, next to the text you edit.
//  - Greeting: the finished Greeting as it will read in chat. A picture marker such as ![](image1) shows as a grey box "image 1";
//    a marker with a real address, ![](https://...), shows the picture itself.
//  - Introduction: the AI still writes plain text (the template's own length limit, 500 characters by default, is untouched).
//    You can paste your own HTML for the Introduction (each series has its own look) and the preview wraps the Introduction in it.
//    The HTML is never added to the bot, counted in a limit or sent to the AI. The only place it leaves is the Copy Introduction button, which copies the finished HTML when a saved style is applied.
// The pasted HTML runs in a frame that cannot run scripts. Styles are kept in this computer's browser storage, by name.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const K_STYLES = 'jbs.introStyles', K_SEL = 'jbs.introStyleSel', K_SERIES = 'jbs.introStyleBySeries';
  const rd = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be unavailable: the preview still works */ } };
  const safeUrl = u => /^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '';

  // ---- Greeting markdown -> HTML (images, *italic*, **bold**, ***both***, line breaks, ---)
  function inline(t) {
    let s = esc(t);
    s = s.replace(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g, (m, u) => `<img class="lp-inl" src="${u}" alt="" referrerpolicy="no-referrer" loading="lazy">`);
    s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    return s;
  }
  const fileOf = u => { try { return decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || u); } catch { return u; } };
  function md(text) {
    const out = []; let para = [], seenText = false, nImg = 0, nTop = 0;
    const flush = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trim();
      const img = line.match(/^!\[[^\]]*\]\(([^)\s]*)\)$/);
      if (img) {
        flush();
        const url = safeUrl(img[1]), n = (img[1].match(/^image\s*(\d+)$/i) || [])[1];
        // pictures above the first story line are the banner and the divider(s); the rest are numbered
        let kind, label;
        if (!seenText) { kind = nTop++ === 0 ? 'banner' : 'divider'; label = kind; } else { nImg++; kind = 'image'; label = 'image ' + (n || nImg); }
        out.push(url ? `<div class="lp-img lp-real lp-${kind}"><img src="${esc(url)}" alt="" referrerpolicy="no-referrer" loading="lazy"><span class="lp-tag">${esc(label)} \u00b7 ${esc(fileOf(url))}</span></div>`
          : `<div class="lp-img lp-ph lp-${kind}"><span class="lp-tag">${esc(label)}</span></div>`);
      } else if (/^-{3,}$/.test(line) || /^\*{3,}$/.test(line)) { flush(); out.push('<hr>'); }
      else if (!line) flush();
      else { if (!/^\*\*\*.*\*\*\*$/.test(line)) seenText = true; para.push(inline(line)); }
    }
    flush();
    return out.join('');
  }

  // ---- HTML typed or pasted straight into the Introduction box: it shows as HTML in the preview, and only the words you can read count toward the limit
  const HTML_TAG = /<\/?(?:div|p|span|br|img|a|b|i|u|em|strong|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|center|font|section|article|hr|style|small|sub|sup|blockquote)\b[^>]*>/i;
  const hasHtml = t => HTML_TAG.test(String(t || ''));
  const visibleText = t => {
    t = String(t || ''); if (!hasHtml(t)) return t;
    return t.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, ' ').replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ').trim();
  };
  const cleanHtml = h => String(h || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<\/?(?:iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // ---- Introduction: the pasted HTML, with this bot's Introduction put where its story text is
  const stripTag = t => String(t || '').replace(/^\s*(?:\[[^\]\n]{1,40}\]\s*)+/, '').trim();      // the "[Series 00]" tag is for the listing, not the story
  function wrapIntro(html, d) {
    let clean = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<\/?(?:iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '');
    if (!clean.trim()) return '';
    // the bot version tag in the pasted HTML follows the version being edited: a Futa tag becomes [Female Bot] on the Female version and the other way round
    if (d.variant && d.tag) clean = clean.replace(/\[[^\]\n<>]{0,60}(?:futa\s*bot|female\s*bot|male\s*\/\s*female\s*pov|any\s*pov)[^\]\n<>]{0,60}\]/gi, m => d.variant === 'female' ? (/female\s*bot/i.test(m) && !/futa|pov/i.test(m) ? m : d.tag) : (/^\[\s*female\s*bot\s*\]$/i.test(m) ? d.tag : m)).replace(/\{\{\s*tag\s*\}\}/gi, d.tag);
    // the series number: taken from the Introduction's own tag ("[Gentle Giant Series 31]") and put into every "Series NN" of the pasted HTML (a digit number, or a placeholder written XX, NN or ##); {{series}} and {{number}} work too. A 00 stays as pasted.
    { const lead = (String(d.intro || '').match(/^\s*(?:\[[^\]\n]{1,60}\]\s*)+/) || [''])[0], sm = lead.match(/([A-Za-z][A-Za-z' ]*?)\s+Series\s+(\d{1,4})/i);
      if (sm && parseInt(sm[2], 10) > 0) clean = clean.replace(/(series\s+)(?:\d{1,4}|x{1,4}|n{1,4}|#{1,4})(?![A-Za-z0-9])/gi, '$1' + sm[2]).replace(/\{\{\s*series\s*\}\}/gi, esc(`${sm[1].trim()} Series ${sm[2]}`)).replace(/\{\{\s*number\s*\}\}/gi, sm[2]); }
    { const lead2 = (String(d.intro || '').match(/^\s*(?:\[[^\]\n]{1,60}\]\s*)+/) || [''])[0], gs = [...lead2.matchAll(/\[([^\]\n]{1,60})\]/g)].map(m => m[1].trim());     // {{series}}: the words in the first [bracket] that is not a Futa / Female / POV version tag
      clean = clean.replace(/\{\{\s*series\s*\}\}/gi, esc(gs.find(g => !/futa\s*bot|female\s*bot|male\s*\/\s*female\s*pov|any\s*pov/i.test(g)) || '')); }
    const intro = stripTag(d.intro);
    if (/\{\{\s*(?:intro|name|scene)\s*\}\}/i.test(clean))
      return clean.replace(/\{\{\s*intro\s*\}\}/gi, esc(intro)).replace(/\{\{\s*name\s*\}\}/gi, esc(d.name || '')).replace(/\{\{\s*scene\s*\}\}/gi, esc(d.scene || ''));
    const doc = new DOMParser().parseFromString('<body>' + clean + '</body>', 'text/html');
    const leaves = [...doc.body.querySelectorAll('*')].filter(el => !el.children.length && el.textContent.trim().length >= 60);
    let pick = leaves.sort((a, b) => b.textContent.trim().length - a.textContent.trim().length)[0];
    if (!pick) {                                                              // no story text in the pasted HTML: put it in the innermost box
      pick = doc.body.firstElementChild; while (pick && pick.lastElementChild && pick.lastElementChild.tagName === 'DIV') pick = pick.lastElementChild;
      if (!pick) return `<div>${esc(intro)}</div>`;
      const box = doc.createElement('div'); box.textContent = intro; pick.appendChild(box); return doc.body.innerHTML;
    }
    pick.textContent = intro;
    return doc.body.innerHTML;
  }
  const frameDoc = body => `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>html,body{margin:0;background:#121018;overflow:hidden}body{display:flow-root;padding:10px;font-family:system-ui,"Segoe UI",sans-serif}img{max-width:100%}</style></head><body>${body}</body></html>`;

  // ---- the panes
  const S = {};                                                              // per pane: its elements and state
  function fitFrame(fr) {
    // the frame is as tall as the Introduction inside it; it is measured again whenever it is shown, resized or its pictures load (a frame drawn while its section was hidden was stuck at 120px)
    const go = () => { try { const d = fr.contentDocument; if (d && d.documentElement && fr.getBoundingClientRect().width > 0) { const bd = d.body || d.documentElement, cs = d.defaultView.getComputedStyle(bd), n = Math.ceil(bd.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0)); const h = Math.max(120, n) + 'px'; if (fr.style.height !== h) fr.style.height = h;   /* measure the content itself, not the frame: scrollHeight never drops below the frame's own height, so +4 grew it forever */ } } catch { /* cross-origin: keep the height */ } };
    fr.addEventListener('load', () => { go(); try { fr.contentDocument.querySelectorAll('img').forEach(i => i.addEventListener('load', go)); if (typeof ResizeObserver !== 'undefined') new ResizeObserver(go).observe(fr.contentDocument.body); } catch { /* ignore */ } setTimeout(go, 400); setTimeout(go, 1500); });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(go).observe(fr);
    window.addEventListener('resize', go);
  }
  function mountOne(el) {
    const key = el.dataset.live;
    if (el._lp) return;
    el._lp = true;
    if (key === 'greeting') {
      el.innerHTML = '<div class="lp-head"><b>Live preview</b><span>as it shows in chat</span></div><div class="lp-body lp-chat" data-lp="body"></div>';
      S[key] = {el, body: el.querySelector('[data-lp="body"]')};
      return;
    }
    if (key !== 'introduction') {                                              // Basics, Personality, Scenario, Image Generation, Tags, Scene Breakdown: the finished section as it goes into the bot
      el.innerHTML = '<div class="lp-head"><b>Live preview</b><span>as it goes into the bot</span></div><div class="lp-body lp-doc" data-lp="body"></div>';
      S[key] = {el, body: el.querySelector('[data-lp="body"]'), doc: true};
      return;
    }
    el.innerHTML = `<div class="lp-head"><b>Live preview</b><span>how it reads in chat</span></div>
      <div class="lp-body" data-lp="body"></div>
      <details class="lp-style" data-lp="det"><summary>Introduction style (your own HTML)</summary>
        <div class="lp-row"><label>Style <select data-lp="sel"></select></label><label>Name <input type="text" data-lp="name" placeholder="for example Standalone" maxlength="40"></label></div>
        <textarea data-lp="html" rows="9" spellcheck="false" placeholder="Paste the HTML of one finished Introduction here. The longest block of text in it is replaced with this bot's Introduction. Or write {{intro}}, {{name}} and {{scene}} where they belong."></textarea>
        <div class="lp-row lp-btns"><button type="button" class="ghost" data-lp="save">Save style</button><button type="button" class="ghost" data-lp="del">Delete style</button></div>
        <p class="lp-note">Preview only. The Introduction the AI writes stays plain text, inside the template's own limit, and this HTML is never added to the bot, counted or sent to the AI. The [Series 00] tag at the start is left out of the preview. With a saved style applied, <b>Copy Introduction</b> copies this finished HTML code. Styles are saved on this computer and picked again for the same series.</p>
      </details>`;
    const st = S[key] = {el, body: el.querySelector('[data-lp="body"]'), sel: el.querySelector('[data-lp="sel"]'), name: el.querySelector('[data-lp="name"]'), html: el.querySelector('[data-lp="html"]'), data: null, series: null};
    const styles = () => rd(K_STYLES, {});
    const fillSel = (want) => {
      const names = Object.keys(styles()).sort((a, b) => a.localeCompare(b));
      st.sel.innerHTML = '<option value="">No style (plain text)</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') + '<option value="__new">New style…</option>';
      st.sel.value = [...st.sel.options].some(o => o.value === want) ? want : '';
    };
    const load = () => { const v = st.sel.value; if (v && v !== '__new') { st.name.value = v; st.html.value = styles()[v] || ''; } else if (v === '__new') { st.name.value = ''; st.html.value = ''; } wr(K_SEL, v === '__new' ? '' : v); if (st.series && v !== '__new') { const m = rd(K_SERIES, {}); if (v) m[st.series] = v; else delete m[st.series]; wr(K_SERIES, m); } draw(); };
    st.fillSel = fillSel;
    st.applyStyle = (name, html) => { const all = styles(); all[name] = html; wr(K_STYLES, all); fillSel(name); st.sel.value = name; load(); st.sig = null; };
    st.sel.addEventListener('change', load);
    let t = null; st.html.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 250); });
    el.querySelector('[data-lp="save"]').addEventListener('click', () => {
      const name = (st.name.value || '').trim() || (st.series ? String(st.series) : 'My style'), all = styles(); all[name] = st.html.value; wr(K_STYLES, all);
      fillSel(name); st.sel.value = name; load();
    });
    el.querySelector('[data-lp="del"]').addEventListener('click', () => {
      const n = st.sel.value; if (!n || n === '__new') return; const all = styles(); delete all[n]; wr(K_STYLES, all);
      const m = rd(K_SERIES, {}); for (const k of Object.keys(m)) if (m[k] === n) delete m[k]; wr(K_SERIES, m);
      fillSel(''); st.name.value = ''; st.html.value = ''; wr(K_SEL, ''); draw();
    });
    function draw() {
      const d = st.data || {}, usingStyle = st.sel.value !== '' && st.html.value.trim();
      if (d.html && d.html.trim() && !hasHtml(d.text)) {                  // HTML you edited by hand under "View as HTML": shown as you wrote it
        st.body.innerHTML = '';
        const fr1 = document.createElement('iframe'); fr1.className = 'lp-frame'; fr1.setAttribute('sandbox', 'allow-same-origin'); fr1.setAttribute('title', 'Introduction preview'); fr1.setAttribute('scrolling', 'no');
        fitFrame(fr1); fr1.srcdoc = frameDoc(cleanHtml(d.html)); st.body.appendChild(fr1); return;
      }
      if (hasHtml(d.text)) {                                              // the Introduction box itself holds HTML: show it as it is
        st.body.innerHTML = '';
        const fr0 = document.createElement('iframe'); fr0.className = 'lp-frame'; fr0.setAttribute('sandbox', 'allow-same-origin'); fr0.setAttribute('title', 'Introduction preview'); fr0.setAttribute('scrolling', 'no');
        fitFrame(fr0); fr0.srcdoc = frameDoc(cleanHtml(d.text)); st.body.appendChild(fr0); return;
      }
      if (!usingStyle) { st.body.innerHTML = `<div class="lp-chat"><p>${esc(stripTag(d.text) || '')}</p></div>`; return; }
      let wrapped = ''; try { wrapped = wrapIntro(st.html.value, {intro: d.text, name: d.name, scene: d.scene, variant: d.variant, tag: d.tag}); } catch { wrapped = ''; }
      st.body.innerHTML = '';
      const fr = document.createElement('iframe'); fr.className = 'lp-frame'; fr.setAttribute('sandbox', 'allow-same-origin'); fr.setAttribute('title', 'Introduction preview'); fr.setAttribute('scrolling', 'no');
      fitFrame(fr); fr.srcdoc = frameDoc(wrapped); st.body.appendChild(fr);
    }
    st.draw = draw;
    fillSel(rd(K_SEL, ''));
    if (st.sel.value) { st.name.value = st.sel.value; st.html.value = styles()[st.sel.value] || ''; }
  }
  // ---- the other sections: the finished text, label by label (display only)
  const PH = t => esc(t).replace(/\[([^\]\n]{1,60})\]/g, '<mark class="lp-field">[$1]</mark>');
  function docHtml(key, text) {
    const t = String(text || '').replace(/\r/g, '').trim();
    if (!t) return '<p class="lp-empty">Nothing here yet. Fill in the fields on the left.</p>';
    if (key === 'tags') return '<div class="lp-tags">' + t.split('\n').map(x => x.trim()).filter(Boolean).map(x => `<span class="lp-chip">${esc(x)}</span>`).join('') + '</div>';
    const line = l => { const m = l.match(/^([A-Z][A-Za-z0-9 \/&'\u2019()+-]{1,40}):\s*(.*)$/); return m ? `<div class="lp-line"><b>${esc(m[1])}</b>${m[2] ? ' ' + PH(m[2]) : ''}</div>` : `<div class="lp-line">${PH(l)}</div>`; };
    if (key === 'scene') return t.split(/\n\s*\n/).map(b => { const ls = b.split('\n'); return `<div class="lp-card"><div class="lp-card-t">${PH(ls[0])}</div>${ls.slice(1).map(line).join('')}</div>`; }).join('');
    return t.split(/\n\s*\n/).map(b => `<div class="lp-block">${b.split('\n').map(line).join('')}</div>`).join('');
  }
  function mount() { document.querySelectorAll('[data-live]').forEach(mountOne); }
  function update(key, payload) {
    mount();
    const st = S[key]; if (!st || !st.el.isConnected) { const el = document.querySelector(`[data-live="${key}"]`); if (el) { el._lp = false; mountOne(el); } }
    const s = S[key]; if (!s) return;
    if (key === 'greeting') { const html = md(payload); if (s.last !== html || !s.body.firstChild) { s.last = html; s.body.innerHTML = html; s.body.querySelectorAll('img').forEach(i => i.addEventListener('error', () => { const box = document.createElement('div'); box.className = 'lp-img lp-ph lp-broken'; box.innerHTML = `<span>picture did not load</span><small>${esc(i.getAttribute('src') || '')}</small>`; (i.closest('.lp-img') || i).replaceWith(box); })); } return; }
    if (s.doc) { const sig0 = String(payload); if (s.sig === sig0) return; s.sig = sig0; s.body.innerHTML = docHtml(key, payload); return; }
    const p = payload || {};
    // a new series picks the style it was last shown with
    if (p.series !== s.series) { s.series = p.series || null; const want = s.series ? rd(K_SERIES, {})[s.series] : ''; if (want && [...s.sel.options].some(o => o.value === want) && s.sel.value !== want) { s.sel.value = want; s.name.value = want; s.html.value = rd(K_STYLES, {})[want] || ''; wr(K_SEL, want); } }
    const sig = JSON.stringify([p.text, p.name, p.scene, p.variant, p.tag, p.html || '', s.sel.value, s.html.value]);
    if (s.sig === sig) return; s.sig = sig; s.data = p; s.draw();
  }
  // the finished Introduction as HTML code, exactly as the preview shows it, for the Copy button. '' when no saved style is applied (or the box already holds HTML): Copy then gives the plain Introduction as before
  function finalHtml(p) {
    const s = S.introduction; p = p || {};
    if (p.html && p.html.trim() && !hasHtml(p.text)) return p.html;     // HTML you edited by hand: copied exactly as you wrote it
    if (!s || !s.sel || !s.html || hasHtml(p.text)) return '';
    if (s.sel.value === '' || s.sel.value === '__new' || !s.html.value.trim()) return '';
    try { return wrapIntro(s.html.value, {intro: p.text, name: p.name, scene: p.scene, variant: p.variant, tag: p.tag}).trim(); } catch { return ''; }
  }
  // the HTML shown under "View as HTML": the styled Introduction when a saved style is applied, otherwise the plain text in a simple box
  function baseHtml(p) {
    p = Object.assign({}, p || {}, {html: ''});
    return finalHtml(p) || (hasHtml(p.text) ? String(p.text) : `<div>${esc(stripTag(p.text))}</div>`);
  }
  // Save a style and apply it (what the Save style button does), for the Introduction Designer's Save and Return
  function applyStyle(name, html) { mount(); const s = S.introduction; if (!s || !s.applyStyle) return false; s.applyStyle(String(name || 'My style').slice(0, 40), String(html || '')); return true; }
  const API = {md, wrapIntro, stripTag, mount, update, hasHtml, visibleText, finalHtml, baseHtml, applyStyle};
  if (typeof window !== 'undefined') window.LivePreview = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
