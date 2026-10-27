'use strict';
/* Ready-made looks for the Introduction Designer.
 * A look is a complete starting design (colors, fonts, frame, glow and the usual blocks) in the STACKED layout, so a beginner picks one, types their text and copies the code.
 * Choosing a look replaces the design's styling and blocks but keeps the text typed into Scene Name, Character Name, Introduction and Extra text.
 *   IntroLooks.list()            -> [{id, name, blurb}]
 *   IntroLooks.design(id, Core)  -> a full design document for that look
 *   IntroLooks.sample            -> the sample text used in the gallery thumbnails
 *   IntroLooks.open({Core, apply}) -> opens the gallery (browser only); apply(design) is called with the chosen look
 * Pure data plus a small gallery UI: no network, no script injected into the exported HTML. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.IntroLooks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const sample = {scene: 'The Last Train', name: 'Mara Voss', intro: 'She was waiting on the platform when the lights went out. Now the only way home is through the carriage she swore she would never enter again.', extra: '"You came back. I knew you would."'};
  const B = (type, text, extra) => ({type, text, ...extra});
  // theme: the card; blocks: the stacked items in order. Every block is a normal designer block, so everything stays editable afterwards.
  const LOOKS = [
    {id: 'void-violet', name: 'Void Violet', blurb: 'Black and glowing violet, spaced capitals, tag lines in green and red.',
      theme: {background: '#07030d', surface: '#160a28', text: '#eee4ff', accent: '#b36bff', border: '#5f2aa8', gradient: true, gradientAngle: 165, radius: 14, borderWidth: 2, padding: 28, shadow: 36, font: 'Georgia, serif'},
      blocks: t => [B('heading', '{{scene}}', {size: 30, weight: 700, color: 'accent', glow: 16, glow2: 40, glowColor: '#b36bff', glowColor2: '#5f2aa8', padding: 6, margin: 8, spacing: 8}), B('divider', '✦ ◆ ✦', {size: 14, color: 'accent', margin: 10}), B('label', '{{name}}', {size: 13, weight: 700, color: 'accent', background: true, bgColor: '#24103f', padding: 9, margin: 10, borderOn: true, borderColor: '#5f2aa8', radius: 999, spacing: 3}), B('text', '{{intro}}', {size: 16, align: 'center', line: 1.75, padding: 5, margin: 12, manualHeight: false}), B('divider', '◆', {size: 12, color: 'accent', margin: 8}), B('text', '[ROMANCE] [DRAMA] [SLOW BURN]', {size: 14, weight: 700, color: '#45ff7a', spacing: 1, padding: 3, margin: 4, manualHeight: false}), B('text', '{{extra}}', {size: 15, align: 'center', line: 1.6, padding: 4, margin: 10, manualHeight: false}), B('text', '[NO GORE] [NO NTR]', {size: 14, weight: 700, color: '#ff4a4a', spacing: 1, padding: 3, margin: 4, manualHeight: false}), B('text', 'No hate if those are your thing. They are just not what I write.', {size: 14, align: 'center', line: 1.6, padding: 4, margin: 8, manualHeight: false})]},
    {id: 'royal-violet', name: 'Royal Violet', blurb: 'Soft purple glow. The classic.',
      theme: {background: '#171120', surface: '#251b32', text: '#f2e5ff', accent: '#c797e9', border: '#74508c', gradient: true, gradientAngle: 135, radius: 18, borderWidth: 2, padding: 24, shadow: 18, font: 'Georgia, serif'},
      blocks: t => [B('heading', '{{scene}}', {size: 29, weight: 700, color: 'accent', glow: 10, padding: 6, margin: 10}), B('label', '{{name}}', {size: 14, weight: 700, color: 'accent', background: true, padding: 10, margin: 10}), B('divider', '✦', {size: 14, color: 'accent', margin: 13}), B('text', '{{intro}}', {size: 16, align: 'left', line: 1.65, padding: 5, margin: 12, manualHeight: false}), B('quote', '{{extra}}', {size: 15, line: 1.5, margin: 10, background: true, borderOn: true})]},
    {id: 'midnight-blue', name: 'Midnight Blue', blurb: 'Cool blue with a glowing title.',
      theme: {background: '#08121f', surface: '#0f2438', text: '#e4f1ff', accent: '#6ec6ff', border: '#2d6a9f', gradient: true, gradientAngle: 160, radius: 16, borderWidth: 2, padding: 24, shadow: 22, font: "'Trebuchet MS', sans-serif"},
      blocks: t => [B('heading', '{{scene}}', {size: 30, weight: 800, color: 'accent', glow: 16, glow2: 34, padding: 6, margin: 10}), B('divider', '◆', {size: 12, color: 'accent', margin: 10}), B('label', '{{name}}', {size: 13, weight: 700, color: 'accent', background: true, padding: 8, margin: 10, borderOn: true, radius: 999}), B('text', '{{intro}}', {size: 16, align: 'left', line: 1.7, padding: 5, margin: 12, manualHeight: false}), B('quote', '{{extra}}', {size: 15, line: 1.5, margin: 10, background: true})]},
    {id: 'crimson-noir', name: 'Crimson Noir', blurb: 'Dark with deep red accents.',
      theme: {background: '#0e0809', surface: '#1d0e12', text: '#f5e6e8', accent: '#ff5a6e', border: '#7a1e2c', gradient: true, gradientAngle: 180, radius: 10, borderWidth: 2, padding: 26, shadow: 20, font: "'Times New Roman', serif"},
      blocks: t => [B('heading', '{{scene}}', {size: 32, weight: 700, color: 'accent', glow: 8, padding: 6, margin: 8, spacing: 2}), B('label', '{{name}}', {size: 14, weight: 700, color: 'text', background: true, bgColor: '#3a1019', padding: 9, margin: 10, spacing: 3}), B('divider', '—', {size: 14, color: 'accent', margin: 12}), B('text', '{{intro}}', {size: 17, align: 'left', line: 1.7, padding: 4, margin: 12, manualHeight: false}), B('quote', '{{extra}}', {size: 16, line: 1.5, margin: 10, background: true, bgColor: '#2a0f16', borderOn: true, borderColor: '#7a1e2c'})]},
    {id: 'forest-glow', name: 'Forest Glow', blurb: 'Deep green, gentle and calm.',
      theme: {background: '#0a140e', surface: '#12261a', text: '#e8f5ea', accent: '#7ee0a0', border: '#2f7a4c', gradient: true, gradientAngle: 145, radius: 20, borderWidth: 2, padding: 24, shadow: 18, font: 'Georgia, serif'},
      blocks: t => [B('heading', '{{scene}}', {size: 28, weight: 700, color: 'accent', glow: 8, padding: 6, margin: 10}), B('label', '{{name}}', {size: 14, weight: 700, color: 'accent', background: true, padding: 10, margin: 10, borderOn: true, radius: 14}), B('divider', '❦', {size: 16, color: 'accent', margin: 12}), B('text', '{{intro}}', {size: 16, align: 'left', line: 1.7, padding: 5, margin: 12, manualHeight: false}), B('quote', '{{extra}}', {size: 15, line: 1.5, margin: 10, background: true})]},
    {id: 'rose-gold', name: 'Rose Gold', blurb: 'Warm pink and gold, a little glam.',
      theme: {background: '#1c1013', surface: '#2c1a20', text: '#fbeaea', accent: '#f2b8a2', border: '#b0707a', gradient: true, gradientAngle: 135, radius: 22, borderWidth: 2, padding: 24, shadow: 20, font: 'Georgia, serif'},
      blocks: t => [B('heading', '{{scene}}', {size: 30, weight: 700, color: 'accent', glow: 12, padding: 6, margin: 10}), B('label', '{{name}}', {size: 14, weight: 700, color: 'accent', background: true, padding: 10, margin: 10, borderOn: true, radius: 999}), B('divider', '❀', {size: 15, color: 'accent', margin: 12}), B('text', '{{intro}}', {size: 16, align: 'center', line: 1.7, padding: 5, margin: 12, manualHeight: false}), B('quote', '{{extra}}', {size: 16, line: 1.5, margin: 10, background: true})]},
    {id: 'neon-night', name: 'Neon Night', blurb: 'Bright neon on black.',
      theme: {background: '#07060d', surface: '#120d24', text: '#f0eaff', accent: '#39f5d0', border: '#a23bff', gradient: true, gradientAngle: 200, radius: 12, borderWidth: 2, padding: 24, shadow: 26, font: "'Courier New', monospace"},
      blocks: t => [B('heading', '{{scene}}', {size: 28, weight: 800, color: 'accent', glow: 18, glow2: 40, glowColor: '#39f5d0', glowColor2: '#a23bff', padding: 6, margin: 10, spacing: 2}), B('label', '{{name}}', {size: 13, weight: 700, color: 'accent', background: true, bgColor: '#1d1240', padding: 8, margin: 10, borderOn: true, borderColor: '#a23bff', spacing: 2}), B('divider', '▰▰▰', {size: 12, color: 'accent', margin: 10}), B('text', '{{intro}}', {size: 15, align: 'left', line: 1.7, padding: 5, margin: 12, manualHeight: false}), B('quote', '{{extra}}', {size: 15, line: 1.5, margin: 10, background: true, borderOn: true, borderColor: '#39f5d0'})]},
    {id: 'parchment', name: 'Old Parchment', blurb: 'Warm paper and ink, storybook style.',
      theme: {background: '#efe3c8', surface: '#f7edd7', text: '#3b2a1a', accent: '#8a3b1f', border: '#a98b5a', gradient: true, gradientAngle: 160, radius: 8, borderWidth: 3, padding: 26, shadow: 10, font: "'Times New Roman', serif", borderStyle: 'double'},
      blocks: t => [B('heading', '{{scene}}', {size: 32, weight: 700, color: 'accent', padding: 6, margin: 8}), B('label', '{{name}}', {size: 14, weight: 700, color: 'text', background: true, bgColor: '#e6d5ae', padding: 8, margin: 10, spacing: 2}), B('divider', '❧', {size: 18, color: 'accent', margin: 12}), B('text', '{{intro}}', {size: 17, align: 'justify', line: 1.7, padding: 5, margin: 12, manualHeight: false}), B('quote', '{{extra}}', {size: 16, line: 1.5, margin: 10, background: true, bgColor: '#ead9b3', borderOn: true, borderColor: '#a98b5a'})]},
    {id: 'clean-light', name: 'Clean Light', blurb: 'Bright, simple and easy to read.',
      theme: {background: '#f4f6fb', surface: '#ffffff', text: '#1f2937', accent: '#5b6cf0', border: '#c9d1ea', gradient: false, gradientAngle: 135, radius: 16, borderWidth: 1, padding: 24, shadow: 12, font: 'Arial, sans-serif'},
      blocks: t => [B('heading', '{{scene}}', {size: 28, weight: 800, color: 'accent', padding: 6, margin: 10}), B('label', '{{name}}', {size: 13, weight: 700, color: 'accent', background: true, bgColor: '#e8ebff', padding: 8, margin: 10, radius: 999}), B('divider', '•', {size: 14, color: 'accent', margin: 10}), B('text', '{{intro}}', {size: 16, align: 'left', line: 1.7, padding: 5, margin: 12, manualHeight: false}), B('quote', '{{extra}}', {size: 15, line: 1.5, margin: 10, background: true, bgColor: '#f0f2ff', borderOn: true, borderColor: '#c9d1ea'})]}
  ];
  const list = () => LOOKS.map(({id, name, blurb}) => ({id, name, blurb}));
  function design(id, Core) {
    const look = LOOKS.find(l => l.id === id) || LOOKS[0], d = Core.starter();
    d.title = look.name;
    d.theme = Object.assign({}, d.theme, look.theme, {frames: [], maxWidth: 640, align: 'center'});
    d.blocks = look.blocks(d.theme).map((b, i) => Object.assign({id: 'look-' + id + '-' + i, align: 'center', weight: 400, color: 'text', line: 1.5, padding: 8, margin: 12, spacing: 0, bgColor: d.theme.surface, borderColor: d.theme.border, borderWidth: 1, borderStyle: 'solid', radius: 12, glow: 0, glow2: 0, glowOpacity: .75, glowOpacity2: .4}, b));
    d.fields = Object.assign({}, sample);
    return d;
  }

  // ---- the gallery (browser only)
  function open({Core, apply, current}) {
    if (typeof document === 'undefined') return null;
    const old = document.getElementById('id-looks'); if (old) old.remove();
    const wrap = document.createElement('div'); wrap.id = 'id-looks'; wrap.className = 'id-looks'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', 'Pick a look');
    const box = document.createElement('div'); box.className = 'id-looks-box';
    const head = document.createElement('div'); head.className = 'id-looks-head';
    head.innerHTML = '<div><h2>Pick a look</h2><p>Choose a starting style. Your text stays; you can change every color, font and block afterwards. Ctrl+Z undoes it.</p></div>';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'id-ghost'; close.textContent = 'Close'; head.appendChild(close);
    const grid = document.createElement('div'); grid.className = 'id-looks-grid';
    for (const l of LOOKS) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'id-look'; card.dataset.look = l.id;
      const thumb = document.createElement('div'); thumb.className = 'id-look-thumb'; thumb.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('div'); inner.className = 'id-look-inner';
      try { inner.innerHTML = Core.compile(design(l.id, Core)); } catch (e) { inner.textContent = ''; }   // our own compiler's static output, never user HTML
      thumb.appendChild(inner);
      const name = document.createElement('strong'); name.textContent = l.name;
      const blurb = document.createElement('span'); blurb.textContent = l.blurb;
      card.append(thumb, name, blurb);
      card.onclick = () => { const d = design(l.id, Core); wrap.remove(); apply(d, l); };
      grid.appendChild(card);
    }
    box.append(head, grid); wrap.appendChild(box); document.body.appendChild(wrap);
    const shut = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); };
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); shut(); } }
    close.onclick = shut; wrap.addEventListener('mousedown', e => { if (e.target === wrap) shut(); }); document.addEventListener('keydown', onKey, true);
    const first = grid.querySelector('button'); if (first) first.focus();
    return {close: shut};
  }
  return {list, design, open, sample, LOOKS};
});
