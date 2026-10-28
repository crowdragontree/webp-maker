/* LanguageTool in the app (v1.2.0). LanguageTool is a free grammar and style checker made of rules (not AI), so it costs no credits. The app installs it into its own
 * folder (Settings > Grammar engine) and runs it only on this computer. When it is installed, its findings are added to the built-in check (Greeting planner, Bot Builder
 * Checks): better grammar and punctuation, confused words, plain-English style hints, and better replacements for misspellings. Nothing is waited for: a text is checked
 * with the built-in rules at once, and LanguageTool's answer is added a moment later. Nothing installed or switched off = exactly the built-in check, as before.
 * convert(text, matches, mask) turns LanguageTool's answer into the same hit shape the built-in check uses. */
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

  // ---------------------------------------------------------------- the renderer side: ask the app, keep the answers, tell the screens when they arrive
  const api = (root && root.juicyApp) || {};
  const cache = new Map(), queue = []; let on = false, running = false, fails = 0, notifyT = 0, st = null, versionTick = 0;
  const notify = () => { clearTimeout(notifyT); notifyT = setTimeout(() => { versionTick++; try { root.dispatchEvent(new root.Event('jbs-lt-update')); } catch (_) { /* no window in tests */ } }, 200); };
  function provider(text) {
    if (!on || !text) return null;
    if (cache.has(text)) return cache.get(text);
    if (!queue.includes(text)) { queue.push(text); pump(); }
    return null;
  }
  async function pump() {
    if (running) return; running = true;
    try {
      while (queue.length && on) {
        const text = queue.shift(); if (cache.has(text)) continue;
        let hits = [];
        try {
          const r = await api.ltCheck(text);
          if (r && r.ok) { fails = 0; hits = convert(text, r.matches, root.TextCheck && root.TextCheck.mask ? root.TextCheck.mask(text) : text); }
          else if (++fails >= 3) { on = false; queue.length = 0; if (st) st.error = (r && r.error) || 'LanguageTool did not answer.'; paint(); }
        } catch (_) { if (++fails >= 3) { on = false; queue.length = 0; } }
        if (cache.size > 300) cache.clear();
        cache.set(text, hits); notify();
      }
    } finally { running = false; }
  }
  function useIf(s) {
    st = s || st; const was = on; on = !!(s && s.ok !== false && s.installed && s.enabled);
    if (on && !was) fails = 0;
    if (was !== on) { cache.clear(); queue.length = 0; if (root.TextCheck) root.TextCheck.setProvider(on ? provider : null); notify(); }
    else if (on && root.TextCheck) root.TextCheck.setProvider(provider);
  }

  // ---------------------------------------------------------------- Settings > Grammar engine
  const $ = id => root.document.getElementById(id), esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  let prog = null, working = false, testMsg = ''; const say = m => { try { root.toast(m); } catch (_) { /* no toast in tests */ } };
  function ensurePanel() {
    if ($('lt-panel')) return $('lt-panel');
    const col = root.document.querySelector('#view-settings .set-col'); if (!col) return null;
    const p = root.document.createElement('div'); p.className = 'panel'; p.id = 'lt-panel';
    p.innerHTML = '<div class="panel-head"><div><h3>Grammar engine (LanguageTool)</h3><p>A free grammar and style checker made of rules, not AI: no credits, nothing sent anywhere. It runs only on this computer.</p></div></div><div id="lt-box"></div>';
    const anchor = $('imghost-panel') || $('backup-panel');
    if (anchor && anchor.parentNode === col) col.insertBefore(p, anchor.nextSibling); else col.insertBefore(p, col.firstChild);
    p.addEventListener('click', ev => { const b = ev.target.closest('[data-lt]'); if (b) { ev.preventDefault(); act(b.dataset.lt); } });
    p.addEventListener('change', ev => { if (ev.target.id === 'lt-on') act(ev.target.checked ? 'on' : 'off'); });
    return p;
  }
  function paint() {
    const box = $('lt-box'); if (!box) return;
    if (!st || st.ok === false && !st.error) { box.innerHTML = '<p class="micro">Not available here.</p>'; return; }
    if (working) {
      const pct = Math.round(((prog && prog.pct) || 0) * 100);
      box.innerHTML = `<p class="micro">${esc((prog && prog.msg) || 'Starting…')}</p><div class="lt-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><p class="micro">${pct}%. Keep the app open until it finishes; this can take several minutes.</p>`;
      return;
    }
    const err = st.error ? `<p class="micro" style="color:#ff8a8a">${esc(st.error)}</p>` : '';
    if (!st.installed) {
      box.innerHTML = `<p class="micro">Not installed. The app downloads LanguageTool (about 200 MB) from languagetool.org into its own folder, and a small portable Java only if this computer has none (Java 17 or newer). It adds better grammar, punctuation and style findings to the Bot Builder checks. The built-in check keeps working without it.</p>${err}<div class="button-row"><button type="button" class="primary" data-lt="install">Install LanguageTool</button></div>`;
      return;
    }
    box.innerHTML = `<label class="bb-check"><input type="checkbox" id="lt-on"${st.enabled ? ' checked' : ''}> Use LanguageTool in the checks</label><p class="micro">Installed in <code>${esc(st.root)}</code>. It starts by itself when a check needs it and stops after 15 idle minutes (or when the app closes).${st.running ? ' Running now.' : ''}</p><p class="micro" id="lt-test">${esc(testMsg)}</p>${err}<div class="button-row"><button type="button" class="ghost" data-lt="test">Test it</button><button type="button" class="ghost" data-lt="reinstall">Reinstall / update</button><button type="button" class="ghost" data-lt="remove">Remove</button></div>`;
  }
  async function refresh() { try { useIf(await api.ltStatus()); } catch (e) { st = {ok: false, error: String(e && e.message || e)}; } paint(); }
  async function act(what) {
    if (what === 'install' || what === 'reinstall') {
      working = true; prog = {pct: 0, msg: 'Starting…'}; paint();
      try { const r = await api.ltInstall(); working = false; if (r && r.ok === false) { st = Object.assign({}, st, {error: r.error}); paint(); } else { useIf(r); paint(); say('LanguageTool is installed. The checks now use it.'); } }
      catch (e) { working = false; st = Object.assign({}, st, {error: String(e && e.message || e)}); paint(); }
      refresh(); return;
    }
    if (what === 'remove') {
      if (!root.confirm('Remove LanguageTool from this computer? The built-in check keeps working. You can install it again any time.')) return;
      const r = await api.ltRemove(); useIf(r); paint(); say('LanguageTool was removed.'); return;
    }
    if (what === 'on' || what === 'off') { useIf(await api.ltEnable(what === 'on')); paint(); return; }
    if (what === 'test') {
      testMsg = 'Checking a sample sentence… (the first check starts LanguageTool and can take up to a minute)'; paint();
      const r = await api.ltCheck('She dont likes the the red apple, its a long time ago.');
      testMsg = r && r.ok ? `Working: LanguageTool found ${r.matches.length} thing${r.matches.length === 1 ? '' : 's'} in the sample sentence.` : `Not working: ${(r && r.error) || 'no answer'}`;
      paint(); try { st = Object.assign({}, st, await api.ltStatus()); } catch (_) { /* keep what is shown */ } paint(); return;
    }
  }
  if (api.onLtProgress) api.onLtProgress(p => { prog = p; if (p && p.phase === 'error') { working = false; st = Object.assign({}, st, {error: p.msg}); } if ($('lt-box')) paint(); });
  function init() { if (!api.ltStatus || !root.document) return; ensurePanel(); refresh(); }
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init); else init();
    root.document.addEventListener('click', ev => { const t = ev.target.closest && ev.target.closest('[data-view="settings"], [data-tab="settings"]'); if (t) setTimeout(() => { ensurePanel(); refresh(); }, 50); });
  }
  return {convert, kindOf, provider, useIf, refresh, get active() { return on; }, get version() { return versionTick; }};
});
