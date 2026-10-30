'use strict';
/* GECToR grammar checking (v1.4.0): everything except running the model. No packages, no native code, so it can be tested on its own.
 * GECToR (Grammarly's "Tag, Not Rewrite", 2020) reads a sentence and gives every word one edit: keep it, delete it, replace it, add a word after it,
 * or change its verb form / singular-plural. The model used is DeepQuill's English GECToR trained for fiction (Apache-2.0).
 *
 * What it reads: narration only. Quoted dialogue, {{markers}}, links, pictures, HTML and [tags] are never changed: dialogue and markers stay in the
 * sentence as placeholders (so the sentence still reads as a sentence), links/pictures/tags end the sentence.
 * What it returns: LanguageTool-shaped matches {offset, length, message, replacements, rule, single, before, after}, so the app shows them like any other finding.
 * The tense filter: when the narration is set to past (or present), a suggestion that turns a verb back into the other tense is dropped. */

// ---------------------------------------------------------------- RoBERTa byte-level BPE (the tokenizer.json that comes with the model)
const BYTE_ENC = (() => {
  const bs = []; for (let i = 33; i <= 126; i++) bs.push(i); for (let i = 161; i <= 172; i++) bs.push(i); for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice(); let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++; }
  const m = new Array(256); bs.forEach((b, i) => { m[b] = String.fromCharCode(cs[i]); }); return m;
})();
const PRETOK = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
function findType(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  for (const k of ['pretokenizers', 'processors']) for (const x of node[k] || []) { const r = findType(x, type); if (r) return r; }
  return null;
}
function loadTokenizer(json) {
  const t = typeof json === 'string' ? JSON.parse(json) : json, model = t.model || {}, vocab = model.vocab || {};
  if (model.type && model.type !== 'BPE') throw new Error(`The tokenizer is ${model.type}, not BPE.`);
  const ranks = new Map(); (model.merges || []).forEach((m, i) => ranks.set(Array.isArray(m) ? m.join(' ') : m, i));
  const added = new Map(); for (const a of t.added_tokens || []) if (a && typeof a.content === 'string') added.set(a.content, a.id);
  const bl = findType(t.pre_tokenizer, 'ByteLevel'), prefix = bl ? bl.add_prefix_space !== false : true, useRegex = bl ? bl.use_regex !== false : true;
  const idOf = s => (added.has(s) ? added.get(s) : vocab[s]);
  let cls = idOf('<s>'), sep = idOf('</s>');
  const pp = t.post_processor || {}, rp = findType(pp, 'RobertaProcessing'), tp = findType(pp, 'TemplateProcessing');
  if (rp && rp.cls && rp.sep) { cls = rp.cls[1]; sep = rp.sep[1]; }
  else if (tp && tp.special_tokens) { const st = tp.special_tokens; if (st['<s>'] && st['<s>'].ids) cls = st['<s>'].ids[0]; if (st['</s>'] && st['</s>'].ids) sep = st['</s>'].ids[0]; }
  if (cls == null) cls = 0; if (sep == null) sep = 2;
  const unk = idOf(model.unk_token || '<unk>') ?? 3, pad = idOf('<pad>') ?? 1;
  const cache = new Map();
  function bpe(token) {
    if (cache.has(token)) return cache.get(token);
    let word = Array.from(token);
    while (word.length > 1) {
      let best = -1, bestRank = Infinity;
      for (let i = 0; i < word.length - 1; i++) { const r = ranks.get(word[i] + ' ' + word[i + 1]); if (r !== undefined && r < bestRank) { bestRank = r; best = i; } }
      if (best < 0) break;
      const a = word[best], b = word[best + 1], nw = [];
      for (let i = 0; i < word.length;) { if (i < word.length - 1 && word[i] === a && word[i + 1] === b) { nw.push(a + b); i += 2; } else { nw.push(word[i]); i++; } }
      word = nw;
    }
    if (cache.size > 20000) cache.clear(); cache.set(token, word); return word;
  }
  function encodeWord(word) {
    if (added.has(word)) return [added.get(word)];
    const s = (prefix ? ' ' : '') + word, pieces = useRegex ? (s.match(PRETOK) || []) : [s], out = [];
    for (const p of pieces) { const mapped = Array.from(Buffer.from(p, 'utf8')).map(b => BYTE_ENC[b]).join(''); for (const sub of bpe(mapped)) out.push(vocab[sub] ?? unk); }
    return out.length ? out : [unk];
  }
  // words -> {ids, first (index of each word's first sub-token)}; null when the sentence is too long for the model
  function encodeWords(words, maxLen) {
    const ids = [cls], first = [];
    for (const w of words) { const ws = encodeWord(w); if (ids.length + ws.length + 1 > (maxLen || 512)) return null; first.push(ids.length); for (const x of ws) ids.push(x); }
    ids.push(sep); return {ids, first};
  }
  return {encodeWord, encodeWords, bpe, cls, sep, pad, unk};
}

