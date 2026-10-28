/* The selected template is the writing contract. No default story, dialogue
   quota, voice, or Introduction sentence count is invented here. Shared by the
   renderer and Node; loading the module has no browser or network side effects. */
(function () {
  'use strict';
  const LABELS = {introduction:'Introduction',personality:'Personality',scenario:'Scenario',greeting:'Greeting',image:'Image Generation',tags:'Tags',scene:'Scene Breakdown'};
  const clean = t => String(t == null ? '' : t);
  function sectionRaw(spec, key) {
    if (typeof spec?.[key]?.raw === 'string') return spec[key].raw;
    const raw = clean(spec?.raw).replace(/\r\n?/g,'\n'), title = LABELS[key];
    if (!title) return '';
    const re = new RegExp('^'+title+'\\s*:(?:[^\\n]*)$', 'gim'), match = re.exec(raw);
    if (!match) return '';
    const tail = raw.slice(match.index+match[0].length);
    const end = tail.search(/^\s*(?:Introduction|Personality|Scenario|Greeting|Image Generation|Tags|Scene Breakdown)\s*:/im);
    return (end < 0 ? tail : tail.slice(0,end)).trim();
  }
  function templateText(spec) {
    const raw = clean(spec?.raw);
    if (!raw.trim()) throw new Error('The selected template has no source instructions. Reload the template before using AI. Nothing was sent.');
    return raw;
  }
  // the Personality is where age, archetype and race are stated; the story sections show the character instead
  const CAL = typeof module !== 'undefined' && typeof require === 'function' ? require('./calendar.js') : (typeof window !== 'undefined' ? window.CalendarNames : null);
  const PLC = typeof module !== 'undefined' && typeof require === 'function' ? require('./places.js') : (typeof window !== 'undefined' ? window.PlaceNames : null);
  const CAL_RULE = (CAL ? CAL.RULE : '') + (PLC ? ' ' + PLC.RULE : '');
  const NO_META = CAL_RULE + " " + "INTRODUCTION AND GREETING, NO CHARACTER SHEET FACTS: never state the character's age, her archetype (the word archetype or the archetype's name used as a label, such as \"she is a Tsundere\") or her race or species as a plain fact in the Introduction or the Greeting. Those facts belong in the Personality only. Show who she is through what she does, says and wants, and name a race only when the scene itself needs it (for example an elf's ears twitching).";
  // Narration is storytelling in whole, proper sentences. A tight character limit is met by leaving things out, never by clipping grammar into notes.
  const STORY_RULE = "STORY VOICE (always, for every narrated section; dialogue keeps its own casual style): you are a storyteller, not a reporter. Write simple, everyday English in complete, well-formed sentences, each with its own subject and verb, that flow from one to the next like a novel read aloud. Never write telegraphic notes: no stacked fragments, no dropped words or articles, no clipped summaries, and no sentences packed with facts and figures (an amount, a date or a number is named once, only where the scene needs it, and said the way a person would say it). Show a fact as a moment (what someone does, sees or says); do not recite it. The scenario card's wording is background, not prose to copy or shorten. When the character limit is tight, never drop a story beat the creator chose and never clip grammar. Keep every beat, in its order, and shorten inside it: use fewer descriptive words, name each figure once, and fold two closely related facts into one clean sentence, so the story still flows from beat to beat. Before you answer, read each sentence once for grammar, typos and repeated words, and fix them.";
  function system(spec) {
    return NO_META + " " + STORY_RULE + " " + "You are filling the creator's selected character-bot template for the supplied scenario. " +
      "The complete template below is the writing authority, including its actual dialogue instructions, voice, formatting, structure, protected text and limits. " +
      "Do not substitute generic writing rules, a default number of spoken turns or a default Introduction sentence count. " +
      "The request specifies which section or template slots to return and the machine-readable response layout. Those are delivery instructions, not replacement story rules. Each numbered Greeting block is the passage before an image marker, not a requirement for one narrative paragraph. Preserve any multiple narrative paragraphs that the template places before that marker. " +
      "The creator's explicit Greeting selections/order/notes and Bot Builder controls also apply. " +
      (userYouOnly(spec)?"The selected Greeting says {{user}} is addressed only as you/your. So {{user}} is never he, him, his or himself, even when the card's {{user}} is male; he/him/his belong only to named characters. When a sentence has both {{user}} and a male character, write his name instead of the pronoun. Every narration line is a complete sentence with a capital letter and end punctuation; never open a narration line with words that lead into a quote, and put the delivery cue after the quote. ":"") +
      "Fill quoted template slots with only their contents; the application supplies the template's surrounding speaker label and quotation marks. " +
      "The creator requested plain Personality speech-example speaker labels and no doubled outer quotation marks; this display cleanup does not change the example's content or any other template instruction.\n\n" +
      "==== COMPLETE SELECTED TEMPLATE (UNABRIDGED) ====\n"+templateText(spec)+"\n==== END SELECTED TEMPLATE ====";
  }
  function resolved(spec, v = {}) {
    const out = [];
    for (const key of ['introduction','personality','scenario','greeting']) {
      const L = spec[key]?.limit;
      if (!spec[key]?.absent && L) out.push(`${LABELS[key]}: ${L.min}-${L.max} characters${key==='greeting'?', excluding image markers':''}${L.fromUser?' (set by the creator in Bot Builder)':''}.`);
    }
    const total=spec.rules?.total;
    if (total) out.push(`Combined Personality + Scenario + Greeting: ${total.min}-${total.max} characters${total.softMin||total.softMax?' (approximate, as in the template)':''}.`);
    if (v.botVariant==='futa') out.push('Creator-selected Futa version: Introduction starts with [Male/Female POV | Futa Bot]. Scene name ends with [Futa]; the preceding space and suffix count in the 30-character limit.');
    else if (v.botVariant==='female') out.push('Creator-selected Female counterpart: Introduction starts with [Female Bot]. Scene name ends with [Female]. Use this counterpart, not the Futa anatomy.');
    else if (spec.introduction?.prefix) out.push(`Introduction prefix from the template: ${spec.introduction.prefix}`);
    const ok=m=>['past','present'].includes(m)?m:'', nt=v.narrativeTense||{};
    const tIntro=ok(nt.intro)||ok(v.tenseIntro?.mode)||ok(nt.mode), tGreet=ok(nt.greeting)||ok(v.tenseGreet?.mode)||ok(nt.mode);
    if (tIntro && tIntro===tGreet) out.push(`Creator-selected narration tense: ${tIntro}, for Introduction and Greeting. Quoted dialogue retains its own tense.`);
    else {
      if (tIntro) out.push(`Creator-selected narration tense for the Introduction: ${tIntro}. Quoted dialogue retains its own tense.`);
      if (tGreet) out.push(`Creator-selected narration tense for the Greeting: ${tGreet}. Quoted dialogue retains its own tense.`);
    }
    return out.join('\n');
  }
  // The template-wide rules written above the first section (source precedence, global locks that name the Greeting, Introduction, tags and so on). They apply to every section, so every section request carries them.
  function preamble(spec) {
    const raw = clean(spec?.raw).replace(/\r\n?/g,'\n'), m = /^\s*(?:Introduction|Personality|Scenario|Greeting|Image Generation|Tags|Scene Breakdown)\s*:/im.exec(raw);
    return (m ? raw.slice(0, m.index) : '').trim();
  }
  // ONE section's contract: used by every "Rewrite <section> with AI" button. It carries that section's own template text and nothing else from the template.
  function systemFor(spec, section, tplText) {
    const g = section === 'greeting', intro = section === 'introduction', title = LABELS[section] || (section === 'header' ? 'Basics' : section);
    const raw = clean(tplText != null ? tplText : sectionRaw(spec, section)).trim();
    return (g || intro ? NO_META : CAL_RULE) + " " + (section === 'tags' || section === 'header' ? '' : STORY_RULE + " ") +
      "You are rewriting ONE section (" + title + ") of the creator's selected character-bot template for the supplied scenario. The template's own rules for every section are given first, then this section's template text. Write only this section and nothing that belongs to another one. " +
      "That template text is the writing authority for this section, including its actual instructions, voice, formatting, structure, protected text and limits. " +
      "Do not substitute generic writing rules or invent a default structure. " +
      "The request specifies which template slots to return and the machine-readable response layout. Those are delivery instructions, not replacement story rules. " +
      (g&&userYouOnly(spec)?"The selected Greeting says {{user}} is addressed only as you/your. So {{user}} is never he, him, his or himself, even when the card's {{user}} is male; he/him/his belong only to named characters. When a sentence has both {{user}} and a male character, write his name instead of the pronoun. ":"") + (g ? "Each numbered Greeting block is the passage before an image marker, not a requirement for one narrative paragraph. Preserve any multiple narrative paragraphs that the template places before that marker. The creator's explicit Greeting selections/order/notes also apply. " : "") +
      "Fill quoted template slots with only their contents; the application supplies the template's surrounding speaker label and quotation marks." +
      (section === 'personality' ? " The creator requested plain Personality speech-example speaker labels and no doubled outer quotation marks; this display cleanup does not change the example's content or any other template instruction." : "") +
      (preamble(spec) ? "\n\n==== TEMPLATE-WIDE RULES (they apply to every section; follow every one that concerns the " + title + ") ====\n" + preamble(spec) + "\n==== END OF THE TEMPLATE-WIDE RULES ====" : "") +
      "\n\n==== THE " + title.toUpperCase() + " SECTION OF THE SELECTED TEMPLATE ====\n" + (raw || "(this section has no template text beyond the layout given in the request)") + "\n==== END OF THE " + title.toUpperCase() + " SECTION ====";
  }
  // The measured limits and creator choices that belong to ONE section (not the other sections' limits).
  function resolvedFor(spec, v = {}, section) {
    const out = [], L = spec[section]?.limit;
    if (['introduction','personality','scenario','greeting'].includes(section) && !spec[section]?.absent && L) out.push(`${LABELS[section]}: ${L.min}-${L.max} characters${section==='greeting'?', excluding image markers':''}${L.fromUser?' (set by the creator in Bot Builder)':''}.`);
    const total = spec.rules?.total;
    if (total && ['personality','scenario','greeting'].includes(section)) out.push(`Combined Personality + Scenario + Greeting: ${total.min}-${total.max} characters${total.softMin||total.softMax?' (approximate, as in the template)':''}.`);
    if (section === 'introduction' || section === 'header') {
      if (v.botVariant==='futa') out.push('Creator-selected Futa version: Introduction starts with [Male/Female POV | Futa Bot]. Scene name ends with [Futa]; the preceding space and suffix count in the 30-character limit.');
      else if (v.botVariant==='female') out.push('Creator-selected Female counterpart: Introduction starts with [Female Bot]. Scene name ends with [Female]. Use this counterpart, not the Futa anatomy.');
      else if (section === 'introduction' && spec.introduction?.prefix) out.push(`Introduction prefix from the template: ${spec.introduction.prefix}`);
    }
    const ok = m => ['past','present'].includes(m) ? m : '', nt = v.narrativeTense || {};
    const tIntro = ok(nt.intro)||ok(v.tenseIntro?.mode)||ok(nt.mode), tGreet = ok(nt.greeting)||ok(v.tenseGreet?.mode)||ok(nt.mode);
    if (section === 'introduction' && tIntro) out.push(`Creator-selected narration tense for the Introduction: ${tIntro}. Quoted dialogue retains its own tense.`);
    if (section === 'greeting' && tGreet) out.push(`Creator-selected narration tense for the Greeting: ${tGreet}. Quoted dialogue retains its own tense.`);
    return out.join('\n');
  }
  function templatePassages(spec) {
    const raw=sectionRaw(spec,'greeting');
    const parts=raw.split(/^\s*!\[[^\]]*\]\(image\d+\)\s*$/gm);
    return parts.length>1 ? parts.slice(0,-1) : [];
  }
  function dialogueRequirements(spec) {
    const raw=sectionRaw(spec,'greeting'), passages=templatePassages(spec);
    const slots=passages.map((part,index) => {
      // A quoted template example/placeholder on its own line is a required
      // spoken slot. Quotes inside prose explanations/locks do not count.
      const lines=part.split('\n').map(s=>s.trim()).filter(l=>/^"[^"\n]+"\s*$/.test(l)||/^\u201c[^\u201d\n]+\u201d\s*$/.test(l));
      return {passage:index+1, minimum:lines.length, source:lines.join('\n')};
    }).filter(x=>x.minimum);
    // Numeric requirements are honored only when explicitly written in the
    // template; no length-based or generic dialogue fallback is supplied.
    const num='(one|two|three|four|five|six|seven|eight|nine|ten|\\d+)';
    const m=raw.match(new RegExp('(?:each|every)\\s+(?:greeting\\s+)?(?:paragraph|passage|block)\\s+(?:(?:must|should)\\s+)?(?:include|contain|have)s?\\s+(?:at\\s+least\\s+)?'+num+'\\s+(?:spoken\\s+)?(?:lines?\\s+of\\s+dialogue|dialogue\\s+lines?|spoken\\s+(?:lines?|turns?))','i'));
    if(m){const names=['zero','one','two','three','four','five','six','seven','eight','nine','ten'];const n=Number(m[1])||names.indexOf(m[1].toLowerCase());for(let i=0;i<(spec.greeting?.count||0);i++){const item=slots.find(x=>x.passage===i+1);if(item){item.minimum=Math.max(item.minimum,n);item.source+='\n'+m[0];}else slots.push({passage:i+1,minimum:n,source:m[0]});}}
    return slots;
  }
  function quotes(text) {
    return [...clean(text).matchAll(/"([^"\n]+)"|\u201c([^\u201d\n]+)\u201d/g)].map(m=>m[1]??m[2]);
  }
  // dialogue in single quotes: an opening ' at the start of a line or after a space, a closing ' before a space, punctuation or the line end
  // (it's / the boys' room are apostrophes, not quotes). Used only when the text has no double-quoted dialogue at all.
  function singleQuotes(text) {
    return [...clean(text).matchAll(/(?:^|[\s(\[\u2014\u2013-])['\u2018]((?:[^'\u2018\u2019\n]|['\u2019](?=[A-Za-z]))+?)['\u2019](?=[\s.,!?;:)\]\u2014\u2013-]|$)/gm)].map(m=>m[1]);
  }
  function parts(v) {
    if (typeof v?.over?.greeting==='string') {
      let text=v.over.greeting.replace(/^```[\s\S]*?```\s*\*\*\*\s*/,'');
      const p=text.split(/!\[[^\]]*\]\([^\n]*\)/g).map(x=>x.replace(/^\s*---\s*$/gm,'').trim());
      while(p.length&&!p[p.length-1])p.pop();
      return p;
    }
    return (v?.greet||[]).map(clean);
  }
  function userCallRequired(spec) {
    return /Exactly\s+(?:ONE|1)\s+line\s+of\s+dialogue[\s\S]{0,220}\{\{user\}\}/i.test(sectionRaw(spec,'greeting'));
  }
  // The template says {{user}} is "you/your" in Greeting prose and everyone else is named. The AI slips when a male NPC shares the scene: "he/his/him" lands on the user.
  // Any narration sentence that has both a you-word and a he-word is ambiguous, so it is sent back with the instruction to name the NPC (or drop the pronoun).
  function userYouOnly(spec) {
    return /\{\{user\}\}\s+only\s+as\s+you\s*\/\s*your/i.test(sectionRaw(spec,'greeting'));
  }
  function userPronounHits(text) {
    const narr=clean(text).replace(/"[^"\n]*"|\u201c[^\u201d\n]*\u201d/g,' ').replace(/\*/g,'');
    return narr.split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(x=>/\b(?:you|your|yours|yourself)\b/i.test(x)&&/\b(?:he|him|his|himself)\b/i.test(x));
  }
  // Measured notes about the Greeting that never cost an AI call: they are shown as checks and warnings, and the AI is not sent back to rewrite for them.
  function greetingFlags(spec,v) {
    const p=parts(v),pron=[],frag=[];
    if(userYouOnly(spec)) {
      // a sentence that names another character (the third party, an antagonist) may use he/his for him; only sentences where he/his could only be {{user}} are flagged
      const others=Object.entries(v?.names||{}).filter(([k])=>String(k)!=='1').map(([,n])=>String(n||'').trim()).filter(Boolean).flatMap(n=>[n,...n.split(/\s+/).filter(x=>x.length>2)]);
      const named=x=>others.some(n=>new RegExp('\\b'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(x));
      p.forEach((t,i)=>userPronounHits(t).filter(x=>!named(x)).forEach(x=>pron.push({i,x})));
    }
    // narration is whole sentences: a line that stops without end punctuation or starts in lower case is a sentence broken around the dialogue ("*Now she says*" / "long day" / "*and you say*")
    p.forEach((t,i)=>t.split('\n').map(x=>x.trim()).forEach(l=>{
      const m=/^\*([^*\n]+)\*$/.exec(l); if(!m)return;
      const inner=m[1].trim();
      if(!inner.replace(/[\s\u3164\u00a0\u200b\u2800]/g,''))return;   // v1.2.6: the *ㅤ* spacer line (your Greeting format) is layout, not a cut-off narration line
      if(!/[.!?\u2026]["'\u201d\u2019)]?$/.test(inner)||/^[a-z]/.test(inner))frag.push({i,l});
    }));
    return {pron,frag};
  }
  // Measured notes about the Greeting: shown as checks and warnings.
  function greetingNotes(spec,v) {
    const {pron,frag}=greetingFlags(spec,v),out=[];
    if(pron.length)out.push(`{{user}} is addressed only as you/your in this template, but ${pron.length} narration sentence${pron.length===1?'':'s'} use${pron.length===1?'s':''} he/him/his next to "you" with no other character named: `+pron.slice(0,3).map(b=>`passage ${b.i+1}: "${b.x.slice(0,140)}"`).join(' | '));
    if(frag.length)out.push(`Greeting narration should be complete sentences. ${frag.length} narration line${frag.length===1?'':'s'} ${frag.length===1?'is':'are'} cut off or start in lower case: ${frag.slice(0,4).map(f=>`passage ${f.i+1}: ${f.l.slice(0,90)}`).join(' | ')}`);
    return out;
  }
  // The share of the Greeting that is spoken dialogue, in whole percent (letters and punctuation inside the quotes against all Greeting text; image markers, dividers and blank filler lines are not counted). null when there is no text.
  function dialogueShare(v) {
    const p=parts(v);
    const body=p.join('\n').split('\n').filter(l=>!/^\s*(?:---|!\[[^\]]*\]\([^)]*\))\s*$/.test(l)&&!/^\s*\*[\s\u3164\u00a0]*\*\s*$/.test(l)).join('\n');
    // v1.2.6: the * and quote marks are formatting, so they count on neither side (they used to count in the total only, which read 1-3 points low,
    // and a short 50/50 Greeting as 33%). A Greeting written with single quotes ('Hey,' she said.) counts its dialogue too.
    const count=x=>x.replace(/[\s\u3164\u00a0*_"\u201c\u201d]/g,'').replace(/(^|[\s(\[\u2014\u2013-])['\u2018]|['\u2019](?=[\s.,!?;:)\]\u2014\u2013-]|$)/gm,'$1').length, total=count(body);
    if(!total)return null;
    const said=quotes(body);
    const talk=(said.length?said:singleQuotes(body)).reduce((n,x)=>n+count(x),0);
    return Math.round(100*talk/total);
  }
  function greetingFormat(spec) {
    const raw=sectionRaw(spec,'greeting');
    return {narration:/all\s+non.dialogue[\s\S]{0,160}inside\s+single\s+asterisks/i.test(raw),
      speech:/every\s+spoken\s+dialogue\s+line[\s\S]{0,140}(?:double\s+quotation\s+marks|double\s+quotes)/i.test(raw),
      noMix:/never\s+combine\s+narration\/action\s+and\s+spoken\s+dialogue\s+on\s+the\s+same\s+line/i.test(raw),
      delivery:/(?:every|each)\s+(?:spoken\s+)?(?:dialogue\s+)?line[\s\S]{0,80}\bmust\s+have[\s\S]{0,80}delivery cue/i.test(raw)};
  }
  function greetingIssues(spec,v) {
    const p=parts(v),out=[];
    for(const r of dialogueRequirements(spec)) {
      const actual=quotes(p[r.passage-1]).length;
      if(actual<r.minimum)out.push(`Template Greeting passage ${r.passage} contains ${r.minimum} quoted dialogue slot${r.minimum===1?'':'s'}, but the output has ${actual}. Follow its actual instruction: ${r.source}`);
    }
    if(userCallRequired(spec)) {
      const count=p.flatMap(quotes).filter(s=>s.includes('{{user}}')).length;
      if(count!==1)out.push(`The template's {{user}} IN DIALOGUE LOCK requires exactly one spoken line addressing {{user}}; found ${count}.`);
    }
    // the creator's dialogue share is a request to the AI, never a pass/fail check: forcing it hurts the story or makes the AI pad the Greeting to chase the number
    const fmt=greetingFormat(spec);
    for(let i=0;i<p.length;i++) {
      const lines=p[i].split('\n').map(s=>s.trim()).filter(s=>s&&!/^---$|^!\[/.test(s));
      if(fmt.speech&&lines.some(s=>quotes(s).length&&!/^"[^"\n]+"$/.test(s)))out.push(`Template GREETING FORMATTING HARD LOCK: passage ${i+1} has speech outside its own straight-double-quoted line.`);
      if(fmt.delivery && lines.some((s,k)=>/^\"[^\"\n]+\"$/.test(s) && !/^\*[^\n]*\*$/.test(lines[k+1]||'')))out.push(`The selected Greeting template requires a delivery cue immediately after every spoken line; passage ${i+1} has a quote without that following narration.`);
      if(fmt.narration&&lines.some(s=>!quotes(s).length&&!/^\*[^\n]*\*$/.test(s)))out.push(`Template GREETING FORMATTING HARD LOCK: passage ${i+1} has narration outside single asterisks.`);
    }
    return out;
  }
  function introductionIssues(spec, value) {
    const raw=sectionRaw(spec,'introduction'),s=clean(value).replace(/^\s*(?:\[[^\]]*\]\s*)+/,'').trim(),out=[];
    if(!s)return out;
    const m=raw.match(/(?:exactly|between|use|write|in)\s+(\d+)\s*(?:-|to|and)\s*(\d+)\s+(?:complete[, ]*|connected[, ]*|flowing[, ]*)*sentences/i);
    if(m){const n=s.split(/(?<=[.!?])\s+/).filter(Boolean).length;if(n<+m[1]||n>+m[2])out.push(`The selected Introduction instructions require ${m[1]}-${m[2]} sentences; found ${n}.`);}
    return out;
  }
  const api={CAL_RULE,NO_META,STORY_RULE,sectionRaw,preamble,templateText,system,systemFor,resolved,resolvedFor,templatePassages,dialogueRequirements,userCallRequired,userYouOnly,userPronounHits,greetingFormat,greetingIssues,greetingNotes,greetingFlags,dialogueShare,introductionIssues,quotes,parts};
  if(typeof window!=='undefined')window.TemplateContract=api;
  if(typeof module!=='undefined')module.exports=api;
})();
