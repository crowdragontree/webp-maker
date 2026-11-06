'use strict';
// v1.5.1: the Analytics tab. When the JuicyChat Analytics Tool is installed on this computer, the Creator Tool runs that app's own
// analytics code (its core/analytics.js and its window, renderer/index.html), straight from the Analytics Tool's folder. So whatever
// an Analytics Tool update changes shows here too, without updating the Creator Tool. When it is not installed, nothing of it shows.
// The Creator Tool keeps its own JuicyChat sign-in and its own data (in its own data folder, "analytics"), separate from the
// Analytics Tool's. Both use the Analytics Tool's lock file, so the two apps never pull from JuicyChat at the same time.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const ANALYTICS_APP = 'JuicyChat Analytics Tool';

function create({appDataDir, userData, send, copyText, scanBounds, log = () => {}}) {
  const sharedDir = path.join(appDataDir, ANALYTICS_APP, 'shared');
  const recordFile = path.join(sharedDir, 'installed.json');
  let loaded = null;          // {appDir, version, core}
  let watcher = null, swapping = false;

  // The Analytics Tool writes installed.json each time it starts: where its files are and which version it is.
  function installed() {
    try {
      const rec = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
      const appDir = String(rec.appDir || '');
      if (!appDir || !path.isAbsolute(appDir)) return null;
      const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
      if (pkg.name !== 'juicychat-analytics') return null;
      for (const f of ['core/analytics.js', 'renderer/index.html']) if (!fs.existsSync(path.join(appDir, f))) return null;
      return {appDir, version: String(pkg.version || '')};
    } catch { return null; }
  }
  function unload() {
    if (!loaded) return;
    try { loaded.core.dispose(); } catch (e) { log('analytics dispose', e); }
    const root = loaded.appDir + path.sep;
    for (const k of Object.keys(require.cache)) if (k.startsWith(root)) delete require.cache[k];
    loaded = null;
  }
  function load(found) {
    const {create: createCore} = require(path.join(found.appDir, 'core', 'analytics.js'));
    const core = createCore({userData: path.join(userData, 'analytics'), sharedDir, appName: 'JuicyChat Creator Tool', host: 'creator',
      send: (channel, payload) => send('analytics:event', {channel, payload}), copyText, scanBounds});
    loaded = {...found, core};
  }
  // look again: installed, removed, moved or updated since last time
  function refresh() {
    const found = installed();
    const same = found && loaded && found.appDir === loaded.appDir && found.version === loaded.version;
    if (same || (!found && !loaded)) return false;
    if (loaded && loaded.core.busy()) return false;          // a pull is running: switch over once it is done
    swapping = true;
    try { unload(); if (found) load(found); }
    catch (e) { log('analytics load failed', e); unload(); }
    finally { swapping = false; }
    send('analytics:changed', info());
    return true;
  }
  function info() {
    if (!loaded) return {installed: false};
    return {installed: true, version: loaded.version, pageUrl: pathToFileURL(path.join(loaded.appDir, 'renderer', 'index.html')).href};
  }
  async function invoke(method, args) {
    if (!loaded || swapping) throw new Error('The JuicyChat Analytics Tool is not installed on this computer.');
    const fn = loaded.core.methods[method];
    if (typeof method !== 'string' || !Object.prototype.hasOwnProperty.call(loaded.core.methods, method) || typeof fn !== 'function') throw new Error('Unknown analytics action.');
    return fn(...(Array.isArray(args) ? args : []));
  }
  function start() {
    refresh();
    watcher = setInterval(() => { try { refresh(); } catch (e) { log('analytics refresh', e); } }, 10000);
    if (watcher.unref) watcher.unref();
  }
  function dispose() { clearInterval(watcher); unload(); }
  return {start, refresh, info, invoke, dispose, busy: () => !!(loaded && loaded.core.busy())};
}
module.exports = {create};
