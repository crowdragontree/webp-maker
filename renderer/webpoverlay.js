// WebP Maker overlay: one PNG placed on every frame of every WebP, in the same size and place each time.
//  - The PNG, its size and its position are kept in this app's browser storage, so they are set once and stay locked for every conversion.
//  - The overlay is drawn on each frame right after the clip frame and before the frame is encoded (webpmaker.js calls WebpOverlay.draw).
//  - The preview shows the bot window of JuicyChat: its art slot crops the picture to fit (it is narrower than 3:4), so the preview crops the same way,
//    and a safe zone keeps the overlay inside what both measured window shapes show.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = 'jbs.webpOverlay';
  const MAX_SIDE = 1536;                       // the stored PNG is scaled down to this on its longest side
  const SLOT = {narrow: 0.642, wide: 0.674};   // measured on the JuicyChat bot window: art slot width / height (two window sizes)
  const EDGE_X = 0.006, EDGE_Y = 0.008;       // a hair of margin kept inside the safe zone (the window's corners are rounded)
  const S = {on: true, locked: false, png: '', name: '', w: 0, h: 0, solid: false, wFrac: 0.24, cx: 0.17, cy: 0.88, img: null};
  const hist = [];                        // earlier size/position states, for Undo (kept while the app is open)
  let view = 'narrow', frame = null, resultUrl = '', saved = true, readyP = Promise.resolve(), ui = null;
  const subs = [];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => Number.isFinite(Number(v)) ? Number(v) : d;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

  const active = () => !!(S.on && S.img && S.png);
  const hasImage = () => !!(S.img && S.png);
  const dims = () => frame && frame.w > 0 && frame.h > 0 ? {W: frame.w, H: frame.h} : {W: 480, H: 640};
  const sizeFrac = (W, H) => ({w: S.wFrac, h: S.wFrac * (W / H) * (S.h / S.w)});   // the overlay's width and height as fractions of the frame

  // the part of the frame the narrowest measured window still shows, plus a small margin: the overlay is kept inside it
  function limits(W, H) {
    const ri = W / H, r = view === 'wide' ? SLOT.wide : SLOT.narrow;   // Wide window view: it may go right to the edge that window shows; the other views keep it inside the narrower one
    const visX = ri > r ? r / ri : 1, visY = ri > r ? 1 : ri / r;
    const x0 = (1 - visX) / 2 + EDGE_X, y0 = (1 - visY) / 2 + EDGE_Y;
    const sz = sizeFrac(W, H);
    const rng = (lo, size) => lo + size / 2 <= 1 - lo - size / 2 ? [lo + size / 2, 1 - lo - size / 2] : [0.5, 0.5];
    const [ax, bx] = rng(x0, sz.w), [ay, by] = rng(y0, sz.h);
    return {x0, y0, ax, bx, ay, by, sz, visX, visY};
  }
  function fit() { const {W, H} = dims(), L = limits(W, H); S.cx = clamp(S.cx, L.ax, L.bx); S.cy = clamp(S.cy, L.ay, L.by); }
  // the overlay's rectangle in pixels of a W x H frame (always fully inside the frame)
  function geometry(W, H) {
    const sz = sizeFrac(W, H);
    const cx = sz.w >= 1 ? 0.5 : clamp(S.cx, sz.w / 2, 1 - sz.w / 2), cy = sz.h >= 1 ? 0.5 : clamp(S.cy, sz.h / 2, 1 - sz.h / 2);
    return {x: (cx - sz.w / 2) * W, y: (cy - sz.h / 2) * H, w: sz.w * W, h: sz.h * H};
  }
  function draw(ctx, W, H) {
    if (!active() || !ctx) return;
    const g = geometry(W, H);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.globalAlpha = 1;
    ctx.drawImage(S.img, g.x, g.y, g.w, g.h); ctx.restore();
  }
  // a number that changes whenever anything about the overlay changes (it is part of the key of the cached frames; digits only)
  function key() {
    if (!active()) return 0;
    const s = `${S.png.length}:${S.png.slice(40, 120)}:${S.png.slice(-120)}:${S.wFrac.toFixed(4)}:${S.cx.toFixed(4)}:${S.cy.toFixed(4)}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 900000000 + 1;
  }

  // ---- storage
  function persist() {
    saved = true;
    try { localStorage.setItem(KEY, JSON.stringify({on: S.on, locked: S.locked, png: S.png, name: S.name, w: S.w, h: S.h, solid: S.solid, wFrac: S.wFrac, cx: S.cx, cy: S.cy})); }
    catch { saved = false; }
  }
  function decode(url) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('That picture could not be read.')); im.src = url; });
  }
  function restore() {
    let o = null; try { o = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { o = null; }
    if (!o || typeof o.png !== 'string' || !/^data:image\/(png|webp);base64,/.test(o.png)) return Promise.resolve();
    S.on = o.on !== false; S.locked = !!o.locked; S.name = String(o.name || 'overlay.png'); S.w = num(o.w, 0); S.h = num(o.h, 0); S.solid = !!o.solid;
    S.wFrac = clamp(num(o.wFrac, 0.24), 0.05, 0.7); S.cx = clamp(num(o.cx, 0.17), 0, 1); S.cy = clamp(num(o.cy, 0.88), 0, 1);
    return decode(o.png).then(im => { S.png = o.png; S.img = im; S.w = im.naturalWidth || S.w; S.h = im.naturalHeight || S.h; }).catch(() => { S.png = ''; S.img = null; });
  }

  async function importFile(file) {
    if (!file) return;
    if (!/^image\/(png|webp)$/i.test(file.type) && !/\.(png|webp)$/i.test(file.name)) throw new Error('Choose a PNG (or WebP) picture. A PNG with a transparent background works best.');
    const bmp = await createImageBitmap(file);
    let w = bmp.width, h = bmp.height;
    if (!w || !h) throw new Error('That picture is empty.');
    const k = Math.min(1, MAX_SIDE / Math.max(w, h)); w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const url = c.toDataURL('image/png');
    // does it have a transparent background? (a picture with none would put a solid rectangle on every frame)
    const t = document.createElement('canvas'); t.width = Math.min(64, w); t.height = Math.min(64, h);
    const tg = t.getContext('2d'); tg.drawImage(c, 0, 0, t.width, t.height);
    const d = tg.getImageData(0, 0, t.width, t.height).data; let clear = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
    const im = await decode(url);
    S.png = url; S.img = im; S.name = String(file.name || 'overlay.png'); S.w = w; S.h = h; S.solid = clear < (d.length / 4) * 0.01; S.on = true;
    S.wFrac = 0.24; hist.length = 0; corner('bl', true);
    persist(); readyP = Promise.resolve();
  }
  const snap = () => ({wFrac: S.wFrac, cx: S.cx, cy: S.cy});
  const same = (a, b) => Math.abs(a.wFrac - b.wFrac) < 1e-9 && Math.abs(a.cx - b.cx) < 1e-9 && Math.abs(a.cy - b.cy) < 1e-9;
  function pushHist(st) { if (hist.length && same(hist[hist.length - 1], st)) return; if (same(st, snap())) return; hist.push(st); if (hist.length > 40) hist.shift(); }
  function undo() { if (S.locked || !hist.length) return; const st = hist.pop(); S.wFrac = st.wFrac; S.cx = st.cx; S.cy = st.cy; fit(); persist(); changed(); }
  function remove() { hist.length = 0; S.png = ''; S.img = null; S.name = ''; S.w = S.h = 0; S.solid = false; try { localStorage.removeItem(KEY); } catch { /* storage may be unavailable */ } saved = true; }
  function corner(name, quiet) {
    const {W, H} = dims(), L = limits(W, H), sz = L.sz;
    S.cx = /l$/.test(name) ? L.x0 + sz.w / 2 : 1 - L.x0 - sz.w / 2;
    S.cy = /^t/.test(name) ? L.y0 + sz.h / 2 : 1 - L.y0 - sz.h / 2;
    if (!quiet) { persist(); changed(); }
  }
  function cornerClick(name) { if (S.locked) return; const before = snap(); corner(name, true); pushHist(before); persist(); changed(); }
  function changed() { render(); refreshBot(); subs.forEach(f => { try { f(); } catch { /* a listener must not break the others */ } }); }

  // ---- the preview on the bot window
  function slotRatio() { const {W, H} = dims(); return view === 'full' ? W / H : SLOT[view] || SLOT.narrow; }
  function render() {
    if (!ui) return;
    const has = hasImage();
    ui.bw.hidden = !has; ui.controls.hidden = !has; ui.remove.hidden = !has; ui.thumb.hidden = !has;
    ui.choose.textContent = has ? 'Change PNG' : 'Choose PNG';
    ui.name.textContent = has ? S.name : 'No overlay chosen';
    ui.meta.textContent = has ? `${S.w} × ${S.h}${S.solid ? ' · no transparent background, so it will be a solid rectangle' : ' · transparent background'}${saved ? '' : ' · too large to keep after you close the app'}` : 'Pick a PNG with a transparent background. It is added to every frame, in the same place.';
    ui.meta.classList.toggle('wm-ov-warn', has && (S.solid || !saved));
    if (has) ui.thumb.src = S.png;
    ui.on.checked = S.on; if (ui.lock) ui.lock.checked = S.locked;
    ui.size.disabled = S.locked; ui.corners.forEach(b => { b.disabled = S.locked; }); if (ui.undo) ui.undo.disabled = S.locked || !hist.length;
    ui.ov.classList.toggle('wm-ov-locked', S.locked); ui.ov.tabIndex = S.locked ? -1 : 0; ui.size.value = String(Math.round(S.wFrac * 100)); ui.sizeVal.textContent = `${Math.round(S.wFrac * 100)}%`;
    ui.overlay.classList.toggle('wm-ov-off', !S.on);
    if (ui.dot) ui.dot.hidden = !active();
    if (!has) return;
    const {W, H} = dims(), r = slotRatio(), ri = W / H;
    ui.art.style.setProperty('--bw-r', String(r));
    // the picture fills the slot and is cropped, the way the window does it
    let bw, bh, bl, bt;
    if (ri > r) { bh = 100; bw = 100 * ri / r; bl = -(bw - 100) / 2; bt = 0; } else { bw = 100; bh = 100 * r / ri; bl = 0; bt = -(bh - 100) / 2; }
    Object.assign(ui.box.style, {width: bw + '%', height: bh + '%', left: bl + '%', top: bt + '%'});
    const showFrame = !!(resultUrl || (frame && frame.url));
    ui.img.hidden = !showFrame; ui.art.classList.toggle('wm-bw-noframe', !showFrame);
    const wantSrc = resultUrl || (frame && frame.url) || '';
    if (wantSrc && ui.img.getAttribute('src') !== wantSrc) ui.img.src = wantSrc;
    const g = geometry(W, H);
    Object.assign(ui.ov.style, {left: 100 * g.x / W + '%', top: 100 * g.y / H + '%', width: 100 * g.w / W + '%', height: 100 * g.h / H + '%'});
    if (ui.ov.getAttribute('src') !== S.png) ui.ov.src = S.png;
    ui.ov.hidden = !!resultUrl || !S.on;     // a finished WebP already has the overlay in it
    const L = limits(W, H);
    ui.safe.hidden = view !== 'full';
    Object.assign(ui.safe.style, {left: 100 * (L.x0 - EDGE_X) + '%', right: 100 * (L.x0 - EDGE_X) + '%', top: 100 * (L.y0 - EDGE_Y) + '%', bottom: 100 * (L.y0 - EDGE_Y) + '%'});
    ui.views.forEach(b => b.classList.toggle('on', b.dataset.bwv === view));
    ui.note.textContent = resultUrl ? 'Showing the finished WebP, overlay included.' : frame && frame.url ? 'Showing the first frame with the overlay. Drag the overlay, or use the arrow keys.' : 'Add clips to see your own picture here. Drag the overlay, or use the arrow keys.';
    ui.sizeNote.textContent = view === 'full' ? 'Dashed lines: what both measured windows show. The overlay stays inside them.' : `This window shows the middle ${Math.round(100 * (ri > r ? r / ri : 1))}% of the width.${view === 'wide' ? ' The overlay can go right to its edge. In the narrow window that edge is cut off.' : ' The overlay stays inside this window.'}`;
  }
  let lastBot = '';
  function refreshBot(force) {
    if (!ui) return;
    let info = null; try { info = typeof window.builderBotPreviewInfo === 'function' ? window.builderBotPreviewInfo() : null; } catch { info = null; }
    const sig = JSON.stringify(info || null);
    if (!force && sig === lastBot) return;
    lastBot = sig;
    ui.title.textContent = info && info.scene ? info.scene : 'Your Bot Name';
    ui.src.textContent = info && (info.scene || info.html || info.text) ? 'Name and Introduction from the bot open in the Bot Builder' : 'Open a bot in the Bot Builder to show its name and Introduction here';
    ui.intro.replaceChildren();
    if (info && info.html && info.html.trim()) {
      const fr = document.createElement('iframe');
      fr.setAttribute('sandbox', ''); fr.setAttribute('tabindex', '-1'); fr.title = 'Introduction as it will look';
      fr.srcdoc = '<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><style>html{color-scheme:dark}html,body{margin:0;background:transparent;overflow:hidden}body{padding:0;font:13px system-ui,sans-serif;color:#ddd}img{max-width:100%}</style>' + info.html.replace(/<script[\s\S]*?<\/script>/gi, '');
      ui.intro.appendChild(fr);
    } else if (info && info.text && info.text.trim()) {
      const p = document.createElement('p'); p.className = 'wm-bw-introtext'; p.textContent = info.text.trim().slice(0, 700); ui.intro.appendChild(p);
    } else ui.intro.innerHTML = '<div class="wm-bw-introph">Your Introduction card</div>';
  }

  // ---- dragging and nudging the overlay in the preview
  function bindDrag() {
    let drag = null, burst = false;
    const cancel = e => { if (e.key === 'Escape' && drag) { S.cx = drag.cx; S.cy = drag.cy; try { ui.ov.releasePointerCapture(drag.id); } catch { /* already released */ } drag = null; ui.ov.classList.remove('wm-ov-drag'); document.removeEventListener('keydown', cancel, true); fit(); render(); } };
    ui.ov.addEventListener('pointerdown', e => {
      if (e.button !== 0 || S.locked) return;
      const r = ui.box.getBoundingClientRect(); if (!r.width || !r.height) return;
      drag = {x: e.clientX, y: e.clientY, cx: S.cx, cy: S.cy, w: r.width, h: r.height, id: e.pointerId, start: snap()};
      ui.ov.setPointerCapture(e.pointerId); ui.ov.classList.add('wm-ov-drag'); e.preventDefault();
      document.addEventListener('keydown', cancel, true);       // Esc while dragging puts it back where it was
    });
    ui.ov.addEventListener('pointermove', e => {
      if (!drag) return;
      S.cx = drag.cx + (e.clientX - drag.x) / drag.w; S.cy = drag.cy + (e.clientY - drag.y) / drag.h;
      fit(); render();
    });
    const end = () => { if (!drag) return; const d = drag; drag = null; document.removeEventListener('keydown', cancel, true); ui.ov.classList.remove('wm-ov-drag'); pushHist(d.start); persist(); changed(); };
    ui.ov.addEventListener('pointerup', end); ui.ov.addEventListener('pointercancel', end);
    ui.ov.addEventListener('keydown', e => {
      if (S.locked) return;
      const step = e.shiftKey ? 0.02 : 0.005; let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step; else if (e.key === 'ArrowRight') dx = step; else if (e.key === 'ArrowUp') dy = -step; else if (e.key === 'ArrowDown') dy = step; else return;
      e.preventDefault(); if (!burst) { burst = true; pushHist(snap()); }
      S.cx += dx; S.cy += dy; fit(); render();
      clearTimeout(bindDrag.t); bindDrag.t = setTimeout(() => { burst = false; persist(); changed(); }, 350);
    });
  }

  function init() {
    const ids = ['wm-overlay', 'wm-ov-file', 'wm-ov-choose', 'wm-ov-remove', 'wm-ov-thumb', 'wm-ov-name', 'wm-ov-meta', 'wm-ov-controls', 'wm-ov-on', 'wm-ov-size', 'wm-ov-size-val', 'wm-bw', 'wm-bw-art', 'wm-bw-imgbox', 'wm-bw-img', 'wm-bw-ov', 'wm-bw-safe', 'wm-bw-title', 'wm-bw-intro', 'wm-bw-note', 'wm-bw-source', 'wm-bw-size-note', 'wm-ov-error'];
    if (!ids.every(id => $(id))) return;
    ui = {overlay: $('wm-overlay'), file: $('wm-ov-file'), choose: $('wm-ov-choose'), remove: $('wm-ov-remove'), thumb: $('wm-ov-thumb'), name: $('wm-ov-name'), meta: $('wm-ov-meta'), controls: $('wm-ov-controls'), on: $('wm-ov-on'), size: $('wm-ov-size'), sizeVal: $('wm-ov-size-val'),
      bw: $('wm-bw'), art: $('wm-bw-art'), box: $('wm-bw-imgbox'), img: $('wm-bw-img'), ov: $('wm-bw-ov'), safe: $('wm-bw-safe'), title: $('wm-bw-title'), intro: $('wm-bw-intro'), note: $('wm-bw-note'), src: $('wm-bw-source'), sizeNote: $('wm-bw-size-note'), err: $('wm-ov-error'),
      lock: $('wm-ov-lock'), undo: $('wm-ov-undo'),
      views: [...document.querySelectorAll('[data-bwv]')], corners: [...document.querySelectorAll('[data-ovc]')]};
    const showErr = m => { ui.err.hidden = !m; ui.err.textContent = m || ''; };
    ui.choose.addEventListener('click', () => ui.file.click());
    ui.file.addEventListener('change', async () => {
      const f = ui.file.files && ui.file.files[0]; ui.file.value = ''; if (!f) return;
      showErr('');
      try { await importFile(f); changed(); } catch (e) { showErr(String(e && e.message || e)); }
    });
    ui.remove.addEventListener('click', () => { remove(); showErr(''); changed(); });
    ui.on.addEventListener('change', () => { S.on = ui.on.checked; persist(); changed(); });
    let sizeStart = null;
    ui.size.addEventListener('input', () => { if (S.locked) return; if (!sizeStart) sizeStart = snap(); S.wFrac = clamp(Number(ui.size.value) / 100, 0.05, 0.7); fit(); render(); });
    ui.size.addEventListener('change', () => { if (sizeStart) { pushHist(sizeStart); sizeStart = null; } persist(); changed(); });
    if (ui.lock) ui.lock.addEventListener('change', () => { S.locked = ui.lock.checked; persist(); changed(); });
    if (ui.undo) ui.undo.addEventListener('click', undo);
    ui.views.forEach(b => b.addEventListener('click', () => { view = b.dataset.bwv; render(); }));
    ui.corners.forEach(b => b.addEventListener('click', () => cornerClick(b.dataset.ovc)));
    $('wm-bw-refresh') && $('wm-bw-refresh').addEventListener('click', () => refreshBot(true));
    bindDrag();
    // Overlay Settings is a tab of the WebP Maker, next to Convert
    ui.tabM = $('wm-tab-main'); ui.tabO = $('wm-tab-overlay'); ui.page = $('wm-overlay-page'); ui.dot = $('wm-tab-dot'); ui.main = document.querySelector('#view-webpmaker .wm-layout');
    if (ui.tabM && ui.tabO && ui.page && ui.main) { ui.tabM.addEventListener('click', () => tab('main')); ui.tabO.addEventListener('click', () => tab('overlay')); }
    render(); refreshBot(true);
  }
  function tab(name) {
    if (!ui || !ui.tabM || !ui.tabO || !ui.page || !ui.main) return;
    const o = name === 'overlay';
    ui.main.hidden = o; ui.page.hidden = !o;
    ui.tabM.classList.toggle('on', !o); ui.tabO.classList.toggle('on', o);
    ui.tabM.setAttribute('aria-selected', String(!o)); ui.tabO.setAttribute('aria-selected', String(o));
    if (o) { render(); refreshBot(true); }
  }

  readyP = restore().then(() => { if (hasImage()) fit(); });
  const api = {
    draw, key, ready: () => readyP, hasImage, active,
    onChange: f => { if (typeof f === 'function') subs.push(f); },
    // webpmaker.js: the first frame of the first batch ({url, w, h} at the real output size), or null
    setFrame: f => { frame = f && f.url ? {url: String(f.url), w: num(f.w, 0), h: num(f.h, 0)} : null; if (hasImage()) { fit(); render(); } },
    // webpmaker.js: the finished WebP on screen (it already has the overlay in it), or '' for none
    setResult: u => { resultUrl = String(u || ''); render(); },
    showTab: n => tab(n),
    refresh: () => { render(); refreshBot(); },
    undo, state: () => ({on: S.on, locked: S.locked, canUndo: hist.length > 0, has: hasImage(), wFrac: S.wFrac, cx: S.cx, cy: S.cy}),
    _test: {S, limits, geometry, SLOT, corner, dims}
  };
  window.WebpOverlay = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => readyP.then(init)); else readyP.then(init);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) api.refresh(); });
  window.addEventListener('focus', () => api.refresh());
})();
