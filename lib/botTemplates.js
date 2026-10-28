// Reads the bot templates (the .txt files written for AI) and turns them into a
// structure the Bot Builder can fill in by hand: fixed text stays fixed,
// every [bracketed placeholder] becomes a field, and the template's own rules
// (character limits, image count, tag rules, bans) become live checks.
const fs = require('fs');
const path = require('path');

const S = '\u0001', E = '\u0002';           // name-token sentinels
const NAME_RE = new RegExp(`${S}(N[123]\\??U?)${E}`, 'g');

// the name shown everywhere follows the file name ("7._PigeonGuy_Template_Post-NTR_October_2026_V3.txt" -> "7. PigeonGuy Template Post-NTR October 2026 V3")
const {prettyName, compare: byTemplateName} = require('./templateNames');
const num = s => Number(String(s).replace(/,/g, ''));

function markNames(t) {
  return t
    .replace(/\{\{Name([123])\}\}/g, `${S}N$1${E}`)
    .replace(/\[Name3 if used\]/g, `${S}N3?${E}`)
    .replace(/\[Name([123])\]/g, `${S}N$1${E}`)
    .replace(/\[(?:Insert )?Character Name\]/g, `${S}N1${E}`)
    .replace(/\[Name\]/g, `${S}N1${E}`)
    .replace(/\[NAME\]/g, `${S}N1U${E}`);
}

