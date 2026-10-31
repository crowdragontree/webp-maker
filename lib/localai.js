'use strict';
/* Local AI rewrite, installed and run by the app (v1.4.1). The third choice in Settings > Grammar engine (with LanguageTool and GECToR); only
 * one is installed at a time. Free and open source, runs only on this computer: no credits, no account, nothing sent anywhere.
 * Install = one button: the app downloads
 *   - llama.cpp's llama-server (MIT) from its GitHub release: the program that runs the model. On Windows and Linux the Vulkan build is tried
 *     first (it uses the graphics card when there is one, and the processor when there is not); if it cannot start, the plain processor build
 *     is downloaded instead.
 *   - Qwen3.5 9B (Apache-2.0), 4-bit, about 5.7 GB, from Hugging Face. A download that breaks off continues where it stopped next time.
 * into <app folder>/localai (or the app's data folder when the app folder cannot be written). Remove = delete that folder.
 * The model runs as its own program that starts when a check needs it and stops after 15 idle minutes. Answers are saved, so a passage that
 * did not change is never sent to the model twice.
 *   create({appDir, userData, urls}) -> {status, install, remove, setEnabled, check, stop} */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), https = require('https'), net = require('net'), crypto = require('crypto');
const {spawn} = require('child_process');
const {unzip} = require('./languagetool');
const {extractTgz} = require('./gector');
const core = require('./localaiCore');

