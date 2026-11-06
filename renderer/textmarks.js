/* Marks inside a text box (v1.6.0 Blueprint Studio, v1.5.0 Creator Tool).
 * A text box cannot colour part of its own text, so a see-through copy of the box is laid exactly over it, with the same font, size,
 * padding and line breaks; only the marks in the copy are visible. It never takes clicks or typing: the text box under it works as before.
 *   set(box, group, ranges)   ranges: [{start, end, cls}] for one group of marks: 'search' (a search result), 'check' (a check's problem)
 *                             or 'lang' (spelling and grammar). Each group is replaced on its own; an empty list removes that group.
 *   reveal(box, start)        scrolls the page (and the box) so the mark at that character is in the middle of the screen
 *   showIssue(section, message, level)   finds the text a check names (its quoted words, or a punctuation mark in brackets) in that
 *                             section's text boxes, marks it red ('bad') or yellow ('warn') and goes there; if nothing can be found,
 *                             the whole section flashes in that colour.
 *   flash(el, cls)            a short outline around an element
 * Typing in a box removes its 'search' and 'check' marks (they belonged to the old text); 'lang' marks are redrawn by the builder. */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  const STATE = new WeakMap();
  const COPY = ['boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'letterSpacing', 'wordSpacing',
    'lineHeight', 'textTransform', 'textIndent', 'textAlign', 'tabSize', 'direction', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius'];
  const esc = s => String(s).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
  const isBox = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|)$/i.test(el.type || '')));

  function ensure(box) {
    let st = STATE.get(box);
    if (st && st.ov.isConnected) return st;
    const parent = box.parentElement; if (!parent) return null;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    const ov = document.createElement('div');
    ov.className = 'tm-ov'; ov.setAttribute('aria-hidden', 'true');
    box.insertAdjacentElement('afterend', ov);
    st = {ov, groups: {}};
    STATE.set(box, st);
    const sync = () => { ov.scrollTop = box.scrollTop; ov.scrollLeft = box.scrollLeft; };
    box.addEventListener('scroll', sync);
    box.addEventListener('input', () => { if (st.groups.search || st.groups.check) { delete st.groups.search; delete st.groups.check; paint(box); } });
    try { st.ro = new ResizeObserver(() => { place(box); sync(); }); st.ro.observe(box); } catch (_) { /* no ResizeObserver: placed on each paint */ }
    return st;
  }

  function place(box) {
    const st = STATE.get(box); if (!st) return;
    const ov = st.ov, cs = getComputedStyle(box);
    for (const p of COPY) ov.style[p] = cs[p];
    ov.style.borderStyle = 'solid'; ov.style.borderColor = 'transparent';
    const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    const bar = Math.max(0, box.offsetWidth - box.clientWidth - bl - br);      // the box's own scroll bar narrows its lines: the copy keeps the same width for text
    ov.style.paddingRight = ((parseFloat(cs.paddingRight) || 0) + bar) + 'px';
    ov.style.whiteSpace = box.tagName === 'INPUT' ? 'pre' : 'pre-wrap';
    ov.style.overflowWrap = box.tagName === 'INPUT' ? 'normal' : (cs.overflowWrap === 'normal' && cs.wordWrap !== 'break-word' ? 'break-word' : cs.overflowWrap);
    ov.style.left = box.offsetLeft + 'px'; ov.style.top = box.offsetTop + 'px';
    ov.style.width = box.offsetWidth + 'px'; ov.style.height = box.offsetHeight + 'px';
    const z = parseInt(cs.zIndex, 10); ov.style.zIndex = String(Number.isFinite(z) ? z + 1 : 2);
    ov.style.display = box.offsetParent || box.getClientRects().length ? '' : 'none';
  }

  function paint(box) {
    const st = STATE.get(box); if (!st) return;
    const text = String(box.value || ''), all = [];
    for (const [g, list] of Object.entries(st.groups)) for (const r of list || []) {
      const s = Math.max(0, Math.min(text.length, r.start | 0)), e = Math.max(s, Math.min(text.length, r.end | 0));
      if (e > s) all.push({s, e, cls: r.cls || 'tm-' + g, title: r.title || ''});
    }
    if (!all.length) { st.ov.innerHTML = ''; st.ov.style.display = 'none'; return; }
    const cuts = new Set([0, text.length]); for (const r of all) { cuts.add(r.s); cuts.add(r.e); }
    const pts = [...cuts].sort((a, b) => a - b); let html = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], seg = text.slice(a, b); if (!seg) continue;
      const on = all.filter(r => r.s <= a && r.e >= b);
      html += on.length ? `<span class="tm-m ${[...new Set(on.map(r => r.cls))].join(' ')}" data-at="${a}">${esc(seg)}</span>` : esc(seg);
    }
    st.ov.innerHTML = html + '\u200b';
    place(box); st.ov.scrollTop = box.scrollTop; st.ov.scrollLeft = box.scrollLeft;
  }

  function set(box, group, ranges) {
    if (!isBox(box)) return;
    const list = Array.isArray(ranges) ? ranges.filter(r => r && r.end > r.start) : [];
    let st = STATE.get(box);
    if (!st && !list.length) return;
    st = ensure(box); if (!st) return;
    if (list.length) st.groups[group] = list; else delete st.groups[group];
    paint(box);
  }
  function clear(box, group) { set(box, group, []); }

  function reveal(box, start) {
    const st = STATE.get(box); if (!st) { box.scrollIntoView({block: 'center'}); return; }
    const spans = [...st.ov.querySelectorAll('.tm-m')];
    const span = spans.find(s => +s.dataset.at <= start && start < +s.dataset.at + s.textContent.length) || spans.find(s => +s.dataset.at >= start) || spans[0];
    if (!span) { box.scrollIntoView({block: 'center'}); return; }
    box.scrollTop = Math.max(0, span.offsetTop - box.clientHeight / 3); st.ov.scrollTop = box.scrollTop;
    const r = span.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight - 40) span.scrollIntoView({block: 'center'});
    box.scrollTop = st.ov.scrollTop;
    try { box.focus({preventScroll: true}); box.setSelectionRange(start, start); } catch (_) { /* a box that takes no cursor */ }
  }

  function flash(el, cls) {
    if (!el) return;
    const c = cls || 'tm-flash';
    el.classList.remove(c); void el.offsetWidth; el.classList.add(c);
    clearTimeout(el.__tmFlash); el.__tmFlash = setTimeout(() => el.classList.remove(c), 4000);
  }

  // every place a text occurs in a longer text, ignoring capitals and straight / curly quotes
  const fold = s => String(s).toLowerCase().replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'");
  function findAll(text, needle) {
    const out = [], h = fold(text), n = fold(needle); if (!n) return out;
    for (let i = h.indexOf(n); i >= 0; i = h.indexOf(n, i + n.length)) out.push([i, i + n.length]);
    return out;
  }
  // what a check names: its quoted words (“…” or "…") and punctuation marks in brackets, such as (:) or (;)
  function needlesOf(message) {
    const m = String(message || ''), out = [];
    for (const x of m.matchAll(/“([^”]{2,300})”|"([^"]{2,300})"/g)) out.push((x[1] || x[2]).trim());
    for (const x of m.matchAll(/\(([^\w\s()]{1,3})\)/g)) out.push(x[1]);
    return [...new Set(out.filter(Boolean))];
  }

  function showIssue(section, message, level) {
    if (!section) return false;
    const cls = level === 'bad' ? 'tm-bad' : 'tm-warn';
    document.querySelectorAll('textarea, input').forEach(b => { const st = STATE.get(b); if (st && st.groups.check) clear(b, 'check'); });
    const needles = needlesOf(message);
    let first = null;
    if (needles.length) for (const box of section.querySelectorAll('textarea, input')) {
      if (!isBox(box)) continue;
      const ranges = [];
      for (const n of needles) for (const [s, e] of findAll(box.value || '', n)) ranges.push({start: s, end: e, cls});
      if (!ranges.length) continue;
      ranges.sort((a, b) => a.start - b.start);
      set(box, 'check', ranges);
      if (!first) first = {box, start: ranges[0].start};
    }
    if (first) { requestAnimationFrame(() => reveal(first.box, first.start)); return true; }
    section.scrollIntoView({block: 'start', behavior: 'smooth'});
    flash(section, level === 'bad' ? 'tm-flash-bad' : 'tm-flash-warn');
    return false;
  }

  root.TextMarks = {set, clear, reveal, flash, showIssue, findAll, needlesOf, refresh: box => { const st = STATE.get(box); if (st) paint(box); }};
})(typeof window !== 'undefined' ? window : this);
