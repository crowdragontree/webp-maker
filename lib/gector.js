'use strict';
/* GECToR, installed and run by the app (v1.4.0). A small grammar-correction model (GECToR, "Tag, Not Rewrite") that runs only on this computer:
 * no credits, nothing sent anywhere. It is the other choice in Settings > Grammar engine (LanguageTool is the first); only one is installed at a time.
 * Install = one button: the app downloads
 *   - ONNX Runtime (Microsoft, MIT) from the npm registry: the engine that runs the model (only the part for this computer is kept), and
 *   - DeepQuill's English GECToR model for fiction (Apache-2.0) from Hugging Face: model.onnx, tokenizer.json, labels.json, verb-form-vocab.txt,
 * into <app folder>/gector (or the app's data folder when the app folder cannot be written). Remove = delete that folder.
 * The model runs in its own small process (lib/gectorWorker.js) that starts when a check needs it and stops after 15 idle minutes.
 *   create({appDir, userData, urls}) -> {status, install, remove, setEnabled, check, stop}  (urls exist so the tests can stand in for the network) */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const {fork} = require('child_process');
const {download} = require('./languagetool');

const ORT_VERSION = '1.22.0';
const URLS = {
  ort: `https://registry.npmjs.org/onnxruntime-node/-/onnxruntime-node-${ORT_VERSION}.tgz`,
  common: `https://registry.npmjs.org/onnxruntime-common/-/onnxruntime-common-${ORT_VERSION}.tgz`,
  model: 'https://huggingface.co/deepquillapp/gector-grammar/resolve/main/'
};
const MODEL_FILES = ['tokenizer.json', 'labels.json', 'verb-form-vocab.txt', 'model.onnx'];
const IDLE_MS = 15 * 60 * 1000;
const PLAT = `${process.platform}/${process.arch}`;

// ---------------------------------------------------------------- a small .tgz reader (no packages), streamed so a 90 MB download never sits in memory at once
function extractTgz(file, dest, opts) {
  opts = opts || {}; const strip = opts.strip || 0, keep = opts.filter || (() => true), root = path.resolve(dest);
  return new Promise((resolve, reject) => {
    const gz = zlib.createGunzip(), input = fs.createReadStream(file);
    let buf = Buffer.alloc(0), state = 'header', remaining = 0, pad = 0, cur = null, longName = null, paxPath = null, failed = false;
    const fail = er => { if (failed) return; failed = true; input.destroy(); gz.destroy(); reject(er); };
    const cstr = (b, o, l) => { const s = b.subarray(o, o + l), z = s.indexOf(0); return s.toString('utf8', 0, z < 0 ? l : z); };
    const finish = () => {
      if (!cur) return;
      const data = Buffer.concat(cur.chunks);
      if (cur.kind === 'L') longName = data.toString('utf8').replace(/\0+$/, '');
      else if (cur.kind === 'x') { const m = /\d+ path=([^\n]*)\n/.exec(data.toString('utf8')); if (m) paxPath = m[1]; }
      else if (cur.kind === 'file') { fs.mkdirSync(path.dirname(cur.target), {recursive: true}); fs.writeFileSync(cur.target, data); }
      cur = null;
    };
    function pump() {
      for (;;) {
        if (state === 'data') {
          if (!buf.length) return;
          const take = Math.min(remaining, buf.length); if (cur) cur.chunks.push(Buffer.from(buf.subarray(0, take)));
          buf = buf.subarray(take); remaining -= take;
          if (remaining) return;
          finish(); state = pad ? 'pad' : 'header'; continue;
        }
        if (state === 'pad') { const t = Math.min(pad, buf.length); buf = buf.subarray(t); pad -= t; if (pad) return; state = 'header'; continue; }
        if (buf.length < 512) return;
        const h = buf.subarray(0, 512); buf = buf.subarray(512);
        if (h.every(b => b === 0)) continue;
        const type = String.fromCharCode(h[156] || 48), size = parseInt(cstr(h, 124, 12).trim() || '0', 8) || 0, prefix = cstr(h, 345, 155);
        let name = cstr(h, 0, 100); if (prefix && h.toString('latin1', 257, 262) === 'ustar') name = prefix + '/' + name;
        if (longName) { name = longName; longName = null; } if (paxPath) { name = paxPath; paxPath = null; }
        remaining = size; pad = (512 - (size % 512)) % 512; cur = null;
        if (type === 'L') cur = {kind: 'L', chunks: []};
        else if (type === 'x') cur = {kind: 'x', chunks: []};
        else if (type === '0' || type === '\0' || type === '7') {
          const rel = name.replace(/\\/g, '/').split('/').filter(Boolean).slice(strip).join('/');
          if (rel && keep(rel)) {
            const target = path.resolve(root, ...rel.split('/'));
            if (target !== root && !target.startsWith(root + path.sep)) throw new Error('The download tries to write outside its folder; stopped.');
            cur = {kind: 'file', target, chunks: []};
          }
        }
        if (!size) { finish(); state = 'header'; continue; }
        state = 'data';
      }
    }
    gz.on('data', c => { if (failed) return; buf = buf.length ? Buffer.concat([buf, c]) : c; try { pump(); } catch (er) { fail(er); } });
    gz.on('end', () => { if (!failed) resolve(); });
    gz.on('error', er => fail(new Error('The download is damaged (' + er.message + ').')));
    input.on('error', fail);
    input.pipe(gz);
  });
}

