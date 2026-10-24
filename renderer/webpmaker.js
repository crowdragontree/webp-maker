// WebP Maker. MP4 frames are decoded locally by Electron, then ImageMagick encodes the WebP.
// No FFmpeg dependency or uploads; changes to dimensions or crop happen only when selected.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = window.webpMaker;
  const geometry=window.webpFrameGeometry;
  const ids=['wm-input','wm-dropzone','wm-add','wm-clear','wm-clips','wm-count','wm-size','wm-size-custom','wm-width','wm-height','wm-fps','wm-quality',
    'wm-original-size','wm-crop','wm-crop-position','wm-output-dimensions','wm-crop-preview-wrap','wm-crop-preview','wm-crop-preview-clip','wm-freeform-tools','wm-freeform-status','wm-freeform-reset','wm-convert','wm-cancel','wm-progress-wrap','wm-progress-title','wm-progress-pct','wm-progress-bar','wm-progress-detail',
    'wm-error','wm-result','wm-preview','wm-preview-placeholder','wm-result-size','wm-size-bar','wm-result-details','wm-result-note','wm-save','wm-expand','wm-fullscreen','wm-fullscreen-image','wm-fullscreen-close'];
  if(!ids.every(id=>$(id))||!api?.webpBegin||!api?.webpFrame||!api?.webpFinish||!geometry)return;
  const MAX_FRAMES=1500;
  const MAX_BYTES=9990000;
  let clips=[];
  let clipInstanceSerial=0;
  let converting=false;
  let ready=false;
  let dragIndex=-1;
  let cancelled=false;
  let adding=false;
  let cropPointerDrag=null;
  const formatBytes=b=>b>=1e6?(b/1e6).toFixed(2)+' MB':(b/1e3).toFixed(0)+' KB';
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
  function notify(mode){
    if(mode!=='complete'&&mode!=='failed')return;
    const done=mode==='complete';
    const notice=$('wm-app-notice');
    notice.dataset.kind=mode;
    notice.setAttribute('role',done?'status':'alert');
    notice.setAttribute('aria-live',done?'polite':'assertive');
    $('wm-app-notice-icon').textContent=done?'✓':'!';
    $('wm-app-notice-title').textContent=done?'WebP Maker: Conversion complete':'WebP Maker: Conversion failed';
    $('wm-app-notice-message').textContent=done?'Your animated WebP is ready to preview and save.':'Open WebP Maker for the error details and retry options.';
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
  function clearResult(){ready=false;previewFullscreen(false);$('wm-expand').disabled=true;$('wm-result').hidden=true;$('wm-preview-placeholder').hidden=false;$('wm-preview').removeAttribute('src');}
  function busy(isBusy){
    converting=!!isBusy;
    $('wm-convert').disabled=isBusy||clips.length<2;
    $('wm-convert').textContent=isBusy?'Converting...':'Convert to WebP';
    $('wm-cancel').hidden=!isBusy;
    $('wm-clear').disabled=isBusy;
    $('wm-add').disabled=isBusy;
    for(const id of ['wm-size','wm-width','wm-height','wm-crop','wm-crop-position','wm-crop-preview-clip','wm-freeform-reset','wm-fps','wm-quality'])$(id).disabled=isBusy;
    $('wm-dropzone').setAttribute('aria-disabled',String(isBusy));
  }
  function progress(data){
    if(!converting||!data)return;
    $('wm-progress-wrap').hidden=false;
    $('wm-progress-title').textContent=data.title||'Converting';
    $('wm-progress-detail').textContent=data.detail||'Working entirely on this computer.';
    const p=Math.min(100,Math.max(0,Number(data.percent)||0));
    $('wm-progress-pct').textContent=p+'%';
    $('wm-progress-bar').style.width=p+'%';
  }
  api.onWebpProgress(progress);
  function untrack(clip){try{clip.video.pause();clip.video.removeAttribute('src');clip.video.load();}catch{}try{URL.revokeObjectURL(clip.url);}catch{}}
  function resetSize(){
    const c=clips[0];
    $('wm-original-size').textContent=c?`${c.width} × ${c.height} px (first video)`:'Add videos to see original dimensions';
    const opt=$('wm-size').querySelector('option[value="original"]');
    if(opt)opt.textContent=c?`Original (${c.width} × ${c.height})`:'Original dimensions (no resizing)';
    const select=$('wm-crop-preview-clip');
    const selected=select.value;
    select.replaceChildren();
    for(const clip of clips){
      const opt=document.createElement('option');opt.value=String(clip.instanceId);opt.textContent=clip.name;select.append(opt);
    }
    if(Array.from(select.options).some(o=>o.value===selected))select.value=selected;
    updateSizeUI();
  }
  function dimensions(){
    if(!clips.length)throw new Error('Add videos first.');
    return geometry.outputSize(clips[0],$('wm-size').value,$('wm-width').value,$('wm-height').value,$('wm-crop').value);
  }
  function previewClip(){
    return clips.find(c=>String(c.instanceId)===$('wm-crop-preview-clip').value)||clips[0]||null;
  }
  // Preview uses the complete source frame in Freeform mode so the editable
  // rectangle can be dragged and resized. Fixed-ratio modes preview the output.
  function drawCropPreview(){
    const details=$('wm-crop-preview-wrap');
    if(details.hidden||!details.open||!clips.length)return;
    const clip=previewClip();if(!clip)return;
    if(clip.video.readyState<2){clip.video.addEventListener('loadeddata',drawCropPreview,{once:true});return;}
    let size;
    try{size=dimensions();}catch{return;}
    const canvas=$('wm-crop-preview'),freeform=$('wm-crop').value==='freeform';
    canvas.dataset.freeform=String(freeform);
    const aspect=freeform?clip.width/clip.height:size.width/size.height;
    const maxWidth=freeform?340:240,maxHeight=freeform?290:240;
    const scale=Math.min(maxWidth/(aspect>=1?aspect:1),maxHeight/(aspect>=1?1:1/aspect));
    const previewWidth=Math.max(40,Math.round(scale*(aspect>=1?aspect:1)));
    const previewHeight=Math.max(40,Math.round(scale*(aspect>=1?1:1/aspect)));
    if(canvas.width!==previewWidth)canvas.width=previewWidth;
    if(canvas.height!==previewHeight)canvas.height=previewHeight;
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(freeform){
      const region=geometry.freeformRegion(clip.width,clip.height,size.width,size.height,clip.freeformSelection);
      const fx=canvas.width/clip.width,fy=canvas.height/clip.height;
      const x=region.sx*fx,y=region.sy*fy,w=region.sw*fx,h=region.sh*fy;
      try{ctx.drawImage(clip.video,0,0,canvas.width,canvas.height);}catch{}
      // Darken the excluded area; show the selected portion at full brightness.
      ctx.fillStyle='rgba(0,0,0,0.64)';ctx.fillRect(0,0,canvas.width,canvas.height);
      try{ctx.drawImage(clip.video,region.sx,region.sy,region.sw,region.sh,x,y,w,h);}catch{}
      ctx.strokeStyle='#f6d7ff';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,Math.max(0,w-2),Math.max(0,h-2));
      ctx.strokeStyle='rgba(19,9,25,.65)';ctx.lineWidth=1;
      for(const [hx,hy] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]){
        const hx0=Math.max(5,Math.min(canvas.width-5,hx)),hy0=Math.max(5,Math.min(canvas.height-5,hy));
        ctx.fillStyle='#f8e6ff';ctx.fillRect(hx0-5,hy0-5,10,10);ctx.strokeRect(hx0-5.5,hy0-5.5,11,11);
      }
      $('wm-freeform-status').textContent=`${clip.name}: ${Math.round(region.sw)} x ${Math.round(region.sh)} source pixels selected. Drag inside to move; drag corner handles to resize. Each clip has its own crop.`;
    }else{
      const r=geometry.rect(clip.width,clip.height,canvas.width,canvas.height,$('wm-crop').value,$('wm-crop-position').value);
      try{ctx.drawImage(clip.video,r.sx,r.sy,r.sw,r.sh,r.dx,r.dy,r.dw,r.dh);}catch{}
    }
  }
  function canvasPoint(event){
    const canvas=$('wm-crop-preview'),bounds=canvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)),
      y:Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height))};
  }
  function cropHit(clip,point,size){
    const canvas=$('wm-crop-preview'),r=geometry.freeformRegion(clip.width,clip.height,size.width,size.height,clip.freeformSelection);
    const x=r.sx/clip.width,y=r.sy/clip.height,w=r.sw/clip.width,h=r.sh/clip.height;
    const corners={nw:[x,y],ne:[x+w,y],sw:[x,y+h],se:[x+w,y+h]};
    let match=null,dist=Infinity;
    for(const [key,[cx,cy]] of Object.entries(corners)){
      const px=(cx-point.x)*canvas.getBoundingClientRect().width;
      const py=(cy-point.y)*canvas.getBoundingClientRect().height;
      const d=Math.hypot(px,py);
      if(d<dist){dist=d;match=key;}
    }
    if(dist<=14)return match;
    return point.x>=x&&point.x<=x+w&&point.y>=y&&point.y<=y+h?'move':'outside';
  }
  function cropPointerDown(event){
    if(converting||event.button!==0||$('wm-crop').value!=='freeform')return;
    const clip=previewClip();if(!clip)return;
    let size;try{size=dimensions();}catch{return;}
    const point=canvasPoint(event);
    let mode=cropHit(clip,point,size);
    if(mode==='outside'){
      const current=geometry.freeformRegion(clip.width,clip.height,size.width,size.height,clip.freeformSelection);
      clip.freeformSelection=geometry.moveFreeform(clip.width,clip.height,size.width,size.height,
        {cx:point.x,cy:point.y,scale:current.scale},0,0);
      mode='move';clearResult();drawCropPreview();
    }
    const start=geometry.freeformRegion(clip.width,clip.height,size.width,size.height,clip.freeformSelection);
    cropPointerDrag={id:event.pointerId,clip,mode,point,start:{cx:start.cx,cy:start.cy,scale:start.scale},size};
    $('wm-crop-preview').setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function cropPointerMove(event){
    if($('wm-crop').value!=='freeform')return;
    const clip=previewClip();if(!clip)return;
    const point=canvasPoint(event);
    if(!cropPointerDrag||cropPointerDrag.id!==event.pointerId){
      try{
        const size=dimensions();const mode=cropHit(clip,point,size);
        $('wm-crop-preview').style.cursor=mode==='move'?'move':mode==='outside'?'crosshair':
          (mode==='nw'||mode==='se')?'nwse-resize':'nesw-resize';
      }catch{}
      return;
    }
    const d=cropPointerDrag;if(d.clip!==clip)return;
    let result;
    if(d.mode==='move')result=geometry.moveFreeform(clip.width,clip.height,d.size.width,d.size.height,
      d.start,point.x-d.point.x,point.y-d.point.y);
    else result=geometry.resizeFreeform(clip.width,clip.height,d.size.width,d.size.height,
      d.start,d.mode,point.x,point.y);
    clip.freeformSelection=result;
    clearResult();drawCropPreview();event.preventDefault();
  }
  function cropPointerEnd(event){
    if(cropPointerDrag?.id!==event.pointerId)return;
    cropPointerDrag=null;
    const canvas=$('wm-crop-preview');
    if(canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  function updateSizeUI(){
    const selected=$('wm-size').value,crop=$('wm-crop').value;
    $('wm-size-custom').hidden=selected!=='custom';
    $('wm-crop-position').hidden=crop==='fit'||crop==='freeform';
    $('wm-freeform-tools').hidden=crop!=='freeform'||!clips.length;
    $('wm-crop-preview-wrap').hidden=crop==='fit'||!clips.length;
    if(crop==='freeform'&&clips.length)$('wm-crop-preview-wrap').open=true;
    if(selected==='custom'&&clips.length){
      if(!Number($('wm-width').value)||!Number($('wm-height').value)){
        $('wm-width').value=clips[0].width;$('wm-height').value=clips[0].height;
      }
    }
    if(!clips.length){$('wm-output-dimensions').textContent='Choose videos to see output size';return;}
    try{
      const {width,height}=dimensions();
      $('wm-output-dimensions').textContent=`Output ${width} × ${height} px · ${crop==='fit'?'Full video fitted':crop==='freeform'?'Freeform crop per clip':'Cropped to fill'}`;
    }catch{$('wm-output-dimensions').textContent='Enter a valid output width and height';}
    drawCropPreview();
  }
  function row(clip,i){
    const el=document.createElement('div');el.className='wm-clip';el.draggable=!converting;el.dataset.index=i;
    const grip=document.createElement('span');grip.className='wm-grip';grip.textContent='⠿';grip.title='Drag to reorder';
    const n=document.createElement('span');n.className='wm-clip-num';n.textContent=String(i+1).padStart(2,'0');
    const description=document.createElement('div');description.className='wm-clip-copy';
    const name=document.createElement('strong');name.textContent=clip.name;
    const details=document.createElement('small');details.textContent=`${clip.width} × ${clip.height} · ${clip.duration.toFixed(2)}s · ${formatBytes(clip.bytes)}${clip.container==='webm'?' · WebM video':''}`;
    description.append(name,details);
    const controls=document.createElement('div');controls.className='wm-clip-buttons';
    for(const [glyph,label,disabled,callback] of [
      ['↑','Move up',i===0,()=>move(i,i-1)],['↓','Move down',i===clips.length-1,()=>move(i,i+1)],['×','Remove MP4',false,()=>removeClip(i)]]) {
      const b=document.createElement('button');b.className='ghost';b.type='button';b.textContent=glyph;b.title=label;
      b.setAttribute('aria-label',`${label}: ${clip.name}`);b.disabled=disabled||converting;b.addEventListener('click',callback);controls.append(b);
    }
    el.append(grip,n,description,controls);
    el.addEventListener('dragstart',event=>{if(converting){event.preventDefault();return;}dragIndex=i;el.classList.add('wm-dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(i));});
    el.addEventListener('dragend',()=>{dragIndex=-1;document.querySelectorAll('.wm-clip').forEach(e=>e.classList.remove('wm-dragging','wm-dragover'));});
    el.addEventListener('dragover',event=>{if(dragIndex<0||converting)return;event.preventDefault();event.dataTransfer.dropEffect='move';el.classList.add('wm-dragover');});
    el.addEventListener('dragleave',()=>el.classList.remove('wm-dragover'));
    el.addEventListener('drop',event=>{if(dragIndex<0||converting)return;event.preventDefault();event.stopPropagation();move(dragIndex,i);dragIndex=-1;});
    return el;
  }
  function render(){
    $('wm-count').textContent=`(${clips.length})`;
    $('wm-clips').replaceChildren();
    if(!clips.length){const p=document.createElement('div');p.className='wm-empty';p.textContent='Choose at least two MP4 files to begin.';$('wm-clips').append(p);}
    else clips.forEach((c,i)=>$('wm-clips').append(row(c,i)));
    $('wm-convert').disabled=converting||clips.length<2;
    resetSize();
  }
  function removeClip(i){if(converting)return;const [c]=clips.splice(i,1);untrack(c);clearError();clearResult();render();}
  function move(from,to){if(converting||from===to||from<0||to<0||to>=clips.length)return;const [c]=clips.splice(from,1);clips.splice(to,0,c);clearResult();render();}
  // ComfyUI/JC sometimes exports VP9/WebM streams with an .mp4 filename,
  // no Duration element, and Infinity for HTMLVideoElement.duration. Detect
  // the real container and recover exact duration from WebM block timecodes.
  function loadMetadata(file){
    return new Promise((resolve,reject)=>{
      if(!file.size){reject(new Error(`${file.name} is empty.`));return;}
      let url=null,probe={},container='mp4';
      const video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
      let timer=null,seekTimer=null,done=false,triedSeek=false;
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
      function bad(){
        fail(`Unsupported or unreadable video format in ${file.name}. WebP Maker accepts normal MP4 and VP9 WebM video.`);
      }
      function duration(){
        // The WebM probe gets the LAST FRAME plus its duration. Seeking to
        // 1e9 only returns the last frame's PTS and can truncate an animation.
        if(container==='webm'&&Number.isFinite(probe.duration)&&probe.duration>0)return probe.duration;
        if(Number.isFinite(video.duration)&&video.duration>0)return video.duration;
        if(Number.isFinite(probe.duration)&&probe.duration>0)return probe.duration;
        if(video.seekable?.length){
          try{const end=video.seekable.end(video.seekable.length-1);
            if(Number.isFinite(end)&&end>0)return end;
          }catch{}
        }
        if(triedSeek&&!video.seeking&&video.readyState>=2&&video.currentTime>0&&video.currentTime<1e9)
          return video.currentTime;
        return null;
      }
      function check(){
        if(done)return;
        const width=video.videoWidth||(video.readyState>=2?probe.width:0);
        const height=video.videoHeight||(video.readyState>=2?probe.height:0);
        const seconds=duration();
        if(!width||!height||!Number.isFinite(seconds)||seconds<=0)return;
        done=true;cleanup();
        resolve({file,url,video,name:file.name,bytes:file.size,width,height,duration:seconds,container,
          key:[file.name,file.size,file.lastModified].join('|'),instanceId:++clipInstanceSerial});
      }
      for(const event of ['loadedmetadata','loadeddata','durationchange','canplay','seeked'])video.addEventListener(event,check);
      video.addEventListener('error',bad,{once:true});
      (async()=>{
        // Probes only read bytes from the local File. No upload or conversion.
        const webm=await (window.webpWebmProbe?.probeWebm?.(file)||Promise.resolve(null)).catch(()=>null);
        if(done)return;
        if(webm?.container==='webm'){
          container='webm';probe=webm;
          // Correct MIME for WebM streams mislabeled as .mp4. The byte-for-byte
          // video is unchanged; only Chromium's media hint is corrected.
          url=URL.createObjectURL(new Blob([file],{type:'video/webm'}));
        }else{
          container='mp4';
          url=URL.createObjectURL(file);
          (window.webpMp4Probe?.probeMp4?.(file)||Promise.resolve({})).then(info=>{if(!done){probe=info||{};check();}}).catch(()=>{});
        }
        timer=setTimeout(()=>fail(`Unable to read video metadata for ${file.name}. The format, codec or duration may be unsupported.`),25000);
        // For valid MP4s only, an extreme seek recovers the duration when the
        // MP4 header and normal media events have no usable value.
        if(container==='mp4')seekTimer=setTimeout(()=>{
          if(done||Number.isFinite(video.duration)||video.readyState<1)return;
          triedSeek=true;try{video.currentTime=1e9;}catch{}
        },1200);
        video.src=url;video.load();check();
      })().catch(e=>fail(`Could not inspect ${file.name}: ${e.message||e}`));
    });
  }
  async function addFiles(files){
    if(converting||adding||!files.length)return;
    adding=true;clearError();
    try{
      const picked=Array.from(files);
      if(picked.some(f=>!/\.(mp4|webm)$/i.test(f.name)))throw new Error('Choose MP4 or WebM video files.');
      if(clips.length+picked.length>30)throw new Error('Choose up to 30 MP4 clips.');
      const known=new Set(clips.map(f=>f.key));
      for(const file of picked){
        const key=[file.name,file.size,file.lastModified].join('|');
        if(known.has(key))continue;
        const clip=await loadMetadata(file);
        clips.push(clip);known.add(key);
      }
      if(clips.length){clearResult();render();}
    }catch(e){error(e);}finally{adding=false;}
  }
  function selectFiles(){if(converting||adding)return;$('wm-input').click();}
  function drop(event){
    event.preventDefault();event.stopPropagation();$('wm-dropzone').classList.remove('wm-hover');
    if(converting)return;
    addFiles(Array.from(event.dataTransfer?.files||[]));
  }
  // On some VP9/WebM clips, `seeked` fires before the frame is submitted to
  // the compositor. Wait for the decoded frame so each MP4 in a multi-clip
  // session contributes moving frames, not one repeated still image.
  function seek(video,seconds){
    return new Promise((resolve,reject)=>{
      let timeout,settleTimer,frameId=null,settled=false,seeked=false,frame=null;
      function cleanup(){
        clearTimeout(timeout);clearTimeout(settleTimer);video.removeEventListener('seeked',onSeeked);video.removeEventListener('error',fail);
        if(frameId!==null&&video.cancelVideoFrameCallback)try{video.cancelVideoFrameCallback(frameId);}catch{}
      }
      function done(){if(settled)return;settled=true;cleanup();resolve();}
      function fail(){if(settled)return;settled=true;cleanup();reject(new Error('Could not decode a frame from this video.'));}
      function acceptFrame(_,metadata){
        frameId=null;
        if(settled)return;
        const actual=Number(metadata?.mediaTime);
        if(Number.isFinite(actual)&&Math.abs(actual-seconds)>0.35){
          if(!video.seeking&&seeked){
            settled=true;cleanup();reject(new Error(`Video decoder returned a stale frame at ${actual.toFixed(2)}s instead of ${seconds.toFixed(2)}s. This clip was not converted into a frozen slideshow.`));
            return;
          }
          frameId=video.requestVideoFrameCallback(acceptFrame);return;
        }
        frame=metadata||{};
        if(seeked)done();
      }
      function onSeeked(){
        seeked=true;
        if(frame!==null||typeof video.requestVideoFrameCallback!=='function')done();
        else settleTimer=setTimeout(()=>{
          // Chrome sometimes does not submit a *new* compositor frame when
          // consecutive 24 FPS seeks land on the same 16 FPS VP9 source frame.
          // `seeked` and HAVE_CURRENT_DATA are sufficient in that case.
          if(!video.seeking&&video.readyState>=2)done();
        },90);
      }
      video.addEventListener('seeked',onSeeked,{once:true});video.addEventListener('error',fail,{once:true});
      timeout=setTimeout(()=>{if(settled)return;settled=true;cleanup();reject(new Error('Video frame decoding timed out. Conversion stopped rather than exporting still frames.'));},15000);
      try{
        if(typeof video.requestVideoFrameCallback==='function')frameId=video.requestVideoFrameCallback(acceptFrame);
        video.currentTime=seconds;
        if(!video.seeking&&video.readyState>=2&&Math.abs(video.currentTime-seconds)<0.0001){
          onSeeked();
        }
      }catch(e){settled=true;cleanup();reject(e);}
    });
  }
  function png(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not render a PNG frame.')),'image/png'));}
  async function capture(clip,count,settings,canvas,ctx,frameOffset,total){
    const v=clip.video;const {width,height,fps}=settings;
    const crop=geometry.rect(clip.width,clip.height,width,height,settings.crop,settings.position,settings.selection);
    for(let i=0;i<count;i++){
      if(cancelled)throw new Error('Conversion cancelled.');
      const time=Math.min(Math.max(0,clip.duration-0.002), (i+.5)/fps);
      await seek(v,time);
      if(cancelled)throw new Error('Conversion cancelled.');
      ctx.fillStyle='#000000';ctx.fillRect(0,0,width,height);
      ctx.drawImage(v,crop.sx,crop.sy,crop.sw,crop.sh,crop.dx,crop.dy,crop.dw,crop.dh);
      const data=await (await png(canvas)).arrayBuffer();
      await api.webpFrame(data);
      const complete=frameOffset+i+1;
      if(complete%5===0||complete===total)progress({title:'Decoding MP4 videos',detail:`${complete} of ${total} frames captured at ${width} × ${height}.`,percent:5+Math.floor(49*complete/total)});
    }
  }
  async function convert(){
    if(converting||clips.length<2)return;
    dismissNotice();clearError();clearResult();navStatus('idle');
    let width,height,fps,quality,crop,position;
    try{
      ({width,height}=dimensions());
      fps=Number($('wm-fps').value);quality=Number($('wm-quality').value);
      crop=$('wm-crop').value;position=$('wm-crop-position').value;
      if(!Number.isInteger(fps)||fps<19||fps>60)throw new Error('Choose a frame rate from 19 to 60 FPS.');
      if(!Number.isInteger(quality)||quality<50||quality>99)throw new Error('Choose a quality from 50 to 99.');
      const original=clips[0];
      if((width!==original.width||height!==original.height)&&!window.confirm(`Change output dimensions from ${original.width} × ${original.height} to ${width} × ${height}?\n\nWebP Maker will never change them automatically.`))return;
      const mismatched=clips.filter(c=>c.width!==width||c.height!==height);
      if(crop==='fit'&&mismatched.length&&width===original.width&&height===original.height&&
        !window.confirm('Some MP4 clips have different dimensions. They will be fitted into the first video\'s frame without stretching or cropping. Continue?'))return;
      const counts=clips.map(c=>Math.max(1,Math.round(c.duration*fps)));
      const expectedFrames=counts.reduce((a,b)=>a+b,0);
      if(expectedFrames>MAX_FRAMES)throw new Error(`That frame rate would create ${expectedFrames} frames. Choose a lower FPS (${MAX_FRAMES} maximum) or use shorter clips.`);
      if(width>4096||height>4096)throw new Error('Output dimensions must be 4096 pixels or smaller on each side.');
      cancelled=false;busy(true);navStatus('running');$('wm-progress-wrap').hidden=false;
      progress({title:'Starting conversion',detail:'Decoding MP4s inside Electron. No FFmpeg and no uploads.',percent:0});
      // Source IDs include the clip order. Cached frames are never reused for
      // different videos, a different order, or a different output size.
      const cropModes=['fit','16:9','9:16','3:4','4:3','1:1','fill','freeform'];
      const positions=['center','top','bottom','left','right'];
      // Crop changes must invalidate lossless decoded-frame cache, including
      // independent manual selections on each source clip.
      // The backend deliberately accepts only numeric clip identifiers.
      // Store each coordinate as a fixed-precision integer to preserve that
      // validation while ensuring any manual crop change clears the cache.
      const selectionKeys=crop==='freeform'?clips.flatMap(c=>{
        const r=geometry.freeformRegion(c.width,c.height,width,height,c.freeformSelection);
        return [r.cx,r.cy,r.scale].map(x=>String(Math.round(x*1000000)));
      }):[];
      const sourceKey=[...clips.map(c=>c.instanceId),cropModes.indexOf(crop),positions.indexOf(position),...selectionKeys].join(',');
      const prepared=await api.webpBegin({width,height,fps,quality,expectedFrames,clipFrames:counts,sourceKey});
      if(prepared.cached){
        progress({title:'Reusing decoded MP4 frames',detail:`${prepared.cachedFrames} lossless frames already captured at ${prepared.sourceFps} FPS. No new MP4 decoding.`,percent:54});
      }else{
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
        if(!ctx)throw new Error('Unable to initialize the local video canvas.');
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        let offset=0;
        for(let i=0;i<clips.length;i++){
          progress({title:'Decoding MP4 videos',detail:`Clip ${i+1} of ${clips.length}: ${clips[i].name}`,percent:5+Math.floor(49*offset/expectedFrames)});
          await capture(clips[i],counts[i],{width,height,fps,crop,position,selection:clips[i].freeformSelection},canvas,ctx,offset,expectedFrames);
          offset+=counts[i];
        }
      }
      if(cancelled)return;
      const result=await api.webpFinish();
      if(cancelled)return;
      const preview=await api.webpPreview();
      $('wm-preview').src=preview.data;
      $('wm-preview-placeholder').hidden=true;$('wm-result').hidden=false;$('wm-expand').disabled=false;
      $('wm-result-size').textContent=formatBytes(result.bytes);
      $('wm-size-bar').style.width=`${Math.min(100,100*result.bytes/MAX_BYTES).toFixed(2)}%`;
      const details=$('wm-result-details');details.replaceChildren();
      for(const [k,value] of [['Quality',result.sceneQualities?result.sceneQualities.map((q,i)=>`Clip ${i+1}: ${q}`).join(' · '):result.quality],['Resolution',`${result.width} × ${result.height}`],['Framing',crop==='fit'?'Fit':crop==='freeform'?'Freeform (per clip)':`Crop (${crop==='fill'?'custom':crop})`],['Frame rate',`${result.fps} FPS`],['Duration',`${result.duration}s`],['Frames',result.frames]]){
        const el=document.createElement('div'),title=document.createElement('span'),desc=document.createElement('strong');
        title.textContent=k;desc.textContent=String(value);el.append(title,desc);details.append(el);
      }
      const adaptive=Array.isArray(result.sceneQualities)&&result.sceneQualities.length>1;
      const adjustments=[];
      if(result.fps!==fps)adjustments.push(`FPS ${fps} → ${result.fps}`);
      if(adaptive)adjustments.push(`Adaptive quality: ${result.sceneQualities.map((q,i)=>`${clips[i]?.name||'Clip '+(i+1)} Q${q}`).join(', ')}`);
      else if(result.quality!==quality)adjustments.push(`Quality ${quality} → ${result.quality}`);
      $('wm-result-note').hidden=!adjustments.length;
      $('wm-result-note').textContent=adjustments.length?`To stay under 9.99 MB: ${adjustments.join('; ')}. Output dimensions unchanged.`:'';
      ready=true;
      progress({title:'Conversion complete',detail:'Animated WebP ready to preview and save.',percent:100});
      navStatus('complete');notify('complete');
    }catch(e){if(!cancelled){const message=String(e?.message||e||'');error(message.includes('still exceeds 9.99 MB')?message+' Decoded frames are saved for retry. Adjust quality or FPS and click Convert; no MP4 re-decoding is needed.':e);navStatus('failed');notify('failed');try{await api.webpCancel();}catch{}}}
    finally{if(cancelled)navStatus('idle');busy(false);render();}
  }
  async function save(){
    if(!ready||converting)return;
    const name=(clips[0]?.name||'animation').replace(/\.(mp4|webm)$/i,'').replace(/[^A-Za-z0-9 _.-]/g,'_').slice(0,80)+'_Animated.webp';
    try{const r=await api.webpSave(name);if(r?.saved){$('wm-result-note').hidden=false;$('wm-result-note').textContent='Saved: '+r.path;}}catch(e){error(e);}
  }
  $('wm-add').addEventListener('click',selectFiles);
  $('wm-dropzone').addEventListener('click',selectFiles);
  $('wm-dropzone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectFiles();}});
  $('wm-input').addEventListener('change',e=>{addFiles(Array.from(e.target.files||[]));e.target.value='';});
  $('wm-dropzone').addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';$('wm-dropzone').classList.add('wm-hover');});
  $('wm-dropzone').addEventListener('dragleave',e=>{if(!e.currentTarget.contains(e.relatedTarget))$('wm-dropzone').classList.remove('wm-hover');});
  $('wm-dropzone').addEventListener('drop',drop);
  $('wm-clips').addEventListener('dragover',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files'))e.preventDefault();});
  $('wm-clips').addEventListener('drop',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files'))drop(e);});
  $('wm-clear').addEventListener('click',()=>{if(converting)return;clips.forEach(untrack);clips=[];clearResult();clearError();render();});
  $('wm-size').addEventListener('change',()=>{
    clearResult();
    if($('wm-size').value==='custom'&&clips.length){
      // Prefill with the *previously displayed* size, not the source ratio.
      // Switching to custom must not silently reset a selected 3:4 crop.
      const previous=$('wm-output-dimensions').textContent.match(/Output (\d+) × (\d+)/);
      if(previous){$('wm-width').value=previous[1];$('wm-height').value=previous[2];}
    }
    updateSizeUI();
  });
  $('wm-crop').addEventListener('change',()=>{
    const crop=$('wm-crop').value;
    if(crop==='freeform'&&clips.length){
      // Preserve the exact last output size when switching from a ratio preset.
      // Users can also set independent output dimensions at any time.
      const prior=$('wm-output-dimensions').textContent.match(/Output (\d+) \u00d7 (\d+)/);
      if(prior){
        $('wm-size').value='custom';
        $('wm-width').value=prior[1];$('wm-height').value=prior[2];
      }
    }
    if(Object.hasOwn(geometry.ratios,crop)){
      if($('wm-size').value==='original')$('wm-size').value='480';
      if($('wm-size').value==='custom'){
        const w=Math.max(480,Number($('wm-width').value)||480);
        $('wm-width').value=w;
        $('wm-height').value=Math.round(w/geometry.ratios[crop]);
      }
    }
    clearResult();updateSizeUI();
  });
  $('wm-crop-position').addEventListener('change',()=>{clearResult();drawCropPreview();});
  for(const id of ['wm-width','wm-height'])$(id).addEventListener('input',()=>{
    // Editing either field NEVER changes the other one. The resulting aspect
    // ratio becomes an explicitly custom crop, not a misleading preset.
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
    if(converting)return;const clip=previewClip();if(!clip)return;
    clip.freeformSelection=null;clearResult();drawCropPreview();
  });
  $('wm-expand').addEventListener('click',()=>previewFullscreen(true));
  $('wm-preview').addEventListener('click',()=>previewFullscreen(true));
  $('wm-preview').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();previewFullscreen(true);}});
  $('wm-fullscreen-close').addEventListener('click',()=>previewFullscreen(false));
  $('wm-fullscreen').addEventListener('click',e=>{if(e.target===$('wm-fullscreen'))previewFullscreen(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('wm-fullscreen').hidden)previewFullscreen(false);});
  $('wm-convert').addEventListener('click',convert);
  $('wm-save').addEventListener('click',save);
  $('wm-cancel').addEventListener('click',async()=>{if(!converting)return;cancelled=true;progress({title:'Cancelling',detail:'Discarding temporary frames.',percent:0});try{await api.webpCancel();}catch(e){error(e);}});
  render();
})();
