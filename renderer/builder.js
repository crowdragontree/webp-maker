/* Bot Builder (Creator Tool) */
(function () {
  const B = {templates: [], spec: null, v: null, saveT: null, fieldView: {}, editingOver: {}};
  window.CREATOR_TOOL = true;
  window.IS_SHARE = true;                       // nothing owner-specific is ever switched on in this tool
  // ---- the small helpers the Bot Builder needs from the page
  const toast = (msg, error = false) => {
    const el = document.getElementById('toast'); if (!el) { try { console.log(msg); } catch (_) { /* nothing to show it in */ } return; }
    el.textContent = msg; el.className = 'toast show' + (error ? ' error' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => { el.className = 'toast'; }, 4500);
  };
  window.toast = toast;
  window.copyText = window.copyText || (async text => {
    const t = String(text ?? '');
    try { if (window.juicyApp && window.juicyApp.copyText) { await window.juicyApp.copyText(t); return true; } } catch (_) { /* try the next way */ }
    try { await navigator.clipboard.writeText(t); return true; } catch (_) { /* try the next way */ }
    try { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (_) { return false; }
  });
  const N2_RE = /\[Name ?2\]|\{\{Name ?2\}\}/g;
  // a template with a second character: its name is put in wherever the template says [Name 2]
  function settleName2(spec, v) {
    if (!v || !v.names) return;
    const n2 = v.names[2] && String(v.names[2]).trim(); if (!n2) return;
    const fill = x => typeof x === 'string' ? x.replace(N2_RE, n2) : x;
    for (const k of Object.keys(v.over || {})) v.over[k] = fill(v.over[k]);
    for (const k of Object.keys(v.f || {})) v.f[k] = fill(v.f[k]);
    if (typeof v.intro === 'string') v.intro = fill(v.intro);
    if (Array.isArray(v.greet)) v.greet = v.greet.map(fill);
  }
  // ---- the Introduction Editor: the bot's words go over, the finished design comes back into the Introduction
  function openIntroductionDesigner() {
    if (!B.spec || !B.v) return toast('Choose a bot template before opening the Introduction Editor.', true);
    if (!window.CreatorHost || !window.CreatorHost.openDesigner) return toast('The Introduction Editor is not available.', true);
    const html = String(B.v.intro || '');
    const own = htmlIntro(html), edited = String(B.v.introHtml || '');       // own: the Introduction box already holds HTML; edited: HTML you changed by hand under View as HTML
    const design = B.v.introDesign && ((own && B.v.introDesignHtml === html) || (!own && !edited)) ? clone(B.v.introDesign) : null;
    if (design && design.fields) { design.fields.scene = B.v.header.scene; design.fields.name = B.v.names[1]; if (!own) design.fields.intro = html; }
    window.CreatorHost.openDesigner({
      fields: {scene: B.v.header.scene || '', name: B.v.names[1] || '', intro: own ? '' : html, extra: ''},
      ...(design ? {design} : {sourceHtml: own ? html : edited}),
      context: {templateId: B.spec.id}
    });
  }
  window.BuilderIntro = {
    active() { return B.spec && B.v ? {context: {templateId: B.spec.id}, label: String((B.v.header && B.v.header.scene) || (B.v.names && B.v.names[1]) || B.spec.name || 'the open bot').trim() || 'the open bot'} : null; }
  };
  window.addEventListener('creator:intro-returned', ev => {
    const result = ev.detail || {};
    if (!B.spec || !B.v || !result.html) return;
    const context = result.context;
    if (context && context.templateId !== B.spec.id) { toast('The open bot changed while you were designing. The Introduction was not applied to a different bot. Your design is still saved in the Introduction Editor.', true); return; }
    if (result.html.length > INTRO_MAX) { toast(`The Introduction is over JuicyChat's ${INTRO_MAX.toLocaleString()}-character limit.`, true); return; }
    // The Introduction box stays the plain text typed in the Editor; the design goes into the Introduction style as its template version
    // ({{intro}}, {{name}}, {{scene}} where the bot's words go), so View as text / View as HTML, the preview and Copy Introduction all work as usual.
    const plain = String((result.design && result.design.fields && result.design.fields.intro) ?? '').trim();
    if (plain && !htmlIntro(plain)) { B.v.intro = plain; if (typeof (B.v.over && B.v.over.introduction) === 'string') B.v.over.introduction = plain; }
    else if (B.v.over && htmlIntro(B.v.over.introduction)) delete B.v.over.introduction;
    B.v.introDesign = result.design; B.v.introDesignHtml = result.html; delete B.v.introHtml; B.v.iAuto = null;
    B.v.touched = B.v.touched || {}; B.v.touched.intro = true;
    save(); build();
    const section = document.querySelector('#bb-form .bb-sec[data-sec="introduction"]'); if (section) section.open = true;
    const tpl = String(result.templateHtml || '').trim(), LP = window.LivePreview; let styled = false;
    if (tpl && LP && LP.applyStyle) {
      try {
        LP.mount(); LP.update('introduction', introPayload(compose(B.spec, B.v)));
        styled = LP.applyStyle('Designer · ' + (B.v.header.scene || B.v.names[1] || 'Introduction'), tpl);
        LP.update('introduction', introPayload(compose(B.spec, B.v))); syncIvw(true);
      } catch (_) { styled = false; }
    }
    if (htmlIntro(B.v.intro)) toast('The Introduction box still holds HTML because the Editor had no plain text for it. Open the Introduction Editor, check the Introduction text, and Save and Return again.', true);
    else toast(styled ? 'Introduction saved in the Bot Builder. The text stays in the Introduction box, and the design is now the Introduction style "Designer · ' + (B.v.header.scene || B.v.names[1] || 'Introduction') + '". Copy Introduction copies the finished HTML.' : 'Introduction saved in the Bot Builder. The text stays in the Introduction box. The design could not be saved as an Introduction style; open Introduction style and paste your HTML there.', !styled);
  });
  const clone = value => JSON.parse(JSON.stringify(value));
  const q = id => document.getElementById(id);
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const SEC_TITLE = {header: 'Basics', introduction: 'Introduction', personality: 'Personality', scenario: 'Scenario',
    greeting: 'Greeting', image: 'Image Generation', tags: 'Tags', scene: 'Scene Breakdown', examples: 'Interaction Examples'};
  function blank(spec) {
    return {templateId: spec.id, header: {scene: '', age: ''}, names: {1: '', 2: '', 3: ''}, include3: false,
      intro: spec.introduction.prefix ? spec.introduction.prefix + ' ' : '', f: {},
      greet: Array(spec.greeting.count).fill(''), autoFormat: !spec.greeting.style || spec.greeting.style === 'quoted', examples: {conv: [], trig: []},
      img: {appearance: '', clothing: '', action: ''}, tags: [], tagsText: '',
      scenes: Array.from({length: spec.greeting.count}, () => ({name: '', shot: spec.scene.shotPrefix, setting: '', action: ''})),
      over: {}, auto: {}, gAuto: [], fit: {}};
  }

  // ---------------------------------------------------------------- reader: "you/your" or {{user}}
  function applyPov(spec, v) {
    if (!window.Pov) return; const L = window.Pov.locks(spec), m = v.pov === 'user' ? 'user' : 'you';
    // the Greeting only: the Introduction is always written to "you" (Dialogue always says "you" as well)
    v.greet = v.greet.map(p => window.Pov.convert(p || '', L.greet ? 'you' : m));
    if (v.over && typeof v.over.greeting === 'string') v.over.greeting = window.Pov.convert(v.over.greeting, L.greet ? 'you' : m);
    if (window.TemplateContract?.userCallRequired(spec)) v.greet = window.Pov.ensureUserLine(v.greet);
  }
  function povUi() {
    const box = q('bb-pov'); if (!box || !B.spec || !window.Pov) return;
    const L = window.Pov.locks(B.spec), m = B.v.pov === 'user' ? 'user' : 'you';
    box.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.pov === m); });
    const ub = box.querySelector('[data-pov=user]'); ub.disabled = !!L.greet; ub.title = L.greet || 'Refer to the reader as {{user}} in the Greeting narration';
  }
  // ----------------------------------------------------- local narration tense
  const TENSE_PARTS = [{scope: 'intro', label: 'Introduction'}, {scope: 'greet', label: 'Greeting'}];
  function renderTense() {
    const host = q('bb-tense'); if (!host) return;
    host.hidden = !B.spec || !B.v;
    if (host.hidden) return;
    const T = window.NarrativeTense;
    if (!host.querySelector('[data-tense]')) {
      host.innerHTML = `<div class="bb-tense-top"><strong>Narration tense</strong><span class="bb-local-badge">On this computer</span></div>
        ${TENSE_PARTS.map(p => `<div class="bb-tense-row" data-tense-row="${p.scope}"><span class="bb-tense-part">${p.label}</span><div class="bb-tense-buttons" role="group" aria-label="${p.label} narration tense">
          <button type="button" data-tense="past" data-scope="${p.scope}" aria-pressed="false">Past</button><button type="button" data-tense="present" data-scope="${p.scope}" aria-pressed="false">Present</button></div>
          <button type="button" class="ghost bb-tense-undo" data-tense-undo="${p.scope}" disabled title="Undo the last Past / Present change">Undo</button><button type="button" class="ghost bb-tense-undo bb-tense-restore" data-tense-restore="${p.scope}" disabled title="Go back to the text as it was before you pressed Past or Present, however many times you pressed them">Restore original</button><span class="bb-tense-status" data-tense-status="${p.scope}" role="status" aria-live="polite"></span></div>`).join('')}
        <p class="bb-tense-help">Pick the Introduction and the Greeting tense separately. Quoted dialogue, image links and formatting stay unchanged. Rule-based conversion: review complex or mixed-time sentences.</p>`;
      host.querySelectorAll('[data-tense]').forEach(button => button.onclick = () => changeTense(button.dataset.tense, button.dataset.scope));
      host.querySelectorAll('[data-tense-undo]').forEach(button => button.onclick = () => changeTense('undo', button.dataset.tenseUndo));
      host.querySelectorAll('[data-tense-restore]').forEach(button => button.onclick = () => changeTense('restore', button.dataset.tenseRestore));
    }
    const labels = {past: 'Past tense', present: 'Present tense', mixed: 'Mixed narration', unknown: 'Not set'};
    for (const part of TENSE_PARTS) {
      const S = T ? T.status(B.v, part.scope) : {mode: 'unknown', canUndo: false};
      host.querySelectorAll(`[data-tense][data-scope="${part.scope}"]`).forEach(button => {
        button.disabled = !T;
        button.classList.toggle('on', S.mode === button.dataset.tense);
        button.setAttribute('aria-pressed', String(S.mode === button.dataset.tense));
      });
      host.querySelector(`[data-tense-undo="${part.scope}"]`).disabled = !S.canUndo;
      host.querySelector(`[data-tense-restore="${part.scope}"]`).disabled = !S.canRestore;
      host.querySelector(`[data-tense-status="${part.scope}"]`).textContent = T ? (labels[S.mode] || labels.unknown) : 'The local converter could not load. Your text has not been changed.';
    }
  }
  function changeTense(target, scope) {
    if (!B.v || !B.spec || !window.NarrativeTense || !['intro', 'greet'].includes(scope)) return;
    const name = scope === 'intro' ? 'Introduction' : 'Greeting';
    try {
      let result;
      if (target === 'undo') {
        if (!window.NarrativeTense.undo(B.v, scope)) return toast(`There is no unchanged tense conversion to undo for the ${name}. Your current edits are kept.`, true);
      } else if (target === 'restore') {
        if (!window.NarrativeTense.restore(B.v, scope)) return toast(`The ${name} has been edited since the last tense change (or was never changed), so there is no original to restore. Your current text is kept.`, true);
      } else result = window.NarrativeTense.apply(B.v, target, scope);
      // Update only the affected controls. Keep open sections and scroll position.
      document.querySelectorAll('#bb-form .bb-in[data-k]').forEach(el => {
        const k = el.dataset.k;
        if (scope === 'intro' && k === 'intro') el.value = B.v.intro;
        else if (scope === 'greet' && /^g\.\d+$/.test(k)) el.value = B.v.greet[+k.slice(2)];
        else if (scope === 'intro' && k === 'over.introduction') el.value = typeof B.v.over.introduction === 'string' ? B.v.over.introduction : compose(B.spec, B.v).sec.introduction.body;
        else if (scope === 'greet' && k === 'over.greeting') el.value = typeof B.v.over.greeting === 'string' ? B.v.over.greeting : compose(B.spec, B.v).sec.greeting.body;      // the markdown box shows the finished Greeting when it has no edited copy of its own (never "undefined")
        else return;
        if (el.tagName === 'TEXTAREA') { grow(el); el.dispatchEvent(new Event('bbrepaint')); }      // the Greeting markdown box shows a painted copy of its text: repaint it, or it keeps showing the old tense
      });
      refresh(); save();
      toast(target === 'restore' ? `Restored the ${name} exactly as it was before the first tense change.` : target === 'undo' ? `Restored the exact ${name} text from before the last tense conversion.` : result.changed ? `${name} switched to ${target} tense locally. Review the result before publishing.` : `No recognized narration verbs needed changing in the ${name} for ${target} tense.`);
    } catch (err) { console.error(err); toast('Tense conversion failed: ' + err.message, true); }
  }
  // ---------------------------------------------------------------- character limits: from the template, or asked from you
  const SEC_NAME = {introduction: 'Introduction', personality: 'Personality', scenario: 'Scenario', greeting: 'Greeting'};
  function renderLimits() {
    const host = q('bb-limits'); if (!host || !B.spec) return;
    const missing = B.spec.missingLimits || [], f = L => L ? `${L.min.toLocaleString()}–${L.max.toLocaleString()}` : '';
    const total = B.spec.rules && B.spec.rules.total;
    host.className = 'bb-limits' + (missing.length ? ' need' : '');
    host.innerHTML = `<div class="bb-lim-row">${Object.keys(SEC_NAME).map(sec => { const L = B.spec[sec] && B.spec[sec].limit;
        if (B.spec[sec] && B.spec[sec].absent) return `<span class="bb-lim"><b>${SEC_NAME[sec]}</b>—<small>not in this template</small></span>`;
        return `<span class="bb-lim ${L ? (L.fromUser ? 'mine' : '') : 'none'}"><b>${SEC_NAME[sec]}</b>${L ? `${f(L)}<small>${L.fromUser ? 'set by you' : 'from template'}</small>` : '<small>no limit in template</small>'}</span>`; }).join('')}
      ${total ? `<span class="bb-lim"><b>Combined</b>${f(total)}<small>${total.softMin || total.softMax ? 'approximate' : 'from template'}</small></span>` : ''}</div>
      ${B.spec.limitConflict ? `<div class="bb-lim-ask"><p><b>These limits contradict each other.</b> ${e(B.spec.limitConflict)} Change one of them in the template so a bot can meet both.</p></div>` : ''}
      ${missing.length ? `<details class="bb-lim-ask"><summary><b>Character limits: optional</b> <small>(${missing.map(x => SEC_NAME[x]).join(', ')} have none in this template)</small></summary><p><b>This template doesn't set a character limit for the ${missing.map(x => SEC_NAME[x]).join(', ')}.</b> Optional: set ${missing.length > 1 ? 'them' : 'it'} if you want the checks to measure the length. Leave it empty to write without a limit. Saved for this template; if the template gets its own limit later, the template's wins.</p>
        ${missing.map(sec => `<label>${SEC_NAME[sec]} <input type="number" min="1" step="10" class="bb-lim-in" data-sec="${sec}" data-k="min" placeholder="minimum"> to <input type="number" min="1" step="10" class="bb-lim-in" data-sec="${sec}" data-k="max" placeholder="maximum"> characters</label>`).join('')}
        <div class="button-row"><button class="primary" id="bb-lim-save">Save limits</button></div></details>` : ''}`;
    const sv = q('bb-lim-save'); if (sv) sv.onclick = async () => {
      const lim = {}; for (const inp of host.querySelectorAll('.bb-lim-in')) { (lim[inp.dataset.sec] = lim[inp.dataset.sec] || {})[inp.dataset.k] = +inp.value; }
      for (const sec of Object.keys(lim)) { const L = lim[sec] || {}; if (!L.min && !L.max) delete lim[sec]; else if (!(L.min > 0) || !(L.max >= L.min)) return toast(`Enter a minimum and a maximum for the ${SEC_NAME[sec]} (the maximum at least as large as the minimum), or leave both empty.`, true); }
      if (!Object.keys(lim).length) return toast('Enter a minimum and a maximum for at least one section.', true);
      try { B.templates = await window.juicyApp.builderSetLimits(B.spec.id, lim); selectTemplate(B.spec.id); toast(`Limits saved for ${B.spec.name}.`); } catch (e) { toast(e.message, true); }
    };
  }
  window.builderMissingLimits = () => (B.spec && B.spec.missingLimits) || [];
  function ageSources() {
    const v = B.v, out = [], direct = k => v.over && typeof v.over[k] === 'string', many = !direct('greeting') && (v.greet || []).length > 1;
    if (direct('introduction')) out.push({label: 'Introduction', get: () => v.over.introduction, set: t => { v.over.introduction = t; }});
    else out.push({label: 'Introduction', get: () => v.intro || '', set: t => { v.intro = t; (v.touched = v.touched || {}).intro = true; v.iAuto = null; }});
    if (direct('greeting')) out.push({label: 'Greeting', get: () => v.over.greeting, set: t => { v.over.greeting = t; }});
    else (v.greet || []).forEach((_, i) => out.push({label: many ? `Greeting, passage ${i + 1}` : 'Greeting', get: () => v.greet[i] || '', set: t => { v.greet[i] = t; (v.touched = v.touched || {})['g' + i] = true; if (v.gAuto) v.gAuto[i] = null; }}));
    return out;
  }
  async function copyCheck(el, text) {
    try { const sel = window.getSelection && window.getSelection(); if (sel && String(sel).trim() && el.contains(sel.anchorNode)) return; } catch (_) { /* ignore */ }
    const t = String(text || '').trim(); if (!t) return;
    try { await window.copyText(t); el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1200); toast('Copied: ' + (t.length > 70 ? t.slice(0, 67) + '\u2026' : t)); } catch (_) { toast('Could not copy.', true); }
  }
  // ---------------------------------------------------------------- spelling, grammar and wording (checked here on this computer)
  const WORD_KIND = {spelling: 'Spelling', grammar: 'Grammar', wording: 'Wording'};
  function wordNames() { const v = B.v || {}; return [...Object.values(v.names || {}), v.header && v.header.name, v.header && v.header.scene].filter(x => typeof x === 'string' && x); }
  // every piece of text the check reads: the Introduction, the Greeting and the written boxes of the Personality and the Scenario (each one can be fixed from the window)
  function wordSources() {
    const v = B.v, spec = B.spec, out = ageSources().map(src => ({key: /^Intro/.test(src.label) ? 'introduction' : 'greeting', label: src.label, src}));
    for (const sec of ['personality', 'scenario']) {
      if (!spec[sec] || !spec[sec].lines || (v.over && typeof v.over[sec] === 'string')) continue;     // the whole section typed as one text is left alone
      const seen = new Set();
      for (const l of spec[sec].lines) for (const s of l.segs) {
        if (s.t !== 'ph' || (l.opt3 && !v.include3) || seen.has(s.key)) continue; seen.add(s.key);
        if (!String((v.f || {})[s.key] || '').trim()) continue;
        out.push({key: sec, label: `${SEC_TITLE[sec] || sec}: ${s.label}`, src: {get: () => (v.f || {})[s.key] || '', set: t => setPath('f.' + s.key, t)}});
      }
    }
    return out;
  }
  // v1.2.6: a sentence you reviewed in the Spelling & wording window stays reviewed. Pressing "Apply my changes" with a flagged sentence left as it is
  // keeps it as written, and a sentence you rewrote yourself is yours: neither is flagged for wording again (spelling and grammar are still checked).
  // Kept on this computer only, by the sentence's own words, so the same sentence in another bot is not affected unless it is word for word the same.
  const KEPT_KEY = 'jbs.textcheck.keptSentences', keptNorm = x => String(x || '').toLowerCase().replace(/[*_"“”‘’'\s]+/g, ' ').replace(/^[\s.,!?]+|[\s.,!?]+$/g, '').trim();
  function keptSet() { try { return new Set(JSON.parse(localStorage.getItem(KEPT_KEY) || '[]')); } catch (_) { return new Set(); } }
  function keepSentences(list) { try { const all = keptSet(); for (const x of list) { const n = keptNorm(x); if (n) all.add(n); } const arr = [...all]; localStorage.setItem(KEPT_KEY, JSON.stringify(arr.slice(-2000))); return true; } catch (_) { return false; } }
  function wordItems() {
    const TC = window.TextCheck; if (!TC || !B.v || !B.spec) return [];
    const kept = keptSet();
    const names = wordNames(), items = [], cache = B.wordCache || (B.wordCache = new Map());
    if (cache.size > 80) cache.clear();
    wordSources().forEach((s, si) => {
      const text = String(s.src.get() || '');
      if (!text || htmlIntro(text)) return;
      const key = names.join('|') + '\u0000' + text; let hits = cache.get(key); if (!hits) { hits = TC.check(text, {names}); cache.set(key, hits); }
      hits.forEach(hit => { if (hit.kind === 'wording' && kept.size) { const sr = sentenceRange(text, hit); if (kept.has(keptNorm(text.slice(sr[0], sr[1])))) return; } items.push({id: `${si}:${hit.start}:${hit.kind}`, si, s, text, hit}); });
    });
    return items;
  }
  const wordCtx = (text, h) => `${e(text.slice(Math.max(0, h.start - 50), h.start).replace(/^\S*\s/, '…'))}<mark>${e(text.slice(h.start, h.end) || '·')}</mark>${e(text.slice(h.end, h.end + 50).replace(/\s\S*$/, '…'))}`;
  { let ltT = 0; window.addEventListener('jbs-lt-update', () => { clearTimeout(ltT); ltT = setTimeout(() => { if (!B.v || document.querySelector('#bb-word-close')) return; B.wordCache = null; try { refresh(); } catch (_) { /* the Checks list catches up on the next change */ } }, 250); }); }
  function addWordingNotes(res) {
    if (!window.TextCheck || !B.v || !B.spec) return;
    const items = wordItems(), by = {};
    for (const x of items) (by[x.s.key] = by[x.s.key] || []).push(x);
    for (const k of Object.keys(by)) {
      const list = by[k], n = list.length, show = list.slice(0, 2).map(x => `“${x.text.slice(x.hit.start, x.hit.end).trim().slice(0, 40)}”`).join(', ');
      (res[k] = res[k] || []).push(['warn', `Spelling and wording: ${n} thing${n > 1 ? 's' : ''} to look at (${show}${n > 2 ? ', …' : ''}). Open Checks > Spelling & wording to go through ${n > 1 ? 'them' : 'it'}.`]);
    }
    B.wordCount = items.length;
    const b = q('bb-spell'); if (b) b.textContent = items.length ? `Spelling & wording (${items.length})` : 'Spelling & wording ✓';
  }
  function sentenceRange(t, h) {
    let a = h.start; while (a > 0 && !/[.!?\n]/.test(t[a - 1])) a--;
    while (a < h.start && /[\s*_]/.test(t[a])) a++;          // v1.2.6: the * that opens an italic line stays outside the box, so a rewrite can't break the italics
    let z = h.end; while (z < t.length && !/[.!?\n]/.test(t[z])) z++;
    while (z < t.length && /[.!?"”]/.test(t[z])) z++;           // ...and so does the * that closes it
    return [a, z];
  }
  function askWording(items) {
    return new Promise(resolve => {
      const root = document.createElement('div'); root.className = 'upd-modal sr-modal'; root.id = 'bb-word-modal';
      const addBtn = x => `<button type="button" class="ghost sm" data-addword="${e(x.id)}" data-word="${e(x.text.slice(x.hit.start, x.hit.end))}">Add to dictionary</button>`;
      // wording and grammar notes can be dismissed for good ("gonna", a phrase you like): a single word goes into the dictionary, a phrase is ignored
      const ignBtn = (x, h) => { const w = x.text.slice(h.start, h.end).trim(); if (!w) return ''; return /^[A-Za-z'’-]+$/.test(w) ? `<button type="button" class="ghost sm" data-addword="${e(x.id)}" data-word="${e(w)}" title="Stop flagging this word">Add to dictionary</button>` : `<button type="button" class="ghost sm" data-ignore="${e(x.id)}" data-word="${e(w)}" title="Stop flagging this wording">Ignore this</button>`; };
      const rowsData = [];
      for (const x of items) {
        const h = x.hit, manual = h.fix == null && !(h.suggest && h.suggest.length);
        if (h.kind === 'wording' && manual) {         // a wording problem is fixed by rewriting its sentence: hits in the same sentence share one box
          const sr = sentenceRange(x.text, h), key = `${x.si}:${sr[0]}`; let g = rowsData.find(r => r.key === key);
          if (!g) rowsData.push(g = {key, sent: true, x, sr, hits: []}); g.hits.push(h);
        } else rowsData.push({key: x.id, x});
      }
      const rows = rowsData.map(r => {
        const x = r.x, h = x.hit;
        if (r.sent) {
          const sent = x.text.slice(r.sr[0], r.sr[1]);
          return `<div class="bb-kw-item bb-word-item" data-row="${e(r.key)}"><p class="bb-word-h"><b>Wording</b> · ${e(x.s.label)}</p>${r.hits.map(k => `<p class="bb-word-msg">${e(k.msg)} ${ignBtn(x, k)}</p>`).join('')}<label class="micro">Rewrite the sentence here, or leave it as it is</label><textarea class="bb-in bb-word-edit" rows="${Math.min(6, Math.max(2, Math.ceil(sent.length / 80)))}" data-sent="${e(r.key)}" data-si="${x.si}" data-a="${r.sr[0]}" data-z="${r.sr[1]}" spellcheck="false">${e(sent)}</textarea></div>`;
        }
        const act = h.suggest && h.suggest.length ? `<label class="micro">Change to <select data-pick="${e(x.id)}"><option value="">Leave it</option>${h.suggest.map((sg, i) => `<option value="${e(sg)}"${i === 0 ? ' selected' : ''}>${e(sg)}</option>`).join('')}</select></label> ${addBtn(x)}`
          : h.fix != null ? `<label class="bb-check"><input type="checkbox" data-id="${e(x.id)}"${h.src === 'languagetool' && h.kind === 'wording' ? '' : ' checked'}> ${h.kind === 'wording' ? 'Change it to' : 'Fix'}: ${e(h.fix.trim() === '' ? 'one space' : '“' + h.fix.trim() + '”')}</label> ${h.kind === 'spelling' ? '' : ignBtn(x, h)}`
          : h.kind === 'spelling' ? `<p class="micro">No close match. Fix it by hand, or ${addBtn(x)} if it is a name or a real word.</p>`
          : `<p class="micro">Edit this one by hand, or ${ignBtn(x, h)}</p>`;
        return `<div class="bb-kw-item bb-word-item" data-row="${e(x.id)}"><p class="bb-word-h"><b>${e(WORD_KIND[h.kind])}</b> · ${e(x.s.label)}</p><p class="bb-word-msg">${e(h.msg)}</p><pre>${wordCtx(x.text, h)}</pre>${act}</div>`;
      }).join('');
      root.innerHTML = `<section class="upd-box sr-box" role="dialog" aria-modal="true" tabindex="-1"><header><h3>Spelling, grammar and wording</h3><p>${items.length} thing${items.length > 1 ? 's' : ''} found by the app's own checker, on this computer. Tick what you want fixed, or rewrite a sentence in its box. A sentence box you leave as it is is kept as written when you press Apply, and is not flagged again.</p></header><div class="sr-body">${rows}</div><footer><span class="micro">Nothing changes until you press the button.</span><div class="button-row"><button type="button" class="ghost" id="bb-word-close">Close</button><button type="button" class="primary" id="bb-word-use">Apply my changes</button></div></footer></section>`;
      document.body.appendChild(root);
      const done = v => { root.remove(); resolve(v); };
      root.querySelector('#bb-word-close').onclick = () => done(null);
      root.querySelector('#bb-word-use').onclick = () => done({
        ids: [...root.querySelectorAll('input[type=checkbox]:checked')].map(c => c.dataset.id),
        picks: Object.fromEntries([...root.querySelectorAll('select[data-pick]')].filter(s => s.value).map(s => [s.dataset.pick, s.value])),
        allSents: [...root.querySelectorAll('textarea[data-sent]')].map(t => ({si: +t.dataset.si, start: +t.dataset.a, end: +t.dataset.z, value: t.value, orig: t.defaultValue})),
        get sents() { return this.allSents.filter(t => t.value !== t.orig && t.value.trim()); }});
      root.addEventListener('click', ev => { const b = ev.target.closest('[data-addword],[data-ignore]'); if (!b) return; const adding = b.hasAttribute('data-addword'); if (adding ? window.TextCheck.addWord(b.dataset.word) : window.TextCheck.ignorePhrase(b.dataset.word)) { B.wordCache = null; try { refresh(); } catch (_) { /* the Checks list follows the new dictionary at once */ } const msg = b.closest('.bb-word-msg'), row = b.closest('.bb-word-item'); if (msg) msg.remove(); if (row && !row.querySelector('.bb-word-msg') || (row && !msg)) row.remove(); toast(adding ? `“${b.dataset.word}” added to your dictionary.` : `“${b.dataset.word}” will not be flagged again.`); try { refresh(); } catch (_) { /* ignore */ } } });
      root.addEventListener('keydown', ev => { if (ev.key === 'Escape') done(null); }); root.querySelector('.sr-box').focus();
    });
  }
  async function offerWording(manual) {
    if (!window.TextCheck || !B.v || !B.spec || document.getElementById('bb-word-modal')) return;
    const items = wordItems();
    if (!items.length) { B.wordCache = null; try { refresh(); } catch (_) { /* bring the Checks list up to date */ } if (manual) toast('No spelling, grammar or wording problems found.'); return; }
    const v0 = B.v, r = await askWording(items);
    if (B.v === v0) { B.wordCache = null; try { refresh(); } catch (_) { /* the list matches what is on screen again */ } }
    if (r && B.v !== v0) return toast('The bot changed while this window was open, so nothing was applied. Open Spelling & wording again.', true);
    if (!r) return;
    const by = new Map(); let n = 0;
    const keptAsIs = r.allSents.filter(t => t.value === t.orig || !t.value.trim()).map(t => t.orig), rewritten = r.sents.map(t => t.value.replace(/\s*\n\s*/g, ' ').trim());
    const group = (x) => { if (!by.has(x.si)) by.set(x.si, {s: x.s, text: x.text, picks: []}); return by.get(x.si); };
    for (const x of items) {
      const rep = r.picks[x.id] != null ? r.picks[x.id] : (r.ids.includes(x.id) && x.hit.fix != null ? x.hit.fix : null);
      if (rep == null || r.sents.some(t => t.si === x.si && x.hit.start >= t.start && x.hit.end <= t.end)) continue;     // a sentence you rewrote by hand replaces any small fix inside it
      group(x).picks.push({start: x.hit.start, end: x.hit.end, replacement: rep});
    }
    for (const t of r.sents) { const x = items.find(i => i.si === t.si); if (x) group(x).picks.push({start: t.start, end: t.end, replacement: t.value.replace(/\s*\n\s*/g, ' ').trim()}); }
    for (const g of by.values()) { g.s.src.set(window.TextCheck.apply(g.text, g.picks)); n += g.picks.length; }
    const kept = keptAsIs.length + rewritten.length; if (kept) keepSentences([...keptAsIs, ...rewritten]);
    B.wordCache = null;
    if (!n) { try { refresh(); } catch (_) { /* the Checks list follows */ } return toast(kept ? `Kept ${keptAsIs.length} sentence${keptAsIs.length > 1 ? 's' : ''} as written. ${keptAsIs.length > 1 ? 'They are' : 'It is'} not flagged again.` : 'Nothing was changed.'); }
    save(); build();
    toast(`Changed ${n} thing${n > 1 ? 's' : ''}.${keptAsIs.length ? ` Kept ${keptAsIs.length} sentence${keptAsIs.length > 1 ? 's' : ''} as written.` : ''}`);
  }

  // ---------------------------------------------------------------- compose
  function nameOf(v, tok) {
    const n = tok[1], upper = tok.endsWith('U');
    if (tok === 'N3?') return v.include3 ? (v.names[3] || '[Name3]') : '\u0003?';
    if (n === '3' && !v.include3) return '\u0003';
    const val = v.names[n] || (n === '1' ? '[Name]' : `[Name${n}]`);
    return upper ? val.toUpperCase() : val;
  }
  function renderLines(lines, v, missing) {
    const out = [];
    for (const l of lines) {
      if (l.opt3 && !v.include3) continue;
      out.push(l.segs.map((s, index) => {
        if (s.t === 'lit') return s.v.replace(/\u0001(N[123]\??U?)\u0002/g, (_, t) => nameOf(v, t));
        let val = (v.f[s.key] || '').trim();
        if (!val) { missing.push(s.label); return s.orig; }
        if (window.Dialogue?.speechSlot && /["\u201c]\s*$/.test(l.segs[index - 1]?.v || '') && /^\s*["\u201d]/.test(l.segs[index + 1]?.v || '')) val = window.Dialogue.speechSlot(val, Object.values(v.names || {}));
        if (s.endsSentence || s.mode === 'key') val = val.replace(/[.!?]+["”]?$/, m => m.includes('"') || m.includes('”') ? m.replace(/[.!?]+/, '') : '');
        return val;
      }).join(''));
    }
    // a line that is only about a third character (e.g. "*💭 [Name3]'s Thoughts ... if Name3 is used*") goes when there isn't one
    const n12 = [v.names[1], v.names[2]].filter(Boolean);
    const kept = v.include3 ? out : out.filter(line => !(line.includes('\u0003') && !n12.some(n => line.includes(n))));
    let t = kept.join('\n');
    if (!v.include3) t = t.replace(/;\s*\u0003\??/g, '').replace(/,?\s*plus \u0003(?:'s)? when (?:\u0003 is )?used/g, '')
      .replace(/,?\s*and \u0003 when used/g, '').replace(/,?\s*including \u0003 only when used/g, '')
      .replace(/,?\s*plus \u0003(?:'s)?/g, '').replace(/\u0003\??/g, '');
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }
  function autoFormat(p) {
    const parts = [];
    for (const line of p.split('\n')) {
      const t = line.trim(); if (!t) { if (parts.length && parts[parts.length-1].s) parts.push({d:false,s:''}); continue; }
      if (/^!\[\]\(image\d+\)$/.test(t)) continue;
      const re = /"[^"\n]+"|“[^”\n]+”/g; let last = 0, m;
      const push = s => { s = s.trim().replace(/^\*+|\*+$/g, '').trim(); if (s) parts.push({d: false, s: `*${s}*`}); };
      while ((m = re.exec(t))) { push(t.slice(last, m.index)); parts.push({d: true, s: '"' + m[0].slice(1, -1).trim() + '"'}); last = m.index + m[0].length; }
      push(t.slice(last));
    }
    return parts.map((x, i) => (i && x.d && parts[i-1].s ? '\n' : '') + x.s).join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  // ---------------------------------------------------------------- Interaction Examples (optional, like JuicyChat's): Conversations (User / Character) and Triggered Interactions (Trigger / Response), up to 5,000 characters each
  const EX_MAX = 5000;
  const EX_KINDS = {conv: {title: 'Conversations', a: 'user', b: 'char', la: 'User', lb: 'Character', what: 'Conversation example'}, trig: {title: 'Triggered Interactions', a: 'trigger', b: 'response', la: 'Trigger', lb: 'Response', what: 'Triggered interaction'}};
  const exOf = v => { const x = v && v.examples && typeof v.examples === 'object' ? v.examples : {}; return {conv: Array.isArray(x.conv) ? x.conv : [], trig: Array.isArray(x.trig) ? x.trig : []}; };
  const exLen = (v, kind) => exOf(v)[kind].reduce((n, r) => n + String(r[EX_KINDS[kind].a] || '').length + String(r[EX_KINDS[kind].b] || '').length, 0);
  const exFilled = (v, kind) => exOf(v)[kind].filter(r => String(r[EX_KINDS[kind].a] || '').trim() || String(r[EX_KINDS[kind].b] || '').trim());
  function exampleText(v) {
    const out = [];
    for (const kind of ['conv', 'trig']) {
      const K = EX_KINDS[kind], rows = exFilled(v, kind); if (!rows.length) continue;
      out.push(`${K.title}:\n` + rows.map((r, i) => `Example ${i + 1}\n${K.la}: ${String(r[K.a] || '').trim()}\n${K.lb}: ${String(r[K.b] || '').trim()}`).join('\n\n'));
    }
    return out.join('\n\n');
  }
  // v1.3.3: Interaction Examples read back from a loaded bot, so Save as .json keeps them. Reads the app's own .txt layout
  // ("Conversations:" / "Triggered Interactions:", "Example 1", "User:" / "Character:", "Trigger:" / "Response:") and the
  // .json example_dialogue ("<START>", "{{user}}:" / "{{char}}:"). A reply can run over several lines. Returns {conv, trig}.
  function exampleRows(text, names) {
    const out = {conv: [], trig: []}, src = String(text || '').replace(/\r\n/g, '\n').trim(); if (!src) return out;
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), own = (names || []).map(x => String(x || '').trim()).filter(x => x && x.length <= 40).map(esc);
    const lab = alts => new RegExp('^\\s*[*_]{0,2}\\s*(?:' + alts + ')\\s*[*_]{0,2}\\s*:\\s*(?:(?:\\*\\*|__)(?=\\s|$))?[ \\t]?(.*)$', 'i');
    const LABS = [['conv', 'user', lab('user|you|\\{\\{user\\}\\}|<user>')], ['conv', 'char', lab(['character', 'char', 'bot', '\\{\\{char\\}\\}', '<bot>', ...own].join('|'))], ['trig', 'trigger', lab('trigger')], ['trig', 'response', lab('response')]];
    const A = {conv: 'user', trig: 'trigger'};
    let cur = null, field = '';
    const done = () => { if (cur) { const r = {}; for (const k of Object.keys(cur.f)) r[k] = cur.f[k].join('\n').replace(/\n{3,}/g, '\n\n').trim(); if (Object.values(r).some(Boolean)) out[cur.kind].push(r); } cur = null; field = ''; };
    for (const line of src.split('\n')) {
      const t = line.trim();
      if (/^[#*_\s]*(?:conversations?|conversation examples?)[*_\s]*:?[*_\s]*$/i.test(t) || /^[#*_\s]*triggered interactions?[*_\s]*:?[*_\s]*$/i.test(t)) { done(); continue; }
      if (/^(?:<start>|[#*_\s]*example\s*\d*[*_\s]*:?[*_\s]*|[-*_=]{3,})$/i.test(t)) { done(); continue; }
      const hit = LABS.find(([, , re]) => re.test(line));
      if (hit) {
        const [kind, f, re] = hit, a = f === A[kind];
        const filled = cur && Object.values(cur.f).some(x => x.join('').trim());
        if (!cur || cur.kind !== kind || (a ? filled : (cur.f[f] && cur.f[f].join('').trim()))) { done(); cur = {kind, f: {}}; }
        field = f; cur.f[f] = [line.match(re)[1]]; continue;
      }
      if (cur && field) cur.f[field].push(line);
    }
    done();
    return {conv: out.conv.map(r => ({user: r.user || '', char: r.char || ''})), trig: out.trig.map(r => ({trigger: r.trigger || '', response: r.response || ''}))};
  }
  // v1.3.3: the Interaction Examples of a loaded .json bot: example_dialogue (what Save as .json writes), a TavernAI card's mes_example,
  // or the lists the app's older .json layout kept
  function jsonExamples(raw) {
    let o; try { o = JSON.parse(raw); } catch { return {conv: [], trig: []}; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {conv: [], trig: []};
    const str = x => typeof x === 'string' ? x : '', arr = x => Array.isArray(x) ? x : [], d = o.data && typeof o.data === 'object' ? o.data : o;
    const ext = (d.extensions && d.extensions.juicy_blueprint) || {};
    const box = [o.interactionExamples, ext.interactionExamples, o.examples, ext.examples].find(x => x && typeof x === 'object' && !Array.isArray(x));
    if (box) {
      const conv = arr(box.conversations || box.conv).map(r => ({user: str(r && r.user).trim(), char: str(r && (r.character || r.char)).trim()})).filter(r => r.user || r.char);
      const trig = arr(box.triggeredInteractions || box.triggered || box.trig).map(r => ({trigger: str(r && r.trigger).trim(), response: str(r && r.response).trim()})).filter(r => r.trigger || r.response);
      if (conv.length || trig.length) return {conv, trig};
    }
    return exampleRows(str(o.example_dialogue) || str(d.mes_example) || str(o.mes_example), [str(o.char_name), str(d.name)]);
  }
  function exampleIssues(v) {
    const o = [];
    for (const kind of ['conv', 'trig']) {
      const K = EX_KINDS[kind];
      exOf(v)[kind].forEach((r, i) => { const a = String(r[K.a] || '').trim(), b = String(r[K.b] || '').trim(); if ((a || b) && !(a && b)) o.push(['bad', `${K.what} ${i + 1} needs both the ${K.la} and the ${K.lb} text.`]); });
      const n = exLen(v, kind);
      if (n > EX_MAX) o.push(['bad', `${K.title} are ${n.toLocaleString()} characters. The limit is ${EX_MAX.toLocaleString()} (${(n - EX_MAX).toLocaleString()} over).`]);
      else if (n) o.push(['ok', `${K.title}: ${n.toLocaleString()} of ${EX_MAX.toLocaleString()} characters.`]);
    }
    return o;
  }
  function examplesHtml(v) {
    return ['conv', 'trig'].map(kind => {
      const K = EX_KINDS[kind], rows = exOf(v)[kind], n = exLen(v, kind);
      return `<div class="bb-ex" data-ex-kind="${kind}"><div class="bb-ex-h"><b>${K.title}</b><span class="bb-ex-count${n > EX_MAX ? ' bad' : ''}" data-ex-count="${kind}">${n.toLocaleString()}/${EX_MAX.toLocaleString()}</span></div>
        ${rows.map((r, i) => `<div class="bb-ex-row" data-ex-row="${i}"><div class="bb-ex-n"><span>Example ${i + 1}</span><button type="button" class="ghost sm" data-ex-del="${kind}.${i}" title="Remove this example" aria-label="Remove ${K.what.toLowerCase()} ${i + 1}">✕</button></div>
          <label class="bb-field"><span>${K.la}</span><textarea class="bb-ex-in" rows="2" data-ex="${kind}.${i}.${K.a}" placeholder="${K.la === 'User' ? 'What the user says' : 'What triggers it (a word, an action)'}">${e(r[K.a] || '')}</textarea></label>
          <label class="bb-field"><span>${K.lb}</span><textarea class="bb-ex-in" rows="2" data-ex="${kind}.${i}.${K.b}" placeholder="${K.la === 'User' ? 'How the character answers' : 'How the character responds'}">${e(r[K.b] || '')}</textarea></label></div>`).join('')}
        <button type="button" class="secondary bb-ex-add" data-ex-add="${kind}">+ Add Example</button></div>`;
    }).join('');
  }
  function bindExamples() {
    const form = q('bb-form'); if (!form || !B.v) return;
    const upd = () => { for (const kind of ['conv', 'trig']) { const c = form.querySelector(`[data-ex-count="${kind}"]`), n = exLen(B.v, kind); if (c) { c.textContent = `${n.toLocaleString()}/${EX_MAX.toLocaleString()}`; c.classList.toggle('bad', n > EX_MAX); } } };
    form.querySelectorAll('.bb-ex-in').forEach(el => { el.addEventListener('input', () => { const [kind, i, f] = el.dataset.ex.split('.'); B.v.examples = exOf(B.v); (B.v.examples[kind][+i] = B.v.examples[kind][+i] || {})[f] = el.value; grow(el); upd(); refresh(); save(); }); grow(el); });
    form.querySelectorAll('[data-ex-add]').forEach(b => b.onclick = () => { const kind = b.dataset.exAdd; B.v.examples = exOf(B.v); B.v.examples[kind].push({}); save(); rebuildKeep(); openSec('examples'); const last = [...document.querySelectorAll(`[data-ex-kind="${kind}"] .bb-ex-in`)].pop(); if (last) last.focus(); });
    form.querySelectorAll('[data-ex-del]').forEach(b => b.onclick = () => { const [kind, i] = b.dataset.exDel.split('.'); B.v.examples = exOf(B.v); B.v.examples[kind].splice(+i, 1); save(); rebuildKeep(); openSec('examples'); });
  }
  function paragraphs(v) { return v.greet.map(p => v.autoFormat ? autoFormat(p || '') : (p || '').trim()); }
  function tagList(spec, v) {
    if (spec.tags.freeform) { const all = [...new Set(String(v.tagsText || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean))]; return spec.tags.total ? all.slice(0, spec.tags.total) : all; }      // a template with no tag list of its own: your tags, typed
    const m = [...spec.tags.mandatory];
    if (v.archetype) m.push(v.archetype === 'Mafia' ? 'Mafia/Gang' : v.archetype);                       // the one archetype is always one of the tags
    if (spec.tags.wifeRule && v.wife) m.push('Wife');
    const all = [...new Set([...m, ...(v.tags || [])])];
    return spec.tags.total ? all.slice(0, Math.max(spec.tags.total, m.length)) : all;   // mandatory tags and the archetype first, then the rest up to the template's total
  }

  function compose(spec, v) {
    if (spec.rules && spec.rules.hasName2) settleName2(spec, v);
    const sec = {};
    const miss = {personality: [], scenario: []};
    const h = spec.header.map(x => {
      const val = x.key === 'scene' ? v.header.scene : x.key === 'name' ? v.names[1] : v.header.age;
      return x.nextLine ? `${x.label}:\n${val}` : `${x.label}: ${val}`;
    });
    sec.header = {body: h.join(spec.header.some(x => x.nextLine) ? '\n\n' : '\n'), bare: true};
    sec.introduction = {body: v.intro.trim()};
    sec.personality = {body: renderLines(spec.personality.lines, v, miss.personality)};
    sec.scenario = {body: renderLines(spec.scenario.lines, v, miss.scenario)};
    const ps = paragraphs(v);
    const lead = '';
    sec.greeting = {body: lead + (spec.greeting.free ? ps.filter(p => p).join('\n\n') : ps.map((p, i) => `${p}\n\n![](image${i + 1})`).join(spec.greeting.separator ? '\n\n---\n\n' : '\n\n')), prose: ps.join('\n\n'), lead};
    sec.image = spec.image.freeform ? {body: '', title: 'Image Generation'} : {body: [`Appearance:\n${[spec.image.quality, v.img.appearance.trim()].filter(Boolean).join(', ')}`,
      `Clothing and Accessories:\n${v.img.clothing.trim()}`, `Action & Background:\n${v.img.action.trim()}`,
      `Negative Prompt:\n${spec.image.negative}`].join('\n\n'), title: 'Image Generation'};
    sec.tags = {body: tagList(spec, v).join('\n')};
    sec.examples = {body: exampleText(v), title: 'Interaction Examples'};
    sec.scene = spec.scene.freeform ? {body: ''} : {body: v.scenes.map((s, i) => `Scene ${i + 1}: ${s.name.trim()}\nShot Angle: ${s.shot.trim()}\nSetting: ${s.setting.trim()}\nAction: ${s.action.trim()}`).join('\n\n')};
    for (const k of Object.keys(v.over || {})) if (sec[k] && typeof v.over[k] === 'string') { if (/\[START INSTRUCTIONS/.test(v.over[k])) v.over[k] = v.over[k].replace(/[ \t]*\[START INSTRUCTIONS[^\]]*\][\s\S]*?\[END INSTRUCTIONS[^\]]*\][ \t]*\r?\n?/g, '').replace(/^[ \t]*\[(?:START|END) INSTRUCTIONS[^\]]*\][ \t]*\r?\n?/gm, '').replace(/\n{3,}/g, '\n\n').trim();   /* the template's writer-only regions are never part of the bot */
      if (k === 'personality' || k === 'scenario') v.over[k] = v.over[k].replace(/^\s*(?:Personality|Scenario)\s*:[ \t]*(?:\r?\n|$)\s*/i, '');   /* the copy adds the section's own heading: a finished block that starts with it must not carry a second one */
      sec[k].body = v.names && v.names[2] && /personality|scenario/.test(k) ? v.over[k].replace(/\[Name ?2\]/g, v.names[2]) : v.over[k]; sec[k].overridden = true; if (k === 'greeting') sec[k].prose = v.over[k].replace(/^[ \t]*!\[[^\]]*\]\([^)\s]*\)[ \t]*$/gm, '').replace(/^---$/gm, '').replace(/^\*\*\*$/gm, '').replace(/^[ \t]*\*\u3164\*[ \t]*$/gm, ''); }
    if (spec.rules && spec.rules.hasName2 && v.names[2]) for (const k of ['personality', 'scenario']) if (sec[k]) sec[k].body = sec[k].body.replace(N2_RE, v.names[2]);
    if (window.Dialogue?.personalityText) sec.personality.body = window.Dialogue.personalityText(sec.personality.body);
    const full = spec.order.filter(k => sec[k] && !(!sec[k].body && (k === 'examples' || (spec[k] && spec[k].freeform)))).map(k => sec[k].bare ? sec[k].body : k === 'examples' ? `Interaction Examples:\n${sec[k].body}` : `${sec[k].title || SEC_TITLE[k]}:\n${sec[k].body}`).join('\n\n') + '\n';
    return {sec, full, miss};
  }

  // Shorten the template's own rule text (not your fields) until it fits:
  // repeated sentences go first, then each rule keeps at least its first sentence.
  // The protected User Agency rules and anything containing your text are never touched.
  // ------------------------------------------------------------------ checks
  const len = s => (s || '').length;
  // copy one section's finished text. The Introduction is copied as the finished HTML when a saved Introduction style (or your edited HTML) is applied
  // the finished bot as a .json file JuicyChat can import. v1.3.2: JuicyChat's upload only accepts the Pygmalion / Text generation layout (a TavernAI file and a
  // TavernAI character card v2 were refused with "Unknown JSON Format Error" when tested), so the file has exactly its five fields and nothing else:
  //   char_name = the bot's name (Scene name), char_persona = Personality, world_scenario = Scenario, char_greeting = Greeting, example_dialogue = Interaction Examples.
  // The layout has no place for the Introduction or the Tags: those are pasted in JuicyChat as before (the .txt keeps the whole bot).
  function botJson() {
    const spec = B.spec, v = B.v, c = compose(spec, v), S = c.sec, has = k => spec.order.includes(k);
    const name1 = (v.names && v.names[1]) || '', scene = has('header') ? (v.header.scene || '') : '';
    const conv = exFilled(v, 'conv').map(r => ({user: String(r.user || '').trim(), character: String(r.char || '').trim()})), trig = exFilled(v, 'trig').map(r => ({trigger: String(r.trigger || '').trim(), response: String(r.response || '').trim()}));
    const ex = [...conv.map(x => `<START>\n{{user}}: ${x.user}\n{{char}}: ${x.character}`), ...trig.map(x => `<START>\n{{user}}: ${x.trigger}\n{{char}}: ${x.response}`)].join('\n');
    return JSON.stringify({
      char_name: scene || name1 || 'Bot',
      char_persona: has('personality') ? S.personality.body : '',
      world_scenario: has('scenario') && !spec.scenario.absent ? S.scenario.body : '',
      char_greeting: has('greeting') ? S.greeting.body : '',
      example_dialogue: ex
    }, null, 2);
  }
  // a .json bot opened again: this layout, a TavernAI card, or the older .json layout this app saved before v1.3.2
  function parseJsonBot(raw) {
    let o; try { o = JSON.parse(raw); } catch { return null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const str = x => typeof x === 'string' ? x : '';
    let out, pre = '';
    if (typeof o.char_persona === 'string' || typeof o.char_greeting === 'string') {
      out = {introduction: '', personality: str(o.char_persona), scenario: str(o.world_scenario), greeting: str(o.char_greeting), image: '', tags: '', scene: ''};
      if (o.char_name) pre = `Scene Name: ${str(o.char_name)}`;
    } else if (o.format && /bot builder export/i.test(o.format)) {
      const sb = Array.isArray(o.sceneBreakdown) ? o.sceneBreakdown.map((x, i) => `Scene ${i + 1}: ${x.name || ''}\nShot Angle: ${x.shotAngle || ''}\nSetting: ${x.setting || ''}\nAction: ${x.action || ''}`).join('\n\n') : str(o.sceneBreakdown);
      out = {introduction: str(o.introduction), personality: str(o.personality), scenario: str(o.scenario), greeting: str(o.greeting), image: str(o.imageGeneration), tags: (Array.isArray(o.tags) ? o.tags : []).join(', '), scene: sb};
      pre = [o.name && `Name: ${str(o.name)}`, o.age && `Age: ${str(o.age)}`, o.sceneName && `Scene Name: ${str(o.sceneName)}`].filter(Boolean).join('\n');
    } else {
      const d = o.data && typeof o.data === 'object' ? o.data : o;
      out = {introduction: str(d.creator_notes) || str(o.creatorcomment), personality: str(d.description) || str(d.personality), scenario: str(d.scenario), greeting: str(d.first_mes), image: '', tags: (Array.isArray(d.tags) ? d.tags : []).join(', '), scene: ''};
      if (d.name) pre = `Scene Name: ${str(d.name)}`;
    }
    const found = ['introduction', 'personality', 'scenario', 'greeting', 'image', 'tags', 'scene'].filter(k => out[k].trim()).length;
    return found ? {found, preamble: pre, ...out} : null;
  }
  async function copySection(key) {
    if (!B.spec || !B.v) return false;
    const sec = compose(B.spec, B.v).sec[key]; if (!sec) return false;
    let out = sec.body, asHtml = false;
    if (key === 'introduction' && window.LivePreview && window.LivePreview.finalHtml) { try { const h = window.LivePreview.finalHtml(introPayload(compose(B.spec, B.v))); if (h) { out = h; asHtml = true; } } catch {} }
    if(key==='introduction'&&out.length>INTRO_MAX){toast(`Introduction is ${out.length.toLocaleString()} characters including HTML. JuicyChat allows ${INTRO_MAX.toLocaleString()}.`,true);return false;}
    await window.copyText(out);
    toast(asHtml ? 'Introduction copied as HTML code.' : `${SEC_TITLE[key] || 'Section'} copied.`);
    return true;
  }
  // "View as text / View as HTML" above the Introduction box. HTML view shows the finished HTML (the preview's code) and you can edit it, for example to change the series number.
  // What you change there is kept with this bot as its Introduction HTML: Copy Introduction copies it and the Live preview shows it. The Introduction text itself (its limit and the full-bot copy) is not touched.
  function syncIvw(fill) {
    const bar = document.querySelector('#bb-form [data-ivw-bar]'); if (!bar) return;
    const ownHtml = htmlIntro(B.v.intro);                                    // the Introduction box already holds HTML: nothing to switch
    bar.hidden = ownHtml; if (ownHtml) B.ivw = 'text';
    const mode = B.ivw === 'html' ? 'html' : 'text', tx = document.querySelector('#bb-form [data-ivw-text]'), hx = document.querySelector('#bb-form [data-ivw-html]'), ta = document.querySelector('#bb-form [data-ihtml]');
    if (!tx || !hx || !ta) return;
    bar.querySelectorAll('[data-ivw]').forEach(b => { const on = b.dataset.ivw === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    tx.hidden = mode === 'html'; hx.hidden = mode !== 'html';
    { let fz = tx.querySelector('[data-ivw-frozen]');            // HTML you edited by hand freezes the preview and Copy: say so where the text is, with a way back
      if (!fz) { fz = document.createElement('div'); fz.className = 'bb-ivw-frozen'; fz.setAttribute('data-ivw-frozen', ''); fz.setAttribute('role', 'note'); fz.innerHTML = '<span><b>The preview and Copy Introduction show HTML you edited by hand,</b> so they do not follow this text (the series number included). Press <b>Rebuild from the text</b> (next to View as HTML) to go back to automatic.</span>'; tx.insertBefore(fz, tx.firstChild); }
      fz.hidden = !B.v.introHtml || ownHtml; const rb0 = bar.parentNode.querySelector('[data-ivw-rebuild]'); if (rb0) rb0.hidden = !B.v.introHtml || ownHtml; }
    if (mode !== 'html') return;
    const note = hx.querySelector('[data-ihtml-note]'), edited = !!B.v.introHtml;
    if (note) note.textContent = edited ? 'You edited this HTML. It no longer follows the Introduction text. Copy Introduction copies it as written. Press "Rebuild from the text" to start again from the text.' : 'This is the finished Introduction as HTML code, as the preview shows it. The series number follows the tag in the Introduction text by itself. If you change anything here, your change is kept and Copy Introduction copies it, but the preview then stops following the text until you press Rebuild from the text.';
    hx.querySelector('[data-ihtml-reset]').style.display = edited ? '' : 'none';
    if ((fill || !edited) && document.activeElement !== ta) {
      let base = ''; try { base = window.LivePreview && window.LivePreview.baseHtml ? window.LivePreview.baseHtml(Object.assign(introPayload(compose(B.spec, B.v)), {html: ''})) : ''; } catch {}
      const val = B.v.introHtml || base; if (ta.value !== val) { ta.value = val; try { grow(ta); } catch {} }
    }
  }
  function wireIvw() {
    const f = document.getElementById('bb-form'); if (!f) return;
    f.querySelectorAll('[data-ivw]').forEach(b => b.onclick = () => { B.ivw = b.dataset.ivw; syncIvw(true); });
    const ta = f.querySelector('[data-ihtml]'); if (!ta) return;
    let tm = null;
    ta.oninput = () => { try { grow(ta); } catch {} B.v.introHtml = ta.value.trim() ? ta.value : ''; clearTimeout(tm); tm = setTimeout(() => { try { window.LivePreview && window.LivePreview.update('introduction', introPayload(compose(B.spec, B.v))); syncIvw(false); save(); } catch {} }, 250); };
    const rs = f.querySelector('[data-ihtml-reset]'); if (rs) rs.onclick = () => { delete B.v.introHtml; syncIvw(true); try { window.LivePreview && window.LivePreview.update('introduction', introPayload(compose(B.spec, B.v))); save(); } catch {} };
    const rb = f.querySelector('[data-ivw-rebuild]'); if (rb) rb.onclick = () => { delete B.v.introHtml; syncIvw(true); try { window.LivePreview && window.LivePreview.update('introduction', introPayload(compose(B.spec, B.v))); save(); } catch {} };
    syncIvw(true);
  }
  // what the Live preview needs to draw (and Copy Introduction needs to build) the styled Introduction
  const introPayload = c => ({variant: '', tag: '', text: c.sec.introduction.body, name: B.v.names && B.v.names[1], scene: B.v.header && B.v.header.scene, series: '', html: B.v.introHtml || ''});
  const htmlIntro = t => !!(window.LivePreview && window.LivePreview.hasHtml && window.LivePreview.hasHtml(t));   // the Introduction is the user's own HTML: nothing is added in front of it or changed in it
  const introVis = t => (window.LivePreview && window.LivePreview.visibleText) ? window.LivePreview.visibleText(t) : (t || '');   // HTML in the Introduction box: only the words you can read count
  // every character limit has a 10% allowance each way: inside it the section passes
  const LIMIT_TOL = 0.10;
  const INTRO_MAX = 15000;          // v1.3.0: JuicyChat's Introduction limit, HTML included. A range in the template is the writer's aim, not a limit.
  const withTol = L => L && ({min: Math.floor(L.min * (1 - LIMIT_TOL)), max: Math.ceil(L.max * (1 + LIMIT_TOL))});
  function range(out, label, n, lim) {
    if (!lim) return;
    const W = withTol(lim);
    if (n < W.min) out.push(['bad', `${label} is ${n.toLocaleString()} characters. Needs ${lim.min.toLocaleString()}–${lim.max.toLocaleString()} (${(lim.min - n).toLocaleString()} short; ${LIMIT_TOL * 100}% allowance = ${W.min.toLocaleString()}–${W.max.toLocaleString()}).`]);
    else if (n > W.max) out.push(['bad', `${label} is ${n.toLocaleString()} characters. Needs ${lim.min.toLocaleString()}–${lim.max.toLocaleString()} (${(n - lim.max).toLocaleString()} over; ${LIMIT_TOL * 100}% allowance = ${W.min.toLocaleString()}–${W.max.toLocaleString()}).`]);
    else if (n < lim.min || n > lim.max) out.push(['ok', `${label}: ${n.toLocaleString()} characters, inside the ${LIMIT_TOL * 100}% allowance around ${lim.min.toLocaleString()}–${lim.max.toLocaleString()}.`]);
    else out.push(['ok', `${label}: ${n.toLocaleString()} characters (limit ${lim.min.toLocaleString()}–${lim.max.toLocaleString()}).`]);
  }
  // v1.3.0: the app's own house rules (no day or month names, no street names) apply in the owner's edition; everywhere else only when the template asks for them
  const ownerRules = () => !((typeof IS_SHARE !== 'undefined' && IS_SHARE) || window.CREATOR_TOOL);
  function common(out, t, spec) {
    { const cal = (ownerRules() || (spec && spec.rules && spec.rules.noCalendar)) && window.CalendarNames && window.CalendarNames.problem(t); if (cal) out.push(['bad', `This text ${cal}`]); }
    { const plc = (ownerRules() || (spec && spec.rules && spec.rules.noPlaces)) && window.PlaceNames && window.PlaceNames.problem(t); if (plc) out.push(['bad', `This text ${plc}`]); }
    if (/high[\s-]?school|\bchildhood\b|\bminor\b|\bteen(ager|age)?\b|\b1[0-7][\s-]?years?[\s-]?old\b/i.test(t)) out.push(['bad', 'Mentions a school, childhood, minor or under-18 age. The templates forbid this.']);
  }
  function check(spec, v, c) {
    const R = spec.rules, S = c.sec, res = {};
    // basics
    let o = res.header = [];
    const hasHead = k => spec.header.some(x => x.key === k);      // the Basics the template asks for
    if (hasHead('scene') && !String(v.header.scene || '').trim()) o.push(['bad', 'Scene name is empty.']);
    if (!v.names[1].trim() && (spec.header.some(x => x.key === 'name') || R.usesName)) o.push(['bad', 'Character name is empty.']);
    const age = parseInt(v.header.age, 10), minAge = R.minAge || 18;
    if (hasHead('age')) { if (!v.header.age.trim()) o.push(['bad', 'Age is empty.']); else if (!(age >= minAge)) o.push(['bad', `Age must be ${minAge} or older.`]); }
    else if (v.header.age.trim() && !(age >= minAge)) o.push(['bad', `Age must be ${minAge} or older.`]);
    if (R.hasName2 && !v.names[2].trim()) o.push(['bad', 'Name 2 is empty.']);
    if (v.include3 && !v.names[3].trim()) o.push(['bad', 'Name 3 is switched on but empty.']);
    // introduction
    o = res.introduction = []; const it = introVis(S.introduction.body);
    { const n = Math.max(len(it), len(S.introduction.body));     // the limit counts everything pasted into JuicyChat, HTML included
      if (n > INTRO_MAX) o.push(['bad', `Introduction is ${n.toLocaleString()} characters. The limit is ${INTRO_MAX.toLocaleString()} (${(n - INTRO_MAX).toLocaleString()} over).`]);
      else o.push(['ok', `Introduction: ${n.toLocaleString()} of ${INTRO_MAX.toLocaleString()} characters.`]); }
    if (window.TemplateContract) for (const issue of window.TemplateContract.introductionIssues(spec, it)) o.push(['bad', issue]);
    const requiredPrefix = spec.introduction.prefix;
    if (requiredPrefix && !htmlIntro(S.introduction.body) && !it.startsWith(requiredPrefix)) o.push(['bad', `Must start with ${requiredPrefix}`]);
    if (R.introEnding && it && (!/[.!?]["”’)\]*]*$/.test(it) || /(\.\.\.|…)["”’)\]*]*$/.test(it))) o.push(['bad', 'Must end with a finished sentence (period, ? or !), not "..." or a cut-off line.']);
    if (R.secondPerson && it && !/\byou(r|rs|rself)?\b/i.test(it)) o.push(['bad', 'Must be in second person (you/your).']);
    if (R.noAdultWord && /\badults?\b|21\+/i.test(it)) o.push(['bad', 'Remove "adult" / "21+". The Introduction must not include age reassurance.']);
    common(o, it, spec);
    // personality & scenario
    for (const k of ['personality', 'scenario']) {
      o = res[k] = [];
      range(o, SEC_TITLE[k], len(S[k].body), spec[k].limit);
      const left = S[k].overridden ? (S[k].body.match(/\[[a-z][^\]\n]*\]/g) || []).length : c.miss[k].length;
      if (left) o.push(['bad', `${left} field${left > 1 ? 's' : ''} still empty${S[k].overridden ? '' : `: ${c.miss[k].slice(0, 4).join(', ')}${left > 4 ? '…' : ''}`}.`]);
      else o.push(['ok', 'All fields filled.']);
      if (/\[Name[123]?\]/.test(S[k].body)) o.push(['bad', 'A character name is missing (fill the names at the top).']);
      const mine = S[k].overridden ? S[k].body : spec[k].lines.flatMap(l => l.segs).filter(x => x.t === 'ph').map(x => v.f[x.key] || '').join('\n');
      if (R.relationshipSpecific && /\b(spouse|significant other|lover)\b|\bpartner\b(?!\/)/i.test(mine.replace(/Spouse\/Partner/g, ''))) o.push(['warn', 'Say "wife" or "girlfriend" instead of partner/spouse/lover.']);
      common(o, mine, spec);
    }
    if (/Never narrate or decide \{\{user\}\}’s dialogue/.test(spec.scenario.lines.map(l => l.segs.map(s => s.v || '').join('')).join('\n')) &&
        !/Never narrate or decide \{\{user\}\}’s dialogue, thoughts, feelings, reactions, consent, interpretations, or voluntary actions\./.test(S.scenario.body))
      res.scenario.push(['bad', 'The protected User Agency rule was changed. It must stay word-for-word.']);
    // greeting
    o = res.greeting = []; const g = spec.greeting, ps = S.greeting.overridden ? null : paragraphs(v), prose = S.greeting.prose;
    range(o, 'Greeting (without image markers)', len(prose), g.limit);
    if (window.TemplateContract?.greetingIssues) for (const issue of window.TemplateContract.greetingIssues(spec, v)) o.push(['bad', issue]);
    if (window.TemplateContract?.greetingNotes) for (const note of window.TemplateContract.greetingNotes(spec, v)) o.push(['warn', note]);

    if (ps && !g.free) {
      const empty = ps.filter(p => !p).length;
      if (empty) o.push(['bad', `${empty} of ${g.count} paragraphs are empty.`]);

    }
    const markers = (S.greeting.body.match(/^[ \t]*!\[[^\]]*\]\([^)\s]*\)[ \t]*$/gm) || []).length;
    if (!g.free) o.push([markers === g.count ? 'ok' : 'bad', `${markers} image markers (needs exactly ${g.count}).`]);
    else if (!prose.trim()) o.push(['bad', 'The Greeting is empty.']);
    if (g.banColonSemi && /[:;]/.test(prose)) o.push(['bad', 'Contains a colon (:) or semicolon (;). The Greeting bans both.']);
    if (g.banEmDash && /—/.test(prose)) o.push(['bad', 'Contains an em dash (—). Use a comma or period.']);
    { const narr = prose.replace(/"[^"\n]*"|“[^”\n]*”/g, '');          // narration only: the one line of dialogue may say {{user}}
      if (g.banUserToken && /\{\{user\}\}/.test(narr)) o.push(['bad', 'The narration uses {{user}}. Write "you" in the Greeting\'s narration instead.']); }
    // Dialogue slots and formatting are checked against the selected template
    // by TemplateContract above. Do not add generic dialogue requirements here.
    if (R.cannedBanter && /you owe me|that'?ll cost you|put it on (?:your|my) tab|charging you|consider that payment/i.test(prose)) o.push(['bad', 'Uses "you owe me / that\'ll cost you" style banter, which the template bans.']);
    const lastP = ps ? ps[ps.length - 1] : prose.split('\n\n').pop();
    if (R.imDone && /\bI(?:'m| am) done \w+ing\b/i.test(lastP || '')) o.push(['bad', 'The final hook uses "I\'m done [doing]". The template bans that line shape.']);
    if (/never[^\n]*what do you do|do not[^\n]*what do you do/i.test(spec.greeting.raw || '') && /what do you do\??/i.test(lastP || '')) o.push(['bad', 'The final hook ends on "what do you do". Use a live action or line instead.']);
    if (R.noAdultWord && /\badults?\b|21\+/i.test(prose)) o.push(['bad', 'Remove "adult" / "21+" from the Greeting.']);
    common(o, prose, spec);
    // image
    o = res.image = [];
    if (spec.image.freeform && String((v.over && v.over.image) || '').trim()) o.push(['ok', 'Written.']);
    else if (!spec.image.freeform) o.push(['ok', 'Image Generation follows your own template; the tool adds no rules of its own.']);
    // tags
    o = res.tags = []; const tl = tagList(spec, v), T = spec.tags;
    if (T.freeform) { if (T.total && tl.length !== T.total) o.push(['bad', `${tl.length} of ${T.total} tags.`]); else o.push(['ok', `${tl.length} tag${tl.length === 1 ? '' : 's'}.`]); const miss = T.mandatory.filter(m => !tl.includes(m)); if (miss.length) o.push(['bad', `Missing the required tag${miss.length > 1 ? 's' : ''}: ${miss.join(', ')}.`]); }
    else o.push([tl.length === T.total ? 'ok' : 'bad', `${tl.length} of ${T.total} tags.`]);
    if (!T.freeform && T.archetypeRequired && !v.archetype) o.push(['bad', `Pick the personality archetype (a required tag): ${T.archetypes.join(', ')}.`]);
    const unknown = T.freeform ? [] : tl.filter(t => !T.mandatory.includes(t) && !T.approved.includes(t) && t !== 'Wife');
    if (unknown.length) o.push(['bad', `Not on the approved list: ${unknown.join(', ')}`]);
    // scene breakdown
    o = res.scene = [];
    const sc = spec.scene.freeform ? [] : v.scenes; if (spec.scene.freeform) { if (String((v.over && v.over.scene) || '').trim()) o.push(['ok', 'Written.']); } else if (!g.free && sc.length !== g.count) o.push(['bad', `${sc.length} scenes but ${g.count} image markers.`]);
    sc.forEach((s, i) => {
      const gaps = ['name', 'setting', 'action'].filter(k => !s[k].trim());
      if (gaps.length) o.push(['bad', `Scene ${i + 1}: ${gaps.join(', ')} empty.`]);
      if (spec.scene.shotPrefix && !s.shot.startsWith(spec.scene.shotPrefix.trim())) o.push(['bad', `Scene ${i + 1}: Shot Angle must start with "${spec.scene.shotPrefix.trim()}".`]);
      if (spec.scene.noPOV && /\bPOV\b/i.test(s.shot)) o.push(['bad', `Scene ${i + 1}: this template bans POV labels. Use camera-facing shots.`]);
      if (/_/.test(`${s.shot}${s.setting}${s.action}`)) o.push(['bad', `Scene ${i + 1}: remove underscores.`]);
    });
    if (!o.length && !spec.scene.freeform) o.push(['ok', g.free ? `${sc.length} scene${sc.length === 1 ? '' : 's'}.` : `${sc.length} scenes match the ${g.count} image markers.`]);
    res.examples = exampleIssues(v);
    // overall total
    if (R.total) { const n = len(S.personality.body) + len(S.scenario.body) + len(prose); res.total = [];
      const TW = withTol(R.total), low = n < TW.min, high = n > TW.max, soft = (low && R.total.softMin) || (high && R.total.softMax);
      if ((low || high) && soft) res.total.push(['warn', `Personality + Scenario + Greeting is ${n.toLocaleString()} characters. Your template asks for approximately ${R.total.min.toLocaleString()}–${R.total.max.toLocaleString()} (${low ? `${(R.total.min - n).toLocaleString()} short` : `${(n - R.total.max).toLocaleString()} over`}); every section is inside its own limit.`]);
      else range(res.total, 'Personality + Scenario + Greeting', n, R.total); }
    // everyone in a story is 18 or older: flag any child, teenager or school setting anywhere in the bot
    { const M = (typeof window !== 'undefined' && window.Minors) || null;
      if (M) { const parts = [['introduction', 'Introduction', S.introduction.body], ['personality', 'Personality', S.personality && S.personality.body], ['scenario', 'Scenario', S.scenario && S.scenario.body], ['greeting', 'Greeting', S.greeting && S.greeting.prose], ['scene', 'Scene breakdown', (v.scenes || []).map(x => `${x.name} ${x.setting} ${x.action}`).join(' ')]];
        for (const [sec, label, text] of parts) { const hits = text ? M.find(text) : []; if (hits.length) (res[sec] = res[sec] || []).unshift(['bad', `${label} ${M.problem(hits)}`]); } } }
    return res;
  }

  // -------------------------------------------------------------------- UI
  const fieldTag = (k, val, hint, short, rows) => short
    ? `<input class="bb-in" data-k="${e(k)}" value="${e(val)}" placeholder="${e(hint)}">`
    : `<textarea class="bb-in" data-k="${e(k)}" rows="${rows || 2}" placeholder="${e(hint)}">${e(val)}</textarea>`;
  const SHORT = /^(full name|goes by|age|race|gender|pronouns|sexuality|love language|name)$/i;
  function fieldsHtml(spec, v, sec) {
    let html = '', grp = null, blk = null;
    for (const l of spec[sec].lines) for (const s of l.segs) {
      if (s.t !== 'ph') continue;
      if (l.opt3 && !v.include3) continue;
      if (s.group !== grp) { grp = s.group; if (grp) html += `<h5 class="bb-group">${e(grp.replace('Character ', 'Character ') )}: ${e(v.names[grp.slice(-1)] || '')}</h5>`; }
      if (s.block !== blk) { blk = s.block; if (blk && !SHORT.test(s.label)) html += `<div class="bb-block">${e(blk)}</div>`; }
      const short = SHORT.test(s.label) || s.hint.length < 28;
      html += `<label class="bb-field"><span>${e(s.label)}</span>${fieldTag('f.' + s.key, v.f[s.key] || '', s.hint, short, s.hint.length > 120 ? 3 : 2)}</label>`;
    }
    return html || '<p class="bb-note">This section is fixed text from the template. Only the character names change.</p>';
  }
  // the Greeting markdown box: picture links and the bold-italic line get a colour behind the text
  function mdHighlight(t) {
    return String(t || '').split('\n').map(l => { const x = e(l);
      return /^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(l) ? `<span class="md-img">${x}</span>` : /^\s*\*\*\*.*\*\*\*\s*$/.test(l) ? `<span class="md-hdr">${x}</span>` : x; }).join('\n');
  }
  function subLine(key) {
    const lim = key === 'greeting' ? B.spec.greeting.limit : null;
    return `${key === 'introduction' ? `Up to ${INTRO_MAX.toLocaleString()} characters, HTML included. ` : lim ? `${lim.min.toLocaleString()} to ${lim.max.toLocaleString()} characters. ` : ''}${key === 'greeting' ? 'Markdown on the left, how it will look in chat on the right.' : 'Text on the left, how it will look in chat on the right.'} Auto-saved.`;
  }
  function rebuildKeep() {
    const open = new Set([...document.querySelectorAll('#bb-form .bb-sec[open]')].map(d => d.dataset.sec)), sc = document.querySelector('.jcct-main'), y = sc ? sc.scrollTop : window.scrollY;
    build(); document.querySelectorAll('#bb-form .bb-sec').forEach(d => { d.open = open.has(d.dataset.sec); }); if (sc) sc.scrollTop = y; else window.scrollTo(0, y);
  }
  // put a link into marker i (url '' puts ![](imageN) back). With an edited Greeting text the marker line itself is changed; with the passages the link is kept beside them.
  function secShell(key, inner) {
    const ov = B.v.over && typeof B.v.over[key] === 'string';
    const editing = !!B.editingOver?.[key];
    const fieldKey = key === 'personality' || key === 'scenario';
    const directView = fieldKey && !editing && (ov || !(B.fieldView && B.fieldView[key]));       // Personality and Scenario open as the whole finished text, editable right there; the fields are one click away
    const directText = directView ? String(compose(B.spec, B.v).sec[key].body) : '';       // exactly what Copy gives, the Name 2 fill included
    const mdMode = key === 'greeting' && !editing && !B.passMode;                   // the Greeting is one markdown text, like the mock-up; the passage boxes are one click away
    const mdText = mdMode ? (ov ? String(B.v.over[key] || '') : compose(B.spec, B.v).sec.greeting.body) : '';
    const mdEditor = `<div class="bb-md"><pre class="bb-md-hl" aria-hidden="true"></pre><textarea class="bb-in bb-md-in" data-k="over.greeting" spellcheck="false" aria-label="Greeting markdown" placeholder="Write the Greeting here. A picture goes on its own line: ![](image1)">${e(mdText)}</textarea></div>`;
    const passBtn = key !== 'greeting' ? '' : mdMode ? '' : !editing ? `<div class="bb-sec-actions"><button type="button" class="ghost bb-mdmode">Back to one markdown text</button></div>` : '';
    return `<details class="bb-sec" data-sec="${key}" ${key === 'header' || key === 'introduction' ? 'open' : ''}>
      <summary><span class="bb-sec-title">${SEC_TITLE[key]}</span><span class="bb-count" data-count="${key}"></span><span class="bb-state" data-state="${key}"></span><span class="bb-top-btns">${key === 'introduction' ? `<button type="button" class="primary bb-intro-design">✦ Build Introduction</button>` : ''}${key !== 'header' ? `<button class="copy-btn bb-copy-sec bb-copy-top" data-sec="${key}" title="Copy the ${SEC_TITLE[key]} section">Copy ${SEC_TITLE[key]}</button>` : ''}</span></summary>
      <p class="bb-sec-sub">${key === 'greeting' || key === 'introduction' ? subLine(key) : `${key === 'personality' || key === 'scenario' ? 'The whole text on the left (or the fields, one click away), how it reads in chat on the right.' : 'Fields on the left, how it will read in the bot on the right.'} Auto-saved.`}</p>
      <div class="bb-sec-body bb-has-live${key === 'introduction' || key === 'greeting' ? '' : ' bb-fieldsec'}">
        ${key === 'greeting' ? `<div class="bb-strip" data-strip="greeting"></div>` : ''}
        <div class="bb-live" data-live="${key}"></div>
        <div class="bb-edpane"><div class="bb-pane-h"><b>${key === 'greeting' ? (mdMode ? 'Greeting markdown' : 'Greeting passages') : key === 'introduction' ? 'Introduction text' : (key === 'personality' || key === 'scenario') ? (directView ? SEC_TITLE[key] + ' text' : SEC_TITLE[key] + ' fields') : SEC_TITLE[key]}</b><span data-pane-count="${key}"></span></div>
        ${directView ? `<p class="bb-note">The whole ${SEC_TITLE[key]} is here, exactly as it goes into the bot. Edit anything in it, including the fixed rules.</p><textarea class="bb-in bb-over bb-direct" data-k="over.${key}" rows="18" spellcheck="false">${e(directText)}</textarea><div class="bb-sec-actions">${/<(input|select|textarea)\b/.test(String(inner || '')) ? `<button type="button" class="ghost bb-showfields" data-sec="${key}">Edit the fields instead</button>` : ''}</div>` : editing ? `<p class="bb-note">You're editing the final text directly.</p><textarea class="bb-in bb-over" data-k="over.${key}" rows="16">${e(((B.v.names && B.v.names[2] && /personality|scenario/.test(key)) ? String(B.v.over[key] || '').replace(/\[Name ?2\]/g, B.v.names[2]) : B.v.over[key]) || '')}</textarea><div class="bb-sec-actions"><button type="button" class="ghost bb-unover" data-sec="${key}">Back to fields</button><button type="button" class="primary bb-save-over" data-sec="${key}">Save edits</button></div>` : mdMode ? mdEditor : inner}
        ${passBtn}
        ${fieldKey && !editing && !directView ? `<div class="bb-sec-actions"><button type="button" class="ghost bb-hidefields" data-sec="${key}">Show the whole ${SEC_TITLE[key]} text</button></div>` : ''}
        ${key === 'greeting' ? '' : `<ul class="bb-checks" data-checks="${key}"></ul>`}
        ${key === 'tags' ? '' : `<details class="bb-preview"><summary>Preview</summary><pre data-preview="${key}"></pre></details>`}
        </div>
      </div></details>`;
  }
  // ---------------------------------------------------------------- upload a fully built bot (.txt) and fill the sections
  const BOT_HEADS = [
    ['introduction', /^(introduction|intro)$/i],
    ['personality', /^(personality)$/i],
    ['scenario', /^(scenario)$/i],
    ['greeting', /^(greeting|first message|opening message)$/i],
    ['image', /^(image generation|image prompt|images?)$/i],
    ['tags', /^(tags)$/i],
    ['scene', /^(scene breakdown|scenes)$/i],
    ['examples', /^(interaction examples|example dialogues?|example conversations?)$/i],   // v1.3.3: read back, so Save as .json keeps them
    ['header', /^(basics|header)$/i]
  ];
  // A heading is a section name on its own line with a colon ("Scenario:") or markdown hash. Only when a file has no such
  // headings are bare names ("Scenario") accepted: a line inside a section can easily be just "Scenario".
  function botHeading(line, strict) {
    const raw = String(line || '').trim();
    if (strict && !/:\s*$/.test(raw) && !/^#{1,6}\s/.test(raw)) return '';
    const t = raw.replace(/^#{1,6}\s*/, '').replace(/:\s*$/, '').trim();
    for (const [key, re] of BOT_HEADS) if (re.test(t)) return key;
    return '';
  }
  function splitBuiltBot(raw, strict) {
    const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
    const chunks = {preamble: []}; let cur = 'preamble';
    for (const line of lines) {
      const key = botHeading(line, strict);
      if (key) { cur = key; chunks[cur] = chunks[cur] || []; continue; }
      (chunks[cur] = chunks[cur] || []).push(line);
    }
    return chunks;
  }
  function parseBuiltBot(raw) {
    if (/^\s*\{/.test(String(raw || ''))) { const j = parseJsonBot(raw); if (j) { j.examples = jsonExamples(raw); return j; } }   // v1.3.2: a .json bot
    const count = c => ['introduction', 'personality', 'scenario', 'greeting', 'image', 'tags', 'scene'].filter(k => (c[k] || []).join('').trim()).length;
    let chunks = splitBuiltBot(raw, true);
    if (count(chunks) < 2) { const loose = splitBuiltBot(raw, false); if (count(loose) > count(chunks)) chunks = loose; }
    const body = k => (chunks[k] || []).join('\n').trim();
    const found = count(chunks);
    return {found, preamble: (chunks.preamble || []).concat(chunks.header || []).join('\n').trim(), introduction: body('introduction'), personality: body('personality'), scenario: body('scenario'), greeting: body('greeting'), image: body('image'), tags: body('tags'), scene: body('scene'), examples: exampleRows(body('examples'), [fieldAfter((chunks.preamble || []).concat(chunks.header || []).join('\n'), 'Name')])};
  }
  function fieldAfter(text, label) {
    const lines = String(text || '').split('\n'), re = new RegExp('^' + label + '\\s*:\\s*(.*)$', 'i');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(re); if (!m) continue;
      if (m[1].trim()) return m[1].trim();
      return (lines[i + 1] || '').trim();
    }
    return '';
  }
  function greetingParagraphs(text, count) {
    let t = String(text || '').replace(/```[\s\S]*?```/g, '').replace(/^\s*\*\*\*\s*$/gm, '').trim();
    t = t.replace(/^Please answer the following in your first message:[\s\S]*?address you correctly\.\s*/i, '').trim();
    const parts = t.split(/\n\s*(?:---|\*\*\*)\s*\n|\n\s*!\[\]\(image\d+\)\s*/i).map(x => x.replace(/!\[\]\(image\d+\)/gi, '').trim()).filter(Boolean);
    const n = Math.max(1, count || parts.length || 1);
    const out = Array.from({length: n}, () => '');
    parts.slice(0, n - 1).forEach((p, i) => { out[i] = p; });
    if (parts.length) out[n - 1] = parts.slice(n - 1).join('\n\n').trim();
    return out;
  }
  // Read an uploaded Personality or Scenario back into the template's boxes. The template's fixed sentences are the
  // anchors: each box is the text between its sentence and the next one. Returns what it filled and whether the
  // boxes now rebuild the uploaded text exactly (when they do not, the uploaded text is kept as final text).
  function fillBoxesFromText(sec, text) {
    // the lines compose actually writes: without a third character, optional lines and lines only about that character are left out
    const lines = B.spec[sec].lines.filter(l => (!l.opt3 || B.v.include3) && (B.v.include3 || !(l.segs.some(x => x.t === 'lit' && /\u0001N3\??U?\u0002/.test(x.v)) && !l.segs.some(x => x.t === 'lit' && /\u0001N[12]\??U?\u0002/.test(x.v)))));
    const toks = []; lines.forEach((l, i) => { if (i) toks.push({t: 'lit', v: '\n'}); for (const s of l.segs) toks.push(s); });
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*\\\*|__/g, '(?:\\*\\*|__)?');   // bold markers around a name are optional: Dialogue.personalityText removes them
    // the fixed text between two boxes as a pattern: words exactly, spaces flexible, a line break needs a line break, a name is the name
    const nameRe = tok => { const m = tok.match(/N([123])/), nm = m && B.v.names && B.v.names[m[1]]; return nm ? esc(/U\u0002$/.test(tok) ? nm.toUpperCase() : nm) : '[^\\n]{1,80}?'; };
    const litPat = part => part.split(/(\s+)/).map((x, i, a) => !x ? '' : /^\s+$/.test(x) ? (i === a.length - 1 ? '[ \\t]*' : /\n/.test(x) ? '\\s*\\n\\s*' : '[ \\t]+') : esc(x)).join('');
    const reOf = str => String(str).split(/(\u0001N[123]\??U?\u0002)/).map(part => /^\u0001N/.test(part) ? nameRe(part) : litPat(part)).join('');
    // a name the file uses but the Basics lines did not give: read it from a fixed line of the template that holds only names ("{{char}} is [Name].")
    const T = String(text || '').replace(/\r\n/g, '\n');
    if (!B.v.names[1] || !B.v.names[2]) for (const L of lines) {
      if (L.segs.some(x => x.t !== 'lit')) continue;
      const str = L.segs.map(x => x.v).join(''); if (!/\u0001N[12]\u0002/.test(str) || /\u0001N3|\u0001N[12]\?|U\u0002/.test(str)) continue;
      const seen = {}; let g = 0;
      const body = str.split(/(\u0001N[12]\u0002)/).map(part => { const m = part.match(/^\u0001N([12])\u0002$/); if (!m) return litPat(part); if (seen[m[1]]) return '\\' + seen[m[1]]; seen[m[1]] = ++g; return '([^\\n]{1,60}?)'; }).join('');
      let m; try { m = new RegExp('^[ \\t]*' + body + '[ \\t]*$', 'm').exec(T); } catch { m = null; }
      if (m) for (const n of ['1', '2']) if (seen[n] && !B.v.names[n] && m[seen[n]] && m[seen[n]].trim()) B.v.names[n] = m[seen[n]].trim();
    }
    const groups = [{ph: null, lits: []}];
    for (const t of toks) { if (t.t === 'ph') groups.push({ph: t, lits: []}); else groups[groups.length - 1].lits.push(t.v); }
    // the longest run of fixed text that is found (prefix for the sentences after a box, suffix for the ones before the first box)
    const find = (lits, from, suffix) => {
      for (let n = lits.length; n >= 1; n--) {
        const sub = suffix ? lits.slice(lits.length - n) : lits.slice(0, n), str = sub.join('');
        if (!str.replace(/\s+/g, '')) continue;
        const re = new RegExp(reOf(str), 'g'); re.lastIndex = from;
        const m = re.exec(T); if (m) return {index: m.index, end: m.index + m[0].length};
      }
      return null;
    };
    let pos = 0; const vals = {};
    if (groups[0].lits.length) { const f = find(groups[0].lits, 0, true); if (f && f.index < 600) pos = f.end; }
    for (let g = 1; g < groups.length; g++) {
      const {ph, lits} = groups[g];
      if (!lits.join('').replace(/\s+/g, '')) { if (g === groups.length - 1) { vals[ph.key] = T.slice(pos).trim(); pos = T.length; } else vals[ph.key] = null; continue; }
      const f = find(lits, pos, false);
      if (!f) { vals[ph.key] = null; continue; }
      vals[ph.key] = T.slice(pos, f.index).trim(); pos = f.end;
    }
    const keys = groups.slice(1).map(g => g.ph.key);
    for (const l of B.spec[sec].lines) for (const sg of l.segs) if (sg.t === 'ph') { delete B.v.f[sg.key]; if (B.v.auto) delete B.v.auto[sg.key]; }
    let filled = 0;
    for (const k of keys) { const val = vals[k]; if (val) { B.v.f[k] = val; B.v.touched[k] = true; filled++; } }
    if (B.v.over) delete B.v.over[sec];
    const rebuilt = compose(B.spec, B.v).sec[sec].body.replace(/\s+/g, '');
    const exact = (filled > 0 || !keys.length) && rebuilt === T.replace(/\s+/g, '');
    // a text that mostly does not follow this template's sentences would only scatter pieces of itself into the boxes: leave them empty
    if (!exact && keys.length && filled < keys.length / 2) { for (const k of keys) { delete B.v.f[k]; if (B.v.touched) delete B.v.touched[k]; } return {filled: 0, total: keys.length, exact: false};}
    return {filled, total: keys.length, exact};
  }
  function applyBuiltBot(parsed) {
    const pre = parsed.preamble || '';
    const name = fieldAfter(pre, 'Name') || fieldAfter(pre, 'Character name') || fieldAfter(pre, 'Name 1');
    const age = fieldAfter(pre, 'Age');
    const scene = fieldAfter(pre, 'Scene name') || fieldAfter(pre, 'Scene Name');
    if (name) B.v.names[1] = name;
    if (age) B.v.header.age = age;
    if (scene) B.v.header.scene = scene;
    B.v.touched = B.v.touched || {};
    if (parsed.introduction) { B.v.intro = parsed.introduction; B.v.touched.intro = true; if (B.v.over) delete B.v.over.introduction; }
    B.v.over = B.v.over || {};
    const notes = [];
    for (const sec of ['personality', 'scenario']) {
      if (!parsed[sec]) continue;
      const r = fillBoxesFromText(sec, parsed[sec]), title = SEC_TITLE[sec];
      if (r.exact) continue;                                   // the boxes rebuild the uploaded text exactly: nothing is kept as final text
      B.v.over[sec] = parsed[sec]; B.v.touched['over.' + sec] = true;   // the file differs from the template somewhere: its text stays exactly as uploaded
      notes.push(!r.total ? `${title}: this template has no boxes for it, and the file's text differs from the template's, so it is kept as final text.` : r.filled ? `${title}: ${r.filled} of ${r.total} boxes filled. The file's text differs from the template in places, so it stays as final text until you click Back to fields.` : `${title}: the text doesn't follow this template's boxes, so it is loaded as final text.`);
    }
    if (parsed.greeting) {
      delete B.v.over.greeting;
      B.v.greet = greetingParagraphs(parsed.greeting, B.spec.greeting && B.spec.greeting.count);
      B.v.greet.forEach((_, i) => { B.v.touched['g' + i] = true; });
    }
    if (parsed.image && B.spec.image.freeform) { B.v.over.image = parsed.image; B.v.touched['over.image'] = true; }
    else if (parsed.image) {
      const app = fieldAfter(parsed.image, 'Appearance'), cloth = fieldAfter(parsed.image, 'Clothing and Accessories'), act = fieldAfter(parsed.image, 'Action & Background') || fieldAfter(parsed.image, 'Action and Background');
      if (app) B.v.img.appearance = app.replace(/^.*quality prompt[^,]*,\s*/i, '');
      if (cloth) B.v.img.clothing = cloth;
      if (act) B.v.img.action = act;
    }
    if (parsed.tags) {
      const want = parsed.tags.split(/\n|,/).map(x => x.trim()).filter(Boolean);
      if (B.spec.tags.freeform) B.v.tagsText = want.join(', ');
      else {
        const known = new Set([...(B.spec.tags.approved || []), ...(B.spec.tags.mandatory || []), ...(B.spec.tags.archetypes || [])]);
        B.v.tags = want.filter(t => known.has(t));
        const arch = want.find(t => (B.spec.tags.archetypes || []).includes(t));
        if (arch) B.v.archetype = arch;
      }
    }
    if (parsed.scene && B.spec.scene.freeform) { B.v.over.scene = parsed.scene; B.v.touched['over.scene'] = true; }
    else if (parsed.scene) {
      const blocks = parsed.scene.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
      blocks.forEach((block, i) => {
        if (!B.v.scenes[i]) return;
        B.v.scenes[i].name = fieldAfter(block, 'Scene ' + (i + 1)) || fieldAfter(block, 'Scene') || B.v.scenes[i].name;
        const shot = fieldAfter(block, 'Shot Angle'), setting = fieldAfter(block, 'Setting'), action = fieldAfter(block, 'Action');
        if (shot) B.v.scenes[i].shot = shot;
        if (setting) B.v.scenes[i].setting = setting;
        if (action) B.v.scenes[i].action = action;
      });
    }
    const ex = parsed.examples;   // v1.3.3: the bot's Interaction Examples come along, so they are in Copy, Save as .txt and Save as .json
    if (ex && ((ex.conv || []).length || (ex.trig || []).length)) B.v.examples = {conv: ex.conv || [], trig: ex.trig || []};
    return notes;
  }

  function build() {
    setTimeout(povUi, 0); setTimeout(renderLimits, 0);
    const spec = B.spec, v = B.v, R = spec.rules;
    const names = `<div class="bb-names">
      <label class="bb-field"><span>${R.hasName2 ? 'Name 1 (main character)' : 'Character name'}</span>${fieldTag('n.1', v.names[1], 'e.g. Luna Hart', true)}</label>
      ${R.hasName2 ? `<label class="bb-field"><span>Name 2</span>${fieldTag('n.2', v.names[2], 'second character', true)}</label>` : ''}
      ${R.hasName3 ? `<label class="bb-check"><input type="checkbox" data-k="include3" ${v.include3 ? 'checked' : ''}> Include a third character</label>${v.include3 ? `<label class="bb-field"><span>Name 3</span>${fieldTag('n.3', v.names[3], 'third character', true)}</label>` : ''}` : ''}</div>`;
    const parts = {
      introduction: `<p class="bb-note">${e(spec.introduction.hint || 'Second-person premise that ends on a cliffhanger.')}</p><div class="bb-ivw-row"><div class="bb-ivw" data-ivw-bar role="group" aria-label="Introduction view"><button type="button" data-ivw="text" aria-pressed="true">View as text</button><button type="button" data-ivw="html" aria-pressed="false">View as HTML</button></div><button type="button" class="ghost sm bb-ivw-rebuild" data-ivw-rebuild hidden title="Throw away the HTML you edited by hand and build it again from the Introduction text">Rebuild from the text</button></div><div data-ivw-text>${fieldTag('intro', v.intro, 'Introduction', false, 6)}</div><div data-ivw-html hidden><p class="bb-note" data-ihtml-note></p><textarea class="bb-ihtml" data-ihtml rows="14" spellcheck="false" aria-label="Introduction as HTML"></textarea><div class="bb-sec-actions"><button type="button" class="ghost" data-ihtml-reset>Rebuild from the text</button></div></div>`,
      personality: fieldsHtml(spec, v, 'personality'),
      scenario: fieldsHtml(spec, v, 'scenario'),
      greeting: `${spec.greeting.style === 'quoted' ? `<label class="bb-check"><input type="checkbox" data-k="autoFormat" ${v.autoFormat ? 'checked' : ''}> Auto-format: put narration in *asterisks* and each "quote" on its own line</label>` : ''}
        ${v.greet.map((p, i) => `<label class="bb-field"><span>${spec.greeting.free ? 'Greeting' : `Passage ${i + 1}`} ${spec.greeting.free ? '' : `<small>→ followed by ![](image${i + 1})</small>`}</span><small class="bb-hint">${e(spec.greeting.hints[i] || '')}</small>${fieldTag('g.' + i, p, 'Write the passage before this image marker using the selected template instructions.', false, 6)}</label>`).join('')}`,
      image: spec.image.freeform ? freeBox('image', v, "Your template's Image Generation section has its own layout, so write it here exactly the way your template asks.") : `<div class="bb-field"><span>Appearance <small>(locked quality prompt${spec.image.qualityFromSettings ? ' from Settings' : ''}, then your text)</small><button type="button" class="copy-btn bb-copy-img" data-img="appearance" title="Copy the locked quality prompt plus Appearance">⧉ Copy</button></span><div class="bb-locked"><pre class="bb-locked-text">${e(spec.image.quality)}</pre></div>${fieldTag('img.appearance', v.img.appearance, spec.image.appearanceHint, false)}</div>
        <div class="bb-field"><span>Clothing and Accessories<button type="button" class="copy-btn bb-copy-img" data-img="clothing" title="Copy Clothing and Accessories">⧉ Copy</button></span>${fieldTag('img.clothing', v.img.clothing, spec.image.clothingHint, false)}</div>
        <div class="bb-field"><span>Action & Background<button type="button" class="copy-btn bb-copy-img" data-img="action" title="Copy Action and Background">⧉ Copy</button></span>${fieldTag('img.action', v.img.action, spec.image.actionHint, false)}</div>
        <div class="bb-field"><span>Negative Prompt <small>(locked, from ${spec.image.negativeFromSettings ? 'Settings' : 'the template'})</small><button type="button" class="copy-btn bb-copy-img" data-img="negative" title="Copy the locked Negative Prompt">⧉ Copy</button></span><div class="bb-locked"><pre class="bb-locked-text">${e(spec.image.negative)}</pre></div></div>`,
      tags: tagsHtml(spec, v),
      examples: `<p class="bb-note">Optional. Short examples that show the character's voice. Conversations are a User line and the Character's reply; Triggered Interactions are a trigger and how the character responds. Each list can hold up to ${EX_MAX.toLocaleString()} characters.</p>${examplesHtml(v)}`,
      scene: spec.scene.freeform ? freeBox('scene', v, "Your template's Scene Breakdown has its own layout, so write it here exactly the way your template asks.") : v.scenes.map((s, i) => `<div class="bb-scene"><h5 class="bb-group">Scene ${i + 1} <small>matches paragraph ${i + 1}</small></h5>
        <label class="bb-field"><span>Scene name</span>${fieldTag(`sc.${i}.name`, s.name, 'Scene name', true)}</label>
        <label class="bb-field"><span>Shot Angle</span>${fieldTag(`sc.${i}.shot`, s.shot, spec.scene.noPOV ? 'close-up shot, eye-level shot…' : 'First-person POV, close-up shot…', true)}</label>
        <label class="bb-field"><span>Setting</span>${fieldTag(`sc.${i}.setting`, s.setting, spec.scene.settingHint, false)}</label>
        <label class="bb-field"><span>Action</span>${fieldTag(`sc.${i}.action`, s.action, spec.scene.actionHint, false)}</label></div>`).join('')
    };
    { const th = q('bb-tense'), ed = document.querySelector('.bb-editor'); if (th && ed && th.parentNode !== ed) ed.insertBefore(th, q('bb-form')); }   // the tense control lives in the open pane's header: take it out before the form is rebuilt
    const basicsBar = `<div class="bb-basics" id="bb-basics" role="group" aria-label="Basics">${names}<label class="bb-field bb-scene"><span>Scene name</span>${fieldTag('h.scene', v.header.scene, 'Scene name', true)}</label><label class="bb-field bb-age"><span>Age</span>${fieldTag('h.age', v.header.age, '21+', true)}</label><ul class="bb-checks" data-checks="header"></ul></div>`;
    q('bb-form').innerHTML = basicsBar + spec.order.filter(k => k !== 'header').map(k => secShell(k, parts[k])).join('');
    bindForm(); bindExamples();
    applyActive();
    refresh();
  }
  const freeBox = (key, v, note) => `<p class="bb-note">${e(note)}</p><textarea class="bb-in" data-k="over.${key}" rows="10" spellcheck="false">${e((v.over && typeof v.over[key] === 'string') ? v.over[key] : '')}</textarea>`;
  function tagsHtml(spec, v) {
    const T = spec.tags, locked = [...T.mandatory];
    if (T.freeform) return `<p class="bb-note">${T.mandatory.length ? `Required tags: ${e(T.mandatory.join(', '))}. ` : ''}Type your tags, separated by commas or one per line.${T.total ? ` The template asks for ${T.total}.` : ''}</p><label class="bb-field"><span>Tags</span><textarea class="bb-in" data-k="tagsText" rows="3" placeholder="e.g. Romance, Slow Burn, Enemies to Lovers">${e(v.tagsText || '')}</textarea></label>`;
    const pick = T.approved.filter(t => !locked.includes(t) && !T.archetypes.includes(t) && t !== 'Wife');
    return `<div class="bb-tag-row"><span class="bb-mini">Required:</span>${locked.map(t => `<span class="bb-tag locked">${e(t)}</span>`).join('')}</div>
      ${T.archetypeRequired ? `<label class="bb-field"><span>Personality archetype (required tag)</span><select class="bb-in" data-k="archetype"><option value="">Choose…</option>${T.archetypes.map(a => `<option ${a === v.archetype ? 'selected' : ''}>${e(a)}</option>`).join('')}</select></label>` : ''}
      ${T.wifeRule ? `<label class="bb-check"><input type="checkbox" data-k="wife" ${v.wife ? 'checked' : ''}> Name 1 is the wife (adds the required "Wife" tag)</label>` : ''}
      <input class="bb-tag-search" placeholder="Filter tags…">
      <div class="bb-tag-pool">${pick.map(t => `<button type="button" class="bb-tag ${v.tags.includes(t) ? 'on' : ''}" data-tag="${e(t)}">${e(t)}</button>`).join('')}</div>
      ${T.borrowedApproved ? '<p class="bb-note">This template has no tag list of its own, so the approved list from your other templates is used.</p>' : ''}`;
  }
  function setPath(k, val) {
    const v = B.v, p = k.split('.');
    if (p[0] === 'f') { const k = p.slice(1).join('.'); v.f[k] = val; (v.touched = v.touched || {})[k] = true; if (v.auto) delete v.auto[k]; }
    else if (p[0] === 'n') v.names[p[1]] = val;
    else if (p[0] === 'h') v.header[p[1]] = val;
    else if (p[0] === 'g') { v.greet[+p[1]] = val; (v.touched = v.touched || {})['g' + p[1]] = true; if (v.gAuto) v.gAuto[+p[1]] = null; }
    else if (p[0] === 'img') v.img[p[1]] = val;
    else if (p[0] === 'sc') v.scenes[+p[1]][p[2]] = val;
    else if (p[0] === 'over') { v.over[p[1]] = val; }
    else if (k === 'intro') { v.intro = val; (v.touched = v.touched || {}).intro = true; v.iAuto = null; }
    else v[k] = val;
  }
  function bindForm() {
    document.querySelectorAll('#bb-form details').forEach(d => d.addEventListener('toggle', () => { if (d.open) resizeFields(); }));
    document.querySelectorAll('#bb-form .bb-in').forEach(el => {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const k = el.dataset.k;
        if (k.startsWith('f.') && B.v.auto) delete B.v.auto[k.slice(2)];
        if (k.startsWith('g.') && B.v.gAuto) B.v.gAuto[+k.slice(2)] = null;
        if (k === 'intro') delete B.v.iAuto;
        setPath(k, el.value); if (el.tagName === 'TEXTAREA') grow(el); refresh(); save();
      });
      if (el.tagName === 'TEXTAREA') grow(el);
    });
    document.querySelectorAll('#bb-form input[type=checkbox][data-k]').forEach(el => el.addEventListener('change', () => {
      B.v[el.dataset.k] = el.checked; save(); if (el.dataset.k === 'include3') build(); else refresh();
    }));
    document.querySelectorAll('#bb-form .bb-tag[data-tag]').forEach(b => b.onclick = () => {
      const t = b.dataset.tag, i = B.v.tags.indexOf(t);
      if (i >= 0) B.v.tags.splice(i, 1); else B.v.tags.push(t);
      b.classList.toggle('on', i < 0); refresh(); save();
    });
    const fs = document.querySelector('#bb-form .bb-tag-search');
    if (fs) fs.oninput = () => document.querySelectorAll('#bb-form .bb-tag-pool .bb-tag').forEach(b => { b.style.display = b.dataset.tag.toLowerCase().includes(fs.value.toLowerCase()) ? '' : 'none'; });
    document.querySelectorAll('#bb-form .bb-showfields').forEach(b => b.onclick = () => { const sec = b.dataset.sec;
      if (B.v.over && typeof B.v.over[sec] === 'string') { if (!confirm('Go back to the fields? Your edits to the whole text will be dropped.')) return; delete B.v.over[sec]; save(); }
      B.fieldView[sec] = true; rebuildDirectSec(sec); });
    document.querySelectorAll('#bb-form .bb-hidefields').forEach(b => b.onclick = () => { B.fieldView[b.dataset.sec] = false; rebuildDirectSec(b.dataset.sec); });
    document.querySelectorAll('#bb-form .bb-over-btn').forEach(b => b.onclick = () => { const sec = b.dataset.sec; B.v.over[sec] = compose(B.spec, B.v).sec[sec].body; B.editingOver[sec] = true; save(); rebuildDirectSec(sec); });
    document.querySelectorAll('#bb-form .bb-md').forEach(box => {
      const ta = box.querySelector('textarea'), hl = box.querySelector('.bb-md-hl');
      const paint = () => { hl.innerHTML = mdHighlight(ta.value) + '\n'; hl.scrollTop = ta.scrollTop; };
      ta.addEventListener('bbrepaint', paint);
      ta.addEventListener('input', paint); ta.addEventListener('scroll', () => { hl.scrollTop = ta.scrollTop; }); paint();
      if (window.ResizeObserver) new ResizeObserver(paint).observe(ta);
    });
    document.querySelectorAll('#bb-form .bb-passmode').forEach(b => b.onclick = () => {
      if (B.v.over && typeof B.v.over.greeting === 'string') { if (!confirm('Go back to the passage boxes? Your edits in the Greeting markdown will be dropped.')) return; delete B.v.over.greeting; }
      B.passMode = true; save(); rebuildDirectSec('greeting'); });
    document.querySelectorAll('#bb-form .bb-mdmode').forEach(b => b.onclick = () => { B.passMode = false; save(); rebuildDirectSec('greeting'); });
    document.querySelectorAll('#bb-form .bb-unover').forEach(b => b.onclick = () => { const sec = b.dataset.sec; if (!confirm('Go back to the fields? Your direct edits to this section will be dropped.')) return; delete B.v.over[sec]; delete B.editingOver[sec]; save(); rebuildDirectSec(sec); });
    document.querySelectorAll('#bb-form .bb-save-over').forEach(b => b.onclick = () => { const sec = b.dataset.sec; delete B.editingOver[sec]; save(); rebuildDirectSec(sec); toast(`${SEC_TITLE[sec] || 'Section'} edits saved.`); });
    wireIvw();
    document.querySelectorAll('#bb-form .bb-copy-sec').forEach(b => b.onclick = async ev => { ev.preventDefault(); ev.stopPropagation(); if (await copySection(b.dataset.sec)) flash(b); });
    document.querySelectorAll('#bb-form .bb-intro-design').forEach(b => b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); openIntroductionDesigner(); });
    document.querySelectorAll('#bb-form .bb-copy-img').forEach(b => b.onclick = async ev => {
      ev.preventDefault(); ev.stopPropagation();
      const spec = B.spec, im = B.v.img || {};
      const text = b.dataset.img === 'quality' ? spec.image.quality
        : b.dataset.img === 'appearance' ? [spec.image.quality, String(im.appearance || '').trim()].filter(Boolean).join(', ')
        : b.dataset.img === 'clothing' ? String(im.clothing || '').trim()
        : b.dataset.img === 'action' ? String(im.action || '').trim()
        : spec.image.negative;
      await window.copyText(text || ''); flash(b); toast(b.dataset.img === 'quality' || b.dataset.img === 'negative' ? 'Locked prompt copied.' : 'Copied.');
    });
  }
  // ---- one section at a time, with the section list on the left (counts and state for every section)
  function activeKey() { const keys = B.spec ? B.spec.order.filter(k => k !== 'header') : []; if (!keys.includes(B.activeSec)) B.activeSec = keys[0]; return B.activeSec; }      // Basics is the bar at the top of the editor, not a section in the list
  // the one-line summary under the Greeting editor and preview (the full list of checks opens from it)
  function greetStrip(c, list) {
    const box = document.querySelector('[data-strip="greeting"]'); if (!box) return;
    const g = B.spec.greeting, lim = g.limit, n = c.sec.greeting.prose.length, tol = lim ? withTol(lim) : null;
    const markers = (c.sec.greeting.body.match(/^[ \t]*!\[[^\]]*\]\([^)\s]*\)[ \t]*$/gm) || []).length;
    const bad = re => list.filter(x => x[0] === 'bad' && re.test(x[1])), nb = a => a.length === 1 ? '1 to fix' : `${a.length} to fix`;
    const dia = bad(/dialogue|quot|delivery|speech|spoken|narration outside/i), agency = bad(/\{\{user\}\}|user agency|reader/i);
    const open = box.querySelector('details') ? box.querySelector('details').open : false;
    const item = (ok, name, text) => `<span class="st ${ok ? 'ok' : 'bad'}"><b>${name}</b> ${e(text)}</span>`;
    const real = list.filter(x => x[0] !== 'ok').length;
    box.innerHTML = `<div class="st-row">${item(!lim || (n >= tol.min && n <= tol.max), 'Length', lim ? `${n.toLocaleString()} of ${lim.min.toLocaleString()} to ${lim.max.toLocaleString()}` : n.toLocaleString())}
      ${g.free ? '' : item(markers === g.count, 'Images', `${markers} of ${g.count} markers`)}
      ${item(!dia.length, 'Dialogue', dia.length ? nb(dia) : 'template rules met')}
      ${item(!agency.length, 'User agency', agency.length ? nb(agency) : 'the reader is never written')}</div>
      <div class="st-note">Preview shows pictures from your image host. A broken link shows a grey box with the address.</div>
      <details class="st-all"${open ? ' open' : ''}><summary>All checks for the Greeting${real ? ` (${real} to look at)` : ''}</summary><ul class="bb-checks" data-checks="greeting">${list.map(([lvl, m]) => `<li class="${lvl}">${lvl === 'ok' ? '✓' : lvl === 'warn' ? '•' : '!'} ${e(m)}</li>`).join('')}</ul></details>`;
  }
  function navTags() { try { const n = tagList(B.spec, B.v).length; return n ? `${n} tags` : 'done'; } catch { return 'done'; } }
  function navScenes() { const n = ((B.v && B.v.scenes) || []).length; return n ? `${n} scenes` : 'done'; }
  // The Checks panel is one collapsed box, closed until opened. Its border and its one-line summary show the worst thing inside: red something to fix, yellow only notes or reminders, green all good.
  function syncChecks() {
    const chk = q('bb-checks'); if (!chk) return;
    const res = B.lastRes || {}; let nb = 0, nw = 0;
    for (const k of Object.keys(res)) if (Array.isArray(res[k])) for (const x of res[k]) { if (x && x[0] === 'bad') nb++; else if (x && x[0] === 'warn') nw++; }
    const state = nb ? 'bad' : nw ? 'warn' : 'ok';
    chk.className = 'bb-nav-sum ' + state;
    const parts = [nb ? `${nb} to fix` : '', nw ? `${nw} note${nw > 1 ? 's' : ''}` : ''].filter(Boolean);
    const sum = q('bb-checks-sum'); if (sum) sum.textContent = parts.length ? parts.join(' \u00b7 ') : '\u2713 all good';
  }
  function renderNav(res) {
    const nav = q('bb-nav'); if (!nav || !B.spec) return;
    const act = activeKey(), all = q('bb-form').classList.contains('bb-all'); let bad = 0, warn = 0;
    const items = B.spec.order.map(k => {
      const list = (res && res[k]) || [], nb = list.filter(x => x[0] === 'bad').length, nw = list.filter(x => x[0] === 'warn').length; bad += nb; warn += nw;
      if (k === 'header') return '';                                                  // Basics is the bar at the top of the editor: no slot in the list
      const ct = document.querySelector(`[data-count="${k}"]`), cnt = ct ? ct.textContent.trim().replace(/\/\s*[\d,]+\s*[\u2013-]\s*/, '/ ') : '';
      const hasCt = /\//.test(cnt), ctBad = !!(ct && ct.classList.contains('bad'));     // the number is red only when the LENGTH is out of range; another problem in the section shows as a pink ! beside a green number
      return `<div class="bb-nav-row"><button type="button" class="bb-nav-item ${nb ? 'bad' : 'ok'}${k === act ? ' on' : ''}" data-nav="${k}" aria-current="${k === act ? 'true' : 'false'}"><span class="bb-nav-t">${e(SEC_TITLE[k] || k)}</span><span class="bb-nav-c ${hasCt ? (ctBad ? 'bad' : 'ok') : (nb ? 'bad' : '')}">${hasCt && nb && !ctBad ? '<b class="bb-nav-bang" title="Something else in this section needs a look">!</b> ' : ''}${e(cnt || (k === 'tags' && !nb ? navTags() : k === 'scene' && !nb ? navScenes() : nb ? 'to fix' : 'done'))}</span></button>${k !== 'header' ? `<button type="button" class="bb-nav-copy" data-navcopy="${k}" title="Copy ${e(SEC_TITLE[k] || k)}" aria-label="Copy ${e(SEC_TITLE[k] || k)}">\u29c9</button>` : ''}</div>`;
    }).join('');
    if (res && res.total) { bad += res.total.filter(x => x[0] === 'bad').length; warn += res.total.filter(x => x[0] === 'warn').length; }
    const fk = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.nav;
    const foc = !!(document.querySelector('.bb-layout') || {classList: {contains: () => false}}).classList.contains('bb-focus');
    const lst = q('bb-nav-list'), tls = q('bb-nav-tools'), chk = q('bb-checks');
    if (lst) {
      const tot = q('bb-total'); if (tot && lst.contains(tot)) nav.insertBefore(tot, lst);           // keep the node alive while the list is redrawn
      lst.innerHTML = `<div class="bb-nav-h">Sections</div>${items}`;
      if (tot) lst.insertBefore(tot, lst.querySelector('.bb-nav-row'));                            // the Personality + Scenario + Greeting total sits above Basics
    }
    syncChecks();
    if (tls) tls.innerHTML = '';     // the one-section view and the side preview are fixed now: no "Show all sections" / "Show full bot" switches

    if (fk) { const b = nav.querySelector(`[data-nav="${fk}"]`); if (b) b.focus(); }
  }
  // the menu bar at the top stays put while the page scrolls: remember its height so a section's title and its Rewrite / Copy buttons are never hidden under it
  function topbarVar() { try { const t = document.querySelector('.jcct-header'); document.documentElement.style.setProperty('--topbar-h', ((t && t.offsetHeight) || 66) + 'px'); } catch { /* ignore */ } }
  if (typeof window !== 'undefined' && !window.__bbTopbarBound) { window.__bbTopbarBound = true; window.addEventListener('resize', topbarVar); }
  if (typeof window !== 'undefined' && window.ResizeObserver && !window.__bbTopbarRO) { const tb = document.querySelector('.jcct-header'); if (tb) { window.__bbTopbarRO = new ResizeObserver(topbarVar); window.__bbTopbarRO.observe(tb); } }
  function applyActive() {
    topbarVar();
    const form = q('bb-form'); if (!form || !B.spec) return;
    const act = activeKey();
    form.querySelectorAll(':scope > .bb-sec').forEach(d => d.classList.toggle('bb-active', d.dataset.sec === act));
    const lay = document.querySelector('.bb-layout'); if (lay) lay.dataset.act = act;
    { const th = q('bb-tense'), ph = form.querySelector(`.bb-sec[data-sec="${act}"] .bb-pane-h`), ed = document.querySelector('.bb-editor');
      if (th) { if (ph && (act === 'introduction' || act === 'greeting')) { if (th.parentNode !== ph) ph.insertBefore(th, ph.querySelector('[data-pane-count]')); } else if (ed && th.parentNode !== ed) ed.insertBefore(th, q('bb-form')); } }
    // only the shown section stays open, so opening any other one (from a problem, a rewrite) is seen and switches to it
    if (!form.classList.contains('bb-all')) form.querySelectorAll(':scope > .bb-sec').forEach(d => { d.open = d.dataset.sec === act; });
    renderNav(B.lastRes || {});
  }
  function setActive(k, scroll) {
    if (k === 'header') { const bar = q('bb-basics'); if (bar) { bar.scrollIntoView({block: 'nearest'}); const i = bar.querySelector('input'); if (i) i.focus(); } return; }
    if (!B.spec || !B.spec.order.includes(k)) return;
    B.activeSec = k; applyActive();
    const d = q('bb-form').querySelector(`:scope > .bb-sec[data-sec="${k}"]`);
    if (scroll && d) requestAnimationFrame(() => d.scrollIntoView({block: 'start'}));
  }
  function rebuildDirectSec(sec) {
    const open = new Set([...document.querySelectorAll('#bb-form .bb-sec[open]')].map(d => d.dataset.sec));
    build();
    document.querySelectorAll('#bb-form .bb-sec').forEach(d => { d.open = open.has(d.dataset.sec) || d.dataset.sec === sec; });
    const d = document.querySelector(`#bb-form .bb-sec[data-sec="${sec}"]`);
    if (d) requestAnimationFrame(() => d.scrollIntoView({block: 'start'}));
  }
  const openSec = k => { const d = document.querySelector(`#bb-form .bb-sec[data-sec="${k}"]`); if (d) d.open = true; };
  function grow(el) { if (el.classList.contains('bb-md-in')) return; if (!el.getClientRects().length) { el.style.height = ''; return; } el.style.height = 'auto'; el.style.height = Math.max(96, el.scrollHeight + 2) + 'px'; }
  function resizeFields() { document.querySelectorAll('#bb-form textarea').forEach(grow); }
  function flash(b) { const t = b.textContent; b.classList.add('copied'); b.textContent = '✓ Copied'; setTimeout(() => { b.classList.remove('copied'); b.textContent = t; }, 1500); }
  function flashSave(b) { const t = b.textContent; b.textContent = '✓ Saved'; b.disabled = true; setTimeout(() => { b.textContent = t; b.disabled = false; }, 1500); }
  function markEmpty() {
    let n = 0;
    document.querySelectorAll('#bb-form .bb-in[data-k]').forEach(el => { if (el.tagName === 'SELECT' || el.type === 'checkbox') return; const k = el.dataset.k; if (!/^(f\.|g\.|intro$|img\.|sc\.|h\.|n\.1$)/.test(k)) return; const empty = !String(el.value || '').trim(); el.classList.toggle('bb-empty', empty); if (empty) n++; });
    const b = q('bb-blanks'); if (b) { b.textContent = n ? `${n} empty box${n > 1 ? 'es' : ''} · show first` : ''; b.style.display = n ? '' : 'none'; }
  }
  function refresh() {
    const c = compose(B.spec, B.v), res = check(B.spec, B.v, c);
    B.last = c; try { addWordingNotes(res); } catch (err) { console.warn('spelling check:', err && err.message); }
    document.querySelectorAll('#bb-form .bb-tag[data-tag]').forEach(b => b.classList.toggle('on', B.v.tags.includes(b.dataset.tag)));
    let bad = 0, warn = 0;
    for (const k of B.spec.order) {
      const list = res[k] || [], nb = list.filter(x => x[0] === 'bad').length, nw = list.filter(x => x[0] === 'warn').length;
      bad += nb; warn += nw;
      const ul = document.querySelector(`[data-checks="${k}"]`); if (ul) ul.innerHTML = list.map(([lvl, m]) => `<li class="${lvl}">${lvl === 'ok' ? '✓' : lvl === 'warn' ? '•' : '!'} ${e(m)}</li>`).join('');
      const st = document.querySelector(`[data-state="${k}"]`); if (st) { st.className = 'bb-state ' + (nb ? 'bad' : 'ok'); st.textContent = nb ? `${nb} to fix` : '✓ ready'; }
      const ct = document.querySelector(`[data-count="${k}"]`);
      if (ct) { const n = k === 'greeting' ? c.sec.greeting.prose.length : k === 'introduction' ? Math.max(introVis(c.sec[k].body).length, c.sec[k].body.length) : ['personality', 'scenario'].includes(k) ? c.sec[k].body.length : null; const lim = k === 'introduction' ? {min: 0, max: INTRO_MAX, cap: true} : (B.spec[k] || {}).limit || (k === 'greeting' ? B.spec.greeting.limit : null), WT = lim ? (lim.cap ? lim : withTol(lim)) : null;
        ct.textContent = n == null ? '' : `${n.toLocaleString()}${lim ? (lim.cap ? ` / ${lim.max.toLocaleString()}` : ` / ${lim.min.toLocaleString()}–${lim.max.toLocaleString()}`) : ''}`; ct.className = 'bb-count' + (lim && n != null ? ((n < WT.min || n > WT.max) ? ' bad' : ' ok') : ''); }
      const pv = document.querySelector(`[data-preview="${k}"]`); if (pv) pv.textContent = c.sec[k].body;
      const pc = document.querySelector(`[data-pane-count="${k}"]`); if (pc && ct) { pc.textContent = k === 'greeting' ? `${c.sec.greeting.prose.length.toLocaleString()} chars` : ct.textContent.replace(/\s+/g, ' ').trim(); pc.classList.toggle('bad', ct.classList.contains('bad')); }
    }
    greetStrip(c, res.greeting || []);
    // the live preview next to the Introduction and the Greeting (display only: nothing here is added to the bot)
    try { if (window.LivePreview && typeof DOMParser !== 'undefined') {
      window.LivePreview.update('introduction', introPayload(c));
      window.LivePreview.update('greeting', c.sec.greeting.body);
      for (const k of B.spec.order) if (k !== 'introduction' && k !== 'greeting' && c.sec[k]) window.LivePreview.update(k, c.sec[k].body); } } catch (err) { console.warn('live preview:', err && err.message); }
    try { syncIvw(false); } catch (err) { console.warn('intro view:', err && err.message); }
    B.lastRes = res; try { renderNav(res); } catch (err) { console.warn('section list:', err && err.message); }
    if (res.total) bad += res.total.filter(x => x[0] === 'bad').length;
    q('bb-total').innerHTML = (res.total || []).map(([lvl, m]) => `<div class="${lvl}">${lvl === 'ok' ? '✓' : '!'} ${e(m)}</div>`).join('');
    if (res.total) warn += res.total.filter(x => x[0] === 'warn').length;
    // every thing to fix and every note, with the section it belongs to; click the bar to show or hide the list, click an item to jump to its section
    const issues = [];
    for (const k of B.spec.order) for (const [lvl, m] of (res[k] || [])) if (lvl === 'bad' || lvl === 'warn') issues.push({lvl, k, m});
    for (const [lvl, m] of (res.total || [])) if (lvl === 'bad' || lvl === 'warn') issues.push({lvl, k: '', m});
    issues.sort((a, b) => (a.lvl === 'bad' ? 0 : 1) - (b.lvl === 'bad' ? 0 : 1));
    const open = issues.length > 0;     // inside the collapsed Checks box the list is always shown
    const sb = q('bb-status');
    sb.className = 'bb-status ' + (bad ? 'bad' : 'ok') + (issues.length ? ' bb-status-click' : '');
    sb.textContent = (bad ? `${bad} thing${bad > 1 ? 's' : ''} to fix${warn ? ` · ${warn} note${warn > 1 ? 's' : ''}` : ''}` : `✓ All limits met${warn ? ` · ${warn} note${warn > 1 ? 's' : ''}` : ''}`) + (issues.length ? (open ? '  ▾' : '  ▸') : '');
    sb.title = issues.length ? (open ? 'Click to hide the list' : 'Click to see what needs fixing') : '';
    sb.setAttribute('role', issues.length ? 'button' : 'status'); sb.tabIndex = issues.length ? 0 : -1;
    const il = q('bb-issues');
    if (il) { il.hidden = !open; il.innerHTML = open ? issues.map(x => `<div class="bb-issue ${x.lvl}" role="button" tabindex="0" title="Click to copy this text" data-copy="${e((x.k ? (SEC_TITLE[x.k] || x.k) : 'Whole bot') + ': ' + x.m)}" ${x.k ? `data-sec="${x.k}"` : ''}><b>${x.lvl === 'bad' ? '!' : '•'} ${x.k ? e(SEC_TITLE[x.k] || x.k) : 'Whole bot'}</b>${e(x.m)}${x.k ? '<button type="button" class="bb-goto" data-goto title="Jump to this section">Go to section ›</button>' : ''}</div>`).join('') : ''; }
    B.last = c;
    q('bb-full').textContent = c.full;
    markEmpty(); renderTense();
  }
  function flushPendingSave() {
    clearTimeout(B.saveT);
    if (!B.pendingSave) return;
    const {id, values} = B.pendingSave; B.pendingSave = null;
    window.juicyApp.builderSaveDraft(id, values).catch(err => { console.error(err); toast('Draft could not be saved: ' + err.message, true); });
  }
  function save() {
    const id = B.spec.id, values = clone(B.v);
    B.drafts[id] = clone(values); B.lastTemplate = id;
    clearTimeout(B.saveT); B.pendingSave = {id, values}; B.saveT = setTimeout(flushPendingSave, 500);
  }
  function prepareValues(spec, saved) {
    const v = Object.assign(blank(spec), saved ? clone(saved) : {});
    v.examples = exOf(v);
    while (v.greet.length < spec.greeting.count) v.greet.push(''); v.greet.length = spec.greeting.count;
    while (v.scenes.length < spec.greeting.count) v.scenes.push({name: '', shot: spec.scene.shotPrefix, setting: '', action: ''}); v.scenes.length = spec.greeting.count;
    if (spec.rules && spec.rules.hasName2) settleName2(spec, v); return v;
  }
  async function loadList(pick) {
    B.templates = await window.juicyApp.builderTemplates();
    for (const t of B.templates) if (t && !t.error && Array.isArray(t.order) && !t.order.includes('examples')) t.order.push('examples');      // every template can carry the optional Interaction Examples
    // only your own templates are listed, by their file names; two with the same name say which is which by date
    const listed = B.templates.filter(t => !t.unlisted || t.id === pick);      // a built-in one shows only while a saved bot made on it is open
    const label = t => { const dup = listed.filter(x => x.name === t.name).length > 1, d = t.updatedAt ? new Date(t.updatedAt).toLocaleDateString(undefined, {day: 'numeric', month: 'short'}) : '';
      if (!dup) return '';
      // v1.2.6: two files with the same short name say which is which by the file's own version or month ("v2", "September"); the date only when neither tells them apart
      const id = String(t.id || ''), ver = (id.match(/[_ ](v\d+)(?=[_ .])/i) || [])[1], mon = (id.match(/[_ ](January|February|March|April|May|June|July|August|September|October|November|December)[_ ]/i) || [])[1];
      const same = k => listed.filter(x => x.name === t.name && k(String(x.id || ''))).length > 1;
      const tag = ver && !same(x => new RegExp(`[_ ]${ver}(?=[_ .])`, 'i').test(x)) ? ver : mon && !same(x => x.includes(mon)) ? mon : (mon && ver ? `${mon} ${ver}` : (ver || mon || d));
      return tag ? ` (${tag})` : ''; };
    q('bb-template').innerHTML = listed.map(t => `<option value="${e(t.id)}" ${t.error ? 'disabled' : ''}>${e(t.name)}${label(t)}${t.error ? ' (could not read)' : ''}</option>`).join('');
    if (pick && !B.templates.some(t => t.id === pick)) pick = '';
    selectTemplate(pick || (listed.some(t => t.id === B.lastTemplate) ? B.lastTemplate : (listed[0] && listed[0].id) || ''));
    if (window.__bbTplInfo) window.__bbTplInfo();
  }

  // closeable "what changed" box: a template was updated or added (Replace, + Add) or a built-in one changed with an app update
  const tplLogText = l => [`${l.name}: what changed${l.from ? ` (${l.from})` : ''}`, l.summary, '', ...(l.sections && l.sections.length ? ['Sections: ' + l.sections.join('; '), ''] : []),
    ...(l.entries || []).flatMap(e => { const d = e.diff || {}, m = d.more || {}, more = (m.added || 0) + (m.removed || 0) + (m.changed || 0);
      return [`${e.title}${e.kind === 'changed' ? '' : ` (${e.kind === 'added' ? 'new section' : 'section removed'})`}`, ...(d.changed || []).map(c => '  ~ ' + (c.parts || []).map(([op, t]) => op === 0 ? t : op < 0 ? `[-${t.trim()}-] ` : `{+${t.trim()}+} `).join('').replace(/\s+/g, ' ').trim()),
        ...(d.added || []).map(x => '  + ' + x), ...(d.removed || []).map(x => '  - ' + x), ...(more ? [`  ...and ${more} more`] : []), '']; })].join('\n').trim();
  async function showTplLogs() {
    const host = q('bb-tpl-log'); if (!host) return;
    let logs = []; try { logs = await window.juicyApp.builderTemplateLogs(); } catch {}
    if (!logs.length) { host.hidden = true; host.innerHTML = ''; return; }
    const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    const what = {updated: 'Updated', builtin: 'Updated', added: 'Added'};
    host.hidden = false;
    host.innerHTML = `<div class="bb-tl-head"><b>Template changes</b><span class="micro">Green = words put in, <del>red</del> = words taken out. A line marked + is new, &minus; was removed, ~ was reworded.</span>${logs.length > 1 ? '<button class="ghost sm" data-tl-all>Close all</button>' : ''}</div>` +
      logs.map(l => `<div class="bb-tl-item" data-tl="${E(l.id)}"><div class="bb-tl-top"><span><b>${E(l.name)}</b> <em>${what[l.kind] || 'Updated'}${l.from ? ` · ${E(l.from)}` : ''}</em></span><span><button class="ghost sm" data-tl-copy="${E(l.id)}">Copy change log</button><button class="ghost sm" data-tl-close="${E(l.id)}">Close</button></span></div>
        <p class="bp-sum">${E(l.summary)}</p>${l.sections && l.sections.length ? `<p class="micro">${l.sections.map(E).join(' · ')}</p>` : ''}${typeof bpEntryHtml === 'function' ? (l.entries || []).map(e => bpEntryHtml(e, e.title).replace('<details class="bp-log" open>', (l.entries || []).length > 4 ? '<details class="bp-log">' : '<details class="bp-log" open>')).join('') : ''}</div>`).join('');
    host.querySelectorAll('[data-tl-close]').forEach(b => b.onclick = async () => { try { await window.juicyApp.builderCloseTemplateLog(b.dataset.tlClose); } catch {} showTplLogs(); });
    const all = host.querySelector('[data-tl-all]'); if (all) all.onclick = async () => { try { await window.juicyApp.builderCloseTemplateLog('all'); } catch {} showTplLogs(); };
    host.querySelectorAll('[data-tl-copy]').forEach(b => b.onclick = async () => { const l = logs.find(x => x.id === b.dataset.tlCopy); if (!l) return; try { await navigator.clipboard.writeText(tplLogText(l)); toast('Change log copied.'); } catch { toast('Could not copy.', true); } });
  }
  window.__bbTplLogs = showTplLogs;

  // the small "what changed" lists under a template's change log (the same drawing the Studio uses)
  const bpParts = ps => (ps || []).map(([op, s]) => op === 0 ? e(s) : op < 0 ? `<del>${e(s)}</del>` : `<ins>${e(s)}</ins>`).join('');
  function bpEntryHtml(en, title) {
    const d = en.diff || {}, m = d.more || {}, more = (m.added || 0) + (m.removed || 0) + (m.changed || 0);
    const lines = [...(d.changed || []).map(c => `<li class="chg"><i>~</i><span>${bpParts(c.parts)}</span></li>`), ...(d.added || []).map(x => `<li class="add"><i>+</i><span>${e(x)}</span></li>`), ...(d.removed || []).map(x => `<li class="rem"><i>&minus;</i><span>${e(x)}</span></li>`)];
    if (d.spacingOnly) lines.push('<li class="note"><span>Only spacing or line breaks changed. The wording is the same.</span></li>');
    if (more) lines.push(`<li class="note"><span>...and ${more} more line${more > 1 ? 's' : ''} (not shown).</span></li>`);
    const kind = en.kind && en.kind !== 'changed' ? ` <em>${en.kind === 'added' ? 'new section' : 'section removed'}</em>` : '';
    return `<details class="bp-log" open><summary><b>${e(title)}</b>${kind}</summary><ul class="bp-lines">${lines.join('')}</ul></details>`;
  }

  // ---------------------------------------------------------------- saved bots
  async function loadSaved(selectKey) {
    const sel = q('bb-saved'); if (!sel) return; let list = [];
    try { list = await window.juicyApp.builderSavedBots(); } catch (_) { /* the list stays empty */ }
    B.savedIndex = list;
    sel.innerHTML = `<option value="">${list.length ? `Load a saved bot… (${list.length})` : 'No saved bots yet'}</option>` + list.map(b => `<option value="${e(b.key)}" ${b.key === selectKey ? 'selected' : ''}>${e(b.sceneName)} · ${e(b.templateName)}</option>`).join('');
    const del = q('bb-saved-del'); if (del) del.style.display = sel.value ? '' : 'none';
  }
  function needSpec() { if (B.spec && B.v) return true; toast('Add a bot template first (＋ Add), then pick it in the Template list.', true); return false; }

  function selectTemplate(id) {
    flushPendingSave(); B.editingOver = {}; B.fieldView = {}; B.passMode = false;
    const spec = B.templates.find(t => t.id === id && !t.error) || B.templates.find(t => !t.error);
    if (!spec) {
      B.spec = null; B.v = null; renderTense();
      { const th = q('bb-tense'), ed = document.querySelector('.bb-editor'); if (th && ed && th.parentNode !== ed) ed.insertBefore(th, q('bb-form')); }
      q('bb-form').innerHTML = '<div class="bb-empty-state"><h3>Add a bot template to get started</h3><p>Click <b>＋ Add</b> above and choose your template .txt file. It can be written in any style. The Blank bot template (if you have not removed it) is a plain one to start from.</p></div>';
      for (const id2 of ['bb-limits', 'bb-total', 'bb-nav-list', 'bb-full', 'bb-issues']) { const el = q(id2); if (el) { if (id2 === 'bb-full') el.textContent = ''; else el.innerHTML = ''; } }
      const sb = q('bb-status'); if (sb) { sb.textContent = 'No template yet'; sb.className = 'bb-status'; }
      const sm = q('bb-checks-sum'); if (sm) sm.textContent = '';
      return;
    }
    B.spec = spec; B.v = prepareValues(spec, B.drafts[spec.id]);
    q('bb-template').value = spec.id; if (window.__bbTplInfo) window.__bbTplInfo(); build();
  }
  // the picture-less Creator Tool: Greeting picture markers are plain markers, nothing is uploaded
  window.refreshImageLocks = undefined;

  window.initBuilder = async function () {
    showTplLogs();
    try { const st = await window.juicyApp.builderState(); B.drafts = JSON.parse(JSON.stringify(st.drafts || {})); B.lastTemplate = st.lastTemplate || ''; } catch (_) { B.drafts = {}; B.lastTemplate = ''; }
    q('bb-template').onchange = () => { selectTemplate(q('bb-template').value); if (B.spec) save(); };
    let tplSeq = 0;
    const tplInfo = async () => {
      const my = ++tplSeq, box = q('bb-tpl-info');
      try {
        const i = B.spec ? await window.juicyApp.builderTemplateInfo(B.spec.id) : {}, hid = await window.juicyApp.builderHiddenTemplates();
        if (my !== tplSeq) return;
        box.innerHTML = [i.replaced ? `Your updated version${i.updatedAt ? ` (${new Date(i.updatedAt).toLocaleDateString()})` : ''} · <a href="#" id="bb-restore">use the original</a>` : i.yours ? 'Added by you' : '',
          hid.length ? `${hid.length} removed · <a href="#" id="bb-unhide">bring back</a>` : ''].filter(Boolean).join(' · ');
        const r = q('bb-restore'); if (r) r.onclick = async ev => { ev.preventDefault(); if (!confirm('Go back to the template that came with the tool?')) return; const x = await window.juicyApp.builderRestore(B.spec.id); if (!x.restored) return toast(x.reason, true); await loadList(B.spec.id); toast('Back to the original template.'); };
        const u = q('bb-unhide'); if (u) u.onclick = async ev => { ev.preventDefault(); await window.juicyApp.builderUnhide('all'); await loadList(B.spec && B.spec.id); toast('The templates you removed are back in the list.'); };
      } catch (_) { box.textContent = ''; }
    };
    window.__bbTplInfo = () => tplInfo();
    q('bb-remove').onclick = async () => {
      const t = B.spec; if (!t) return toast('Pick a template first.', true);
      const msg = t.source === 'yours'
        ? (t.replacesBuiltIn ? `Delete your version of "${t.name}"? It's deleted permanently, and the template that came with the tool comes back in its place.` : `Delete "${t.name}"? The template file is deleted permanently.`)
        : `Take "${t.name}" off your list? (It came with the tool, so you can bring it back from the Template line any time.)`;
      if (!confirm(msg)) return;
      try { const r = await window.juicyApp.builderRemove(t.id); await loadList(r.removed === 'yours' && r.builtInReturns ? t.id : '');
        toast(r.removed === 'hidden' ? `"${t.name}" is off your list.` : r.builtInReturns ? `Deleted your version. "${t.name}" is back to the one that came with the tool.` : `Deleted "${t.name}".`); }
      catch (err) { toast(err.message, true); }
    };
    q('bb-replace').onclick = async () => {
      if (!B.spec) return toast('Pick a template first.', true);
      if (!confirm(`Replace "${B.spec.name}" with your updated file? Your drafts for it are kept. (You can go back to the original afterwards.)`)) return;
      try { const r = await window.juicyApp.builderReplace(B.spec.id); if (!r.replaced) return; await loadList(r.id); showTplLogs(); toast(`"${B.spec.name}" now uses ${r.from}. Every box, limit and rule comes from the new file.`); }
      catch (err) { toast(err.message, true); }
    };
    q('bb-import').onclick = async () => { try { const r = await window.juicyApp.builderImport(); if (r && r.added && r.added.length) { await loadList(r.added[0]); showTplLogs(); toast(`Added template: ${r.added.join(', ')}`); } if (r && r.errors && r.errors.length) toast(r.errors.join(' · '), true); } catch (err) { toast(err.message, true); } };
    q('bb-clear').onclick = () => { if (!needSpec()) return; if (!confirm('Clear everything in this template?')) return; const pov = B.v.pov; B.v = blank(B.spec); if (pov) B.v.pov = pov; save(); build(); };
    q('bb-pov').querySelectorAll('button').forEach(b => b.onclick = () => {
      if (b.disabled || !needSpec()) return;
      const m = b.dataset.pov; B.v.pov = m; applyPov(B.spec, B.v); save(); build();
      toast(m === 'user' ? 'The Greeting narration now refers to the reader as {{user}}. Dialogue still says "you".' : 'The Greeting narration now addresses the reader as "you / your".');
    });
    { const sb = q('bb-status'), il = q('bb-issues');
      const toggle = () => { if (!sb.classList.contains('bb-status-click')) return; const open = il && !il.hidden; B.issuesOpen = !open; refresh(); };
      sb.onclick = toggle; sb.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } };
      // clicking a check copies its text (drag over it to copy only part); "Go to section" jumps to the section it is about
      if (il) il.onclick = ev => { const b = ev.target.closest('.bb-issue'); if (!b) return; if (ev.target.closest('[data-goto]')) { if (!b.dataset.sec) return; const d = document.querySelector(`#bb-form .bb-sec[data-sec="${b.dataset.sec}"]`); if (d) { d.open = true; d.scrollIntoView({block: 'start', behavior: 'smooth'}); } return; } copyCheck(b, b.dataset.copy); };
      if (il) il.onkeydown = ev => { if (ev.key !== 'Enter' && ev.key !== ' ') return; const b = ev.target.closest('.bb-issue'); if (!b || ev.target !== b) return; ev.preventDefault(); copyCheck(b, b.dataset.copy); }; }
    // the other check lines (under each section, the totals) copy their text the same way
    if (!window.__bbCopyChecks) { window.__bbCopyChecks = true; document.addEventListener('click', ev => { const li = ev.target.closest && ev.target.closest('.bb-checks li, .bb-total > div'); if (!li || ev.target.closest('button, a, input, select')) return; copyCheck(li, li.textContent.replace(/^\s*[✓!•]\s*/, '').trim()); }); }
    { const sp = q('bb-spell'); if (sp) sp.onclick = () => { if (needSpec()) offerWording(true); }; }
    q('bb-blanks').onclick = () => { const el = document.querySelector('#bb-form .bb-empty'); if (!el) return; const d = el.closest('details.bb-sec'); if (d) d.open = true; el.scrollIntoView({block: 'center'}); el.focus(); };
    q('bb-saved').onchange = async () => {
      const key = q('bb-saved').value, del = q('bb-saved-del'); if (del) del.style.display = key ? '' : 'none'; if (!key) return;
      try {
        const b = await window.juicyApp.builderLoadSavedBot(key);
        if (!B.templates.some(t => t.id === b.templateId && !t.error)) return toast(`"${b.sceneName}" was written on the template "${b.templateName}", which is not in your list any more. Add that template again (＋ Add) and then load the bot.`, true);
        B.drafts[b.templateId] = Object.assign(clone(b.values), {savedKey: key}); selectTemplate(b.templateId); save();
        toast(`Loaded "${b.sceneName}" (${b.templateName}), saved ${new Date(b.savedAt).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})}.`);
      } catch (err) { toast(err.message, true); }
    };
    q('bb-saved-del').onclick = async () => {
      const key = q('bb-saved').value; if (!key) return toast('Choose the saved bot to delete first.', true);
      const name = (q('bb-saved').selectedOptions[0] || {}).textContent || 'this saved bot';
      if (!confirm(`Delete "${name}"? The bot in the Bot Builder stays as it is.`)) return;
      try { await window.juicyApp.builderDeleteSavedBot(key); if (B.v && B.v.savedKey === key) delete B.v.savedKey; await loadSaved(); if (B.spec) save(); toast('Saved bot deleted.'); } catch (err) { toast(err.message, true); }
    };
    q('bb-savebot').onclick = async () => {
      if (!needSpec()) return;
      try {
        const r = await window.juicyApp.builderSaveBot(B.spec.id, clone(B.v), compose(B.spec, B.v).full), b = r.saved.find(x => x.key === r.key);
        B.v.savedKey = r.key; await loadSaved(r.key); save();
        toast(`Saved "${b ? b.sceneName : 'the bot'}". Load it any time from Saved bots.`);
      } catch (err) { toast(err.message, true); }
    };
    (function () {
      const pre = q('bb-full'), btn = q('bb-enlarge');
      if (!pre || !btn) return;
      const set = on => { pre.classList.toggle('big', on); btn.textContent = on ? '✕ Close' : '⤢ Enlarge'; if (on) btn.style.cssText = 'position:fixed;top:calc(4vh + 8px);right:calc(4vw + 14px);z-index:61'; else btn.style.cssText = ''; };
      btn.onclick = () => set(!pre.classList.contains('big'));
      pre.ondblclick = () => set(!pre.classList.contains('big'));
      document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && pre.classList.contains('big')) set(false); });
    })();
    q('bb-build-intro').onclick = () => openIntroductionDesigner();
    q('bb-copy').onclick = async () => { if (!needSpec()) return; await window.copyText(compose(B.spec, B.v).full); flash(q('bb-copy')); toast('Full bot copied.'); };
    const baseName = () => (B.v && ((B.v.header && B.v.header.scene) || (B.v.names && B.v.names[1]))) || 'Bot';
    q('bb-savetxt').onclick = async () => { if (!needSpec()) return; try { const path = await window.juicyApp.builderExport(`${baseName()}.txt`, compose(B.spec, B.v).full); if (path) toast('Saved: ' + path); } catch (err) { toast(err.message, true); } };
    q('bb-savejson').onclick = async () => { if (!needSpec()) return; try { const path = await window.juicyApp.builderExport(`${baseName()}.json`, botJson()); if (path) toast('Saved: ' + path); } catch (err) { toast(err.message, true); } };
    q('bb-upload').onclick = async () => {
      if (!needSpec()) return;
      try {
        const file = await window.juicyApp.builderOpenBot();
        if (!file || !file.text) return;
        const parsed = parseBuiltBot(file.text);
        if (!parsed.found) return toast('That file has no Introduction, Personality, Scenario or Greeting section to load.', true);
        const dirty = (B.v.intro || '').trim() || (B.v.greet || []).some(x => String(x || '').trim()) || (B.v.over && Object.keys(B.v.over).length);
        if (dirty && !confirm(`Replace the sections in this template with "${file.name}"?`)) return;
        const notes = applyBuiltBot(parsed) || [];
        save(); build();
        toast(`Loaded ${parsed.found} section${parsed.found === 1 ? '' : 's'} from ${file.name}.${notes.length ? ' ' + notes.join(' ') : ''}`, !!notes.length);
      } catch (err) { toast(err.message, true); }
    };
    // any code that opens a section (jump from a problem, edit directly) makes it the one shown
    new MutationObserver(ms => { const form = q('bb-form'); if (!form || form.classList.contains('bb-all')) return; for (const m of ms) { const d = m.target; if (d && d.classList && d.classList.contains('bb-sec') && d.open && d.dataset.sec !== B.activeSec) { setActive(d.dataset.sec, true); break; } } })
      .observe(q('bb-form'), {attributes: true, attributeFilter: ['open'], subtree: true});
    q('bb-nav').addEventListener('click', ev => {
      const cb = ev.target.closest('[data-navcopy]');
      if (cb) { ev.preventDefault(); copySection(cb.dataset.navcopy).then(ok => { if (ok) { cb.classList.add('copied'); cb.textContent = '✓'; setTimeout(() => { cb.classList.remove('copied'); cb.textContent = '⧉'; }, 1200); } }); return; }
      const n = ev.target.closest('[data-nav]'); if (n) setActive(n.dataset.nav, true);
    });
    await loadSaved();
    await loadList();
  };
  if (typeof window.addEventListener === 'function') window.addEventListener('beforeunload', flushPendingSave);
  window.builderOnShow = () => { requestAnimationFrame(resizeFields); };
  window.__builderCore = {botJson, exampleText, exampleIssues, withTol, compose, check, blank, autoFormat, prepareValues, selectTemplate, changeTense, renderTense, applyPov, state: B, build, refresh, openIntroductionDesigner, parseBuiltBot, applyBuiltBot};   // for tests
  Promise.resolve().then(() => window.initBuilder()).catch(err => console.error('Bot Builder could not start:', err));
})();
