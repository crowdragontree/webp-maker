// PNG Compressor tab (v1.2.6). The work happens in the app's background worker (lib/pngCompress.js); this file is the list you see.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const base = f => String(f || '').split(/[\\/]/).pop();
  const size = n => n >= 1e6 ? (n / 1e6).toFixed(2) + ' MB' : n >= 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' bytes';
  const LABEL = {lossless: 'LOSSLESS', near: 'NEAR-LOSSLESS', colors: '256 COLOURS', resized: 'SCALED DOWN'};
  let rows = [], busy = false;

  function paint() {
    const list = $('pc-list'); if (!list) return;
    list.innerHTML = rows.map((r, i) => {
      const res = r.result;
      if (!res) return `<div class="pc-item"><div class="pc-name" title="${esc(r.file)}">${esc(base(r.file))}</div><div class="pc-size"><span class="pc-badge pc-wait">${r.step ? 'WORKING' : 'WAITING'}</span></div>${r.step ? `<div class="pc-note">${esc(r.step)}…</div>` : ''}</div>`;
      if (!res.ok) return `<div class="pc-item"><div class="pc-name" title="${esc(r.file)}">${esc(base(r.file))}</div><div class="pc-size"><span class="pc-badge pc-error">${res.stopped ? 'STOPPED' : 'NOT SAVED'}</span></div><div class="pc-note">${esc(res.error)}</div></div>`;
      const pct = Math.round(100 * (1 - res.outBytes / res.inBytes));
      return `<div class="pc-item"><div class="pc-name" title="${esc(res.outFile)}"><span class="pc-badge pc-${esc(res.method)}">${LABEL[res.method] || ''}${res.within ? ' ±' + res.within : ''}</span>${esc(base(res.outFile))}</div>
        <div class="pc-size">${size(res.inBytes)} → <b>${size(res.outBytes)}</b>${pct > 0 ? ` (−${pct}%)` : ''} <button class="ghost sm" type="button" data-pc-show="${i}">Show in folder</button></div>
        <div class="pc-note">${res.converted ? 'Turned into a PNG first. ' : ''}${esc(res.note)}${res.newWidth !== res.width || res.newHeight !== res.height ? ` Was ${res.width} × ${res.height}.` : ''}</div></div>`;
    }).join('');
    const done = rows.filter(r => r.result), ok = done.filter(r => r.result.ok);
    $('pc-status').textContent = busy ? `Compressing ${Math.min(done.length + 1, rows.length)} of ${rows.length}…` : rows.length ? `${ok.length} of ${rows.length} saved${done.length - ok.length ? `, ${done.length - ok.length} not saved` : ''}.` : '';
    $('pc-stop').hidden = !busy; $('pc-clear').hidden = busy || !rows.length;
    const dz = $('pc-drop'); if (dz) dz.setAttribute('aria-disabled', busy ? 'true' : 'false');
  }

  // entries: {path, file?}. A PNG goes by its path. Any other picture (JPG, WebP, GIF, BMP, TIFF, AVIF, HEIC, SVG, ICO...) is turned into PNG here first and its bytes go with it.
  const IFm = () => window.ImageFormats;
  async function bytesOf(e) { return e.file ? new Uint8Array(await e.file.arrayBuffer()) : new Uint8Array(await window.juicyApp.imageRead(e.path)); }
  async function run(entries) {
    if (busy) return;
    const seen = new Set(), list = entries.filter(e => e && e.path && !seen.has(e.path) && seen.add(e.path));
    const IF = IFm(), items = [], bad = [];
    rows = rows.filter(r => r.result);
    for (const e of list) {
      const isPng = /\.png$/i.test(e.path);
      if (!isPng && !IF.isImageName(e.path)) {       // no known ending: look at what the file really is
        let kind = ''; try { kind = IF.sniff((await bytesOf(e)).subarray(0, 64)); } catch (_) { /* below */ }
        if (!kind) { rows.push({file: e.path, result: {ok: false, file: e.path, error: 'This is not a picture format the compressor knows.'}}); continue; }
      }
      rows.push({file: e.path, step: isPng ? '' : 'Opening the picture'}); items.push({e, isPng});
    }
    if (!items.length) return paint();
    busy = true; paint();
    try {
      const send = [];
      for (const it of items) {
        const row = rows.find(r => r.file === it.e.path && !r.result); if (!row) continue;
        if (it.isPng) { send.push(it.e.path); continue; }
        try {
          const bytes = await bytesOf(it.e), name = it.e.path.split(/[\\/]/).pop();
          const kind = IF.sniff(bytes);
          const png = kind === 'png' ? bytes : await IF.toPngBytes(new File([bytes], name), {heic: (b, n) => window.juicyApp.imageHeicToPng(b, n)});
          row.step = ''; send.push({file: it.e.path, png: kind === 'png' && /\.png$/i.test(it.e.path) ? undefined : png});
        } catch (err) { row.result = {ok: false, file: it.e.path, error: err && err.message ? err.message : String(err)}; }
        paint();
      }
      if (send.length) await window.juicyApp.compressRun(send);
    }
    catch (e) { for (const r of rows) if (!r.result) r.result = {ok: false, file: r.file, error: e.message || String(e)}; }
    finally { busy = false; for (const r of rows) if (!r.result) r.result = {ok: false, file: r.file, error: 'Stopped before this one.', stopped: true}; paint(); }
  }

  function init() {
    const dz = $('pc-drop'); if (!dz || !window.juicyApp || !window.juicyApp.compressRun) return;
    window.juicyApp.onCompressProgress(d => {
      const r = rows.find(x => x.file === d.file && !x.result); if (!r) return;
      if (d.done) r.result = d.result; else if (d.step) r.step = d.step;
      paint();
    });
    const pick = async () => { if (busy) return; const files = await window.juicyApp.compressPick(); if (files && files.length) run(files.map(path => ({path}))); };
    dz.addEventListener('click', pick);
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    dz.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = busy ? 'none' : 'copy'; dz.classList.add('wm-hover'); } });
    dz.addEventListener('dragleave', () => dz.classList.remove('wm-hover'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('wm-hover'); if (busy) return; run([...(e.dataTransfer?.files || [])].map(f => ({path: window.juicyApp.pathForFile(f), file: f}))); });
    $('pc-stop').addEventListener('click', () => window.juicyApp.compressCancel());
    $('pc-clear').addEventListener('click', () => { rows = []; paint(); });
    $('pc-list').addEventListener('click', e => { const b = e.target.closest('[data-pc-show]'); if (!b) return; const r = rows[+b.dataset.pcShow]; if (r && r.result && r.result.outFile) window.juicyApp.compressShow(r.result.outFile); });
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
