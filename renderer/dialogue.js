/* Dialogue must always sound like people talking: casual, spoken, with contractions; never formal or report-like.
   - contract(text): inside quotation marks only, turns "do not" into "don't", "I am" into "I'm" and so on.
     It never touches narration, never contracts at the end of a sentence ("that's who I am."), and leaves
     shouted emphasis alone ("I do NOT").
   - analyze(text): finds lines of dialogue that still read formal (report words, long stiff sentences,
     missing contractions) and says why.                                                                   */
(function () {
  const PAIRS = [
    ['do not', "don't"], ['does not', "doesn't"], ['did not', "didn't"], ['is not', "isn't"], ['are not', "aren't"],
    ['was not', "wasn't"], ['were not', "weren't"], ['cannot', "can't"], ['can not', "can't"], ['will not', "won't"],
    ['would not', "wouldn't"], ['could not', "couldn't"], ['should not', "shouldn't"], ['have not', "haven't"],
    ['has not', "hasn't"], ['had not', "hadn't"], ['must not', "mustn't"],
    ['I am', "I'm"], ['you are', "you're"], ['we are', "we're"], ['they are', "they're"], ['it is', "it's"],
    ['that is', "that's"], ['there is', "there's"], ['what is', "what's"], ['who is', "who's"], ['where is', "where's"],
    ['he is', "he's"], ['she is', "she's"], ['let us', "let's"], ['I will', "I'll"], ['you will', "you'll"],
    ['we will', "we'll"], ['they will', "they'll"], ['it will', "it'll"], ['I would', "I'd"], ['you would', "you'd"],
    ['I have been', "I've been"], ['you have been', "you've been"], ['I have got', "I've got"], ['I have never', "I've never"],
  ];
  const FORMAL = ['furthermore', 'moreover', 'therefore', 'thus', 'hence', 'consequently', 'nevertheless', 'nonetheless',
    'regarding', 'in regard to', 'with regard to', 'with respect to', 'in addition', 'additionally', 'accordingly',
    'whom', 'shall', 'i must inform you', 'please be advised', 'it is imperative', 'it is essential', 'in order to',
    'utilize', 'commence', 'subsequently', 'prior to', 'approximately', 'inquire', 'at this time', 'i am unable',
    'i would like to', 'it is important to note', 'as previously', 'in conclusion', 'to summarize', 'henceforth', 'whereby',
    'aforementioned', 'pertaining', 'endeavor', 'ascertain', 'facilitate', 'sufficient'];
  // a quote runs to its closing mark, or to the end of the line if it was never closed
  const QUOTE = /"([^"\n]{2,})(?:"|(?=\n|$))|“([^”\n]{2,})(?:”|(?=\n|$))/g;
  const keepCase = (from, to) => from[0] === from[0].toUpperCase() && from[0] !== from[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to;

  function contractLine(s) {
    let out = s;
    for (const [long, short] of PAIRS) {
      const re = new RegExp(`\\b${long.replace(/ /g, '\\s+')}\\b(?=\\s+[A-Za-z])`, 'gi');     // a word must follow: never at a sentence end
      out = out.replace(re, m => /\b[A-Z]{2,}\b/.test(m.replace(/^I\b/, '')) ? m : keepCase(m, short));   // shouted emphasis ("do NOT") stays
    }
    return out;
  }
  // only inside quotation marks
  function contract(text) { return String(text || '').replace(QUOTE, (m, a, b) => { const closed = /["”]$/.test(m); return a != null ? `"${contractLine(a)}${closed ? '"' : ''}` : `“${contractLine(b)}${closed ? '”' : ''}`; }); }

  function lines(text) { const out = []; let m; QUOTE.lastIndex = 0; const t = String(text || ''); while ((m = QUOTE.exec(t))) out.push(m[1] != null ? m[1] : m[2]); return out; }
  function why(line) {
    const l = ' ' + line.toLowerCase() + ' ', reasons = [];
    const hits = FORMAL.filter(w => new RegExp(`[^a-z]${w.replace(/ /g, '\\s+')}[^a-z]`).test(l)); if (hits.length) reasons.push(`formal words: ${hits.join(', ')}`);
    const sentences = line.split(/(?<=[.!?…])\s+/).map(x => x.split(/\s+/).filter(Boolean).length).filter(Boolean);
    const longest = Math.max(0, ...sentences); if (longest > 26) reasons.push(`a ${longest}-word sentence`);
    const open = PAIRS.filter(([lng]) => new RegExp(`\\b${lng.replace(/ /g, '\\s+')}\\b\\s+[a-z]`, 'i').test(line)).length; if (open >= 2) reasons.push('no contractions');
    return reasons;
  }
  // the lines that still read formal, with the reasons
  function analyze(text) { const flagged = lines(text).map(t => ({text: t, reasons: why(t)})).filter(x => x.reasons.length); return {formal: flagged.length > 0, lines: flagged}; }

  const RULE = 'DELIVERY CUES: never write "she said it", "he said it" or "said that" (the "it" points at nothing and reads wrong). A cue shows how the line sounded or what her body did right after it ("Her voice dropped.", "She looked away."), or uses a plain speech verb with a real manner ("she said, barely above a whisper"). DIALOGUE STYLE (always): every line of dialogue is casual, natural spoken English, the way real people talk. Use contractions (don\'t, I\'m, it\'s, you\'re), short sentences, fragments, interruptions, trailing off, and the character\'s own slang or attitude. Never formal, never written-English, never report-like: no "furthermore", "regarding", "I must inform you", no long tidy sentences, no characters explaining the plot like a narrator. Even a cold, proud, royal or serious character speaks naturally in their own way, not like a document.';

  // The Introduction is a synopsis: flowing prose in complete sentences that sets up the story, never a list.
  const INTRO_RULE = 'INTRODUCTION STYLE (always): the Introduction is a synopsis of the story written as flowing prose: three to five complete, connected sentences that say who she is, what situation the reader walks into, and what is at stake, ending on a hook. Never a list: no line breaks, no bullet points, no labels like "Setting:", no fragments, no strings of short phrases separated by commas.';
  function introIssues(text) {
    const t = String(text || '').replace(/^\s*\[[^\]]*\]\s*/, '').trim(), out = [];   // an [NTR]-style prefix doesn't count
    if (!t) return out;
    if (/\n/.test(t)) out.push('it is split over several lines');
    if (/(^|\n)\s*([-•*]|\d+[.)])\s+/.test(t)) out.push('it uses list markers');
    if (/(^|[.!?]\s+|\n)\s*[A-Z][\w ]{1,20}:\s/.test(t)) out.push('it uses labels like "Setting:"');
    const sents = t.split(/(?<=[.!?…])\s+/).map(x => x.trim()).filter(Boolean), words = x => x.split(/\s+/).filter(Boolean).length;
    if (sents.length < 3) out.push(`it has ${sents.length} sentence${sents.length === 1 ? '' : 's'} (a synopsis needs three to five)`);
    const frag = sents.filter(x => words(x) < 4); if (frag.length >= 2) out.push(`it has ${frag.length} clipped fragments ("${frag[0].slice(0, 40)}")`);
    const listy = sents.filter(x => { const parts = x.replace(/[.!?…]+$/, '').split(/,\s*/); return parts.length >= 4 && parts.filter(p => words(p) <= 3).length >= 3; });
    if (listy.length) out.push('it strings short phrases together with commas instead of telling the story');
    return out;
  }


  // Template speech slots already supply speaker labels and quotation marks.
  // Strip only redundant outer wrappers, not apostrophes or interior quotations.
  function unquote(text) {
    let s = String(text || '').trim(), old;
    do { old = s; if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('\u201c') && s.endsWith('\u201d'))) s = s.slice(1, -1).trim(); } while (s !== old && s.length > 1);
    return s;
  }
  function speechSlot(text, names = []) {
    let s = String(text || '').trim();
    const m = s.match(/^(?:\*\*|__)?([^\n:]{1,90}?)(?:\*\*|__)?\s*:\s*([\s\S]*)$/);
    if (m && names.some(n => String(n).toLowerCase() === m[1].replace(/\*\*|__/g, '').trim().toLowerCase())) s = m[2];
    return unquote(s);
  }
  function unwrapSpeech(text) {
    let s = unquote(text), old;
    do {
      old = s;
      if (s.startsWith('\\"') && s.endsWith('\\"') && s.length > 4) s = s.slice(2, -2).trim();
      else if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('\u201c') && s.endsWith('\u201d'))) s = s.slice(1, -1).trim();
    } while (s !== old && s.length > 1);
    return s;
  }
  function personalityText(text) {
    return String(text || '').split('\n').map(line => {
      // Strip only the extra markdown wrapper and a doubled outer quote.
      // Colon may sit inside the bold (**Mira:**) or after it (**Mira**:).
      line = line.replace(/^(\s*)(?:\*\*|__)([^*_\n]{1,90}?)(?:\*\*|__)(\s*:)/, '$1$2$3');
      line = line.replace(/^(\s*)(?:\*\*|__)([^*_\n:]{1,90})(\s*:\s*)(?:\*\*|__)/, '$1$2$3');
      const m = line.match(/^(\s*[^\n:]{1,90}:\s*)(["\u201c][\s\S]*["\u201d])\s*$/);
      return m ? m[1] + '"' + unwrapSpeech(m[2]) + '"' : line;
    }).join('\n');
  }
  const api = {contract, analyze, lines, RULE, INTRO_RULE, introIssues, unquote, speechSlot, personalityText};
  if (typeof window !== 'undefined') window.Dialogue = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
