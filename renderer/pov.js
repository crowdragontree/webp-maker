/* How the reader is addressed in the Introduction and Greeting: "you/your" or "{{user}}".
   Converts narration only: dialogue in quotes is never touched (a character
   saying "It's still yours" is talking to the reader either way). */
(function () {
  const U = '{{user}}';
  const MODALS = /^(can|could|will|would|shall|should|may|might|must|did|didn't|can't|couldn't|won't|wouldn't|shouldn't|mustn't)$/i;
  const NOT_VERB = /^(and|but|or|nor|so|yet|too|also|still|only|just|both|all|alone|here|there|now|then|again|together|instead|inside|outside|back|first|last|later|yourself|alone)$/i;
  const SUBJ_BEFORE = /(^|[.!?…:;]\s*|\n\s*|\*\s*|\b(?:and|but|or|so|then|as|when|while|before|after|until|because|if|once|since|though|although|unless|whenever|where|that)\s+)$/i;

  const cap = (w, like) => like && /^[A-Z]/.test(like) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  const startOf = (pre) => /(^|[.!?…]\s+|\n\s*|^\s*\*|[.!?…]\s*\*\s*)$/.test(pre);
  // he walks -> you walk ; carries -> carry ; watches -> watch ; goes -> go
  const unS = w => /ies$/i.test(w) && w.length > 4 ? w.slice(0, -3) + 'y' : /(sses|shes|ches|xes|zes|oes)$/i.test(w) ? w.slice(0, -2) : /[^s]s$/i.test(w) ? w.slice(0, -1) : w;
  // you walk -> {{user}} walks ; carry -> carries ; watch -> watches ; go -> goes
  const addS = w => /^have$/i.test(w) ? 'has' : /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : /(s|sh|ch|x|z|o)$/i.test(w) ? w + 'es' : w + 's';

  function narration(text, fn) {
    // split into dialogue ("...", “...”) and narration; convert narration only
    return String(text || '').split(/("[^"\n]*"|“[^”\n]*”)/).map((part, i) => i % 2 ? part : fn(part)).join('');
  }

  // "X walks in and sees her": the verb after "and/or/then/but" shares the subject. Only when the next
  // word looks like an object (the, a, her, him, a name...), so nouns ("and others") are left alone.
  const OBJ = /^(the|a|an|her|his|their|its|him|them|it|that|this|those|these|to|into|at|on|up|down|out|back|over|through|away|around|[A-Z][a-z]+)$/;
  function secondVerb(t, subjectRe, fix) {
    // split into sentences but keep every separator exactly (line breaks included)
    return t.split(/((?<=[.!?…])\s+)/).map((sent, i) => {
      if (i % 2 || !subjectRe.test(sent)) return sent;
      return sent.replace(/\b(and|or|then|but)(\s+)([a-z]+)(\s+)(\S+)/g, (m, cj, s1, verb, s2, next) => {
        if (!OBJ.test(next.replace(/[^A-Za-z]/g, '')) || NOT_VERB.test(verb) || /^(the|a|an|her|his|she|he|they|it|i|we|you|then)$/i.test(verb)) return m;
        const out = fix(verb); return out === verb ? m : `${cj}${s1}${out}${s2}${next}`;
      });
    }).join('');
  }

  function toYouPart(t) {
    const BE = {is: 'are', was: 'were', has: 'have', does: 'do', "isn't": "aren't", "wasn't": "weren't", "hasn't": "haven't", "doesn't": "don't", "is not": 'are not', "was not": 'were not'};
    t = t.replace(/\{\{user\}\}\s+(?:himself|herself|themselves|themself)\b/g, (m, off, all) => startOf(all.slice(0, off)) ? 'You yourself' : 'yourself');
    t = t.replace(/\b(?:himself|herself|themselves|themself)\b(?=[^.!?]*$)/g, m => m);   // (other reflexives stay as written)
    t = t.replace(/\{\{user\}\}['’]s\s+own\b/g, 'your own');
    // "{{user}}'s" with no noun after it is "yours": "her eyes never leaving {{user}}'s." -> "yours."
    t = t.replace(/\{\{user\}\}['’]s(?=\s*(?:[.,;:!?*)\]"”…]|$|\s(?:and|or|but|too|again|instead|now|then|tightly|gently|softly|firmly|a|the|like|as|for|with|before|while|when|until|because|was|is|had|did|could|would|in|on|at|to|from|by)\b))/g, (m, off, all) => startOf(all.slice(0, off)) ? 'Yours' : 'yours');
    t = t.replace(/\{\{user\}\}['’]s\b/g, (m, off, all) => startOf(all.slice(0, off)) ? 'Your' : 'your');
    t = t.replace(/\{\{user\}\}\s+(is not|was not|isn't|wasn't|hasn't|doesn't|is|was|has|does)\b/g, (m, v, off, all) => `${startOf(all.slice(0, off)) ? 'You' : 'you'} ${BE[v]}`);
    // {{user}} walks / {{user}} slowly walks -> you walk / you slowly walk
    t = t.replace(/\{\{user\}\}(\s+)(?:([a-z]+ly)\s+)?([a-z]+s)\b/g, (m, sp, adv, verb, off, all) => {
      if (NOT_VERB.test(verb) || /ss$/.test(verb) || /^(this|his|its|has|was|is|as|us|yes|plus|always|perhaps|towards|across|besides|nevertheless|news|less|unless|thus|whereas|afterwards|upwards|downwards|sometimes|nowadays)$/i.test(verb)) return m;
      return `${startOf(all.slice(0, off)) ? 'You' : 'you'}${sp}${adv ? adv + ' ' : ''}${unS(verb)}`;
    });
    t = t.replace(/\{\{user\}\}/g, (m, off, all) => startOf(all.slice(0, off)) ? 'You' : 'you');
    // repair "you gets" / "you knows" anywhere ("the look you gets before..."): common verbs only, so nouns are safe
    t = t.replace(/\b([Yy]ou)(\s+)(gets|knows|wants|needs|sees|says|feels|looks|walks|takes|makes|thinks|finds|gives|keeps|holds|hears|leaves|means|tries|seems|comes|goes|does|asks|tells|turns|stands|sits|waits|watches|reaches|carries|stays|loves|likes|hates|remembers|notices|realizes|decides|answers|speaks|smiles|laughs|breathes|steps|moves|reads|writes|opens|closes)\b/g, (m, y, sp, v) => `${y}${sp}${unS(v)}`);
    // repair "you knows" / "you walks" left by earlier text: "you" as the subject takes the plain verb
    t = t.replace(/\b([Yy]ou)(\s+)([a-z]+[^su]s)\b(?=\s)/g, (m, y, sp, v, off, all) => (SUBJ_BEFORE.test(all.slice(0, off)) && !NOT_VERB.test(v) && !/^(this|his|its|was|is|has|always|perhaps|towards|across|besides|news|less|unless|thus|yes|plus|minus|bus|gas|lens)$/i.test(v)) ? `${y}${sp}${unS(v)}` : m);
    t = secondVerb(t, /\b[Yy]ou\s+(?:[a-z]+ly\s+)?[a-z]+\b/, (v) => !/(ss|us|is|ous)$/i.test(v) && /[^s]s$|(?:sses|shes|ches|xes|zes|oes|ies)$/i.test(v) ? unS(v) : v);
    return t;
  }

  function toUserPart(t) {
    const BE = {are: 'is', were: 'was', have: 'has', do: 'does', "aren't": "isn't", "weren't": "wasn't", "haven't": "hasn't", "don't": "doesn't", "'re": ' is', "'ve": ' has', "'ll": ' will', "'d": ' would'};
    t = t.replace(/\b([Yy])ourself\b/g, U);
    t = t.replace(/\b([Yy])ours\b/g, `${U}'s`);
    t = t.replace(/\b([Yy])our\b/g, `${U}'s`);
    t = t.replace(/\b[Yy]ou(['’](?:re|ve|ll|d))\b/g, (m, c) => U + BE[c.replace('’', "'")]);
    t = t.replace(/\b[Yy]ou\s+(aren't|weren't|haven't|don't|are|were|have|do)\b/g, (m, v) => `${U} ${BE[v]}`);
    // subject "you" before a verb: you walk -> {{user}} walks (modals and past tense need no change)
    t = t.replace(/\b[Yy]ou(\s+)(?:([a-z]+ly)\s+)?([a-z]+)\b/g, (m, sp, adv, verb, off, all) => {
      const before = all.slice(0, off);
      if (!SUBJ_BEFORE.test(before)) return m;                                   // object "you": handled below
      if (MODALS.test(verb) || /ed$/.test(verb) || NOT_VERB.test(verb) || /^(a|an|the|to|in|on|at|of|for|with|from|by|about|that|this|too|alone|again|both|all|each)$/i.test(verb)) return `${U}${sp}${adv ? adv + ' ' : ''}${verb}`;
      if (/^(was|were|is|are|had|has)$/i.test(verb)) return `${U}${sp}${adv ? adv + ' ' : ''}${verb}`;
      if (/[^suia]s$/i.test(verb)) return `${U}${sp}${adv ? adv + ' ' : ''}${verb}`;   // already "knows": never "knowses"
      return `${U}${sp}${adv ? adv + ' ' : ''}${addS(verb)}`;
    });
    t = t.replace(/\b[Yy]ou\b/g, U);
    t = secondVerb(t, /\{\{user\}\}\s+(?:[a-z]+ly\s+)?[a-z]+s\b/, (v) => /[^s]s$|(?:es)$/i.test(v) || MODALS.test(v) || /(ed|ing|en)$/i.test(v) || NOT_VERB.test(v) ? v : addS(v));   // never "living" -> "livings"
    return t;
  }

  const toYou = text => narration(text, toYouPart);
  const toUser = text => narration(text, toUserPart);
  const convert = (text, mode) => mode === 'user' ? toUser(text) : toYou(text);

  // which parts a template lets you switch
  // In you/your mode the narration says "you", so exactly ONE line of dialogue says {{user}}: that is how the chat model
  // learns who {{user}} is and keeps their agency. None yet: "{{user}}, " goes before the first line of dialogue.
  // More than one: the first stays, and the extra spoken name is taken out of the others.
  const QT = /"([^"\n]{2,})"|“([^”\n]{2,})”/g;
  function ensureUserLine(paragraphs) {
    const P = (paragraphs || []).map(x => String(x || ''));
    const hits = []; P.forEach((p, i) => { let m; QT.lastIndex = 0; while ((m = QT.exec(p))) hits.push({i, at: m.index, raw: m[0], text: m[1] != null ? m[1] : m[2], curly: m[2] != null}); });
    if (!hits.length) return P;                                   // no dialogue at all: nothing to attach it to
    const withName = hits.filter(h => /\{\{user\}\}/.test(h.text));
    const put = (h, text) => { P[h.i] = P[h.i].replace(h.raw, h.curly ? `“${text}”` : `"${text}"`); };
    if (!withName.length) {
      const h = hits[0], t = h.text.trimStart(), first = t.split(/\s/)[0] || '';
      // keep the capital only for "I" and real names: a word that also appears capitalised mid-sentence in the Greeting
      const bare = first.replace(/[.,!?…]+$/, ''), all = P.join(' ');
      const isName = /^[A-Z][a-z]+$/.test(bare) && new RegExp(`[a-z,;]\\s+${bare}\\b`).test(all);
      const keepCap = /^(I|I'm|I'll|I've|I'd)$/.test(bare) || isName;
      put(h, `{{user}}, ${keepCap ? t : t.charAt(0).toLowerCase() + t.slice(1)}`);
    } else for (const h of withName.slice(1)) {
      let t = h.text.replace(/^\{\{user\}\},\s*/, m => '').replace(/,\s*\{\{user\}\}(?=[.!?…,]|$)/g, '');
      if (t !== h.text) { t = t.charAt(0).toUpperCase() + t.slice(1); put(h, t); }
    }
    return P;
  }
  // the dialogue lines of a Greeting that say {{user}}
  function userLines(paragraphs) { const n = []; for (const p of paragraphs || []) { let m; QT.lastIndex = 0; while ((m = QT.exec(String(p || '')))) if (/\{\{user\}\}/.test(m[1] != null ? m[1] : m[2])) n.push(m[0]); } return n; }

  function locks(spec) {
    return {
      intro: spec && spec.rules && spec.rules.secondPerson ? 'Your template requires the Introduction in second person ("you").' : '',
      greet: spec && spec.greeting && spec.greeting.banUserToken ? 'Your template keeps the Greeting\'s narration in "you" (one line of dialogue says {{user}}).' : '',
    };
  }

  const api = {toYou, toUser, convert, locks, ensureUserLine, userLines};
  if (typeof window !== 'undefined') window.Pov = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
