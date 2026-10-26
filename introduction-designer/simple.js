'use strict';
/* Simple / Advanced mode, "Pick a look" button and first-visit tips for the Introduction Designer.
 * Loaded after app.js and talks to it only through window.IntroDesigner, so it can be dropped into any host
 * (Blueprint Studio, the Creator Tool, the GitHub Pages page) without changes.
 * Simple mode only HIDES controls (anything marked class "id-adv"); it never changes the design or what is exported. */
(() => {
  const D = window.IntroDesigner, Looks = window.IntroLooks, Core = window.IntroCore;
  if (!D) return;
  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { return window.localStorage.getItem('introDesigner.' + k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem('introDesigner.' + k, v); } catch (e) { /* storage may be blocked */ } }
  };
  const el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) { if (k === 'text') n.textContent = v; else if (k === 'class') n.className = v; else n.setAttribute(k, v); }
    for (const kid of kids) n.append(kid);
    return n;
  };

  // ---- Pick a look ----
  function openLooks() {
    if (!Looks) return D.notice('The looks gallery did not load.', true);
    Looks.open({ Core, apply: design => D.applyDesign(design) });
  }
  const looksButton = $('id-looks-open');
  if (looksButton) looksButton.onclick = openLooks;

  // ---- Simple / Advanced ----
  const simpleBtn = el('button', { type: 'button', text: 'Simple', title: 'Only the everyday controls' });
  const advBtn = el('button', { type: 'button', text: 'Advanced', title: 'Every control, free placement and HTML import' });
  const toggle = el('div', { class: 'id-toggle id-mode', role: 'group', 'aria-label': 'Interface mode' }, simpleBtn, advBtn);
  const actions = document.querySelector('.id-top-actions');
  if (actions) actions.prepend(toggle);

  function setMode(mode, remember = true) {
    const simple = mode !== 'advanced';
    document.body.classList.toggle('id-simple', simple);
    simpleBtn.classList.toggle('active', simple); advBtn.classList.toggle('active', !simple);
    simpleBtn.setAttribute('aria-pressed', String(simple)); advBtn.setAttribute('aria-pressed', String(!simple));
    if (simple) {
      // Leave anything that is now hidden.
      if ($('id-visual-panel').hidden) { const tab = $('id-visual-tab'); if (tab) tab.click(); }
      if (document.querySelector('#id-element-form[data-property-tab="advanced"]')) D.setPropertyTab('content');
    }
    if (remember) store.set('mode', simple ? 'simple' : 'advanced');
  }
  simpleBtn.onclick = () => setMode('simple');
  advBtn.onclick = () => setMode('advanced');
  setMode(store.get('mode') === 'advanced' ? 'advanced' : 'simple', false);

  // A design made from pasted HTML can only be edited in Advanced mode, so open it there.
  setTimeout(() => {
    try {
      if (D.current().mode === 'source' && document.body.classList.contains('id-simple')) {
        setMode('advanced', false);
        D.notice('This introduction was built from custom HTML, so Advanced mode is on.');
      }
    } catch (e) { /* ignore */ }
  }, 400);

  // ---- First-visit tips ----
  const main = document.querySelector('.id-workspace');
  const tips = el('div', { id: 'id-tips', class: 'id-tips', role: 'region', 'aria-label': 'Getting started' });
  const lookStep = el('button', { type: 'button', class: 'id-primary', text: '✦ Pick a look' });
  lookStep.onclick = openLooks;
  const step = (n, ...kids) => el('li', {}, el('b', { text: String(n) }), el('span', {}, ...kids));
  const closeTips = el('button', { type: 'button', class: 'id-ghost', text: 'Got it' });
  tips.append(
    el('strong', { text: 'Three steps:' }),
    el('ol', {},
      step(1, 'Choose a style ', lookStep),
      step(2, 'Type your text on the left'),
      step(3, 'Press “Copy Introduction” at the bottom, then paste it into JuicyChat')),
    closeTips);
  if (main) main.prepend(tips);
  const showTips = on => { tips.hidden = !on; if (!on) store.set('tipsSeen', '1'); };
  closeTips.onclick = () => showTips(false);
  showTips(store.get('tipsSeen') !== '1');
  const help = el('button', { type: 'button', class: 'id-ghost', text: '?', title: 'Show the quick-start steps', 'aria-label': 'Show the quick-start steps' });
  help.onclick = () => { tips.hidden = false; tips.scrollIntoView({ block: 'nearest' }); };
  if (actions) actions.prepend(help);
})();
