/* Grammar engine in the app (v1.4.0): LanguageTool or GECToR, one at a time. Both are installed into the app's own folder (Settings > Grammar engine),
 * run only on this computer and cost no credits.
 *   LanguageTool (v1.2.0): a grammar and style checker made of rules (not AI): grammar and punctuation, confused words, plain-English style hints,
 *     better replacements for misspellings.
 *   GECToR (v1.4.0): a small grammar-correction model (AI that runs on this computer): verb forms and tense, agreement, missing or extra words,
 *     articles and prepositions. It reads narration only: quoted dialogue, {{markers}}, links and pictures are never changed. When you set the
 *     Introduction or the Greeting to Past or Present, it is told, and a suggestion that would turn a verb back into the other tense is dropped.
 * Installing one removes the other (after the new one has installed and passed a test), so the app never keeps both large downloads.
 * Nothing is waited for: a text is checked with the built-in rules at once, and the engine's answer is added a moment later.
 * Nothing installed or switched off = exactly the built-in check, as before.
 * convert(text, matches, mask) turns LanguageTool's answer into the hit shape the built-in check uses; convertGector does the same for GECToR. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.LT = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  const GRAMMAR = new Set(['GRAMMAR', 'CONFUSED_WORDS', 'CASING', 'PUNCTUATION', 'COMPOUNDING', 'MISC', 'NONSTANDARD_PHRASES', 'COLLOCATIONS', 'SEMANTICS']);
  const kindOf = m => (m.category === 'TYPOS' || /MORFOLOGIK|HUNSPELL|SPELLER/.test(m.rule) || m.type === 'misspelling') ? 'spelling' : GRAMMAR.has(m.category) ? 'grammar' : 'wording';

  function convert(text, matches, mask) {
    const src = String(text == null ? '' : text), msk = mask || src, out = [];
    for (const m of matches || []) {
      const start = m.offset, end = m.offset + m.length;
      if (!(m.length > 0) || start < 0 || end > src.length) continue;
      if (/\u0001/.test(msk.slice(start, end))) continue;                           // a {{marker}}, link, tag or code part is never checked
      const kind = kindOf(m), orig = src.slice(start, end), reps = [...new Set((m.replacements || []).filter(r => typeof r === 'string' && r !== orig))];
      const hit = {start, end, text: orig, kind, msg: String(m.message || m.short || 'Check this.').replace(/\s+/g, ' ').trim(), src: 'languagetool', rule: m.rule};
      if (reps.length === 1) hit.fix = reps[0]; else if (reps.length > 1) hit.suggest = reps.slice(0, 5);
      if (kind === 'wording') hit.soft = true;                                      // style hints: shown, never forced
      out.push(hit);
    }
    return out;
  }
  // GECToR: every finding has one fix. A one-word change of a word the app does not know is a spelling fix (it improves the app's own spelling flag);
  // everything else is grammar.
  function convertGector(text, matches) {
    const src = String(text == null ? '' : text), out = [], TC = root.TextCheck;
    for (const m of matches || []) {
      const start = m.offset, end = m.offset + m.length;
      if (!(m.length > 0) || start < 0 || end > src.length) continue;
      const orig = src.slice(start, end), fix = (m.replacements || [])[0];
      if (typeof fix !== 'string' || fix === orig) continue;
      const word = /^[A-Za-z]+$/, spelling = !!(m.single && word.test(m.before || '') && word.test(m.after || '') && TC && TC.known && !TC.known(String(m.before).toLowerCase()));
      out.push({start, end, text: orig, kind: spelling ? 'spelling' : 'grammar', msg: 'GECToR: ' + String(m.message || 'Check this.').replace(/\s+/g, ' ').trim(), src: 'gector', rule: 'GECTOR', fix});
    }
    return out;
  }

  // ---------------------------------------------------------------- the narration tense GECToR is told about
  // The tense you chose with Past / Present for the Introduction or the Greeting, when the text being checked is part of it; otherwise the tense the
  // text is already in (nothing when it is mixed). Time words like "tonight" are never touched either way.
  const detected = new Map();
  function tenseFor(text) {
    const NT = root.NarrativeTense; if (!NT) return '';
    const core = root.__builderCore, v = core && core.state && core.state.v;
    if (v && NT.chosen) {
      try {
        const c = NT.chosen(v), has = s => typeof s === 'string' && s.trim().length > 20 && (s.includes(text) || text.includes(s));
        if (c.intro && [v.intro, v.over && v.over.introduction].some(has)) return c.intro;
        if (c.greeting && [...(v.greet || []), v.over && v.over.greeting].some(has)) return c.greeting;
      } catch (_) { /* fall back to the text itself */ }
    }
    if (detected.has(text)) return detected.get(text);
    let d = ''; try { d = NT.detect(text); } catch (_) { d = ''; }
    d = d === 'past' || d === 'present' ? d : '';
    if (detected.size > 300) detected.clear(); detected.set(text, d); return d;
  }

  // ---------------------------------------------------------------- the renderer side: ask the app, keep the answers, tell the screens when they arrive
  const api = (root && root.juicyApp) || {};
  const cache = new Map(), queue = []; let engine = '', running = false, fails = 0, notifyT = 0, stL = null, stG = null, versionTick = 0;
  const notify = () => { clearTimeout(notifyT); notifyT = setTimeout(() => { versionTick++; try { root.dispatchEvent(new root.Event('jbs-lt-update')); } catch (_) { /* no window in tests */ } }, 200); };
  const keyOf = text => (engine === 'gector' ? tenseFor(text) + '\u0000' : '') + text;
  function provider(text) {
    if (!engine || !text) return null;
    const key = keyOf(text);
    if (cache.has(key)) return cache.get(key);
    if (!queue.some(x => x.key === key)) { queue.push({key, text}); pump(); }
    return null;
  }
  async function pump() {
    if (running) return; running = true;
    try {
      while (queue.length && engine) {
        const {key, text} = queue.shift(); if (cache.has(key)) continue;
        const eng = engine; let hits = [];
        try {
          const r = eng === 'gector' ? await api.gectorCheck(text, {tense: key.slice(0, key.indexOf('\u0000'))}) : await api.ltCheck(text);
          if (r && r.ok) { fails = 0; hits = eng === 'gector' ? convertGector(text, r.matches) : convert(text, r.matches, root.TextCheck && root.TextCheck.mask ? root.TextCheck.mask(text) : text); }
          else if (++fails >= 3) { const why = (r && r.error) || 'The grammar engine did not answer.'; if (eng === 'gector' && stG) stG.error = why; else if (stL) stL.error = why; engine = ''; queue.length = 0; if (root.TextCheck) root.TextCheck.setProvider(null); paint(); }
        } catch (_) { if (++fails >= 3) { engine = ''; queue.length = 0; if (root.TextCheck) root.TextCheck.setProvider(null); } }
        if (eng !== engine) break;
        if (cache.size > 300) cache.clear();
        cache.set(key, hits); notify();
      }
    } finally { running = false; }
  }
  // which engine the checks use: GECToR when it is installed and on, else LanguageTool when it is installed and on, else none
  function choose() {
    const on = s => !!(s && s.ok !== false && s.installed && s.enabled);
    const want = on(stG) ? 'gector' : on(stL) ? 'lt' : '';
    if (want !== engine) { engine = want; fails = 0; cache.clear(); queue.length = 0; if (root.TextCheck) root.TextCheck.setProvider(engine ? provider : null); notify(); }
    else if (engine && root.TextCheck) root.TextCheck.setProvider(provider);
  }
  function useIf(s) { stL = s || stL; choose(); }                                   // kept for older callers (LanguageTool status)

  // ---------------------------------------------------------------- Settings > Grammar engine
  const $ = id => root.document.getElementById(id), esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const NAME = {lt: 'LanguageTool', gector: 'GECToR'};
  let prog = null, working = '', testMsg = {lt: null, gector: null}; const say = m => { try { root.toast(m); } catch (_) { /* no toast in tests */ } };
  function ensurePanel() {
    if ($('lt-panel')) return $('lt-panel');
    const col = root.document.querySelector('#view-settings .set-col'); if (!col) return null;
    const p = root.document.createElement('div'); p.className = 'panel'; p.id = 'lt-panel';
    p.innerHTML = '<div class="panel-head"><div><h3>Grammar engine</h3><p>Choose one: LanguageTool or GECToR. Both run only on this computer: no credits, nothing sent anywhere. Installing one removes the other, so the app never keeps both large downloads.</p></div></div><div id="lt-box"></div>';
    const anchor = $('imghost-panel') || $('backup-panel');
    if (anchor && anchor.parentNode === col) col.insertBefore(p, anchor.nextSibling); else col.insertBefore(p, col.firstChild);
    p.addEventListener('click', ev => { const b = ev.target.closest('[data-ge]'); if (b) { ev.preventDefault(); act(b.dataset.ge, b.dataset.eng); } });
    p.addEventListener('change', ev => { const c = ev.target.closest('[data-ge-on]'); if (c) act(c.checked ? 'on' : 'off', c.dataset.geOn); });
    return p;
  }
  const ABOUT = {
    lt: 'A grammar and style checker made of rules (not AI). Grammar and punctuation, confused words, plain-English style hints and better replacements for misspellings. The app downloads it (about 200 MB) from languagetool.org, plus a small portable Java only if this computer has none (Java 17 or newer).',
    gector: 'A small grammar-correction model (AI that runs only on this computer). Verb forms and tense, agreement, missing or extra words, articles and prepositions. It reads narration only and never changes quoted dialogue, and it follows the Past / Present tense you pick for the Introduction and the Greeting. The app downloads its engine (ONNX Runtime, about 90 MB) and the model (about 250 MB) from the internet; on disk it takes about 300 MB.'
  };
  function engineBox(eng) {
    const st = eng === 'gector' ? stG : stL, other = eng === 'gector' ? 'lt' : 'gector';
    const head = `<h4 class="ge-h" style="margin:14px 0 4px">${NAME[eng]}${engine === eng ? ' <span class="bb-local-badge">In use</span>' : ''}</h4>`;
    if (!st || st.ok === false && !st.error) return head + '<p class="micro">Not available here.</p>';
    if (working === eng) {
      const pct = Math.round(((prog && prog.pct) || 0) * 100);
      return head + `<p class="micro">${esc((prog && prog.msg) || 'Starting…')}</p><div class="lt-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><p class="micro">${pct}%. Keep the app open until it finishes; this can take several minutes.</p>`;
    }
    const err = st.error ? `<p class="micro" style="color:#ff8a8a">${esc(st.error)}</p>` : '', dis = working ? ' disabled' : '';
    if (!st.installed) {
      const swap = (eng === 'gector' ? stL : stG) && (eng === 'gector' ? stL : stG).installed ? ` Installing it removes ${NAME[other]}.` : '';
      return head + `<p class="micro">Not installed. ${ABOUT[eng]}${swap}</p>${err}<div class="button-row"><button type="button" class="primary" data-ge="install" data-eng="${eng}"${dis}>Install ${NAME[eng]}</button></div>`;
    }
    return head + `<label class="bb-check"><input type="checkbox" data-ge-on="${eng}"${st.enabled ? ' checked' : ''}${dis}> Use ${NAME[eng]} in the checks</label><p class="micro">${ABOUT[eng]}</p><p class="micro">Installed in <code>${esc(st.root)}</code>${st.sizeMb ? ` (${st.sizeMb} MB)` : ''}. It starts by itself when a check needs it and stops after 15 idle minutes (or when the app closes).${st.running ? ' Running now.' : ''}</p>${testHtml(testMsg[eng])}${err}<div class="button-row"><button type="button" class="ghost" data-ge="test" data-eng="${eng}"${dis}>Test it</button><button type="button" class="ghost" data-ge="reinstall" data-eng="${eng}"${dis}>Reinstall / update</button><button type="button" class="ghost" data-ge="remove" data-eng="${eng}"${dis}>Remove</button></div>`;
  }
  // Test it: the sample sentence, how many things the engine found, and each suggestion (what is written -> what it suggests)
  const SAMPLE = {lt: 'She dont likes the the red apple, its a long time ago.', gector: 'She go to the store yesterday and buy a apple.'};
  function testHtml(t) {
    if (!t) return '';
    if (t.busy) return `<p class="micro">${esc(t.busy)}</p>`;
    if (t.error) return `<p class="micro" style="color:#ff8a8a">Not working: ${esc(t.error)}</p>`;
    const q = s => '“' + esc(s) + '”', n = t.items.length;
    return `<div class="ge-test"><p class="micro">Sample: ${q(t.sample)}</p><p class="micro">Working: ${esc(t.name)} found ${n} thing${n === 1 ? '' : 's'}${n ? ':' : '.'}</p>${n ? `<ul class="micro" style="margin:2px 0 6px 18px;padding:0">${t.items.map(i => `<li>${q(i.before)} → ${i.after.length ? i.after.map(q).join(' or ') : '<em>no suggestion</em>'}${i.note ? ` <span style="opacity:.7">(${esc(i.note)})</span>` : ''}</li>`).join('')}</ul>` : ''}</div>`;
  }
  function paint() {
    const box = root.document && $('lt-box'); if (!box) return;
    const order = stG && stG.installed && !(stL && stL.installed) ? ['gector', 'lt'] : ['lt', 'gector'];
    box.innerHTML = order.map(engineBox).join('');
  }
  async function refresh() {
    try { stL = api.ltStatus ? await api.ltStatus() : null; } catch (e) { stL = {ok: false, error: String(e && e.message || e)}; }
    try { stG = api.gectorStatus ? await api.gectorStatus() : null; } catch (e) { stG = {ok: false, error: String(e && e.message || e)}; }
    choose(); paint();
  }
  const call = (eng, what, ...a) => api[(eng === 'gector' ? 'gector' : 'lt') + what](...a);
  async function act(what, eng) {
    eng = eng === 'gector' ? 'gector' : 'lt';
    const st = eng === 'gector' ? stG : stL, other = eng === 'gector' ? 'lt' : 'gector', otherSt = eng === 'gector' ? stL : stG;
    if (what === 'install' || what === 'reinstall') {
      if (working) return;
      if (what === 'install' && otherSt && otherSt.installed && !root.confirm(`Installing ${NAME[eng]} removes ${NAME[other]} from this computer, so the app doesn't keep both (they are large downloads).\n\n${NAME[other]} is removed only after ${NAME[eng]} has installed and passed a test, so you always have one of them.\n\nContinue?`)) return;
      working = eng; prog = {pct: 0, msg: 'Starting…'}; paint();
      try {
        const r = await call(eng, 'Install'); working = '';
        if (r && r.ok === false) { if (st) st.error = r.error; }
        else say(`${NAME[eng]} is installed. The checks now use it.${r && r.removedOther ? ` ${NAME[other]} was removed.` : ''}`);
      } catch (e) { working = ''; if (st) st.error = String(e && e.message || e); }
      paint(); refresh(); return;
    }
    if (what === 'remove') {
      if (!root.confirm(`Remove ${NAME[eng]} from this computer? The built-in check keeps working. You can install it (or ${NAME[other]}) again any time.`)) return;
      await call(eng, 'Remove'); say(`${NAME[eng]} was removed.`); refresh(); return;
    }
    if (what === 'on' || what === 'off') { await call(eng, 'Enable', what === 'on'); refresh(); return; }
    if (what === 'test') {
      const sample = SAMPLE[eng];
      testMsg[eng] = {busy: `Checking a sample sentence… (the first check starts ${NAME[eng]} and can take up to a minute)`}; paint();
      let r; try { r = eng === 'gector' ? await api.gectorCheck(sample, {tense: ''}) : await api.ltCheck(sample); } catch (e) { r = {ok: false, error: String(e && e.message || e)}; }
      if (!r || !r.ok) testMsg[eng] = {error: (r && r.error) || 'no answer'};
      else testMsg[eng] = {name: NAME[eng], sample, items: (r.matches || []).filter(m => m.length > 0 && m.offset >= 0 && m.offset + m.length <= sample.length).sort((a, b) => a.offset - b.offset).map(m => ({
        before: sample.slice(m.offset, m.offset + m.length),
        after: [...new Set((m.replacements || []).filter(x => typeof x === 'string'))].slice(0, 3),
        note: eng === 'lt' ? String(m.message || m.short || '').replace(/\s+/g, ' ').trim() : ''
      }))};
      refresh(); return;
    }
  }
  const onProg = eng => p => { if (working !== eng) return; prog = p; if (p && p.phase === 'error') { const st = eng === 'gector' ? stG : stL; if (st) st.error = p.msg; } if (root.document && $('lt-box')) paint(); };
  if (api.onLtProgress) api.onLtProgress(onProg('lt'));
  if (api.onGectorProgress) api.onGectorProgress(onProg('gector'));
  function init() { if (!(api.ltStatus || api.gectorStatus) || !root.document) return; ensurePanel(); refresh(); }
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init); else init();
    root.document.addEventListener('click', ev => { const t = ev.target.closest && ev.target.closest('[data-view="settings"], [data-tab="settings"]'); if (t) setTimeout(() => { ensurePanel(); refresh(); }, 50); });
  }
  return {convert, convertGector, kindOf, provider, useIf, refresh, tenseFor, get active() { return !!engine; }, get engine() { return engine; }, get version() { return versionTick; }};
});
