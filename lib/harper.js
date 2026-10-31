'use strict';
/* Harper, built into the app (v1.4.1): Automattic's free, open-source grammar checker (Apache-2.0), shipped in vendor/harper and run on its
 * own thread (lib/harperWorker.mjs). Nothing to install, nothing sent anywhere, answers in a fraction of a second. It checks spelling,
 * capitalization, a / an, repeated words, agreement and other common grammar slips; a Grammar engine (LanguageTool, GECToR or the local AI)
 * adds to it. It can be switched off in Settings > Grammar engine.
 *   create({appDir, userData}) -> {status, setEnabled, check, stop} */
const fs = require('fs'), path = require('path');
const {Worker} = require('worker_threads');

function create(o) {
  o = o || {};
  const vendor = path.join(o.appDir || path.join(__dirname, '..'), 'vendor', 'harper'), cfgFile = path.join(o.userData || o.appDir, 'harper.json');
  let worker = null, ready = null, seq = 0, lastError = '', idle = null;
  const pending = new Map();
  const cfg = () => { try { return Object.assign({enabled: true}, JSON.parse(fs.readFileSync(cfgFile, 'utf8'))); } catch (_) { return {enabled: true}; } };
  const saveCfg = c => { try { fs.mkdirSync(path.dirname(cfgFile), {recursive: true}); fs.writeFileSync(cfgFile, JSON.stringify(c)); } catch (_) { /* best effort */ } };
  const present = () => fs.existsSync(path.join(vendor, 'harper_wasm_bg.wasm')) && fs.existsSync(path.join(vendor, 'index.js'));
  function status() { return {available: present(), enabled: cfg().enabled, running: !!worker, error: lastError}; }
  function start() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      if (!present()) return reject(new Error('Harper is missing from the app folder.'));
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
      await start();
      clearTimeout(idle); idle = setTimeout(() => { stop(); }, 30 * 60 * 1000); if (idle.unref) idle.unref();
      const id = ++seq;
      const lints = await new Promise((resolve, reject) => { pending.set(id, {resolve, reject}); worker.postMessage({id, text: String(text || '')}); setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('Harper took too long.')); } }, 30000); });
      lastError = ''; return {ok: true, matches: lints};
    } catch (er) { lastError = er.message; return {ok: false, error: er.message}; }
  }
  return {status, setEnabled, check, stop};
}
module.exports = {create};
