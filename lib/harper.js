'use strict';
/* Harper, built into the app (v1.4.1): Automattic's free, open-source grammar checker (Apache-2.0), shipped in vendor/harper and run on its
 * own thread (lib/harperWorker.mjs). Nothing to install, nothing sent anywhere, answers in a fraction of a second. It checks spelling,
 * capitalization, a / an, repeated words, agreement and other common grammar slips; a Grammar engine (LanguageTool, GECToR or the local AI)
 * adds to it. It can be switched off in Settings > Grammar engine.
 *   create({appDir, userData}) -> {status, setEnabled, check, stop} */
const fs = require('fs'), path = require('path');
const {Worker} = require('worker_threads');
// v1.4.2: when the app's own copy is missing (a build or upload that left out vendor/harper), the app gets the same files once from the npm
// registry (harper.js 2.13.0, about 30 MB) into its data folder, instead of going without Harper.
const HARPER_VERSION = '2.13.0', HARPER_TGZ = `https://registry.npmjs.org/harper.js/-/harper.js-${HARPER_VERSION}.tgz`;
const KEEP = /^dist\/(?:index\.js|binary\.js|BinaryModule-[^/]+\.js|harper_wasm_bg\.wasm)$|^LICENSE$/;

function create(o) {
  o = o || {};
  const shipped = path.join(o.appDir || path.join(__dirname, '..'), 'vendor', 'harper'), fetched = path.join(o.userData || o.appDir, 'harper'), cfgFile = path.join(o.userData || o.appDir, 'harper.json');
  const tgzUrl = o.tgzUrl || HARPER_TGZ;
  let worker = null, ready = null, seq = 0, lastError = '', idle = null, fetching = null;
  const pending = new Map();
  const cfg = () => { try { return Object.assign({enabled: true}, JSON.parse(fs.readFileSync(cfgFile, 'utf8'))); } catch (_) { return {enabled: true}; } };
  const saveCfg = c => { try { fs.mkdirSync(path.dirname(cfgFile), {recursive: true}); fs.writeFileSync(cfgFile, JSON.stringify(c)); } catch (_) { /* best effort */ } };
  const has = d => fs.existsSync(path.join(d, 'harper_wasm_bg.wasm')) && fs.existsSync(path.join(d, 'index.js')) && fs.existsSync(path.join(d, 'package.json'));
  const vendorDir = () => (has(shipped) ? shipped : has(fetched) ? fetched : '');
  function status() { return {available: !!vendorDir(), fetching: !!fetching, shipped: has(shipped), enabled: cfg().enabled, running: !!worker, error: lastError}; }
  // the app's own copy, or else the one fetched once into the data folder (fetched now when neither is there)
  function ensure() {
    if (vendorDir()) return Promise.resolve(vendorDir());
    if (fetching) return fetching;
    fetching = (async () => {
      const {fetchTo} = require('./localai'), {extractTgz} = require('./gector');
      const tmp = fetched + '_new', tgz = fetched + '.tgz';
      fs.rmSync(tmp, {recursive: true, force: true}); fs.rmSync(tgz, {force: true}); fs.mkdirSync(path.dirname(fetched), {recursive: true});
      try {
        await fetchTo(tgzUrl, tgz, () => {});
        await extractTgz(tgz, tmp, {strip: 1, filter: rel => KEEP.test(rel)});
        const dist = path.join(tmp, 'dist'); if (!fs.existsSync(dist)) throw new Error('The Harper download is incomplete.');
        for (const f of fs.readdirSync(dist)) fs.renameSync(path.join(dist, f), path.join(tmp, f));
        fs.rmdirSync(dist);
        const bm = fs.readdirSync(tmp).find(f => /^BinaryModule-.*\.js$/.test(f)); if (!bm) throw new Error('The Harper download is incomplete.');
        const bmPath = path.join(tmp, bm), code = fs.readFileSync(bmPath, 'utf8');   // the same Windows path fix as the app's own copy
        fs.writeFileSync(bmPath, code.replace('fs.readFile(new URL(binary).pathname, (err, data) => {', 'fs.readFile(decodeURIComponent(new URL(binary).pathname).replace(/^\\/([A-Za-z]:)/, "$1"), (err, data) => {'));
        fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({name: 'harper-vendored', private: true, type: 'module', description: `harper.js ${HARPER_VERSION} (Automattic, Apache-2.0), fetched because the app's own copy was missing.`}, null, 2));
        if (!has(tmp)) throw new Error('The Harper download is incomplete.');
        fs.rmSync(fetched, {recursive: true, force: true}); fs.renameSync(tmp, fetched);
        lastError = ''; return fetched;
      } catch (er) { fs.rmSync(tmp, {recursive: true, force: true}); lastError = `Harper could not be downloaded: ${er.message}`; throw new Error(lastError); }
      finally { fs.rmSync(tgz, {force: true}); }
    })();
    fetching.then(() => { fetching = null; }, () => { fetching = null; });
    return fetching;
  }
  function start() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      const vendor = vendorDir(); if (!vendor) return reject(new Error('Harper is missing.'));
      const w = new Worker(path.join(__dirname, 'harperWorker.mjs'), {workerData: {vendor}});
      worker = w;
      const fail = er => { lastError = String(er && er.message || er); for (const [, p] of pending) p.reject(new Error(lastError)); pending.clear(); if (worker === w) { worker = null; ready = null; } reject(new Error(lastError)); };
      w.on('message', m => {
        if (m && m.ready) return resolve();
        const p = m && pending.get(m.id); if (!p) return; pending.delete(m.id);
        if (m.ok) p.resolve(m.lints); else p.reject(new Error(m.error || 'Harper failed.'));
      });
      w.on('error', fail);
      w.on('exit', code => { if (worker === w) { worker = null; ready = null; } if (code) fail(new Error(`Harper stopped (code ${code}).`)); });
    });
    ready.catch(() => { ready = null; });
    return ready;
  }
  async function stop() { clearTimeout(idle); const w = worker; worker = null; ready = null; if (w) { try { await w.terminate(); } catch (_) { /* gone */ } } }
  function setEnabled(on) { const c = cfg(); c.enabled = !!on; saveCfg(c); if (!on) stop(); return status(); }
  async function check(text) {
    if (!cfg().enabled) return {ok: false, error: 'Harper is switched off.'};
    try {
      await ensure();
      await start();
      clearTimeout(idle); idle = setTimeout(() => { stop(); }, 30 * 60 * 1000); if (idle.unref) idle.unref();
      const id = ++seq;
      const lints = await new Promise((resolve, reject) => { pending.set(id, {resolve, reject}); worker.postMessage({id, text: String(text || '')}); setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('Harper took too long.')); } }, 30000); });
      lastError = ''; return {ok: true, matches: lints};
    } catch (er) { lastError = er.message; return {ok: false, error: er.message}; }
  }
  return {status, setEnabled, check, stop, ensure: () => ensure().then(() => status(), er => ({...status(), ok: false, error: er.message}))};
}
module.exports = {create};
