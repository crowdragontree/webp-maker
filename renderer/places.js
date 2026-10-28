// Place names: a card or bot never names a street, an address or a flat number.
// The name of a street adds nothing to a story and spends characters; the place is said plainly ("her flat", "the corner café", "across town").
(function () {
  const SUFFIX = 'Row|Street|Lane|Road|Avenue|Drive|Court|Close|Terrace|Boulevard|Blvd|Crescent|Mews|Gardens|Quay|Wharf|Alley|Grove|Parade|St\\.|Rd\\.|Ave\\.';
  const NOT_BEFORE = 'The|A|An|Her|His|Their|My|Your|Our|This|That|Every|Each|No|Death|Skid|Back|Front|Side|Hard|Flash|Food|Supreme|Federal|High|Fire|Test|Cross|Dead|Rear|In|At|On|Along|Near|Off|By|From|To|Down|Up|Past|Behind|Across|Over|Under|Around|Through|Outside|Inside|Beside|Until|After|Before|When|While|And|But|She|He|They|It|We|You|I';
  const streetRe = new RegExp(`(?:\\b\\d{1,5}[A-Za-z]?\\s+)?\\b(?!(?:${NOT_BEFORE})\\b)[A-Z][a-z'’]+(?:\\s+[A-Z][a-z'’]+)?\\s+(?:${SUFFIX})(?![A-Za-z])`, 'g');
  const unitRe = /\b(?:apartment|apt\.?|flat|unit|suite|room)\s+(?:no\.?\s*)?#?\d{1,4}[A-Za-z]?\b/gi;

  // every street or address in the text: [{word, index}]
  function find(text) {
    const t = String(text || ''), out = [];
    for (const re of [streetRe, unitRe]) { re.lastIndex = 0; let m; while ((m = re.exec(t))) { if (!out.some(o => o.index === m.index)) out.push({word: m[0].trim(), index: m.index}); } }
    return out.sort((a, b) => a.index - b.index);
  }
  const words = text => [...new Set(find(text).map(o => o.word))];
  // one line for a checker: null when clean
  function problem(text) {
    const w = words(text); if (!w.length) return null;
    return `names a street or an address (${w.slice(0, 3).join(', ')}${w.length > 3 ? '…' : ''}). Never name a street, address or apartment number: say the place plainly ("her apartment", "the corner café", "across town").`;
  }
  const RULE = 'PLACES: never name a street, road, address, apartment or building number, neighbourhood or district anywhere in a card or bot, in narration or in dialogue, and do not use a town or city name unless the rulebook, the event or the card brief gives one. A place name adds nothing to the story and only spends the character limit. Say the place plainly: "her apartment", "the corner café", "the car park behind the shop", "across town".';

  // American English: a card or bot is written in American spelling and vocabulary ("apartment", never "flat")
  const DET = 'your|her|his|their|my|our|the|a|this|that|shared|small|tiny|cramped|little|narrow|new|old|own|whose';
  const AFTER = '[.,;:!?\'’")\\u2014-]|$|\\s+(?:on|in|at|with|and|to|for|that|was|is|had|has|of|across|from|after|before|while|because|where|which|so|but|or|when|since|again|too|now|then|tonight|alone|as|by|above|below|upstairs|downstairs|never|always|still)\\b';
  const flatRe = new RegExp(`\\b(?:${DET})\\s+(?:[a-z]+\\s+)?(flat)(?=\\s*(?:${AFTER}))`, 'gi');
  const BRIT = [
    ['flatmate', /\bflat[- ]?(?:mates?|shares?|sharing)\b/gi], ['tea towel', /\btea[- ]towels?\b/gi], ['grey', /\bgrey(?:ish|ing|ed|s)?\b/gi],
    ['mum', /\b(?:mum|mummy|mums)\b/gi], ['pavement', /\bpavements?\b/gi], ['lorry', /\blorr(?:y|ies)\b/gi], ['lift (elevator)', /\b(?:the|a|her|his|your|their)\s+lift\b/gi],
    ['rubbish', /\brubbish\b/gi], ['bin', /\b(?:dust|wheelie|rubbish)bins?\b/gi], ['queue', /\bqueue[ds]?\b|\bqueuing\b/gi], ['petrol', /\bpetrol\b/gi], ['car park', /\bcar[- ]parks?\b/gi],
    ['trousers', /\btrousers\b/gi], ['jumper', /\bjumpers?\b/gi], ['trainers', /\btrainers\b/gi], ['torch', /\b(?:a|the|her|his|your|their)\s+torch\b/gi], ['biscuit', /\bbiscuits?\b/gi],
    ['crisps', /\bcrisps\b/gi], ['sweets', /\b(?:a|the|bag of|box of|jar of)\s+sweets\b/gi], ['takeaway', /\btake-?aways?\b/gi], ['fortnight', /\bfortnights?\b/gi], ['whilst', /\b(?:whilst|amongst|learnt|dreamt)\b/gi],
    ['hob', /\b(?:the|a|her|his)\s+hob\b/gi], ['cooker', /\b(?:the|a|her|his)\s+cooker\b/gi], ['cheque', /\bcheques?\b/gi], ['postcode', /\bpostcodes?\b/gi], ['mobile phone', /\bmobile(?: phone)?s?\b(?=\s*(?:[.,;]|rang|buzzed|lit|on|in|beside|face|screen|phone|number))/gi],
    ['colour', /\b(?:colou?r)(?:s|ed|ful|less)?\b/gi, true], ['-our spelling', /\b(?:favou?rite|neighbou?r|honou?r|humou?r|flavou?r|harbou?r|behaviou?r|rumou?r|savou?r|labou?r)(?:s|ed|ing|hood|able)?\b/gi, true],
    ['-ise spelling', /\b(?:realis|recognis|apologis|organis|emphasis|minimis|summaris|criticis|authoris|specialis)(?:e|es|ed|ing)\b/gi], ['centre', /\b(?:centre|centres|metre|metres|theatre|theatres)\b/gi], ['cosy', /\b(?:cosy|mould|mouldy|tyre|tyres|kerb|programme|jewellery)\b/gi],
  ];
  function british(text) {
    const t = String(text || ''), out = new Set();
    flatRe.lastIndex = 0; let m; while ((m = flatRe.exec(t))) out.add('flat');
    for (const [name, re, spellingOnly] of BRIT) {
      re.lastIndex = 0; const mm = t.match(re); if (!mm) continue;
      if (name === 'colour') { if (mm.some(x => /^colou/i.test(x))) out.add('colour'); continue; }
      if (name === '-our spelling') { if (mm.some(x => /ou/i.test(x))) out.add(mm.find(x => /ou/i.test(x)).toLowerCase()); continue; }
      out.add(name === 'grey' ? mm[0].toLowerCase() : mm[0].toLowerCase());
    }
    return [...out];
  }
  const US_RULE = 'AMERICAN ENGLISH: write American English only, in American spelling and American words, and set every story in an ordinary American setting unless the rulebook, the event or the card brief says otherwise. A home is an "apartment" (never a "flat"), a roommate is never a "flatmate", and write elevator, sidewalk, trash, line (not queue), cookies, chips, candy, sweater, pants, sneakers, flashlight, dish towel, stove, cell phone, gas, parking lot, takeout, mom, check (not cheque); and color, gray, neighbor, favorite, realize, center. No British words, spellings or turns of phrase.';
  const problemUS = text => { const w = british(text); return w.length ? `uses British words or spellings (${w.slice(0, 5).join(', ')}${w.length > 5 ? '…' : ''}). Write American English: "apartment" not "flat", "gray" not "grey", "dish towel" not "tea towel", "mom" not "mum", "color", "neighbor", "realize".` : null; };
  const problem0 = problem;
  const problemAll = text => [problem0(text), problemUS(text)].filter(Boolean).join(' Also it ') || null;
  const api = {find, words, problem: problemAll, british, RULE: RULE + ' ' + US_RULE};
  if (typeof window !== 'undefined') window.PlaceNames = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
