'use strict';
/* A readable change log between two pieces of text (v1.2.0): which lines were added, which were removed, and which were reworded (with the changed words marked).
 * Used by the Weekly Blueprint's "Updated: what changed" panel, so a changed rulebook section or field instruction shows WHAT changed, not only that it did.
 *   sectionDiff(oldText, newText) -> {added: [line], removed: [line], changed: [{before, after, parts}], same: n, spacingOnly: bool, more: {added, removed, changed}}
 *   parts is [[op, text]]: op 0 = unchanged words, -1 = words that were taken out, 1 = words that were put in (long unchanged stretches are shortened with " ... ").
 * Pure functions, no app or file access. */
const MAX_SHOW = 40, MAX_LINE = 1200, DP_LIMIT = 4e6;

const linesOf = t => String(t == null ? '' : t).replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
const words = s => s.toLowerCase().match(/[\p{L}\p{N}'’{}/-]+/gu) || [];
const clip = s => s.length > MAX_LINE ? s.slice(0, MAX_LINE - 1).trimEnd() + '…' : s;

// longest common subsequence of two arrays, as the list of matching index pairs (a plain DP: sections are a few hundred lines at most)
function lcsPairs(a, b, eq) {
  const n = a.length, m = b.length;
  if (!n || !m) return [];
  if (n * m > DP_LIMIT) {                                    // far too big for the table: match by exact value, in order
    const pos = new Map(); b.forEach((x, j) => { if (!pos.has(x)) pos.set(x, []); pos.get(x).push(j); });
    const out = []; let last = -1;
    a.forEach((x, i) => { const js = pos.get(x); if (!js) return; const j = js.find(v => v > last); if (j !== undefined) { out.push([i, j]); last = j; } });
    return out;
  }
  const w = m + 1, t = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i * w + j] = eq(a[i], b[j]) ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (eq(a[i], b[j])) { out.push([i, j]); i++; j++; } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++; else j++; }
  return out;
}

// how alike two lines are, 0 to 1 (shared words over all words)
function similarity(x, y) {
  const long = s => words(s).filter(w => w.length >= 4), A = new Set(long(x)), B = new Set(long(y)); if (!A.size || !B.size) return 0;     // short filler words (the, and, is) do not make two lines alike
  let k = 0; for (const w of A) if (B.has(w)) k++;
  return k / (A.size + B.size - k);
}

// the words that differ between two lines, in reading order (a word carries the space after it, so the pieces join back into a readable line)
function wordParts(before, after) {
  const A = before.match(/\S+\s*/g) || [], B = after.match(/\S+\s*/g) || [];
  const same = lcsPairs(A, B, (p, q) => p.trim() === q.trim()), parts = []; let i = 0, j = 0;
  const push = (op, s) => { if (!s) return; const l = parts[parts.length - 1]; if (l && l[0] === op) l[1] += s; else parts.push([op, s]); };
  for (const [pi, pj] of [...same, [A.length, B.length]]) {
    push(-1, A.slice(i, pi).join('')); push(1, B.slice(j, pj).join(''));
    if (pi < A.length) push(0, B[pj]);
    i = pi + 1; j = pj + 1;
  }
  return shorten(parts);
}
// a long unchanged stretch is cut down, so the changed words stay easy to see
function shorten(parts) {
  const last = parts.length - 1;
  return parts.map(([op, s], k) => {
    if (op !== 0 || s.length <= 170) return [op, s];
    const head = s.slice(0, 70).trimEnd(), tail = s.slice(-70).trimStart();
    return [0, k === 0 ? `… ${tail.trimEnd()} ` : k === last ? `${head} …` : `${head} … ${tail.trimEnd()} `];
  });
}

function sectionDiff(oldText, newText) {
  const a = linesOf(oldText), b = linesOf(newText);
  const same = lcsPairs(a, b, (x, y) => x === y), out = {added: [], removed: [], changed: [], same: same.length, spacingOnly: false, more: {added: 0, removed: 0, changed: 0}};
  let i = 0, j = 0;
  for (const [pi, pj] of [...same, [a.length, b.length]]) {
    const gone = a.slice(i, pi), came = b.slice(j, pj);
    // inside one gap, a removed line and an added line that are mostly the same words are one reworded line
    const usedG = new Set(), pairs = [];
    came.forEach((c, ci) => { let best = -1, bs = 0.34; gone.forEach((g, gi) => { if (usedG.has(gi)) return; const s = similarity(g, c); if (s > bs) { bs = s; best = gi; } }); if (best >= 0) { usedG.add(best); pairs.push([best, ci]); } });
    const pairedC = new Set(pairs.map(p => p[1]));
    for (const [gi, ci] of pairs.sort((x, y) => x[1] - y[1])) out.changed.push({before: gone[gi], after: came[ci], parts: wordParts(gone[gi], came[ci])});
    gone.forEach((g, gi) => { if (!usedG.has(gi)) out.removed.push(g); });
    came.forEach((c, ci) => { if (!pairedC.has(ci)) out.added.push(c); });
    i = pi + 1; j = pj + 1;
  }
  out.spacingOnly = !out.added.length && !out.removed.length && !out.changed.length;
  for (const k of ['added', 'removed']) { if (out[k].length > MAX_SHOW) { out.more[k] = out[k].length - MAX_SHOW; out[k] = out[k].slice(0, MAX_SHOW); } out[k] = out[k].map(clip); }
  if (out.changed.length > MAX_SHOW) { out.more.changed = out.changed.length - MAX_SHOW; out.changed = out.changed.slice(0, MAX_SHOW); }
  out.changed = out.changed.map(c => ({before: clip(c.before), after: clip(c.after), parts: c.parts}));
  return out;
}

// the same log as plain text (the "Copy change log" button)
function logText(log) {
  const L = [];
  for (const e of log || []) {
    L.push(`${e.title}${e.kind === 'changed' ? '' : ` (${e.kind})`}`);
    const d = e.diff || {};
    if (d.spacingOnly) L.push('  Only spacing or line breaks changed.');
    for (const c of d.changed || []) L.push(`  ~ ${c.parts.map(([op, s]) => op === 0 ? s : op < 0 ? `[-${s}-]` : `{+${s}+}`).join('')}`);
    for (const x of d.added || []) L.push(`  + ${x}`);
    for (const x of d.removed || []) L.push(`  - ${x}`);
    const more = d.more || {}, extra = (more.added || 0) + (more.removed || 0) + (more.changed || 0); if (extra) L.push(`  ... and ${extra} more`);
    L.push('');
  }
  return L.join('\n').trim();
}

module.exports = {sectionDiff, wordParts, similarity, logText, linesOf};