const LLAMA_TAG = 'b11600';
const REL = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_TAG}/llama-${LLAMA_TAG}-bin-`;
const BUILDS = {   // [first choice, fallback]
  'win32/x64': [`${REL}win-vulkan-x64.zip`, `${REL}win-cpu-x64.zip`],
  'win32/arm64': [`${REL}win-cpu-arm64.zip`],
  'linux/x64': [`${REL}ubuntu-vulkan-x64.tar.gz`, `${REL}ubuntu-x64.tar.gz`],
  'linux/arm64': [`${REL}ubuntu-arm64.tar.gz`],
  'darwin/arm64': [`${REL}macos-arm64.tar.gz`],
  'darwin/x64': [`${REL}macos-x64.tar.gz`]
};
const MODEL = {name: 'Qwen3.5 9B (Q4_K_M)', file: 'model.gguf', minBytes: 4.5e9, urls: [
  'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf',
  'https://huggingface.co/bartowski/Qwen_Qwen3.5-9B-GGUF/resolve/main/Qwen_Qwen3.5-9B-Q4_K_M.gguf'
]};
const IDLE_MS = 15 * 60 * 1000, PLAT = `${process.platform}/${process.arch}`, CTX = 8192;

// ---------------------------------------------------------------- download that follows redirects and continues a broken-off download
function fetchTo(url, file, onProgress, hops) {
  return new Promise((resolve, reject) => {
    if ((hops || 0) > 10) return reject(new Error('Too many redirects while downloading.'));
    if (/^file:/.test(url)) { try { fs.copyFileSync(new URL(url), file); const n = fs.statSync(file).size; onProgress(1, n, n); resolve(); } catch (er) { reject(er); } return; }   // tests
    const have = fs.existsSync(file) ? fs.statSync(file).size : 0;
    const headers = {'User-Agent': 'JuicyBlueprintStudio'}; if (have) headers.Range = `bytes=${have}-`;
    const req = (/^http:/.test(url) ? http : https).get(url, {headers}, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) { res.resume(); return resolve(fetchTo(new URL(res.headers.location, url).toString(), file, onProgress, (hops || 0) + 1)); }
      if (res.statusCode === 416 && have) { res.resume(); onProgress(1, have, have); return resolve(); }       // already complete
      if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); return reject(new Error(`The download server answered ${res.statusCode}.`)); }
      const resumed = res.statusCode === 206, base = resumed ? have : 0, total = base + (+res.headers['content-length'] || 0);
      let got = base; const out = fs.createWriteStream(file, {flags: resumed ? 'a' : 'w'});
      res.on('data', c => { got += c.length; onProgress(total ? got / total : 0, got, total); });
      res.on('error', reject); out.on('error', reject); out.on('finish', () => resolve());
      res.pipe(out);
    });
    req.on('error', reject); req.setTimeout(60000, () => req.destroy(new Error('The download stalled (no data for 60 seconds). Press Install again to continue where it stopped.')));
  });
}
function findServer(dir, depth) {
  if (depth < 0) return '';
  let list = []; try { list = fs.readdirSync(dir, {withFileTypes: true}); } catch (_) { return ''; }
  for (const d of list) if ((d.isFile() || d.isSymbolicLink()) && /^llama-server(\.exe)?$/.test(d.name)) return path.join(dir, d.name);
  for (const d of list) if (d.isDirectory()) { const r = findServer(path.join(dir, d.name), depth - 1); if (r) return r; }
  return '';
}
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
function call(port, method, urlPath, body, timeout) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({host: '127.0.0.1', port, path: urlPath, method, headers: data ? {'Content-Type': 'application/json', 'Content-Length': data.length} : {}}, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { const t = Buffer.concat(chunks).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (_) { /* not JSON */ } resolve({status: res.statusCode, json: j, text: t}); });
    });
    req.on('error', reject); req.setTimeout(timeout || 20000, () => req.destroy(new Error('The local AI took too long to answer.')));
    if (data) req.write(data); req.end();
  });
}

function create(o) {
  o = o || {};
  const appDir = o.appDir, userData = o.userData, builds = (o.urls && o.urls.builds) || BUILDS[PLAT] || [], modelUrls = (o.urls && o.urls.model) || MODEL.urls;
  const roots = [appDir && path.join(appDir, 'localai'), userData && path.join(userData, 'localai')].filter(Boolean).filter((r, i, a) => a.indexOf(r) === i);
  const cfgFile = path.join(userData || appDir, 'localai.json'), cacheFile = path.join(userData || appDir, 'localai-answers.json');
  let child = null, port = 0, loading = null, idle = null, busy = false, lastError = '', queue = Promise.resolve(), log = '', answers = null;

  const cfg = () => { try { return Object.assign({enabled: true}, JSON.parse(fs.readFileSync(cfgFile, 'utf8'))); } catch (_) { return {enabled: true}; } };
  const saveCfg = c => { try { fs.mkdirSync(path.dirname(cfgFile), {recursive: true}); fs.writeFileSync(cfgFile, JSON.stringify(c)); } catch (_) { /* best effort */ } };
  const info = r => { try { return JSON.parse(fs.readFileSync(path.join(r, 'install.json'), 'utf8')); } catch (_) { return null; } };
  const complete = r => { const i = info(r); return !!(i && i.server && fs.existsSync(path.join(r, i.server)) && fs.existsSync(path.join(r, 'model', MODEL.file))); };
  const installedRoot = () => roots.find(complete) || '';
  const writable = r => { try { fs.mkdirSync(r, {recursive: true}); const t = path.join(r, '.w'); fs.writeFileSync(t, '1'); fs.unlinkSync(t); return true; } catch (_) { return false; } };
  const freeGb = d => { try { let p = d; while (!fs.existsSync(p)) p = path.dirname(p); const s = fs.statfsSync(p); return (s.bavail * s.bsize) / 1e9; } catch (_) { return Infinity; } };
  const sizeOf = r => { let n = 0; const walk = d => { let l = []; try { l = fs.readdirSync(d, {withFileTypes: true}); } catch (_) { return; } for (const x of l) { const p = path.join(d, x.name); if (x.isDirectory()) walk(p); else { try { n += fs.lstatSync(p).size; } catch (_) { /* gone */ } } } }; walk(r); return n; };

  function status() {
    const root = installedRoot(), i = root ? info(root) : null;
    return {installed: !!root, enabled: cfg().enabled, running: !!child, busy, root: root || '', target: root || roots[0], sizeMb: root ? Math.round(sizeOf(root) / 1048576) : 0, error: lastError,
      platformOk: builds.length > 0, ramGb: Math.round(os.totalmem() / 1073741824), model: MODEL.name, build: i ? i.build : '', downloadGb: 5.8};
  }

  // ---- the model program
  function start() {
    if (child && port && !loading) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      const root = installedRoot(); if (!root) throw new Error('The local AI is not installed.');
      const i = info(root), server = path.join(root, i.server), dir = path.dirname(server);
      port = await freePort(); log = '';
      const threads = Math.max(2, Math.min(8, Math.floor((os.cpus() || []).length / 2) || 4));
      const env = Object.assign({}, process.env);
      if (process.platform === 'linux') env.LD_LIBRARY_PATH = dir + (env.LD_LIBRARY_PATH ? ':' + env.LD_LIBRARY_PATH : '');
      if (process.platform === 'darwin') env.DYLD_LIBRARY_PATH = dir;
      const args = ['-m', path.join(root, 'model', MODEL.file), '--host', '127.0.0.1', '--port', String(port), '-c', String(CTX), '-np', '1', '-t', String(threads), '--jinja', '--reasoning-budget', '0', '--chat-template-kwargs', '{"enable_thinking":false}'];
      const ch = spawn(server, args, {cwd: dir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      child = ch;
      const keep = d => { log = (log + d).slice(-4000); };
      ch.stdout.on('data', keep); ch.stderr.on('data', keep);
      let exited = null; ch.on('exit', code => { exited = code == null ? -1 : code; if (child === ch) { child = null; port = 0; } });
      ch.on('error', er => { exited = -1; lastError = er.message; });
      const until = Date.now() + 300000;
      for (;;) {
        if (exited !== null) throw new Error(`The local AI stopped while starting (code ${exited}). ${lastLines()}`);
        if (Date.now() > until) throw new Error('The local AI took more than 5 minutes to load the model.');
        try { const r = await call(port, 'GET', '/health', null, 5000); if (r.status === 200) break; } catch (_) { /* still loading */ }
        await new Promise(r => setTimeout(r, 1000));
      }
    })();
    const done = () => { loading = null; };
    loading.then(done, er => { done(); stop(); lastError = er.message; });
    return loading;
  }
  const lastLines = () => log.split('\n').map(l => l.trim()).filter(l => /error|fail|cannot|unable/i.test(l)).slice(-2).join(' ').slice(0, 300);
  async function stop() { clearTimeout(idle); idle = null; const ch = child; child = null; port = 0; if (ch) { try { ch.kill(); } catch (_) { /* gone */ } } }
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => { stop(); }, IDLE_MS); if (idle.unref) idle.unref(); };

  // ---- saved answers
  const loadAnswers = () => { if (answers) return answers; try { answers = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (_) { answers = {}; } return answers; };
  const saveAnswers = () => { try { const k = Object.keys(answers); if (k.length > 600) for (const x of k.slice(0, k.length - 600)) delete answers[x]; fs.writeFileSync(cacheFile, JSON.stringify(answers)); } catch (_) { /* best effort */ } };
  const keyOf = (text, tense) => crypto.createHash('sha1').update([core.PROMPT_VERSION, LLAMA_TAG, MODEL.urls[0], tense || '', text].join('\u0000')).digest('hex');

  async function ask(text, tense) {
    const r = await call(port, 'POST', '/v1/chat/completions', {
      messages: core.messages(text, tense), temperature: 0.2, top_p: 0.8, max_tokens: 2000,
      chat_template_kwargs: {enable_thinking: false},
      response_format: {type: 'json_schema', json_schema: {name: 'edits', schema: core.SCHEMA}}
    }, 600000);
    if (r.status !== 200 || !r.json) throw new Error(`The local AI answered ${r.status}: ${String(r.text || '').slice(0, 160)}`);
    const msg = r.json.choices && r.json.choices[0] && r.json.choices[0].message;
    return String((msg && msg.content) || '');
  }

  // ---- install / remove
  async function install(emit) {
    if (busy) throw new Error('An install is already running.');
    busy = true; lastError = ''; emit = emit || (() => {});
    const say = (phase, pct, msg) => { try { emit({phase, pct, msg}); } catch (_) { /* a closed window must not stop the install */ } };
    let root = '';
    try {
      await stop();
      if (!builds.length) throw new Error(`The local AI has no version for this computer (${PLAT}).`);
      root = roots.find(writable); if (!root) throw new Error('Neither the app folder nor the data folder can be written to.');
      const tmp = path.join(root, '_download'); fs.mkdirSync(tmp, {recursive: true});
      const model = path.join(root, 'model', MODEL.file), partOf = i => path.join(tmp, `model-${i}.gguf.part`);
      const partial = modelUrls.reduce((n, _u, i) => n + (fs.existsSync(partOf(i)) ? fs.statSync(partOf(i)).size : 0), 0);
      const needGb = (fs.existsSync(model) ? 0 : 6.2) - partial / 1e9 + 0.2;
      if (freeGb(root) < needGb) throw new Error(`Not enough free disk space: the local AI needs about ${Math.ceil(needGb)} GB free on the drive with ${root}.`);
      // 1) the model (the big part first, so a broken-off download can continue)
      if (!fs.existsSync(model)) {
        let ok = false, why = '';
        for (let ui = 0; ui < modelUrls.length; ui++) {
          const u = modelUrls[ui], part = partOf(ui), had = fs.existsSync(part) ? fs.statSync(part).size : 0;
          try {
            say('model', 0, 'Downloading the model (Qwen3.5 9B, about 5.7 GB)…');
            await fetchTo(u, part, (f, b, t) => say('model', f * 0.85, `Downloading the model… ${(b / 1e9).toFixed(2)} of ${t ? (t / 1e9).toFixed(1) : '5.7'} GB`));
            const fd = fs.openSync(part, 'r'), head = Buffer.alloc(4); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
            if (head.toString('latin1') !== 'GGUF') { fs.rmSync(part, {force: true}); throw new Error('The model file is not a GGUF file.'); }
            if (fs.statSync(part).size < (o.minBytes != null ? o.minBytes : MODEL.minBytes)) throw new Error('The model download is incomplete. Press Install again to continue where it stopped.');
            fs.mkdirSync(path.dirname(model), {recursive: true}); fs.renameSync(part, model);
            ok = true; break;
          } catch (er) {
            why = er.message;
            // part of this file is already here: keep it and continue from there next time (never mix two sources)
            if ((fs.existsSync(part) ? fs.statSync(part).size : 0) > had || had) { why = /continue/.test(why) ? why : `The model download broke off (${why}). Press Install again to continue where it stopped.`; break; }
          }
        }
        if (!ok) throw new Error(why || 'The model could not be downloaded.');
      }
      // 2) the program that runs it, then a test; the processor-only build is the fallback
      let lastWhy = '';
      for (let b = 0; b < builds.length; b++) {
        const url = builds[b], name = path.basename(url.split('?')[0]), arch = path.join(tmp, name);
        say('runtime', 0.86, `Downloading llama.cpp (${/vulkan/.test(name) ? 'graphics-card build' : 'processor build'})…`);
        await fetchTo(url, arch, (f, bt) => say('runtime', 0.86 + f * 0.04, `Downloading llama.cpp… ${Math.round(bt / 1048576)} MB`));
        const rt = path.join(root, 'runtime'); fs.rmSync(rt, {recursive: true, force: true}); fs.mkdirSync(rt, {recursive: true});
        say('runtime', 0.9, 'Unpacking llama.cpp…');
        if (/\.zip$/.test(name)) unzip(arch, rt); else await extractTgz(arch, rt, {});
        fs.rmSync(arch, {force: true});
        const server = findServer(rt, 3); if (!server) { lastWhy = 'The llama.cpp download has no llama-server.'; continue; }
        if (process.platform !== 'win32') { try { fs.chmodSync(server, 0o755); } catch (_) { /* already set */ } }
        fs.writeFileSync(path.join(root, 'install.json'), JSON.stringify({server: path.relative(root, server), build: /vulkan/.test(name) ? 'graphics card (Vulkan) or processor' : 'processor', tag: LLAMA_TAG, model: MODEL.name}));
        say('test', 0.92, 'Starting the local AI and testing it on a sample sentence (loading the model can take a minute)…');
        try {
          await start();
          const raw = await ask('*You dated Sabine for five years and married for two of them.*', 'past');
          if (!/edits/.test(raw)) throw new Error('The local AI gave an answer the app could not read.');
          lastWhy = ''; break;
        } catch (er) { lastWhy = er.message; await stop(); }
      }
      if (lastWhy) throw new Error(lastWhy);
      fs.rmSync(tmp, {recursive: true, force: true});
      touch();
      const c = cfg(); c.enabled = true; saveCfg(c);
      say('done', 1, 'The local AI is installed.');
      return status();
    } catch (er) {
      lastError = er && er.message || String(er); await stop();
      if (root) { try { fs.rmSync(path.join(root, 'runtime'), {recursive: true, force: true}); fs.rmSync(path.join(root, 'install.json'), {force: true}); } catch (_) { /* removed next time */ } }   // the model (or its partial download) is kept, so Install continues
      say('error', 0, lastError); throw er;
    } finally { busy = false; }
  }
  async function remove() {
    await stop();
    for (const r of roots) { try { fs.rmSync(r, {recursive: true, force: true}); } catch (_) { /* removed next time */ } }
    try { fs.rmSync(cacheFile, {force: true}); } catch (_) { /* fine */ }
    answers = null; lastError = ''; return status();
  }
  function setEnabled(on) { const c = cfg(); c.enabled = !!on; saveCfg(c); if (!on) stop(); return status(); }

  // text -> {ok, matches}. opts.tense: 'past' | 'present' | ''. One passage at a time (the model works on one thing at once).
  let liveSeq = 0;
  function check(text, opts) {
    opts = opts || {};
    const mine = opts.live ? ++liveSeq : 0;                                     // a sentence you are typing: only the newest version is worth reading
    const job = queue.then(async () => {
      if (opts.live && mine !== liveSeq) return {ok: true, matches: [], stale: true};
      if (!cfg().enabled) return {ok: false, error: 'The local AI is switched off.'};
      if (!installedRoot()) return {ok: false, error: 'The local AI is not installed.'};
      const src = String(text || ''), tense = opts.tense === 'past' || opts.tense === 'present' ? opts.tense : '';
      if (!opts.force && !core.worthChecking(src)) return {ok: true, matches: []};
      if (!src.trim()) return {ok: true, matches: []};
      const all = loadAnswers(), out = [];
      try {
        for (const p of core.pieces(src)) {
          const k = keyOf(p.text, tense);
          if (!(k in all)) { await start(); touch(); all[k] = await ask(p.text, tense); saveAnswers(); touch(); }
          for (const m of core.toMatches(p.text, all[k])) out.push(Object.assign(m, {offset: m.offset + p.offset}));
        }
        return {ok: true, matches: out};
      } catch (er) { lastError = er.message; return {ok: false, error: er.message}; }
    });
    queue = job.catch(() => {});
    return job;
  }
  return {status, install, remove, setEnabled, check, stop, roots};
}
module.exports = {create, fetchTo, BUILDS, MODEL, LLAMA_TAG};
