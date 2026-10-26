/* Introduction Designer: static, JuicyChat-compatible HTML compiler.
 * All output uses inline styles and permitted tags only; no scripts or external CSS.
 * Dual-mode Node/browser module for deterministic tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IntroCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const MAX = 15000;
  const TYPES = ['heading','text','label','image','divider','quote','columns','spacer','link','list','custom'];
  const SLOTS = ['scene','name','intro','extra'];
  const TAGS = new Set(['div','span','p','h3','h4','h5','h6','b','strong','i','em','u','s','small','br','hr','img','ul','ol','li','a','blockquote']);
  const STYLES = new Set(['color','background','background-color','background-image','background-size','background-position','border','border-width','border-style','border-color','border-radius','border-top','border-bottom','border-left','border-right','box-shadow','text-shadow','font-family','font-size','font-style','font-weight','line-height','letter-spacing','text-transform','text-decoration','text-align','width','max-width','min-width','height','min-height','max-height','aspect-ratio','object-fit','object-position','padding','padding-top','padding-right','padding-bottom','padding-left','margin','margin-top','margin-right','margin-bottom','margin-left','display','grid-template-columns','grid-auto-rows','grid-column','grid-row','gap','column-gap','row-gap','align-items','justify-content','flex','flex-direction','flex-wrap','box-sizing','overflow','opacity','white-space','vertical-align','position','left','top','right','bottom']);
  const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeHttps = v => { try { const u = new URL(String(v||'').trim()); return u.protocol==='https:' && !u.username && !u.password && !/[<>"'\s]/.test(String(v)) ? u.href : ''; } catch { return ''; } };
  const clamp=(x,low,high,def=low)=>{const n=Number(x);return Number.isFinite(n)?Math.max(low,Math.min(high,n)):def;};
  const cleanColor=(c,d='#eee8f4')=>/^#[\da-f]{3,8}$/i.test(String(c||''))?String(c):d;
  const cleanFont=(s,d='Georgia, serif')=>{const v=String(s||'');return /^[\w ,.'"-]{1,100}$/.test(v)?v:d;};
  const number=n=>String(Math.round(clamp(n,0,300,0)));
  const borderStyle=v=>['solid','dashed','dotted','double','none'].includes(v)?v:'solid';
  const shadowColor=(c,opacity=.45)=>{
    const hex=cleanColor(c,'#000000').replace('#','');
    const full=hex.length===3?hex.split('').map(x=>x+x).join(''):hex.slice(0,6).padEnd(6,'0');
    const rgb=[0,2,4].map(i=>parseInt(full.slice(i,i+2),16));
    return `rgba(${rgb.join(', ')}, ${clamp(opacity,0,1,.45)})`;
  };
  function newFrame(id){return {
    id:String(id||'frame-1'),name:'Border Frame',
    background:'#171120',transparentBg:false,borderColor:'#b778cb',borderWidth:3,borderStyle:'solid',
    padding:5,radius:14,shadowMode:'none',shadowColor:'#b778cb',shadowBlur:16,shadowOpacity:.45,
    innerShadowColor:'#000000',innerShadowBlur:18,innerShadowOpacity:.7,
    innerAccentColor:'#b778cb',innerAccentBlur:36,innerAccentOpacity:0
  };}
  // Sanitized, imported inline CSS is retained declaration by declaration.
  // This is essential for existing layered introductions, including inset
  // shadows, asymmetric padding, text effects and image sizing.
  function parsedStyle(raw){
    const out={};
    for(const piece of String(raw||'').split(';')){
      const at=piece.indexOf(':');if(at<1)continue;
      const key=piece.slice(0,at).trim().toLowerCase(),value=piece.slice(at+1).trim();
      const clean=safeCss(key,value);if(clean)out[key]=clean;
    }
    return out;
  }
  function frameStyle(frame){
    if(frame?.importedStyle)return {...parsedStyle(frame.importedStyle),...(frame.styleOverrides||{})};
    const f=frame||{},borderWidth=clamp(f.borderWidth,0,20,2),c=cleanColor(f.borderColor,'#b778cb');
    const out={'box-sizing':'border-box',width:'100%','margin':'0 auto',
      padding:`${clamp(f.padding,0,90,4)}px`,background:f.transparentBg?'transparent':cleanColor(f.background,'#171120'),
      border:borderWidth?`${borderWidth}px ${borderStyle(f.borderStyle)} ${c}`:'none',
      'border-radius':`${clamp(f.radius,0,100,10)}px`};
    const shadows=[];
    if(['outer','both'].includes(f.shadowMode))shadows.push(`0 0 ${clamp(f.shadowBlur,0,80,16)}px ${shadowColor(f.shadowColor,f.shadowOpacity)}`);
    if(['inner','both'].includes(f.shadowMode)){
      shadows.push(`inset 0 0 ${clamp(f.innerShadowBlur,0,80,18)}px ${shadowColor(f.innerShadowColor,f.innerShadowOpacity)}`);
      if(Number(f.innerAccentOpacity)>0)shadows.push(`inset 0 0 ${clamp(f.innerAccentBlur,0,80,36)}px ${shadowColor(f.innerAccentColor,f.innerAccentOpacity)}`);
    }
    if(shadows.length)out['box-shadow']=shadows.join(', ');
    return out;
  }
  const safeCss=(k,v)=>{
    if(!STYLES.has(k)||v==null)return '';
    const s=String(v).trim();
    if(k==='position'&&!['static','relative','absolute'].includes(s.toLowerCase()))return '';
    if(s.length>220||/[;{}<>\\]/.test(s)||/(?:url\s*\(|expression\s*\(|@import|javascript:|behavior\s*:|data:)/i.test(s))return '';
    if(!/^[-a-z0-9.%#(),\s'"/+:*]+$/i.test(s))return '';
    return s;
  };
  function css(map){return Object.entries(map).map(([k,v])=>{const x=safeCss(k,v);return x?`${k}: ${x}`:'';}).filter(Boolean).join('; ');}
  const attrStyle = obj => {const s=css(obj);return s?` style="${escapeHtml(s)}"`:'';};
  function initial(){return {
    version:3,title:'My Introduction Design',width:640,
    layout:{mode:'freeform',height:240,autoHeight:true,autoFitVersion:2,autoMakeRoom:true},
    theme:{background:'#171120',surface:'#251b32',text:'#f2e5ff',accent:'#c797e9',border:'#74508c',gradient:true,gradientAngle:135,radius:18,borderWidth:2,padding:24,shadow:18,font:'Georgia, serif',align:'center',maxWidth:640,
      borderStyle:'solid',frames:[]},
    fields:{scene:'Scene Name',name:'Character Name',intro:'Introduction',extra:'Extra Text'},
    blocks:[
      {id:'b1',type:'heading',text:'{{scene}}',size:29,align:'center',weight:700,color:'accent',padding:6,margin:10,placement:{x:5,y:20,w:90,h:72}},
      {id:'b2',type:'label',text:'{{name}}',size:14,align:'center',weight:700,color:'accent',padding:10,margin:10,background:true,placement:{x:5,y:105,w:90,h:65}},
      {id:'b3',type:'divider',text:'✦',size:14,color:'accent',margin:13,placement:{x:5,y:183,w:90,h:55}},
      {id:'b4',type:'text',manualHeight:false,text:'{{intro}}',size:16,align:'left',color:'text',line:1.65,padding:5,margin:12,placement:{x:5,y:251,w:90,h:205}},
      {id:'b5',type:'quote',text:'{{extra}}',size:15,align:'center',color:'text',line:1.5,margin:10,placement:{x:5,y:472,w:90,h:85}}
    ]
  };}
  // What a brand-new design starts as: the same content, STACKED (items follow each other, nothing to line up or overlap). "Free placement" stays available and computes positions when chosen.
  function starter(){const d=initial();d.layout={mode:'flow',height:240,autoHeight:true,autoFitVersion:2,autoMakeRoom:true};for(const b of d.blocks)delete b.placement;return d;}
  function slotValues(doc){const f=doc?.fields||{};return Object.fromEntries(SLOTS.map(k=>[k,String(f[k]??'')]));}
  // Tokens get replaced after HTML escaping: slot content can never be interpreted as markup.
  function interpolate(text,fields){let s=escapeHtml(text);for(const k of SLOTS){const token=new RegExp('\\{\\{\\s*'+k+'\\s*\\}\\}','gi');s=s.replace(token,()=>escapeHtml(fields[k]||'').replace(/\r?\n/g,'<br>'));}return s;}
  function blockStyle(block,theme){
    if(block?.importedStyle)return {...parsedStyle(block.importedStyle),...(block.styleOverrides||{})};
    const size=clamp(block.size,9,72,16), c=block.color==='accent'?theme.accent:block.color==='text'?theme.text:cleanColor(block.color,theme.text);
    const line=clamp(block.line,1,3,1.55),margin=clamp(block.margin,0,100,10),pad=clamp(block.padding,0,70,0);
    const ret={'box-sizing':'border-box','margin':`${margin}px 0`,'padding':`${pad}px`,color:c,'font-size':`${size}px`,'font-family':cleanFont(block.font,theme.font),'font-weight':clamp(block.weight,100,900,400),'line-height':line,'text-align':['left','center','right','justify'].includes(block.align)?block.align:theme.align,'letter-spacing':`${clamp(block.spacing,-2,12,0)}px`};
    if(block.background)ret.background=cleanColor(block.bgColor,theme.surface);
    if(block.borderOn){ret.border=`${clamp(block.borderWidth,1,16,1)}px ${borderStyle(block.borderStyle)} ${cleanColor(block.borderColor,theme.border)}`;ret['border-radius']=`${clamp(block.radius,0,90,12)}px`;}
    if(block.shadow)ret['box-shadow']=`0 3px ${clamp(block.shadow,0,60,10)}px ${theme.border}`;
    const glows=[];
    if(block.glow)glows.push(`0 0 ${clamp(block.glow,0,60,8)}px ${shadowColor(block.glowColor||theme.accent,block.glowOpacity??.75)}`);
    if(block.glow2)glows.push(`0 0 ${clamp(block.glow2,0,80,14)}px ${shadowColor(block.glowColor2||theme.border,block.glowOpacity2??.4)}`);
    if(glows.length)ret['text-shadow']=glows.join(', ');
    return ret;
  }
  function imageCrop(block){
    const crop=block?.crop||{};
    const zoom=clamp(crop.zoom,100,400,115);
    const limit=(zoom-100)/2;
    return {zoom,focusX:clamp(crop.focusX,0,100,50),focusY:clamp(crop.focusY,0,100,50),
      offsetX:clamp(crop.offsetX,-limit,limit,0),offsetY:clamp(crop.offsetY,-limit,limit,0)};
  }
  function cropImage(url,alt,crop,preview=false){
    const c=imageCrop({crop});
    const outer={'position':'relative','display':'block','box-sizing':'border-box','width':'100%','height':'100%',
      'min-height':'24px','overflow':'hidden'};
    const inner={'position':'absolute','display':'block','max-width':'none','width':`${c.zoom}%`,
      'height':`${c.zoom}%`,'left':`${(100-c.zoom)/2+c.offsetX}%`,
      'top':`${(100-c.zoom)/2+c.offsetY}%`,'object-fit':'cover',
      'object-position':`${c.focusX}% ${c.focusY}%`};
    return `<div${preview?' data-intro-crop-frame="true"':''}${attrStyle(outer)}>`+
      `<img${preview?' data-intro-crop-image="true"':''} src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="eager" decoding="async" referrerpolicy="no-referrer"${attrStyle(inner)}></div>`;
  }
  function compileBlock(block,theme,fields,preview=false,editorPreview=false){
    const t=TYPES.includes(block.type)?block.type:'text';
    const marker=preview?` data-block-id="${escapeHtml(String(block.id||''))}"`:'';
    const style=attrStyle(blockStyle(block,theme));
    const val=()=>interpolate(String(block.text||''),fields);
    if(block.importedTag && block.type!=='image' && block.type!=='divider'){
      const tag=TAGS.has(block.importedTag)?block.importedTag:'div';
      const inner=block.importedInner!=null?String(block.importedInner):val();
      const editableInner=block.importedInner==null?val():inner;
      return `<${tag}${marker}${style}>${editableInner}</${tag}>`;
    }
    if(t==='heading')return `<h3${marker}${style}>${val()}</h3>`;
    if(t==='text')return `<p${marker}${style}>${val()}</p>`;
    if(t==='label')return `<div${marker}${style}>${val()}</div>`;
    if(t==='quote')return `<blockquote${marker}${style}>${val()}</blockquote>`;
    if(t==='link')return `<div${marker}${style}><a href="${escapeHtml(safeHttps(block.url)||'https://juicychat.ai')}" style="color:inherit;text-decoration:underline">${val()}</a></div>`;
    if(t==='image'){
      const url=safeHttps(block.url);
      if(!url)return preview?`<div${marker}${style}>Image: add a direct HTTPS image URL in the inspector</div>`:`<div${style}>Image unavailable</div>`;
      const freeImage=!!block.placement;
      const framed=!!block.frameOn;
      const pad=clamp(block.framePadding,0,60,0);
      const borderWidth=framed?clamp(block.frameBorderWidth,0,16,2):0;
      const frameRadius=clamp(block.frameRadius,0,90,block.radius??12);
      const imageRadius=clamp(block.imageRadius,0,90,block.radius??12);
      const frameStyle={'display':'block','box-sizing':'border-box','width':'100%',
        'height':freeImage?'100%':'auto','padding':`${pad}px`,
        'border':borderWidth?`${borderWidth}px ${borderStyle(block.frameBorderStyle)} ${cleanColor(block.frameBorderColor,theme.border)}`:'none',
        'border-radius':`${frameRadius}px`,
        'background':block.frameBackgroundOn?cleanColor(block.frameBackgroundColor,theme.surface):'transparent',
        'overflow':'hidden'};
      const glow=clamp(block.frameShadow,0,60,0);
      if(glow)frameStyle['box-shadow']=`0 0 ${glow}px ${shadowColor(block.frameBorderColor||theme.accent,.55)}`;
      const viewportStyle={'display':'block','box-sizing':'border-box','width':'100%',
        'height':freeImage?'100%':'auto','min-height':block.crop?.enabled?'24px':'0',
        'overflow':'hidden','border-radius':`${imageRadius}px`};
      const w=clamp(block.imageWidth,20,100,100),fit=['contain','cover'].includes(block.fit)?block.fit:'contain';
      const imageStyle=block.importedImageStyle?
        {...parsedStyle(block.importedImageStyle),...(block.imageStyleOverrides||{})}:
        {'display':'block','width':`${w}%`,'height':freeImage?'100%':'auto',
         'max-height':freeImage?'100%':'none','max-width':'100%','margin':'0 auto',
         'object-fit':fit,'aspect-ratio':block.ratio&&/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(block.ratio)?block.ratio:'auto'};
      const body=block.crop?.enabled
        ?cropImage(url,block.alt||'Character image',block.crop,editorPreview)
        :`<img src="${escapeHtml(url)}" alt="${escapeHtml(block.alt||'Character image')}" loading="eager" decoding="async" referrerpolicy="no-referrer"${attrStyle(imageStyle)}>`;
      const boxStyle=freeImage?attrStyle({...blockStyle(block,theme),'width':'100%',
        'height':'100%','overflow':'visible',...(block.importedStyle?{}:{margin:'0',padding:'0'})}):style;
      // Padding belongs to the frame rather than the image/crop, so the outer
      // selection's position and dimensions never move when spacing changes.
      return `<div${marker}${boxStyle}><div${editorPreview?' data-intro-image-frame="true"':''}${attrStyle(frameStyle)}>`+
        `<div${attrStyle(viewportStyle)}>${body}</div></div></div>`;
    }
    if(t==='divider'){
      const shade=cleanColor(block.dividerColor,theme.border),width=clamp(block.dividerThickness,1,16,1),gap=clamp(block.dividerGap,0,40,10);
      const rule=`flex:1;height:${width}px;background:${shade}`;
      const url=safeHttps(block.dividerUrl),position=block.dividerImageMode==='between'?'between':'replace';
      if(url){
        if(block.crop?.enabled){
          const croppedStyle={...blockStyle(block,theme),'height':'100%','width':'100%','margin':'0','padding':'0','overflow':'hidden'};
          if(position==='replace')return `<div${marker}${attrStyle(croppedStyle)}>${cropImage(url,block.dividerAlt||'Decorative divider',block.crop,editorPreview)}</div>`;
          const sized={width:`${clamp(block.dividerImageWidth,10,100,100)}%`,height:'100%','min-width':'0'};
          return `<div${marker}${attrStyle({...croppedStyle,display:'flex','align-items':'center','gap':`${gap}px`})}><span style="${rule}"></span><div${attrStyle(sized)}>${cropImage(url,block.dividerAlt||'Decorative divider',block.crop,editorPreview)}</div><span style="${rule}"></span></div>`;
        }
        const image=`<img src="${escapeHtml(url)}" alt="${escapeHtml(block.dividerAlt||'Decorative divider')}" loading="eager" decoding="async" referrerpolicy="no-referrer"${attrStyle({display:'block',width:`${clamp(block.dividerImageWidth,10,100,100)}%`,height:'auto','max-width':'100%','object-fit':'contain',margin:'0 auto'})}>`;
        if(position==='replace')return `<div${marker}${style}>${image}</div>`;
        return `<div${marker}${attrStyle({...blockStyle(block,theme),display:'flex','align-items':'center','gap':`${gap}px`})}><span style="${rule}"></span>${image}<span style="${rule}"></span></div>`;
      }
      return `<div${marker}${attrStyle({...blockStyle(block,theme),display:'flex','align-items':'center','gap':`${gap}px`})}><span style="${rule}"></span><span>${val()}</span><span style="${rule}"></span></div>`;
    }
    if(t==='spacer')return `<div${marker} style="height:${clamp(block.height,4,180,24)}px"></div>`;
    if(t==='columns')return `<div${marker}${attrStyle({...blockStyle(block,theme),display:'flex','gap':`${clamp(block.gap,0,80,12)}px`,'flex-wrap':'wrap'})}><div style="flex:1;min-width:120px">${interpolate(block.left||'Left column',fields)}</div><div style="flex:1;min-width:120px">${interpolate(block.right||'Right column',fields)}</div></div>`;
    if(t==='list'){
      const items=String(block.text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,35);
      const tag=block.ordered?'ol':'ul';return `<${tag}${marker}${style}>${items.map(x=>`<li>${interpolate(x,fields)}</li>`).join('')}</${tag}>`;
    }
    if(t==='custom'){
      // `custom` blocks are sanitized through DOMParser in the UI before use.
      return `<div${marker}${style}>${String(block.safeHtml||'')}</div>`;
    }
    return `<div${marker}${style}>${val()}</div>`;
  }
  // A flexible canvas must follow the LAST placed element in both directions.
  // Never use the previous rendered height as the auto-height minimum: dragging
  // something downward and then upward must return to the content-driven height.
  // Fixed-height mode remains an explicit opt-out for deliberately tall layouts.
  const MIN_CANVAS_HEIGHT=240, CANVAS_BOTTOM_GAP=35, MAX_CANVAS_HEIGHT=3000;
  function canvasHeight(source){
    const layout=source?.layout||{};
    const bottom=Math.max(0,...(Array.isArray(source?.blocks)?source.blocks:[]).map(b=>{
      if(!b?.placement)return 0;
      const y=clamp(b.placement.y,0,MAX_CANVAS_HEIGHT,0),h=clamp(b.placement.h,24,1200,80);
      return y+h;
    }));
    const needed=Math.round(clamp(Math.max(MIN_CANVAS_HEIGHT,bottom+CANVAS_BOTTOM_GAP),240,MAX_CANVAS_HEIGHT,MIN_CANVAS_HEIGHT));
    if(layout.autoHeight!==false)return needed;
    return Math.round(clamp(Math.max(needed,Number(layout.height)||MIN_CANVAS_HEIGHT),240,MAX_CANVAS_HEIGHT,MIN_CANVAS_HEIGHT));
  }
  // Every free-position coordinate is stored as plain data. Rendering uses
  // CSS Grid rather than scripts or absolute positioning, which is expressly
  // supported for Introduction layouts by JuicyChat's guide.
  function placementOf(block,stageHeight=610){
    const p=block?.placement||{};
    const x=Math.round(clamp(p.x,0,95,5));
    const w=Math.round(clamp(p.w,5,100-x,Math.min(90,100-x)));
    const h=Math.round(clamp(p.h,24,1200,80));
    const y=Math.round(clamp(p.y,0,Math.max(0,stageHeight-h),0));
    return {x,y,w,h};
  }
  function freeBlock(block,theme,fields,preview,height){
    const p=placementOf(block,height);
    const style=attrStyle({'box-sizing':'border-box','grid-column':`${p.x+1} / span ${p.w}`,
      'grid-row':`${p.y+1} / span ${p.h}`,'min-width':'0','overflow':'hidden'});
    const marker=preview?` data-block-id="${escapeHtml(String(block.id||''))}"`:'';
    return `<div${marker}${style}>${compileBlock(block,theme,fields,false,preview)}</div>`;
  }
  function compile(doc,opts={}){
    const source=doc||initial(),theme=source.theme||initial().theme,fields=slotValues(source);
    const align=['left','center','right'].includes(theme.align)?theme.align:'center';
    const maxWidth=clamp(theme.maxWidth,260,900,640),pad=clamp(theme.padding,0,110,24),radius=clamp(theme.radius,0,100,18);
    const border=clamp(theme.borderWidth,0,12,2),color=cleanColor(theme.border,'#74508c');
    const background=cleanColor(theme.background,'#171120');
    const gradient=theme.gradient?`linear-gradient(${clamp(theme.gradientAngle,0,360,135)}deg,${background} 0%,${cleanColor(theme.surface,'#251b32')} 100%)`:background;
    const cardStyle={width:'100%','max-width':`${maxWidth}px`,'box-sizing':'border-box','margin':'0 auto','padding':`${pad}px`,'background':gradient,'border':`${border}px ${borderStyle(theme.borderStyle)} ${color}`,'border-radius':`${radius}px`,color:cleanColor(theme.text,'#f2e5ff'),'font-family':cleanFont(theme.font),'text-align':align,'box-shadow':theme.shadow?`0 0 ${clamp(theme.shadow,0,80,18)}px ${color}`:'none','overflow':'hidden'};
    const blocks=Array.isArray(source.blocks)?source.blocks.slice(0,150):[];
    const free=source.layout?.mode==='freeform';
    const height=canvasHeight(source);
    const blockHtml=free?`<div${opts.preview?' data-intro-free-stage="true"':''}${attrStyle({
      'display':'grid','grid-template-columns':'repeat(100, minmax(0, 1fr))',
      'grid-auto-rows':'1px','min-height':`${height}px`,'box-sizing':'border-box','width':'100%'})}>${
        blocks.map(b=>freeBlock(b||{},theme,fields,!!opts.preview,height)).join('')}</div>`:
      blocks.map(b=>compileBlock(b||{},theme,fields,!!opts.preview,!!opts.preview)).join('');
    let html=`<div${attrStyle(source.importedCardStyle?{...parsedStyle(source.importedCardStyle),...(source.cardStyleOverrides||{})}:cardStyle)}>${blockHtml}</div>`;
    const frames=Array.isArray(theme.frames)?theme.frames.slice(0,8):[];
    // The first frame is outermost. Build from inside out so each frame is a
    // real nested DIV, just like a hand-written multi-layer HTML card.
    for(let i=frames.length-1;i>=0;i--)html=`<div${attrStyle(frameStyle(frames[i]))}>${html}</div>`;
    return opts.formatted?formatHtml(html):html;
  }
  // Format static HTML without reinterpreting or removing the inline styles.
  // Leaves that contain text (including <br>) stay inline, so text and spacing
  // are unaffected. Nested DIVs are indented, one opening/closing tag per line.
  // Exported formatting is included in the 15,000-character validation.
  function formatHtml(source){
    const input=String(source||'');
    if(!input.trim())return '';
    const tokens=input.match(/<\/?[A-Za-z][^>]*>|[^<]+|</g)||[];
    const root={tag:'ROOT',children:[]},stack=[root],voids=new Set(['br','hr','img']);
    for(const token of tokens){
      const close=/^<\/([a-z][\w-]*)\s*>$/i.exec(token);
      if(close){
        if(stack.length>1&&stack[stack.length-1].tag===close[1].toLowerCase())stack.pop();
        else return input; // Invalid markup: never risk changing its behavior.
        continue;
      }
      const open=/^<([a-z][\w-]*)\b[^>]*>$/i.exec(token);
      if(open){
        const tag=open[1].toLowerCase();
        const node={tag,open:token,children:[]};stack[stack.length-1].children.push(node);
        if(!voids.has(tag)&&!token.endsWith('/>'))stack.push(node);
      }else stack[stack.length-1].children.push({tag:'#text',text:token});
    }
    if(stack.length!==1)return input;
    const pad=d=>'  '.repeat(d),block=new Set(['div','p','h3','h4','h5','h6','blockquote','ul','ol','li','hr']);
    function inline(node){return node.tag==='#text'?node.text:node.open+node.children.map(inline).join('')+(voids.has(node.tag)?'':`</${node.tag}>`);}
    function render(node,depth){
      if(node.tag==='#text')return pad(depth)+node.text;
      if(voids.has(node.tag))return pad(depth)+node.open;
      const hasNestedBlock=node.children.some(c=>block.has(c.tag));
      if(!hasNestedBlock)return pad(depth)+inline(node);
      const lines=node.children.filter(c=>c.tag!=='#text'||c.text.trim()).map(c=>render(c,depth+1));
      return `${pad(depth)}${node.open}\n${lines.join('\n')}\n${pad(depth)}</${node.tag}>`;
    }
    return root.children.filter(c=>c.tag!=='#text'||c.text.trim()).map(c=>render(c,0)).join('\n');
  }
  function verifyOutput(html){
    const text=String(html||'');const issues=[];
    if(text.length>MAX)issues.push(`Introduction is ${text.length.toLocaleString()} characters, exceeding JuicyChat's 15,000-character maximum by ${(text.length-MAX).toLocaleString()}.`);
    if(/<(?:script|iframe|object|embed|style|link|html|head|body|meta|base|h[12]|form)\b/i.test(text) || /\bon\w+\s*=/i.test(text)||/javascript\s*:/i.test(text))issues.push('Contains HTML or executable content that the JuicyChat guide does not support.');
    return {length:text.length,remaining:MAX-text.length,issues,valid:!issues.length};
  }
  // Data-only placeholders are preserved in saved templates. Importing/exporting JSON
  // copies the design, not a screenshot or a rendered string.
  function forTemplate(doc){const copy=JSON.parse(JSON.stringify(doc||initial()));copy.fields={scene:'',name:'',intro:'',extra:''};return copy;}
  return {MAX,TYPES,SLOTS,TAGS,STYLES,initial,starter,compile,placementOf,formatHtml,verifyOutput,forTemplate,newFrame,frameStyle,imageCrop,canvasHeight,interpolate,safeHttps,safeCss,parsedStyle,escapeHtml,cleanColor,clamp};
});
