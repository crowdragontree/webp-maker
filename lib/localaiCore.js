'use strict';
/* Local AI rewrite (v1.4.1): everything except running the model, so it can be tested on its own.
 * A small open model (Qwen3.5 9B) running on this computer reads a passage and lists only the sentences that are broken or clearly awkward,
 * each with a rewrite. The app shows every rewrite as a suggestion (Fix / Ignore); nothing is changed on its own.
 *   messages(text, tense) -> the chat messages sent to the model
 *   SCHEMA                -> the JSON shape the model is held to (llama.cpp enforces it while it writes)
 *   toMatches(text, answer, opts) -> LanguageTool-shaped matches {offset, length, message, replacements, rule}
 * Safety nets, because a model can drift: a rewrite is dropped when it changes quoted dialogue, a {{marker}}, a link or a picture, when it
 * cannot be found word for word in the text, or when it is far longer or shorter than the sentence it replaces. */

const PROMPT_VERSION = 3;   // part of the saved-answers key: a changed prompt never reuses old answers

function tenseRule(tense) {
  if (tense === 'past') return 'The narration is written in the PAST tense. Every rewrite keeps it in the past tense. Never turn narration into the present tense.';
  if (tense === 'present') return 'The narration is written in the PRESENT tense. Every rewrite keeps it in the present tense. Never turn narration into the past tense.';
  return 'Keep each sentence in the tense the narration around it already uses.';
}
function messages(text, tense) {
  const system = [
    'You are a careful line editor for interactive fiction: character introductions and opening scenes for adult chat bots.',
    'Find the sentences in the NARRATION that are ungrammatical, broken, confusing, or clearly awkward, and rewrite only those sentences so they read naturally.',
    'Rules:',
    '- ' + tenseRule(tense),
    '- Time words such as tonight, now, today and ago stay exactly as written.',
    '- Never change anything inside quotation marks. Dialogue is written casually on purpose.',
    '- Never change {{user}}, {{char}}, anything in curly or square brackets, links, picture markers, or asterisks.',
    '- Keep the author\'s voice, meaning, names, facts and point of view (second person "you" stays "you"). Do not add new information, do not make it formal, and do not soften or censor any content.',
    '- Only list a sentence when it has a real problem: a grammar mistake, a verb in the wrong tense, missing or doubled words, or a structure that does not make sense. A sentence that is fine is left out. Style preferences are not problems.',
    '- "original" must be the sentence copied character for character from the text, without the asterisks around it. "rewrite" is the whole corrected sentence. "reason" is a few words.',
    'If nothing needs fixing, return {"edits": []}.'
  ].join('\n');
  return [{role: 'system', content: system}, {role: 'user', content: 'Text:\n\n' + String(text)}];
}
const SCHEMA = {
  type: 'object',
  properties: {edits: {type: 'array', maxItems: 12, items: {type: 'object', properties: {original: {type: 'string', maxLength: 600}, rewrite: {type: 'string', maxLength: 700}, reason: {type: 'string', maxLength: 120}}, required: ['original', 'rewrite', 'reason']}}},
  required: ['edits']
};

// ---------------------------------------------------------------- finding the sentence in the text
// The model may straighten curly quotes or change spacing: both texts are compared in a normalised form that remembers where each character came from.
function normalised(s) {
  const out = [], at = [];
  let prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (/[“”„″]/.test(c)) c = '"'; else if (/[‘’′]/.test(c)) c = "'"; else if (c === '…') c = '.'; else if (/[–—]/.test(c)) c = '-';
    if (/\s/.test(c)) { if (prevSpace) continue; c = ' '; prevSpace = true; } else prevSpace = false;
    out.push(c); at.push(i);
  }
  return {text: out.join(''), at};
}
function locate(text, original, from) {
  const o = String(original || '').replace(/^[\s*_]+|[\s*_]+$/g, ''); if (o.length < 3) return null;
  let i = text.indexOf(o, from || 0); if (i < 0) i = text.indexOf(o);
  if (i >= 0) return {start: i, end: i + o.length};
  const T = normalised(text), O = normalised(o).text.trim();
  if (O.length < 3) return null;
  const j = T.text.indexOf(O); if (j < 0) return null;
  return {start: T.at[j], end: T.at[j + O.length - 1] + 1};
}