// ---------------------------------------------------------------- labels and verb forms
function loadLabels(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json, labels = Array.isArray(o) ? o : (o.labels || []);
  if (!labels.length) throw new Error('labels.json has no labels.');
  const keepLabel = (!Array.isArray(o) && o.keep_label) || '$KEEP', keep = labels.indexOf(keepLabel);
  return {labels, keep: keep < 0 ? 0 : keep, maxLength: (!Array.isArray(o) && +o.max_length) || 128};
}
const AUX = [['is', 'was', 'VBZ', 'VBD'], ['are', 'were', 'VBP', 'VBD'], ['am', 'was', 'VBP', 'VBD'], ['has', 'had', 'VBZ', 'VBD'], ['have', 'had', 'VBP', 'VBD'], ['does', 'did', 'VBZ', 'VBD'], ['do', 'did', 'VBP', 'VBD'], ['can', 'could', 'VBP', 'VBD'], ['will', 'would', 'VBP', 'VBD'], ["isn't", "wasn't", 'VBZ', 'VBD'], ["aren't", "weren't", 'VBP', 'VBD'], ["doesn't", "didn't", 'VBZ', 'VBD'], ["don't", "didn't", 'VBP', 'VBD'], ["hasn't", "hadn't", 'VBZ', 'VBD'], ["haven't", "hadn't", 'VBP', 'VBD'], ["can't", "couldn't", 'VBP', 'VBD'], ["won't", "wouldn't", 'VBP', 'VBD']];
function loadVerbs(text) {
  const decode = new Map(), encode = new Map(), forms = new Map();
  const tag = (w, t) => { const k = w.toLowerCase(); if (!forms.has(k)) forms.set(k, new Set()); forms.get(k).add(t); };
  for (const line of String(text || '').split(/\r?\n/)) {
    const c = line.indexOf(':'); if (c < 0) continue;
    const words = line.slice(0, c), tags = line.slice(c + 1).trim(), wu = words.indexOf('_'), tu = tags.indexOf('_'); if (wu < 0 || tu < 0) continue;
    const w1 = words.slice(0, wu), w2 = words.slice(wu + 1), t1 = tags.slice(0, tu), t2 = tags.slice(tu + 1), key = `${w1}_${t1}_${t2}`;
    if (!decode.has(key)) { decode.set(key, w2); encode.set(`${w1}_${w2}`, [t1, t2]); }
    tag(w1, t1); tag(w2, t2);
  }
  for (const [p, q, tp, tq] of AUX) { tag(p, tp); tag(q, tq); const k = `${p}_${tp}_${tq}`; if (!decode.has(k)) decode.set(k, q); }   // "she is" -> "she was"
  for (const [p, q, tp, tq] of AUX) { if (!encode.has(`${p}_${q}`)) encode.set(`${p}_${q}`, [tp, tq]); if (!encode.has(`${q}_${p}`)) encode.set(`${q}_${p}`, [tq, tp]); }
  return {decode, encode, forms};
}
// past = VBD, present = VBZ / VBP. A suggestion that turns a past verb into a present one is dropped when the narration is past, and the other way round.
// A change of one verb form into another: [tag of the old word, tag of the new word], from the verb table (either direction) or the be/have/do table.
function verbTags(verbs, before, after) {
  const a = String(before).toLowerCase().replace(/’/g, "'"), b = String(after).toLowerCase().replace(/’/g, "'");
  const t = verbs.encode.get(`${a}_${b}`); if (t) return t;
  const r = verbs.encode.get(`${b}_${a}`); return r ? [r[1], r[0]] : null;
}
const AFTER_AUX = /^(?:to|did|didn't|do|does|don't|doesn't|would|wouldn't|could|couldn't|can|can't|will|won't|should|shouldn't|might|must|may|n't|not)$/i;
// past narration: a past verb (VBD) never becomes present (VBZ / VBP), nor a bare form (VB) unless a helper word comes first ("didn't went" -> "didn't go").
// present narration: a present verb never becomes past. prev = the word before it.
// Every form a word can be is used ("read" can be past, so "read" -> "reads" is against past narration), not only the one pair the table lists first.
const AFTER_HAVE = /^(?:had|has|have|having|'d|'ve|'s)$/i;
function againstTense(verbs, before, after, tense, prev) {
  if (!verbs || !tense) return false;
  const a = String(before).toLowerCase().replace(/’/g, "'"), b = String(after).toLowerCase().replace(/’/g, "'"); if (a === b) return false;
  const F = verbs.forms || new Map(), ta = F.get(a), tb = F.get(b), pv = String(prev || '');
  if (ta && tb) {
    if (tense === 'past') {
      if (tb.has('VBZ') && !tb.has('VBD')) return true;                                   // never into a present -s form ("came" -> "comes", "read" -> "reads")
      if (ta.has('VBD') && !tb.has('VBD')) return !((tb.has('VBN') && AFTER_HAVE.test(pv)) || ((tb.has('VB') || tb.has('VBP')) && AFTER_AUX.test(pv)));   // "came" -> "come" only after "had" / "didn't"
      return false;
    }
    if (tense === 'present') return (ta.has('VBZ') || ta.has('VBP')) && tb.has('VBD') && !tb.has('VBZ') && !tb.has('VBP') && !tb.has('VB');
    return false;
  }
  const tags = verbTags(verbs, before, after); if (!tags) return false;
  const [o, n] = tags, isPast = t => t === 'VBD', isPresent = t => t === 'VBZ' || t === 'VBP';
  if (tense === 'past') return isPast(o) && (isPresent(n) || (n === 'VB' && !AFTER_AUX.test(pv)));
  if (tense === 'present') return isPresent(o) && isPast(n);
  return false;
}
// past narration: a present verb right after "she / he / they / you / then ..." is a slip ("then deletes the thread" -> "deleted"). Only words the
// verb table knows as present forms, or regular -s verbs right after a pronoun or "then", so nouns ("the threads") are never touched.
const SUBJ_Z = /^(?:he|she|it|then)$/i, SUBJ_P = /^(?:you|they|we|i)$/i;
function tenseSlips(toks, verbs, tense) {
  if (tense !== 'past' || !verbs) return toks;
  let changed = false;
  const out = toks.map((t, i) => {
    if (t.prot || i === 0 || !/^[a-z]+$/i.test(t.w)) return t;
    const prev = toks[i - 1]; if (!prev || prev.prot) return t;
    const w = t.w.toLowerCase(), z = SUBJ_Z.test(prev.w) || (/^then$/i.test(prev.w)), p = SUBJ_P.test(prev.w);
    let past = '';
    if (z) past = /s$/.test(w) && !/ss$/.test(w) ? pastOf(w, verbs) : '';
    else if (p) past = verbs.decode.get(`${w}_VBP_VBD`) || '';
    if (!past || past === w) return t;
    changed = true; return {w: capLike(past, t.w)};
  });
  return changed ? out : toks;
}

// ---------------------------------------------------------------- narration -> sentences of words (with where each word is in the text)
const BREAKS = [/!?\[[^\]\n]{0,300}\]\([^)\n]*\)/g, /<[^>\n]{0,300}>/g, /https?:\/\/\S+/g, /\[[^\]\n]{0,80}\]/g, /`[^`\n]*`/g];
const WORD = /[\p{L}\p{N}]+(?:[-:.,'’][\p{L}\p{N}]+)*|\.{3}|…|[—–]|--|[^\s\p{L}\p{N}*_~]/gu;
const SPLIT_NT = /^(.+?)(n['’]t)$/i, SPLIT_CL = /^(.+?)(['’](?:s|re|ve|ll|d|m))$/i;
function splitWord(w, start) {
  let m = SPLIT_NT.exec(w); if (!m) m = SPLIT_CL.exec(w);
  if (!m || !/\p{L}/u.test(m[1])) return [{w, start, end: start + w.length}];
  return [{w: m[1], start, end: start + m[1].length}, {w: m[2], start: start + m[1].length, end: start + w.length}];
}
function segment(text) {
  const src = String(text == null ? '' : text), n = src.length, kind = new Uint8Array(n);   // 0 text, 1 break, 2 marker, 3 dialogue
  for (const re of BREAKS) { re.lastIndex = 0; let m; while ((m = re.exec(src))) for (let i = m.index; i < m.index + m[0].length; i++) kind[i] = 1; }
  { const re = /\{\{[^}\n]*\}\}/g; let m; while ((m = re.exec(src))) for (let i = m.index; i < m.index + m[0].length; i++) if (!kind[i]) kind[i] = 2; }
  // dialogue: "..." or “...” on one line (an unclosed quote runs to the end of the line)
  for (let i = 0; i < n; i++) {
    if (kind[i] || !/["“]/.test(src[i])) continue;
    const close = src[i] === '“' ? /[”"]/ : /["”]/; let j = i + 1; while (j < n && src[j] !== '\n' && !close.test(src[j])) j++;
    const end = j < n && src[j] !== '\n' ? j + 1 : j; for (let k = i; k < end; k++) if (kind[k] !== 1) kind[k] = 3; i = end - 1;
  }
  const sentences = []; let cur = [];
  const flush = () => { if (cur.filter(t => !t.prot && /[\p{L}]/u.test(t.w)).length >= 3) sentences.push(cur); cur = []; };
  let i = 0;
  while (i < n) {
    const k = kind[i];
    if (src[i] === '\n' || k === 1) { flush(); i++; continue; }
    if (k === 2) { let j = i; while (j < n && kind[j] === 2) j++; cur.push({w: 'Sam', start: i, end: j, prot: true}); i = j; continue; }
    if (k === 3) {
      let j = i; while (j < n && kind[j] === 3 && src[j] !== '\n') j++;
      const inner = src.slice(i, j), tail = /([.,!?]|\.\.\.|…)\s*["”]?\s*$/.exec(inner);
      cur.push({w: '"', start: i, end: j, prot: true}, {w: 'Okay', start: i, end: j, prot: true});
      if (tail) cur.push({w: tail[1] === '…' ? '...' : tail[1], start: i, end: j, prot: true});
      cur.push({w: '"', start: i, end: j, prot: true}); i = j; continue;
    }
    let j = i; while (j < n && !kind[j] && src[j] !== '\n') j++;
    const chunk = src.slice(i, j); WORD.lastIndex = 0; let m;
    while ((m = WORD.exec(chunk))) {
      const at = i + m.index, w = m[0];
      for (const t of splitWord(w, at)) cur.push(Object.assign(t, {w: t.w.replace(/’/g, "'").replace(/…/g, '...')}));
      if (/^(?:[.!?]|\.{3}|…)$/.test(w)) { let p = at + w.length; while (p < n && /[*_"”’)\]\s]/.test(src[p]) && src[p] !== '\n') { if (/\s/.test(src[p])) break; p++; } if (p >= n || /\s/.test(src[p]) || src[p] === '\n') flush(); }
    }
    i = j;
  }
  flush();
  return sentences.map(toks => toks.map((t, k) => Object.assign(t, {oi: k})));
}

// ---------------------------------------------------------------- one GECToR pass: tags -> new word list
// "deletes" -> "deleted", "walks" -> "walked", "watches" -> "watched", "carries" -> "carried": only used when the verb table has no entry
function regularPast(w) {
  if (!/^[a-z]+s$/i.test(w) || w.length < 4) return '';
  if (/[^aeiou]ies$/i.test(w)) return w.slice(0, -3) + 'ied';
  if (/(?:ss|x|z|ch|sh)es$/i.test(w)) return w.slice(0, -2) + 'ed';
  if (/es$/i.test(w) && !/(?:ss|x|z|ch|sh)es$/i.test(w)) return w.slice(0, -1) + 'd';
  return w.slice(0, -1) + 'ed';
}
// the past form of a present -s verb: the verb table first (also through its base form: "reads" -> "read" -> "read"), the regular rule only for
// verbs the table does not know at all
function pastOf(w, verbs) {
  const lw = String(w).toLowerCase(); if (!/^[a-z]+s$/.test(lw)) return '';
  const base = /[^aeiou]ies$/.test(lw) ? lw.slice(0, -3) + 'y' : /(?:ss|x|z|ch|sh|o)es$/.test(lw) ? lw.slice(0, -2) : lw.slice(0, -1);
  if (verbs) {
    const d = verbs.decode.get(`${lw}_VBZ_VBD`) || verbs.decode.get(`${base}_VB_VBD`) || verbs.decode.get(`${base}_VBP_VBD`); if (d) return d;
    if (verbs.forms && (verbs.forms.has(lw) || verbs.forms.has(base))) return '';
  }
  return regularPast(lw);
}
const capLike = (w, like) => (like && /^[A-Z]/.test(like) && /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w);
function applyTags(tokens, tags, verbs, allow) {
  const out = [], neu0 = w => ({w}), ok = allow || (() => true);
  const t0 = tags[0]; if (t0 && t0.startsWith('$APPEND_')) out.push(neu0(t0.slice(8)));
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i], tag = tags[i + 1];
    if (!tag || tok.prot) { out.push(tok); continue; }
    const prevW = i > 0 ? tokens[i - 1].w : '', neu = w => (ok(tok, w, prevW) ? neu0(w) : tok);   // an edit against the narration tense keeps the word
    if (tag === '$DELETE') continue;
    if (tag.startsWith('$REPLACE_')) { out.push(neu(capLike(tag.slice(9), tok.w))); continue; }
    if (tag.startsWith('$APPEND_')) { out.push(tok, neu0(tag.slice(8))); continue; }
    if (tag.startsWith('$TRANSFORM_VERB_')) {
      const [a, b] = tag.slice(16).split('_'), w = (verbs && (verbs.decode.get(`${tok.w}_${a}_${b}`) || verbs.decode.get(`${tok.w.toLowerCase()}_${a}_${b}`))) || (a === 'VBZ' && b === 'VBD' ? pastOf(tok.w, verbs) : '');
      out.push(w ? neu(capLike(w, tok.w)) : tok); continue;
    }
    if (tag === '$TRANSFORM_AGREEMENT_SINGULAR') { out.push(/s$/i.test(tok.w) && tok.w.length > 2 ? neu(tok.w.slice(0, -1)) : tok); continue; }
    if (tag === '$TRANSFORM_AGREEMENT_PLURAL') { out.push(neu(tok.w + 's')); continue; }
    if (tag === '$TRANSFORM_SPLIT_HYPHEN') { const parts = tok.w.split('-').filter(Boolean); if (parts.length > 1) parts.forEach(p => out.push(neu0(p))); else out.push(tok); continue; }
    if (tag === '$MERGE_SPACE' || tag === '$MERGE_HYPHEN') {
      const nx = tokens[i + 1]; if (!nx || nx.prot) { out.push(tok); continue; }
      out.push(neu0(tok.w + (tag === '$MERGE_HYPHEN' ? '-' : '') + nx.w)); i++; continue;
    }
    out.push(tok);                                                     // $KEEP, $TRANSFORM_CASE_* (not used: casing is left to you) and anything unknown
  }
  return out;
}
// the tags for one pass from the model's answer: a sentence is only touched when some word is likely wrong, and a tag only when it is likely right
// The tense you chose: a verb the model leans toward turning into that tense ("then deletes" in past narration -> "deleted") is accepted at a lower
// bar (tenseMinProb, 0.15), because the tense is already known. Nouns that look like verbs ("the threads") get almost no such lean, so they stay.
function pickTags(pred, labels, opts) {
  const minErr = opts.minErrorProb != null ? opts.minErrorProb : 0.6, minProb = opts.minProb != null ? opts.minProb : 0.6, minTense = opts.tenseMinProb != null ? opts.tenseMinProb : 0.15;
  if (!pred || !pred.length) return null;
  const gate = Math.max(...pred.map(p => p.err)) >= minErr, tense = opts.tense === 'past' || opts.tense === 'present' ? opts.tense : '';
  let any = false;
  const tags = pred.map((p, i) => {
    const lab = labels.labels[p.label];
    if (gate && i > 0 && p.label !== labels.keep && lab && !/^(?:<PAD>|@@PADDING@@|@@UNKNOWN@@)$/.test(lab) && p.prob >= minProb && !/^\$TRANSFORM_CASE/.test(lab)) { any = true; return lab; }
    if (gate && i === 0 && lab && lab.startsWith('$APPEND_') && p.prob >= minProb) { any = true; return lab; }
    const lean = tense && i > 0 ? p[tense] : null;
    if (lean && lean.prob >= minTense && labels.labels[lean.label]) { any = true; return labels.labels[lean.label]; }
    return null;
  });
  return any ? tags : null;
}

// ---------------------------------------------------------------- final words -> findings in the original text
const NO_SPACE_BEFORE = /^(?:[.,!?;:%)\]}…]|\.\.\.|n't|'s|'re|'ve|'ll|'d|'m)$/i, NO_SPACE_AFTER = /^[(\[{$]$/;
function detok(words) {
  let s = '';
  words.forEach((w, i) => { if (i && !NO_SPACE_BEFORE.test(w) && !NO_SPACE_AFTER.test(words[i - 1])) s += ' '; s += w; });
  return s;
}
function findings(src, orig, final, opts) {
  const out = [], groups = []; let prev = -1, add = [];
  for (const t of final) {
    if (t.oi === undefined) { add.push(t); continue; }
    if (t.oi !== prev + 1 || add.length) groups.push({from: prev + 1, to: t.oi, add}); add = []; prev = t.oi;
  }
  if (prev + 1 < orig.length || add.length) groups.push({from: prev + 1, to: orig.length, add});
  for (const g of groups) {
    const O = orig.slice(g.from, g.to), A = g.add.map(t => t.w);
    if (!O.length && !A.length) continue;
    if (O.some(t => t.prot)) continue;
    if (O.length === 1 && A.length === 1 && againstTense(opts.verbs, O[0].w, A[0], opts.tense, g.from > 0 ? orig[g.from - 1].w : '')) continue;   // the tense you chose wins
    const p = orig[g.from - 1], nx = orig[g.to];
    let a, b, words;
    if (O.length && A.length) { a = O[0].start; b = O[O.length - 1].end; words = A; }
    else if (A.length) {                                               // something added: shown on the word next to it
      if (p && !p.prot) { a = p.start; b = p.end; words = [p.w, ...A]; } else if (nx && !nx.prot) { a = nx.start; b = nx.end; words = [...A, nx.w]; } else continue;
    } else {                                                           // something removed: the word before it stays
      if (p && !p.prot) { a = p.start; b = O[O.length - 1].end; words = [p.w]; } else if (nx && !nx.prot) { a = O[0].start; b = nx.start; words = []; } else continue;
    }
    const span = src.slice(a, b);
    { let rest = span; for (const t of orig) if (t.start >= a && t.end <= b && !t.prot) rest = rest.split(src.slice(t.start, t.end)).join(''); if (/[^\s]/.test(rest)) continue; }   // only plain words and spaces are ever replaced
    let fix = detok(words);
    if (/’/.test(span)) fix = fix.replace(/'/g, '’');
    const firstWord = orig.findIndex(t => !t.prot);
    if (g.from <= firstWord && /^[A-Z]/.test(span) && /^[a-z]/.test(fix)) fix = fix[0].toUpperCase() + fix.slice(1);
    if (fix === span) continue;
    const q = s => '“' + s + '”', before = O.map(t => src.slice(t.start, t.end)).join(' ');
    const message = !A.length ? `Remove ${q(before)}.` : !O.length ? `Add ${q(A.join(' ').replace(/ (n't|'\w+)/g, '$1'))} here.` : `${q(before)} should be ${q(detok(A))}.`;
    out.push({offset: a, length: b - a, message, replacements: [fix], rule: 'GECTOR', single: O.length === 1 && A.length === 1, before, after: detok(A)});
  }
  return out;
}

// ---------------------------------------------------------------- the whole check: text -> matches. predict(words) -> [{label, prob, err}] per word (first is $START)
async function check(text, predict, opts) {
  opts = opts || {};
  const src = String(text == null ? '' : text), passes = opts.passes || 3, out = [];
  for (const orig of segment(src)) {
    if (orig.length > (opts.maxWords || 90)) continue;
    let toks = orig.slice(), changed = false;
    for (let pass = 0; pass < passes; pass++) {
      const pred = await predict(['$START', ...toks.map(t => t.w)]); if (!pred) break;
      const tags = pickTags(pred, opts.labels, opts); if (!tags) break;
      const next = applyTags(toks, tags, opts.verbs, (tok, w, prev) => !againstTense(opts.verbs, tok.w, w, opts.tense, prev));
      if (next.map(t => t.w).join('\u0000') === toks.map(t => t.w).join('\u0000')) break;
      toks = next; changed = true;
    }
    { const t2 = tenseSlips(toks, opts.verbs, opts.tense); if (t2 !== toks) { toks = t2; changed = true; } }
    if (changed) out.push(...findings(src, orig, toks, opts));
  }
  return out;
}

module.exports = {loadTokenizer, loadLabels, loadVerbs, segment, applyTags, pickTags, findings, detok, againstTense, tenseSlips, regularPast, check, BYTE_ENC};
