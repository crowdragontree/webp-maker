// The "what changed" log for bot templates: shown, and closeable, whenever a template is updated or added in the Bot Builder
// (Replace, + Add) and when a built-in template changes with an app update. Plain text comparison, section by section; no AI.
// Entries have the same shape as the rulebook change log ({title, kind, diff}), so one viewer draws both.
'use strict';
const fs = require('fs'), path = require('path');
const TD = require('./textDiff');
const {prettyName} = require('./templateNames');

const MAX_SECTIONS = 60;
// a section starts at a line that opens with a bracket and an ALL-CAPS label: "[CANON LOCK]: ...", "[CRITICAL INFORMATION: ...]". Everything up to the next one belongs to it.
const LABEL = /^\[([A-Z0-9][A-Z0-9 \/&'’,\-()]{1,70}?)\s*(?:[:\]]|$)/;
function split(text) {
  const out = [], seen = {}; let cur = {title: 'Start of the template', lines: []};
  for (const line of String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(LABEL);
    if (m) { if (cur.lines.some(l => l.trim())) out.push(cur); let t = m[1].trim(); seen[t] = (seen[t] || 0) + 1; if (seen[t] > 1) t += ` (${seen[t]})`; cur = {title: t, lines: []}; }
    cur.lines.push(line);
  }
  if (cur.lines.some(l => l.trim())) out.push(cur);
  return out.map(s => ({title: s.title, text: s.lines.join('\n')}));
}
const norm = t => String(t).replace(/\s+/g, ' ').trim();

// entries for what changed between two versions of one template
function entries(oldText, newText) {
  const a = split(oldText), b = split(newText), byOld = new Map(a.map(s => [s.title, s])), byNew = new Map(b.map(s => [s.title, s])), out = [];
  for (const s of b) {
    const o = byOld.get(s.title);
    if (!o) out.push({title: s.title, kind: 'added', diff: TD.sectionDiff('', s.text)});
    else if (o.text !== s.text) { const diff = TD.sectionDiff(o.text, s.text); if (!diff.spacingOnly) out.push({title: s.title, kind: 'changed', diff}); }
  }
  for (const s of a) if (!byNew.has(s.title)) out.push({title: s.title, kind: 'removed', diff: TD.sectionDiff(s.text, '')});
  return out.slice(0, MAX_SECTIONS);
}
function summaryOf(list) {
  const n = k => list.filter(e => e.kind === k).length, c = {add: 0, rem: 0, chg: 0};
  for (const e of list) { const d = e.diff || {}, m = d.more || {}; c.add += (d.added || []).length + (m.added || 0); c.rem += (d.removed || []).length + (m.removed || 0); c.chg += (d.changed || []).length + (m.changed || 0); }
  const bits = []; if (n('changed')) bits.push(`${n('changed')} section${n('changed') > 1 ? 's' : ''} changed`); if (n('added')) bits.push(`${n('added')} section${n('added') > 1 ? 's' : ''} added`); if (n('removed')) bits.push(`${n('removed')} section${n('removed') > 1 ? 's' : ''} removed`);
  const lines = [c.add ? `${c.add} line${c.add > 1 ? 's' : ''} added` : '', c.chg ? `${c.chg} reworded` : '', c.rem ? `${c.rem} removed` : ''].filter(Boolean).join(', ');
  return bits.join(' · ') + (lines ? `. In the template text: ${lines}.` : '');
}
// one change-log record, or null when the two texts read the same
function make({file, kind, from, oldText, newText, now}) {
  const id = `tl-${(now || Date.now()).toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name = prettyName(file), at = new Date(now || Date.now()).toISOString();
  if (kind === 'added') {
    const secs = split(newText);
    return {id, at, kind, file, name, from: from || '', summary: `New template: ${secs.length} section${secs.length === 1 ? '' : 's'}.`, sections: secs.map(s => s.title).slice(0, 80), entries: []};
  }
  const e = entries(oldText, newText);
  if (norm(oldText) === norm(newText)) return null;
  return {id, at, kind, file, name, from: from || '', summary: e.length ? summaryOf(e) : 'Only spacing or line breaks changed. The wording is the same.', entries: e};
}

// built-in templates that changed with an app update: each one's last-seen text is kept in a snapshot folder, and the first start after an update compares them.
// The very first run only takes the snapshots (nothing to compare with yet).
function checkBuiltIns({userData, builtInDir, userDir, now}) {
  const snap = path.join(userData, 'template-snapshots'), marker = path.join(snap, '.seeded'), logs = [];
  let first = !fs.existsSync(marker);
  if (!fs.existsSync(builtInDir)) return logs;
  fs.mkdirSync(snap, {recursive: true});
  for (const f of fs.readdirSync(builtInDir).filter(x => /\.txt$/i.test(x)).sort()) {
    let text; try { text = fs.readFileSync(path.join(builtInDir, f), 'utf8'); } catch { continue; }
    const sp = path.join(snap, f), had = fs.existsSync(sp), yours = fs.existsSync(path.join(userDir, f));
    if (had) { const old = fs.readFileSync(sp, 'utf8'); if (old !== text) { if (!yours) { const l = make({file: f, kind: 'builtin', from: 'an app update', oldText: old, newText: text, now}); if (l) logs.push(l); } fs.writeFileSync(sp, text, 'utf8'); } }
    else { fs.writeFileSync(sp, text, 'utf8'); if (!first && !yours) logs.push(make({file: f, kind: 'added', from: 'an app update', newText: text, now})); }
  }
  if (first) fs.writeFileSync(marker, new Date().toISOString());
  return logs;
}
function logText(l) {
  const L = [`${l.name}: what changed${l.from ? ` (${l.from})` : ''}`, l.summary, ''];
  if (l.sections && l.sections.length) L.push('Sections: ' + l.sections.join('; '));
  L.push(TD.logText((l.entries || []).map(e => ({title: e.title, kind: e.kind, diff: e.diff}))));
  return L.join('\n').trim();
}
module.exports = {split, entries, summaryOf, make, checkBuiltIns, logText};
