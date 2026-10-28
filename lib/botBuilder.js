'use strict';
// Bot Builder storage for the Creator Tool: the person's bot templates (any .txt file, written in any style), the character limits they set for a template,
// the "what changed" notes, the draft of every template and the bots they saved. Everything lives in the app's data folder; nothing leaves the computer.
//   create({userData, resourcesDir}) -> the object main.js hands to the window through IPC. No Electron code here, so it can be tested on its own.
const fs = require('node:fs');
const path = require('node:path');
const {parseTemplate, loadTemplates} = require('./botTemplates');
const TemplateLog = require('./templateLog');
const {compare: byTemplateName} = require('./templateNames');

const LIMIT_SECTIONS = ['personality', 'scenario', 'greeting'];     // the Introduction's limit is JuicyChat's own 15,000, so it is never asked for
const MAX_SAVED = 300;
const plainName = id => { const cur = String(id || ''); if (!/\.txt$/i.test(cur) || cur.includes('/') || cur.includes('\\') || cur.includes('..')) throw new Error('Pick a template first.'); return cur; };
const readJson = (file, fallback) => { try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v == null ? fallback : v; } catch { return fallback; } };
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8'); fs.renameSync(tmp, file);
};

function create({userData, resourcesDir}) {
  const mineDir = () => path.join(userData, 'bot-templates');
  const builtDir = () => path.join(resourcesDir, 'bot-templates');
  const dirs = () => [mineDir(), builtDir()];
  const limitsFile = () => path.join(userData, 'template-limits.json');
  const hiddenFile = () => path.join(userData, 'templates-hidden.json');
  const stateFile = () => path.join(userData, 'bot-builder.json');
  const readState = () => { const s = readJson(stateFile(), {}); return {drafts: s.drafts || {}, lastTemplate: s.lastTemplate || '', templateLogs: s.templateLogs || [], savedBots: s.savedBots || {}}; };
  const updateState = fn => { const s = readState(); fn(s); writeJson(stateFile(), s); return s; };
  const readHidden = () => readJson(hiddenFile(), []);
  const writeHidden = list => writeJson(hiddenFile(), [...new Set(list)]);

  // the templates, with the limits the person set for sections their template leaves open
  function templates({includeHidden = false} = {}) {
    const limits = readJson(limitsFile(), {}), hidden = new Set(readHidden()), d = dirs();
    const list = loadTemplates(d).filter(t => includeHidden || !hidden.has(t.id)).sort(byTemplateName);
    for (const t of list) {
      const mine = path.join(d[0], t.id), built = path.join(d[1], t.id);
      t.source = fs.existsSync(mine) ? 'yours' : 'built-in';
      t.replacesBuiltIn = t.source === 'yours' && fs.existsSync(built);
      t.updatedAt = t.source === 'yours' ? fs.statSync(mine).mtime.toISOString() : null;
      t.hidden = hidden.has(t.id);
      t.unlisted = false;
    }
    return list.map(t => {
      const mine = limits[t.id] || {}, missing = [];
      for (const sec of LIMIT_SECTIONS) {
        if (!t[sec] || t[sec].absent) continue;
        if (t[sec].limit) continue;                                             // the template's own limit always wins
        if (mine[sec] && mine[sec].min > 0 && mine[sec].max >= mine[sec].min) t[sec].limit = {min: mine[sec].min, max: mine[sec].max, fromUser: true};
        else missing.push(sec);
      }
      t.missingLimits = missing;
      const R = t.rules && t.rules.total, have = LIMIT_SECTIONS.filter(k => t[k] && !t[k].absent && t[k].limit);
      if (R && have.length >= 2) {
        const lo = have.reduce((a, k) => a + t[k].limit.min, 0), hi = have.reduce((a, k) => a + t[k].limit.max, 0);
        t.limitConflict = !R.softMin && R.min > hi ? `Your template's combined total needs at least ${R.min.toLocaleString()} characters, but its ${have.join(', ')} limits allow at most ${hi.toLocaleString()} together.`
          : !R.softMax && R.max < lo ? `Your template's combined total allows at most ${R.max.toLocaleString()} characters, but its ${have.join(', ')} limits need at least ${lo.toLocaleString()} together.` : '';
      }
      return t;
    });
  }
  function setLimits(templateId, lim) {
    const all = readJson(limitsFile(), {}), cur = all[templateId] || {};
    for (const sec of LIMIT_SECTIONS) {
      const L = lim && lim[sec]; if (!L) continue;
      const min = Math.round(+L.min), max = Math.round(+L.max);
      if (!(min > 0) || !(max >= min)) throw new Error(`The ${sec} limit needs a minimum above 0 and a maximum at least as large.`);
      cur[sec] = {min, max};
    }
    all[templateId] = cur; writeJson(limitsFile(), all); return templates();
  }
  const pushLog = l => { if (l) updateState(s => { s.templateLogs = [l, ...s.templateLogs.filter(x => x.file !== l.file)].slice(0, 12); }); };

  // + Add: any .txt file. A file that is not a bot template at all says so; one written in another style is read as well as it can be (see botTemplates.normalizeTemplate).
  function addFiles(paths) {
    const dir = mineDir(); fs.mkdirSync(dir, {recursive: true});
    const added = [], errors = [];
    for (const f of paths || []) {
      try {
        const text = fs.readFileSync(f, 'utf8'); parseTemplate(text, f);
        const base = path.basename(f), dest = path.join(dir, base), built = path.join(builtDir(), base);
        const old = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : fs.existsSync(built) ? fs.readFileSync(built, 'utf8') : null;
        fs.copyFileSync(f, dest); added.push(base);
        pushLog(TemplateLog.make(old == null ? {file: base, kind: 'added', from: base, newText: text} : {file: base, kind: 'updated', from: base, oldText: old, newText: text}));
      } catch (e) { errors.push(`${path.basename(f)}: ${e.message}`); }
    }
    return {added, errors};
  }
  // Replace the selected template with an updated file. The copy lives in the data folder under the same name, so it wins over a built-in one.
  function replaceFrom(id, file) {
    const cur = plainName(id), text = fs.readFileSync(file, 'utf8');
    parseTemplate(text, cur);
    const dir = mineDir(); fs.mkdirSync(dir, {recursive: true});
    const dest = path.join(dir, cur), built = path.join(builtDir(), cur);
    const before = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : fs.existsSync(built) ? fs.readFileSync(built, 'utf8') : '';
    if (fs.existsSync(dest)) fs.copyFileSync(dest, dest + '.previous');           // one-step undo
    fs.writeFileSync(dest, text, 'utf8');
    pushLog(TemplateLog.make({file: cur, kind: 'updated', from: path.basename(file), oldText: before, newText: text}));
    return {replaced: true, id: cur, from: path.basename(file)};
  }
  function restore(id) {
    const cur = plainName(id), dest = path.join(mineDir(), cur), built = path.join(builtDir(), cur);
    if (!fs.existsSync(dest)) return {restored: false, reason: 'This template is already the original.'};
    if (!fs.existsSync(built)) return {restored: false, reason: 'This template was added by you, so there is no built-in version to go back to.'};
    fs.renameSync(dest, dest + '.previous'); return {restored: true};
  }
  // remove: yours is deleted (a replaced built-in comes back), a built-in one is only taken off the list
  function remove(id) {
    const cur = plainName(id), mine = path.join(mineDir(), cur), built = path.join(builtDir(), cur);
    if (fs.existsSync(mine)) {
      const dir = mineDir();
      for (const f of fs.readdirSync(dir)) if (f === cur || f === `${cur}.previous`) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* already gone */ } }
      return {removed: 'yours', builtInReturns: fs.existsSync(built), templates: templates()};
    }
    if (fs.existsSync(built)) { writeHidden([...readHidden(), cur]); return {removed: 'hidden', templates: templates()}; }
    throw new Error('That template is no longer there.');
  }
  const hiddenList = () => templates({includeHidden: true}).filter(t => t.hidden).map(t => ({id: t.id, name: t.name}));
  function unhide(id) { writeHidden(id === 'all' ? [] : readHidden().filter(x => x !== id)); return templates(); }
  function info(id) {
    const cur = String(id || ''), mine = path.join(mineDir(), cur), built = path.join(builtDir(), cur);
    return {replaced: fs.existsSync(mine) && fs.existsSync(built), yours: fs.existsSync(mine) && !fs.existsSync(built), updatedAt: fs.existsSync(mine) ? fs.statSync(mine).mtime.toISOString() : null};
  }

  // drafts and the "what changed" notes
  const state = () => { const s = readState(); return {drafts: s.drafts, lastTemplate: s.lastTemplate}; };
  function saveDraft(id, values) { updateState(s => { s.drafts[String(id)] = values; s.lastTemplate = String(id); }); return true; }
  const logs = () => readState().templateLogs;
  function closeLog(id) { return updateState(s => { s.templateLogs = id === 'all' ? [] : s.templateLogs.filter(x => x.id !== String(id)); }).templateLogs; }

  // saved bots: standalone (the Creator Tool has no scenario cards), one entry per scene name and template
  const savedKey = (templateId, values) => `${String(templateId)}::${String((values && values.header && values.header.scene) || (values && values.names && values.names[1]) || 'Untitled bot').trim().toLowerCase()}`;
  const savedList = s => Object.values(s.savedBots).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))).map(b => ({...b, values: undefined, full: undefined}));
  function saveBot(templateId, values, full) {
    if (!values || typeof values !== 'object') throw new Error('There is nothing to save yet.');
    const key = savedKey(templateId, values), tpl = templates({includeHidden: true}).find(t => t.id === templateId);
    const s = updateState(st => {
      st.savedBots[key] = {key, sceneName: (values.header && values.header.scene) || (values.names && values.names[1]) || 'Untitled bot', templateId, templateName: tpl ? tpl.name : templateId,
        values: JSON.parse(JSON.stringify(values)), full: String(full || '').slice(0, 120000), savedAt: new Date().toISOString(), chars: String(full || '').length};
      const keys = Object.keys(st.savedBots);
      if (keys.length > MAX_SAVED) for (const k of keys.sort((a, b) => String(st.savedBots[a].savedAt).localeCompare(String(st.savedBots[b].savedAt))).slice(0, keys.length - MAX_SAVED)) delete st.savedBots[k];
    });
    return {saved: savedList(s), key};
  }
  const savedBots = () => savedList(readState());
  function loadSavedBot(key) { const b = readState().savedBots[key]; if (!b) throw new Error('That saved bot no longer exists.'); return b; }
  function deleteSavedBot(key) { return savedList(updateState(s => { delete s.savedBots[key]; })); }

  return {dirs, templates, setLimits, addFiles, replaceFrom, restore, remove, hiddenList, unhide, info, state, saveDraft, logs, closeLog, saveBot, savedBots, loadSavedBot, deleteSavedBot, LIMIT_SECTIONS};
}
module.exports = {create};
