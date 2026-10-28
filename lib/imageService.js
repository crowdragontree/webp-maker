'use strict';
// PNG Compressor and picture reading for the Creator Tool. PNG files are compressed one at a time in a background worker and saved next to the original as <name>_compressed.png.
// A picture that is not a PNG arrives with its PNG bytes (the window turned it into one), so every picture format works the same way.
const fs = require('node:fs');
const path = require('node:path');
const {Worker} = require('node:worker_threads');
const PC = require('./pngCompress');
const IF = require('../renderer/imageformats.js');

function register({ipcMain, dialog, shell, app, getWindow, send, verify}) {
  let worker = null, seq = 0, cancelled = false;
  const made = new Set();
  const stopWorker = () => {
    if (!worker) return;
    const w = worker; worker = null;
    if (w._pending) w._pending({ok: false, file: w._file, error: 'Stopped.', stopped: true});
    try { w.terminate(); } catch { /* already stopped */ }
  };
  const runOne = (file, png, outFile) => new Promise(resolve => {
    if (!worker) {
      worker = new Worker(path.join(__dirname, 'pngCompressWorker.js'));
      const w0 = worker;
      w0.on('error', e => { if (worker === w0) worker = null; if (w0._pending) w0._pending({ok: false, file: w0._file, error: 'The compressor stopped: ' + e.message}); });
    }
    const id = ++seq, w = worker; w._file = file;
    const onMsg = m => { if (m.id !== id) return; if (m.step) { send('compress:progress', {file, step: m.step}); return; } w.off('message', onMsg); w._pending = null; resolve(m.result); };
    w._pending = r => { w.off('message', onMsg); resolve(r); };
    w.on('message', onMsg); w.postMessage({id, file, target: PC.TARGET, png, outFile});
  });
  ipcMain.handle('compress:pick', async event => {
    verify(event);
    const r = await dialog.showOpenDialog(getWindow(), {title: 'Choose pictures to compress', properties: ['openFile', 'multiSelections'], filters: [{name: 'Pictures', extensions: IF.DIALOG_EXTS}, {name: 'All files', extensions: ['*']}]});
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('compress:run', async (event, files) => {
    verify(event);
    const items = new Map();
    for (const f of (Array.isArray(files) ? files : [])) {
      const it = typeof f === 'string' ? {file: f} : f && typeof f.file === 'string' ? {file: f.file, png: f.png ? Buffer.from(f.png) : undefined} : null;
      if (it && it.file && !items.has(it.file)) items.set(it.file, it);
    }
    const list = [...items.keys()].slice(0, 500), out = [], used = new Set();
    const outFor = it => {
      if (/\.png$/i.test(it.file)) { used.add(PC.outPathFor(it.file).toLowerCase()); return undefined; }
      let o = PC.outPathFor(it.file); const p = path.parse(it.file);
      if (used.has(o.toLowerCase())) o = path.join(p.dir, `${p.name}_${p.ext.slice(1).toLowerCase()}_compressed.png`);
      used.add(o.toLowerCase()); return o;
    };
    cancelled = false;
    for (let i = 0; i < list.length; i++) {
      if (cancelled) { out.push(...list.slice(i).map(file => ({ok: false, file, error: 'Stopped before this one.', stopped: true}))); break; }
      send('compress:progress', {file: list[i], index: i, total: list.length, step: 'Starting'});
      let r;
      try { if (!fs.statSync(list[i]).isFile()) throw new Error('Not a file.'); const it = items.get(list[i]); r = await runOne(list[i], it.png, outFor(it)); }
      catch (e) { r = {ok: false, file: list[i], error: e.message}; }
      if (r.ok && r.outFile) made.add(path.resolve(r.outFile));
      out.push(r); send('compress:progress', {file: list[i], index: i, total: list.length, done: true, result: r});
    }
    return out;
  });
  ipcMain.handle('image:read', (event, file) => {
    verify(event);
    const f = path.resolve(String(file || '')), st = fs.statSync(f);
    if (!st.isFile()) throw new Error('Not a file.');
    if (st.size > 600e6) throw new Error('This file is too large (over 600 MB).');
    return fs.readFileSync(f);
  });
  ipcMain.handle('image:heicToPng', (event, bytes, name) => { verify(event); return require('./heic').toPng(Buffer.from(bytes), name); });
  ipcMain.handle('compress:cancel', event => { verify(event); cancelled = true; stopWorker(); return true; });
  ipcMain.handle('compress:show', (event, file) => {
    verify(event);
    const f = path.resolve(String(file || ''));
    if (!made.has(f) || !fs.existsSync(f)) return false;
    shell.showItemInFolder(f); return true;
  });
  app.on('before-quit', stopWorker);
  return {stopWorker, busy: () => !!worker && !!worker._pending};
}
module.exports = {register};
