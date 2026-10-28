/* Everyone in a story is an adult (18 or older). This finds words that put a child, a teenager or a school-age person (or a school setting for them) in a text.
   Shared by Node and the renderer. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Minors = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const ORD = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\\d{1,2}(?:st|nd|rd|th)';
  const RE = [
    new RegExp(`\\b(?:${ORD})[- ]grad(?:e|ers?)\\b`, 'i'),                                   // third grade, third-graders
    /\b(?:grade|primary|elementary|middle|junior high|high|secondary|boarding|prep) ?-?school(?:ers?|girls?|boys?|kids?|students?|teachers?)?\b/i,
    /\bgrade[- ]school\b|\bjunior high\b|\bhighschool\w*\b|\bkindergarten\w*|\bpre-?school\w*|\bnursery school\b|\bdaycare\b|\bday care\b|\bplay ?group\b/i,
    /\bschool[- ]?(?:children|child|kids?|girls?|boys?|run|pickup|pick-up|drop-?off|bus|uniforms?|yard|play ?ground|dance|nurse|principal)\b/i,
    /\b(?:child|children|childr)(?:'s|’s|s')?\b(?<!inner child)/i,
    /\bkids?\b|\btoddlers?\b|\bbabies\b|\b(?:a|the|her|his|their|new|newborn|infant|sleeping|crying) baby\b(?! (?:girl|boy|doll)\b)|\binfants?\b|\bnewborns?\b|\bpre-?teens?\b|\btweens?\b|\bteen(?:s|agers?|aged)?\b|\bteenage\b|\bjuveniles?\b|\bunder-?age\b|\bunder 18\b|\bunder eighteen\b/i,
    /\bminors\b|\bschoolchild\w*|\bschoolgirl\w*|\bschoolboy\w*|\bpupils\b(?= (?:in|of|at|from) (?:her|his|the|their|a) (?:class|school|grade))|\bstudents? under 18\b|\borphans?\b|\bplay ?ground\b|\bhomework\b|\bP\.?T\.?A\.? meeting\b|\bparent-teacher\b/i,
    /\b(?:little|young|baby|small) (?:girl|boy|daughter|son)s?\b|\b(?:her|his|their|my|our) (?:young|little|small|baby) (?:daughter|son|one|ones)\b/i,
    /\bchildcare\b|\bbabysit\w*|\bnanny\b|\bnannies\b|\bstudents? (?:in|of) (?:her|his|the) (?:class|classroom)\b/i,
  ];
  const OK = /\binner child\b|\bchild-?free\b|\bchildhood\b|\badult children\b|\bgrown (?:children|kids)\b|\bchildhood friend\b|\bnot a (?:child|kid)\b|\bno (?:child|children|kids?)\b/gi;
  // the phrases in the text that name a minor or a school setting
  function find(text) {
    const t = String(text == null ? '' : Array.isArray(text) ? text.join(' ') : text).replace(OK, ' ');
    const out = [];
    for (const re of RE) { const g = new RegExp(re.source, 'gi'); let m; while ((m = g.exec(t))) { const w = m[0].trim().toLowerCase(); if (w && !out.includes(w)) out.push(w); if (m.index === g.lastIndex) g.lastIndex++; } }
    return out;
  }
  const problem = hits => `mentions a child, a minor or a school-age person (${hits.slice(0, 4).map(x => `"${x}"`).join(', ')}). Everyone in the story is 18 or older, and no child, teenager, student under 18 or school setting may appear anywhere, not even as background or in the past tense. Take it out and write it with adults only, changing as little else as possible.`;
  const RULE = 'EVERYONE IS AN ADULT (HARD RULE): every person in the story is 18 or older. No child, baby, toddler, kid, teenager, schoolchild, student under 18, pupil or minor appears anywhere, not even as background, in a memory or in a job: no character teaches, coaches, babysits, parents or raises anyone under 18, no school run, no school or classroom for children, no "third grade", no orphan. A job with children (a teacher of children, a nanny, a coach of kids) is never used; give her an adult job. If a character has a grown child, they are an adult and are never in the scene.';
  // the last safety net: a sentence that still names a minor or a school setting is dropped, so it is never saved
  function scrub(text) {
    const t = String(text == null ? '' : text); if (!find(t).length) return t;
    return t.split(/\n/).map(line => line.split(/(?<=[.!?\u2026]["\u201d\u2019)*_]*)\s+/).filter(sn => !find(sn).length).join(' ')).filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  return {find, problem, RULE, scrub};
});
