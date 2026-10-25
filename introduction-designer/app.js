'use strict';
/* Visual Introduction Designer. No dynamic script enters exported HTML. */
(() => {
  const C=window.IntroCore,L=window.IntroLayout,host=window.introHost;
  if(!C||!L)throw Error('Introduction compiler or snapping engine did not load.');
  const $=id=>document.getElementById(id);
  let doc=C.initial(),templates=[],selectedId=null,templateId=null,embedded=false,rendered='',view='visual';
  let saveTimer=null,hideMessageTimer=null,draggedId=null,editingInline=false;
  let pointerDrag=null,skipCanvasClick=false,fitQueued=false,cropEditId=null;
  let propertyTab='content',selectedFrameId=null;
  let historyUndo=[],historyRedo=[],historyBaseline='',historyRestoring=false;
  const imageDimensions=new Map(); // Measurements never change saved layout or undo history.
  function recordHistory(){
    const current=JSON.stringify(doc);
    if(!historyBaseline){historyBaseline=current;updateHistoryButtons();return;}
    if(current!==historyBaseline&&!historyRestoring){historyUndo.push(historyBaseline);if(historyUndo.length>90)historyUndo.shift();historyRedo=[];historyBaseline=current;}
    updateHistoryButtons();
  }
  function updateHistoryButtons(){
    const undo=$('id-undo'),redo=$('id-redo');
    if(undo)undo.disabled=historyUndo.length===0;
    if(redo)redo.disabled=historyRedo.length===0;
  }
  function restoreHistory(direction){
    const list=direction==='undo'?historyUndo:historyRedo,other=direction==='undo'?historyRedo:historyUndo;
    if(!list.length)return;
    other.push(JSON.stringify(doc));const next=JSON.parse(list.pop());
    historyRestoring=true;
    try{fromSaved(next);historyBaseline=JSON.stringify(doc);}finally{historyRestoring=false;}
    updateHistoryButtons();
    notice(direction==='undo'?'Undo complete.':'Redo complete.');
  }
  let lastSnapGuides={};
  const palette={heading:['H','Heading'],text:['¶','Paragraph'],label:['▰','Label / badge'],image:['▧','Image'],divider:['✦','Divider'],quote:['❝','Quote'],columns:['▥','Two columns'],list:['☷','List'],link:['↗','HTTPS link'],spacer:['↕','Spacer']};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const escape=C.escapeHtml;
  function highlightHtml(source){
    const raw=String(source||'');
    return raw.split(/(<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>)/g).map(token=>{
      if(!token)return '';
      if(token.startsWith('<!--'))return '<span class="h-comment">'+escape(token)+'</span>';
      if(!/^<\/?[a-zA-Z]/.test(token))return '<span class="h-text">'+escape(token)+'</span>';
      const tag=token.match(/^(<\/?)([\w-]+)/),end=token.slice(tag?.[0].length||0);
      if(!tag)return escape(token);
      const attrs=end.replace(/([\w:-]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/g,(_m,name,eq,val)=>
        '<span class="h-attr">'+escape(name)+'</span>'+escape(eq)+
        '<span class="h-value">'+escape(val)+'</span>');
      // attrs above are escaped in both matches and residual text below.
      const attrsSafe=attrs.split(/(<span class="h-(?:attr|value)">[^<]*<\/span>)/g).map(v=>v.startsWith('<span class="h-')?v:escape(v)).join('');
      return '<span class="h-punct">'+escape(tag[1])+'</span><span class="h-tag">'+escape(tag[2])+'</span>'+attrsSafe;
    }).join('');
  }
  function paintSourceCode(){
    const input=$('id-custom-html'),pre=$('id-import-highlight');
    if(!input||!pre)return;
    pre.innerHTML=highlightHtml(input.value)+'\n';
    pre.scrollTop=input.scrollTop;pre.scrollLeft=input.scrollLeft;
    const live=$('id-import-live-preview');if(live)live.innerHTML=sanitizeHtml(input.value);
  }

  const editable=['heading','text','label','quote','divider','list','link','custom'];
  const notice=(msg,bad=false)=>{$('id-message').textContent=msg;$('id-message').classList.toggle('error',bad);clearTimeout(hideMessageTimer);hideMessageTimer=setTimeout(()=>{$('id-message').textContent='';},7000);};
  const safe=(value,def)=>String(value==null?def:value);
  const formValues=()=>({scene:$('id-scene').value,name:$('id-name').value,intro:$('id-intro').value,extra:$('id-extra').value});
  function queueSave(skipHistory=false){if(skipHistory){historyBaseline=JSON.stringify(doc);updateHistoryButtons();}else recordHistory();clearTimeout(saveTimer);$('id-unsaved').textContent='Saving draft…';$('id-unsaved').classList.add('busy');saveTimer=setTimeout(async()=>{try{await host?.saveDraft(doc);$('id-unsaved').textContent='Local draft autosaved';}catch(e){$('id-unsaved').textContent='Could not save draft';notice(e.message,true);}finally{$('id-unsaved').classList.remove('busy');}},700);}
  function color(s,def){return C.cleanColor(s,def);}
  const blockOf=id=>doc.blocks.find(b=>b.id===id);
  const blockIndex=id=>doc.blocks.findIndex(b=>b.id===id);
  function newBlock(type){
    const base={id:'layer-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),type,size:16,align:'center',weight:400,color:'text',line:1.5,padding:8,margin:12,spacing:0,bgColor:'#31223d',borderColor:'#b36de3',borderWidth:1,borderStyle:'solid',radius:12,glow:0,glow2:0,glowOpacity:.75,glowOpacity2:.4};
    const text={heading:'Heading',text:'{{intro}}',label:'Section Label',divider:'✦',quote:'Extra Text',columns:'',list:'First item\nSecond item\nThird item',link:'Read more'};
    base.text=text[type]||'';
    if(type==='heading'){base.size=28;base.weight=700;base.color='accent';}
    if(type==='label'){base.weight=700;base.background=true;base.color='accent';}
    if(type==='quote'){base.size=17;base.background=true;base.borderOn=true;}
    if(type==='image'){base.url='';base.alt='Character image';base.imageWidth=100;base.fit='contain';base.ratio='original';base.manualHeight=true;}
    if(type==='text')base.manualHeight=false; // Paragraphs automatically fit their content.
    if(type==='columns'){base.left='{{name}}';base.right='{{extra}}';base.align='left';}
    if(type==='spacer')base.height=25;
    if(type==='divider'){base.dividerThickness=1;base.dividerGap=10;base.dividerUrl='';base.dividerImageMode='replace';base.dividerImageWidth=100;}
    if(type==='link')base.url='https://juicychat.ai';
    if(doc.layout?.mode==='freeform'){
      const bottom=Math.max(0,...doc.blocks.map(b=>(b.placement?.y||0)+(b.placement?.h||70)));
      const y=Math.max(8,bottom+16),h=type==='image'?180:type==='text'?64:84;
      doc.layout.height=Math.min(3000,Math.max(Number(doc.layout.height)||240,y+h+40));
      base.placement={x:10,y:Math.min(y,doc.layout.height-h),w:80,h};
    }
    return base;
  }
  function applyChange(){doc.fields=formValues();renderOutput();queueSave();}
  function bindFields(){for(const key of C.SLOTS){$(('id-'+key)).addEventListener('input',applyChange);}}
  function changeSelected(mutator,rebuildInspector=false){const b=blockOf(selectedId);if(!b)return;mutator(b);renderOutput();renderLayers();queueSave();if(rebuildInspector)showInspector();}
  function selectLayer(id){
    if(cropEditId&&cropEditId!==id)cropEditId=null;
    selectedId=id&&blockOf(id)?id:null;selectedFrameId=null;
    if(selectedId){$('id-element-tab').click();}else{$('id-theme-tab').click();}
    showInspector();renderLayers();highlightSelected();
  }
  function selectFrame(id){
    selectedId=null;selectedFrameId=id;highlightSelected();renderLayers();
    $('id-theme-tab').click();
    const frame=frameList().find(f=>f.id===id);
    if(frame){const index=frameList().indexOf(frame);const detail=$('id-frame-list').children[index];
      if(detail){detail.open=true;detail.scrollIntoView({block:'nearest',behavior:'smooth'});}}
  }
  function synchronizeStructure(){
    if(doc.mode==='visual'&&isFree()){
      // The visual order, not previous insertion order, is the source of truth
      // after releasing a dragged object, just as in a page-builder Navigator.
      doc.blocks.sort((a,b)=>{const x=locationOf(a),y=locationOf(b);return x.y-y.y||x.x-y.x;});
    }
    renderLayers();
  }
  function setPropertyTab(next){
    propertyTab=['content','style','advanced'].includes(next)?next:'content';
    $('id-element-form').dataset.propertyTab=propertyTab;
    for(const btn of document.querySelectorAll('[data-prop-target]')){
      const active=btn.dataset.propTarget===propertyTab;
      btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));
    }
  }
  const isFree=()=>doc.mode!=='source'&&doc.layout?.mode==='freeform';
  const canCrop=b=>!!b&&((b.type==='image'&&!!C.safeHttps(b.url))||(b.type==='divider'&&!!C.safeHttps(b.dividerUrl)));
  const normalizedCrop=b=>C.imageCrop(b);
  function ensureCrop(b){
    if(!b.crop)b.crop={};
    Object.assign(b.crop,{enabled:true,zoom:b.crop.zoom??115,focusX:b.crop.focusX??50,focusY:b.crop.focusY??50,
      offsetX:b.crop.offsetX??0,offsetY:b.crop.offsetY??0});
    b.manualHeight=true;
    return b.crop;
  }
  function refreshCropUI(){
    const b=blockOf(selectedId),editing=!!b&&cropEditId===b.id;
    $('id-canvas').classList.toggle('id-cropping',editing);
    $('id-crop-toggle').hidden=editing;
    $('id-crop-done').hidden=!editing;
    $('id-crop-toggle').textContent=b?.crop?.enabled?'Edit crop':'Crop image';
    $('id-crop-status').textContent=editing?'Drag the picture inside its frame; outside handles resize the frame. Scroll to zoom.':
      b?.crop?.enabled?'Drag the zoomed image to pan inside its frame. Alt+drag the image to move the whole frame.':'Use the Zoom slider, then drag the image inside its frame. No extra Crop click required.';
    for(const el of $('id-card').querySelectorAll('[data-intro-free-stage] > [data-block-id]'))el.classList.toggle('id-crop-active',editing&&el.dataset.blockId===b.id);
  }
  function updateCropPreview(block){
    const frame=$('id-card').querySelector(`[data-block-id="${block.id}"] [data-intro-crop-frame]`);
    const img=frame?.querySelector('[data-intro-crop-image]');if(!img)return;
    const c=normalizedCrop(block);
    img.style.width=c.zoom+'%';img.style.height=c.zoom+'%';
    img.style.left=((100-c.zoom)/2+c.offsetX)+'%';img.style.top=((100-c.zoom)/2+c.offsetY)+'%';
    img.style.objectPosition=`${c.focusX}% ${c.focusY}%`;
    for(const [id,val] of [['id-crop-zoom',c.zoom],['id-crop-focus-x',c.focusX],['id-crop-focus-y',c.focusY]]){
      const el=$(id);if(el&&document.activeElement!==el){el.value=String(Math.round(val));const number=el.parentElement.querySelector('.id-range-number');if(number)number.value=el.value;}
    }
  }
  function ratioLabel(w,h){
    if(!w||!h)return 'unknown';
    const gcd=(a,b)=>b?gcd(b,a%b):a;
    const d=gcd(w,h);const aw=w/d,ah=h/d;
    return aw<=100&&ah<=100?`${aw}:${ah}`:`${(w/h).toFixed(3)}:1`;
  }
  function showImageDimensions(block){
    const el=$('id-image-dimensions'),opt=$('id-block-ratio')?.querySelector('[value="original"]');
    if(!el||!opt||!block)return;
    const data=imageDimensions.get(block.id),match=data&&data.url===block.url;
    const label=match?ratioLabel(data.width,data.height):null;
    opt.textContent=label?`Original image (${label})`:'Original image (detect)';
    el.textContent=match?`Source: ${data.width} × ${data.height}px (${label}). Changing the URL keeps the frame in place.`:
      'The original ratio is detected when the image loads. Changing the URL does not move this layer.';
  }
  const layoutHeight=()=>C.canvasHeight(doc);
  function locationOf(block){return C.placementOf(block,layoutHeight());}
  function applyArrangement(result,preview=false){
    if(!result.ok){if(!preview)notice(result.reason||'Cannot place blocks without overlapping.',true);return false;}
    for(const block of doc.blocks){
      const next=result.placements.get(block.id);if(next)block.placement={...next};
    }
    // Recalculate from actual placements, not from the previous (possibly huge) canvas.
    doc.layout.height=layoutHeight();lastSnapGuides=result.guides||{};
    if(preview){
      const stage=$('id-card').querySelector('[data-intro-free-stage]');
      if(stage){
        stage.style.minHeight=layoutHeight()+'px';
        $('id-stage-height').value=layoutHeight();
        for(const node of stage.querySelectorAll(':scope > [data-block-id]')){
          const r=result.placements.get(node.dataset.blockId);if(!r)continue;
          node.style.gridColumn=`${r.x+1} / span ${r.w}`;node.style.gridRow=`${r.y+1} / span ${r.h}`;
        }
      }
      for(const [field,value] of Object.entries(result.placements.get(selectedId)||{})){
        const el=$('id-pos-'+field);if(el&&el.value!==String(value))el.value=value;
      }
      drawGuides();
    }
    return true;
  }
  function smartPlace(id,proposal,options={}){
    if(!isFree()||!blockOf(id))return false;
    const baseline=doc.blocks.map(b=>({id:b.id,placement:locationOf(b)}));
    let result=L.arrange(baseline,id,proposal,layoutHeight(),{snap:options.snap!==false,thresholdX:1.5,thresholdY:7,collision:options.collision||'free'});
    if(result.ok&&!options.preview&&doc.layout?.autoMakeRoom!==false){
      // Moving an EXISTING block reorders the slots it crosses. Resizing a
      // block instead makes room for newly needed space. Both operate on drop.
      result=options.action==='resize'
        ?L.makeRoom(baseline,id,result.placements.get(id),layoutHeight())
        :L.reorderDrop(baseline,id,result.placements.get(id),layoutHeight());
    }
    return applyArrangement(result,!!options.preview);
  }
  function alignAll(){
    if(!isFree()||!doc.blocks.length)return;
    const result=L.arrange(doc.blocks,null,null,layoutHeight());
    applyArrangement(result);
  }
  function drawGuides(){
    const stage=$('id-card').querySelector('[data-intro-free-stage]');if(!stage)return;
    stage.querySelectorAll('.id-snap-guide').forEach(el=>el.remove());
    // Persistent center crosshairs make the actual X=50% and Y=50% visible.
    // They are preview-only and never appear in copied JuicyChat HTML.
    stage.classList.toggle('id-center-guides',isFree()&&doc.layout?.showGuides!==false);
    if(doc.layout?.showGuides===false||!pointerDrag)return;
    for(const axis of ['x','y']){
      const guide=lastSnapGuides[axis];if(!guide||!Number.isFinite(Number(guide.position)))continue;
      const line=document.createElement('span');
      line.className='id-snap-guide '+(axis==='x'?'vertical':'horizontal');
      if(axis==='x')line.style.left=guide.position+'%';
      else line.style.top=guide.position+'px';
      line.dataset.align=guide.edge||'';
      line.dataset.source=guide.source||'';
      stage.append(line);
    }
  }
  function updateImageStatus(message,state=''){
    const status=$('id-url-status');if(!status)return;
    status.textContent=message;status.classList.toggle('loading',state==='loading');status.classList.toggle('error',state==='error');
  }
  function wirePreviewImages(){
    for(const img of $('id-card').querySelectorAll('img')){
      img.draggable=false; // Native image dragging steals pointer movement from the canvas.
      const container=img.closest('[data-block-id]');const id=container?.dataset.blockId;
      const update=(error)=>{
        if(!error&&id&&blockOf(id)?.type==='image'&&img.naturalWidth&&img.naturalHeight){
          imageDimensions.set(id,{url:blockOf(id).url,width:img.naturalWidth,height:img.naturalHeight});
          if(selectedId===id)showImageDimensions(blockOf(id));
        }
        if(!error&&(!id||!['image','divider'].includes(blockOf(id)?.type)))scheduleAutoFit();
        if(id===selectedId){
          const type=blockOf(id)?.type;
          const text=error?'Image could not load. Check the direct public HTTPS URL.':'Image loaded and preview updated.';
          if(type==='image')updateImageStatus(text,error?'error':'');
          if(type==='divider'){$('id-divider-url-status').textContent=text;$('id-divider-url-status').classList.toggle('error',!!error);}
        }
      };
      img.addEventListener('load',()=>update(false),{once:true});
      img.addEventListener('error',()=>update(true),{once:true});
      if(img.complete)update(img.naturalWidth===0);
    }
  }
  // Paragraphs in Auto mode follow their rendered content in BOTH directions.
  // This runs after the text DOM paints, not from a guessed character count.
  // The paragraph retains its top/left/width; only later rows shift to preserve
  // their original spacing. Explicitly resized text boxes remain Fixed.
  function measuredParagraphHeight(inner){
    if(!inner||!inner.getBoundingClientRect().width)return null;
    const style=getComputedStyle(inner);
    const marginTop=parseFloat(style.marginTop)||0,marginBottom=parseFloat(style.marginBottom)||0;
    const natural=Math.max(inner.scrollHeight,Math.ceil(inner.getBoundingClientRect().height));
    return Math.round(C.clamp(Math.ceil(natural+marginTop+marginBottom+2),24,1200,60));
  }
  function fitParagraph(block,required){
    const old=locationOf(block),nextHeight=Math.min(1200,Math.max(24,required));
    const delta=nextHeight-old.h;
    if(Math.abs(delta)<2)return false;
    const oldBottom=old.y+old.h;
    const peers=doc.blocks.filter(b=>b.id!==block.id).map(b=>({block:b,p:locationOf(b)}));
    // Do not move items in adjacent columns that share a row.
    const below=peers.filter(entry=>entry.p.y>=oldBottom-1).sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x);
    const maxPeerBottom=Math.max(0,...below.map(entry=>entry.p.y+entry.p.h));
    if(delta>0&&Math.max(old.y+nextHeight,maxPeerBottom+delta)>L.MAX_HEIGHT)return false;
    block.placement={...old,h:nextHeight};
    for(const entry of below){
      entry.block.placement={...entry.p,y:Math.max(0,entry.p.y+delta)};
    }
    doc.layout.height=layoutHeight();
    return true;
  }
  function scheduleAutoFit(){
    if(!isFree()||fitQueued||pointerDrag)return;
    fitQueued=true;
    requestAnimationFrame(()=>{
      fitQueued=false;
      if(!isFree()||pointerDrag||editingInline||view!=='visual')return;
      const stage=$('id-card').querySelector('[data-intro-free-stage]');if(!stage)return;
      let changed=false;
      const nodes=[...stage.querySelectorAll(':scope > [data-block-id]')];
      for(const node of nodes){
        const block=blockOf(node.dataset.blockId);
        if(!block||block.manualHeight||block.crop?.enabled)continue;
        const inner=node.firstElementChild;
        if(!inner)continue;
        if(block.type==='text'){
          const required=measuredParagraphHeight(inner);
          if(required!=null&&fitParagraph(block,required))changed=true;
          continue;
        }
        if(['image','divider'].includes(block.type))continue;
        const content=Math.ceil(Math.max(inner.scrollHeight,inner.getBoundingClientRect().height)+Math.max(0,Number(block.margin)||0));
        const required=Math.min(1200,Math.max(24,content+3));
        const current=locationOf(block);
        if(required>current.h+10){
          const proposals=doc.blocks.map(b=>({id:b.id,placement:locationOf(b)}));
          const placement=L.arrange(proposals,block.id,{...current,h:required},layoutHeight(),{snap:false,collision:'avoid'});
          if(placement.ok){applyArrangement(placement,false);changed=true;}
        }
      }
      if(changed){renderOutput();showInspector();queueSave(true);}
    });
  }
  function syncLayoutUI(){
    $('id-layout-mode').value=isFree()?'freeform':'flow';
    $('id-stage-height-wrap').hidden=!isFree()||doc.layout?.autoHeight!==false;
    $('id-auto-height-readout').hidden=!isFree()||doc.layout?.autoHeight===false;
    $('id-auto-height-readout').textContent=`Height: ${layoutHeight()} px (auto)`;
    $('id-auto-height-wrap').hidden=!isFree();
    $('id-auto-height').checked=doc.layout?.autoHeight!==false;
    $('id-stage-height').disabled=doc.layout?.autoHeight!==false;
    $('id-stage-height').title='Manual canvas height in pixels. Select Fit content to resume automatic resizing.';
    $('id-stage-height').value=layoutHeight();
    $('id-canvas-hint').textContent=cropEditId? 'Drag to move the picture inside its frame. Use the handles to resize.' : isFree()? 'Drag an item to move it. Use the handles to resize. Click empty space to deselect. Delete removes a selected item.' : 'In stacked layout, drag items in the left list to change their order.';
    $('id-snap-enabled').checked=doc.layout?.snapEnabled!==false;
    $('id-show-guides').checked=doc.layout?.showGuides!==false;
    $('id-avoid-overlap').checked=doc.layout?.autoMakeRoom!==false;
  }
  const HANDLE_DIRECTIONS=['nw','n','ne','e','se','s','sw','w'];
  function addCanvasHandles(){
    if(!isFree())return;
    for(const block of $('id-card').querySelectorAll('[data-intro-free-stage] > [data-block-id]')){
      for(const direction of HANDLE_DIRECTIONS){
        const grip=document.createElement('span');grip.className='id-resize-grip handle-'+direction;
        grip.dataset.handle=direction;grip.title='Resize from '+direction.toUpperCase();
        grip.setAttribute('aria-hidden','true');block.append(grip);
      }
    }
  }
  // Legacy saved templates (before free positioning) open in their original
  // stacked layout. Switching captures each element's visible position.
  function switchLayout(mode){
    if(doc.mode==='source')return notice('Switch back to visual blocks before arranging elements.',true);
    const target=mode==='flow'?'flow':'freeform';
    if(target===doc.layout?.mode)return;
    if(target==='freeform'){
      const nodes=[...$('id-card').querySelectorAll('[data-block-id]')];
      let highest=300;
      for(const el of nodes){
        const block=blockOf(el.dataset.blockId);if(!block)continue;
        const parent=el.parentElement;
        const pRect=parent.getBoundingClientRect(),r=el.getBoundingClientRect();
        const style=getComputedStyle(parent);
        const left=parseFloat(style.paddingLeft)||0,top=parseFloat(style.paddingTop)||0;
        const innerWidth=Math.max(1,parent.clientWidth-left-(parseFloat(style.paddingRight)||0));
        const x=Math.round(C.clamp((r.left-pRect.left-left)/innerWidth*100,0,95,5));
        const width=Math.round(C.clamp(r.width/innerWidth*100,5,100-x,85));
        const y=Math.round(Math.max(0,r.top-pRect.top-top));
        const h=Math.max(35,Math.ceil(r.height+3));
        block.placement={x,y,w:width,h};highest=Math.max(highest,y+h+50);
      }
      if(doc.importedCardStyle){
        // The imported HTML's box geometry is intentional. Automatic text/image
        // fit may otherwise relocate a block after the first render and ruin
        // the pasted layout. User handles still resize it normally.
        for(const block of doc.blocks){
          if(block.type==='text'){
            const explicitHeight=/(?:^|;)\s*(?:min-)?height\s*:/i.test(block.importedStyle||'');
            block.manualHeight=!!explicitHeight;
          }else block.manualHeight=true;
        }
      }
      doc.layout={...doc.layout,mode:'freeform',autoHeight:doc.layout?.autoHeight!==false,height:Math.min(3000,Math.max(240,highest))};
    }else doc.layout={...doc.layout,mode:'flow'};
    // Preserve positions captured from the real stacked DOM. Re-running the
    // bulk collision arranger here would reorder existing source artwork.
    selectedId=doc.blocks.find(b=>b.id===selectedId)?.id||null;
    renderOutput();showInspector();queueSave();
  }
  function highlightSelected(){
    for(const el of $('id-card').querySelectorAll('[data-block-id]')){
      const isSelected=el.dataset.blockId===selectedId;
      el.classList.toggle('id-selected',isSelected);const layer=blockOf(el.dataset.blockId);el.classList.toggle('id-preview-hidden',!!layer?.hiddenInDesigner);el.classList.toggle('id-preview-locked',!!layer?.locked);
      // Crop mode is a preview-only editor treatment, not exported CSS.
      el.classList.toggle('id-crop-active',isSelected&&cropEditId===selectedId);
      // This is an editor-only overlay, never part of copied HTML or templates.
      for(const control of el.querySelectorAll(':scope > .id-canvas-delete'))control.remove();
      if(!isSelected)continue;
      const button=document.createElement('button');
      button.type='button';button.className='id-canvas-delete';button.textContent='Delete';
      button.title='Delete this element (Delete / Backspace)';
      button.setAttribute('aria-label','Delete selected element from preview');
      button.addEventListener('pointerdown',event=>event.stopPropagation());
      button.addEventListener('mousedown',event=>event.stopPropagation());
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();selectedId=el.dataset.blockId;
        removeLayer();$('id-canvas').focus({preventScroll:true});
        notice('Element deleted from Introduction.');
      });
      el.append(button);
    }
  }
  function moveLayer(id,newIndex){
    const current=blockIndex(id);if(current<0)return;
    newIndex=Math.max(0,Math.min(doc.blocks.length-1,newIndex));if(current===newIndex)return;
    if(isFree()){
      const target=doc.blocks[newIndex],moving=blockOf(id),dest=locationOf(target),before=locationOf(moving);
      const others=doc.blocks.map(b=>({id:b.id,placement:{...locationOf(b)}}));
      const proposed={...before,y:dest.y+(newIndex>current?Math.max(1,dest.h*.55):0)};
      const reflow=L.reorderDrop(others,id,proposed,layoutHeight());
      if(reflow.ok)applyArrangement(reflow);
      else{
        // Fallback: preserve every block's size and follow the requested
        // navigator order with a safe, nonoverlapping vertical arrangement.
        const ordered=doc.blocks.slice(),[targetBlock]=ordered.splice(current,1);
        ordered.splice(newIndex,0,targetBlock);
        let y=Math.min(...ordered.map(b=>locationOf(b).y));
        for(const b of ordered){const p=locationOf(b);b.placement={...p,y};y+=p.h+L.DEFAULT_GAP;}
        doc.blocks=ordered;
      }
    }else{const [b]=doc.blocks.splice(current,1);doc.blocks.splice(newIndex,0,b);}
    synchronizeStructure();renderOutput();showInspector();queueSave();
  }
  function collapseAfterDelete(removed){
    if(!isFree()||!removed)return;
    const oldBottom=removed.y+removed.h;
    const shift=removed.h+L.DEFAULT_GAP;
    const others=doc.blocks.map(b=>({block:b,place:{...locationOf(b)}}));
    const shifted=new Set(others.filter(x=>x.place.y>=oldBottom-1).map(x=>x.block.id));
    // Preserve staggered columns; move only blocks BELOW the deleted row.
    const ordered=others.filter(x=>shifted.has(x.block.id)).sort((a,b)=>a.place.y-b.place.y||a.place.x-b.place.x);
    for(const item of ordered){
      const old=item.place;let y=Math.max(0,old.y-shift);
      // Refuse to move through objects still occupying the target lane.
      for(let n=0;n<others.length+1;n++){
        const clash=others.find(peer=>peer!==item && L.overlap({...old,y},peer.place,0,0));
        if(!clash)break;
        const candidate=clash.place.y+clash.place.h+L.DEFAULT_GAP;
        if(candidate<=y||candidate>=old.y){y=old.y;break;}
        y=candidate;
      }
      item.place={...old,y};item.block.placement={...old,y};
    }
    doc.layout.height=layoutHeight();
  }
  function removeLayer(){
    if(!selectedId)return;const i=blockIndex(selectedId);if(i<0)return;
    const removed=isFree()?{...locationOf(doc.blocks[i])}:null;
    if(cropEditId===selectedId)cropEditId=null;
    doc.blocks.splice(i,1);selectedId=null;selectedFrameId=null;
    collapseAfterDelete(removed);
    synchronizeStructure();renderOutput();showInspector();queueSave();
  }
  function layerName(block){const label=palette[block.type]?.[1]||block.type;const value=(block.type==='columns'?(block.left||''):(block.text||block.alt||'')).replace(/\s+/g,' ').trim();return block.customName||`${label}${value?' · '+value.slice(0,23):''}`;}
  function renderLayers(){
    const el=$('id-layers'),scrollTop=el.scrollTop;el.replaceChildren();
    if(doc.mode==='source'){el.textContent='Source HTML mode: paste HTML and select Use pasted HTML to create editable layers.';return;}
    const frames=frameList();
    for(const frame of frames){
      const row=document.createElement('div');row.className='id-structure-frame';
      row.style.marginLeft=`${Math.min(42,frames.indexOf(frame)*9)}px`;row.classList.toggle('active',selectedFrameId===frame.id);
      row.textContent='▣ '+(frame.name||'Border frame');
      const sub=document.createElement('span');sub.textContent='Nested frame · Select to edit background, borders and shadows';row.append(sub);
      row.dataset.frameId=frame.id;row.title='Select nested border frame';
      row.onclick=()=>selectFrame(frame.id);el.append(row);
    }
    const holder=document.createElement('div');holder.className=frames.length?'id-structure-nested':'id-structure-root';el.append(holder);
    doc.blocks.forEach((block,i)=>{
      const row=document.createElement('div');row.className='id-layer'+(selectedId===block.id?' active':'')+(block.hiddenInDesigner?' id-layer-hidden':'')+(block.locked?' id-layer-locked':'');
      row.setAttribute('role','listitem');row.draggable=true;row.dataset.id=block.id;
      row.innerHTML=`<span class="id-handle" aria-hidden="true">⠿</span><button type="button" class="id-layer-label" title="Select or double-click to rename">${escape(layerName(block))}</button><button type="button" class="id-layer-visibility" aria-label="${block.hiddenInDesigner?'Show':'Hide'} layer in editor" title="${block.hiddenInDesigner?'Show':'Hide'} in editor">${block.hiddenInDesigner?'◌':'◉'}</button><button type="button" class="id-layer-lock" title="${block.locked?'Unlock':'Lock'} layer">${block.locked?'🔒':'♧'}</button><button type="button" class="id-layer-remove" title="Delete layer">×</button>`;
      row.querySelector('.id-layer-label').onclick=()=>selectLayer(block.id);
      row.querySelector('.id-layer-label').ondblclick=(e)=>{
        e.stopPropagation();const old=row.querySelector('.id-layer-label');const input=document.createElement('input');
        input.type='text';input.value=block.customName||layerName(block);input.maxLength=70;input.className='id-layer-rename';
        old.replaceWith(input);input.focus();input.select();
        let done=false;const finish=(save)=>{if(done)return;done=true;if(save){block.customName=input.value.trim();queueSave();}renderLayers();showInspector();};
        input.addEventListener('keydown',ev=>{if(ev.key==='Enter')finish(true);if(ev.key==='Escape')finish(false);});
        input.addEventListener('blur',()=>finish(true),{once:true});
      };
      row.querySelector('.id-layer-remove').onclick=()=>{selectedId=block.id;removeLayer();};
      row.querySelector('.id-layer-visibility').onclick=()=>{block.hiddenInDesigner=!block.hiddenInDesigner;renderLayers();highlightSelected();queueSave();};
      row.querySelector('.id-layer-lock').onclick=()=>{block.locked=!block.locked;renderLayers();highlightSelected();if(selectedId===block.id)showInspector();queueSave();};
      row.addEventListener('dragstart',e=>{draggedId=block.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',block.id);e.dataTransfer.setData('application/x-intro-layer',block.id);});
      row.addEventListener('dragover',e=>{e.preventDefault();row.classList.add('drag-over');e.dataTransfer.dropEffect='move';});
      row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
      row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('drag-over');const id=draggedId||e.dataTransfer.getData('text/plain');if(id&&id!==block.id)moveLayer(id,blockIndex(block.id));draggedId=null;});
      row.addEventListener('dragend',()=>{draggedId=null;document.querySelectorAll('.id-layer.drag-over').forEach(x=>x.classList.remove('drag-over'));});
      holder.append(row);
    });
    el.scrollTop=scrollTop;
  }
  // Every visible slider has a typeable number beside it. The number's
  // min/max/step mirror the slider, so decimals (for example 0.75 or 1.65)
  // round to the same precise step. A typed change dispatches the *original*
  // slider input event, preserving all existing theme/block/frame bindings.
  function addRangeNumbers(root=document){
    for(const slider of root.querySelectorAll('input[type="range"]:not([data-number-paired])')){
      const parent=slider.parentNode;if(!parent)continue;
      const pair=document.createElement('span');pair.className='id-range-pair';
      parent.insertBefore(pair,slider);pair.appendChild(slider);
      const number=document.createElement('input');number.type='number';number.className='id-range-number';
      number.min=slider.min||'0';number.max=slider.max||'100';
      number.step=slider.step&&slider.step!=='any'?slider.step:'1';
      const label=slider.closest('label');
      const labelText=label?[...label.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join(' ').trim():'';
      number.setAttribute('aria-label',`${labelText||slider.id||'Slider'} value`);
      number.title=`Enter a number from ${number.min} to ${number.max} (step ${number.step})`;
      number.value=slider.value;
      pair.append(number);slider.dataset.numberPaired='true';
      slider.addEventListener('input',()=>{
        // Do not replace partial user typing while the number field has focus.
        if(document.activeElement!==number)number.value=slider.value;
        number.disabled=slider.disabled;
      });
      // Keep invalid or partially-entered numbers in the field until commit;
      // never put NaN or unfinished input into the Introduction design.
      const commit=final=>{
        const entered=number.value.trim();
        if(!entered||number.validity.badInput||!Number.isFinite(Number(entered))){
          if(final)number.value=slider.value;
          return;
        }
        const value=Number(entered),min=Number(number.min),max=Number(number.max);
        if(!final&&(value<min||value>max))return;
        // Native range clamps and snaps values to its declared step.
        slider.value=String(Math.max(min,Math.min(max,value)));
        if(final)number.value=slider.value;
        slider.dispatchEvent(new Event('input',{bubbles:true}));
      };
      number.addEventListener('input',()=>commit(false));
      number.addEventListener('change',()=>commit(true));
      number.addEventListener('blur',()=>commit(true));
    }
  }
  function styleInput(id,val){
    const el=$(id);if(!el)return;
    if(el.type==='checkbox')el.checked=!!val;
    else el.value=val==null?'':val;
    if(el.type==='range'){
      const number=el.parentElement?.querySelector('.id-range-number');
      if(number)number.value=el.value;
    }
  }
  function showInspector(){const block=blockOf(selectedId),have=!!block&&doc.mode!=='source';$('id-element-form').hidden=!have;$('id-none-selected').hidden=have;$('id-selected-name').textContent=have?layerName(block):'Select an element';if(!have)return;
    const b=block;
    $('id-position-editor').hidden=!isFree();
    $('id-text-height-wrap').hidden=!isFree()||block.type!=='text';
    if(block.type==='text')$('id-text-height-mode').value=block.manualHeight?'fixed':'auto';
    if(isFree()){
      const p=locationOf(b);
      for(const [name,val] of Object.entries(p))styleInput('id-pos-'+name,val);
      $('id-pos-w').max=100-p.x;
      $('id-pos-y').max=Math.max(0,layoutHeight()-p.h);
    }
    for(const [key,input] of [['text','id-block-text'],['left','id-block-left'],['right','id-block-right'],['url','id-block-url'],['alt','id-block-alt'],['imageWidth','id-block-imagewidth'],['height','id-block-height'],['font','id-block-font'],['size','id-block-size'],['align','id-block-align'],['weight','id-block-weight'],['line','id-block-line'],['padding','id-block-padding'],['margin','id-block-margin'],['spacing','id-block-spacing'],['background','id-block-background'],['bgColor','id-block-bgcolor'],['borderOn','id-block-borderon'],['borderColor','id-block-bordercolor'],['borderWidth','id-block-borderwidth'],['borderStyle','id-block-borderstyle'],['radius','id-block-radius'],['glow','id-block-glow'],['glowColor','id-block-glowcolor'],['glowOpacity','id-block-glowopacity'],['glow2','id-block-glow2'],['glowColor2','id-block-glowcolor2'],['glowOpacity2','id-block-glowopacity2'],['shadow','id-block-shadow'],['ordered','id-block-ordered']])styleInput(input, b[key]??(key==='glowColor'?doc.theme.accent:key==='glowColor2'?doc.theme.border:key==='borderStyle'?'solid':key==='borderWidth'?1:key==='glowOpacity'?.75:key==='glowOpacity2'?.4:undefined));
    $('id-block-color').value=['text','accent'].includes(b.color)?b.color:'custom';$('id-block-customcolor').hidden=$('id-block-color').value!=='custom';styleInput('id-block-customcolor',color(b.color,'#ffffff'));
    const active=(id,on)=>$(id).hidden=!on;
    if(b.type==='image'){
      updateImageStatus(b.url?(C.safeHttps(b.url)?'Image preview refreshes automatically, without moving this layer.':'Enter a complete HTTPS image URL.'):'Paste an HTTPS image URL.');
      const v=(b.ratio&&b.ratio!=='auto')?b.ratio:'original';
      const options=['original','1 / 1','3 / 4','4 / 3','9 / 16','16 / 9'];
      $('id-block-ratio').value=options.includes(v)?v:'custom';
      $('id-ratio-custom').hidden=$('id-block-ratio').value!=='custom';
      $('id-ratio-custom').value=$('id-block-ratio').value==='custom'?v:'';
      showImageDimensions(b);
    }
    const textTypes=['heading','text','label','quote','columns','list','link','custom'];
    const hasTypography=textTypes.includes(b.type);
    for(const id of ['id-block-font','id-block-size','id-block-align','id-block-weight','id-block-color','id-block-line','id-block-spacing']){
      const wrap=$(id).closest('label');if(wrap)wrap.hidden=!hasTypography;
    }
    $('id-block-customcolor').hidden=!hasTypography||$('id-block-color').value!=='custom';
    styleInput('id-layer-custom-name',b.customName||'');
    styleInput('id-layer-visible',!b.hiddenInDesigner);
    styleInput('id-layer-locked',!!b.locked);
    styleInput('id-block-inline-css',b.importedStyle||'');
    setPropertyTab(propertyTab);
    const effects=$('id-element-form').querySelector('.id-effect-section');if(effects)effects.hidden=!hasTypography;
    active('id-divider-controls',b.type==='divider');
    if(b.type==='divider'){
      styleInput('id-divider-symbol',b.text??'✦');
      styleInput('id-divider-color',color(b.dividerColor,doc.theme.border));
      styleInput('id-divider-thickness',b.dividerThickness??1);
      styleInput('id-divider-gap',b.dividerGap??10);
      styleInput('id-divider-url',b.dividerUrl||'');
      styleInput('id-divider-mode',b.dividerImageMode||'replace');
      styleInput('id-divider-imagewidth',b.dividerImageWidth??100);
      $('id-divider-url-status').textContent=b.dividerUrl?'Image preview updates as you type.':'Paste a direct HTTPS image URL to replace this divider.';
    }
    active('id-crop-controls',canCrop(b));
    if(canCrop(b)){
      const c=normalizedCrop(b);
      for(const [id,val] of [['id-crop-zoom',c.zoom],['id-crop-focus-x',c.focusX],['id-crop-focus-y',c.focusY]])styleInput(id,val);
    } else if(cropEditId===b.id)cropEditId=null;
    refreshCropUI();
    active('id-text-wrap',editable.includes(b.type)&&b.type!=='divider');active('id-left-wrap',b.type==='columns');active('id-right-wrap',b.type==='columns');active('id-url-wrap',['image','link'].includes(b.type));active('id-alt-wrap',b.type==='image');active('id-ratio-wrap',b.type==='image');active('id-imagewidth-wrap',b.type==='image');active('id-spacer-wrap',b.type==='spacer');active('id-ordered-wrap',b.type==='list');
  }
  function populateTheme(){for(const [key,id] of [['background','id-theme-bg'],['surface','id-theme-surface'],['text','id-theme-text'],['accent','id-theme-accent'],['border','id-theme-border'],['gradient','id-theme-gradient'],['gradientAngle','id-theme-angle'],['font','id-theme-font'],['maxWidth','id-theme-width'],['padding','id-theme-padding'],['borderWidth','id-theme-borderwidth'],['borderStyle','id-theme-borderstyle'],['radius','id-theme-radius'],['shadow','id-theme-shadow'],['align','id-theme-align']])styleInput(id,doc.theme?.[key]);}
  function frameList(){
    if(!Array.isArray(doc.theme.frames))doc.theme.frames=[];
    return doc.theme.frames;
  }
  function renderFrames(){
    const frames=frameList(),parent=$('id-frame-list');parent.replaceChildren();
    $('id-frame-add').disabled=frames.length>=8;
    if(!frames.length){const note=document.createElement('p');note.className='id-hint';note.textContent='No extra frames yet. Add a border layer or start with the triple-frame example.';parent.append(note);return;}
    frames.forEach((frame,i)=>{
      const box=document.createElement('details');box.className='id-frame-item';box.open=frame._open!==false;
      box.innerHTML=`<summary><strong>${escape(frame.name||`Frame ${i+1}`)}</strong><span>Layer ${i+1} / ${frames.length} · ${i?'inside':'outermost'}</span></summary>
      <div class="id-frame-controls">
        <label>Layer name<input data-frame-index="${i}" data-field="name" type="text" maxlength="60" value="${escape(frame.name||`Frame ${i+1}`)}"></label>
        <label style="display:block">Advanced inline CSS (imported)<textarea data-frame-index="${i}" data-field="importedStyle" rows="4" spellcheck="false" style="width:100%;min-height:75px;resize:vertical;font:11px/1.5 Consolas,monospace">${escape(frame.importedStyle||'')}</textarea></label>
        <label>Background<input data-frame-index="${i}" data-field="background" type="color" value="${C.cleanColor(frame.background,'#171120')}"></label>
        <label>Transparent background<input data-frame-index="${i}" data-field="transparentBg" type="checkbox" ${frame.transparentBg?'checked':''}></label>
        <label>Border color<input data-frame-index="${i}" data-field="borderColor" type="color" value="${C.cleanColor(frame.borderColor,'#b778cb')}"></label>
        <label>Border thickness (px)<input data-frame-index="${i}" data-field="borderWidth" type="number" min="0" max="20" value="${C.clamp(frame.borderWidth,0,20,2)}"></label>
        <label>Border style<select data-frame-index="${i}" data-field="borderStyle">${['solid','double','dashed','dotted','none'].map(x=>`<option value="${x}" ${frame.borderStyle===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></label>
        <label>Roundness (px)<input data-frame-index="${i}" data-field="radius" type="number" min="0" max="100" value="${C.clamp(frame.radius,0,100,14)}"></label>
        <label>Inside padding (px)<input data-frame-index="${i}" data-field="padding" type="number" min="0" max="90" value="${C.clamp(frame.padding,0,90,4)}"></label>
        <label>Shadow / glow type<select data-frame-index="${i}" data-field="shadowMode">${[['none','None'],['outer','Outer glow'],['inner','Inset shadows'],['both','Both']].map(([val,text])=>`<option value="${val}" ${frame.shadowMode===val?'selected':''}>${text}</option>`).join('')}</select></label>
        <label>Outer glow color<input data-frame-index="${i}" data-field="shadowColor" type="color" value="${C.cleanColor(frame.shadowColor,'#b778cb')}"></label>
        <label>Outer glow blur<input data-frame-index="${i}" data-field="shadowBlur" type="number" min="0" max="80" value="${C.clamp(frame.shadowBlur,0,80,16)}"></label>
        <label>Outer intensity<input data-frame-index="${i}" data-field="shadowOpacity" type="range" min="0" max="1" step=".05" value="${C.clamp(frame.shadowOpacity,0,1,.45)}"></label>
        <label>Inset shadow color<input data-frame-index="${i}" data-field="innerShadowColor" type="color" value="${C.cleanColor(frame.innerShadowColor,'#000000')}"></label>
        <label>Inset shadow blur<input data-frame-index="${i}" data-field="innerShadowBlur" type="number" min="0" max="80" value="${C.clamp(frame.innerShadowBlur,0,80,18)}"></label>
        <label>Inset intensity<input data-frame-index="${i}" data-field="innerShadowOpacity" type="range" min="0" max="1" step=".05" value="${C.clamp(frame.innerShadowOpacity,0,1,.7)}"></label>
        <label>Second inset color<input data-frame-index="${i}" data-field="innerAccentColor" type="color" value="${C.cleanColor(frame.innerAccentColor,'#b778cb')}"></label>
        <label>Second inset blur<input data-frame-index="${i}" data-field="innerAccentBlur" type="number" min="0" max="80" value="${C.clamp(frame.innerAccentBlur,0,80,36)}"></label>
        <label>Second inset intensity<input data-frame-index="${i}" data-field="innerAccentOpacity" type="range" min="0" max="1" step=".05" value="${C.clamp(frame.innerAccentOpacity,0,1,0)}"></label>
        <div class="id-frame-buttons"><button data-frame-action="up" data-frame-index="${i}" ${i===0?'disabled':''} type="button">↑ Outer</button><button data-frame-action="down" data-frame-index="${i}" ${i===frames.length-1?'disabled':''} type="button">↓ Inner</button><button data-frame-action="delete" data-frame-index="${i}" class="id-danger" type="button">Remove</button></div>
      </div>`;
      box.addEventListener('toggle',()=>{frame._open=box.open;});
      parent.append(box);
    });
    // Frame controls are regenerated whenever a border layer is added or moved.
    addRangeNumbers(parent);
  }
  function bindFrames(){
    $('id-frame-add').addEventListener('click',()=>{
      const frames=frameList();if(frames.length>=8)return notice('A maximum of eight nested frames is supported.',true);
      const f=C.newFrame('frame-'+Date.now());f.name=`Border Frame ${frames.length+1}`;
      f.borderColor=doc.theme.border;f.background=doc.theme.background;f.shadowColor=doc.theme.accent;
      frames.push(f);renderFrames();renderOutput();queueSave();
    });
    $('id-frame-preset').addEventListener('click',()=>{
      const frames=frameList();
      if(frames.length&&!confirm('Replace your current border frame layers with a new triple frame?'))return;
      const b=C.newFrame('outer'),m=C.newFrame('middle'),inner=C.newFrame('inner');
      Object.assign(b,{name:'Outer accent edge',background:doc.theme.accent,borderWidth:0,padding:2,radius:12,shadowMode:'outer',shadowColor:doc.theme.accent,shadowBlur:12,shadowOpacity:.3});
      Object.assign(m,{name:'Dark separation',background:doc.theme.background,borderWidth:0,padding:4,radius:10});
      Object.assign(inner,{name:'Inner border and glow',background:doc.theme.surface,borderColor:doc.theme.border,borderWidth:1,padding:10,radius:8,shadowMode:'inner',innerShadowColor:'#000000',innerShadowBlur:22,innerShadowOpacity:.85,innerAccentColor:doc.theme.accent,innerAccentBlur:45,innerAccentOpacity:.15});
      doc.theme.frames=[b,m,inner];renderFrames();renderOutput();queueSave();
    });
    const list=$('id-frame-list');
    list.addEventListener('input',e=>{
      const el=e.target,field=el.dataset.field,index=Number(el.dataset.frameIndex),frame=frameList()[index];
      if(!frame||!field)return;
      const value=el.type==='checkbox'?el.checked:el.type==='number'||el.type==='range'?Number(el.value):el.value;
      frame[field]=field==='importedStyle'?sanitizeInlineStyles(value):value;if(field!=='importedStyle')updateImportedFrameStyle(frame,field,value);
      if(field==='name')el.closest('details')?.querySelector('summary strong')?.replaceChildren(document.createTextNode(value||`Frame ${index+1}`));
      renderOutput();queueSave();
    });
    list.addEventListener('change',e=>{if(e.target.matches('select')){renderOutput();queueSave();}});
    list.addEventListener('click',e=>{
      const b=e.target.closest('button[data-frame-action]');if(!b)return;
      const frames=frameList(),i=Number(b.dataset.frameIndex),what=b.dataset.frameAction;
      if(!frames[i])return;
      if(what==='delete')frames.splice(i,1);
      if(what==='up'&&i>0)[frames[i],frames[i-1]]=[frames[i-1],frames[i]];
      if(what==='down'&&i<frames.length-1)[frames[i],frames[i+1]]=[frames[i+1],frames[i]];
      renderFrames();renderOutput();queueSave();
    });
  }
  function bindTheme(){for(const [key,id] of [['background','id-theme-bg'],['surface','id-theme-surface'],['text','id-theme-text'],['accent','id-theme-accent'],['border','id-theme-border'],['gradient','id-theme-gradient'],['gradientAngle','id-theme-angle'],['font','id-theme-font'],['maxWidth','id-theme-width'],['padding','id-theme-padding'],['borderWidth','id-theme-borderwidth'],['borderStyle','id-theme-borderstyle'],['radius','id-theme-radius'],['shadow','id-theme-shadow'],['align','id-theme-align']]){
    const el=$(id);el.addEventListener('input',()=>{doc.theme[key]=el.type==='checkbox'?el.checked:el.type==='range'||el.type==='number'?Number(el.value):el.value;
      if(doc.importedCardStyle){
        doc.cardStyleOverrides||={};const css=doc.cardStyleOverrides,v=doc.theme[key];
        const map={background:'background',text:'color',font:'font-family',border:'border-color',
          borderWidth:'border-width',borderStyle:'border-style',radius:'border-radius',
          padding:'padding',maxWidth:'max-width',align:'text-align'};
        if(map[key])css[map[key]]=['borderWidth','radius','padding','maxWidth'].includes(key)?Number(v)+'px':v;
      }
      renderOutput();queueSave();});
  }}
  function bindElement(){
    for(const button of document.querySelectorAll('[data-prop-target]'))button.onclick=()=>setPropertyTab(button.dataset.propTarget);
    // Assign each existing field to its editor panel without losing the
    // element-type visibility logic used by images, dividers, links, etc.
    const grouped={
      advanced:['id-position-editor','id-text-height-wrap','id-layer-metadata','id-block-css-section'],
      content:['id-text-wrap','id-left-wrap','id-right-wrap','id-url-wrap','id-alt-wrap','id-ratio-wrap','id-imagewidth-wrap','id-crop-controls','id-divider-controls','id-spacer-wrap','id-ordered-wrap'],
      style:['id-block-font','id-block-size','id-block-align','id-block-weight','id-block-color','id-block-line','id-block-padding','id-block-margin','id-block-spacing','id-block-background','id-block-bgcolor','id-block-borderon','id-block-bordercolor','id-block-borderwidth','id-block-borderstyle','id-block-radius','id-block-glow','id-block-glowcolor','id-block-glowopacity','id-block-glow2','id-block-glowcolor2','id-block-glowopacity2','id-block-shadow']
    };
    for(const [group,ids] of Object.entries(grouped))for(const id of ids){
      const node=$(id);if(!node)continue;
      const parent=node.matches('fieldset, label')?node:node.closest('label')||node.closest('details');
      if(parent&&parent.id!=='id-element-form')parent.dataset.propGroup=group;
    }
    const effects=$('id-element-form').querySelector('.id-effect-section');if(effects)effects.dataset.propGroup='style';
    $('id-layer-custom-name').oninput=e=>changeSelected(b=>{b.customName=e.target.value;});
    $('id-layer-visible').onchange=e=>changeSelected(b=>{b.hiddenInDesigner=!e.target.checked;});
    $('id-layer-locked').onchange=e=>changeSelected(b=>{b.locked=e.target.checked;});
    $('id-block-inline-css').oninput=e=>changeSelected(b=>{b.importedStyle=sanitizeInlineStyles(e.target.value);b.styleOverrides={};});
    $('id-text-height-mode').onchange=e=>{
      const b=blockOf(selectedId);if(!b||b.type!=='text')return;
      b.manualHeight=e.target.value==='fixed';
      renderOutput();showInspector();queueSave();
    };
    setPropertyTab(propertyTab);
    for(const [key,id] of [['text','id-block-text'],['left','id-block-left'],['right','id-block-right'],['url','id-block-url'],['alt','id-block-alt'],['imageWidth','id-block-imagewidth'],['height','id-block-height'],['font','id-block-font'],['size','id-block-size'],['align','id-block-align'],['weight','id-block-weight'],['line','id-block-line'],['padding','id-block-padding'],['margin','id-block-margin'],['spacing','id-block-spacing'],['background','id-block-background'],['bgColor','id-block-bgcolor'],['borderOn','id-block-borderon'],['borderColor','id-block-bordercolor'],['borderWidth','id-block-borderwidth'],['borderStyle','id-block-borderstyle'],['radius','id-block-radius'],['glow','id-block-glow'],['glowColor','id-block-glowcolor'],['glowOpacity','id-block-glowopacity'],['glow2','id-block-glow2'],['glowColor2','id-block-glowcolor2'],['glowOpacity2','id-block-glowopacity2'],['shadow','id-block-shadow'],['ordered','id-block-ordered']]){
      const el=$(id);el.addEventListener('input',()=>{
        const value=el.type==='checkbox'?el.checked:['range','number'].includes(el.type)?Number(el.value):el.value;
        changeSelected(b=>{
          b[key]=value;
          if(key==='url'&&b.type==='image'){
            // Image replacement MUST NOT change x/y/w/h or reorder other layers.
            b.manualHeight=true;
            imageDimensions.delete(b.id);
          }
          updateImportedBlockStyle(b,key,value);
        },key==='url');
        if(key==='url'){
          const selected=blockOf(selectedId);
          if(selected?.type==='image')updateImageStatus(!value.trim()?'Paste an HTTPS image URL. The preview updates as soon as it is valid.':C.safeHttps(value)?'Loading image preview…':'Enter a complete HTTPS image URL.',C.safeHttps(value)?'loading':'error');
        }
      });
    }
    function applyExplicitAspect(raw){
      const block=blockOf(selectedId);if(!block||block.type!=='image')return;
      const value=raw==='original'?'original':String(raw||'').trim();
      if(value!=='original'&&!/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(value))return;
      const parts=value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
      if(parts&&(Number(parts[1])===0||Number(parts[2])===0))return;
      block.ratio=value;block.fit=value==='original'?'contain':'cover';block.manualHeight=true;
      if(block.importedImageStyle){
        // Editing an imported image's ratio must update its actual authored CSS.
        block.imageStyleOverrides||={};
        block.imageStyleOverrides['aspect-ratio']=value==='original'?'auto':value;
        block.imageStyleOverrides['object-fit']=block.fit;
      }
      if(isFree()&&parts){
        const before=doc.blocks.map(b=>({id:b.id,placement:{...locationOf(b)}}));
        const stage=$('id-card').querySelector('[data-intro-free-stage]');
        const width=(stage?.clientWidth||Math.max(100,$('id-canvas').clientWidth-48))*(locationOf(block).w/100);
        const aspect=Number(parts[1])/Number(parts[2]);
        const desired=Math.max(24,Math.min(1200,Math.round(width/aspect)));
        const old=locationOf(block);
        if(desired!==old.h){
          const result=L.makeRoom(before,block.id,{...old,h:desired},layoutHeight());
          if(result.ok)applyArrangement(result);
        }
      }
      renderOutput();showInspector();renderLayers();queueSave();
    }
    $('id-block-ratio').addEventListener('change',e=>{
      const v=e.target.value;
      $('id-ratio-custom').hidden=v!=='custom';
      if(v==='custom'){$('id-ratio-custom').focus();return;}
      applyExplicitAspect(v);
    });
    $('id-ratio-custom').addEventListener('change',e=>{
      const raw=e.target.value;
      if(!/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(raw))return notice('Use a ratio such as 2 / 3.',true);
      applyExplicitAspect(raw);
    });
    $('id-block-color').onchange=e=>{const pick=e.target.value;$('id-block-customcolor').hidden=pick!=='custom';changeSelected(b=>{b.color=pick==='custom'?'#ffffff':pick;updateImportedBlockStyle(b,'color',b.color);});};
    $('id-block-customcolor').oninput=e=>changeSelected(b=>{b.color=e.target.value;updateImportedBlockStyle(b,'color',b.color);});
    $('id-block-up').onclick=()=>{const i=blockIndex(selectedId);if(i>0)moveLayer(selectedId,i-1);};
    $('id-block-down').onclick=()=>{const i=blockIndex(selectedId);if(i<doc.blocks.length-1)moveLayer(selectedId,i+1);};
    $('id-block-duplicate').onclick=()=>{const i=blockIndex(selectedId),b=blockOf(selectedId);if(!b)return;const copy=clone(b);copy.id='layer-'+Math.random().toString(36).slice(2,12);doc.blocks.splice(i+1,0,copy);selectedId=copy.id;if(isFree()){const p=locationOf(copy);smartPlace(copy.id,{...p,y:p.y+L.DEFAULT_GAP},{snap:false,collision:'avoid'});}renderLayers();renderOutput();showInspector();queueSave();};
    $('id-block-delete').onclick=removeLayer;
    $('id-crop-toggle').onclick=()=>{
      const b=blockOf(selectedId);if(!canCrop(b))return notice('Select an image or a divider with a valid HTTPS image URL first.',true);
      if(!isFree())switchLayout('freeform');ensureCrop(b);cropEditId=b.id;
      renderOutput();showInspector();queueSave();
      $('id-canvas').focus({preventScroll:true});notice('Crop mode: drag the image to position it inside its frame. Scroll to zoom.');
    };
    $('id-crop-done').onclick=()=>{cropEditId=null;renderOutput();showInspector();queueSave();notice('Crop saved. It will appear in the copied Introduction.');};
    $('id-crop-reset').onclick=()=>{const b=blockOf(selectedId);if(!b)return;b.crop={enabled:false};cropEditId=null;b.manualHeight=false;renderOutput();showInspector();queueSave();notice('Original image restored.');};
    for(const [id,field] of [['id-crop-zoom','zoom'],['id-crop-focus-x','focusX'],['id-crop-focus-y','focusY']]){
      $(id).addEventListener('input',e=>{const b=blockOf(selectedId);if(!canCrop(b))return;
        const c=ensureCrop(b);c[field]=Number(e.target.value);renderOutput();queueSave();
      });
    }
    for(const [id,field] of [['id-divider-symbol','text'],['id-divider-color','dividerColor'],['id-divider-thickness','dividerThickness'],['id-divider-gap','dividerGap'],['id-divider-url','dividerUrl'],['id-divider-mode','dividerImageMode'],['id-divider-imagewidth','dividerImageWidth']]){
      $(id).addEventListener('input',e=>changeSelected(b=>{
        if(b.type!=='divider')return;
        b[field]=['dividerThickness','dividerGap','dividerImageWidth'].includes(field)?Number(e.target.value):e.target.value;
      },field==='dividerUrl'));
    }
    for(const [field,input] of [['x','id-pos-x'],['y','id-pos-y'],['w','id-pos-w'],['h','id-pos-h']]){
      $(input).addEventListener('change',e=>{
        if(!isFree())return;
        const b=blockOf(selectedId);if(!b)return;
        // Capture the OLD placement before applying the numeric edit. This is
        // essential for direction-aware reorder, which fills the vacated slot.
        const next=locationOf(b);next[field]=Number(e.target.value);
        if(field==='x')next.w=Math.min(next.w,100-next.x);
        if(field==='w')next.x=Math.min(next.x,100-next.w);
        if(field==='h')next.y=Math.min(next.y,layoutHeight()-Math.min(layoutHeight(),next.h));
        if(smartPlace(b.id,C.placementOf({placement:next},layoutHeight()),
          {snap:false,action:['w','h'].includes(field)?'resize':'move'})){
          if(field==='h')b.manualHeight=true;
          synchronizeStructure();renderOutput();queueSave();
        }
        showInspector();
      });
    }
  }
  // Parse imported HTML into a safe, static subset of JuicyChat's guide. No
  // scripts, event handlers, frames, base tags, linked CSS, or unsafe URLs.
  function sanitizeHtml(source){
    if(typeof DOMParser==='undefined')return '';
    const parsed=new DOMParser().parseFromString('<div id="id-import-root">'+String(source||'')+'</div>','text/html');
    const body=parsed.querySelector('#id-import-root');if(!body)return '';
    const dropped=['script','style','iframe','object','embed','link','meta','base','form','input','button','textarea','select','video','audio','canvas','svg','math','template','noscript'];
    function clean(node){
      if(node.nodeType===Node.TEXT_NODE)return escape(node.nodeValue||'');
      if(node.nodeType!==Node.ELEMENT_NODE)return '';
      const tag=node.tagName.toLowerCase();if(dropped.includes(tag))return '';
      const content=[...node.childNodes].map(clean).join('');
      if(!C.TAGS.has(tag))return content;
      const attrs=[];
      if(tag==='img'){
        const url=C.safeHttps(node.getAttribute('src'));if(!url)return '';
        attrs.push(`src="${escape(url)}"`, `alt="${escape(node.getAttribute('alt')||'Image')}"`);
      }
      if(tag==='a'){
        const url=C.safeHttps(node.getAttribute('href'));if(url)attrs.push(`href="${escape(url)}"`);
      }
      const styles=[];
      // Read the AUTHOR'S inline declarations, not CSSOM-expanded properties.
      // Browsers expand border/radius/padding shorthand into dozens of longhand
      // rules; this previously dropped borders and rounded corners on import.
      for(const part of String(node.getAttribute('style')||'').split(';')){
        const i=part.indexOf(':');if(i<1)continue;
        const property=part.slice(0,i).trim().toLowerCase(),val=C.safeCss(property,part.slice(i+1).trim());
        if(val)styles.push(`${property}: ${val}`);
      }
      if(styles.length)attrs.push(`style="${escape(styles.join(';'))}"`);
      const attr=attrs.length?' '+attrs.join(' '):'';
      if(['br','hr','img'].includes(tag))return `<${tag}${attr}>`;
      return `<${tag}${attr}>${content}</${tag}>`;
    }
    return [...body.childNodes].map(clean).join('');
  }
  function importedHex(value,fallback='#ffffff'){
    const raw=String(value||'').trim();
    if(/^#[0-9a-f]{3,8}$/i.test(raw)){
      if(raw.length===4)return '#'+[...raw.slice(1)].map(c=>c+c).join('');
      return raw.slice(0,7);
    }
    const rgb=raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if(rgb)return '#'+rgb.slice(1,4).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
    const node=document.createElement('span');node.style.color=raw;
    if(node.style.color&&node.style.color!==raw)return importedHex(node.style.color,fallback);
    return fallback;
  }
  const numericStyle=(v,fallback)=>{const n=parseFloat(String(v||''));return Number.isFinite(n)?n:fallback;};
  function fromCssToBlock(block,node){
    const st=node.style;
    if(!node.getAttribute('style'))return;
    block.size=numericStyle(st.fontSize,block.size);
    block.weight=numericStyle(st.fontWeight,block.weight);
    if(st.fontWeight==='bold')block.weight=700;
    if(st.textAlign)block.align=st.textAlign;
    if(st.color)block.color=importedHex(st.color,'#ffffff');
    if(st.fontFamily)block.font=st.fontFamily;
    block.line=numericStyle(st.lineHeight,block.line);
    block.spacing=numericStyle(st.letterSpacing,block.spacing);
    block.padding=numericStyle(st.paddingTop||st.padding,0);
    block.margin=numericStyle(st.marginTop||st.margin,0);
    if(st.backgroundColor||st.background){
      block.background=true;block.bgColor=importedHex(st.backgroundColor||st.background,block.bgColor);
    }
    if(st.borderWidth||st.border){
      block.borderOn=st.borderStyle!=='none';
      block.borderWidth=numericStyle(st.borderWidth,block.borderWidth);
      block.borderColor=importedHex(st.borderColor,block.borderColor);
      block.borderStyle=st.borderStyle||block.borderStyle;
    }
    if(st.borderRadius)block.radius=numericStyle(st.borderRadius,block.radius);
    if(st.textShadow){
      const glows=[...st.textShadow.matchAll(/(?:^|,)\s*(?:[^,]*?)\s(\d+(?:\.\d+)?)px(?:\s|$)/g)];
      block.glow=glows.length?Number(glows[0][1]):5;
      block.glowColor=importedHex(st.color,block.color);
    }
    if(st.boxShadow)block.shadow=numericStyle(st.boxShadow.match(/\d+(?:\.\d+)?px/)?.[0],block.shadow||10);
  }
  function fromCssToFrame(frame,node){
    const st=node.style;
    frame.background=importedHex(st.backgroundColor||st.background,frame.background);
    frame.borderColor=importedHex(st.borderColor,frame.borderColor);
    frame.borderWidth=numericStyle(st.borderWidth,0);
    frame.borderStyle=st.borderStyle||'none';
    frame.padding=numericStyle(st.paddingTop||st.padding,0);
    frame.radius=numericStyle(st.borderRadius,0);
    if(st.boxShadow){
      const inner=st.boxShadow.includes('inset'),outer=st.boxShadow.replace(/\binset\b/gi,'').includes('px');
      frame.shadowMode=inner&&outer?'both':inner?'inner':outer?'outer':'none';
    }
  }
  function sanitizeInlineStyles(source){
    const map=C.parsedStyle(source);
    return Object.entries(map).map(([name,val])=>`${name}: ${val}`).join('; ');
  }
  // Translate existing JuicyChat HTML into editable blocks and NESTED frames.
  // Imported inline CSS is kept in its original form, including border layers,
  // inset shadows, text glow and padding. Editing a property overrides only
  // that property rather than replacing the other imported styling.
  function visualDocumentFromHtml(clean){
    const parsed=new DOMParser().parseFromString('<div id="visual-import-root">'+clean+'</div>','text/html');
    const root=parsed.querySelector('#visual-import-root');
    if(!root)return null;
    const nodes=[...root.childNodes].filter(n=>n.nodeType===Node.ELEMENT_NODE||n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
    if(!nodes.length)return null;
    const next=C.initial();next.blocks=[];next.layout={mode:'flow',height:240,autoHeight:true,autoFitVersion:2};next.mode='visual';
    let contents=nodes,wrappers=[];
    if(nodes.length===1&&nodes[0].nodeType===Node.ELEMENT_NODE){
      let cursor=nodes[0];
      for(let i=0;i<8;i++){
        if(!cursor||cursor.nodeType!==Node.ELEMENT_NODE||cursor.tagName.toLowerCase()!=='div')break;
        const elements=[...cursor.childNodes].filter(n=>n.nodeType===Node.ELEMENT_NODE||n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
        // A styled div containing only text is an editable ELEMENT, not a
        // frame. Treating it as a wrapper discards its typography and borders.
        if(![...cursor.children].length&&cursor.textContent.trim()){
          contents=[cursor];break;
        }
        wrappers.push(cursor);
        if(elements.length!==1||elements[0].nodeType!==Node.ELEMENT_NODE||elements[0].tagName.toLowerCase()!=='div'){
          contents=elements;break;
        }
        cursor=elements[0];
      }
    }
    // Wrappers are authored from outermost to innermost, never flattened.
    // Last wrapper is the canvas card, all other wrappers are border frames.
    if(wrappers.length){
      const card=wrappers[wrappers.length-1];next.importedCardStyle=card.getAttribute('style')||'';
      const st=card.style;
      next.theme.background=importedHex(st.backgroundColor||st.background,next.theme.background);
      next.theme.text=importedHex(st.color,next.theme.text);
      next.theme.border=importedHex(st.borderColor,next.theme.border);
      next.theme.borderWidth=numericStyle(st.borderWidth,next.theme.borderWidth);
      next.theme.radius=numericStyle(st.borderRadius,next.theme.radius);
      next.theme.padding=numericStyle(st.paddingTop||st.padding,next.theme.padding);
      if(st.fontFamily)next.theme.font=st.fontFamily;
      if(st.textAlign)next.theme.align=st.textAlign;
      next.theme.frames=wrappers.slice(0,-1).map((node,i)=>{
        const frame=C.newFrame('imported-frame-'+(i+1));
        frame.name='Imported frame '+(i+1);
        frame.importedStyle=node.getAttribute('style')||'';
        fromCssToFrame(frame,node);
        return frame;
      });
    }
    // Preserve each content node's HTML/tag/inline styling while keeping a
    // draggable/selectable layer and editable text or image URL whenever safe.
    for(const node of contents){
      if(node.nodeType===Node.TEXT_NODE){
        const content=node.textContent.trim();if(!content)continue;
        const block=newBlock('text');block.text=content;next.blocks.push(block);continue;
      }
      const tag=node.tagName.toLowerCase();
      if(tag==='br'||tag==='hr'){const b=newBlock(tag==='br'?'spacer':'divider');if(tag==='br')b.height=16;next.blocks.push(b);continue;}
      const image=tag==='img'?node:node.querySelector('img');
      const hasImageOnly=!!image&&(tag==='img'||node.querySelectorAll('img').length===1&&node.textContent.trim()==='');
      const hasComplexChildren=!hasImageOnly&&[...node.children].some(c=>!['br','span','strong','em','b','i','u','small'].includes(c.tagName.toLowerCase()));
      let type=hasImageOnly?'image':hasComplexChildren?'custom':tag==='blockquote'?'quote':tag==='h3'?'heading':tag==='ul'||tag==='ol'?'list':tag==='a'?'link':'text';
      if(type==='text'&&parseFloat(node.style.fontSize)>=20)type='heading';
      const b=newBlock(type);
      b.importedStyle=node.getAttribute('style')||'';b.importedTag=tag;fromCssToBlock(b,node);
      if(hasImageOnly){
        b.url=image.getAttribute('src')||'';b.alt=image.getAttribute('alt')||'Image';
        b.importedImageStyle=image.getAttribute('style')||'';
        b.ratio=/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(image.style.aspectRatio||'')
          ? image.style.aspectRatio : 'original';
        b.fit=image.style.objectFit==='cover'?'cover':'contain';
        const percent=String(image.style.width||'').match(/^([\d.]+)%$/);
        b.imageWidth=percent?Math.max(20,Math.min(100,Number(percent[1]))):100;
        b.importedTag=null;
      }else if(type==='list'||type==='custom'||node.children.length){
        b.importedInner=node.innerHTML;
        b.text=node.textContent.trim();
      }else b.text=node.textContent||'';
      if(type==='link')b.url=node.getAttribute('href')||'';
      next.blocks.push(b);
    }
    if(!next.blocks.length)return null;
    return next;
  }
  // Override only a deliberately edited setting. Untouched imported CSS is
  // never lost (including RGB borders, text shadows and multi-inset shadows).
  function updateImportedBlockStyle(b,key,value){
    if(!b.importedStyle)return;
    b.styleOverrides ||= {};
    const css=b.styleOverrides;
    const map={font:'font-family',size:'font-size',align:'text-align',weight:'font-weight',line:'line-height',
      padding:'padding',margin:'margin',spacing:'letter-spacing',radius:'border-radius',
      bgColor:'background-color',borderColor:'border-color',borderWidth:'border-width',borderStyle:'border-style'};
    const prop=map[key];
    if(key==='text'){b.importedInner=null;return;}
    if(key==='imageWidth'){b.imageStyleOverrides||={};b.imageStyleOverrides.width=Number(value)+'%';return;}
    if(key==='color')css.color=value==='accent'?doc.theme.accent:value==='text'?doc.theme.text:value;
    else if(key==='background')css.background=value?(b.bgColor||'#251b32'):'transparent';
    else if(key==='borderOn')css.border=value?`${b.borderWidth||1}px ${b.borderStyle||'solid'} ${b.borderColor||'#b778cb'}`:'none';
    else if(key==='glow'||key==='glow2')css['text-shadow']=`0 0 ${Number(b.glow||0)}px ${b.glowColor||doc.theme.accent}, 0 0 ${Number(b.glow2||0)}px ${b.glowColor2||doc.theme.border}`;
    else if(prop)css[prop]=['size','margin','padding','spacing','radius','borderWidth'].includes(key)?Number(value)+'px':String(value);
  }
  function updateImportedFrameStyle(frame,field,value){
    if(!frame.importedStyle)return;
    frame.styleOverrides||={};const p=frame.styleOverrides;
    const map={background:'background',padding:'padding',borderColor:'border-color',borderWidth:'border-width',borderStyle:'border-style',radius:'border-radius'};
    if(field==='transparentBg')p.background=value?'transparent':frame.background;
    else if(map[field])p[map[field]]=['padding','borderWidth','radius'].includes(field)?Number(value)+'px':value;
  }
  function sourceWithSlots(html){const fields=C.SLOTS.reduce((acc,key)=>(acc[key]=String(doc.fields?.[key]??''),acc),{});
    return String(html||'').replace(/\{\{\s*(scene|name|intro|extra)\s*\}\}/gi,(_m,name)=>escape(fields[name.toLowerCase()]).replace(/\r?\n/g,'<br>'));
  }
  function compile(){if(doc.mode==='source')return sourceWithSlots(sanitizeHtml(doc.sourceHtml));return C.compile(doc);}
  function renderOutput(){
    try{
      if(isFree())doc.layout.height=layoutHeight();
      rendered=C.formatHtml(compile());const count=C.verifyOutput(rendered);const warn=count.issues;
      $('id-counter').textContent=`${count.length.toLocaleString()} / 15,000 characters`;
      $('id-counter').classList.toggle('error',!count.valid);
      $('id-budget').textContent=warn.length?warn.join(' '):`${count.remaining.toLocaleString()} characters left, including all HTML styling and text.`;
      $('id-budget').classList.toggle('error',!count.valid);
      $('id-copy').disabled=!count.valid;$('id-return').disabled=!count.valid;
      $('id-output-html').value=rendered;$('id-output-highlight').innerHTML=highlightHtml(rendered);
      syncLayoutUI();
      if(!editingInline){
        $('id-card').innerHTML=doc.mode==='source'?rendered:C.compile(doc,{preview:true});
        addCanvasHandles();highlightSelected();drawGuides();wirePreviewImages();refreshCropUI();scheduleAutoFit();
      }
    }catch(e){rendered='';$('id-budget').textContent='Unable to compile: '+e.message;$('id-budget').classList.add('error');$('id-copy').disabled=true;$('id-return').disabled=true;}
  }
  function fromSaved(next,keepFields=false){
    const copy=clone(next||C.initial());const previous=formValues();
    doc=Object.assign(C.initial(),copy);doc.theme=Object.assign(C.initial().theme,copy.theme||{});doc.blocks=Array.isArray(copy.blocks)?copy.blocks:[];doc.fields=keepFields?previous:Object.assign(C.initial().fields,copy.fields||{});
    // Designs saved before canvas positioning must retain their stacked layout.
    doc.layout=copy.layout&&['freeform','flow'].includes(copy.layout.mode)?{autoMakeRoom:true,autoHeight:true,...copy.layout}:{mode:'flow',height:240,autoHeight:true,autoMakeRoom:true};
    // Old drafts could store a disabled Auto height and an oversized canvas.
    // Reset those once; subsequent intentional manual edits are respected.
    if(doc.layout.autoFitVersion!==2)doc.layout.autoHeight=true;
    doc.layout.autoFitVersion=2;
    if(!['source','visual'].includes(doc.mode))doc.mode='visual';
    for(const key of C.SLOTS)styleInput('id-'+key,doc.fields[key]);
    cropEditId=null;selectedId=null;selectedFrameId=null;
    if(doc.layout?.mode==='freeform'&&doc.blocks.some(b=>!b.placement))alignAll();
    populateTheme();renderFrames();renderLayers();showInspector();chooseView('visual');renderOutput();queueSave();
  }
  function chooseView(mode){view=mode==='html'?'html':'visual';$('id-visual-panel').hidden=view!=='visual';$('id-html-panel').hidden=view!=='html';$('id-html-actions').hidden=view!=='html';document.querySelector('.id-preview-tools').hidden=view==='html';
    $('id-visual-tab').classList.toggle('active',view==='visual');$('id-html-tab').classList.toggle('active',view==='html');
    $('id-visual-tab').setAttribute('aria-pressed',String(view==='visual'));$('id-html-tab').setAttribute('aria-pressed',String(view==='html'));
    if(view==='html'){$('id-custom-html').value=doc.mode==='source'?C.formatHtml(doc.sourceHtml||''):C.compile(doc,{formatted:true});paintSourceCode();}
  }
  function showBlockPanel(){const theme=$('id-theme-tab'),ele=$('id-element-tab');const elem=ele.classList.contains('active');$('id-theme-settings').hidden=elem;$('id-element-settings').hidden=!elem;}
  function relativeStagePoint(event){
    const stage=$('id-card').querySelector('[data-intro-free-stage]');
    if(!stage)return null;
    const bounds=stage.getBoundingClientRect();
    return {stage,bounds,x:Math.max(0,Math.min(100,(event.clientX-bounds.left)/Math.max(1,bounds.width)*100)),
      y:Math.max(0,event.clientY-bounds.top)};
  }
  function pointerStart(e){
    if(!isFree()||editingInline||e.button!==0)return;
    // Clicking the preview's quick-delete button is not a drag operation.
    if(e.target.closest('.id-canvas-delete'))return;
    const node=e.target.closest('[data-intro-free-stage] > [data-block-id]');if(!node){selectLayer(null);return;}
    const block=blockOf(node.dataset.blockId);if(!block)return;
    if(e.target.closest('a'))e.preventDefault();
    if(block.locked){selectLayer(block.id);return notice('Unlock this layer in Structure to move or resize it.');}
    const pos=locationOf(block),stage=relativeStagePoint(e);
    if(!stage)return;
    selectLayer(block.id);$('id-canvas').focus({preventScroll:true});
    const handle=e.target.closest('.id-resize-grip')?.dataset.handle||null;
    const cropFrame=node.querySelector('[data-intro-crop-frame]');
    const cropContentHit=!!e.target.closest('[data-intro-crop-frame]');
    const zoomed=block.crop?.enabled&&normalizedCrop(block).zoom>100;
    const cropping=!!(!e.altKey&&canCrop(block)&&cropContentHit&&(cropEditId===block.id||zoomed));
    const cropRect=cropFrame?.getBoundingClientRect();
    pointerDrag={id:e.pointerId,blockId:block.id,action:handle?'resize':cropping?'crop-pan':'move',handle,
      clientX:e.clientX,clientY:e.clientY,start:pos,width:stage.bounds.width,changed:false,
      cropRect:cropRect?{w:cropRect.width,h:cropRect.height}:null,
      cropStart:cropping?{...normalizedCrop(block)}:null,
      originals:doc.blocks.map(b=>({id:b.id,placement:{...locationOf(b)}}))};
    $('id-canvas').setPointerCapture(e.pointerId);e.preventDefault();
  }
  function pointerMove(e){
    const d=pointerDrag;if(!d||e.pointerId!==d.id)return;
    const b=blockOf(d.blockId);if(!b)return;
    const dx=(e.clientX-d.clientX)/Math.max(1,d.width)*100;
    const dy=e.clientY-d.clientY;
    if(Math.abs(dx)<.2&&Math.abs(dy)<1&&!d.changed)return;
    if(d.action==='crop-pan'){
      const c=ensureCrop(b),starting=d.cropStart;
      const deltaX=(e.clientX-d.clientX)/Math.max(1,d.cropRect?.w||d.width)*100;
      const deltaY=(e.clientY-d.clientY)/Math.max(1,d.cropRect?.h||d.start.h)*100;
      const limit=(starting.zoom-100)/2;
      c.offsetX=C.clamp(starting.offsetX+deltaX,-limit,limit,0);
      c.offsetY=C.clamp(starting.offsetY+deltaY,-limit,limit,0);
      // At 100% zoom, shift the cover crop's focal point instead of moving the box.
      c.focusX=C.clamp(starting.focusX-deltaX,0,100,50);
      c.focusY=C.clamp(starting.focusY-deltaY,0,100,50);
      updateCropPreview(b);d.changed=true;skipCanvasClick=true;e.preventDefault();return;
    }
    const next={...d.start};
    if(d.action==='move'){
      next.x=Math.round(C.clamp(d.start.x+dx,0,100-d.start.w,d.start.x));
      next.y=Math.round(C.clamp(d.start.y+dy,0,L.MAX_HEIGHT-d.start.h,d.start.y));
    }else{
      const dir=d.handle||'se';
      // Anchor the opposite edges. Resizing northwest never drags the
      // southeast edge and a side handle changes only one axis.
      const right=d.start.x+d.start.w,bottom=d.start.y+d.start.h;
      if(dir.includes('w')){next.x=Math.round(C.clamp(d.start.x+dx,0,right-5,d.start.x));next.w=right-next.x;}
      if(dir.includes('e'))next.w=Math.round(C.clamp(d.start.w+dx,5,100-d.start.x,d.start.w));
      if(dir.includes('n')){next.y=Math.round(C.clamp(d.start.y+dy,0,bottom-24,d.start.y));next.h=bottom-next.y;}
      if(dir.includes('s'))next.h=Math.round(C.clamp(d.start.h+dy,24,Math.min(1200,L.MAX_HEIGHT-d.start.y),d.start.h));
    }
    // Recalculate against the original layout on every pointer move so
    // displaced blocks don't drift further down with every mouse event.
    const proposal=L.arrange(d.originals,d.blockId,next,layoutHeight(),{snap:doc.layout?.snapEnabled!==false&&!e.altKey,action:d.action,handle:d.handle,thresholdX:1.5,thresholdY:7,collision:'free'});
    if(!proposal.ok)return;
    applyArrangement(proposal,true);
    // Horizontal resizing must not turn an Auto paragraph into a fixed-height box.
    if(d.action==='resize'&&(b.type!=='text'||d.handle.includes('n')||d.handle.includes('s')))b.manualHeight=true;
    d.changed=true;skipCanvasClick=true;
    e.preventDefault();
  }
  function pointerEnd(e){
    if(!pointerDrag||pointerDrag.id!==e.pointerId)return;
    const d=pointerDrag;pointerDrag=null;
    const canvas=$('id-canvas');
    if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(d.changed){
      if(d.action==='crop-pan'){
        lastSnapGuides={};renderOutput();showInspector();queueSave();return;
      }
      if(doc.layout?.autoMakeRoom!==false){
        // Commit on release: during the drag every peer stayed fixed. Moving
        // down rotates the crossed slots UP; moving up rotates them DOWN.
        // Resizing is different: preserve the element's anchor, make room if
        // the new box grows into another object.
        const current=blockOf(d.blockId),target=current?.placement;
        if(target){
          const reflow=d.action==='move'
            ?L.reorderDrop(d.originals,d.blockId,target,layoutHeight())
            :L.makeRoom(d.originals,d.blockId,target,layoutHeight());
          if(!reflow.ok){
            const old=new Map(d.originals.map(o=>[o.id,o.placement]));
            for(const b of doc.blocks)if(old.has(b.id))b.placement={...old.get(b.id)};
            notice(reflow.reason,true);
          }else applyArrangement(reflow);
        }
      }
      lastSnapGuides={};synchronizeStructure();renderOutput();showInspector();queueSave();
    }
  }
  function dropOnCanvas(e){
    e.preventDefault();$('id-canvas').classList.remove('id-drop-target');
    if(doc.mode==='source')return;
    const added=e.dataTransfer?.getData('application/x-intro-new-layer');
    const existing=e.dataTransfer?.getData('application/x-intro-layer')||draggedId;
    if(!added&&!existing)return;
    if(!isFree())switchLayout('freeform');
    const hit=relativeStagePoint(e);if(!hit)return;
    let b;
    if(added){
      if(!palette[added]||doc.blocks.length>=150)return notice('Too many layers or unknown block type.',true);
      b=newBlock(added);doc.blocks.push(b);
    }else b=blockOf(existing);
    if(!b)return;
    const current=locationOf(b);
    const baseline=doc.blocks.map(item=>({id:item.id,placement:{...locationOf(item)}}));
    const x=Math.round(C.clamp(hit.x-current.w/2,0,100-current.w,0));
    const y=Math.round(Math.max(0,hit.y-current.h/2));
    doc.layout.height=Math.min(3000,Math.max(layoutHeight(),y+current.h+35));
    b.placement={...current,x,y:Math.min(y,L.MAX_HEIGHT-current.h)};
    // Reordering an existing layer fills its old slot. New palette elements
    // have no vacated slot, so they make room in the normal insertion direction.
    if(doc.layout?.autoMakeRoom!==false){
      const arranged=added
        ?L.makeRoom(baseline,b.id,b.placement,layoutHeight())
        :L.reorderDrop(baseline,b.id,b.placement,layoutHeight());
      if(!arranged.ok){
        if(added)doc.blocks=doc.blocks.filter(item=>item.id!==b.id);
        else b.placement=current;
        return notice(arranged.reason,true);
      }
      applyArrangement(arranged);
    }else if(!smartPlace(b.id,b.placement,{snap:false,collision:'free'}))return;
    selectedId=b.id;synchronizeStructure();renderOutput();showInspector();$('id-element-tab').click();queueSave();
  }
  function bindUI(){
    bindFields();bindTheme();bindElement();bindFrames();
    $('id-undo').onclick=()=>restoreHistory('undo');$('id-redo').onclick=()=>restoreHistory('redo');
    const paletteBox=$('id-palette');Object.entries(palette).forEach(([type,[icon,name]])=>{
      const button=document.createElement('button');button.type='button';button.textContent=`${icon}  ${name}`;
      button.draggable=true;button.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-intro-new-layer',type);});
      button.onclick=()=>{
        if(doc.mode==='source'){notice('Switch to visual blocks first, or edit the imported HTML.',true);return;}
        if(doc.blocks.length>=150)return notice('Maximum 150 elements per design.',true);
        const b=newBlock(type);doc.blocks.push(b);if(isFree())smartPlace(b.id,b.placement,{snap:false,collision:'avoid'});selectedId=b.id;synchronizeStructure();renderOutput();showInspector();$('id-element-tab').click();queueSave();
      };paletteBox.append(button);
    });
    // Clicking any empty workspace region deselects, without stealing focus
    // from controls or toggling another layer. Handles imported frames too.
    document.addEventListener('pointerdown',e=>{
      if(view!=='visual'||doc.mode==='source'||editingInline||pointerDrag||(!selectedId&&!selectedFrameId))return;
      if(e.target.closest('[data-block-id],.id-layer,.id-structure-frame,.id-inspector,.id-sidebar,.id-topbar,.id-workspace-toolbar,.id-output,.id-html-panel'))return;
      if(e.target.closest('button,input,textarea,select,label,a,summary,[contenteditable],[role="button"]'))return;
      if(e.target.closest('#id-visual-panel, #id-canvas, .id-workspace'))selectLayer(null);
    },{capture:true});
    $('id-canvas').addEventListener('click',e=>{
      // Free-position selection already happens on pointerdown. Pointer capture
      // retargets the subsequent click to the canvas; don't deselect it then.
      if(isFree()){skipCanvasClick=false;return;}
      if(e.target.closest('.id-canvas-delete'))return;
      if(skipCanvasClick){skipCanvasClick=false;return;}
      if(doc.mode==='source'){if(e.target.closest('a'))e.preventDefault();return;}
      if(editingInline)return;
      const node=e.target.closest('[data-block-id]');if(node){if(e.target.closest('a'))e.preventDefault();selectLayer(node.dataset.blockId);$('id-canvas').focus({preventScroll:true});}else selectLayer(null);
    });
    $('id-canvas').addEventListener('dblclick',e=>{
      if(doc.mode==='source')return;
      const node=e.target.closest('[data-block-id]'),b=node&&blockOf(node.dataset.blockId);
      if(!b||!editable.includes(b.type)||b.type==='list')return;
      selectLayer(b.id);editingInline=true;const editor=isFree()?node.firstElementChild:node;editor.setAttribute('contenteditable','plaintext-only');editor.focus();
      const slot=(b.text||'').match(/^\{\{\s*(scene|name|intro|extra)\s*\}\}$/i)?.[1];
      editor.addEventListener('blur',()=>{
        editor.removeAttribute('contenteditable');const content=(editor.innerText||editor.textContent||'').trim();
        if(slot){doc.fields[slot]=content;$('id-'+slot).value=content;}else{b.text=content;b.importedInner=null;}
        editingInline=false;renderLayers();showInspector();renderOutput();queueSave();
      },{once:true});
      editor.addEventListener('keydown',ev=>{if(ev.key==='Escape'){ev.preventDefault();editor.blur();}});
      editor.addEventListener('paste',ev=>{ev.preventDefault();document.execCommand('insertText',false,ev.clipboardData.getData('text/plain'));});
    });
    $('id-preview-width').onchange=e=>{$('id-canvas').style.width=e.target.value+'px';};
    $('id-layout-mode').onchange=e=>switchLayout(e.target.value);
    for(const [key,prop] of [['id-snap-enabled','snapEnabled'],['id-show-guides','showGuides'],['id-avoid-overlap','autoMakeRoom']]){
      $(key).addEventListener('change',e=>{doc.layout[prop]=!!e.target.checked;lastSnapGuides={};drawGuides();queueSave();});
    }
    $('id-auto-height').addEventListener('change',e=>{
      doc.layout.autoHeight=!!e.target.checked;
      if(doc.layout.autoHeight)doc.layout.height=layoutHeight();
      renderOutput();showInspector();queueSave();
    });
    $('id-stage-height').onchange=e=>{if(!isFree()||doc.layout?.autoHeight!==false)return;doc.layout.height=Math.round(C.clamp(e.target.value,240,3000,240));renderOutput();showInspector();queueSave();};
    $('id-fit-height').onclick=()=>{if(!isFree())switchLayout('freeform');doc.layout.autoHeight=true;doc.layout.autoFitVersion=2;doc.layout.height=layoutHeight();renderOutput();showInspector();queueSave();notice('Canvas now fits the content.');};
    $('id-canvas').addEventListener('dragstart',e=>{if(e.target.closest('[data-intro-free-stage]'))e.preventDefault();});
    $('id-canvas').addEventListener('pointerdown',pointerStart);
    $('id-canvas').addEventListener('pointermove',pointerMove);
    $('id-canvas').addEventListener('pointerup',pointerEnd);
    $('id-canvas').addEventListener('pointercancel',pointerEnd);
    $('id-canvas').addEventListener('wheel',e=>{
      if(!cropEditId||!isFree())return;
      const node=e.target.closest('[data-intro-free-stage] > [data-block-id]');
      if(!node||node.dataset.blockId!==cropEditId)return;
      e.preventDefault();const b=blockOf(cropEditId);if(!canCrop(b))return;
      const c=ensureCrop(b),old=c.zoom;
      c.zoom=C.clamp(old+(e.deltaY<0?10:-10),100,400,115);
      const max=(c.zoom-100)/2;c.offsetX=C.clamp(c.offsetX,-max,max,0);c.offsetY=C.clamp(c.offsetY,-max,max,0);
      renderOutput();showInspector();queueSave();
    },{passive:false});
    $('id-canvas').addEventListener('dragover',e=>{if(doc.mode==='source')return;e.preventDefault();e.dataTransfer.dropEffect='copy';$('id-canvas').classList.add('id-drop-target');});
    $('id-canvas').addEventListener('dragleave',e=>{if(!$('id-canvas').contains(e.relatedTarget))$('id-canvas').classList.remove('id-drop-target');});
    $('id-canvas').addEventListener('drop',dropOnCanvas);
    // Delete the selected element from the canvas. Never intercept keys while
    // a text input, textarea, select or contenteditable element has focus.
    // Use the document event so a click-selected block can be deleted without
    // having to click the Layers panel or the inspector's Delete button.
    document.addEventListener('keydown',e=>{
      if(!['Delete','Backspace'].includes(e.key)||e.repeat||!selectedId||doc.mode==='source'||view!=='visual'||editingInline)return;
      const focus=document.activeElement;
      if(focus?.closest?.('input, textarea, select, [contenteditable], [role="textbox"]'))return;
      if(focus?.closest?.('button, [role="button"]'))return;
      const insideCanvas=focus===$('id-canvas')||$('id-canvas').contains(focus);
      if(!insideCanvas)return;
      e.preventDefault();
      removeLayer();notice('Element deleted from Introduction.');
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!editingInline&&(selectedId||selectedFrameId)&&!e.target.closest('input,textarea,select,[contenteditable]')){selectLayer(null);return;}
      if(!(e.ctrlKey||e.metaKey)||!['z','y'].includes(e.key.toLowerCase()))return;
      if(e.target.closest('input, textarea, select, [contenteditable]'))return;
      e.preventDefault();restoreHistory(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');
    });
    $('id-canvas').addEventListener('keydown',e=>{ 
      if(!isFree()||!selectedId||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||editingInline)return;
      if(e.target!==$('id-canvas'))return;
      e.preventDefault();const b=blockOf(selectedId);if(!b)return;
      const p=locationOf(b),n=e.shiftKey?10:1;
      if(e.key==='ArrowLeft')p.x-=n;if(e.key==='ArrowRight')p.x+=n;
      if(e.key==='ArrowUp')p.y-=n;if(e.key==='ArrowDown')p.y+=n;
      if(smartPlace(b.id,{...p,y:Math.max(0,p.y)},{snap:false,collision:'free'})){renderOutput();showInspector();queueSave();}
    });
    $('id-custom-html').addEventListener('input',paintSourceCode);$('id-custom-html').addEventListener('scroll',paintSourceCode);
    $('id-visual-tab').onclick=()=>chooseView('visual');$('id-html-tab').onclick=()=>chooseView('html');
    $('id-back-visual').onclick=()=>chooseView('visual');
    $('id-apply-html').onclick=()=>{
      const raw=$('id-custom-html').value;const clean=sanitizeHtml(raw);
      if(!clean.trim())return notice('Paste guide-compatible HTML before importing.',true);
      const before=C.verifyOutput(sourceWithSlots(clean));if(!before.valid)return notice(before.issues.join(' '),true);
      const translation=visualDocumentFromHtml(clean);
      if(translation){
        // Keep existing content field values so the imported template can be
        // personalized without silently replacing the user's text.
        translation.fields={...doc.fields};
        fromSaved(translation);chooseView('visual');
        // Wait for imported images to have dimensions BEFORE capturing the
        // stacked positions. Otherwise a not-yet-loaded image starts at zero
        // height and the later auto-fit places it after the text.
        const importedDoc=doc;
        const images=[...$('id-card').querySelectorAll('img')];
        Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
          const done=()=>resolve();img.addEventListener('load',done,{once:true});
          img.addEventListener('error',done,{once:true});setTimeout(done,2500);
        }))).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
          if(doc===importedDoc&&doc.mode==='visual'){
            switchLayout('freeform');
            notice(`Imported ${translation.blocks.length} movable layers and ${translation.theme.frames.length} nested border frames. Original inline styles preserved.`);
          }
        })));
      }else{
        doc.mode='source';doc.sourceHtml=clean;selectedId=null;renderLayers();showInspector();renderOutput();queueSave();chooseView('visual');
        notice('HTML imported in source mode. Unsupported HTML was removed.');
      }
    };
    $('id-return-generated').onclick=()=>{
      if(doc.mode==='visual')return chooseView('visual');
      if(!confirm('Return to the visual block layout? This replaces the imported HTML with the last saved visual blocks.'))return;
      doc.mode='visual';selectedId=null;renderLayers();showInspector();renderOutput();queueSave();chooseView('visual');
    };
    $('id-toggle-code').onclick=()=>{const el=$('id-output-highlight-wrap');el.hidden=!el.hidden;$('id-toggle-code').textContent=el.hidden?'Show code':'Hide code';};
    $('id-theme-tab').onclick=()=>{$('id-theme-tab').classList.add('active');$('id-element-tab').classList.remove('active');showBlockPanel();};
    $('id-element-tab').onclick=()=>{$('id-element-tab').classList.add('active');$('id-theme-tab').classList.remove('active');showBlockPanel();};
    $('id-new').onclick=()=>{if(!confirm('Start a fresh Introduction design? Your saved templates will stay available.'))return;templateId=null;fromSaved(C.initial());notice('Started a fresh design.');};
    $('id-save-template').onclick=async()=>{
      const name=prompt('Name your reusable Introduction template:',doc.title||'My Introduction Design');if(!name)return;
      try{const record=await host.saveTemplate(name,doc);templateId=record.id;doc.title=record.name;await refreshTemplates();$('id-template-select').value=record.id;notice('Template saved. You can reuse this design with new text.');}
      catch(e){notice('Could not save template: '+e.message,true);}
    };
    $('id-use-template').onclick=()=>{
      const id=$('id-template-select').value,template=templates.find(x=>x.id===id);if(!template)return notice('Select a saved template first.',true);
      // A template is a layout: keep the current bot's four text values.
      fromSaved(template.design,true);templateId=id;doc.title=template.name;notice(`Loaded ${template.name}. Your current Scene, Name and text remain filled.`);
    };
    $('id-template-delete').onclick=async()=>{const id=$('id-template-select').value;if(!id)return notice('Select a saved template first.',true);if(!confirm('Delete this saved template?'))return;try{await host.deleteTemplate(id);if(templateId===id)templateId=null;await refreshTemplates();notice('Template deleted. The open design is unchanged.');}catch(e){notice(e.message,true);}};
    $('id-template-export').onclick=async()=>{try{if(!$('id-template-select').value)return notice('Select a saved template to export.',true);const ok=await host.exportTemplate($('id-template-select').value);if(ok)notice('Template JSON exported.');}catch(e){notice(e.message,true);}};
    $('id-template-import').onclick=async()=>{try{const record=await host.importTemplate();if(!record)return;await refreshTemplates();$('id-template-select').value=record.id;notice(`Imported template ${record.name}. Select Load to use it.`);}catch(e){notice(e.message,true);}};
    $('id-copy').onclick=async()=>{renderOutput();const res=C.verifyOutput(rendered);if(!res.valid)return notice(res.issues.join(' '),true);try{await host.copy(rendered);notice(`Copied ${res.length.toLocaleString()} characters. Paste directly into JuicyChat's Introduction.`);}catch(e){notice(e.message,true);}};
    $('id-return').onclick=async()=>{
      renderOutput();const res=C.verifyOutput(rendered);if(!res.valid)return notice(res.issues.join(' '),true);
      try{await host.saveAndReturn(rendered,doc);notice('Introduction returned to Bot Builder.');}catch(e){notice('Save and Return failed: '+e.message,true);}
    };
    $('id-close').onclick=()=>{host.close();};
    window.addEventListener('beforeunload',()=>{clearTimeout(saveTimer);});
  }
  async function refreshTemplates(){templates=await host.templates();const sel=$('id-template-select'),was=sel.value;sel.replaceChildren(new Option('Saved templates',''));for(const t of templates)sel.add(new Option(t.name,t.id));if(templates.some(t=>t.id===was))sel.value=was;}
  function seedData(seed,draft){
    if(seed?.design){fromSaved(seed.design);return;}
    if(seed?.fields){const next=C.initial();next.fields={...next.fields,...seed.fields};
      if(seed.sourceHtml){next.mode='source';next.sourceHtml=sanitizeHtml(seed.sourceHtml);}
      fromSaved(next);return;
    }
    if(draft){fromSaved(draft);return;}fromSaved(C.initial());
  }
  async function start(){
    addRangeNumbers(document.querySelector('.id-inspector'));
    bindUI();
    try{
      const init=await host.bootstrap();embedded=!!init.embedded;templates=init.templates||[];
      $('id-return').hidden=!embedded;
      await refreshTemplates();seedData(init.seed,init.draft);
      host.onContext?.(incoming=>{if(incoming){seedData(incoming,null);notice('Loaded Introduction from the active bot.');}});
    }catch(e){seedData(null,null);notice('Template storage unavailable: '+e.message,true);}
    renderOutput();
  }
  start();
})();