// "[CRITICAL REQUIREMENT: ...]", "[BEGIN ... HERE.]", "[DO NOT ...]" etc.
function isInstructionLine(line) {
  const t = line.trim();
  if (!t.startsWith('[')) return false;
  const inner = t.slice(1);
  const first = inner.split(/[\s:\]]/)[0];
  return /^[A-Z][A-Z0-9\-\/&'’]*$/.test(first) && first.replace(/[^A-Z]/g, '').length >= 2 && !inner.startsWith(S);
}
// a bracket is a rule label (fixed text, never a box) when its first word is ALL CAPS ("[USER AGENCY HARD LOCK]"), or when the whole bracket is capitals and numbers
// whose first word is a numbered tag like "R2" or "R10" ("[R2 STYLE]", "[R9 FIRST RESPONSE, ONE TIME ONLY]"): a one-letter-plus-number word is not enough on its own to tell
const isAllCapsLabel = c => { const t = c.replace(/\{\{[^}]*\}\}/g, '').trim(), w = t.split(/[\s:]/)[0];       // "[{{user}} NAME DIRECTIVE]" is a rule label too: the {{user}} token does not make it a blank
   if (/^[A-Z][A-Z0-9\-\/&'’]*$/.test(w) && w.replace(/[^A-Z]/g, '').length >= 2) return true; return /^[A-Z]\d{1,3}\s/.test(t) && !/[a-z]/.test(t) && t.replace(/[^A-Z]/g, '').length >= 4; };

function stripMeta(text) {
  return text.replace(/\[START INSTRUCTIONS[\s\S]*?\[END INSTRUCTIONS[^\]]*\]\n?/g, '');
}
function findLimit(text) {
  const m = /([\d,]{3,6})\s*(?:-|–|—|and|to)\s*([\d,]{3,6})\s*characters/i.exec(text || '');
  return m ? {min: num(m[1]), max: num(m[2])} : null;
}

// Split a block of kept lines into segments: literal text, name tokens, placeholders.
function segmentLines(lines, section, ctx) {
  const out = [];
  let group = '', block = '', opt3 = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/OPTIONAL NAME3 BLOCK/.test(raw)) { opt3 = true; continue; }
    const g = raw.match(new RegExp(`\\[ ?${S}N([123])\\??U?${E} ?\\] from`));
    if (g) group = `Character ${g[1]}`;
    const b = raw.match(/^\s*([A-Za-z][\w &/'’-]{1,40}):\s*[\[{]\s*$/);
    if (b) block = b[1].trim();
    // "[LONG-ENGAGEMENT ENGINE - SYSTEM RULES FIELD]: Define at least three..." is a fill-in area:
    // keep the label, and the text after the colon is the instruction for what to write there
    const fieldLine = raw.match(/^(\s*)\[([A-Z][A-Z0-9 \-\/&'’]*\bFIELD)\]:\s*(\S.*)$/);
    if (fieldLine) {
      const key = `${section}.${ctx.n++}`, title = fieldLine[2].replace(/\s*-\s*.*FIELD$|\s+FIELD$/, '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
      out.push({segs: [{t: 'lit', v: `${fieldLine[1]}[${fieldLine[2]}]: `}, {t: 'ph', key, label: title, ctx: '', hint: fieldLine[3].trim(), group, block, mode: 'field', endsSentence: false, orig: fieldLine[3].trim()}], opt3});
      continue;
    }
    const segs = [];
    let last = 0; const re = /\[([^\[\]\n]+)\]/g; let m;
    while ((m = re.exec(raw))) {
      const content = m[1];
      const bare = content.replace(new RegExp(`${S}[^${E}]*${E}`, 'g'), '').replace(/['’]s\b/g, '').trim();
      if ((content.includes(S) && bare.split(/\s+/).filter(w => /[a-z]/i.test(w)).length < 3) || isAllCapsLabel(content)) continue;      // literal brackets / rule labels
      if (m.index > last) segs.push({t: 'lit', v: raw.slice(last, m.index)});
      const colon = content.indexOf(':');
      const before = raw.slice(0, m.index).replace(NAME_RE, '').replace(/^[\s*•\-"“]+/, '').replace(/[:\s"“]+$/, '').trim();
      const inline = (before.split(/[.;,]\s+|\]\s*/).pop() || '').replace(/^(and|plus|or)\s+/i, '').trim();
      const clip = (t, n) => t.length > n ? t.slice(0, n - 1) + '…' : t;
      const isField = /[:：]\s*$/.test(raw.slice(0, m.index)) && inline.length > 0 && inline.length < 60;
      let label = isField ? clip(inline, 70)
        : colon > 0 && colon < 42 ? content.slice(0, colon).trim()
        : inline.length >= 8 ? clip(inline, 70)
        : clip(content.replace(NAME_RE, 'name'), 60);
      const hint = content.replace(NAME_RE, (x, n) => `[${n.startsWith('N1') ? 'Name' : 'Name' + n[1]}]`);
      const key = `${section}.${ctx.n++}`;
      const after = raw.slice(m.index + m[0].length);
      const pre = raw.slice(0, m.index).replace(new RegExp(`${S}[^${E}]*${E}`, 'g'), 'X').replace(/["“*•\-]\s*$/, '');
      const mode = /^\s*:/.test(after) ? 'key' : (/[A-Za-z0-9,’'’)]\s*$/.test(pre) && !/^\s*$/.test(pre) && !/:\s*$/.test(pre)) ? 'phrase' : 'field';
      segs.push({t: 'ph', key, label, ctx: before, hint, group, block, mode, endsSentence: /^\s*[.!?]/.test(after), orig: `[${hint}]`});
      last = m.index + m[0].length;
    }
    if (last < raw.length) segs.push({t: 'lit', v: raw.slice(last)});
    // an "[e.g., ...]" line is an example for the placeholder above it
    if (segs.length === 1 && segs[0].t === 'ph' && /^e\.g\./i.test(segs[0].hint) && out.length) {
      const prev = [...out].reverse().find(l => l.segs.some(s => s.t === 'ph'));
      if (prev) { const p = [...prev.segs].reverse().find(s => s.t === 'ph'); p.hint += `  (${segs[0].hint})`; continue; }
    }
    out.push({segs: segs.length ? segs : [{t: 'lit', v: ''}], opt3});
    if (opt3 && raw === '}') opt3 = false;
  }
  // trim blank edges
  const blank = l => l.segs.every(s => s.t === 'lit' && !s.v.trim());
  while (out.length && blank(out[0])) out.shift();
  while (out.length && blank(out[out.length - 1])) out.pop();
  return out;
}

// "[LONG-ENGAGEMENT ENGINE - SYSTEM RULES FIELD]: Define at least three..." is a box to fill, not an instruction:
// turn it into "Long-Engagement Engine: [Define at least three...]" so it reads like any other field
function fieldLines(text) {
  return String(text).replace(/^(\s*)\[([^\]\n]*?\bFIELD)\]:\s*(.+)$/gm, (m, sp, label, ins) => {
    const name = label.replace(/\s*-\s*[^-]*\bFIELD$/i, '').replace(/\bFIELD$/i, '').trim().toLowerCase().replace(/(^|[\s-])([a-z])/g, (x, a, b) => a + b.toUpperCase());
    return `${sp}${name || 'Field'}: [${ins.replace(/[\[\]]/g, '').trim()}]`;
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// v1.3.0: every template is welcome. Other people write theirs with other headings ("## First Message", "**Persona**", "1. Scenario"),
// in another order, with sections missing, or with no headings at all. Before the template is read, its headings are put into the
// names this reader knows, the sections are put in the order it expects, and a missing Personality or Greeting becomes an empty one.
// A template that already uses the known headings in the known order comes back word for word (nothing in it is touched).
const HEAD_ALIASES = [
  ['Introduction', /^(introduction|intro|bot introduction|intro text)$/i],
  ['Personality', /^(personality|persona|character|character sheet|character description|character profile|description|bio|profile)$/i],
  ['Scenario', /^(scenario|scenarios|situation|premise|roleplay scenario|setting|context)$/i],
  ['Greeting', /^(greeting|first message|first greeting|first greeting message|opening message|opening line|opening|intro message)$/i],
  ['Image Generation', /^(image generation|image prompts?|image gen|images|image settings)$/i],
  ['Tags', /^(tags)$/i],
  ['Scene Breakdown', /^(scene breakdown|scenes|scene list)$/i],
  ['Interaction Examples', /^(interaction examples|example dialogues?|example conversations?|examples|conversations|triggered interactions|sample dialogues?|example messages)$/i]
];
// a heading line: the section name on its own, with a colon, hashes, bold, brackets, a number or dashes around it ("## First Message", "**Persona:**", "1) Scenario -", "=== Tags ===")
function headingOf(line, bare) {
  let t = String(line || '').trim();
  if (!t || t.length > 60) return null;
  let deco = /^#{1,6}\s/.test(t) || /^\*\*|^__/.test(t) || /:\s*$/.test(t) || /^\[.*\]$/.test(t) || /^[=\-~_*#]{2,}\s*\S.*\S\s*[=\-~_*#]{2,}$/.test(t) || /^\d+[.)]\s/.test(t) || /\s[-–—]\s*$/.test(t);
  t = t.replace(/^#{1,6}\s*/, '').replace(/^\d+[.)]\s*/, '').replace(/^[=\-~_*#\s]+|[=\-~_*#\s]+$/g, '').replace(/^\[|\]$/g, '').replace(/[:\s\-–—]+$/g, '').replace(/^\*+|\*+$/g, '').trim();
  if (!deco && !bare) return null;
  for (const [name, re] of HEAD_ALIASES) if (re.test(t)) return {name, exact: t.toLowerCase() === name.toLowerCase()};
  return null;
}
function normalizeTemplate(text) {
  const src = String(text).replace(/\r\n/g, '\n'), lines = src.split('\n');
  const scan = bare => { let hs = []; lines.forEach((l, i) => { const n = headingOf(l, bare); if (n) hs.push({i, name: n.name, exact: n.exact}); });
    for (const nm of new Set(hs.map(h => h.name))) if (hs.some(h => h.name === nm && h.exact)) hs = hs.filter(h => h.name !== nm || h.exact);      // a heading with the section's own name beats a look-alike ("Description" next to "Personality")
    return hs; };
  const need = hs => hs.some(h => h.name === 'Personality') && hs.some(h => h.name === 'Greeting');
  let heads = scan(false);
  let bareUsed = false;
  if (!need(heads)) { const loose = scan(true); if (loose.length > heads.length) { heads = loose; bareUsed = true; } }
  const notes = {noHeadings: false, added: [], reordered: false, renamed: 0, interaction: ''};
  const canon = n => n + ':';
  // 1) only the heading lines are rewritten when they were not already the known ones
  const out = lines.slice();
  const first = new Map(); // keep only the first heading of each name as a section start; a repeated name is text inside the section
  const keep = [];
  for (const h of heads) { if (h.name === 'Interaction Examples' || !first.has(h.name)) { first.set(h.name, true); keep.push(h); } }
  // headings that the old reader looked for with a regex keep their exact line when they already match it
  for (const h of keep) { const cur = lines[h.i]; if (cur.trim() === canon(h.name) || (h.name === 'Image Generation' && /^Image Generation/.test(cur)) || (h.name === 'Greeting' && /^Greeting:(\s*$|\s*\[)/.test(cur))) continue; out[h.i] = canon(h.name); notes.renamed++; }
  let body = out;
  // 2) no headings at all: the whole text is the Personality
  if (!keep.length) {
    notes.noHeadings = true;
    const t = lines.join('\n').trim();
    if (!t) throw new Error('This template file is empty.');
    notes.added = ['Introduction', 'Scenario', 'Greeting'];
    return {text: `Personality:\n${t}\n\nGreeting:\n`, notes};
  }
  // 3) section order and missing sections
  const order = ['Introduction', 'Personality', 'Scenario', 'Greeting'];
  const idx = n => { const h = keep.find(x => x.name === n); return h ? h.i : -1; };
  const known = order.map(idx).filter(i => i >= 0);
  const ascending = known.every((v, k) => !k || v > known[k - 1]);
  const tail = ['Image Generation', 'Tags', 'Scene Breakdown'].map(idx).filter(i => i >= 0);
  const gi = idx('Greeting');
  const tailAfter = gi < 0 || tail.every(i => i > gi);
  const intr = keep.filter(h => h.name === 'Interaction Examples');
  const missingP = idx('Personality') < 0, missingG = gi < 0;
  const exAfterAll = intr.every(h => h.i > Math.max(...keep.filter(x => x.name !== 'Interaction Examples').map(x => x.i), -1));
  if (ascending && tailAfter && !missingP && !missingG && (!intr.length || exAfterAll)) {
    if (intr.length) { const ei = intr[0].i; notes.interaction = lines.slice(ei + 1).join('\n').trim(); body = out.slice(0, ei); }
    return {text: body.join('\n'), notes};
  }
  // rebuild: text above the first heading stays on top, then each section in the order the reader expects
  const sorted = keep.slice().sort((a, b) => a.i - b.i);
  const secs = new Map();
  sorted.forEach((h, k) => { const end = k + 1 < sorted.length ? sorted[k + 1].i : out.length; secs.set(h.name === 'Interaction Examples' ? 'Interaction Examples' + k : h.name, out.slice(h.i, end).join('\n').replace(/\s+$/, '')); });
  const pre = out.slice(0, sorted[0].i).join('\n').replace(/\s+$/, '');
  const parts = [];
  if (pre) parts.push(pre);
  for (const n of ['Introduction', 'Personality', 'Scenario', 'Greeting']) {
    if (secs.has(n)) parts.push(secs.get(n));
    else if (n === 'Personality' || n === 'Greeting') { parts.push(canon(n)); notes.added.push(n); }
  }
  for (const n of ['Image Generation', 'Tags', 'Scene Breakdown']) if (secs.has(n)) parts.push(secs.get(n));
  const ex = [...secs.keys()].filter(k => k.startsWith('Interaction Examples')).map(k => secs.get(k).replace(/^[^\n]*\n?/, '')).join('\n\n').trim();
  notes.interaction = ex;
  notes.reordered = !ascending || !tailAfter;
  return {text: parts.join('\n\n') + '\n', notes};
}

// How the template writes the Greeting, from its own words and example lines:
//   'quoted'  "dialogue" with *narration* (single asterisks / double quotes)   'script'  Name: dialogue lines   'free'  nothing said, so nothing is imposed
function greetingStyle(gRaw, markers, free) {
  const lines = String(gRaw || '').split('\n').map(l => l.trim()).filter(l => l && !/^!\[/.test(l) && !/^---+$/.test(l));
  const quoted = lines.filter(l => /^\*[^*\n]/.test(l) || /^["“]/.test(l)).length;
  const script = lines.filter(l => /^(?:\[[^\]\n]{1,30}\]|\{\{[a-z]+\}\}|[A-Z][\w'’ .-]{0,24}):\s*\S/.test(l) && !/^(?:Greeting|Note|Rule|Example|Format|Check|Paragraph \d+|Exactly|Important|Warning|Tip)\b/i.test(l)).length;
  const worded = /single\s+asterisks|inside\s+asterisks|wrapped\s+in\s+asterisks|double\s+quotation\s+marks|double\s+quotes|straight\s+quotes/i.test(gRaw);
  if (script >= 2 && script > quoted) return 'script';
  if (quoted || worded) return 'quoted';
  if (script === 1 && !markers && free) return 'script';
  return free ? 'free' : 'quoted';       // a template with picture markers and no example lines is one of the app's own: its layout
}
// the youngest age the template allows ("All characters are 21+ adults", "age 18 or older", "at least 18"). The figure the template repeats most wins; nothing said: 18.
function ageFloor(text) {
  const t = String(text || '').replace(/\b\d{2}\s*\+\s*(?:chars?|characters|words|tags|archetypes|hours|days|minutes)\b/ig, ''), seen = new Map();
  for (const re of [/\b(\d{2})\s*\+/g, /\b(\d{2})\s*(?:years?(?: old)?\s*)?(?:or|and)\s+(?:older|over|above|up)\b/gi, /\bat\s+least\s+(\d{2})(?:\s*(?:years|yrs))?\b/gi, /\b(?:over|above|older than)\s+(\d{2})\b/gi, /\bages?\s+(\d{2})\s*(?:or|and)\b/gi]) {
    let m; while ((m = re.exec(t))) { const a = Number(m[1]); if (a < 18 || a > 99) continue; const ctx = t.slice(Math.max(0, m.index - 90), m.index + 90); if (!/\bage|adult|old|year|characters? (?:are|is|must)|\bunder\b/i.test(ctx)) continue; seen.set(a, (seen.get(a) || 0) + 1); }
  }
  let best = 18, n = 0; for (const [a, c] of seen) if (c > n || (c === n && a > best)) { best = a; n = c; }
  return best;
}
function parseTemplate(text, file) {
  const norm = normalizeTemplate(text);
  const originalText = norm.text;
  text = fieldLines(norm.text);
  text = text.replace(/\r\n/g, '\n');
  const L = text.split('\n');
  const find = (re, from = 0, to = L.length) => { for (let i = from; i < to; i++) if (re.test(L[i])) return i; return -1; };
  const findLast = (re, from, to) => { for (let i = to - 1; i >= from; i--) if (re.test(L[i])) return i; return -1; };

  const intro = find(/^Introduction:\s*$/);
  const pers = find(/^Personality:\s*$/, intro + 1);
  const greet = find(/^Greeting:(\s*$|\s*\[)/, pers + 1);
  let persEnd = Math.min(greet > 0 ? greet : L.length, ...[find(/^Scenario:\s*$/, pers + 1), find(/^You are (filling out|completing)/, pers + 1)].filter(i => i > 0));
  // the section title line that sits just above "You are completing a Scenario template" (a bare "Scenario") belongs to the Scenario, not the end of the Personality
  while (persEnd > pers + 1 && (!L[persEnd - 1].trim() || /^Scenario\s*$/i.test(L[persEnd - 1].trim()))) persEnd--;
  const scen = findLast(/^Scenario:\s*$/, pers + 1, greet);
  const img = find(/^Image Generation/, greet + 1);
  const tagsH = find(/^Tags:\s*$/, greet + 1);
  const app = find(/^Appearance:\s*$/, img + 1), clo = find(/^Clothing and Accessories:\s*$/, img + 1);
  const act = find(/^Action (&|and) Background:\s*$/, img + 1), neg = find(/^Negative Prompt:\s*$/, img + 1);
  const sb = findLast(/^Scene Breakdown:\s*$/, greet + 1, L.length);
  // a bot needs a Personality and a Greeting; the Introduction and Scenario are optional (a template without them simply has none)
  if (pers < 0 || greet < 0) throw new Error('This file does not look like a bot template (it needs at least a Personality and a Greeting section).');
  const slice = (a, b) => L.slice(a, b).join('\n');

  // ---- header (scene name / name / age)
  const header = [];
  for (const [key, re] of [['scene', /^(Scene'?s? ?Name):\s*(.*)$/i], ['name', /^(Name|Character Name):\s*(.*)$/], ['age', /^(Age):\s*(.*)$/]]) {
    const i = find(re, 0, intro >= 0 ? intro : pers); if (i < 0) continue;
    const m = L[i].match(re);
    header.push({key, label: m[1], nextLine: !m[2].trim(), hint: (m[2] || L[i + 1] || '').replace(/[\[\]]/g, '').trim()});
  }

  // ---- introduction
  const introRaw = intro >= 0 ? slice(intro + 1, pers) : '';
  let introPrefix = '';
  const pm = /(?:begin|start)(?:s)? (?:exactly )?with (\[[^\]]+\])/i.exec(introRaw);
  if (pm && !/series prefix/i.test(pm[0])) introPrefix = pm[1];
  const litPrefix = introRaw.match(/^\s*(\[[A-Z][^\]]{0,30}\])\s*\[/m);
  if (!introPrefix && litPrefix) introPrefix = litPrefix[1];
  const introHint = (introRaw.match(/\[(Insert[^\n]*?)\](?:\s|$)/) || [, ''])[1];

  // ---- personality
  let pL = L.slice(pers + 1, persEnd);
  const begin = pL.findIndex(l => /\[BEGIN PERSONALITY OUTPUT/.test(l));
  if (begin >= 0) pL = pL.slice(begin + 1);
  pL = markNames(pL.join('\n')).split('\n').filter(l => /OPTIONAL NAME3 BLOCK/.test(l) || !isInstructionLine(l));
  const ctx = {n: 0};
  const personality = segmentLines(pL, 'personality', ctx);

  // ---- scenario
  let sText = scen >= 0 ? stripMeta(slice(scen + 1, greet)) : '';
  let sL = sText.split('\n');
  const sBegin = sL.findIndex(l => /\[BEGIN SCENARIO OUTPUT/.test(l));
  if (sBegin >= 0) sL = sL.slice(sBegin + 1);
  const sr = sL.findIndex(l => /^System Rules\s*\{/.test(l.trim()));
  let pre = sr > 0 ? sL.slice(0, sr) : [];
  // the note telling the AI the two agency rules are protected is an instruction, not bot text
  const sys = (sr >= 0 ? sL.slice(sr) : sL).filter(l => !/^The following (?:two )?System Rules? (?:is|are) immutable protected hard text/i.test(l.trim()));
  while (sys.length && !sys[sys.length - 1].trim()) sys.pop();
  pre = pre.filter(l => !isInstructionLine(l)).filter(l => {
    const t = l.trim(); if (!t) return true;
    return /\[[^\]]+\]/.test(t) || (/^[A-Z][A-Z0-9 &'’\-]+$/.test(t) && t.length < 40);
  }).map(l => l.replace(/(\])\.\s+(Do not|Don't|Never)[^[]*$/, '$1.'));
  const scenario = segmentLines(markNames([...pre, ...(pre.length ? [''] : []), ...sys].join('\n')).split('\n'), 'scenario', ctx);

  // ---- greeting
  const gEnd = [img, tagsH, sb].filter(i => i > greet).sort((a, b) => a - b)[0] || L.length;
  const gRaw = L[greet].replace(/^Greeting:/, '') + '\n' + slice(greet + 1, gEnd);
  const markers = (gRaw.match(/^!\[\]\(image\d+\)\s*$/gm) || []).length;
  let paragraphs = [], freeGreeting = false;
  if (markers) {
    let cur = [];
    for (const l of gRaw.split('\n')) {
      if (/^!\[\]\(image\d+\)\s*$/.test(l)) { paragraphs.push(cur.join(' ').trim()); cur = []; continue; }
      const t = l.trim();
      if (/^[*"“]/.test(t)) cur.push(t.replace(/^\*|\*$/g, '').replace(/^["“]\[?|\]?["”]$/g, '"').replace(/[\[\]]/g, ''));
    }
  } else if (!/exactly (\d+) (?:image markers|substantial)/i.test(gRaw) && !/image marker|!\[\]\(image/i.test(gRaw)) {
    // v1.3.0: this template does not use picture markers. The Greeting is one text of the person's own, with no marker count to meet.
    freeGreeting = true; paragraphs = ['Write the Greeting.'];
  } else {
    const n = Number((/exactly (\d+) (?:image markers|substantial)/i.exec(gRaw) || [, 6])[1]);
    paragraphs = Array.from({length: n}, (_, i) => i === n - 1
      ? 'Final paragraph: dramatize the User Interaction Hook exactly once as the final live beat, then stop before {{user}} responds.'
      : `Paragraph ${i + 1}: continue the Setup in order. Connected action, dialogue, and continuity with the paragraph before.`);
  }
  // every [... LOCK] block written in the Greeting section, word for word, so any rule you add reaches the story brief and the AI
  const locks = [];
  { const gl = String(gRaw || '').split('\n');
    for (let i = 0; i < gl.length; i++) { const h = gl[i].trim(); if (!/^\[[^\]]*LOCK[^\]]*\]$/.test(h)) continue;
      const body = []; for (let j = i + 1; j < gl.length && gl[j].trim() && !/^\[[^\]]*\]$/.test(gl[j].trim()); j++) body.push(gl[j].trim());
      if (body.length) locks.push({title: h.slice(1, -1), text: body.join('\n')}); } }
  const greeting = {
    count: paragraphs.length, hints: paragraphs, locks, raw: gRaw,
    limit: findLimit(gRaw),
    banColonSemi: /COLON \/ SEMICOLON BAN/.test(gRaw),
    banEmDash: /em dash/i.test(gRaw),
    // "you" in the Greeting's narration (the one line of dialogue that says {{user}} is still allowed)
    banUserToken: /Do not use the literal \{\{user\}\} token|Address \{\{user\}\} as you\/your in Greeting narration/i.test(gRaw),
    free: freeGreeting,
    style: greetingStyle(gRaw, markers, freeGreeting),
    deliveryCue: /DELIVERY CUE/i.test(text),
    separator: /^---\s*$/m.test(gRaw) ? '---' : ''
  };

  // ---- image generation
  const quality = (/DO NOT MODIFY "(\([^"]+\))"/.exec(text) || [, ''])[1];
  const negLine = neg > 0 ? L.slice(neg + 1, neg + 6).find(l => l.trim().startsWith('(')) : '';
  const imageRulesOn = false;     // the Creator Tool adds no rules of its own: the person's template says what it wants
  const imageRaw = (() => { if (!(img > 0)) return ''; const ends = [tagsH, sb].filter(x => x > img), k = neg > img ? L.slice(neg + 1, neg + 6).findIndex(l => l.trim().startsWith('(')) : -1, stop = k >= 0 ? neg + 2 + k : (ends.length ? Math.min(...ends) : L.length); return slice(img, stop).trim(); })();     // the template's own Image Generation section, heading included (the person's own rules for it)
  const image = {present: img > 0, freeform: img > 0 && ![app, clo, act, neg].some(i => i > 0), raw: imageRaw, quality, negative: (negLine || '').trim(), appearanceHint: !imageRulesOn ? '' : 'hair, eyes, skin, and a tattoo only if the scenario card gives her one (never her age)',
    clothingHint: !imageRulesOn ? '' : 'clothing and accessories only (V-neckline showing cleavage, include the lower-body garment, no shoes, socks, footwear or gloves; no phones, tools or other things she carries, no style labels such as casual wear)',
    actionHint: !imageRulesOn ? '' : 'close-up shot, environment, place, lighting only'};

  // ---- tags
  const tagZone = tagsH > 0 ? slice(tagsH + 1, img > tagsH ? img : (sb > tagsH ? sb : L.length)) : slice(neg > 0 ? neg : greet, sb > 0 ? sb : L.length);
  const totalM = /(?:exactly|Output exactly) (\d+) tags total/i.exec(text) || /\b(?:exactly|output|choose|select|pick|use)\s+(\d+)\s+tags\b/i.exec(text);
  let mandatory = [], archetypeRequired = false, wifeRule = false, archetypes = [];
  const mm = /The mandatory tags are (.+?)\. (?:The|If|Choose)/.exec(tagZone);
  if (mm) {
    mandatory = [...mm[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
    archetypeRequired = /archetype/i.test(mm[1]);
  }
  if (/"Wife" is ALSO mandatory/.test(tagZone)) wifeRule = true;
  // the approved archetypes, in any of the wordings the templates use, wherever the rule sits:
  //   "must be exactly one of: A, B, or C" / "one of these 23 approved archetypes: A, B, C." /
  //   "one of the 23 approved archetypes (A, B, or C)" / "It must be one of: A, B, or C."
  const listRe = /(?:must be exactly one of:?|one of these \d+ approved archetypes:|one of the \d+ approved archetypes \(|It must be one of:)\s*([A-Z][a-z]+(?:, (?:or )?[A-Z][a-z]+)+)/g;
  let best = [];
  for (const m of text.matchAll(listRe)) { const names = m[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map(x => x.trim()).filter(Boolean); if (names.length > best.length) best = names; }
  if (best.length) archetypes = best;
  // the archetype tag counts as mandatory however the template says it
  if (/archetype tag is mandatory|Mandatory archetype tag|archetype tag \([^)]*\) is mandatory/i.test(text)) archetypeRequired = true;
  if (!mm) {                       // "Mandatory NTR tags:" style lists
    const zl = tagZone.split('\n');
    for (let i = 0; i < zl.length; i++) if (/^Mandatory .*tags?:\s*$/i.test(zl[i].trim()))
      for (let j = i + 1; j < zl.length && zl[j].trim(); j++) { const t = zl[j].trim(); if (!/^\[/.test(t)) mandatory.push(t); }   // [bracketed lines] are instructions, not tags
  }
  let approved = [];
  const ai = L.findIndex(l => /APPROVED TAG LIST HARD LOCK/.test(l));
  if (ai >= 0) {
    let j = ai + 1; while (j < L.length && L[j].trim()) j++; while (j < L.length && !L[j].trim()) j++;
    for (; j < L.length && L[j].trim() && !/^Finally/.test(L[j]); j++) approved.push(L[j].replace(/\s*\(.*\)\s*$/, '').trim());
  }
  const total = totalM ? Number(totalM[1]) : (approved.length ? 8 : 0);
  const tags = {total, freeform: !approved.length, mandatory: [...new Set(mandatory)], archetypeRequired, archetypes, wifeRule, approved, afterImage: !(tagsH > 0 && tagsH < img)};

  // ---- scene breakdown
  const sbL = sb > 0 ? L.slice(sb + 1) : [];
  const shotLine = sbL.find(l => /^Shot Angle:/.test(l)) || 'Shot Angle: [shot angle]';
  const shotPrefix = shotLine.replace(/^Shot Angle:\s*/, '').split('[')[0];
  const scene = {present: sb > 0, freeform: sb > 0 && !sbL.some(l => /^Shot Angle:/.test(l)), shotPrefix, noPOV: /MUST BE VIEWER\/CAMERA-FACING ONLY/.test(text),
    settingHint: ((sbL.find(l => /^Setting:/.test(l)) || '').match(/\[([^\]]+)\]/) || [, 'setting from the marked paragraph'])[1],
    actionHint: ((sbL.find(l => /^Action:/.test(l)) || '').match(/\[([^\]]+)\]/) || [, 'visible action toward the viewer/camera'])[1].replace(NAME_RE, 'the character')};

  // the Personality + Scenario + Greeting total, in any of the wordings the templates use:
  //   "together total between 7,900 and 8,700 characters" / "should remain within approximately 11,000-11,400 characters" /
  //   "should together total approximately 7,800-8,900 characters"
  const tot = /together total between ([\d,]+) and ([\d,]+) characters/i.exec(text)
    || /total[^.\]]*?(?:approximately|between)\s*([\d,]+)\s*(?:-|–|and|to)\s*([\d,]+)\s*characters/i.exec(text);
  const rules = {
    // "must" bounds are hard; "should ... approximately" bounds are approximate (shown as a warning, never cut below a section's minimum)
    total: tot ? (() => { const at = text.lastIndexOf('\n', tot.index) + 1, sentence = text.slice(at, text.indexOf('\n', tot.index + tot[0].length) >>> 0 || undefined);
      const atLeast = /at least ([\d,]+) characters/i.exec(sentence), approx = /approximately|should/i.test(sentence) && !/must together total between/i.test(tot[0]);
      return {min: atLeast ? num(atLeast[1]) : num(tot[1]), max: num(tot[2]), softMin: approx && !atLeast && !/must/i.test(sentence.slice(0, sentence.search(/approximately/i) >>> 0)), softMax: approx}; })() : null,
    noAdultWord: /must never add "adult"/i.test(text),
    relationshipSpecific: /RELATIONSHIP SPECIFICITY HARD LOCK/.test(text) || /NAME ROLE DISCLAIMER/.test(text),
    cannedBanter: /CANNED TRANSACTIONAL BANTER/.test(text),
    imDone: /I'm done \[verb-ing\]/.test(text),
    secondPerson: /SECOND PERSON/i.test(introRaw) || /second-person/i.test(introRaw),
    introEnding: /INTRODUCTION ENDING HARD LOCK/.test(introRaw),
    // the youngest age the template allows: "All characters are 21+ adults" / "18 or older" / "at least 18". Nothing said: 18.
    minAge: ageFloor(text),
    // the app's own house rules for calendar names and street names are checked only when the template asks for them
    noCalendar: /(?:never|do not|don't|must not|avoid|no)\s+[^.\n]{0,60}(?:day of the week|weekday|month name|names? a (?:day|month)|calendar)/i.test(text) || /(?:day of the week|weekdays?|month names?)[^.\n]{0,40}(?:never|not allowed|forbidden|banned)/i.test(text),
    noPlaces: /(?:never|do not|don't|must not|avoid|no)\s+[^.\n]{0,60}(?:street name|street address|address(?:es)?\b|apartment number|flat number)/i.test(text),
    usesName: /\{\{Name[123]\}\}|\[(?:Name[123]?|NAME|(?:Insert )?Character Name)\]/.test(text),
    hasName2: /\{\{Name2\}\}|\[Name2\]/.test(text),
    hasName3: /\[Name3\]/.test(text),
    name3Optional: /OPTIONAL NAME3 BLOCK/.test(text)
  };

  const order = [['header', 0], ['introduction', intro], ['personality', pers], ['scenario', scen], ['greeting', greet],
    ['tags', tagsH <= 0 && !tags.mandatory.length && !tags.approved.length ? -1 : tags.afterImage ? (neg > 0 ? neg + 1 : 1e9) : tagsH], ['image', img > 0 ? img : -1], ['scene', sb]]
    .filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([k]) => k);

  return {
    id: path.basename(file), name: prettyName(file), order, header,
    raw: originalText,                                   // the whole template, for the AI to read as its rulebook (instruction regions included: they are rules for the writer)
    writerRules: [...text.matchAll(/\[START INSTRUCTIONS[^\]]*\]([\s\S]*?)\[END INSTRUCTIONS[^\]]*\]/g)].map(m => m[1].trim()).filter(Boolean),   // never part of the bot
    // limits come only from the template; a section without one is left empty and the app asks the user for it
    introduction: {raw: introRaw, prefix: introPrefix, hint: introHint, limit: intro >= 0 ? findLimit(introRaw) : null, absent: intro < 0},
    personality: {lines: personality, limit: findLimit(slice(pers + 1, persEnd))},
    scenario: {lines: scenario, limit: scen >= 0 ? findLimit(slice(persEnd, greet)) : null, absent: scen < 0},
    greeting, image, tags, scene, rules,
    reading: {added: norm.notes.added, reordered: norm.notes.reordered, noHeadings: norm.notes.noHeadings, renamed: norm.notes.renamed, interactionText: norm.notes.interaction}
  };
}

// Reading and parsing every bot template takes about 45 ms and the Bot Builder, the pickers and the AI writer each ask for the list again, so the parsed list is kept
// until a template file is added, removed, replaced or edited (checked by file name, size and modified time on every call) and each caller gets its own copy.
const TEMPLATE_CACHE = new Map();
function templateSignature(dirs) {
  const parts = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) { parts.push(dir + '|missing'); continue; }
    for (const f of fs.readdirSync(dir).filter(f => /\.txt$/i.test(f)).sort()) { const s = fs.statSync(path.join(dir, f)); parts.push(`${dir}|${f}|${s.size}|${s.mtimeMs}`); }
  }
  return parts.join('\n');
}
function loadTemplates(dirs) {
  let sig = null; try { sig = templateSignature(dirs); } catch (_) { sig = null; }
  const key = dirs.join('\n');
  if (sig !== null) { const hit = TEMPLATE_CACHE.get(key); if (hit && hit.sig === sig) return structuredClone(hit.out); }
  const out = loadTemplatesFresh(dirs);
  if (sig !== null) TEMPLATE_CACHE.set(key, {sig, out: structuredClone(out)});
  return out;
}
function loadTemplatesFresh(dirs) {
  const out = [], seen = new Set();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => /\.txt$/i.test(f)).sort()) {
      if (seen.has(f)) continue; seen.add(f);
      try { out.push(parseTemplate(fs.readFileSync(path.join(dir, f), 'utf8'), f)); }
      catch (e) { out.push({id: f, name: prettyName(f), error: e.message}); }
    }
  }
  // templates without their own approved-tag list borrow one from a sibling
  const donor = out.find(t => t.tags && t.tags.approved.length);
  for (const t of out) if (t.tags && !t.tags.approved.length && donor) { t.tags.approved = donor.tags.approved; t.tags.borrowedApproved = true; t.tags.freeform = false; if (!t.tags.total) t.tags.total = 8; }
  for (const t of out) if (t.tags && !t.tags.archetypes.length && donor) t.tags.archetypes = donor.tags.archetypes;
  return out.sort(byTemplateName);
}

module.exports = {parseTemplate, loadTemplates, prettyName};
