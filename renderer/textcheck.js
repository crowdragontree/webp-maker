/* Local spelling, grammar and wording check (v1.2.0). It runs entirely on this computer: no AI, no internet, no credits.
 *   spelling  - every word is looked up in the built-in American English word list (enus-words.js); names are never flagged
 *   grammar   - a short list of rules that are almost never wrong: a repeated word, "a apple", "she have", "could of", a missing capital or space...
 *   wording   - the plain-English rule the AI is held to, now checked by the app: an object called sick or tired, a hint where a fact belongs
 *               ("a habit she does not share"), fancy words, stock phrases, very long sentences
 * check(text, {names, ignore}) -> hits [{start, end, text, kind, msg, fix, suggest}]; apply(text, [{start, end, replacement}]) -> new text. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TextCheck = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  let WORDS = null;
  const words = () => {
    if (WORDS) return WORDS;
    let raw = root && root.TC_WORDS; if (!raw && typeof require === 'function') { try { raw = require('./enus-words.js'); } catch (_) { raw = ''; } }
    WORDS = new Set(String(raw || '').split(' ')); return WORDS;
  };
  const q = s => '“' + s + '”';
  const cap = (s, like) => like && like[0] !== like[0].toLowerCase() ? s[0].toUpperCase() + s.slice(1) : s;

  // ---------------------------------------------------------------- what is not checked: markers, links, tags, HTML, names in {{ }}
  const MASKS = [/\{\{[^}\n]*\}\}/g, /<[^>\n]{0,300}>/g, /!?\[[^\]\n]{0,120}\]\([^)\n]*\)/g, /\[[^\]\n]{0,60}\]/g, /https?:\/\/\S+/g, /\b[\w-]+(?:\.[\w-]+)*\.(?:com|ca|net|org|io|co|app|me)\b\S*/gi, /`[^`\n]*`/g, /\b[A-Za-z]*\d[A-Za-z\d]*\b/g];
  function mask(text) {
    let t = String(text == null ? '' : text);
    for (const re of MASKS) t = t.replace(re, m => '\u0001'.repeat(m.length));      // same length, so every position still matches the original text
    // v1.2.6: a run of 60+ characters with no space (a pasted hash, a smashed key, a wall of letters) is no word: it is left out, which also keeps
    // the check fast (a 100,000-character run took about 12 seconds; the rules now never see it)
    t = t.replace(/[^\s\u0001]{60,}/g, m => '\u0001'.repeat(m.length));
    return t;
  }

  // ---------------------------------------------------------------- spelling
  const APOS = {dont: "don't", isnt: "isn't", wasnt: "wasn't", didnt: "didn't", doesnt: "doesn't", couldnt: "couldn't", wouldnt: "wouldn't", shouldnt: "shouldn't", havent: "haven't", hasnt: "hasn't", hadnt: "hadn't", arent: "aren't", werent: "weren't", ive: "I've", youre: "you're", theyre: "they're", thats: "that's", whats: "what's", theres: "there's", heres: "here's", wouldve: "would've", couldve: "could've", shouldve: "should've", im: "I'm", ill: null, hes: "he's", shes: "she's"};
  const SKIP_INTERJ = /^(?:a+h+|o+h+|h+m+|m+h*m*|u+h+|e+h+|a+w+|e+w+|g+r+|s+h+|t+s+k+|p+s+t+|b+r+|n+g+h+|a+r+g+h+|u+g+h+|y+a+h+|n+o+|w+o+w+|o+o+f+|y+e+s+|h+a+|h+e+|a+y+|o+w+|m+m+|a+a+|e+e+|o+o+|u+u+|u+m+|e+r+m*|h+u+h+)$/i;
  const PREFIX = new Set(['pre', 'post', 'non', 'anti', 'semi', 'multi', 'co', 'ex', 'self', 'sub', 'over', 'under', 'mid', 'half', 'quasi', 'pseudo', 'ultra', 'inter', 'intra', 'counter', 'cross', 'de', 'dis', 'mis', 'out', 'up', 're', 'un', 'in', 'x']);
  function known(lc) {
    const W = words();
    if (W.has(lc)) return true;
    const w = lc.replace(/’/g, "'");
    if (W.has(w)) return true;
    if (/'s$/.test(w) && W.has(w.slice(0, -2))) return true;
    if (/s'$/.test(w) && W.has(w.slice(0, -1))) return true;
    if (/n't$/.test(w) && (W.has(w.slice(0, -3)) || W.has(w.slice(0, -2)))) return true;
    const m = w.match(/^(.+)'(?:d|ll|re|ve|m)$/); if (m && W.has(m[1])) return true;
    if (w.includes('-')) { const parts = w.split('-').filter(Boolean); if (parts.length > 1 && parts.every(p => p.length < 2 || PREFIX.has(p) || known(p))) return true; }
    const sq = w.replace(/(.)\1{2,}/g, '$1$1'), one = w.replace(/(.)\1+/g, '$1'); if ((sq !== w && W.has(sq)) || (one !== w && W.has(one))) return true;   // "nooo", "sooo"
    return false;
  }
  const ALPHA = "abcdefghijklmnopqrstuvwxyz'";
  function suggestions(word) {
    const W = words(), w = word.toLowerCase(), out = new Map();
    const add = (c, score) => { if (c !== w && W.has(c) && (!out.has(c) || out.get(c) > score)) out.set(c, score + (c[0] === w[0] ? 0 : 3) + (Math.abs(c.length - w.length) ? 0.5 : 0)); };
    for (let i = 0; i < w.length; i++) add(w.slice(0, i) + w.slice(i + 1), 1.2);                                  // one letter too many
    for (let i = 0; i < w.length - 1; i++) add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2), 0.6);           // two letters swapped
    for (let i = 0; i < w.length; i++) for (const ch of ALPHA) add(w.slice(0, i) + ch + w.slice(i + 1), 1);      // one letter wrong
    for (let i = 0; i <= w.length; i++) for (const ch of ALPHA) add(w.slice(0, i) + ch + w.slice(i), 1.1);       // one letter missing
    if (!out.size && w.length > 4) { for (let i = 1; i < w.length; i++) { const a = w.slice(0, i), b = w.slice(i); if (W.has(a) && W.has(b) && a.length > 2 && b.length > 2) { out.set(a + ' ' + b, 4); break; } } }   // two words run together
    return [...out.entries()].sort((a, b) => a[1] - b[1]).slice(0, 5).map(x => x[0]);
  }

  // ---------------------------------------------------------------- wording
  const OBJ = 'van|truck|car|vehicle|engine|motor|furnace|boiler|heater|machine|house|home|apartment|building|phone|laptop|computer|bike|roof|oven|stove|fridge|pipes?|sink|door|window|floor|wall|walls|bus|boat|ship|plane|elevator|printer|generator|compressor|transmission|radiator|battery|tractor|truck bed|trailer';
  const HUMAN_STATE = 'sick|ill|dying|tired|angry|hungry|sleepy|moody|grumpy|cranky|limping|wheezing|coughing|bleeding|sulking|pouting|lonely|sad|depressed|jealous|shy|nervous|exhausted|hurting|suffering|weak|wounded|injured|healthy|alive';
  const PERSON = new RegExp(`(\\b(?:the|a|an|her|his|their|our|my|your|its)\\s+(?:\\w+\\s+){0,2}?(${OBJ})\\b(?:\\s+(?:that|which|who))?\\s+)(has been|have been|had been|is|was|are|were|feels?|felt|looks?|looked|seems?|seemed|got|gets|getting|keeps?|kept|been|grew|grows)\\s+(?:\\w+\\s+){0,1}?(${HUMAN_STATE})\\b`, 'gi');
  // a plain way to say it for a machine, vehicle or house that is called sick, tired or dying (the creator still decides: it is only offered)
  const REPAIRABLE = /^(?:sick|ill|dying|tired|exhausted|weak|wounded|injured|hurting|suffering|limping|wheezing|coughing|bleeding)$/i;
  function personFix(m) {
    const obj = m[2], verb = m[3].toLowerCase().replace(/\s+/g, ' '), st = m[4].toLowerCase();
    if (!REPAIRABLE.test(st)) return null;
    const pl = /^(?:pipes|walls)$/i.test(obj), dying = st === 'dying';
    if (/^(?:has|have|had) been$/.test(verb)) return m[1] + verb.split(' ')[0] + (dying ? ' been falling apart' : ' needed repairs');
    if (/^(?:is|are|feels?|looks?|seems?|keeps?)$/.test(verb)) return m[1] + (dying ? (pl ? 'are' : 'is') + ' falling apart' : (pl ? 'need' : 'needs') + ' repairs');
    if (/^(?:was|were|felt|looked|seemed|kept)$/.test(verb)) return m[1] + (dying ? (pl ? 'were' : 'was') + ' falling apart' : 'needed repairs');
    return null;
  }
  const TEASE_NOUN = 'habit|secret|problem|issue|thing|trouble|worry|debt|past|plan|reason|fear|lie|mess|situation|thing';
  const TEASE_VERB = "does not|doesn't|did not|didn't|has not|hasn't|have not|haven't|never|won't|will not|keeps?|kept|has been keeping|hides?|hid|has been hiding|refuses? to|is not ready to|has yet to|cannot|can't";
  const TEASE_SAY = 'share|tell|talk about|say|mention|explain|admit|show|reveal|discuss|speak about|name|face';
  const TEASE = new RegExp(`\\b(?:a|an|some|one|the)\\s+(?:[\\w-]+\\s+){0,3}?(${TEASE_NOUN})\\s+(?:that\\s+)?(?:she|he|they|[A-Z][a-z]+|{{user}}|you)\\s+(?:${TEASE_VERB})\\s+(?:[\\w-]+\\s+){0,2}?(?:${TEASE_SAY})\\b`, 'gi');
  const VAGUE = [
    [/\bsomething\s+(?:is|was|feels|felt|seems|seemed|has been)\s+(?:wrong|off|different|going on|up|not right|bothering)\b/gi, 'something is wrong', 'says only that something is wrong. Say what it is.'],
    [/\b(?:is|was|has been|keeps?|kept)\s+(?:hiding|keeping|holding back)\s+something\b/gi, 'hiding something', 'says she is hiding something, not what. Name it.'],
    [/\bsome\s+(?:kind|sort)\s+of\s+(?:problem|trouble|secret|issue)\b/gi, 'some kind of problem', 'names a problem without saying what it is. Name it.'],
    [/\ba\s+(?:secret|problem|burden|weight|truth|past)\s+(?:she|he|they)\s+(?:carries|carried|is carrying|has been carrying|bears|keeps)\b/gi, 'a secret she carries', 'points at a secret without saying what it is. Name it.']
  ];
  const FANCY = {utilize: 'use', utilise: 'use', utilizes: 'uses', utilized: 'used', utilizing: 'using', commencing: 'starting', endeavored: 'tried', endeavors: 'tries', endeavoring: 'trying', ascertained: 'found out', ascertaining: 'finding out', perused: 'read', peruses: 'reads', perusing: 'reading', beheld: 'saw', vexes: 'annoys', yearn: 'want', yearns: 'wants', yearned: 'wanted', yearning: 'wanting', hushed: 'quiet', commence: 'start', commenced: 'started', endeavor: 'try', ascertain: 'find out', myriad: 'many', plethora: 'many', whilst: 'while', amongst: 'among', visage: 'face', countenance: 'face', abode: 'home', dwelling: 'home', garb: 'clothes', orbs: 'eyes', azure: 'blue', cerulean: 'blue', crimson: 'red', ethereal: 'light', luminous: 'bright', ensnared: 'caught', beguiled: 'charmed', perchance: 'maybe', mayhap: 'maybe', behold: 'look', peruse: 'read', vexed: 'annoyed', repast: 'meal', sustenance: 'food', thus: 'so', hence: 'so', henceforth: 'from now on', ere: 'before', nigh: 'near', tresses: 'hair', raiment: 'clothes', slumber: 'sleep', 'slumbers': 'sleeps', repose: 'rest', alabaster: 'pale', porcelain: 'smooth', cacophony: 'noise', tapestry: 'mix', kaleidoscope: 'mix', juxtaposition: 'contrast', ministrations: 'touch', unbeknownst: 'unknown', aforementioned: 'earlier'};
  const STOCK = [/\ba\s+symphony\s+of\b/gi, /\ba\s+dance\s+of\b/gi, /\ba\s+tapestry\s+of\b/gi, /\ba\s+kaleidoscope\s+of\b/gi, /\ba\s+whirlwind\s+of\b/gi, /\bsent\s+shivers?\s+down\s+(?:her|his|my|your)\s+spine\b/gi, /\bbreath\s+(?:she|he|I|you)\s+(?:didn't|did not)\s+know\s+(?:she|he|I|you)\s+was\s+holding\b/gi, /\bheart\s+(?:skipped|missed)\s+a\s+beat\b/gi, /\btime\s+(?:stood|seemed to stand)\s+still\b/gi, /\bthe\s+air\s+(?:was|grew|felt)\s+thick\s+with\b/gi, /\bpalpable\b/gi, /\bdeafening\s+silence\b/gi, /\bwave\s+of\s+(?:emotion|desire|nausea)\b/gi, /\bseared\s+into\s+(?:her|his|my|your)\s+(?:mind|memory|brain)\b/gi, /\blike\s+a\s+physical\s+blow\b/gi];

  // "mouth" where the usual word is "lips": the AI writes "her mouth curved into a smile". Only a mouth that smiles, twitches, curves or thins is flagged
  // (a mouth that kisses, opens or waters is fine), and a fix is offered as a soft hint: lips, with the verb matched ("mouth curves" -> "lips curve").
  const MV = {curve: ['curved', 'curves', 'curving'], curl: ['curled', 'curls', 'curling'], quirk: ['quirked', 'quirks', 'quirking'], twitch: ['twitched', 'twitches', 'twitching'], twist: ['twisted', 'twists', 'twisting'], tug: ['tugged', 'tugs', 'tugging'], tilt: ['tilted', 'tilts', 'tilting'], thin: ['thinned', 'thins', 'thinning'], tighten: ['tightened', 'tightens', 'tightening'], soften: ['softened', 'softens', 'softening'], purse: ['pursed', 'purses', 'pursing'], pucker: ['puckered', 'puckers', 'puckering']};
  // these verbs also fit a kiss ("her mouth pressed against his"), so they count only with a smile or a look on the face after them
  const MV2 = {pull: ['pulled', 'pulls', 'pulling'], press: ['pressed', 'presses', 'pressing'], lift: ['lifted', 'lifts', 'lifting'], stretch: ['stretched', 'stretches', 'stretching'], spread: ['spread', 'spreads', 'spreading'], split: ['split', 'splits', 'splitting'], form: ['formed', 'forms', 'forming'], turn: ['turned', 'turns', 'turning']};
  const MOUTH_PRESENT = new Set(Object.values({...MV, ...MV2}).map(f => f[1]));
  const mAlt = o => Object.values(o).flat().sort((a, b) => b.length - a.length).join('|');
  const MOUTH_LOOK = '(?=\\s+(?:up\\b|down\\b|into\\s+(?:a|an)\\b|in\\s+(?:a|an)\\s+(?:smile|smirk|grin|line|frown|pout|scowl|sneer)\\b|at\\s+the\\s+corners?\\b|(?:a|an)\\s+(?:smile|smirk|grin|frown|pout|scowl|sneer)\\b))';
  const reMouth1 = new RegExp(`\\b(mouth)((?:\\s+(?:was|is))?)(\\s+)(${mAlt(MV)})\\b`, 'gi');
  const reMouth2 = new RegExp(`\\b(mouth)((?:\\s+(?:was|is))?)(\\s+)(${mAlt(MV2)})\\b${MOUTH_LOOK}`, 'gi');
  const reMouthCorner = new RegExp(`\\bcorners?\\s+of\\s+(?:her|his|their|the)\\s+(mouth)(?=\\s+(?:${mAlt({...MV, ...MV2})})\\b)`, 'gi');
  const reMouthSmile = /\b(?:smile|smirk|grin|pout)s?\b(?:\s+[\w-]+){0,3}?\s+(?:at|on|across)\s+(?:the\s+corners?\s+of\s+)?(?:her|his|their)\s+(mouth)\b/gi;
  const MOUTH_WHY = 'With a smile or a look on the face, the usual word is “lips” (“her lips curved into a smile”). A hint only: keep “mouth” if you mean it.';
  function mouthFix(m) {
    const aux = m[2] ? m[2].replace(/\bwas\b/i, 'were').replace(/\bis\b/i, 'are') : '', verb = m[4], low = verb.toLowerCase();
    const v = MOUTH_PRESENT.has(low) && !aux ? verb.slice(0, /(?:ch|sh|ss)es$/i.test(verb) ? -2 : -1) : verb;       // "mouth curves" -> "lips curve"
    return cap('lips', m[1]) + aux + m[3] + v;
  }

  // words the creator added with "Add to dictionary" (kept on this computer only)
  const KEY = 'jbs.textcheck.words';
  function userWords() { try { return JSON.parse(root.localStorage.getItem(KEY) || '[]').filter(x => typeof x === 'string'); } catch (_) { return []; } }
  function addWord(w) { try { const all = new Set(userWords()); all.add(String(w).toLowerCase()); root.localStorage.setItem(KEY, JSON.stringify([...all].sort())); return true; } catch (_) { return false; } }

  // phrases the creator chose to "Ignore" (wording and grammar notes such as "gonna"): never flagged again, kept on this computer only
  const IGN_KEY = 'jbs.textcheck.ignored', normPhrase = x => String(x == null ? '' : x).toLowerCase().replace(/\s+/g, ' ').replace(/^[\s"'“”‘’*_.,;:!?()-]+|[\s"'“”‘’*_.,;:!?()-]+$/g, '');
  function ignoredPhrases() { try { return JSON.parse(root.localStorage.getItem(IGN_KEY) || '[]').filter(x => typeof x === 'string'); } catch (_) { return []; } }
  function ignorePhrase(p) { try { const n = normPhrase(p); if (!n) return false; const all = new Set(ignoredPhrases()); all.add(n); root.localStorage.setItem(IGN_KEY, JSON.stringify([...all].sort())); return true; } catch (_) { return false; } }
  function unignoreAll() { try { root.localStorage.removeItem(IGN_KEY); root.localStorage.removeItem(KEY); return true; } catch (_) { return false; } }

  // ---------------------------------------------------------------- the check
  let provider = null;
  function setProvider(fn) { provider = typeof fn === 'function' ? fn : null; }
  function check(text, opts) {
    opts = opts || {};
    const src = String(text == null ? '' : text), t = mask(src), hits = [];
    const names = new Set((opts.names || []).flatMap(n => String(n || '').split(/\s+/)).map(s => s.toLowerCase().replace(/[^a-z'-]/g, '')).filter(Boolean));
    const ignore = new Set([...(opts.ignore instanceof Set ? opts.ignore : (opts.ignore || [])), ...userWords()].map(x => String(x).toLowerCase()));
    const push = (start, end, kind, msg, extra) => hits.push(Object.assign({start, end, text: src.slice(start, end), kind, msg}, extra || {}));
    const W = words();

    // ---- spelling
    const TOK = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*/g;
    const toks = []; let m;
    while ((m = TOK.exec(t))) {
      let i = m.index - 1; while (i >= 0 && /[ \t"'“”‘’*_(\[—–-]/.test(t[i])) i--;
      const prev = i < 0 ? '' : t[i], starts = i < 0 || /[.!?\n:]/.test(prev) || (prev === '\n');
      const nextCh = t[m.index + m[0].length];
      toks.push({w: m[0], start: m.index, end: m.index + m[0].length, sentStart: starts || (i >= 0 && /[.!?]/.test(prev)), apostrophePrefix: t[m.index - 1] === "'" && !/[A-Za-z]/.test(t[m.index - 2] || ' '), nextCh});
    }
    const seenCap = new Set(); for (const k of toks) if (!k.sentStart && /^[A-Z][a-z]/.test(k.w)) seenCap.add(k.w.toLowerCase());
    for (const k of toks) {
      const w = k.w, lc = w.toLowerCase();
      if (w.length < 2 || ignore.has(lc) || names.has(lc.replace(/['’]s$/, ''))) continue;
      if (/^[A-Z]{2,}s?$/.test(w) || /[a-z][A-Z]/.test(w)) continue;                       // NTR, iPhone, McKay
      if (/^[A-Z]/.test(w) && !k.sentStart) continue;                                      // a capital in the middle of a sentence is a name
      if (/^[A-Z]/.test(w) && seenCap.has(lc.replace(/['’]s$/, ''))) continue;        // a name used elsewhere in the same text
      if (k.apostrophePrefix) continue;                                                    // 'cause, 'til
      if (SKIP_INTERJ.test(w) || known(lc)) continue;
      if (APOS[lc]) { let fx = cap(APOS[lc], w); if ((lc === 'dont' || lc === 'didnt' && false) && /\b(?:he|she|it)\s+$/i.test(t.slice(Math.max(0, k.start - 6), k.start))) fx = cap("doesn't", w); push(k.start, k.end, 'spelling', `${q(w)} needs an apostrophe: ${q(fx)}.`, {fix: fx}); continue; }
      const sg = suggestions(lc).map(s => cap(s, w));
      push(k.start, k.end, 'spelling', `${q(w)} is not in the dictionary${sg.length ? '. Did you mean ' + sg.slice(0, 3).map(q).join(', ') + '?' : '. Check the spelling.'}`, {suggest: sg});
    }

    // ---- grammar
    const REPEAT_OK = new Set(['had', 'that', 'ha', 'bye', 'no', 'so', 'yes', 'oh', 'knock', 'la', 'na', 'blah', 'boom', 'tick', 'ho', 'duh', 'go', 'quack', 'very', 'bang', 'chop', 'tap', 'tut', 'ah', 'uh', 'um', 'hm', 'mm', 'please', 'now', 'come', 'hey', 'wait', 'stop', 'sorry', 'there', 'more']);
    const re1 = /\b([A-Za-z']+)([ \t]+)\1\b/gi;
    while ((m = re1.exec(t))) { if (REPEAT_OK.has(m[1].toLowerCase())) continue; push(m.index, m.index + m[0].length, 'grammar', `${q(m[1])} is written twice.`, {fix: m[1]}); }

    const reAn = /\b(an?)([ \t]+)([A-Za-z][A-Za-z'-]*)/g;
    const VOW_SOUND_H = /^(?:hour|hours|hourly|honest|honestly|honor|honors|honorable|honour|heir|heirs|heiress|herb|herbs|herbal)$/i;
    const U_CONS = /^(?:uni|use|usu|uti|uk|uro|ura|euro|eu|one|once|ubiq|ufo|uvula|ute)/i;
    while ((m = reAn.exec(t))) {
      const art = m[1], nx = m[3], lowArt = art === art.toLowerCase();
      if (!lowArt && art !== 'A' && art !== 'An') continue;
      if (/^[A-Z]{2,}/.test(nx)) continue;                                                // an FBI agent, a UFO
      const l = nx.toLowerCase(), c0 = l[0], isA = art.toLowerCase() === 'a';
      let needAn;
      if (VOW_SOUND_H.test(l)) needAn = true;
      else if ('aeio'.includes(c0)) needAn = !(/^(?:one|once|ouija|eulogy|euphemism|ewe)/.test(l) || /^eu/.test(l));
      else if (c0 === 'u') needAn = !U_CONS.test(l);
      else needAn = false;
      if (isA && needAn) push(m.index, m.index + art.length, 'grammar', `Use ${q(art === 'a' ? 'an' : 'An')} before ${q(nx)}.`, {fix: art === 'a' ? 'an' : 'An'});
      else if (!isA && !needAn && !/^h/.test(l) && !/^[xX]/.test(l) && !/^[fhlmnrsx]$/.test(l)) push(m.index, m.index + art.length, 'grammar', `Use ${q(art === 'an' ? 'a' : 'A')} before ${q(nx)}.`, {fix: art === 'an' ? 'a' : 'A'});
      else if (!isA && /^h/.test(l) && !VOW_SOUND_H.test(l) && !/^(?:hmm|hm)/.test(l)) push(m.index, m.index + art.length, 'grammar', `Use ${q(art === 'an' ? 'a' : 'A')} before ${q(nx)}.`, {fix: art === 'an' ? 'a' : 'A'});
    }

    const reSp = /(\S) {2,}(?=\S)/g;
    while ((m = reSp.exec(t))) push(m.index + 1, m.index + m[0].length, 'grammar', 'Two spaces in a row.', {fix: ' '});
    const reBefore = /([A-Za-z]) +([,;:!?])(?=\s|$|["”])/g;
    while ((m = reBefore.exec(t))) push(m.index + 1, m.index + m[0].length, 'grammar', `Remove the space before ${q(m[2])}.`, {fix: m[2]});
    const reAfter = /([a-z]{2,})([,;:])([A-Za-z])/g;
    while ((m = reAfter.exec(t))) push(m.index + m[1].length, m.index + m[1].length + 1, 'grammar', `Add a space after ${q(m[2])}.`, {fix: m[2] + ' '});
    const reAfterEnd = /([a-z]{2,}[.!?])([A-Z][a-z]+)/g;
    while ((m = reAfterEnd.exec(t))) { const pos = m.index + m[1].length; push(pos - 1, pos, 'grammar', `Add a space after ${q(m[1].slice(-1))} before ${q(m[2])}.`, {fix: m[1].slice(-1) + ' '}); }

    const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'etc', 'inc', 'jr', 'sr', 'no', 'fig', 'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'approx']);
    const reCap = /([.!?])([ \t]+)([a-z])/g;
    while ((m = reCap.exec(t))) {
      if (t[m.index - 1] === '.') continue;                                                // "..." trails off: no capital needed
      const pw = (t.slice(Math.max(0, m.index - 8), m.index).match(/([A-Za-z.]+)$/) || [, ''])[1].toLowerCase();
      if (m[1] === '.' && (ABBR.has(pw) || /^[a-z]\.[a-z]$/.test(pw))) continue;
      const pos = m.index + m[1].length + m[2].length; push(pos, pos + 1, 'grammar', `A sentence starts with a capital letter: ${q(m[3].toUpperCase())}.`, {fix: m[3].toUpperCase()});
    }
    const reI = /(?<![A-Za-z0-9'’.\/-])i(?=['’](?:m|ll|d|ve)\b|[\s,!?;:)"”])/g;
    while ((m = reI.exec(t))) push(m.index, m.index + 1, 'grammar', `${q('I')} is always a capital letter.`, {fix: 'I'});

    const AUX = new Set(['in', 'on', 'at', 'of', 'for', 'with', 'by', 'from', 'about', 'into', 'over', 'under', 'through', 'behind', 'inside', 'within', 'without', 'than', 'does', 'did', 'do', 'would', 'could', 'should', 'can', 'will', 'might', 'may', 'must', 'shall', 'to', 'that', "doesn't", "didn't", "don't", "wouldn't", "couldn't", "shouldn't", "can't", "won't", 'not', 'let', 'make', 'makes', 'made', 'help', 'helps', 'if']);
    const SV3 = {have: 'has', "don't": "doesn't", do: 'does', are: 'is', were: 'was', 'ain\'t': null};
    const reSV3 = /\b([A-Za-z']+\s+)?(he|she|it)\s+(have|don't|do|are|were)\b/gi;
    while ((m = reSV3.exec(t))) {
      const prevW = (m[1] || '').trim().toLowerCase(); if (AUX.has(prevW) || /^(?:as|though|wish|than|how|what|why|when|where|who|whether)$/.test(prevW)) continue;
      const verb = m[3].toLowerCase(), fx = SV3[verb]; if (!fx) continue;
      if (verb === 'were' && /^(?:if|as|wish|though)$/.test(prevW)) continue;
      const s = m.index + m[0].length - m[3].length;
      push(s, s + m[3].length, 'grammar', `${q(m[2] + ' ' + m[3])} should be ${q(m[2] + ' ' + fx)}.`, {fix: cap(fx, m[3])});
    }
    const rePl = /\b([Tt]hey|[Ww]e|I)\s+(has|is|was|does|doesn't)\b(?!\s*(?:\?|n't))/g;
    while ((m = rePl.exec(t))) { const fixm = {has: 'have', is: m[1] === 'I' ? 'am' : 'are', was: m[1] === 'I' ? 'was' : 'were', does: 'do', "doesn't": "don't"}[m[2]]; if (m[1] === 'I' && m[2] === 'was') continue; const s = m.index + m[0].length - m[2].length; push(s, s + m[2].length, 'grammar', `${q(m[1] + ' ' + m[2])} should be ${q(m[1] + ' ' + fixm)}.`, {fix: fixm}); }
    const reOf = /\b(could|would|should|must|might)\s+of\b/gi;
    while ((m = reOf.exec(t))) { const s = m.index + m[1].length + 1; push(s, m.index + m[0].length, 'grammar', `${q(m[0])} should be ${q(m[1] + ' have')}.`, {fix: 'have'}); }
    const reThen = /\b(more|less|better|worse|rather|bigger|smaller|older|younger|faster|slower|harder|easier|taller|shorter|stronger|closer|further|farther|other|sooner|later|greater|lower|higher)\s+(then)\b/gi;
    while ((m = reThen.exec(t))) { const s = m.index + m[0].length - 4; push(s, s + 4, 'grammar', `After ${q(m[1])}, use ${q('than')}, not ${q('then')}.`, {fix: cap('than', m[2])}); }
    const reLot = /\balot\b/gi; while ((m = reLot.exec(t))) push(m.index, m.index + 4, 'grammar', `${q(m[0])} is two words: ${q('a lot')}.`, {fix: cap('a lot', m[0])});
    const reIts = /\bits\s+(?=(?:a|an|the|been|not|going|just|too|very|so|time|like|my|your|our|their|no|all|only|about|really)\b)/gi;
    while ((m = reIts.exec(t))) push(m.index, m.index + 3, 'grammar', `${q(m[0].trim())} before this word should be ${q("it's")} (it is).`, {fix: cap("it's", m[0])});
    // "your" is only flagged where "you're" is the only reading: "your late shift", "your right hand", "your being late", "your very first" and "your welcome gift" are all correct
    const reYour = /\byour\s+(?=(?:welcome(?=\s*(?:[.,!?;:)]|$))|(?:so|too)(?![-\w'])|going\s+to\b|not\s+(?:going|a|an|the|sure|even|supposed|allowed)\b|(?:late|early|right|wrong)(?=\s*(?:[.,!?;:)]|$)|\s+(?:for|to|about|again|on|in|at|as|when|but|and|than|enough|now|today|already)\b)|a\s+(?:good|great|bad)\b))/gi;
    while ((m = reYour.exec(t))) push(m.index, m.index + 4, 'grammar', `${q('your')} here should be ${q("you're")} (you are).`, {fix: cap("you're", m[0])});

    // ---- wording
    PERSON.lastIndex = 0;
    while ((m = PERSON.exec(t))) { const fx = personFix(m); push(m.index, m.index + m[0].length, 'wording', `A ${m[2].toLowerCase()} is not ${m[4].toLowerCase()}. Say what is really wrong (for example ${q('the ' + m[2].toLowerCase() + ' needs a big repair')}).`, fx ? {fix: src.slice(m.index, m.index + m[1].length) + fx.slice(m[1].length), soft: true} : {}); }
    TEASE.lastIndex = 0;
    while ((m = TEASE.exec(t))) push(m.index, m.index + m[0].length, 'wording', `Points at a ${m[1].toLowerCase()} without saying what it is. Say it outright (what is the ${m[1].toLowerCase()}?).`);
    for (const [re, label, why] of VAGUE) { re.lastIndex = 0; while ((m = re.exec(t))) push(m.index, m.index + m[0].length, 'wording', `${q(m[0])} ${why}`); }
    const reFancy = new RegExp(`\\b(${Object.keys(FANCY).join('|')})\\b`, 'gi');
    while ((m = reFancy.exec(t))) { const plain = FANCY[m[1].toLowerCase()]; push(m.index, m.index + m[0].length, 'wording', `${q(m[0])} is an uncommon word. Simple English: ${q(plain)}.`, {fix: cap(plain, m[0]), soft: true}); }
    // "She said it quietly" / "She said it without looking up": the "it" points at nothing. "She said quietly" / "She said without looking up".
    { const reSaidIt = /\b(said|says) it (?=(?:[a-z]+ly|too|so|fast|slow|slowly|in a|in one|like|with|without|before|while|as if|as though|all)\b)/gi;
      while ((m = reSaidIt.exec(t))) push(m.index, m.index + m[0].length - 1, 'wording', `${q(m[0].trim())}: the "it" points at nothing. Say ${q(m[1].toLowerCase())} and then how.`, {fix: m[1]}); }
    for (const re of STOCK) { re.lastIndex = 0; while ((m = re.exec(t))) push(m.index, m.index + m[0].length, 'wording', `${q(m[0])} is a stock phrase. Say it plainly.`); }

    for (const re of [reMouth1, reMouth2]) { re.lastIndex = 0; while ((m = re.exec(t))) push(m.index, m.index + m[0].length, 'wording', `${q(src.slice(m.index, m.index + m[0].length))}: ${MOUTH_WHY}`, {fix: mouthFix([m[0], src.slice(m.index, m.index + m[1].length), m[2], m[3], m[4]]), soft: true}); }
    for (const re of [reMouthCorner, reMouthSmile]) { re.lastIndex = 0; while ((m = re.exec(t))) { const s = m.index + m[0].length - m[1].length; push(s, s + m[1].length, 'wording', `${q(src.slice(s, s + m[1].length))}: ${MOUTH_WHY}`, {fix: cap('lips', m[1]), soft: true}); } }
    const reSent = /[^.!?\n]+([.!?]+)?/g;      // v1.2.6: always matches forward (the old pattern re-scanned a long line with no full stop from every letter: seconds on big pastes)
    while ((m = reSent.exec(t))) { if (!m[1]) continue; const n = (m[0].match(/[A-Za-z']+/g) || []).length; if (n > 45) push(m.index + (m[0].length - m[0].trimStart().length), m.index + m[0].length, 'wording', `A very long sentence (${n} words). Split it into shorter ones.`); }

    if (provider) {                                                    // an extra source (LanguageTool, when installed) that is already known for this text; never waited for
      let ext = null; try { ext = provider(src); } catch (_) { ext = null; }
      if (Array.isArray(ext)) for (let i = hits.length - 1; i >= 0; i--) if (hits[i].kind === 'grammar') hits.splice(i, 1);   // LanguageTool has checked this text: its answer IS the grammar check. The app's own hand-written grammar rules only stand in until it answers, or when it is not installed.
      for (const e of ext || []) {
        const lc = src.slice(e.start, e.end).toLowerCase().trim();
        if (ignore.has(lc) || names.has(lc) || /\u0001/.test(t.slice(e.start, e.end))) continue;
        const over = hits.filter(h => h.start < e.end && e.start < h.end);
        if (e.kind === 'spelling') {                                   // better replacements for a word the built-in list already flagged; never a new spelling flag
          const h = over.find(x => x.kind === 'spelling'); if (!h) continue;
          const reps = e.suggest || (e.fix != null ? [e.fix] : []); if (reps.length) h.suggest = [...new Set([...(h.fix != null ? [h.fix] : []), ...reps, ...(h.suggest || [])])].slice(0, 6);
          continue;
        }
        if (over.some(h => h.kind === 'wording') || (e.kind === 'wording' && over.length)) continue;   // the app's own wording rules win
        for (const h of over) hits.splice(hits.indexOf(h), 1);        // LanguageTool's grammar replaces a built-in grammar hit on the same words
        hits.push(Object.assign({text: src.slice(e.start, e.end)}, e));
      }
    }
    hits.sort((a, b) => a.start - b.start || a.end - b.end);
    const skip = new Set([...ignoredPhrases(), ...userWords().map(normPhrase)]);
    const out = []; for (const h of hits) { if (skip.size && skip.has(normPhrase(h.text))) continue; const p = out[out.length - 1]; if (p && p.start === h.start && p.end === h.end && p.kind === h.kind) continue; out.push(h); }
    return out;
  }
  function apply(text, picks) {
    let t = String(text == null ? '' : text);
    let lastStart = Infinity;
    for (const p of picks.slice().sort((a, b) => b.start - a.start || b.end - a.end)) { if (p.end > lastStart) continue; t = t.slice(0, p.start) + p.replacement + t.slice(p.end); lastStart = p.start; }
    return t;
  }
  const summary = hits => { const c = {spelling: 0, grammar: 0, wording: 0}; for (const h of hits) c[h.kind]++; return c; };
  return {check, apply, summary, suggestions, known, mask, words, userWords, addWord, ignorePhrase, ignoredPhrases, unignoreAll, setProvider};
});
