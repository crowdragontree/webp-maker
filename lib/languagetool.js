'use strict';
/* LanguageTool, installed and run by the app (v1.2.0). LanguageTool is a free grammar and style checker (LGPL). It is rules, not AI: it costs no credits.
 * It runs only on this computer: the app starts it on 127.0.0.1 (never reachable from the network) and asks it to check a text. Nothing is stored by the app or sent anywhere.
 * Install = one button in Settings: the app downloads LanguageTool (about 200 MB) and, only if this computer has no Java 17+, a small portable Java, into
 * <app folder>/languagetool (or the app's data folder when the app folder cannot be written). Remove = delete that folder.
 *   create({appDir, userData, urls, launcher}) -> {status, install, remove, setEnabled, check, stop}  (urls and launcher exist so the tests can stand in for the network and for Java) */
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net'), http = require('http'), https = require('https'), zlib = require('zlib');
const {spawn, spawnSync, execFileSync} = require('child_process');

const LT_URL = 'https://languagetool.org/download/LanguageTool-stable.zip';
const jreUrl = (plat, arch) => `https://api.adoptium.net/v3/binary/latest/17/ga/${plat}/${arch}/jre/hotspot/normal/eclipse`;
const MIN_JAVA = 17, IDLE_MS = 15 * 60 * 1000;
const JAVA_BIN = process.platform === 'win32' ? 'java.exe' : 'java';

// ---------------------------------------------------------------- a small zip reader (no packages): central directory, then each entry inflated on its own
function unzip(file, dest, opts) {
  opts = opts || {}; const strip = opts.strip || 0, onProgress = opts.onProgress || (() => {});
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size, tailLen = Math.min(size, 65557), tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let e = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('This is not a zip file (or it is damaged).');
    let count = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
    if (count === 0xffff || cdOff === 0xffffffff) throw new Error('This zip is too large for the built-in reader.');
    const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
    const root = path.resolve(dest); fs.mkdirSync(root, {recursive: true});
    let p = 0, done = 0;
    for (let n = 0; n < count; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('The zip is damaged (bad directory).');
      const method = cd.readUInt16LE(p + 10), csize = cd.readUInt32LE(p + 20), usize = cd.readUInt32LE(p + 24), nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
      const ext = cd.readUInt32LE(p + 38), off = cd.readUInt32LE(p + 42), name = cd.toString('utf8', p + 46, p + 46 + nl);
      p += 46 + nl + xl + cl;
      const parts = name.replace(/\\/g, '/').split('/').filter(Boolean).slice(strip); if (!parts.length) { done++; continue; }
      const target = path.resolve(root, ...parts);
      if (target !== root && !target.startsWith(root + path.sep)) throw new Error('The zip tries to write outside its folder; stopped.');
      if (name.endsWith('/')) { fs.mkdirSync(target, {recursive: true}); done++; continue; }
      const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, off);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('The zip is damaged (bad entry).');
      const start = off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const comp = Buffer.alloc(csize); if (csize) fs.readSync(fd, comp, 0, csize, start);
      const data = method === 0 ? comp : method === 8 ? zlib.inflateRawSync(comp) : null;
      if (!data) throw new Error('The zip uses a method the reader does not know.');
      if (data.length !== usize) throw new Error('The zip is damaged (size mismatch).');
      fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, data);
      const mode = (ext >>> 16) & 0o777; if (mode && process.platform !== 'win32') { try { fs.chmodSync(target, mode); } catch (_) { /* keep the default */ } }
      if (++done % 25 === 0) onProgress(done / count);
    }
    onProgress(1);
  } finally { fs.closeSync(fd); }
}

