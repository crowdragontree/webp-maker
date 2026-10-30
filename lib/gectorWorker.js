'use strict';
/* GECToR worker (v1.4.0). Runs as its own small process (the app starts it with ELECTRON_RUN_AS_NODE), so the model never slows the window down
 * and a crash here cannot take the app with it. It loads ONNX Runtime and the model from the folders the app installed them in, then answers
 * {id, op: 'check', text, tense} with LanguageTool-shaped matches. Everything stays on this computer. */
const fs = require('fs'), path = require('path'), os = require('os');
const core = require('./gectorCore');
let ort = null, session = null, tok = null, labels = null, verbs = null, labelOut = '', errOut = '', toward = {past: [], present: []};
const memo = new Map();                                             // a sentence the model already read is not read again (edits re-check only what changed)

const half = h => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? s * Math.pow(2, -14) * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + f / 1024); };
const floats = t => (t.type === 'float16' ? Float32Array.from(t.data, half) : t.data);
function softmaxRow(d, off, n) { let m = -Infinity; for (let i = 0; i < n; i++) if (d[off + i] > m) m = d[off + i]; let s = 0; const o = new Float32Array(n); for (let i = 0; i < n; i++) { o[i] = Math.exp(d[off + i] - m); s += o[i]; } for (let i = 0; i < n; i++) o[i] /= s; return o; }

async function load(dir, runtime) {
  ort = require(path.join(runtime, 'node_modules', 'onnxruntime-node'));
  tok = core.loadTokenizer(fs.readFileSync(path.join(dir, 'tokenizer.json'), 'utf8'));
  labels = core.loadLabels(fs.readFileSync(path.join(dir, 'labels.json'), 'utf8'));
  verbs = core.loadVerbs(fs.existsSync(path.join(dir, 'verb-form-vocab.txt')) ? fs.readFileSync(path.join(dir, 'verb-form-vocab.txt'), 'utf8') : '');
  // the verb-form edits that move a verb toward past or toward present narration (base forms are left out: "to go", "did go" stay as they are)
  const idx = l => labels.labels.indexOf(l);
  toward = {past: ['$TRANSFORM_VERB_VBZ_VBD', '$TRANSFORM_VERB_VBP_VBD'].map(idx).filter(i => i >= 0), present: ['$TRANSFORM_VERB_VBD_VBZ', '$TRANSFORM_VERB_VBD_VBP'].map(idx).filter(i => i >= 0)};
  const threads = Math.max(1, Math.min(4, (os.cpus() || []).length - 1));
  session = await ort.InferenceSession.create(path.join(dir, 'model.onnx'), {executionProviders: ['cpu'], intraOpNumThreads: threads, interOpNumThreads: 1, graphOptimizationLevel: 'all'});
  const outs = session.outputNames;
  labelOut = ['label_probs', 'logits_labels', 'logits'].find(n => outs.includes(n)) || outs[0];
  errOut = ['error_probs', 'logits_d', 'detect_probs'].find(n => outs.includes(n)) || outs.find(n => n !== labelOut) || '';
  return {inputs: session.inputNames, outputs: outs};
}

async function predict(words) {
  const key = words.join('\u0000'); if (memo.has(key)) return memo.get(key);
  const enc = tok.encodeWords(words, Math.max(labels.maxLength || 128, 64)); if (!enc) return null;
  const T = enc.ids.length, feeds = {};
  const big = a => new ort.Tensor('int64', BigInt64Array.from(a, x => BigInt(x)), [1, T]);
  for (const name of session.inputNames) {
    if (/input_ids/.test(name)) feeds[name] = big(enc.ids);
    else if (/attention_mask/.test(name)) feeds[name] = big(enc.ids.map(() => 1));
    else if (/token_type_ids/.test(name)) feeds[name] = big(enc.ids.map(() => 0));
  }
  const res = await session.run(feeds), lt = res[labelOut], et = errOut ? res[errOut] : null;
  const L = lt.dims[lt.dims.length - 1], ld = floats(lt), isLogits = /logit/.test(labelOut);
  const n = Math.min(L, labels.labels.length);
  let errAt;
  if (et) {
    const ed = floats(et);
    if (et.dims.length === 3) { const k = et.dims[2]; errAt = /logit/.test(errOut) ? pos => softmaxRow(ed, pos * k, k)[1] : pos => ed[pos * k + 1]; }   // [CORRECT, INCORRECT, ...]
    else errAt = pos => ed[pos];
  } else errAt = () => 1;
  const out = enc.first.map(pos => {
    const row = isLogits ? softmaxRow(ld, pos * L, L) : ld.subarray(pos * L, pos * L + L);
    let best = 0; for (let i = 1; i < n; i++) if (row[i] > row[best]) best = i;
    // how strongly the model leans toward a past (or present) form of this word, even when that is not its first choice
    const lean = list => { let b = -1, p = 0; for (const i of list) if (i < n && row[i] > p) { p = row[i]; b = i; } return b < 0 ? null : {label: b, prob: p}; };
    return {label: best, prob: row[best], err: errAt(pos), past: lean(toward.past), present: lean(toward.present)};
  });
  if (memo.size > 3000) memo.clear(); memo.set(key, out);
  return out;
}

process.on('message', async msg => {
  const reply = x => { try { process.send(Object.assign({id: msg && msg.id}, x)); } catch (_) { /* the app went away */ } };
  try {
    if (!msg || typeof msg !== 'object') return;
    if (msg.op === 'load') return reply({ok: true, info: await load(msg.dir, msg.runtime)});
    if (msg.op === 'check') {
      if (!session) throw new Error('GECToR is not loaded.');
      const matches = await core.check(String(msg.text || ''), predict, {labels, verbs, tense: msg.tense === 'past' || msg.tense === 'present' ? msg.tense : ''});
      return reply({ok: true, matches});
    }
    if (msg.op === 'quit') { reply({ok: true}); setTimeout(() => process.exit(0), 20); }
  } catch (er) { reply({ok: false, error: String(er && er.message || er)}); }
});
process.on('disconnect', () => process.exit(0));
