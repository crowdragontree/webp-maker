// Calendar names: a card or bot never names a day of the week or a month.
// Time is written relative to the scene ("that morning", "two days ago", "last winter").
(function () {
  const DAYS = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday';
  const SURE = 'January|February|July|September|October|November|December|Sept';        // never anything else
  const MAYBE = 'March|April|May|June|August';                                          // also a verb or a first name
  const TIME_WORD = 'in|since|last|next|every|early|late|mid|until|till|during|this|that|each';        // not by/from/to/after: "from April" can be a person
  const dayRe = new RegExp(`\\b(?:${DAYS})s?\\b`, 'gi');
  const sureRe = new RegExp(`\\b(?:${SURE})\\b`, 'gi');
  const preRe = new RegExp(`\\b(?:${TIME_WORD})\\s+(?:and\\s+)?(?:early\\s+|late\\s+|mid[-\\s]?)?(${MAYBE})\\b(?!['’]s\\b)`, 'g');     // "in April", "late August", never "April's"
  const dateRe = new RegExp(`\\b(${MAYBE})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+of\\s+(${MAYBE})\\b`, 'g');   // "April 3", "3rd of May"

  // every day or month name in the text: [{word, index}]
  function find(text) {
    const t = String(text || ''), out = [];
    const add = (word, index) => { if (!out.some(o => o.index === index)) out.push({word, index}); };
    for (const re of [dayRe, sureRe]) { re.lastIndex = 0; let m; while ((m = re.exec(t))) add(m[0], m.index); }
    preRe.lastIndex = 0; let m;
    while ((m = preRe.exec(t))) { const w = m[1]; add(w, m.index + m[0].lastIndexOf(w)); }
    dateRe.lastIndex = 0;
    while ((m = dateRe.exec(t))) { const w = m[1] || m[2]; add(w, m.index + m[0].indexOf(w)); }
    return out.sort((a, b) => a.index - b.index);
  }

  const words = text => [...new Set(find(text).map(o => o.word))];
  // one line for a checker: null when clean
  function problem(text) {
    const w = words(text); if (!w.length) return null;
    return `uses a day or month name (${w.slice(0, 4).join(', ')}${w.length > 4 ? '…' : ''}). Never name a day of the week or a month: write the time relative to the scene instead ("that morning", "two days ago", "last winter").`;
  }

  const RULE = 'CALENDAR NAMES: never write a day of the week (Monday, Tuesday, Friday...) or a month (January, April, July...) anywhere in a card or bot, in narration or in dialogue. Write time relative to the scene instead: "that morning", "tonight", "two days ago", "last winter", "the week before". Seasons are fine.';

  const api = {find, words, problem, RULE};
  if (typeof window !== 'undefined') window.CalendarNames = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