function create(o) {
  o = o || {};
  const appDir = o.appDir, userData = o.userData, urls = Object.assign({}, URLS, o.urls || {});
  const roots = [appDir && path.join(appDir, 'gector'), userData && path.join(userData, 'gector')].filter(Boolean).filter((r, i, a) => a.indexOf(r) === i);
  const cfgFile = path.join(userData || appDir, 'gector.json');
  let child = null, loading = null, idle = null, busy = false, lastError = '', seq = 0, stderr = '';
  const pending = new Map();

  const cfg = () => { try { return Object.assign({enabled: true}, JSON.parse(fs.readFileSync(cfgFile, 'utf8'))); } catch (_) { return {enabled: true}; } };
  const saveCfg = c => { try { fs.mkdirSync(path.dirname(cfgFile), {recursive: true}); fs.writeFileSync(cfgFile, JSON.stringify(c)); } catch (_) { /* best effort */ } };
  const binding = r => path.join(r, 'runtime', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', process.platform, process.arch, 'onnxruntime_binding.node');
  const complete = r => fs.existsSync(binding(r)) && MODEL_FILES.every(f => fs.existsSync(path.join(r, 'model', f)));
  const installedRoot = () => roots.find(complete) || '';
  const writable = r => { try { fs.mkdirSync(r, {recursive: true}); const t = path.join(r, '.w'); fs.writeFileSync(t, '1'); fs.unlinkSync(t); return true; } catch (_) { return false; } };
  const canWrite = r => { let d = r; for (let i = 0; i < 12; i++) { try { if (fs.statSync(d).isDirectory()) { fs.accessSync(d, fs.constants.W_OK); return true; } return false; } catch (_) { const up = path.dirname(d); if (up === d) return false; d = up; } } return false; };
  const sizeOf = r => { let n = 0; const walk = d => { let l = []; try { l = fs.readdirSync(d, {withFileTypes: true}); } catch (_) { return; } for (const x of l) { const p = path.join(d, x.name); if (x.isDirectory()) walk(p); else { try { n += fs.statSync(p).size; } catch (_) { /* gone */ } } } }; walk(r); return n; };

  function status() {
    const root = installedRoot();
    return {installed: !!root, enabled: cfg().enabled, running: !!child, busy, root: root || '', target: root || roots.find(canWrite) || roots[0], sizeMb: root ? Math.round(sizeOf(root) / 1048576) : 0, error: lastError, platformOk: ['win32/x64', 'win32/arm64', 'linux/x64', 'linux/arm64', 'darwin/x64', 'darwin/arm64'].includes(PLAT)};
  }

  // ---- the worker process
  function call(op, payload, timeout) {
    return new Promise((resolve, reject) => {
      if (!child) return reject(new Error('GECToR is not running.'));
      const id = ++seq, t = setTimeout(() => { pending.delete(id); reject(new Error('GECToR took too long to answer.')); }, timeout || 120000);
      pending.set(id, {resolve: x => { clearTimeout(t); resolve(x); }, reject: er => { clearTimeout(t); reject(er); }});
      try { child.send(Object.assign({id, op}, payload || {})); } catch (er) { pending.delete(id); clearTimeout(t); reject(er); }
    });
  }
  function start() {
    if (child && !loading) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      const root = installedRoot(); if (!root) throw new Error('GECToR is not installed.');
      stderr = '';
      const ch = fork(path.join(__dirname, 'gectorWorker.js'), [], {env: Object.assign({}, process.env, {ELECTRON_RUN_AS_NODE: '1'}), stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true});
      child = ch;
      if (ch.stderr) ch.stderr.on('data', d => { stderr = (stderr + d).slice(-2000); });
      ch.on('message', m => { const p = m && pending.get(m.id); if (!p) return; pending.delete(m.id); if (m.ok) p.resolve(m); else p.reject(new Error(m.error || 'GECToR failed.')); });
      ch.on('exit', code => {
        if (child === ch) child = null;
        const why = new Error(`GECToR stopped${code ? ` (code ${code})` : ''}.${stderr.trim() ? ' ' + stderr.trim().split('\n').slice(-2).join(' ') : ''}`);
        for (const [id, p] of pending) { pending.delete(id); p.reject(why); }
      });
      ch.on('error', er => { lastError = er.message; });
      await call('load', {dir: path.join(root, 'model'), runtime: path.join(root, 'runtime')}, 180000);
    })();
    const done = () => { loading = null; };
    loading.then(done, er => { done(); stop(); lastError = er.message; });
    return loading;
  }
  async function stop() {
    clearTimeout(idle); idle = null;
    const ch = child; child = null;
    if (ch) { try { ch.kill(); } catch (_) { /* already gone */ } }
  }
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => { stop(); }, IDLE_MS); if (idle.unref) idle.unref(); };

  // ---- install / remove
  async function install(emit) {
    if (busy) throw new Error('An install is already running.');
    busy = true; lastError = ''; emit = emit || (() => {});
    const say = (phase, pct, msg) => { try { emit({phase, pct, msg}); } catch (_) { /* a closed window must not stop the install */ } };
    let root = '';
    try {
      await stop();
      if (!status().platformOk) throw new Error(`GECToR's engine has no version for this computer (${PLAT}).`);
      root = roots.find(writable); if (!root) throw new Error('Neither the app folder nor the data folder can be written to.');
      const tmp = path.join(root, '_download'); fs.rmSync(tmp, {recursive: true, force: true}); fs.mkdirSync(tmp, {recursive: true});
      // 1) the engine (ONNX Runtime): only this computer's part of it is kept
      say('runtime', 0, 'Downloading the engine (ONNX Runtime, about 90 MB)…');
      const rf = path.join(tmp, 'ort.tgz'), cf = path.join(tmp, 'common.tgz');
      await download(urls.ort, rf, (f, b) => say('runtime', f * 0.2, `Downloading the engine… ${Math.round(b / 1048576)} MB`));
      await download(urls.common, cf, () => {});
      say('runtime', 0.2, 'Unpacking the engine…');
      const rt = path.join(root, '_rt_new'); fs.rmSync(rt, {recursive: true, force: true});
      const binDir = `bin/napi-v6/${PLAT}/`;
      await extractTgz(rf, path.join(rt, 'node_modules', 'onnxruntime-node'), {strip: 1, filter: rel => rel === 'package.json' || rel.startsWith('dist/') || rel.startsWith(binDir)});
      await extractTgz(cf, path.join(rt, 'node_modules', 'onnxruntime-common'), {strip: 1, filter: rel => rel === 'package.json' || rel.startsWith('dist/')});
      if (!fs.existsSync(path.join(rt, 'node_modules', 'onnxruntime-node', binDir, 'onnxruntime_binding.node'))) throw new Error(`The engine download has no part for this computer (${PLAT}).`);
      fs.rmSync(rf, {force: true}); fs.rmSync(cf, {force: true});
      // 2) the model
      const md = path.join(root, '_model_new'); fs.rmSync(md, {recursive: true, force: true}); fs.mkdirSync(md, {recursive: true});
      for (const f of MODEL_FILES) {
        const big = f === 'model.onnx', lo = big ? 0.3 : 0.22, hi = big ? 0.9 : 0.3;
        say('model', lo, big ? 'Downloading the GECToR model (about 250 MB)…' : `Downloading ${f}…`);
        await download(urls.model + f, path.join(md, f), (fr, b) => say('model', big ? lo + fr * (hi - lo) : lo, big ? `Downloading the GECToR model… ${Math.round(b / 1048576)} MB` : `Downloading ${f}…`));
      }
      for (const f of ['tokenizer.json', 'labels.json']) { try { JSON.parse(fs.readFileSync(path.join(md, f), 'utf8')); } catch (_) { throw new Error(`The model's ${f} did not download properly. Try again.`); } }
      if (fs.statSync(path.join(md, 'model.onnx')).size < 1e6) throw new Error('The model did not download properly (model.onnx is too small). Try again.');
      // 3) swap in, then test it on a sample sentence before calling it installed
      for (const [from, to] of [[rt, 'runtime'], [md, 'model']]) { const d = path.join(root, to); fs.rmSync(d, {recursive: true, force: true}); fs.renameSync(from, d); }
      fs.rmSync(tmp, {recursive: true, force: true});
      say('test', 0.92, 'Testing GECToR on a sample sentence…');
      await start();
      await call('check', {text: 'She go to the store yesterday and buy a apple.', tense: ''}, 120000);
      touch();
      const c = cfg(); c.enabled = true; saveCfg(c);
      say('done', 1, 'GECToR is installed.');
      return status();
    } catch (er) {
      lastError = er && er.message || String(er); await stop();
      if (root) for (const d of ['runtime', 'model', '_download', '_rt_new', '_model_new']) { try { fs.rmSync(path.join(root, d), {recursive: true, force: true}); } catch (_) { /* removed next time */ } }
      say('error', 0, lastError); throw er;
    } finally { busy = false; }
  }
  async function remove() {
    await stop();
    for (const r of roots) for (const d of ['runtime', 'model', '_download', '_rt_new', '_model_new']) { try { fs.rmSync(path.join(r, d), {recursive: true, force: true}); } catch (_) { /* removed next time */ } }
    for (const r of roots) { try { fs.rmdirSync(r); } catch (_) { /* not empty or already gone */ } }
    lastError = ''; return status();
  }
  function setEnabled(on) { const c = cfg(); c.enabled = !!on; saveCfg(c); if (!on) stop(); return status(); }

  // text -> {ok, matches:[{offset, length, message, replacements, rule, single, before, after}]}. opts.tense: 'past' | 'present' | '' (the narration tense you chose)
  async function check(text, opts) {
    opts = opts || {};
    if (!cfg().enabled) return {ok: false, error: 'GECToR is switched off.'};
    if (!installedRoot()) return {ok: false, error: 'GECToR is not installed.'};
    try {
      await start(); touch();
      const r = await call('check', {text: String(text), tense: opts.tense || ''}, 120000);
      return {ok: true, matches: r.matches || []};
    } catch (er) { lastError = er.message; return {ok: false, error: er.message}; }
  }
  return {status, install, remove, setEnabled, check, stop, roots};
}
module.exports = {create, extractTgz, URLS, MODEL_FILES, ORT_VERSION};