// ---------------------------------------------------------------- download with progress and redirects
function download(url, file, onProgress, hops) {
  return new Promise((resolve, reject) => {
    if ((hops || 0) > 8) return reject(new Error('Too many redirects while downloading.'));
    if (/^file:/.test(url)) { try { fs.copyFileSync(new URL(url), file); onProgress(1, fs.statSync(file).size); resolve(); } catch (er) { reject(er); } return; }   // tests
    const lib = /^http:/.test(url) ? http : https;
    const req = lib.get(url, {headers: {'User-Agent': 'JuicyBlueprintStudio'}}, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) { res.resume(); return resolve(download(new URL(res.headers.location, url).toString(), file, onProgress, (hops || 0) + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`The download server answered ${res.statusCode}.`)); }
      const total = +res.headers['content-length'] || 0; let got = 0; const out = fs.createWriteStream(file);
      res.on('data', c => { got += c.length; onProgress(total ? got / total : 0, got); });
      res.on('error', reject); out.on('error', reject); out.on('finish', () => resolve());
      res.pipe(out);
    });
    req.on('error', reject); req.setTimeout(60000, () => req.destroy(new Error('The download stalled (no data for 60 seconds).')));
  });
}

function findFile(dir, base, depth) {
  if (depth < 0) return '';
  let list = []; try { list = fs.readdirSync(dir, {withFileTypes: true}); } catch (_) { return ''; }
  for (const d of list) if (d.isFile() && d.name === base && path.basename(dir) === 'bin') return path.join(dir, d.name);
  for (const d of list) if (d.isDirectory()) { const r = findFile(path.join(dir, d.name), base, depth - 1); if (r) return r; }
  return '';
}
function javaMajor(cmd) {
  try { const r = spawnSync(cmd, ['-version'], {timeout: 8000, encoding: 'utf8', windowsHide: true}); return parseMajor(String(r.stderr || '') + String(r.stdout || '')); }   // java prints its version on stderr
  catch (_) { return 0; }
}
function parseMajor(out) {
  const m = /version "(\d+)(?:\.(\d+))?/.exec(out); if (!m) return 0;
  return +m[1] === 1 ? +m[2] || 0 : +m[1];
}
function freePort() { return new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }
function request(port, method, urlPath, body, timeout) {
  return new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port, path: urlPath, method, headers: body ? {'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body)} : {}}, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { const t = Buffer.concat(chunks).toString('utf8'); if (res.statusCode !== 200) return reject(new Error(`LanguageTool answered ${res.statusCode}: ${t.slice(0, 160)}`)); try { resolve(JSON.parse(t)); } catch (_) { reject(new Error('LanguageTool sent something unreadable.')); } });
    });
    req.on('error', reject); req.setTimeout(timeout || 20000, () => req.destroy(new Error('LanguageTool took too long to answer.')));
    if (body) req.write(body); req.end();
  });
}

// What is turned off because it is noise in character-card text (asterisk actions, quotes, dashes, brackets, spacing): the app has its own checks for these.
const OFF_RULES = ['WHITESPACE_RULE', 'COMMA_PARENTHESIS_WHITESPACE', 'UNPAIRED_BRACKETS', 'EN_UNPAIRED_BRACKETS', 'EN_QUOTES', 'DASH_RULE', 'DOUBLE_PUNCTUATION', 'SENTENCE_WHITESPACE', 'PUNCTUATION_PARAGRAPH_END', 'ELLIPSIS', 'MULTIPLICATION_SIGN', 'ENGLISH_WORD_REPEAT_BEGINNING_RULE'];
const OFF_CATS = ['TYPOGRAPHY'];

