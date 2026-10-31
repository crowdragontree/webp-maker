/* Grammar checking in the app (v1.4.1).
 *   Harper (built in, on by default): Automattic's free, open-source grammar checker. Spelling, capitalization, a / an, repeated words,
 *     agreement and other common slips, in a fraction of a second. Nothing to install. Inside quoted dialogue it only checks spelling.
 *   Plus one Grammar engine, installed into the app's own folder (Settings > Grammar engine), one at a time:
 *     LanguageTool (v1.2.0): a grammar and style checker made of rules (not AI).
 *     GECToR (v1.4.0): a small grammar-correction model (AI on this computer): verb forms and tense, missing or extra words.
 *     Local AI (v1.4.1): Qwen3.5 9B running on this computer through llama.cpp. Reads whole sentences and rewrites the broken or awkward
 *       ones (shown as a suggestion with Fix / Ignore), keeping the Past / Present tense you chose and never touching dialogue.
 *   All free, all on this computer, no credits. Installing one engine removes the others once it has installed and passed a test.
 * Nothing is waited for: a text is checked with the built-in rules at once, and Harper's and the engine's answers are added as they arrive.
 * Harper off and no engine = exactly the built-in check, as before. */
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
    const ok = m => (m === 'past' || m === 'present' ? m : '');
    if (v && NT.chosen) {
      try {
        // the Introduction / Greeting: the tense you pressed, else the one its Past / Present buttons show
        const c = NT.chosen(v), has = s => typeof s === 'string' && s.trim().length > 20 && (s.includes(text) || text.includes(s));
        const shown = scope => { try { return ok(NT.status(v, scope).mode); } catch (_) { return ''; } };
        if ([v.intro, v.over && v.over.introduction].some(has)) { const t = ok(c.intro) || shown('intro'); if (t) return t; }
        if ([...(v.greet || []), v.over && v.over.greeting].some(has)) { const t = ok(c.greeting) || shown('greet'); if (t) return t; }
      } catch (_) { /* fall back to the text itself */ }
    }
    if (detected.has(text)) return detected.get(text);
    // any other text: the tense most of its narration is in (a slip or a flashback does not make it "mixed")
    let d = ''; try { d = ok(NT.detect(text)); if (!d) { const k = (NT.convert(text, 'past') || {}).counts || {}, p = k.past || 0, q = k.present || 0; d = p && p >= 2 * q ? 'past' : q && q >= 2 * p ? 'present' : ''; } } catch (_) { d = ''; }
    if (detected.size > 300) detected.clear(); detected.set(text, d); return d;
  }

  // ---------------------------------------------------------------- the renderer side: ask the app, keep the answers, tell the screens when they arrive
  // The local AI: each finding is one sentence and its rewrite.
  function convertLocal(text, matches) {
    const src = String(text == null ? '' : text), out = [];
    for (const m of matches || []) {
      const start = m.offset, end = m.offset + m.length;
      if (!(m.length > 0) || start < 0 || end > src.length) continue;
      const orig = src.slice(start, end), fix = (m.replacements || [])[0];
      if (typeof fix !== 'string' || !fix.trim() || fix === orig) continue;
      out.push({start, end, text: orig, kind: 'grammar', msg: 'Local AI: ' + String(m.message || 'This sentence reads awkwardly.').replace(/\s+/g, ' ').trim(), src: 'localai', rule: 'LOCALAI', fix});
    }
    return out;
  }
  // Harper: spelling goes to the app's own spelling flags (better replacements), the rest is grammar. Style hints are left out, and inside
  // quoted dialogue only spelling and doubled words count (dialogue is casual on purpose).
  const HARPER_SKIP = /^(?:Style|Readability|Enhancement|Formatting|Regionalism)$/;
  function quoteSpans(src) { const out = []; const re = /["“][^"”\n]*["”]/g; let m; while ((m = re.exec(src))) out.push([m.index, m.index + m[0].length]); return out; }
  function convertHarper(text, matches, mask) {
    const src = String(text == null ? '' : text), msk = mask || src, q = quoteSpans(src), out = [];
    for (const m of matches || []) {
      const start = m.offset, end = m.offset + m.length, kind0 = String(m.kind || '');
      if (!(m.length > 0) || start < 0 || end > src.length || HARPER_SKIP.test(kind0)) continue;
      if (/\u0001/.test(msk.slice(start, end))) continue;                                       // {{markers}}, links, tags
      const spelling = /^(?:Spelling|Typo)$/.test(kind0);
      if (!spelling && kind0 !== 'Repetition' && q.some(([a, b]) => start >= a && end <= b)) continue;
      const orig = src.slice(start, end), reps = [...new Set((m.replacements || []).filter(r => typeof r === 'string' && r !== orig))];
      if (!reps.length) continue;
      const hit = {start, end, text: orig, kind: spelling ? 'spelling' : 'grammar', msg: 'Harper: ' + String(m.message || 'Check this.').replace(/\s+/g, ' ').trim(), src: 'harper', rule: 'HARPER_' + kind0};
      if (reps.length === 1) hit.fix = reps[0]; else hit.suggest = reps.slice(0, 5);
      out.push(hit);
    }
    return out;
  }

  // ---------------------------------------------------------------- asking the app and keeping the answers
  const api = (root && root.juicyApp) || {};
  const ENGINES = ['localai', 'gector', 'lt'], NAME = {lt: 'LanguageTool', gector: 'GECToR', localai: 'Local AI (Qwen3.5 9B)'}, PRE = {lt: 'lt', gector: 'gector', localai: 'localai'};
  const st = {lt: null, gector: null, localai: null}; let stH = null, engine = '', harperOn = false, versionTick = 0, notifyT = 0;
  const notify = () => { clearTimeout(notifyT); notifyT = setTimeout(() => { versionTick++; try { root.dispatchEvent(new root.Event('jbs-lt-update')); } catch (_) { /* no window in tests */ } }, 200); };
  const mask = text => (root.TextCheck && root.TextCheck.mask ? root.TextCheck.mask(text) : text);
  // one small queue per source: the engine (one passage at a time; the local AI can take a while) and Harper (instant)
  function makeSource(name, ask, conv) {
    const cache = new Map(), queue = []; let running = false, fails = 0;
    const s = {
      get(key, text) { if (cache.has(key)) return cache.get(key); if (!queue.some(x => x.key === key)) { queue.push({key, text}); pump(); } return null; },
      reset() { cache.clear(); queue.length = 0; fails = 0; },
      get waiting() { return queue.length + (running ? 1 : 0); }
    };
    async function pump() {
      if (running) return; running = true;
      try {
        while (queue.length) {
          const {key, text} = queue.shift(); if (cache.has(key)) continue;
          const tag = s.tag; let hits = [];
          try {
            const r = await ask(key, text);
            if (r && r.ok) { fails = 0; hits = conv(text, r.matches); }
            else if (++fails >= 3) { s.failed && s.failed((r && r.error) || `${name} did not answer.`); queue.length = 0; break; }
          } catch (er) { if (++fails >= 3) { s.failed && s.failed(String(er && er.message || er)); queue.length = 0; break; } }
          if (tag !== s.tag) break;                                                              // switched engines while waiting
          if (cache.size > 300) cache.clear();
          cache.set(key, hits); notify();
        }
      } finally { running = false; }
    }
    s.tag = 0;
    return s;
  }
  const tenseOf = key => key.slice(key.indexOf('\u0001') + 1, key.indexOf('\u0000'));   // key: engine \u0001 tense \u0000 text
  const ENG = makeSource('The grammar engine', (key, text) => {
    if (engine === 'gector') return api.gectorCheck(text, {tense: tenseOf(key)});
    if (engine === 'localai') return api.localaiCheck(text, {tense: tenseOf(key)});
    return api.ltCheck(text);
  }, (text, matches) => (engine === 'gector' ? convertGector(text, matches) : engine === 'localai' ? convertLocal(text, matches) : convert(text, matches, mask(text))));
  ENG.failed = why => { if (st[engine]) st[engine].error = why; engine = ''; setProv(); paint(); };
  const HAR = makeSource('Harper', (key, text) => api.harperCheck(text), (text, matches) => convertHarper(text, matches, mask(text)));
  HAR.failed = why => { if (stH) stH.error = why; harperOn = false; setProv(); paint(); };

  function provider(text) {
    if (!text || (!engine && !harperOn)) return null;
    const e = engine ? ENG.get(engine + '\u0001' + (engine === 'lt' ? '' : tenseFor(text)) + '\u0000' + text, text) : [];
    const h = harperOn ? HAR.get(text, text) : [];
    if (e === null && h === null) return null;
    const ee = e || [], hh = (h || []).filter(x => x.kind === 'spelling' || !ee.some(y => y.kind !== 'spelling' && x.start < y.end && y.start < x.end));   // the engine wins where both found something
    return [...ee, ...hh];
  }
  // Your own version of a sentence, checked as you type in the Spelling & Grammar window: the built-in check at once, Harper a moment later,
  // the Grammar engine when it answers (the local AI can take a few seconds). onUpdate(hits, waitingFor) is called each time an answer arrives;
  // ctx.text is the whole section (for its tense), ctx.names the bot's names (never flagged as spelling).
  function checkNow(text, ctx, onUpdate) {
    ctx = ctx || {};
    const src = String(text || ''), tense = tenseFor(ctx.text || src), got = {builtin: [], harper: [], engine: []}, waiting = new Set();
    try { got.builtin = ((root.TextCheck && root.TextCheck.check(src, {names: ctx.names || []})) || []).filter(h => !h.src); } catch (_) { got.builtin = []; }
    const emit = () => {
      const ee = got.engine, hh = got.harper.filter(x => x.kind === 'spelling' || !ee.some(y => y.kind !== 'spelling' && x.start < y.end && y.start < x.end));
      const bb = got.builtin.filter(x => ![...ee, ...hh].some(y => x.start < y.end && y.start < x.end && (y.kind === x.kind || x.kind === 'grammar')));
      try { onUpdate([...ee, ...hh, ...bb].sort((a, b) => a.start - b.start), [...waiting]); } catch (_) { /* the window was closed */ }
    };
    const ask = (name, promise, conv, slot) => { waiting.add(name); promise.then(r => { if (r && r.ok) got[slot] = conv(src, r.matches); }, () => {}).then(() => { waiting.delete(name); emit(); }); };
    if (harperOn && api.harperCheck) ask('Harper', api.harperCheck(src), (t, m) => convertHarper(t, m, mask(t)), 'harper');
    if (engine === 'localai') ask('the local AI', api.localaiCheck(src, {tense, force: true, live: true}), convertLocal, 'engine');
    else if (engine === 'gector') ask('GECToR', api.gectorCheck(src, {tense}), convertGector, 'engine');
    else if (engine === 'lt') ask('LanguageTool', api.ltCheck(src), (t, m) => convert(t, m, mask(t)), 'engine');
    emit();
  }
  const setProv = () => { if (root.TextCheck) root.TextCheck.setProvider(engine || harperOn ? provider : null); notify(); };
  // which engine the checks use: the installed one that is switched on (the local AI first, then GECToR, then LanguageTool)
  function choose() {
    const on = s => !!(s && s.ok !== false && s.installed && s.enabled);
    const want = ENGINES.find(k => on(st[k])) || '', h = !!(stH && stH.ok !== false && stH.enabled);   // a missing Harper is fetched once by the first check
    if (want !== engine) { engine = want; ENG.tag++; ENG.reset(); }
    if (h !== harperOn) { harperOn = h; HAR.tag++; HAR.reset(); }
    setProv();
  }
  function useIf(s) { st.lt = s || st.lt; choose(); }                                         // kept for older callers (LanguageTool status)

  // ---------------------------------------------------------------- Settings > Grammar engine
  const $ = id => root.document.getElementById(id), esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  let prog = null, working = ''; const testMsg = {lt: null, gector: null, localai: null, harper: null}; const say = m => { try { root.toast(m); } catch (_) { /* no toast in tests */ } };
  function ensurePanel() {
    if ($('lt-panel')) return $('lt-panel');
    const col = root.document.querySelector('#view-settings .set-col'); if (!col) return null;
    const p = root.document.createElement('div'); p.className = 'panel'; p.id = 'lt-panel';
    p.innerHTML = '<div class="panel-head"><div><h3>Grammar engine</h3><p>Harper is built in and checks as you go. On top of it you can install one engine: LanguageTool, GECToR or the local AI. All are free and run only on this computer: no credits, nothing sent anywhere. Installing one engine removes the others, so the app never keeps more than one large download.</p></div></div><div id="lt-box"></div>';
    const anchor = $('imghost-panel') || $('backup-panel');
    if (anchor && anchor.parentNode === col) col.insertBefore(p, anchor.nextSibling); else col.insertBefore(p, col.firstChild);
    p.addEventListener('click', ev => { const b = ev.target.closest('[data-ge]'); if (b) { ev.preventDefault(); act(b.dataset.ge, b.dataset.eng); } });
    p.addEventListener('change', ev => { const c = ev.target.closest('[data-ge-on]'); if (c) act(c.checked ? 'on' : 'off', c.dataset.geOn); });
    return p;
  }
  const ABOUT = {
    harper: 'Built in, nothing to install. Spelling, capitalization, a / an, repeated words, agreement and other common grammar slips, in a fraction of a second. Inside quoted dialogue it only checks spelling.',
    lt: 'A grammar and style checker made of rules (not AI). Grammar and punctuation, confused words, plain-English style hints and better replacements for misspellings. Download about 200 MB from languagetool.org, plus a small portable Java only if this computer has none.',
    gector: 'A small grammar-correction model (AI on this computer). Verb forms and tense, agreement, missing or extra words, articles and prepositions. It reads narration only and follows the Past / Present tense you pick. Download about 340 MB; about 300 MB on disk.',
    localai: 'An open AI model (Qwen3.5 9B) running on this computer through llama.cpp, free and open source. It reads whole sentences and rewrites the broken or awkward ones ("You dated Sabine for five years and married for two of them"), fixes verbs in the wrong tense, and leaves dialogue, {{markers}} and pictures alone. Every rewrite is a suggestion you Fix or Ignore. Download about 5.8 GB; it needs about 8 GB of free memory while it runs, and a check takes from a few seconds to about a minute (faster with a graphics card). Answers are kept, so an unchanged passage is never checked twice.'
  };
  const SAMPLE = {
    harper: 'I has a apple and and she dont like it.',
    lt: 'She dont likes the the red apple, its a long time ago.',
    gector: 'She go to the store yesterday and buy a apple.',
    localai: '*You dated Sabine for five years and married for two of them. She told Lars everything, then deletes the thread before she came inside.*'
  };
  function testHtml(t) {
    if (!t) return '';
    if (t.busy) return `<p class="micro">${esc(t.busy)}</p>`;
    if (t.error) return `<p class="micro" style="color:#ff8a8a">Not working: ${esc(t.error)}</p>`;
    const q = s => '“' + esc(s) + '”', n = t.items.length;
    return `<div class="ge-test"><p class="micro">Sample: ${q(t.sample)}</p><p class="micro">Working: ${esc(t.name)} found ${n} thing${n === 1 ? '' : 's'}${n ? ':' : '.'}</p>${n ? `<ul class="micro" style="margin:2px 0 6px 18px;padding:0">${t.items.map(i => `<li>${q(i.before)} → ${i.after.length ? i.after.map(q).join(' or ') : '<em>no suggestion</em>'}${i.note ? ` <span style="opacity:.7">(${esc(i.note)})</span>` : ''}</li>`).join('')}</ul>` : ''}</div>`;
  }
  function harperBox() {
    const s = stH, head = '<h4 class="ge-h" style="margin:14px 0 4px">Harper <span class="bb-local-badge">Built in</span></h4>';
    if (!s || s.ok === false && !s.error) return head + '<p class="micro">Not available here.</p>';
    if (!s.available) {
      if (s.fetching || working === 'harper') return head + '<p class="micro">Getting Harper (about 30 MB, once)…</p>';
      return head + `<p class="micro">This copy of the app was built without Harper's files, so the app downloads them once (about 30 MB, from the npm registry) the first time a check runs.</p>${s.error ? `<p class="micro" style="color:#ff8a8a">${esc(s.error)}</p>` : ''}<div class="button-row"><button type="button" class="primary" data-ge="install" data-eng="harper">Get Harper now</button></div>`;
    }
    const err = s.error ? `<p class="micro" style="color:#ff8a8a">${esc(s.error)}</p>` : '';
    return head + `<label class="bb-check"><input type="checkbox" data-ge-on="harper"${s.enabled ? ' checked' : ''}> Use Harper in the checks</label><p class="micro">${ABOUT.harper}</p>${testHtml(testMsg.harper)}${err}<div class="button-row"><button type="button" class="ghost" data-ge="test" data-eng="harper">Test it</button></div>`;
  }
  function engineBox(eng) {
    const s = st[eng], head = `<h4 class="ge-h" style="margin:14px 0 4px">${NAME[eng]}${engine === eng ? ' <span class="bb-local-badge">In use</span>' : ''}</h4>`;
    if (!s || s.ok === false && !s.error) return head + '<p class="micro">Not available here.</p>';
    if (working === eng) {
      const pct = Math.round(((prog && prog.pct) || 0) * 100);
      return head + `<p class="micro">${esc((prog && prog.msg) || 'Starting…')}</p><div class="lt-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><p class="micro">${pct}%. Keep the app open until it finishes; this can take ${eng === 'localai' ? 'a long time on a slow connection. If it stops, press Install again and it continues where it stopped' : 'several minutes'}.</p>`;
    }
    const err = s.error ? `<p class="micro" style="color:#ff8a8a">${esc(s.error)}</p>` : '', dis = working ? ' disabled' : '';
    if (!s.installed) {
      const others = ENGINES.filter(k => k !== eng && st[k] && st[k].installed).map(k => NAME[k]);
      const plat = eng === 'localai' && s.platformOk === false ? '<p class="micro">This computer is not supported by the local AI.</p>' : '';
      return head + `<p class="micro">Not installed. ${ABOUT[eng]}${others.length ? ` Installing it removes ${others.join(' and ')}.` : ''}</p>${plat}${err}<div class="button-row"><button type="button" class="primary" data-ge="install" data-eng="${eng}"${dis || (eng === 'localai' && s.platformOk === false ? ' disabled' : '')}>Install ${eng === 'localai' ? 'the local AI' : NAME[eng]}</button></div>`;
    }
    return head + `<label class="bb-check"><input type="checkbox" data-ge-on="${eng}"${s.enabled ? ' checked' : ''}${dis}> Use ${NAME[eng]} in the checks</label><p class="micro">${ABOUT[eng]}</p><p class="micro">Installed in <code>${esc(s.root)}</code>${s.sizeMb ? ` (${s.sizeMb.toLocaleString()} MB)` : ''}${s.build ? `, running on the ${esc(s.build)}` : ''}. It starts by itself when a check needs it and stops after 15 idle minutes (or when the app closes).${s.running ? ' Running now.' : ''}</p>${testHtml(testMsg[eng])}${err}<div class="button-row"><button type="button" class="ghost" data-ge="test" data-eng="${eng}"${dis}>Test it</button><button type="button" class="ghost" data-ge="reinstall" data-eng="${eng}"${dis}>Reinstall / update</button><button type="button" class="ghost" data-ge="remove" data-eng="${eng}"${dis}>Remove</button></div>`;
  }
  function paint() {
    const box = root.document && $('lt-box'); if (!box) return;
    const order = [...ENGINES].sort((a, b) => (st[b] && st[b].installed ? 1 : 0) - (st[a] && st[a].installed ? 1 : 0));
    box.innerHTML = harperBox() + order.map(engineBox).join('');
  }
  async function refresh() {
    for (const k of ENGINES) { try { st[k] = api[PRE[k] + 'Status'] ? await api[PRE[k] + 'Status']() : null; } catch (e) { st[k] = {ok: false, error: String(e && e.message || e)}; } }
    try { stH = api.harperStatus ? await api.harperStatus() : null; } catch (e) { stH = {ok: false, error: String(e && e.message || e)}; }
    choose(); paint();
  }
  async function act(what, eng) {
    if (eng === 'harper') {
      if (what === 'on' || what === 'off') { await api.harperEnable(what === 'on'); return refresh(); }
      if (what === 'test') return runTest('harper');
      if (what === 'install' && api.harperInstall) { working = 'harper'; paint(); try { const r = await api.harperInstall(); if (r && r.ok === false && stH) stH.error = r.error; else say('Harper is ready.'); } finally { working = ''; } return refresh(); }
      return;
    }
    eng = ENGINES.includes(eng) ? eng : 'lt';
    const s = st[eng], pre = PRE[eng];
    if (what === 'install' || what === 'reinstall') {
      if (working) return;
      const others = ENGINES.filter(k => k !== eng && st[k] && st[k].installed).map(k => NAME[k]);
      const lines = [];
      if (what === 'install' && others.length) lines.push(`Installing ${NAME[eng]} removes ${others.join(' and ')} from this computer, so the app doesn't keep more than one large download. ${others.join(' and ')} ${others.length > 1 ? 'are' : 'is'} removed only after ${NAME[eng]} has installed and passed a test, so you always have one engine.`);
      if (eng === 'localai' && what === 'install') {
        lines.push(`The local AI downloads about 5.8 GB (the model and llama.cpp). If the download stops, press Install again and it continues where it stopped.`);
        if (s && s.ramGb && s.ramGb < 12) lines.push(`This computer has ${s.ramGb} GB of memory. The local AI needs about 8 GB free while it runs, so it may be slow or fail to start here.`);
      }
      if (lines.length && !root.confirm(lines.join('\n\n') + '\n\nContinue?')) return;
      working = eng; prog = {pct: 0, msg: 'Starting…'}; paint();
      try {
        const r = await api[pre + 'Install'](); working = '';
        if (r && r.ok === false) { if (s) s.error = r.error; }
        else say(`${NAME[eng]} is installed. The checks now use it.${r && r.removedOther ? ` ${r.removedOther} ${/ and /.test(r.removedOther) ? 'were' : 'was'} removed.` : ''}`);
      } catch (e) { working = ''; if (s) s.error = String(e && e.message || e); }
      paint(); refresh(); return;
    }
    if (what === 'remove') {
      if (!root.confirm(`Remove ${NAME[eng]} from this computer? Harper and the built-in check keep working. You can install it (or another engine) again any time.`)) return;
      await api[pre + 'Remove'](); say(`${NAME[eng]} was removed.`); refresh(); return;
    }
    if (what === 'on' || what === 'off') { await api[pre + 'Enable'](what === 'on'); refresh(); return; }
    if (what === 'test') return runTest(eng);
  }
  async function runTest(eng) {
    const sample = SAMPLE[eng], name = eng === 'harper' ? 'Harper' : NAME[eng];
    testMsg[eng] = {busy: eng === 'localai' ? 'Checking a sample passage… (the first check loads the model and can take a minute or two)' : `Checking a sample sentence… (the first check starts ${name} and can take up to a minute)`}; paint();
    let r;
    try {
      r = eng === 'harper' ? await api.harperCheck(sample) : eng === 'gector' ? await api.gectorCheck(sample, {tense: ''}) : eng === 'localai' ? await api.localaiCheck(sample, {tense: 'past'}) : await api.ltCheck(sample);
    } catch (e) { r = {ok: false, error: String(e && e.message || e)}; }
    if (!r || !r.ok) testMsg[eng] = {error: (r && r.error) || 'no answer'};
    else testMsg[eng] = {name, sample, items: (r.matches || []).filter(m => m.length > 0 && m.offset >= 0 && m.offset + m.length <= sample.length).sort((a, b) => a.offset - b.offset).map(m => ({
      before: sample.slice(m.offset, m.offset + m.length),
      after: [...new Set((m.replacements || []).filter(x => typeof x === 'string'))].slice(0, 3),
      note: eng === 'lt' || eng === 'localai' || eng === 'harper' ? String(m.message || m.short || '').replace(/\s+/g, ' ').trim() : ''
    }))};
    refresh();
  }
  const onProg = eng => p => { if (working !== eng) return; prog = p; if (p && p.phase === 'error' && st[eng]) st[eng].error = p.msg; if (root.document && $('lt-box')) paint(); };
  if (api.onLtProgress) api.onLtProgress(onProg('lt'));
  if (api.onGectorProgress) api.onGectorProgress(onProg('gector'));
  if (api.onLocalaiProgress) api.onLocalaiProgress(onProg('localai'));
  function init() { if (!(api.ltStatus || api.gectorStatus || api.localaiStatus || api.harperStatus) || !root.document) return; ensurePanel(); refresh(); }
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init); else init();
    root.document.addEventListener('click', ev => { const t = ev.target.closest && ev.target.closest('[data-view="settings"], [data-tab="settings"]'); if (t) setTimeout(() => { ensurePanel(); refresh(); }, 50); });
  }
  return {convert, convertGector, convertLocal, convertHarper, kindOf, provider, useIf, refresh, tenseFor, checkNow, get active() { return !!(engine || harperOn); }, get engine() { return engine; }, get harper() { return harperOn; }, get waiting() { return ENG.waiting; }, get version() { return versionTick; }};
});
