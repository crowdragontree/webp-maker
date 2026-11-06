/* Search (v1.6.0 Blueprint Studio, v1.5.0 Creator Tool).
 * The Search button in the top right opens a pop-up that searches the whole tool as you type:
 *   - the text of every tab (headings, rules, notes, lists, settings), including tabs that are not open
 *   - what is written in every text box (the Bot Builder's sections, settings fields); password and key fields are never searched
 *   - Blueprint Studio: every card of the week on every tab (Days, NTR, extra tabs, Bonus), field by field, even when its tab is not open
 * Several words find the places that contain all of them. A tag is searched with quotation marks: "slice of life" finds that tag,
 * "slice (no closing mark) finds every tag that starts with it.
 * Clicking a result (or Enter) goes to exactly that place: the tab opens, closed panels open, the page scrolls there and the words are marked. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const MAX_SHOWN = 100;

  // ------------------------------------------------------------------ the app this runs in
  function app() {
    if (document.querySelector('.jcct-header')) {
      return {
        name: 'creator',
        views: () => [...document.querySelectorAll('.jcct-main > .view')],
        viewOf: el => el.closest('.jcct-main > .view'),
        label: id => { const b = document.querySelector(`.jcct-tabs [data-tab="${id}"]`); return b ? clean(b.textContent.replace(/^\W+/, '')) : id; },
        go: id => { if (window.CreatorHost && typeof window.CreatorHost.switchTo === 'function') window.CreatorHost.switchTo(id); },
        current: () => { const v = document.querySelector('.jcct-main > .view.active'); return v ? v.id.replace(/^view-/, '') : ''; },
        mount: btn => { const h = document.querySelector('.jcct-header'); if (h) h.appendChild(btn); },
        skip: '#view-introduction, #view-analytics'  // the Introduction Editor and the Analytics tab are separate pages inside a frame
      };
    }
    return {
      name: 'blueprint',
      views: () => [...document.querySelectorAll('main.main > .view')],
      viewOf: el => el.closest('main.main > .view'),
      label: id => {
        const b = document.querySelector(`#main-nav [data-view="${id}"], #sub-nav [data-view="${id}"]`); if (!b) return id;
        const own = clean(b.textContent.replace(/^\W+/, '')), row = b.closest('.sub-row');
        const g = row && document.querySelector(`#main-nav [data-group="${row.dataset.group}"]`);
        return g ? `${clean(g.textContent.replace(/^\W+/, ''))} › ${own}` : own;
      },
      go: id => { if (typeof window.switchView === 'function') window.switchView(id); },
      current: () => { const v = document.querySelector('main.main > .view.active'); return v ? v.id.replace(/^view-/, '') : ''; },
      mount: btn => { const r = document.querySelector('.sidebar .sb-right'); if (r) r.insertBefore(btn, r.firstChild); else document.body.appendChild(btn); },
      skip: '#week-content'                           // the cards are searched from the week itself, every tab at once
    };
  }
  let A = null;

  // ------------------------------------------------------------------ what can be found
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'SELECT', 'OPTION', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'INPUT', 'BUTTON']);
  const BLOCK = 'p,li,td,th,h1,h2,h3,h4,h5,h6,summary,label,pre,dt,dd,blockquote,figcaption,.bb-issue,.scenario-field,.panel-head,.micro,.note,.hint';
  const HEAD = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > summary, :scope > legend, :scope > .panel-head h3, :scope > .panel-head h2, :scope > header h2, :scope > header h3, :scope > .day-heading h2';
  const SECRET = /pass|key|token|secret|cookie|auth/i;

  // a heading's own words: a summary bar also holds counts and buttons, so its title part is taken when it has one
  const headText = h => { const t = h.tagName === 'SUMMARY' ? h.querySelector('.bb-sec-title, h2, h3, h4, h5, strong, b') : null; return clean((t || h).textContent); };
  function headingFor(el, view) {
    for (let a = el; a && a !== view; a = a.parentElement) {
      const h = a.querySelector(HEAD);
      if (h && h !== el && !h.contains(el) && headText(h)) return headText(h).slice(0, 90);
    }
    return '';
  }
  const hiddenInside = (el, view) => { for (let a = el; a && a !== view; a = a.parentElement) if (a.hidden || a.getAttribute('aria-hidden') === 'true' || a.classList.contains('ts-modal') || a.classList.contains('tm-ov')) return true; return false; };

  function indexView(view) {
    const id = view.id.replace(/^view-/, ''), where = A.label(id), out = [];
    if (A.skip && view.matches(A.skip)) return out;
    const skipBox = A.skip ? view.querySelector(A.skip) : null;
    // the words on the page, gathered per block (a paragraph, a list line, a table cell, a heading)
    const per = new Map();
    const tw = document.createTreeWalker(view, NodeFilter.SHOW_TEXT, {acceptNode: n => {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
      if (skipBox && skipBox.contains(p)) return NodeFilter.FILTER_REJECT;
      for (let a = p; a && a !== view; a = a.parentElement) if (SKIP_TAGS.has(a.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const b = n.parentElement.closest(BLOCK) || n.parentElement;
      const blk = view.contains(b) ? b : n.parentElement;
      if (!per.has(blk)) per.set(blk, []);
      per.get(blk).push(n.nodeValue);
    }
    for (const [el, parts] of per) {
      if (hiddenInside(el, view)) continue;
      const text = clean(parts.join(' ')); if (text.length < 2) continue;
      const head = headingFor(el, view);
      out.push({kind: 'text', view: id, where, el, text, title: head || where, head: !!head});
    }
    // what is written in the text boxes
    for (const box of view.querySelectorAll('textarea, input')) {
      if (box.tagName === 'INPUT' && !/^(text|search|url|email|)$/i.test(box.type || '')) continue;
      if (box.closest('.ts-modal') || (skipBox && skipBox.contains(box))) continue;
      if (SECRET.test(`${box.id} ${box.name} ${box.className} ${box.getAttribute('autocomplete') || ''}`) && box.tagName === 'INPUT') continue;
      const text = String(box.value || ''); if (!text.trim()) continue;
      const lab = box.closest('label'), labTxt = lab ? clean([...lab.childNodes].filter(c => c !== box && !(c.matches && c.matches('textarea,input,select'))).map(c => c.textContent).join(' ')) : '';
      const det = box.closest('details'), sum = det && det.querySelector(':scope > summary');
      const sec = sum ? headText(sum).slice(0, 60) : '';
      const name = labTxt || box.getAttribute('aria-label') || box.placeholder || '';
      const title = clean(name).slice(0, 90) || sec || headingFor(box, view);
      out.push({kind: 'field', view: id, where: sec ? `${where} › ${sec}` : where, el: box, text, title: title || where, head: !!title});
    }
    return out;
  }

  function indexCards() {
    const S = window.__jbsSearch; if (!S || typeof S.cards !== 'function') return [];
    const out = [];
    let cards = []; try { cards = S.cards(); } catch (_) { cards = []; }
    for (const c of cards) {
      const where = `${A.label('weekly')} › ${c.tabLabel} › ${c.scene}`;
      out.push({kind: 'card', view: 'weekly', where, card: c.id, label: '', text: c.scene, title: 'Scene name'});
      for (const [k, v] of c.fields) { const t = Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v); if (t.trim()) out.push({kind: 'card', view: 'weekly', where, card: c.id, label: k, text: t, title: k}); }
      out.push({kind: 'tags', view: 'weekly', where, card: c.id, label: 'Tags', tags: c.tags || [], text: (c.tags || []).join(', '), title: 'Tags'});
    }
    return out;
  }
  function indexBuilderTags() {
    const f = window.__bbSearchTags; if (typeof f !== 'function') return [];
    let tags = []; try { tags = f() || []; } catch (_) { tags = []; }
    return tags.length ? [{kind: 'btags', view: 'builder', where: `${A.label('builder')} › Tags`, tags, text: tags.join(', '), title: 'Tags'}] : [];
  }

  let INDEX = null;
  function build() {
    const all = [];
    for (const v of A.views()) { try { all.push(...indexView(v)); } catch (e) { console.error('search index:', v.id, e); } }
    try { all.push(...indexCards()); } catch (e) { console.error('search cards:', e); }
    try { all.push(...indexBuilderTags()); } catch (e) { console.error('search tags:', e); }
    INDEX = all;
    return all;
  }

  // ------------------------------------------------------------------ searching
  function parse(q) {
    const s = String(q || '').trim();
    const m = /^["“]([^"”]*)(["”])?$/.exec(s);
    if (m) return {tag: true, exact: !!m[2], term: m[1].trim().toLowerCase()};
    const words = [...new Set(s.toLowerCase().split(/\s+/).filter(w => w.length > 0))];
    return {tag: false, words};
  }
  const count = (h, w) => { let n = 0; for (let i = h.indexOf(w); i >= 0; i = h.indexOf(w, i + w.length)) n++; return n; };

  function search(q) {
    const P = parse(q); if (!INDEX) build();
    const res = [];
    if (P.tag) {
      if (!P.term) return {P, res};
      for (const it of INDEX) {
        if (it.kind !== 'tags' && it.kind !== 'btags') continue;
        const hit = (it.tags || []).filter(t => { const x = String(t).toLowerCase(); return P.exact ? x === P.term : x.startsWith(P.term); });
        if (hit.length) res.push({it, score: 100 + hit.length, marks: hit, n: hit.length});
      }
      return {P, res};
    }
    if (!P.words.length) return {P, res};
    for (const it of INDEX) {
      if (it.kind === 'tags' || it.kind === 'btags') continue;
      const h = it.text.toLowerCase(), t = it.kind === 'card' || it.head ? String(it.title || '').toLowerCase() : '';     // a block with no heading of its own is not found by its tab's name
      if (!P.words.every(w => h.includes(w) || t.includes(w))) continue;
      let n = 0; for (const w of P.words) n += count(h, w);
      const phrase = P.words.length > 1 && h.includes(P.words.join(' '));
      const score = n + (phrase ? 25 : 0) + (t && P.words.every(w => t.includes(w)) ? 15 : 0) + (it.kind === 'field' || it.kind === 'card' ? 6 : it.text.length < 120 ? 3 : 0);
      res.push({it, score, marks: P.words, n});
    }
    res.sort((a, b) => b.score - a.score);
    return {P, res};
  }

  // the lines of a text that hold the words, cut to the part around them, with the words marked
  function markHtml(text, words, exactTags) {
    if (exactTags) {
      const set = new Set(words.map(w => String(w).toLowerCase()));
      return String(text).split(/,\s*/).map(t => set.has(t.toLowerCase()) ? `<mark>${esc(t)}</mark>` : esc(t)).join(', ');
    }
    const ws = [...words].sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!ws.length) return esc(text);
    const re = new RegExp(ws.join('|'), 'gi'); let out = '', last = 0;
    String(text).replace(re, (m, i) => { out += esc(text.slice(last, i)) + `<mark>${esc(m)}</mark>`; last = i + m.length; return m; });
    return out + esc(text.slice(last));
  }
  function snippet(text, words) {
    const lines = String(text).split(/\n+/).map(l => l.trim()).filter(Boolean), low = words.map(w => w.toLowerCase());
    const hits = lines.filter(l => low.some(w => l.toLowerCase().includes(w)));
    return (hits.length ? hits : lines).slice(0, 3).map(l => {
      if (l.length <= 240) return l;
      const i = Math.max(0, Math.min(...low.map(w => { const k = l.toLowerCase().indexOf(w); return k < 0 ? Infinity : k; })));
      const a = Math.max(0, (Number.isFinite(i) ? i : 0) - 90), b = Math.min(l.length, a + 240);
      return (a > 0 ? '…' : '') + l.slice(a, b) + (b < l.length ? '…' : '');
    });
  }

  // ------------------------------------------------------------------ the pop-up
  let modal = null, list = null, input = null, found = [], active = 0, timer = 0;
  function open() {
    if (!modal) makeModal();
    build();
    modal.hidden = false; document.body.classList.add('ts-open');
    input.focus(); input.select();
    run();
  }
  function close() { if (modal) modal.hidden = true; document.body.classList.remove('ts-open'); }
  function makeModal() {
    modal = document.createElement('div');
    modal.className = 'ts-modal'; modal.hidden = true;
    modal.innerHTML = `<div class="ts-box" role="dialog" aria-modal="true" aria-label="Search">
      <div class="ts-top"><span class="ts-icon" aria-hidden="true">⌕</span><input class="ts-input" type="search" placeholder="Search everything in the tool" aria-label="Search" spellcheck="false" autocomplete="off"><button type="button" class="ts-close" title="Close (Esc)">✕</button></div>
      <div class="ts-hint">Several words find the places that have all of them. Put a tag in quotation marks to find it: <b>"slice of life"</b>, or <b>"slice</b> for every tag that starts with it.</div>
      <div class="ts-count" aria-live="polite"></div>
      <div class="ts-list" role="listbox"></div></div>`;
    document.body.appendChild(modal);
    list = modal.querySelector('.ts-list'); input = modal.querySelector('.ts-input');
    modal.addEventListener('mousedown', ev => { if (ev.target === modal) close(); });
    modal.querySelector('.ts-close').onclick = close;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive(active + 1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive(active - 1); }
      else if (ev.key === 'Enter') { ev.preventDefault(); if (found[active]) choose(found[active]); }
    });
    modal.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); close(); } });
    list.addEventListener('click', ev => { const r = ev.target.closest('.ts-res'); if (r) choose(found[+r.dataset.i]); });
  }
  function setActive(i) {
    const items = list.querySelectorAll('.ts-res'); if (!items.length) return;
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((x, k) => x.classList.toggle('active', k === active));
    items[active].scrollIntoView({block: 'nearest'});
  }
  function run() {
    const q = input.value, {P, res} = search(q);
    found = res.slice(0, MAX_SHOWN); active = 0;
    const cnt = modal.querySelector('.ts-count');
    if (!q.trim() || (P.tag && !P.term)) { cnt.textContent = ''; list.innerHTML = ''; return; }
    cnt.textContent = res.length ? `${res.length} result${res.length > 1 ? 's' : ''}${res.length > MAX_SHOWN ? ` (the first ${MAX_SHOWN} are shown)` : ''}` : 'Nothing found.';
    list.innerHTML = found.map((r, i) => {
      const it = r.it, isTag = it.kind === 'tags' || it.kind === 'btags';
      const body = isTag ? markHtml(it.text, r.marks, true) : snippet(it.text, r.marks).map(l => markHtml(l, r.marks)).join('\n');
      const chip = isTag ? `${r.n} tag${r.n > 1 ? 's' : ''}` : r.n > 1 ? `${r.n} matches` : it.kind === 'field' ? 'text box' : it.kind === 'card' ? 'card' : '';
      return `<div class="ts-res${i === 0 ? ' active' : ''}" role="option" data-i="${i}"><div class="ts-head"><b class="ts-title">${markHtml(it.title || '', isTag ? [] : r.marks)}</b><span class="ts-where">${esc(it.where)}</span>${chip ? `<span class="ts-chip">${esc(chip)}</span>` : ''}</div><pre class="ts-snip">${body}</pre></div>`;
    }).join('');
  }

  // ------------------------------------------------------------------ going to a result
  const HL = 'ts-hit';
  function openAround(el) {
    for (let a = el; a; a = a.parentElement) {
      if (a.tagName === 'DETAILS' && !a.open) a.open = true;
      if (a.classList && a.classList.contains('collapsed') && a.matches('.scenario-card')) a.classList.remove('collapsed');
    }
  }
  function markText(el, words) {
    try {
      if (!(window.CSS && CSS.highlights && window.Highlight)) return;
      const ranges = [], low = words.map(w => String(w).toLowerCase()).filter(Boolean);
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const v = n.nodeValue.toLowerCase();
        for (const w of low) for (let i = v.indexOf(w); i >= 0; i = v.indexOf(w, i + w.length)) { const r = new Range(); r.setStart(n, i); r.setEnd(n, i + w.length); ranges.push(r); }
      }
      CSS.highlights.set(HL, new Highlight(...ranges));
      clearTimeout(markText.t); markText.t = setTimeout(() => CSS.highlights.delete(HL), 8000);
    } catch (_) { /* marking is a help, never needed */ }
  }
  function markBox(box, words, exact) {
    if (!window.TextMarks) { box.scrollIntoView({block: 'center'}); return; }
    const ranges = [];
    for (const w of words) for (const [s, e] of window.TextMarks.findAll(box.value || '', w)) ranges.push({start: s, end: e, cls: 'tm-search'});
    ranges.sort((a, b) => a.start - b.start);
    window.TextMarks.set(box, 'search', ranges);
    requestAnimationFrame(() => window.TextMarks.reveal(box, ranges.length ? ranges[0].start : 0));
    clearTimeout(box.__tsClear); box.__tsClear = setTimeout(() => window.TextMarks.clear(box, 'search'), 12000);
  }
  function landOn(el, words, box) {
    openAround(el);
    requestAnimationFrame(() => {
      if (box) { markBox(el, words); window.TextMarks && window.TextMarks.flash(el, 'tm-flash'); return; }
      el.scrollIntoView({block: 'center', behavior: 'smooth'});
      markText(el, words);
      if (window.TextMarks) window.TextMarks.flash(el, 'tm-flash');
    });
  }
  function choose(r) {
    if (!r) return;
    const it = r.it, words = r.marks;
    close();
    if (it.kind === 'card' || it.kind === 'tags') {
      const S = window.__jbsSearch; let el = null;
      try { el = S && S.openCard(it.card, it.label); } catch (e) { console.error('search open card:', e); }
      if (el) setTimeout(() => landOn(el, words), 60);
      return;
    }
    if (it.kind === 'btags') {
      A.go('builder');
      setTimeout(() => { const sec = document.querySelector('#bb-form .bb-sec[data-sec="tags"]') || document.getElementById('view-builder'); if (sec) landOn(sec, words); }, 80);
      return;
    }
    A.go(it.view);
    setTimeout(() => {
      let el = it.el;
      if (!el || !el.isConnected) {                   // the tab drew itself again: find the same place in it
        const v = document.getElementById('view-' + it.view);
        const again = v ? indexView(v) : [];
        const same = again.find(x => x.kind === it.kind && x.text === it.text) || again.find(x => x.kind === it.kind && x.title === it.title && words.every(w => x.text.toLowerCase().includes(w)));
        el = same && same.el;
      }
      if (el) landOn(el, words, it.kind === 'field');
    }, 60);
  }

  // ------------------------------------------------------------------ the button
  function init() {
    A = app();
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'ts-btn'; btn.id = 'ts-btn';
    btn.title = 'Search everything in the tool';
    btn.innerHTML = '<span aria-hidden="true">⌕</span> Search';
    btn.onclick = open;
    A.mount(btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.ToolSearch = {open, close, search: q => { build(); return search(q).res.map(r => ({kind: r.it.kind, view: r.it.view, where: r.it.where, title: r.it.title, text: r.it.text.slice(0, 200), n: r.n})); }, build, parse};
})();