// ---------------------------------------------------------------- checks on a rewrite
const quotes = s => (String(s).match(/["“][^"”\n]*["”]/g) || []).map(q => q.replace(/[“”]/g, '"'));
const markers = s => (String(s).match(/\{\{[^}]*\}\}|\[[^\]\n]*\]|!?\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/g) || []).sort();
function insideDialogue(text, at) {
  const line = text.slice(text.lastIndexOf('\n', at - 1) + 1, at);
  return ((line.match(/["“”]/g) || []).length % 2) === 1;
}
function acceptable(text, span, rewrite) {
  const orig = text.slice(span.start, span.end), rw = String(rewrite || '').trim();
  if (!rw || rw === orig) return false;
  if (normalised(rw).text === normalised(orig).text) return false;
  if (/\*/.test(orig) || /\*/.test(rw)) return false;                                         // never across or into the *formatting*
  if (/\n/.test(rw) && !/\n/.test(orig)) return false;
  const r = rw.length / Math.max(1, orig.length); if (r < 0.45 || r > 2.2) return false;
  if (JSON.stringify(quotes(orig)) !== JSON.stringify(quotes(rw))) return false;             // dialogue stays word for word
  if (JSON.stringify(markers(orig)) !== JSON.stringify(markers(rw))) return false;           // {{user}}, links, pictures, [tags] stay
  if (insideDialogue(text, span.start)) return false;
  return true;
}

// ---------------------------------------------------------------- the model's answer -> matches
function parseAnswer(raw) {
  let s = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < a) return [];
  try { const o = JSON.parse(s.slice(a, b + 1)); return Array.isArray(o.edits) ? o.edits : []; } catch (_) { return []; }
}
function toMatches(text, answer, opts) {
  opts = opts || {};
  const src = String(text == null ? '' : text), edits = Array.isArray(answer) ? answer : parseAnswer(answer), out = [], taken = [];
  for (const e of edits) {
    if (!e || typeof e.original !== 'string' || typeof e.rewrite !== 'string') continue;
    const span = locate(src, e.original); if (!span) continue;
    if (taken.some(t => span.start < t.end && t.start < span.end)) continue;
    let rw = e.rewrite.trim().replace(/^[*_]+|[*_]+$/g, '');
    const orig = src.slice(span.start, span.end);
    if (/[’]/.test(orig)) rw = rw.replace(/'/g, '’');                                              // keep the text's own apostrophes and quotes
    if (/[“”]/.test(orig)) { let k = 0; rw = rw.replace(/"/g, () => (k++ % 2 ? '”' : '“')); }
    if (!acceptable(src, span, rw)) continue;
    taken.push(span);
    const reason = String(e.reason || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
    out.push({offset: span.start, length: span.end - span.start, message: (reason ? reason[0].toUpperCase() + reason.slice(1) : 'This sentence reads awkwardly') + '.', replacements: [rw], rule: 'LOCALAI'});
  }
  return out.sort((x, y) => x.offset - y.offset);
}
// worth sending at all: narration with a few sentences (single words, lists and short fields are left to Harper and the built-in check)
function worthChecking(text) {
  const t = String(text || '').replace(/\{\{[^}]*\}\}/g, 'Sam');
  return t.replace(/\s+/g, ' ').trim().length >= 80 && ((t.match(/[a-z][.!?]["”*_]?(\s|$)/g) || []).length >= 2 || t.length >= 200);
}
// long texts are sent in pieces (whole paragraphs), so the model always sees full sentences
function pieces(text, max) {
  max = max || 3500;
  const src = String(text || ''); if (src.length <= max) return [{offset: 0, text: src}];
  const out = []; let start = 0;
  while (start < src.length) {
    let end = Math.min(src.length, start + max);
    if (end < src.length) { const nl = src.lastIndexOf('\n', end); if (nl > start + max / 3) end = nl + 1; else { const dot = src.lastIndexOf('. ', end); if (dot > start + max / 3) end = dot + 2; } }
    out.push({offset: start, text: src.slice(start, end)}); start = end;
  }
  return out;
}
module.exports = {PROMPT_VERSION, messages, SCHEMA, locate, acceptable, parseAnswer, toMatches, worthChecking, pieces, normalised};
