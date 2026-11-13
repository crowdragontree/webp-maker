// WebP Maker: locally decode MP4 and WebM (including mislabeled VP9/ComfyUI files), animated WebP files and PNG/JPG pictures, and join them
// (optionally with a cross-fade). ImageMagick encodes the 9.99 MB WebP. No uploads and no FFmpeg dependency.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = window.juicyApp;
  const geometry=window.webpFrameGeometry;
  const timeline=window.webpTimeline;
  const $o=id=>document.getElementById(id);   // the merge settings: looked up softly so the panel still works if a page does not have them
  const ids=['wm-input','wm-dropzone','wm-add','wm-clear','wm-clips','wm-count','wm-size','wm-size-custom','wm-width','wm-height','wm-fps','wm-quality',
    'wm-original-size','wm-crop','wm-crop-position','wm-output-dimensions','wm-crop-preview-wrap','wm-crop-preview','wm-crop-preview-clip','wm-freeform-tools','wm-freeform-status','wm-freeform-reset','wm-convert','wm-cancel','wm-progress-wrap','wm-progress-title','wm-progress-pct','wm-progress-bar','wm-progress-detail',
    'wm-error','wm-result','wm-preview','wm-preview-placeholder','wm-result-size','wm-size-bar','wm-result-details','wm-result-note','wm-save','wm-expand','wm-fullscreen','wm-fullscreen-image','wm-fullscreen-close'];
  if(!ids.every(id=>$(id))||!api?.webpBegin||!api?.webpFrame||!api?.webpFinish||!geometry||!timeline)return;
  const MAX_FRAMES=1500;
  const MAX_BYTES=10475274; // 9.99 MB counted like Windows and ezgif (1 MB = 1,048,576 bytes)
  let clips=[];
  let clipInstanceSerial=0;
  let converting=false;
  let ready=false;
  let overShown=false;   // the preview shows a file that is over the size limit (kept after a failed conversion)
  let dragIndex=-1;
  let cancelled=false;
  let adding=false;
  let cropPointerDrag=null;
  // v1.5.4 batches: the clips are organised into batches and every batch is converted to its own WebP.
  const MAX_CLIPS=60,MAX_PER_BATCH=30,MAX_BATCHES=30;
  let batches=[{id:1,name:'Batch 1'}];
  let batchSerial=1;
  let activeBatch=1;              // new files go into this batch
  const results=new Map();        // batch id -> {bytes,details:[[label,value]],note}: the batches that have a finished WebP (kept by the app until the settings or the clips change)
  const failures=new Map();       // batch id -> why its last conversion failed
  let shownBatch=null;            // the batch whose WebP the preview shows
  let run=null;                   // the conversion run in progress: {multi,label,errors,...}
  const batchIndex=id=>batches.findIndex(b=>b.id===id);
  const batchById=id=>batches.find(b=>b.id===id)||batches[0];
  const batchClips=id=>clips.filter(c=>c.batchId===id);
  const filledBatches=()=>batches.filter(b=>batchClips(b.id).length);
  const defaultList=()=>{const l=batchClips(activeBatch);return l.length?l:clips;};
  const regroup=()=>{const order=new Map(batches.map((b,i)=>[b.id,i]));clips=clips.map((c,i)=>({c,i})).sort((x,y)=>((order.get(x.c.batchId)??0)-(order.get(y.c.batchId)??0))||x.i-y.i).map(x=>x.c);};
  const baseName=n=>String(n||'').replace(/\.[A-Za-z0-9]{1,5}$/,'').replace(/\s+/g,' ').trim().slice(0,60);
  const uniqueName=base=>{const taken=new Set(batches.map(b=>b.name.toLowerCase()));let n=base,k=1;while(taken.has(n.toLowerCase())){k++;n=`${base} (${k})`;}return n;};
  const batchSeconds=list=>{const x=crossfadeOn()&&list.length>1&&crossfadeSeconds()>0?crossfadeSeconds():0;return list.reduce((a,c)=>a+clipSeconds(c),0)-x*Math.max(0,list.length-1);};
  const convertLabel=()=>{const n=filledBatches().length;return n>1?`Convert ${n} batches to WebP`:'Convert to WebP';};
  // What can be added: videos, animated WebP files, and PNG/JPG pictures (a still WebP counts as a picture).
  const kindOf=name=>/\.(mp4|webm)$/i.test(name)?'video':/\.webp$/i.test(name)?'webp':(window.ImageFormats&&window.ImageFormats.isImageName(name))||/\.(png|jpe?g)$/i.test(name)?'image':'';
  const imageSeconds=()=>{const v=Number($o('wm-image-seconds')?.value);return Number.isFinite(v)?v:2;};
  const crossfadeOn=()=>!!$o('wm-crossfade-on')?.checked;
  const crossfadeSeconds=()=>crossfadeOn()?Number($o('wm-crossfade-seconds')?.value):0;
  // how long a clip is on screen: a video or an animated WebP for its own length, a picture for "Seconds per image"
  const clipSeconds=clip=>clip.kind==='image'?imageSeconds():clip.duration;
  const formatBytes=b=>b>=1048576?(b/1048576).toFixed(2)+' MB':(b/1024).toFixed(0)+' KB';
  const webpNav=document.querySelector('.nav-btn[data-view="webpmaker"]');
  function navStatus(mode){
    if(!webpNav)return;
    webpNav.dataset.webpStatus=mode;
    webpNav.title=mode==='running'?'WebP Maker: conversion is running in the background':mode==='complete'?'WebP Maker: animation ready to preview and save':mode==='failed'?'WebP Maker: conversion failed':'WebP Maker';
    webpNav.setAttribute('aria-label',webpNav.title);
  }
  if(webpNav)webpNav.addEventListener('click',()=>{if(!converting)navStatus('idle');});
  if(api.onWebpOpen)api.onWebpOpen(()=>webpNav?.click());
  // Show a persistent, actionable notification inside the application across all tabs.
  // No OS notifications or short-lived generic toasts are required.
  function dismissNotice(){$('wm-app-notice').hidden=true;}
  $('wm-app-notice-close').addEventListener('click',dismissNotice);
  $('wm-app-notice-open').addEventListener('click',()=>{
    const kind=$('wm-app-notice').dataset.kind;
    dismissNotice();
    if(webpNav)webpNav.click();
    if(kind==='complete'&&ready)$('wm-save').focus();
    else if(kind==='failed'){$('wm-error').setAttribute('tabindex','-1');$('wm-error').focus();}
  });
  function notify(mode,count){
    if(mode!=='complete'&&mode!=='failed')return;
    const done=mode==='complete';
    const notice=$('wm-app-notice');
    notice.dataset.kind=mode;
    notice.setAttribute('role',done?'status':'alert');
    notice.setAttribute('aria-live',done?'polite':'assertive');
    $('wm-app-notice-icon').textContent=done?'✓':'!';
    $('wm-app-notice-title').textContent=done?'WebP Maker: Conversion complete':'WebP Maker: Conversion failed';
    $('wm-app-notice-message').textContent=done?(count>1?`Your ${count} animated WebP files are ready to preview and save.`:'Your animated WebP is ready to preview and save.'):'Open WebP Maker for the error details and retry options.';
    $('wm-app-notice-open').textContent=done?'View WebP':'View error';
    notice.hidden=false;
  }
  function previewFullscreen(show){
    if(show&&!ready)return;
    $('wm-fullscreen').hidden=!show;
    $('wm-fullscreen-image').src=show?$('wm-preview').src:'';
    if(show)$('wm-fullscreen-close').focus();
  }

  const error=m=>{$('wm-error').hidden=false;$('wm-error').textContent=String(m?.message||m||'Conversion failed.');};
  const clearError=()=>{$('wm-error').hidden=true;$('wm-error').textContent='';};
  // hideResult: only the preview panel goes away. clearResult: everything finished is discarded (the settings changed). invalidate: only those batches lose their WebP (their clips changed).
  function hideResult(){ready=false;overShown=false;shownBatch=null;closeSaveMenu();previewFullscreen(false);$('wm-expand').disabled=true;$('wm-result').hidden=true;$('wm-preview-placeholder').hidden=false;$('wm-preview').removeAttribute('src');}
  function clearResult(){const had=results.size;results.clear();failures.clear();hideResult();if(had)Promise.resolve(api.webpStashClear?.()).catch(()=>{});renderResultChips();}
  function invalidate(...ids){
    let hid=false;
    for(const id of ids){
      if(results.delete(id))Promise.resolve(api.webpStashDrop?.(String(id))).catch(()=>{});
      failures.delete(id);if(shownBatch===id)hid=true;
    }
    if(hid||(overShown&&ids.includes(shownBatch)))hideResult();
    if(results.size===0)hideResult();
    renderResultChips();
  }
  function busy(isBusy){
    converting=!!isBusy;
    $('wm-convert').disabled=isBusy||clips.length===0;
    $('wm-convert').textContent=isBusy?'Converting...':convertLabel();
    for(const id of ['wm-new-batch','wm-one-each','wm-merge-all','wm-save-all']){const e=$o(id);if(e)e.disabled=isBusy;}
    $('wm-cancel').hidden=!isBusy;
    $('wm-clear').disabled=isBusy;
    $('wm-add').disabled=isBusy;
    for(const id of ['wm-size','wm-width','wm-height','wm-crop','wm-crop-position','wm-crop-preview-clip','wm-freeform-reset','wm-fps','wm-quality'])$(id).disabled=isBusy;
    for(const id of ['wm-image-seconds','wm-crossfade-on','wm-crossfade-seconds']){const e=$o(id);if(e)e.disabled=isBusy;}
    $('wm-dropzone').setAttribute('aria-disabled',String(isBusy));
  }
  function progress(data){
    if(!converting||!data)return;
    $('wm-progress-wrap').hidden=false;
    $('wm-progress-title').textContent=(run&&run.multi&&run.label?run.label+': ':'')+(data.title||'Converting');
    $('wm-progress-detail').textContent=data.detail||'Working entirely on this computer.';
    const p=Math.min(100,Math.max(0,Number(data.percent)||0));
    $('wm-progress-pct').textContent=p+'%';
    $('wm-progress-bar').style.width=p+'%';
  }
  api.onWebpProgress(progress);
  function untrack(clip){try{clip.decoder?.close();}catch{}try{if(clip.kind==='video'){clip.video.pause();clip.video.removeAttribute('src');clip.video.load();}}catch{}try{if(clip.url)URL.revokeObjectURL(clip.url);}catch{}}
  function resetSize(){
    const c=defaultList()[0];
    $('wm-original-size').textContent=c?`${c.width} × ${c.height} px (first clip${batches.length>1?' of the selected batch':''})`:'Add files to see original dimensions';
    const opt=$('wm-size').querySelector('option[value="original"]');
    if(opt)opt.textContent=c?`Original (${c.width} × ${c.height})`:'Original dimensions (no resizing)';
    const select=$('wm-crop-preview-clip');
    const previouslySelected=select.value;
    select.replaceChildren();
    for(const clip of clips){
      const item=document.createElement('option');item.value=String(clip.instanceId);item.textContent=batches.length>1?`${clip.name} (${batchById(clip.batchId).name})`:clip.name;
      select.append(item);
    }
    if(Array.from(select.options).some(x=>x.value===previouslySelected))select.value=previouslySelected;
    updateSizeUI();
  }
  function dimensions(list){
    list=list||defaultList();
    if(!list.length)throw new Error('Add clips first.');
    return geometry.outputSize(list[0],$('wm-size').value,$('wm-width').value,$('wm-height').value,$('wm-crop').value);
  }
  function previewClip(){return clips.find(c=>String(c.instanceId)===$('wm-crop-preview-clip').value)||clips[0]||null;}
  function drawCropPreview(){
    const details=$('wm-crop-preview-wrap');
    if(details.hidden||!details.open||!clips.length)return;
    const clip=previewClip();if(!clip)return;
    if(clip.video.readyState<2){clip.video.addEventListener('loadeddata',drawCropPreview,{once:true});return;}
    let output;try{output=dimensions(batchClips(clip.batchId));}catch{return;}
    const canvas=$('wm-crop-preview'),freeform=$('wm-crop').value==='freeform';
    canvas.dataset.freeform=String(freeform);
    const aspect=freeform?clip.width/clip.height:output.width/output.height;
    const maxWidth=freeform?340:240,maxHeight=freeform?290:240;
    const scale=Math.min(maxWidth/(aspect>=1?aspect:1),maxHeight/(aspect>=1?1:1/aspect));
    const pw=Math.max(40,Math.round(scale*(aspect>=1?aspect:1)));
    const ph=Math.max(40,Math.round(scale*(aspect>=1?1:1/aspect)));
    if(canvas.width!==pw)canvas.width=pw;
    if(canvas.height!==ph)canvas.height=ph;
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(freeform){
      const crop=geometry.region(clip.width,clip.height,output.width,output.height,clip.freeformSelection);
      const fx=canvas.width/clip.width,fy=canvas.height/clip.height;
      const x=crop.sx*fx,y=crop.sy*fy,w=crop.sw*fx,h=crop.sh*fy;
      try{ctx.drawImage(clip.video,0,0,canvas.width,canvas.height);}catch{}
      ctx.fillStyle='rgba(0,0,0,.64)';ctx.fillRect(0,0,canvas.width,canvas.height);
      try{ctx.drawImage(clip.video,crop.sx,crop.sy,crop.sw,crop.sh,x,y,w,h);}catch{}
      ctx.strokeStyle='#f6d7ff';ctx.lineWidth=2;
      ctx.strokeRect(x+1,y+1,Math.max(0,w-2),Math.max(0,h-2));
      for(const [hx,hy] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]){
        const px=Math.max(5,Math.min(canvas.width-5,hx));
        const py=Math.max(5,Math.min(canvas.height-5,hy));
        ctx.fillStyle='#f8e6ff';ctx.fillRect(px-5,py-5,10,10);
        ctx.strokeStyle='#26102e';ctx.lineWidth=1;ctx.strokeRect(px-5.5,py-5.5,11,11);
      }
      $('wm-freeform-status').textContent=`${clip.name}: ${Math.round(crop.sw)} × ${Math.round(crop.sh)} source pixels selected. Drag inside to move; drag a corner to resize. Each clip has its own crop.`;
    }else{
      const r=geometry.rect(clip.width,clip.height,canvas.width,canvas.height,$('wm-crop').value,$('wm-crop-position').value);
      try{ctx.drawImage(clip.video,r.sx,r.sy,r.sw,r.sh,r.dx,r.dy,r.dw,r.dh);}catch{}
    }
  }
  function canvasPoint(event){
    const b=$('wm-crop-preview').getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-b.left)/b.width)),
      y:Math.max(0,Math.min(1,(event.clientY-b.top)/b.height))};
  }
  function cropHit(clip,point,output){
    const canvas=$('wm-crop-preview');
    const r=geometry.region(clip.width,clip.height,output.width,output.height,clip.freeformSelection);
    const x=r.sx/clip.width,y=r.sy/clip.height,w=r.sw/clip.width,h=r.sh/clip.height;
    const corners={nw:[x,y],ne:[x+w,y],sw:[x,y+h],se:[x+w,y+h]};
    let match=null,distance=Infinity;
    for(const [key,[cx,cy]] of Object.entries(corners)){
      const bounds=canvas.getBoundingClientRect();
      const d=Math.hypot((cx-point.x)*bounds.width,(cy-point.y)*bounds.height);
      if(d<distance){distance=d;match=key;}
    }
    if(distance<=14)return match;
    return point.x>=x&&point.x<=x+w&&point.y>=y&&point.y<=y+h?'move':'outside';
  }
  function cropPointerDown(event){
    if(converting||event.button!==0||$('wm-crop').value!=='freeform')return;
    const clip=previewClip();if(!clip)return;
    let output;try{output=dimensions(batchClips(clip.batchId));}catch{return;}
    const point=canvasPoint(event);
    let mode=cropHit(clip,point,output);
    if(mode==='outside'){
      const current=geometry.region(clip.width,clip.height,output.width,output.height,clip.freeformSelection);
      clip.freeformSelection=geometry.move(clip.width,clip.height,output.width,output.height,
        {cx:point.x,cy:point.y,scale:current.scale},0,0);
      mode='move';invalidate(clip.batchId);drawCropPreview();
    }
    const current=geometry.region(clip.width,clip.height,output.width,output.height,clip.freeformSelection);
    cropPointerDrag={id:event.pointerId,clip,mode,point,start:{cx:current.cx,cy:current.cy,scale:current.scale},output};
    $('wm-crop-preview').setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function cropPointerMove(event){
    if($('wm-crop').value!=='freeform')return;
    const clip=previewClip();if(!clip)return;
    const point=canvasPoint(event);
    if(!cropPointerDrag||cropPointerDrag.id!==event.pointerId){
      try{
        const hit=cropHit(clip,point,dimensions(batchClips(clip.batchId)));
        $('wm-crop-preview').style.cursor=hit==='move'?'move':hit==='outside'?'crosshair':
          (hit==='nw'||hit==='se')?'nwse-resize':'nesw-resize';
      }catch{}
      return;
    }
    const drag=cropPointerDrag;if(drag.clip!==clip)return;
    const size=drag.output;
    clip.freeformSelection=drag.mode==='move'
      ?geometry.move(clip.width,clip.height,size.width,size.height,drag.start,point.x-drag.point.x,point.y-drag.point.y)
      :geometry.resize(clip.width,clip.height,size.width,size.height,drag.start,drag.mode,point.x,point.y);
    invalidate(cropPointerDrag.clip.batchId);drawCropPreview();event.preventDefault();
  }
  function cropPointerEnd(event){
    if(cropPointerDrag?.id!==event.pointerId)return;
    cropPointerDrag=null;
    const canvas=$('wm-crop-preview');
    if(canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  function updateSizeUI(){
    const choice=$('wm-size').value,crop=$('wm-crop').value;
    $('wm-size-custom').hidden=choice!=='custom';
    $('wm-crop-position').hidden=crop==='fit'||crop==='freeform';
    $('wm-crop-preview-wrap').hidden=crop==='fit'||!clips.length;
    $('wm-freeform-tools').hidden=crop!=='freeform'||!clips.length;
    if(crop==='freeform'&&clips.length)$('wm-crop-preview-wrap').open=true;
    if(choice==='custom'&&clips.length){
      if(!Number($('wm-width').value)||!Number($('wm-height').value)){
        $('wm-width').value=defaultList()[0].width;
        $('wm-height').value=defaultList()[0].height;
      }
    }
    if(!clips.length){$('wm-output-dimensions').textContent='Choose files to see output size';return;}
    try{
      const {width,height}=dimensions();
      $('wm-output-dimensions').textContent=`Output ${width} × ${height} px · ${crop==='fit'?'Whole picture fitted':crop==='freeform'?'Freeform crop per clip':'Cropped to fill'}${batches.length>1?` · ${batchById(activeBatch).name}`:''}`;
    }catch{$('wm-output-dimensions').textContent='Enter a valid output width and height';}
    drawCropPreview();
  }
  function row(clip,i){
    const el=document.createElement('div');el.className='wm-clip';el.draggable=!converting;el.dataset.index=i;
    const grip=document.createElement('span');grip.className='wm-grip';grip.textContent='⠿';grip.title='Drag to reorder';
    const n=document.createElement('span');n.className='wm-clip-num';n.textContent=String(batchClips(clip.batchId).indexOf(clip)+1).padStart(2,'0');
    const description=document.createElement('div');description.className='wm-clip-copy';
    const name=document.createElement('strong');name.textContent=clip.name;
    const details=document.createElement('small');
    details.textContent=clip.kind==='image'?`${clip.width} × ${clip.height} · picture, shown ${imageSeconds()}s · ${formatBytes(clip.bytes)}`
      :clip.kind==='webp'?`${clip.width} × ${clip.height} · ${clip.duration.toFixed(2)}s · ${clip.frames.length} frames · WebP · ${formatBytes(clip.bytes)}`
      :`${clip.width} × ${clip.height} · ${clip.duration.toFixed(2)}s · ${formatBytes(clip.bytes)}${clip.container==='webm'?' · VP9/WebM':''}`;
    description.append(name,details);
    const controls=document.createElement('div');controls.className='wm-clip-buttons';
    for(const [glyph,label,disabled,callback] of [
      ['↑','Move up',i===0||clips[i-1].batchId!==clip.batchId,()=>move(i,i-1)],['↓','Move down',i===clips.length-1||clips[i+1].batchId!==clip.batchId,()=>move(i,i+1)],['×','Remove clip',false,()=>removeClip(i)]]) {
      const b=document.createElement('button');b.className='ghost';b.type='button';b.textContent=glyph;b.title=label;
      b.setAttribute('aria-label',`${label}: ${clip.name}`);b.disabled=disabled||converting;b.addEventListener('click',callback);controls.append(b);
    }
    if(batches.length>1){
      const sel=document.createElement('select');sel.className='wm-clip-batch';sel.title='Move this clip to another batch';sel.setAttribute('aria-label',`Batch for ${clip.name}`);
      for(const b of batches){const o=document.createElement('option');o.value=String(b.id);o.textContent=b.name;sel.append(o);}
      sel.value=String(clip.batchId);sel.disabled=converting;sel.draggable=false;
      sel.addEventListener('change',()=>moveToBatch(i,Number(sel.value)));controls.prepend(sel);
    }
    el.append(grip,n,description,controls);
    el.addEventListener('dragstart',event=>{if(converting){event.preventDefault();return;}dragIndex=i;el.classList.add('wm-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(i));});
    el.addEventListener('dragend',()=>{dragIndex=-1;document.querySelectorAll('.wm-clip').forEach(e=>e.classList.remove('wm-dragging','wm-dragover'));document.querySelectorAll('.wm-batch').forEach(e=>e.classList.remove('wm-batch-over'));});
    el.addEventListener('dragover',event=>{if(dragIndex<0||converting)return;event.preventDefault();event.dataTransfer.dropEffect='move';el.classList.add('wm-dragover');});
    el.addEventListener('dragleave',()=>el.classList.remove('wm-dragover'));
    el.addEventListener('drop',event=>{if(dragIndex<0||converting)return;event.preventDefault();event.stopPropagation();move(dragIndex,i);dragIndex=-1;});
    return el;
  }
  function render(){
    $('wm-count').textContent=`(${clips.length})`;
    const host=$('wm-clips');host.replaceChildren();
    const multi=batches.length>1;host.classList.toggle('wm-multi',multi);
    if(multi)batches.forEach(b=>host.append(batchSection(b)));
    else if(!clips.length){const p=document.createElement('div');p.className='wm-empty';p.textContent='Add one clip to convert it, or more to merge them. Videos, animated WebP files and PNG/JPG pictures can be mixed. To get several WebP files, use + New batch and put the clips in different batches.';host.append(p);}
    else clips.forEach((c,i)=>host.append(row(c,i)));
    $('wm-convert').disabled=converting||clips.length===0;
    if(!converting)$('wm-convert').textContent=convertLabel();
    resetSize();updateCombineUI();updateBatchUI();renderResultChips();
  }
  // One block per batch: its name (also the file name of its WebP), its clips, and the buttons that act on the batch.
  function batchSection(b){
    const list=batchClips(b.id),sec=document.createElement('div');
    sec.className='wm-batch'+(b.id===activeBatch?' wm-batch-active':'');sec.dataset.batch=String(b.id);
    const head=document.createElement('div');head.className='wm-batch-head';
    const name=document.createElement('input');name.type='text';name.className='wm-batch-name';name.value=b.name;name.maxLength=60;name.disabled=converting;
    name.setAttribute('aria-label','Batch name. It is also the file name of this batch\'s WebP.');
    name.addEventListener('focus',()=>setActive(b.id));
    name.addEventListener('change',()=>{let v=name.value.replace(/\s+/g,' ').trim();if(!v){name.value=b.name;return;}if(batches.some(x=>x!==b&&x.name.toLowerCase()===v.toLowerCase()))v=uniqueName(v);b.name=v;render();});
    const info=document.createElement('span');info.className='wm-batch-info';
    const len=list.length?batchSeconds(list):0;
    info.textContent=`${list.length} clip${list.length===1?'':'s'}${list.length&&len>0?` · about ${len.toFixed(1)} s`:''}`;
    const state=document.createElement('span');state.className='wm-batch-state';
    if(results.has(b.id)){state.textContent=`WebP ready · ${formatBytes(results.get(b.id).bytes)}`;state.dataset.kind='ok';}
    else if(failures.has(b.id)){state.textContent='Not converted';state.title=failures.get(b.id);state.dataset.kind='bad';}
    const mk=(text,title,cb,cls)=>{const x=document.createElement('button');x.type='button';x.className=cls||'ghost';x.textContent=text;x.title=title;x.disabled=converting;x.addEventListener('click',e=>{e.stopPropagation();cb();});return x;};
    const add=mk('+ Add files','Add files to this batch',()=>{setActive(b.id);selectFiles();});
    const conv=mk('Convert this batch','Convert only this batch to its own WebP',()=>convertOne(b.id),'secondary');conv.disabled=converting||!list.length;
    const del=mk('×','Remove this batch (its clips move to the batch before it)',()=>removeBatch(b.id));del.disabled=converting||batches.length<2;del.setAttribute('aria-label',`Remove ${b.name}`);
    head.append(name,info,state,add,conv,del);sec.append(head);
    if(!list.length){const e=document.createElement('div');e.className='wm-empty wm-batch-empty';e.textContent='Empty batch. Add files here, drop clips on it, or pick this batch on a clip.';sec.append(e);}
    else list.forEach(c=>sec.append(row(c,clips.indexOf(c))));
    sec.addEventListener('click',()=>{if(activeBatch!==b.id)setActive(b.id);});
    sec.addEventListener('dragover',event=>{
      const files=Array.from(event.dataTransfer?.types||[]).includes('Files');
      if((dragIndex<0&&!files)||converting)return;event.preventDefault();event.dataTransfer.dropEffect=files?'copy':'move';sec.classList.add('wm-batch-over');});
    sec.addEventListener('dragleave',event=>{if(!sec.contains(event.relatedTarget))sec.classList.remove('wm-batch-over');});
    sec.addEventListener('drop',event=>{
      sec.classList.remove('wm-batch-over');if(converting)return;
      if(dragIndex>=0){event.preventDefault();event.stopPropagation();const from=dragIndex;dragIndex=-1;moveToBatch(from,b.id);return;}
      if(Array.from(event.dataTransfer?.types||[]).includes('Files'))setActive(b.id);   // the file drop is then handled by the list: files go into this batch
    });
    return sec;
  }
  function setActive(id){
    if(!batches.some(b=>b.id===id)||activeBatch===id)return;
    activeBatch=id;
    document.querySelectorAll('.wm-batch').forEach(el=>el.classList.toggle('wm-batch-active',Number(el.dataset.batch)===id));
    resetSize();updateBatchUI();
  }
  // The text under "Clips", the batch buttons, and the drop zone say where new files go.
  function updateBatchUI(){
    const multi=batches.length>1,hint=$o('wm-order-hint');
    if(hint)hint.textContent=multi?`New files go into ${batchById(activeBatch).name} · drag clips to reorder or into another batch`:'Drag clips to change their order';
    const one=$o('wm-one-each');if(one){one.hidden=!(clips.length>1)||multi&&filledBatches().length>=clips.length;one.disabled=converting;}
    const merge=$o('wm-merge-all');if(merge){merge.hidden=!multi;merge.disabled=converting;}
    const nb=$o('wm-new-batch');if(nb)nb.disabled=converting||batches.length>=MAX_BATCHES;
    const copy=document.querySelector('#wm-dropzone .wm-drop-copy small');
    if(copy&&!copy.dataset.base)copy.dataset.base=copy.textContent;
    if(copy)copy.textContent=multi?`Files are added to ${batchById(activeBatch).name}. ${copy.dataset.base}`:copy.dataset.base;
  }
  function newBatch(){
    if(converting)return;
    if(batches.length>=MAX_BATCHES){error(new Error(`Up to ${MAX_BATCHES} batches.`));return;}
    const b={id:++batchSerial,name:uniqueName(`Batch ${batches.length+1}`)};
    batches.push(b);activeBatch=b.id;clearError();render();
  }
  function removeBatch(id){
    if(converting||batches.length<2)return;
    const i=batchIndex(id);if(i<0)return;
    const into=batches[i>0?i-1:1],list=batchClips(id);
    if(batchClips(into.id).length+list.length>MAX_PER_BATCH){error(new Error(`${into.name} would hold more than ${MAX_PER_BATCH} clips. Move some clips elsewhere first.`));return;}
    list.forEach(c=>{c.batchId=into.id;});
    invalidate(id,into.id);batches.splice(i,1);
    if(activeBatch===id)activeBatch=into.id;
    regroup();clearError();render();
  }
  // Every clip in a batch of its own (named after the file), for converting many files into many WebP files at once.
  function oneEach(){
    if(converting||!(clips.length>1))return;
    if(clips.length>MAX_BATCHES){error(new Error(`That would make ${clips.length} batches; up to ${MAX_BATCHES}. Put some clips in the same batch.`));return;}
    clearResult();batches=[];
    for(const c of clips){const b={id:++batchSerial,name:uniqueName(baseName(c.name)||`Batch ${batches.length+1}`)};batches.push(b);c.batchId=b.id;}
    activeBatch=batches[0].id;clearError();render();
  }
  function mergeAll(){
    if(converting||batches.length<2)return;
    if(clips.length>MAX_PER_BATCH){error(new Error(`One batch holds up to ${MAX_PER_BATCH} clips, and you have ${clips.length}.`));return;}
    clearResult();const keep=batches[0];batches=[keep];clips.forEach(c=>{c.batchId=keep.id;});activeBatch=keep.id;clearError();render();
  }
  function moveToBatch(i,batchId){
    if(converting)return;
    const c=clips[i];if(!c||!batches.some(b=>b.id===batchId))return;
    if(c.batchId===batchId){render();return;}
    if(batchClips(batchId).length>=MAX_PER_BATCH){error(new Error(`A batch holds up to ${MAX_PER_BATCH} clips.`));render();return;}
    const from=c.batchId;c.batchId=batchId;clips.splice(i,1);clips.push(c);regroup();   // a moved clip goes to the end of its new batch
    invalidate(from,batchId);clearError();render();
  }
  // The merge settings: "Seconds per image" appears only while the list has a picture; the cross-fade length only while Cross-fade is ticked.
  function updateCombineUI(){
    const w=$o('wm-image-seconds-wrap');if(w)w.hidden=!clips.some(c=>c.kind==='image');
    const on=crossfadeOn();
    const len=$o('wm-crossfade-wrap');if(len)len.hidden=!on;
    const biggest=Math.max(0,...batches.map(b=>batchClips(b.id).length));
    const hint=$o('wm-crossfade-hint');if(hint)hint.textContent=on&&biggest<=1?'Add a second clip to a batch to use the cross-fade.':`Shortest allowed: ${timeline.MIN_CROSSFADE} seconds.`;
    const note=$o('wm-length-note');
    if(note){
      const x=on&&biggest>1&&crossfadeSeconds()>0?crossfadeSeconds():0;
      const total=clips.length?batchSeconds(defaultList()):0;
      note.textContent=batches.length>1?(filledBatches().length?`${filledBatches().length} batches, each joined on its own${x?` (each cross-fade overlaps ${x} s)`:''}. Each one is saved as its own WebP.`:''):(clips.length&&total>0?`Total length about ${total.toFixed(1)} s${x?` (each cross-fade overlaps ${x} s)`:''}.`:'');
    }
  }
  function removeClip(i){if(converting)return;const [c]=clips.splice(i,1);untrack(c);clearError();invalidate(c.batchId);render();}
  function move(from,to){
    if(converting||from===to||from<0||to<0||to>=clips.length||from>=clips.length)return;
    const target=clips[to],fromBatch=clips[from].batchId;
    if(target.batchId!==fromBatch&&batchClips(target.batchId).length>=MAX_PER_BATCH){error(new Error(`A batch holds up to ${MAX_PER_BATCH} clips.`));return;}
    const [c]=clips.splice(from,1);c.batchId=target.batchId;clips.splice(to,0,c);regroup();   // dropped on a clip of another batch: it joins that batch at that place
    invalidate(fromBatch,c.batchId);render();
  }
  // Some AI video tools produce WebM/VP9 streams with a .mp4 extension and
  // no duration element. Inspect the real container, then give Chromium the
  // matching MIME hint. The original file bytes are not modified or uploaded.
  function loadMetadata(file){
    return new Promise((resolve,reject)=>{
      if(!file.size){reject(new Error(`${file.name} is empty.`));return;}
      let url=null,probe={},container='mp4',timer=null,seekTimer=null,done=false,triedSeek=false;
      const video=document.createElement('video');
      video.muted=true;video.preload='auto';video.playsInline=true;
      function cleanup(){
        clearTimeout(timer);clearTimeout(seekTimer);
        for(const event of ['loadedmetadata','loadeddata','durationchange','canplay','seeked'])video.removeEventListener(event,check);
        video.removeEventListener('error',bad);
      }
      function fail(message){
        if(done)return;done=true;cleanup();
        try{video.removeAttribute('src');video.load();}catch{}
        if(url)URL.revokeObjectURL(url);
        reject(new Error(message));
      }
      function bad(){fail(`Unsupported or unreadable video format in ${file.name}. Try a standard MP4 or VP9 WebM file.`);}
      function duration(){
        if(container==='webm'&&Number.isFinite(probe.duration)&&probe.duration>0)return probe.duration;
        if(Number.isFinite(video.duration)&&video.duration>0)return video.duration;
        if(Number.isFinite(probe.duration)&&probe.duration>0)return probe.duration;
        if(video.seekable?.length){
          try{const end=video.seekable.end(video.seekable.length-1);
            if(Number.isFinite(end)&&end>0)return end;}catch{}
        }
        if(triedSeek&&!video.seeking&&video.readyState>=2&&video.currentTime>0&&video.currentTime<1e9)return video.currentTime;
        return null;
      }
      function check(){
        if(done)return;
        const width=video.videoWidth||(video.readyState>=2?probe.width:0);
        const height=video.videoHeight||(video.readyState>=2?probe.height:0);
        const seconds=duration();
        if(!width||!height||!Number.isFinite(seconds)||seconds<=0)return;
        done=true;cleanup();
        resolve({kind:'video',file,url,video,name:file.name,bytes:file.size,width,height,duration:seconds,container,
          key:[file.name,file.size,file.lastModified].join('|'),instanceId:++clipInstanceSerial,freeformSelection:null});
      }
      for(const event of ['loadedmetadata','loadeddata','durationchange','canplay','seeked'])video.addEventListener(event,check);
      video.addEventListener('error',bad,{once:true});
      (async()=>{
        const webm=await (window.webpWebmProbe?.probeWebm?.(file)||Promise.resolve(null)).catch(()=>null);
        if(done)return;
        if(webm?.container==='webm'){
          container='webm';probe=webm;
          url=URL.createObjectURL(new Blob([file],{type:'video/webm'}));
        }else{
          url=URL.createObjectURL(file);
          (window.webpMp4Probe?.probeMp4?.(file)||Promise.resolve({})).then(info=>{
            if(!done){probe=info||{};check();}
          }).catch(()=>{});
        }
        timer=setTimeout(()=>fail(`Unable to read metadata for ${file.name}. The codec or duration may be unsupported.`),25000);
        if(container==='mp4')seekTimer=setTimeout(()=>{
          if(done||Number.isFinite(video.duration)||video.readyState<1)return;
          triedSeek=true;try{video.currentTime=1e9;}catch{}
        },1200);
        video.src=url;video.load();check();
      })().catch(e=>fail(`Could not inspect ${file.name}: ${e.message||e}`));
    });
  }
  // A picture (PNG, JPG or a still WebP) is drawn once onto a canvas; the canvas stands in for the video wherever the app draws a clip.
  function stillCanvas(source,w,h,limit){
    const scale=limit?Math.min(1,4096/Math.max(w,h)):1;
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
    const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(source,0,0,c.width,c.height);
    c.readyState=4;   // the crop preview waits for a video's readyState; a finished picture is always ready
    return c;
  }
  const makeClip=(file,kind,canvas,extra)=>Object.assign({kind,file,url:null,video:canvas,name:file.name,bytes:file.size,width:canvas.width,height:canvas.height,container:kind,
    key:[file.name,file.size,file.lastModified].join('|'),instanceId:++clipInstanceSerial,freeformSelection:null},extra);
  async function loadImageClip(file){
    if(!file.size)throw new Error(`${file.name} is empty.`);
    let bitmap;
    try{bitmap=await window.ImageFormats.toDrawable(file,{heic:(b,n)=>window.juicyApp.imageHeicToPng(b,n)});}     // any picture: PNG, JPG, GIF, BMP, TIFF, AVIF, HEIC, ICO, SVG...
    catch(e){throw new Error(e&&e.message?e.message:`Could not read ${file.name}. Choose a picture file.`);}
    try{return makeClip(file,'image',stillCanvas(bitmap,bitmap.width,bitmap.height,true),{duration:0});}finally{if(bitmap.close)bitmap.close();}
  }
  async function loadWebpClip(file){
    if(!file.size)throw new Error(`${file.name} is empty.`);
    const buffer=await file.arrayBuffer();
    let info;
    try{info=timeline.parseWebp(buffer);}catch{throw new Error(`${file.name} is not a valid WebP file.`);}
    if(!info.animated)return loadImageClip(file);   // a still WebP is a picture, like a PNG
    if(typeof ImageDecoder==='undefined')throw new Error('This version of the app cannot read animated WebP files.');
    let decoder=null;
    try{
      decoder=new ImageDecoder({data:buffer,type:'image/webp'});
      await decoder.tracks.ready;
      const first=await decoder.decode({frameIndex:0});
      try{return makeClip(file,'webp',stillCanvas(first.image,first.image.displayWidth,first.image.displayHeight,false),{decoder,frames:info.frames,starts:info.starts,duration:info.duration});}
      finally{try{first.image.close();}catch{}}
    }catch(e){try{decoder?.close();}catch{}throw new Error(`Could not read ${file.name}: ${e.message||e}`);}
  }
  async function addFiles(files){
    if(converting||adding||!files.length)return;
    adding=true;clearError();let added=false;
    try{
      const picked=Array.from(files);
      if(picked.some(f=>!kindOf(f.name)))throw new Error('Choose MP4, WebM or picture files (WebP, PNG, JPG, GIF, BMP, TIFF, AVIF, HEIC, ICO, SVG).');
      if(clips.length+picked.length>MAX_CLIPS)throw new Error(`Choose up to ${MAX_CLIPS} clips.`);
      const known=new Set(clips.map(f=>f.key));
      for(const file of picked){
        const key=[file.name,file.size,file.lastModified].join('|');
        if(known.has(key))continue;
        if(batchClips(activeBatch).length>=MAX_PER_BATCH)throw new Error(`${batchById(activeBatch).name} is full (${MAX_PER_BATCH} clips in one batch). Add a new batch for the rest.`);
        const kind=kindOf(file.name);
        const clip=kind==='video'?await loadMetadata(file):kind==='webp'?await loadWebpClip(file):await loadImageClip(file);
        clip.batchId=activeBatch;clips.push(clip);known.add(key);added=true;
      }
    }catch(e){error(e);}finally{adding=false;if(added){regroup();invalidate(activeBatch);render();}}
  }
  function selectFiles(){if(converting||adding)return;$('wm-input').click();}
  function drop(event){
    event.preventDefault();event.stopPropagation();$('wm-dropzone').classList.remove('wm-hover');
    if(converting)return;
    addFiles(Array.from(event.dataTransfer?.files||[]));
  }
  // Seek completion may precede presentation of a VP9 frame. Wait for a
  // compositor frame where available; fall back after 100ms if a duplicated
  // 16 FPS source frame prevents Chromium from issuing another callback.
  function seek(video,seconds){
    return new Promise((resolve,reject)=>{
      let timeout,settleTimer,frameId=null,settled=false,seeked=false,frame=null;
      function cleanup(){
        clearTimeout(timeout);clearTimeout(settleTimer);
        video.removeEventListener('seeked',onSeeked);video.removeEventListener('error',fail);
        if(frameId!==null&&video.cancelVideoFrameCallback){try{video.cancelVideoFrameCallback(frameId);}catch{}}
      }
      function done(){if(settled)return;settled=true;cleanup();resolve();}
      function fail(){if(settled)return;settled=true;cleanup();reject(new Error('Could not decode a frame from the video.'));}
      function acceptFrame(_,metadata){
        frameId=null;if(settled)return;
        const current=Number(metadata?.mediaTime);
        if(Number.isFinite(current)&&Math.abs(current-seconds)>.35){
          if(!video.seeking&&seeked){
            settled=true;cleanup();reject(new Error(`Video decoder returned a stale frame (${current.toFixed(2)}s vs ${seconds.toFixed(2)}s). Conversion stopped to avoid a slideshow.`));
            return;
          }
          frameId=video.requestVideoFrameCallback(acceptFrame);return;
        }
        frame=metadata||{};if(seeked)done();
      }
      function onSeeked(){
        seeked=true;
        if(frame!==null||typeof video.requestVideoFrameCallback!=='function')done();
        else settleTimer=setTimeout(()=>{if(!video.seeking&&video.readyState>=2)done();},100);
      }
      video.addEventListener('seeked',onSeeked,{once:true});video.addEventListener('error',fail,{once:true});
      timeout=setTimeout(()=>{
        if(settled)return;settled=true;cleanup();
        reject(new Error('Video frame decoding timed out. Conversion stopped rather than exporting a slideshow.'));
      },15000);
      try{
        if(typeof video.requestVideoFrameCallback==='function')frameId=video.requestVideoFrameCallback(acceptFrame);
        video.currentTime=seconds;
        if(!video.seeking&&video.readyState>=2&&Math.abs(video.currentTime-seconds)<.0001)onSeeked();
      }catch(e){settled=true;cleanup();reject(e);}
    });
  }
  function png(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not render a PNG frame.')),'image/png'));}
  // One picture of a clip at `t` seconds into it: a video is sought to that moment, an animated WebP is decoded at that frame, a picture is just itself.
  async function sourceAt(clip,t){
    if(clip.kind==='webp'){
      const i=Math.min(clip.frames.length-1,timeline.frameIndexAt(clip.starts,t));
      const r=await clip.decoder.decode({frameIndex:i});
      return {img:r.image,done(){try{r.image.close();}catch{}}};
    }
    if(clip.kind==='video')await seek(clip.video,t);
    return {img:clip.video,done(){}};
  }
  // Draw that picture onto a black canvas, cropped or fitted the same way for every kind of clip.
  async function drawClip(clip,t,ctx,settings){
    const {width,height}=settings;
    const r=geometry.rect(clip.width,clip.height,width,height,settings.crop,settings.position,clip.freeformSelection);
    const src=await sourceAt(clip,t);
    try{ctx.fillStyle='#000000';ctx.fillRect(0,0,width,height);ctx.drawImage(src.img,r.sx,r.sy,r.sw,r.sh,r.dx,r.dy,r.dw,r.dh);}finally{src.done();}
  }
  // Every planned frame in order. A cross-fade frame is the outgoing clip with the incoming clip drawn over it at its blend weight, each on its own black
  // background, so a clip that does not fill the frame fades out to black instead of staying put.
  async function capture(framePlan,settings,canvas,ctx,list){
    const {width,height}=settings,total=framePlan.frames.length;
    let canvas2=null,ctx2=null;
    if(framePlan.frames.some(f=>f.blend)){
      canvas2=document.createElement('canvas');canvas2.width=width;canvas2.height=height;
      ctx2=canvas2.getContext('2d',{alpha:false});if(!ctx2)throw new Error('Unable to initialize the local video canvas.');
      ctx2.imageSmoothingEnabled=true;ctx2.imageSmoothingQuality='high';
    }
    for(let k=0;k<total;k++){
      if(cancelled)throw new Error('Conversion cancelled.');
      const f=framePlan.frames[k];
      if(f.blend){
        await drawClip(list[f.blend.clip],f.blend.t,ctx,settings);
        await drawClip(list[f.clip],f.t,ctx2,settings);
        ctx.globalAlpha=f.blend.alpha;ctx.drawImage(canvas2,0,0);ctx.globalAlpha=1;
      }else await drawClip(list[f.clip],f.t,ctx,settings);
      if(cancelled)throw new Error('Conversion cancelled.');
      const data=await (await png(canvas)).arrayBuffer();
      await api.webpFrame(data);
      const complete=k+1;
      if(complete%5===0||complete===total)progress({title:'Preparing frames',detail:`${complete} of ${total} frames captured at ${width} × ${height}.`,percent:5+Math.floor(49*complete/total)});
    }
  }
  // When a method cannot get under 9.99 MB, a pop-up offers the next one in this order; Proceed starts it right away. Every
  // method after the first starts over at 24 FPS / Q80 (or the frame rate the videos were decoded at, if that is lower) and
  // runs the same FPS / quality steps on the frames already decoded from the MP4s: nothing is decoded again.
  const STAGES=[
    {method:'standard',name:'Standard encoding'},
    {method:'grain',name:'Grain reduction',about:'Smooths fine grain and noise in every frame (ImageMagick -enhance) before it is encoded, so the same quality takes fewer bytes. Edges are kept; very fine grain is softened.'},
    {method:'motion',name:'Motion-timed frames',about:'Keeps every frame at full quality, but where the picture barely changes it shows a frame a little longer instead of the next one: up to a third of the frames in each clip, never two in a row. Busy moments keep their frame rate; calm stretches play at a lower one. The length stays the same.'},
    {method:'quality',name:'Lower quality',about:'Keeps every frame and lets quality go below 75, down to 40, in the same 5-point steps. Motion stays smooth, but fine detail and textures get softer.'}
  ];
  let lastSourceFps=0;   // the frame rate the cached frames were decoded at
  const stageFps=()=>Math.max(19,Math.min(24,lastSourceFps||24));
  // The pop-up after a method fails: names the next method; resolves true for Proceed, false for Cancel / Escape.
  function askNextStage(stage,next,message){
    return new Promise(resolve=>{
      const back=document.createElement('div');
      back.style.cssText='position:fixed;inset:0;z-index:100001;background:rgba(8,4,14,.62);display:flex;align-items:center;justify-content:center;padding:20px';
      const box=document.createElement('div');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
      box.style.cssText='width:100%;max-width:520px;background:#1a1224;border:1px solid #5b3b78;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.6);padding:20px 22px;color:#f3e8fb;font:14px/1.5 system-ui,sans-serif';
      const para=(text,css)=>{const p=document.createElement('p');p.textContent=text;p.style.cssText='margin:0 0 10px;'+(css||'');return p;};
      const title=document.createElement('h3');title.textContent=`${STAGES[stage].name} couldn't get under 9.99 MB`;
      title.style.cssText='margin:0 0 10px;font-size:17px';box.setAttribute('aria-label',title.textContent);
      box.append(title);
      const found=message.match(/the file is ([\d.]+ MB) at (\d+) FPS and quality (\d+)/);
      if(found)box.append(para(`Its last try was ${found[1]} at ${found[2]} FPS / quality ${found[3]}, the lowest this method goes.`,'color:#d9c6ea'));
      box.append(para(`Next: ${next.name}`,'font-weight:700;margin-bottom:4px'),para(next.about),
        para(`It starts over at ${stageFps()} FPS / quality 80 and goes down the same steps, using the frames already decoded from your videos (no video decoding).`,'color:#d9c6ea'));
      const row=document.createElement('div');row.style.cssText='display:flex;justify-content:flex-end;gap:10px;margin-top:16px';
      const button=(text,primary)=>{const b=document.createElement('button');b.type='button';b.textContent=text;
        b.style.cssText='border-radius:8px;padding:8px 16px;cursor:pointer;font:600 14px system-ui,sans-serif;'+(primary?'background:#7b4bb0;color:#fff;border:1px solid #9d6fd3':'background:transparent;color:#f3e8fb;border:1px solid #5b3b78');return b;};
      const cancel=button('Cancel',false),proceed=button('Proceed',true);
      row.append(cancel,proceed);box.append(row);back.append(box);document.body.append(back);
      const done=go=>{document.removeEventListener('keydown',key,true);back.remove();resolve(go);};
      const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(false);}};
      document.addEventListener('keydown',key,true);
      cancel.onclick=()=>done(false);proceed.onclick=()=>done(true);
      proceed.focus();
    });
  }
  // Converts ONE batch to its own WebP: 'ok', 'failed', 'cancelled' or 'skipped'. ctx.multi is true while several batches are converted in one run:
  // then the messages are collected and shown once at the end, and the preview is shown once at the end.
  async function convert(stageArg,batchId,ctx){
    const batch=batchById(batchId),list=batchClips(batch.id);
    if(converting||list.length===0)return 'skipped';
    ctx=ctx||{multi:false,errors:[]};
    const multi=!!ctx.multi;
    const stage=Number.isInteger(stageArg)?stageArg:0;   // a click on Convert passes an event: that is the first method
    let nextStage=0,outcome='failed';
    dismissNotice();clearError();hideResult();invalidate(batch.id);navStatus('idle');
    let width,height,fps,quality,crop,position;
    try{
      if(list.length>MAX_PER_BATCH)throw new Error(`${batch.name} has ${list.length} clips; a batch holds up to ${MAX_PER_BATCH}.`);
      ({width,height}=dimensions(list));
      fps=Number($('wm-fps').value);quality=Number($('wm-quality').value);
      crop=$('wm-crop').value;position=$('wm-crop-position').value;
      if(!Number.isInteger(fps)||fps<19||fps>60)throw new Error('Choose a frame rate from 19 to 60 FPS.');
      if(!Number.isInteger(quality)||quality<50||quality>99)throw new Error('Choose a quality from 50 to 99.');
      if(stage>0){fps=stageFps();quality=80;}
      const original=list[0];
      if(stage===0&&(width!==original.width||height!==original.height)&&!ctx.confirmedDims){
        if(!window.confirm(`${multi?batch.name+': ':''}Change output dimensions from ${original.width} × ${original.height} to ${width} × ${height}?\n\nWebP Maker will never change them automatically.`)){ctx.declined=true;outcome='cancelled';return outcome;}
        ctx.confirmedDims=true;   // one yes covers every batch of this run
      }
      const mismatched=list.filter(c=>c.width!==width||c.height!==height);
      if(stage===0&&crop==='fit'&&mismatched.length&&width===original.width&&height===original.height&&!ctx.confirmedFit){
        if(!window.confirm(`${multi?batch.name+': ':''}Some clips have different dimensions. They will be fitted into the first video\'s frame without stretching or cropping. Continue?`)){ctx.declined=true;outcome='cancelled';return outcome;}
        ctx.confirmedFit=true;
      }
      if(list.some(c=>c.kind==='image')&&!(imageSeconds()>=0.25&&imageSeconds()<=60))throw new Error('Seconds per image must be from 0.25 to 60.');
      const fade=crossfadeSeconds();
      if(crossfadeOn()&&list.length>1&&!(fade>=timeline.MIN_CROSSFADE))throw new Error(`The cross-fade must be at least ${timeline.MIN_CROSSFADE} seconds.`);
      let framePlan;
      try{framePlan=timeline.plan({durations:list.map(clipSeconds),fps,crossfade:list.length>1&&fade>0?fade:0});}
      catch(e){
        if(e.clipIndex===undefined)throw e;
        const c=list[e.clipIndex];
        throw new Error(`"${c.name}" is only ${e.have.toFixed(2)} seconds long, but a ${fade} second cross-fade needs ${e.need.toFixed(2)} seconds here (a clip in the middle of the list is faded at both ends, the first and last clip at one end). Use a shorter cross-fade${c.kind==='image'?', raise Seconds per image':''} or a longer clip.`);
      }
      const counts=framePlan.counts;
      const expectedFrames=framePlan.frames.length;
      if(expectedFrames>MAX_FRAMES)throw new Error(`That frame rate would create ${expectedFrames} frames. Choose a lower FPS (${MAX_FRAMES} maximum) or use shorter clips.`);
      if(width>4096||height>4096)throw new Error('Output dimensions must be 4096 pixels or smaller on each side.');
      cancelled=false;busy(true);navStatus('running');$('wm-progress-wrap').hidden=false;
      progress({title:stage?STAGES[stage].name:'Starting conversion',detail:stage?`Starting over at ${fps} FPS / quality ${quality} with the frames already decoded from your videos.`:'Reading your clips on this computer. No FFmpeg and no uploads.',percent:0});
      // Source IDs include the clip order. Cached frames are never reused for
      // different videos, a different order, or a different output size.
      const cropModes=['fit','16:9','9:16','3:4','4:3','1:1','fill','freeform'];
      const positions=['center','top','bottom','left','right'];
      const selections=crop==='freeform'?list.flatMap(c=>{
        const region=geometry.region(c.width,c.height,width,height,c.freeformSelection);
        return [region.cx,region.cy,region.scale].map(x=>String(Math.round(x*1000000)));
      }):[];
      // Numeric IDs only: the backend uses numeric validation for frame keys.
      // the cross-fade and the seconds per picture change the frames, so they are part of the key (whole milliseconds: the backend wants numbers only)
      const sourceKey=[...list.map(c=>c.instanceId),cropModes.indexOf(crop),positions.indexOf(position),...selections,Math.round(framePlan.crossfade*1000),list.some(c=>c.kind==='image')?Math.round(imageSeconds()*1000):0].join(',');
      const prepared=await api.webpBegin({width,height,fps,quality,expectedFrames,clipFrames:counts,sourceKey,method:STAGES[stage].method});
      lastSourceFps=prepared.sourceFps||fps;
      if(prepared.cached){
        progress({title:'Reusing decoded video frames',detail:`${prepared.cachedFrames} lossless frames already captured at ${prepared.sourceFps} FPS. No new video decoding.`,percent:54});
      }else{
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx2d=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
        if(!ctx2d)throw new Error('Unable to initialize the local video canvas.');
        ctx2d.imageSmoothingEnabled=true;ctx2d.imageSmoothingQuality='high';
        await capture(framePlan,{width,height,crop,position},canvas,ctx2d,list);
      }
      if(cancelled){outcome='cancelled';return outcome;}
      const result=await api.webpFinish();
      if(cancelled){outcome='cancelled';return outcome;}
      // the finished WebP is kept under its batch, so converting the next batch cannot remove it
      try{await api.webpStash(String(batch.id));}catch(e){throw new Error('Could not keep the finished WebP: '+String(e?.message||e).replace(/^Error invoking remote method '[^']*': (Error: )?/,''));}
      const details=[['Method',result.methodLabel||STAGES[stage].name],['Quality',result.sceneQualities?result.sceneQualities.map((q,i)=>`Clip ${i+1}: ${q}`).join(' · '):result.quality],['Resolution',`${result.width} × ${result.height}`],['Framing',crop==='fit'?'Fit':crop==='freeform'?'Freeform (per clip)':`Crop (${crop==='fill'?'custom':crop})`],['Frame rate',result.method==='motion'?`${result.fps} FPS, motion-timed (${result.averageFps} average)`:`${result.fps} FPS`],['Duration',`${result.duration}s`],['Frames',result.frames]];
      const adaptive=Array.isArray(result.sceneQualities)&&result.sceneQualities.length>1;
      const adjustments=[];
      if(stage>0)adjustments.push(`${STAGES[stage].name}, started over at ${fps} FPS / Q${quality}`);
      if(result.fps!==fps)adjustments.push(`FPS ${fps} → ${result.fps}`);
      if(adaptive)adjustments.push(`Adaptive quality: ${result.sceneQualities.map((q,i)=>`${list[i]?.name||'Clip '+(i+1)} Q${q}`).join(', ')}`);
      else if(result.quality!==quality)adjustments.push(`Quality ${quality} → ${result.quality}`);
      results.set(batch.id,{bytes:result.bytes,details,note:adjustments.length?`To stay under 9.99 MB: ${adjustments.join('; ')}. Output dimensions unchanged.`:''});
      failures.delete(batch.id);
      if(!multi)await showResult(batch.id);
      progress({title:'Conversion complete',detail:'Animated WebP ready to preview and save.',percent:100});
      if(!multi){navStatus('complete');notify('complete',1);}
      outcome='ok';
    }catch(e){if(!cancelled){
      const message=String(e?.message||e||''),over=message.includes('still exceeds 9.99 MB');
      const next=over&&stage+1<STAGES.length?STAGES[stage+1]:null;
      const shown=over&&!next?message+' Decoded frames are saved for retry. Adjust quality or FPS and click Convert; no video re-decoding is needed.':over?message:e;
      const shownText=String(shown?.message||shown||'Conversion failed.');
      failures.set(batch.id,shownText);
      if(!multi){error(shown);if(over)await showOversize();navStatus('failed');notify('failed');}
      try{await api.webpCancel();}catch{}
      if(next&&await askNextStage(stage,next,message))nextStage=stage+1;
      else if(multi)ctx.errors.push(`${batch.name}: ${shownText}`);
    }else outcome='cancelled';}
    finally{if(cancelled)navStatus('idle');busy(false);render();}
    if(nextStage)return convert(nextStage,batchId,ctx);
    return outcome;
  }
  // The Convert button: every batch that has clips is converted, one after the other, each into its own WebP.
  async function convertAll(){
    if(converting||adding)return;
    const ids=filledBatches().map(b=>b.id);if(!ids.length)return;
    const ctx={multi:ids.length>1,errors:[],confirmedDims:false,confirmedFit:false,declined:false,label:''};
    run=ctx;cancelled=false;clearResult();dismissNotice();
    let ok=0,failed=0,stopped=false;
    try{
      for(let k=0;k<ids.length;k++){
        const b=batchById(ids[k]);ctx.label=`Batch ${k+1} of ${ids.length}: ${b.name}`;
        const o=await convert(0,ids[k],ctx);
        if(o==='ok')ok++;else if(o==='failed')failed++;
        if(o==='cancelled'||cancelled||ctx.declined){stopped=true;break;}
      }
    }finally{run=null;}
    await finishRun(ctx,ids.length,ok,failed,stopped);
  }
  async function convertOne(id){
    if(converting||adding||!batchClips(id).length)return;
    const ctx={multi:false,errors:[],confirmedDims:false,confirmedFit:false,declined:false,label:''};
    run=ctx;cancelled=false;
    try{await convert(0,id,ctx);}finally{run=null;}
    await restoreShown();
  }
  // After a run: the last finished WebP is shown, and what went wrong is listed once.
  async function finishRun(ctx,total,ok,failed,stopped){
    if(ctx.multi){
      clearError();
      if(ctx.errors.length){error(new Error(ctx.errors.join('\n')));$('wm-error').style.whiteSpace='pre-line';}else $('wm-error').style.whiteSpace='';
      const parts=[`${ok} of ${total} WebP file${total===1?'':'s'} ready`];if(failed)parts.push(`${failed} failed`);if(stopped)parts.push('stopped');
      $('wm-progress-wrap').hidden=false;
      $('wm-progress-title').textContent=stopped?'Stopped':ok?'Conversion complete':'Conversion failed';
      $('wm-progress-detail').textContent=parts.join(' · ')+'.';
      $('wm-progress-pct').textContent=ok===total?'100%':'';$('wm-progress-bar').style.width=(100*ok/Math.max(1,total))+'%';
      if(!stopped){if(ok){navStatus('complete');notify('complete',ok);}else{navStatus('failed');notify('failed');}}
    }
    await restoreShown();
  }
  async function restoreShown(){
    if(ready||!results.size)return;
    const last=[...batches].reverse().find(b=>results.has(b.id));
    if(last)await showResult(last.id);
  }
  // Show one batch's finished WebP in the preview (read back from the copy the app kept for that batch).
  async function showResult(id){
    const rec=results.get(id);if(!rec)return;
    let preview;try{preview=await api.webpStashPreview(String(id));}catch(e){error(e);return;}
    $('wm-preview').src=preview.data;
    $('wm-preview-placeholder').hidden=true;$('wm-result').hidden=false;$('wm-expand').disabled=false;
    $('wm-result-size').textContent=formatBytes(rec.bytes);
    overShown=false;setBadge(false);
    $('wm-size-bar').style.width=`${Math.min(100,100*rec.bytes/MAX_BYTES).toFixed(2)}%`;
    const details=$('wm-result-details');details.replaceChildren();
    for(const [k,value] of rec.details){
      const el=document.createElement('div'),title=document.createElement('span'),desc=document.createElement('strong');
      title.textContent=k;desc.textContent=String(value);el.append(title,desc);details.append(el);
    }
    $('wm-result-note').hidden=!rec.note;$('wm-result-note').textContent=rec.note||'';
    shownBatch=id;ready=true;renderResultChips();
  }
  // One button per finished batch (pick which WebP the preview shows), and "Save all" once there are two or more.
  function renderResultChips(){
    const box=$o('wm-batch-results'),all=$o('wm-save-all'),one=$('wm-save');
    const many=results.size>1||(batches.length>1&&results.size>0);
    if(box){
      box.replaceChildren();box.hidden=!many;
      for(const b of batches){
        if(!results.has(b.id))continue;
        const x=document.createElement('button');x.type='button';x.className='wm-chip'+(b.id===shownBatch&&!overShown?' wm-chip-on':'');
        x.textContent=`${b.name} · ${formatBytes(results.get(b.id).bytes)}`;x.setAttribute('aria-pressed',String(b.id===shownBatch));x.title=`Show the WebP of ${b.name}`;
        x.addEventListener('click',()=>{if(!converting&&b.id!==shownBatch)showResult(b.id);});box.append(x);
      }
    }
    if(all){all.hidden=results.size<2;all.textContent=`↓ Save all ${results.size} WebP files…`;all.disabled=converting;}
    if(one)one.textContent=results.size>1?'↓ Save this WebP':'↓ Save animated WebP';
  }
  // The badge next to the size: green "Under 9.99 MB", or red "Over 9.99 MB" for the too-big file that is kept after a failed conversion.
  function setBadge(over,bytes){
    const b=document.getElementById('wm-result-badge');if(!b)return;
    b.textContent=over?`Over 9.99 MB by ${((bytes-MAX_BYTES)/1048576).toFixed(2)} MB`:'Under 9.99 MB';
    b.style.background=over?'#4a1d24':'';b.style.color=over?'#ffb3bd':'';
  }
  // A failed conversion keeps its closest too-big file: it is shown here (with its real size) so it can be looked at and saved with right-click > Save image as.
  async function showOversize(){
    try{
      const p=await api.webpPreview(true);
      if(!p||!p.data)return;
      $('wm-preview').src=p.data;
      $('wm-preview-placeholder').hidden=true;$('wm-result').hidden=false;$('wm-expand').disabled=false;
      $('wm-result-size').textContent=formatBytes(p.bytes);
      $('wm-size-bar').style.width='100%';
      setBadge(true,p.bytes);
      $('wm-result-details').replaceChildren();
      $('wm-result-note').hidden=false;
      $('wm-result-note').textContent=`This file is ${formatBytes(p.bytes)}, over the 9.99 MB limit. It is kept so you can look at it or save it (right-click the preview > Save image as). Lower the FPS or quality and convert again to get one under the limit.`;
      ready=true;overShown=true;
    }catch{}
  }
  // Right-click on the finished WebP: Save image as... (Electron has no context menu of its own).
  var saveMenu=null;
  function closeSaveMenu(){if(saveMenu){saveMenu.remove();saveMenu=null;}}
  function openSaveMenu(e){
    if(!ready)return;
    e.preventDefault();closeSaveMenu();
    const m=document.createElement('div');m.setAttribute('role','menu');
    m.style.cssText='position:fixed;z-index:100000;min-width:190px;padding:5px;background:#1a1224;border:1px solid #5b3b78;border-radius:9px;box-shadow:0 10px 30px rgba(0,0,0,.55);font:13px system-ui,sans-serif';
    const add=(label,fn)=>{
      const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.textContent=label;
      b.style.cssText='display:block;width:100%;text-align:left;background:transparent;color:#f3e8fb;border:0;border-radius:6px;padding:8px 11px;cursor:pointer;font:inherit';
      b.onmouseenter=b.onfocus=()=>{b.style.background='#3a2452';};b.onmouseleave=b.onblur=()=>{b.style.background='transparent';};
      b.onclick=()=>{closeSaveMenu();fn();};m.append(b);
    };
    add('Save image as…',save);
    if(results.size>1)add(`Save all ${results.size} WebP files…`,saveAll);
    add('View larger',()=>previewFullscreen(true));
    document.body.append(m);saveMenu=m;
    const x=e.clientX||e.target.getBoundingClientRect().left+10,y=e.clientY||e.target.getBoundingClientRect().top+10;
    m.style.left=Math.max(4,Math.min(x,innerWidth-m.offsetWidth-4))+'px';m.style.top=Math.max(4,Math.min(y,innerHeight-m.offsetHeight-4))+'px';
    m.querySelector('button').focus();
  }
  document.addEventListener('pointerdown',e=>{if(saveMenu&&!saveMenu.contains(e.target))closeSaveMenu();},true);
  document.addEventListener('keydown',e=>{if(saveMenu&&e.key==='Escape'){e.stopPropagation();closeSaveMenu();}},true);
  window.addEventListener('blur',closeSaveMenu);
  async function save(){
    if(!ready||converting)return;
    if(overShown){   // the too-big file kept after a failed single conversion is still the live result
      const name=(clips[0]?.name||'animation').replace(/\.(mp4|webm|webp|png|jpe?g)$/i,'').replace(/[^A-Za-z0-9 _.-]/g,'_').slice(0,80)+'_Animated.webp';
      try{const r=await api.webpSave(name,true);if(r?.saved){$('wm-result-note').hidden=false;$('wm-result-note').textContent='Saved: '+r.path;}}catch(e){error(e);}
      return;
    }
    if(shownBatch===null||!results.has(shownBatch))return;
    const b=batchById(shownBatch);
    const name=batches.length>1?`${b.name}.webp`:(baseName((batchClips(b.id)[0]||{}).name||'animation').replace(/[^A-Za-z0-9 _.-]/g,'_').slice(0,80)||'animation')+'_Animated.webp';
    try{const r=await api.webpStashSave(String(shownBatch),name);if(r?.saved){$('wm-result-note').hidden=false;$('wm-result-note').textContent='Saved: '+r.path;}}catch(e){error(e);}
  }
  // Every finished batch, each as its own .webp (named after the batch), into one folder you choose. Nothing is overwritten.
  async function saveAll(){
    if(converting||results.size<2)return;
    const entries=batches.filter(b=>results.has(b.id)).map(b=>({key:String(b.id),name:b.name}));
    try{
      const r=await api.webpStashSaveAll(entries);
      if(r&&r.saved){const n=$('wm-result-note');n.hidden=false;n.textContent=`Saved ${r.saved} WebP file${r.saved===1?'':'s'} to ${r.dir}: ${r.files.map(f=>f.name).join(', ')}`;}
    }catch(e){error(e);}
  }
  for(const id of ['wm-image-seconds','wm-crossfade-seconds'])$o(id)?.addEventListener('input',()=>{clearResult();render();});
  $o('wm-crossfade-on')?.addEventListener('change',()=>{clearResult();render();});
  $('wm-add').addEventListener('click',selectFiles);
  $('wm-dropzone').addEventListener('click',selectFiles);
  $('wm-dropzone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectFiles();}});
  $('wm-input').addEventListener('change',e=>{addFiles(Array.from(e.target.files||[]));e.target.value='';});
  $('wm-dropzone').addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';$('wm-dropzone').classList.add('wm-hover');});
  $('wm-dropzone').addEventListener('dragleave',e=>{if(!e.currentTarget.contains(e.relatedTarget))$('wm-dropzone').classList.remove('wm-hover');});
  $('wm-dropzone').addEventListener('drop',drop);
  $('wm-clips').addEventListener('dragover',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files'))e.preventDefault();});
  $('wm-clips').addEventListener('drop',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files'))drop(e);});
  $('wm-clear').addEventListener('click',()=>{if(converting)return;clips.forEach(untrack);clips=[];batches=[{id:++batchSerial,name:'Batch 1'}];activeBatch=batches[0].id;clearResult();clearError();render();});
  $o('wm-new-batch')?.addEventListener('click',newBatch);
  $o('wm-one-each')?.addEventListener('click',oneEach);
  $o('wm-merge-all')?.addEventListener('click',mergeAll);
  $o('wm-save-all')?.addEventListener('click',saveAll);
  $('wm-size').addEventListener('change',()=>{
    clearResult();
    if($('wm-size').value==='custom'&&clips.length){
      const prior=$('wm-output-dimensions').textContent.match(/Output (\d+) × (\d+)/);
      if(prior){$('wm-width').value=prior[1];$('wm-height').value=prior[2];}
    }
    updateSizeUI();
  });
  $('wm-crop').addEventListener('change',()=>{
    const crop=$('wm-crop').value;
    if(crop==='freeform'&&clips.length){
      const prior=$('wm-output-dimensions').textContent.match(/Output (\d+) × (\d+)/);
      if(prior){$('wm-size').value='custom';$('wm-width').value=prior[1];$('wm-height').value=prior[2];}
    }
    if(Object.hasOwn(geometry.ratios,crop)){
      if($('wm-size').value==='original')$('wm-size').value='480';
      if($('wm-size').value==='custom'){
        const w=Math.max(480,Number($('wm-width').value)||480);
        $('wm-width').value=w;$('wm-height').value=Math.round(w/geometry.ratios[crop]);
      }
    }
    clearResult();updateSizeUI();
  });
  $('wm-crop-position').addEventListener('change',()=>{clearResult();drawCropPreview();});
  for(const id of ['wm-width','wm-height'])$(id).addEventListener('input',()=>{
    if(Object.hasOwn(geometry.ratios,$('wm-crop').value))$('wm-crop').value='fill';
    clearResult();updateSizeUI();
  });
  $('wm-crop-preview-wrap').addEventListener('toggle',drawCropPreview);
  $('wm-crop-preview-clip').addEventListener('change',()=>{cropPointerDrag=null;drawCropPreview();});
  $('wm-crop-preview').addEventListener('pointerdown',cropPointerDown);
  $('wm-crop-preview').addEventListener('pointermove',cropPointerMove);
  $('wm-crop-preview').addEventListener('pointerup',cropPointerEnd);
  $('wm-crop-preview').addEventListener('pointercancel',cropPointerEnd);
  $('wm-freeform-reset').addEventListener('click',()=>{
    if(converting)return;
    const clip=previewClip();if(!clip)return;
    clip.freeformSelection=null;invalidate(clip.batchId);drawCropPreview();
  });
  $('wm-expand').addEventListener('click',()=>previewFullscreen(true));
  $('wm-preview').addEventListener('contextmenu',openSaveMenu);
  $('wm-fullscreen-image').addEventListener('contextmenu',openSaveMenu);
  $('wm-preview').addEventListener('click',()=>previewFullscreen(true));
  $('wm-preview').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();previewFullscreen(true);}});
  $('wm-fullscreen-close').addEventListener('click',()=>previewFullscreen(false));
  $('wm-fullscreen').addEventListener('click',e=>{if(e.target===$('wm-fullscreen'))previewFullscreen(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('wm-fullscreen').hidden)previewFullscreen(false);});
  $('wm-convert').addEventListener('click',convertAll);
  $('wm-save').addEventListener('click',save);
  $('wm-cancel').addEventListener('click',async()=>{if(!converting)return;cancelled=true;progress({title:'Cancelling',detail:'Discarding temporary frames.',percent:0});try{await api.webpCancel();}catch(e){error(e);}});
  render();
})();