function create(o) {
  o = o || {};
  const appDir = o.appDir, userData = o.userData, urls = Object.assign({lt: LT_URL}, o.urls || {});
  const roots = [path.join(appDir || userData, 'languagetool'), path.join(userData || appDir, 'languagetool')].filter((r, i, a) => a.indexOf(r) === i);
  const cfgFile = path.join(userData || appDir, 'languagetool.json');
  let child = null, port = 0, starting = null, idle = null, busy = false, lastError = '';

  const cfg = () => { try { return Object.assign({enabled: true}, JSON.parse(fs.readFileSync(cfgFile, 'utf8'))); } catch (_) { return {enabled: true}; } };
  const saveCfg = c => { try { fs.mkdirSync(path.dirname(cfgFile), {recursive: true}); fs.writeFileSync(cfgFile, JSON.stringify(c)); } catch (_) { /* best effort */ } };
  const ltJar = r => path.join(r, 'lt', 'languagetool-server.jar');
  const installedRoot = () => roots.find(r => fs.existsSync(ltJar(r))) || '';
  const writable = r => { try { fs.mkdirSync(r, {recursive: true}); const t = path.join(r, '.w'); fs.writeFileSync(t, '1'); fs.unlinkSync(t); return true; } catch (_) { return false; } };
  const canWrite = r => { let d = r; for (let i = 0; i < 12; i++) { try { if (fs.statSync(d).isDirectory()) { fs.accessSync(d, fs.constants.W_OK); return true; } return false; } catch (_) { const up = path.dirname(d); if (up === d) return false; d = up; } } return false; };   // asks without creating anything
  function javaInfo(root) {
    const own = root && findFile(path.join(root, 'jre'), JAVA_BIN, 6);
    if (own && fs.existsSync(own)) return {found: true, source: 'portable', path: own};
    if (o.java) return {found: true, source: 'system', path: o.java};
    const major = javaMajor('java');
    return major >= MIN_JAVA ? {found: true, source: 'system', path: 'java', major} : {found: false, source: '', path: '', major};
  }
  function status() {
    const root = installedRoot(), java = root ? javaInfo(root) : {found: false};
    return {installed: !!root && (java.found || !!o.launcher), enabled: cfg().enabled, running: !!child, busy, root: root || '', target: root || roots.find(canWrite) || roots[0], javaSource: java.source || '', error: lastError, platformOk: ['win32', 'darwin', 'linux'].includes(process.platform)};
  }

  async function install(emit) {
    if (busy) throw new Error('An install is already running.');
    busy = true; lastError = ''; emit = emit || (() => {});
    const say = (phase, pct, msg) => { try { emit({phase, pct, msg}); } catch (_) { /* a closed window must not stop the install */ } };
    try {
      await stop();
      const root = roots.find(writable); if (!root) throw new Error('Neither the app folder nor the data folder can be written to.');
      const tmp = path.join(root, '_download'); fs.rmSync(tmp, {recursive: true, force: true}); fs.mkdirSync(tmp, {recursive: true});
      const plat = {win32: 'windows', darwin: 'mac', linux: 'linux'}[process.platform], arch = /arm64|aarch64/.test(process.arch) ? 'aarch64' : 'x64';
      const needJava = !o.launcher && !o.java && javaMajor('java') < MIN_JAVA;
      if (needJava) {
        say('java', 0, 'Downloading a small Java (this computer has none that LanguageTool can use)…');
        const jf = path.join(tmp, process.platform === 'win32' ? 'jre.zip' : 'jre.tar.gz');
        await download((urls.jre || jreUrl(plat, arch)), jf, (f, b) => say('java', f * 0.15, `Downloading Java… ${Math.round(b / 1048576)} MB`));
        say('java', 0.15, 'Unpacking Java…'); const jd = path.join(root, 'jre'); fs.rmSync(jd, {recursive: true, force: true}); fs.mkdirSync(jd, {recursive: true});
        if (/\.zip$/.test(jf)) unzip(jf, jd, {strip: 0}); else execFileSync('tar', ['-xzf', jf, '-C', jd], {timeout: 300000});
        const jbin = findFile(jd, JAVA_BIN, 6); if (!jbin) throw new Error('The Java download did not contain a java program.');
        if (process.platform !== 'win32') { try { fs.chmodSync(jbin, 0o755); } catch (_) { /* already executable */ } }
        fs.unlinkSync(jf);
      }
      const base = needJava ? 0.2 : 0;
      say('languagetool', base, 'Downloading LanguageTool (about 200 MB)…');
      const zf = path.join(tmp, 'languagetool.zip');
      await download(urls.lt, zf, (f, b) => say('languagetool', base + f * (0.7 - base), `Downloading LanguageTool… ${Math.round(b / 1048576)} MB`));
      say('unpack', 0.7, 'Unpacking LanguageTool…');
      const stage = path.join(root, '_lt_new'); fs.rmSync(stage, {recursive: true, force: true});
      unzip(zf, stage, {strip: 1, onProgress: f => say('unpack', 0.7 + f * 0.25, 'Unpacking LanguageTool…')});
      if (!fs.existsSync(path.join(stage, 'languagetool-server.jar'))) throw new Error('That download is not LanguageTool (languagetool-server.jar is missing).');
      const lt = path.join(root, 'lt'); fs.rmSync(lt, {recursive: true, force: true}); fs.renameSync(stage, lt);
      fs.rmSync(tmp, {recursive: true, force: true});
      const c = cfg(); c.enabled = true; saveCfg(c);
      say('done', 1, 'LanguageTool is installed.');
      return status();
    } catch (er) { lastError = er && er.message || String(er); say('error', 0, lastError); throw er; }
    finally { busy = false; }
  }

  async function remove() {
    await stop();
    for (const r of roots) for (const d of ['lt', 'jre', '_download', '_lt_new']) { try { fs.rmSync(path.join(r, d), {recursive: true, force: true}); } catch (_) { /* removed next time */ } }
    for (const r of roots) { try { fs.rmdirSync(r); } catch (_) { /* not empty or already gone */ } }
    lastError = ''; return status();
  }
  function setEnabled(on) { const c = cfg(); c.enabled = !!on; saveCfg(c); if (!on) stop(); return status(); }

  function defaultLauncher(p, root) {
    const info = javaInfo(root);
    if (!info.found) throw new Error('Java was not found.');
    return spawn(info.path, ['-Xmx1g', '-cp', 'languagetool-server.jar', 'org.languagetool.server.HTTPServer', '--port', String(p)], {cwd: path.join(root, 'lt'), stdio: 'ignore', windowsHide: true});   // no --public: only this computer can connect
  }
  function start() {
    if (child && port) return Promise.resolve(port);
    if (starting) return starting;
    starting = (async () => {
      const root = installedRoot(); if (!root) throw new Error('LanguageTool is not installed.');
      const p = await freePort(), ch = (o.launcher || defaultLauncher)(p, root);
      let exited = false; ch.on('exit', () => { exited = true; if (child === ch) { child = null; port = 0; } }); ch.on('error', er => { exited = true; lastError = er.message; });
      child = ch; port = p;
      const t0 = Date.now();
      for (;;) {
        if (exited) { child = null; port = 0; throw new Error(lastError || 'LanguageTool stopped while starting.'); }
        try { await request(p, 'GET', '/v2/languages', null, 3000); break; } catch (_) { /* not up yet */ }
        if (Date.now() - t0 > 90000) { await stop(); throw new Error('LanguageTool did not start within 90 seconds.'); }
        await new Promise(r => setTimeout(r, 400));
      }
      return p;
    })();
    const done = () => { starting = null; };
    starting.then(done, done);
    return starting;
  }
  async function stop() {
    clearTimeout(idle); idle = null;
    const ch = child; child = null; port = 0;
    if (ch) { try { ch.kill(); } catch (_) { /* already gone */ } }
  }
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => { stop(); }, IDLE_MS); if (idle.unref) idle.unref(); };

  // text -> [{offset, length, message, replacements:[...], rule, category, type}]
  async function check(text, opts) {
    opts = opts || {};
    if (!cfg().enabled) return {ok: false, error: 'LanguageTool is switched off.'};
    if (!installedRoot()) return {ok: false, error: 'LanguageTool is not installed.'};
    try {
      const p = await start(); touch();
      const body = new URLSearchParams({language: opts.language || 'en-US', text: String(text), disabledRules: OFF_RULES.join(','), disabledCategories: OFF_CATS.join(',')}).toString();
      const res = await request(p, 'POST', '/v2/check', body, 30000);
      return {ok: true, matches: (res.matches || []).map(m => ({offset: m.offset, length: m.length, message: m.message, short: m.shortMessage || '', replacements: (m.replacements || []).slice(0, 6).map(r => r.value), rule: m.rule && m.rule.id || '', category: m.rule && m.rule.category && m.rule.category.id || '', type: m.rule && m.rule.issueType || ''}))};
    } catch (er) { lastError = er.message; return {ok: false, error: er.message}; }
  }
  return {status, install, remove, setEnabled, check, stop, roots};
}
module.exports = {create, unzip, download, parseMajor, OFF_RULES};
