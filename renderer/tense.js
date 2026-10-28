/* Local English narration-tense conversion. No requests, models, or dependencies.
 * Edits only finite verbs in recognized grammatical contexts. Everything else
 * is copied by source offsets, including whitespace, punctuation and markup.
 * Ambiguous English still needs human review. Keep exact snapshots for Undo and
 * unedited past/present round trips rather than guessing the original wording.
 */
(function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const modes = new Set(['past', 'present']);
  const irregular = {
    arise:['arose','arisen'], awake:['awoke','awoken'], be:['was','been'], bear:['bore','borne'], beat:['beat','beaten'],
    become:['became','become'], begin:['began','begun'], bend:['bent'], bet:['bet'], bind:['bound'], bite:['bit','bitten'],
    bleed:['bled'], blow:['blew','blown'], break:['broke','broken'], breed:['bred'], bring:['brought'], build:['built'],
    burn:['burned','burnt'], burst:['burst'], buy:['bought'], catch:['caught'], choose:['chose','chosen'], cling:['clung'],
    come:['came','come'], cost:['cost'], creep:['crept'], cut:['cut'], deal:['dealt'], dig:['dug'], do:['did','done'],
    draw:['drew','drawn'], dream:['dreamed','dreamt'], drink:['drank','drunk'], drive:['drove','driven'], eat:['ate','eaten'],
    fall:['fell','fallen'], feed:['fed'], feel:['felt'], fight:['fought'], find:['found'], fit:['fit'], flee:['fled'],
    fling:['flung'], fly:['flew','flown'], forbid:['forbade','forbidden'], forget:['forgot','forgotten'], forgive:['forgave','forgiven'],
    freeze:['froze','frozen'], get:['got','gotten'], give:['gave','given'], go:['went','gone'], grind:['ground'], grow:['grew','grown'],
    hang:['hung'], have:['had'], hear:['heard'], hide:['hid','hidden'], hit:['hit'], hold:['held'], hurt:['hurt'],
    keep:['kept'], kneel:['knelt'], know:['knew','known'], lay:['laid'], lead:['led'], lean:['leaned','leant'], leap:['leaped','leapt'],
    learn:['learned','learnt'], leave:['left'], lend:['lent'], let:['let'], lie:['lay','lain'], light:['lit'], lose:['lost'],
    make:['made'], mean:['meant'], meet:['met'], mistake:['mistook','mistaken'], overcome:['overcame','overcome'],
    pay:['paid'], put:['put'], quit:['quit'], read:['read'], rebuild:['rebuilt'], ride:['rode','ridden'], ring:['rang','rung'],
    rise:['rose','risen'], run:['ran','run'], say:['said'], see:['saw','seen'], seek:['sought'], sell:['sold'], send:['sent'],
    set:['set'], shake:['shook','shaken'], shed:['shed'], shine:['shone'], shoot:['shot'], show:['showed','shown'],
    shrink:['shrank','shrunk'], shut:['shut'], sing:['sang','sung'], sink:['sank','sunk'], sit:['sat'], sleep:['slept'],
    slide:['slid'], smell:['smelled','smelt'], speak:['spoke','spoken'], speed:['sped'], spell:['spelled','spelt'], spend:['spent'],
    spill:['spilled','spilt'], spin:['spun'], spit:['spat'], split:['split'], spoil:['spoiled','spoilt'], spread:['spread'],
    spring:['sprang','sprung'], stand:['stood'], steal:['stole','stolen'], stick:['stuck'], sting:['stung'], stink:['stank','stunk'],
    stride:['strode','stridden'], strike:['struck'], swear:['swore','sworn'], sweep:['swept'], swell:['swelled','swollen'],
    swim:['swam','swum'], swing:['swung'], take:['took','taken'], teach:['taught'], tear:['tore','torn'], tell:['told'],
    think:['thought'], throw:['threw','thrown'], tread:['trod','trodden'], understand:['understood'], upset:['upset'],
    wake:['woke','woken'], wear:['wore','worn'], weave:['wove','woven'], weep:['wept'], win:['won'], wind:['wound'],
    withdraw:['withdrew','withdrawn'], withstand:['withstood'], wring:['wrung'], write:['wrote','written']
  };
  const regular = (`accept ache acknowledge act add address adjust admire admit adopt advance afford agree aim allow amuse announce answer anticipate appear approach argue arrange arrive ask assure attach attempt attract avoid await award back balance bat battle beam beckon beg behave belong blame blink block blush boast book borrow bother bounce bow breathe brush bump bury call calm care carry carve cast cause challenge change chase chat check cheer choke claim clap clean clear click climb close clutch coil collect color compare complain complete concern confess consider contain continue control cook copy correct cough count cover crack crash cross crouch cry curl curse curve dance dare decide declare defend deliver demand deny depend describe deserve desire destroy develop die disappear discover dismiss display disturb double doubt drag drape dress drift drop dry duck ease echo edge emerge embrace empty encourage end endure enjoy enter escape examine exchange excuse exist expand expect explain expose extend face fade fail fancy fasten favor fear fetch fill finish fix flash flick flicker float flood fold follow force form frame frown gather gaze gesture glance gleam glide glow grab greet grin grip groan guard guess guide handle happen hate haunt head help hesitate hint hiss hope hover hug hurry ignore imagine impress include increase insist intend interest interrupt introduce invite involve jerk join joke judge kick kiss knock lack land last laugh launch lean leaner learn lift like linger listen live lock look lower manage march mark marry match matter measure mention miss mix moan move murmur mutter name narrow need nod notice nudge obey observe offer open order owe pack paint panic park pass pause peer perform permit pick pin place plan play plead please point poke polish pose pour practice pray prefer prepare press pretend prevent promise protect prove provide publish pull push question raise reach react realize receive recognize record recover reduce refuse regret reject relax release remain remind remove repeat replace reply report require rescue resist rest return reveal review rip risk roar rob rock roll rub ruin rush save scare scatter scold scrape scratch scream search seat seem sense settle share shift shiver shrug sigh signal sign slam slap slip slow smile smirk smooth snap snarl sniff soften solve sound sparkle spray squeeze stack stagger stare start stay steady step stir stop straighten strain stretch stroke struggle study stumble succeed suck suffer suggest support suppose surprise surround suspect swallow sway tackle talk tap taste tease test thank threaten tighten tilt touch trace trail train travel tremble trick trust try tuck turn twist urge use vanish visit wait walk wander want warn wash watch wave welcome whisper widen wince wish wonder work worry wrap yell yield zip abandon absorb accompany accuse adapt affect anchor apologize appreciate approve arch attempt attend attract calculate celebrate chase comfort compare concentrate conclude conduct connect consent consult contrast convince cooperate dare decorate delay deserve detect direct disappoint divide dominate drag drain elect embarrass emphasize encounter encourage entertain establish evaluate examine exhaust express fascinate feature flirt flow focus frighten frustrate grasp hesitate hesitate hook host identify illustrate imply indicate influence inform injure inspect interfere interpret lean mention negotiate note obtain occupy overlook own part participate perform persuade possess predict present proceed process produce protest recognize recommend recover reflect register reinforce reject relate rely remark rent represent request respond restore retire reveal reverse rotate scratch select separate serve settle shelter shift shoulder slide slip snatch soothe spot stare state store stroke submit summarize supply surrender survive suspect switch tolerate toss transform treat trouble uncover unite unlock upset value volunteer vote wipe witness worship yawn welcome paddle ram pat jam slam sob scan skip stir stop strip trap trip trot hug drag flap flip flop sag wag whimper purr pant gasp chuckle grin smirk sulk croak croon nod hum trail dip drip dart flinch falter flutter clutch perch pluck prowl pry rake recline recoil scowl shove shrug slink sniffle sprawl squint stalk sway twirl untie unveil whirl wriggle yank lean blink loom clutch tip sag tint trickle struggle adjust`)
    .split(/\s+/).filter(Boolean);
  const doubled = new Set('admit beg chat clap control drag drop equip fit grab grin grip hug hum jam jog nod occur omit pat permit pin plan prefer ram refer regret rob rub scan shop shrug sin sip sit skip slam slip snap sob spin spot step stir stop strap strip tap trap travel trip trot wag wrap bat flap flip flop sag dip drip tip'.split(' '));
  const lex = new Map(), parts = new Set(['been','being']);
  function third(base) {
    if (base === 'be') return 'is'; if (base === 'have') return 'has'; if (base === 'do') return 'does';
    return /[^aeiou]y$/.test(base) ? base.slice(0,-1)+'ies' : /(?:s|sh|ch|x|z|o)$/.test(base) ? base+'es' : base+'s';
  }
  function past(base) {
    if (irregular[base]) return irregular[base][0];
    return /e$/.test(base) ? base+'d' : /[^aeiou]y$/.test(base) ? base.slice(0,-1)+'ied' : doubled.has(base) ? base+base.slice(-1)+'ed' : base+'ed';
  }
  function add(word, base, form) { const a = lex.get(word) || []; if (!a.some(x => x.base === base && x.form === form)) a.push({base, form}); lex.set(word, a); }
  for (const base of new Set([...Object.keys(irregular), ...regular])) {
    add(base,base,'present'); add(third(base),base,'third'); add(past(base),base,'past');
    parts.add(irregular[base] ? irregular[base][1] || irregular[base][0] : past(base));
    for (const word of (irregular[base] || []).slice(1)) if (!/en$/.test(word) && /t$/.test(word)) add(word,base,'past');
  }
  const norm = s => s.toLowerCase().replace(/\u2019/g, "'");
  const det = new Set('a an the her his my your our their its this that these those some any each every no another other such either neither whose'.split(' '));
  const prep = new Set('of in on at by for from with without beside beneath behind between into onto through toward towards against across over under near around along about beyond outside inside within before after off out upon underneath'.split(' '));
  const adverb = new Set('not never always often sometimes still already just only even also almost nearly quite rather too very here there now then again once perhaps instead back away together ever soon enough far hard fast well much more most less little suddenly'.split(' '));
  const pronoun = new Set(['i','you','he','she','it','we','they','{{user}}','{{char}}']);
  const auxiliary = new Set('am is are was were has have had do does did'.split(' '));
  const modal = new Set("can could may might must shall should will would can't cannot couldn't mayn't mightn't mustn't shan't shouldn't won't wouldn't".split(' '));
  const subordinate = new Set('while when because although though unless until since whether where whenever wherever once'.split(' '));
  const coordinator = new Set(['and','or','but','nor','then']);
  const knownPlural = new Set('people children women men feet teeth mice geese police both few several many others'.split(' '));
  const singularS = new Set('glass brass dress stress loss moss grass class princess duchess mistress witness business news darkness silence loneliness kindness happiness nervousness tenderness sadness wilderness'.split(' '));
  const isAdv = w => adverb.has(w) || /ly$/.test(w);

  // Protect quoted speech, code, image/link constructs, URLs and bracket labels.
  // Single quotes inside a word are apostrophes, never dialogue delimiters.
  function protectedSpans(text) {
    const spans = [];
    for (let i=0; i<text.length;) {
      let end=0, kind='markup'; const c=text[i], tail=text.slice(i);
      if (tail.startsWith('```') || tail.startsWith('~~~')) { const fence=tail.slice(0,3), j=text.indexOf(fence,i+3); end=j<0?text.length:j+3; }
      else if (c==='`') { const j=text.indexOf('`',i+1); end=j<0?text.length:j+1; }
      else if (tail.startsWith('<!--')) { const j=text.indexOf('-->',i+4); end=j<0?text.length:j+3; }
      else if (c==='<' && /^<\/?[a-z!][^>]*>/i.test(tail)) end=i+tail.match(/^<\/?[a-z!][^>]*>/i)[0].length;
      else if (/^https?:\/\/[^\s<>]+/i.test(tail)) end=i+tail.match(/^https?:\/\/[^\s<>]+/i)[0].length;
      else if (c==='[' || (c==='!' && text[i+1]==='[')) {
        const start=c==='!'?i+1:i; let depth=1,j=start+1;
        for (;j<text.length&&depth;j++) { if(text[j]==='\\'){j++;continue;} if(text[j]==='[')depth++;else if(text[j]===']')depth--; }
        if (!depth) { end=j; if(text[j]==='('){let n=1;j++;for(;j<text.length&&n;j++){if(text[j]==='\\'){j++;continue;}if(text[j]==='(')n++;else if(text[j]===')')n--;}if(!n)end=j;} }
      }
      else if (c==='>' && (i===0 || text[i-1]==='\n')) { const j=text.indexOf('\n',i);end=j<0?text.length:j;kind='quote'; }
      else if (c==='"' || c==='\u201c' || c==='\u2018' || (c==="'" && !/[\p{L}\p{N}]/u.test(text[i-1]||''))) {
        // Do not consume an elided word such as 'tis or 'em as a quote.
        if ((c==="'"||c==='\u2018') && /^(?:['\u2018](?:tis|twas|em|cause|til)\b)/i.test(tail)) {i++;continue;}
        const close=c==='\u201c'?'\u201d':c==='\u2018'?'\u2019':c;
        let j=i+1; for(;j<text.length;j++) { if(text[j]==='\\'){j++;continue;} if(text[j]===close && !(close==="'"&&/[\p{L}\p{N}]/u.test(text[j+1]||''))) break; }
        end=j<text.length?j+1:text.length; kind='quote';
      }
      if(end>i){spans.push({start:i,end,kind});i=end;}else i++;
    }
    return spans;
  }
  function tokenize(text) {
    const spans=protectedSpans(text), tokens=[]; let from=0;
    const words=(a,b)=>{const re=/\{\{[^{}]+\}\}(?:['\u2019]s)?|[\p{L}]+(?:['\u2019][\p{L}]+)*/gu;re.lastIndex=a;let m;while((m=re.exec(text))&&m.index<b)tokens.push({raw:m[0],word:norm(m[0]),start:m.index,end:m.index+m[0].length});};
    for(const span of spans){words(from,span.start);tokens.push({...span,raw:text.slice(span.start,span.end),word:'',protected:true});from=span.end;}words(from,text.length);return tokens;
  }
  function agree(np, fallback) {
    if(!np.length)return fallback||'third';
    const list=np.filter(x=>!isAdv(x));
    const cut=list.findIndex(x=>prep.has(x)), main=cut<0?list:list.slice(0,cut);
    if(main.includes('and')||main.includes('both'))return 'plural';
    const p=main.find(x=>pronoun.has(x));if(p)return p==='i'?'first':['you','we','they'].includes(p)?'plural':'third';
    const head=main.filter(x=>!det.has(x));
    const w=head[head.length-1]||list[list.length-1]||'';
    if(knownPlural.has(w)||(!singularS.has(w)&&/[^s]s$/.test(w)&&!/(?:ous|ness|ics|us|is)$/.test(w)))return 'plural';
    return 'third';
  }
  function matchingCase(old,value) { if(old===old.toUpperCase()&&old.length>1)return value.toUpperCase(); return /^[A-Z]/.test(old)?value.charAt(0).toUpperCase()+value.slice(1):value; }
  function candidate(word, agreement) {
    let list=lex.get(word)||[];
    // Unknown regular past verbs can be handled, but only after subject checks.
    if(!list.length && /^[a-z]{4,}ed$/.test(word)){
      const bases=/ied$/.test(word)?[word.slice(0,-3)+'y']:[word.slice(0,-1),word.slice(0,-2),word.replace(/([b-df-hj-np-tv-z])\1ed$/,'$1')];
      const known=bases.find(x=>lex.has(x)); if(known)list=[{base:known,form:'past'}];
    }
    // "lay" is either the past of lie or the present of lay. Subject agreement
    // resolves "she lay", while plural ambiguity is reported for human review.
    return list.find(x=>x.form==='past' && (agreement==='third'||!list.some(y=>y.form==='present'))) || list.find(x=>x.form==='third') || list[0];
  }
  function inspect(text, target, options={}) {
    text=String(text??''); if(!modes.has(target))throw new Error('Choose past or present tense.');
    const ts=tokenize(text), edits=[], counts={past:0,present:0};
    const names=new Set((options.names||[]).flatMap(x=>String(x||'').split(/\s+/)).filter(Boolean).map(norm));
    let subject=null,np=[],stage='subject',chain='',shared=null,conditional=false,previousEnd=0,hadComma=false,lastBase='';
    const reset=()=>{subject=null;np=[];stage='subject';chain='';shared=null;conditional=false;lastBase='';};
    const nextWord=i=>{for(let n=i+1;n<ts.length;n++){if(ts[n].protected){if(ts[n].kind==='quote')return '';continue;}return ts[n].word;}return '';};
    const significant=i=>{for(let n=i+1;n<ts.length;n++){if(ts[n].protected)return '';if(!isAdv(ts[n].word))return ts[n].word;}return '';};
    function edit(t,value,source){if(source)counts[source]++;if(value!==t.raw)edits.push({start:t.start,end:t.end,before:t.raw,after:value});}
    for(let i=0;i<ts.length;i++){
      const t=ts[i], gap=text.slice(previousEnd,t.start);previousEnd=t.end;
      if(/[.!?\n\r;\u2026]/.test(gap))reset();
      hadComma=/[,\u2014]/.test(gap);
      if(t.protected){if(t.kind==='quote')reset();continue;}
      const w=t.word, prev=i?ts[i-1].word:'', next=nextWord(i);
      if(hadComma){shared=subject||(np.length?agree(np):shared);np=[];stage='subject';if(!['perfect','negative','modal'].includes(chain))chain='';}
      if(w==='if' || w==='wish' || (prev==='as' && (w==='though'||w==='if'))){conditional=true;np=[];stage='subject';subject=null;chain='';continue;}
      if(w==='what'||subordinate.has(w) || (w==='as' && (pronoun.has(next)||det.has(next)||names.has(next)))){np=[];stage='subject';subject=null;chain='';continue;}
      if(w==='who'||w==='which'||(w==='that'&&stage==='complement')){np=[];stage='subject';shared=subject;chain='';continue;}
      if(coordinator.has(w)){
        if(stage==='subject'){if(np.length)np.push(w);continue;}
        shared=subject;np=[];stage='subject';
        // Perfect, negative and modal auxiliaries govern coordinated base verbs.
        if(!['perfect','negative','modal','infinitive'].includes(chain))chain='';
        continue;
      }
      if(w==='to' && lex.has(next)) {chain='infinitive';continue;}
      if(modal.has(w) && (np.length||shared||pronoun.has(next))){subject=agree(np,shared);np=[];stage='complement';chain='modal';continue;}
      // A pronoun+auxiliary contraction is one finite verb, not a possessive.
      const con=w.match(/^(i|you|he|she|it|we|they|there|that|who)(?:'(m|re|s|ve|d))$/);
      if(con){
        subject=agree([con[1]]);np=[];stage='complement';
        const suffix=con[2], perf=(suffix==='s'||suffix==='d')&&(parts.has(significant(i))||significant(i)==='been'), source=suffix==='d'?'past':'present';
        if(suffix==='d'&&!perf){chain='modal';continue;}
        chain=perf||suffix==='ve'?'perfect':'be';
        const base=suffix==='ve'||perf?'have':'be';
        let value=t.raw;
        if(target!==source){const aux=target==='past'?(base==='have'?'had':subject==='plural'?'were':'was'):(base==='have'?subject==='third'?'has':'have':subject==='plural'?'are':subject==='first'?'am':'is');value=t.raw.slice(0,t.raw.search(/['\u2019]/))+' '+aux;}
        edit(t,value,source);continue;
      }
      const neg=w.match(/^(is|are|was|were|has|have|had|does|do|did)n't$/);
      const aux=neg?neg[1]:w;
      if(auxiliary.has(aux)){
        // Auxiliary after a modal / infinitival 'to' stays in the base form.
        if(['modal','infinitive','negative'].includes(chain)&&!np.length&&['have','do'].includes(aux))continue;
        const actualSubject=np.length?agree(np):subject||shared;
        // Inversion: "Were they ...?". Unanchored "do ..." is an imperative.
        const inverted=actualSubject||((pronoun.has(next)||next==='there')?agree([next]):null);
        if(!inverted && (aux==='do'||aux==='have')){np.push(w);continue;}
        subject=/^(are|were)$/.test(aux)?'plural':aux==='am'?'first':inverted||'third';np=[];stage='complement';
        const source=/^(was|were|had|did)$/.test(aux)?'past':'present';
        const type=/^(has|have|had)$/.test(aux)?'have':/^(does|do|did)$/.test(aux)?'do':'be';
        chain=type==='have'&&(parts.has(next)||/ed$/.test(next)||next==='not'||isAdv(next))?'perfect':type==='do'?'negative':type==='be'?'be':'';
        let result=aux;
        if(source!==target && !conditional){if(target==='past')result=type==='have'?'had':type==='do'?'did':subject==='plural'?'were':'was';else result=type==='have'?(subject==='third'?'has':'have'):type==='do'?(subject==='third'?'does':'do'):(subject==='first'?'am':subject==='plural'?'are':'is');}
        if(neg)result+="n't";
        result=matchingCase(t.raw,result); if(t.raw.includes('\u2019'))result=result.replace(/'/g,'\u2019');
        edit(t,result,source);continue;
      }
      if(isAdv(w)){continue;}
      if(pronoun.has(w)){
        // Bare verbs after an object of perception/causation are not tensed.
        if(stage==='complement'&&!hadComma&&!['that','because','while'].includes(prev) && !auxiliary.has(next) && (!lex.has(next)||(['see','hear','watch','notice','feel','let','make','help'].includes(lastBase)&&!lex.get(next)?.some(x=>x.form==='past'||x.form==='third')))){continue;}
        np=[w];if(stage==='complement'){stage='subject';chain='';}continue;
      }
      if(/ing$/.test(w)||w==='been'){
        // A gerund in subject position may be followed by a finite verb.
        if(stage==='subject')np.push(w);else if(!chain)chain='nonfinite';continue;
      }
      const agr=agree(np,shared||subject), c=candidate(w,agr);
      const afterDet=det.has(prev)||prep.has(prev)||/['\u2019]s$/.test(prev);
      const name=names.has(w)&&/^[A-Z]/.test(t.raw);
      const hasSubject=np.length>0||shared;
      let eligible=!!c && !afterDet && !name && stage==='subject' && hasSubject;
      if(eligible&&c.form==='present'&&agr==='third'&&c.base!==past(c.base))eligible=false;
      if(eligible&&chain && !np.length)eligible=false;
      if(eligible&&np.length&&prep.has(np[0])&&!np.some(x=>pronoun.has(x)))eligible=false;
      // "a folded shirt", "her clenched fist": a participle modifying a noun.
      if(eligible&&c.form==='past'&&np.length&&det.has(np[0]) && !np.slice(1).some(x=>!isAdv(x)) && next)eligible=false;
      if(eligible){
        subject=agr;np=[];stage='complement';chain='';lastBase=c.base;
        const source=c.form==='past'?'past':'present';let value=t.raw;
        if(source!==target&&!conditional)value=matchingCase(t.raw,target==='past'?past(c.base):subject==='third'?third(c.base):c.base);
        edit(t,value,source);continue;
      }
      np.push(w);
    }
    let out='',at=0;for(const x of edits){out+=text.slice(at,x.start)+x.after;at=x.end;}out+=text.slice(at);
    const detected=counts.past&&counts.present?'mixed':counts.past?'past':counts.present?'present':'unknown';
    return {text:out,changes:edits,detected,counts};
  }
  // Introduction and Greeting can be converted separately. scope is 'intro',
  // 'greet' or 'both'. Each scope keeps its own state on the bot (tenseIntro,
  // tenseGreet, narrativeTense) so converting one part never touches the other
  // part's text, undo or cache.
  const scopes = new Set(['intro', 'greet', 'both']);
  const stateKey = scope => scope === 'intro' ? 'tenseIntro' : scope === 'greet' ? 'tenseGreet' : 'narrativeTense';
  const overKeys = scope => scope === 'intro' ? ['introduction'] : scope === 'greet' ? ['greeting'] : ['introduction', 'greeting'];
  const hasIntro = scope => scope !== 'greet', hasGreet = scope => scope !== 'intro';
  const fields=(v,scope='both')=>({intro:hasIntro(scope)?String(v.intro||''):'',greet:hasGreet(scope)?(v.greet||[]).map(x=>String(x||'')):[],over:Object.fromEntries(overKeys(scope).filter(k=>typeof v.over?.[k]==='string').map(k=>[k,v.over[k]]))});
  function putFields(v,x,scope='both'){
    if(hasIntro(scope))v.intro=x.intro;
    if(hasGreet(scope))v.greet=clone(x.greet);
    v.over=v.over||{};
    for(const k of overKeys(scope)){if(typeof x.over[k]==='string')v.over[k]=x.over[k];else delete v.over[k];}
  }
  const planKeys=(v,scope)=>[...(hasIntro(scope)?['intro']:[]),...(hasGreet(scope)?(v.greet||[]).map((_,i)=>'g'+i):[]),...overKeys(scope).map(k=>'over.'+k)];
  function plan(v,scope='both'){return {iAuto:hasIntro(scope)?clone(v.iAuto??null):undefined,gAuto:hasGreet(scope)?clone(v.gAuto||[]):undefined,touched:Object.fromEntries(planKeys(v,scope).filter(k=>Object.hasOwn(v.touched||{},k)).map(k=>[k,v.touched[k]]))};}
  function restorePlan(v,p,scope='both'){
    if(hasIntro(scope))v.iAuto=clone(p.iAuto);
    if(hasGreet(scope))v.gAuto=clone(p.gAuto);
    v.touched=v.touched||{};
    for(const k of planKeys(v,scope)){if(Object.hasOwn(p.touched,k))v.touched[k]=p.touched[k];else delete v.touched[k];}
  }
  function markChanges(v,before,after){
    v.touched=v.touched||{};if(before.intro!==after.intro){v.touched.intro=true;v.iAuto=null;}
    after.greet.forEach((p,i)=>{if(p!==before.greet[i]){v.touched['g'+i]=true;if(v.gAuto)v.gAuto[i]=null;}});
    for(const k of ['introduction','greeting'])if(before.over[k]!==after.over[k])v.touched['over.'+k]=true;
  }
  function detectFields(x,options,scope='both'){
    const parts=[];
    if(hasIntro(scope))parts.push(x.over.introduction??x.intro);
    if(hasGreet(scope))parts.push(...(typeof x.over.greeting==='string'?[x.over.greeting]:x.greet));
    return inspect(parts.join('\n'),'past',options).detected;
  }
  function status(v,scope='both'){const current=fields(v,scope),old=v[stateKey(scope)];return {mode:old&&equal(current,old.current)?old.mode:detectFields(current,{names:Object.values(v.names||{})},scope),canUndo:!!(old?.undo&&equal(current,old.current)),canRestore:!!(old?.original&&equal(current,old.current)&&!equal(current,old.original.before))};}
  function apply(v,target,scope='both'){
    if(!modes.has(target))throw new Error('Choose past or present tense.');
    if(!scopes.has(scope))throw new Error('Choose Introduction, Greeting or both.');
    const key=stateKey(scope);
    const before=fields(v,scope),meta=plan(v,scope),options={names:Object.values(v.names||{})},old=v[key];
    const clean=old&&equal(before,old.current),source=clean?old.mode:detectFields(before,options,scope),cache=clean?clone(old.cache||{}):{};
    if(modes.has(source))cache[source]=clone(before);
    let changes=0,after;
    if(cache[target]){after=clone(cache[target]);changes=equal(before,after)?0:1;}
    else{const cv=s=>{const r=inspect(s,target,options);changes+=r.changes.length;return r.text;};after={intro:cv(before.intro),greet:before.greet.map(cv),over:Object.fromEntries(Object.entries(before.over).map(([k,s])=>[k,cv(s)]))};}
    putFields(v,after,scope);markChanges(v,before,after);cache[target]=clone(after);
    const unchanged=equal(before,after);
    // original: the text as it was before the first conversion of this run (a run ends when the text is edited by hand). "Restore original" goes back to it in one step, however many times Past and Present were pressed.
    const original=clean&&old.original?old.original:{before,meta,mode:source};
    v[key]={mode:target,current:clone(after),cache,undo:unchanged&&clean?old.undo:unchanged?null:{before,meta,mode:source},original,lastChanges:changes};
    return {changed:!unchanged,changes,restored:!!(clean&&old.cache?.[target])};
  }
  function undo(v,scope='both'){
    const key=stateKey(scope),old=v[key];if(!old?.undo||!equal(fields(v,scope),old.current))return false;
    const u=old.undo;putFields(v,u.before,scope);restorePlan(v,u.meta,scope);const cache=clone(old.cache||{});
    if(modes.has(u.mode))cache[u.mode]=clone(u.before);
    v[key]={mode:u.mode,current:clone(u.before),cache,undo:null,original:old.original,lastChanges:0};return true;
  }
  function restore(v,scope='both'){
    const key=stateKey(scope),old=v[key];if(!old?.original||!equal(fields(v,scope),old.current)||equal(old.current,old.original.before))return false;
    const o=old.original;putFields(v,o.before,scope);restorePlan(v,o.meta,scope);const cache={};
    if(modes.has(o.mode))cache[o.mode]=clone(o.before);
    v[key]={mode:o.mode,current:clone(o.before),cache,undo:null,original:null,lastChanges:0};return true;
  }
  // The tense the creator chose for each part, for the AI writer and the template
  // contract: {intro, greeting} with 'past', 'present' or ''. A bot saved before
  // the split carries one tense for both parts (narrativeTense).
  function chosen(v){
    const ok=m=>modes.has(m)?m:'',nt=v&&v.narrativeTense||{};
    return {intro:ok(nt.intro)||ok(v&&v.tenseIntro&&v.tenseIntro.mode)||ok(nt.mode),greeting:ok(nt.greeting)||ok(v&&v.tenseGreet&&v.tenseGreet.mode)||ok(nt.mode)};
  }
  const api={convert:inspect,detect:text=>inspect(text,'past').detected,apply,undo,restore,status,chosen,protectedSpans};
  if(typeof window!=='undefined')window.NarrativeTense=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
