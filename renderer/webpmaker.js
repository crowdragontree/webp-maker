// WebP Maker. MP4 frames are decoded locally by Electron, then ImageMagick encodes the WebP.
// No FFmpeg dependency, loop control, automatic resizing, or remote upload.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = window.webpMaker;
  const ids=['wm-input','wm-dropzone','wm-add','wm-clear','wm-clips','wm-count','wm-size','wm-size-custom','wm-width','wm-height','wm-fps','wm-quality',
    'wm-original-size','wm-convert','wm-cancel','wm-progress-wrap','wm-progress-title','wm-progress-pct','wm-progress-bar','wm-progress-detail',
    'wm-error','wm-result','wm-preview','wm-preview-placeholder','wm-result-size','wm-size-bar','wm-result-details','wm-result-note','wm-save','wm-expand','wm-fullscreen','wm-fullscreen-image','wm-fullscreen-close'];
  if(!ids.every(id=>$(id))||!api?.webpBegin||!api?.webpFrame||!api?.webpFinish)return;
  const MAX_FRAMES=1500;
  const MAX_BYTES=9990000;
  let clips=[];
  let clipInstanceSerial=0;
  let converting=false;
  let ready=false;
  let dragIndex=-1;
  let cancelled=false;
  let adding=false;
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
    for(const id of ['wm-size','wm-width','wm-height','wm-fps','wm-quality'])$(id).disabled=isBusy;
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
    $('wm-original-size').textContent=c?`${c.width} × ${c.height} px (first MP4)`:'Add MP4s to see original dimensions';
    const opt=$('wm-size').querySelector('option[value="original"]');
    if(opt)opt.textContent=c?`Original (${c.width} × ${c.height})`:'Original dimensions (no resizing)';
    // Existing size selection stays intact when rearranging or adding clips.
    updateSizeUI();
  }
  function updateSizeUI(){
    const selected=$('wm-size').value;
    $('wm-size-custom').hidden=selected!=='custom';
    if(selected==='custom'&&clips.length){
      if(!Number($('wm-width').value)||!Number($('wm-height').value)){
        $('wm-width').value=clips[0].width;$('wm-height').value=clips[0].height;
      }
    }
  }
  function dimensions(){
    if(!clips.length)throw new Error('Add MP4 videos first.');
    const {width, height}=clips[0];
    const size=$('wm-size').value;
    if(size==='original'){
      if(width<480)throw new Error('The original video is less than 480 px wide. Select an output width of at least 480 px to continue.');
      return {width,height};
    }
    if(size==='custom'){
      const w=Number($('wm-width').value),h=Number($('wm-height').value);
      if(!Number.isInteger(w)||!Number.isInteger(h)||w<480||h<2||w>4096||h>4096)throw new Error('Custom output width must be at least 480 px (maximum 4096 px). Height must be between 2 and 4096 px.');
      return {width:w,height:h};
    }
    const w=Number(size);
    if(!Number.isInteger(w)||w<480||w>4096)throw new Error('Choose an output width between 480 and 4096 px.');
    return {width:w,height:Math.max(2,Math.round(height*w/width))};
  }
  function row(clip,i){
    const el=document.createElement('div');el.className='wm-clip';el.draggable=!converting;el.dataset.index=i;
    const grip=document.createElement('span');grip.className='wm-grip';grip.textContent='⠿';grip.title='Drag to reorder';
    const n=document.createElement('span');n.className='wm-clip-num';n.textContent=String(i+1).padStart(2,'0');
    const description=document.createElement('div');description.className='wm-clip-copy';
    const name=document.createElement('strong');name.textContent=clip.name;
    const details=document.createElement('small');details.textContent=`${clip.width} × ${clip.height} · ${clip.duration.toFixed(2)}s · ${formatBytes(clip.bytes)}`;
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
  // Some valid MP4s expose an infinite/unknown duration at loadedmetadata.
  // Wait for later media events and, if necessary, read only the MP4 container
  // headers to recover the duration. This never converts or uploads the file.
  function loadMetadata(file){
    return new Promise((resolve,reject)=>{
      if(!file.size){reject(new Error(`${file.name} is empty.`));return;}
      const url=URL.createObjectURL(file);
      const video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
      let timer=null,seekTimer=null,done=false,probe={},triedSeek=false;
      function cleanup(){
        clearTimeout(timer);clearTimeout(seekTimer);
        for(const event of ['loadedmetadata','loadeddata','durationchange','canplay','seeked'])video.removeEventListener(event,check);
        video.removeEventListener('error',bad);
      }
      function fail(message){
        if(done)return;done=true;cleanup();
        try{video.removeAttribute('src');video.load();}catch{}
        URL.revokeObjectURL(url);reject(new Error(message));
      }
      function bad(){
        const reason=video.error?.code===4?'Unsupported MP4 video codec': 'The MP4 could not be decoded';
        fail(`${reason} in ${file.name}. Your video player may support codecs that WebP Maker cannot decode.`);
      }
      function duration(){
        if(Number.isFinite(video.duration)&&video.duration>0)return video.duration;
        if(Number.isFinite(probe.duration)&&probe.duration>0)return probe.duration;
        if(video.seekable?.length){
          try{const end=video.seekable.end(video.seekable.length-1);
            if(Number.isFinite(end)&&end>0)return end;
          }catch{}
        }
        if(triedSeek&&!video.seeking&&video.readyState>=2&&video.currentTime>0&&video.currentTime<1e9){
          return video.currentTime;
        }
        return null;
      }
      function check(){
        if(done)return;
        const width=video.videoWidth||(video.readyState>=2?probe.width:0);
        const height=video.videoHeight||(video.readyState>=2?probe.height:0);
        const seconds=duration();
        if(!width||!height||!Number.isFinite(seconds)||seconds<=0)return;
        done=true;cleanup();
        // A probe is for duration/size only. Electron still decodes every frame.
        resolve({file,url,video,name:file.name,bytes:file.size,width,height,duration:seconds,
          key:[file.name,file.size,file.lastModified].join('|'),instanceId:++clipInstanceSerial});
      }
      timer=setTimeout(()=>fail(`Unable to read video metadata for ${file.name}. The MP4 may have an unsupported codec or an unreadable duration.`),25000);
      for(const event of ['loadedmetadata','loadeddata','durationchange','canplay','seeked'])video.addEventListener(event,check);
      video.addEventListener('error',bad,{once:true});
      // ISO BMFF header parsing covers files that expose Infinity/NaN duration
      // despite playing normally. It does not depend on FFmpeg.
      Promise.resolve().then(()=>window.webpMp4Probe?.probeMp4(file))
        .then(info=>{if(done)return;probe=info||{};check();})
        .catch(()=>{});
      seekTimer=setTimeout(()=>{
        if(done||Number.isFinite(video.duration)||video.readyState<1)return;
        triedSeek=true;
        try{video.currentTime=1e9;}catch{}
      },1200);
      video.src=url;video.load();
    });
  }
  async function addFiles(files){
    if(converting||adding||!files.length)return;
    adding=true;clearError();
    try{
      const picked=Array.from(files);
      if(picked.some(f=>!/\.mp4$/i.test(f.name)))throw new Error('Only MP4 files are supported.');
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
  function seek(video,seconds){
    return new Promise((resolve,reject)=>{
      let timeout;
      function cleanup(){clearTimeout(timeout);video.removeEventListener('seeked',done);video.removeEventListener('error',fail);}
      function done(){cleanup();resolve();}
      function fail(){cleanup();reject(new Error('Could not decode a frame from the MP4.'));}
      video.addEventListener('seeked',done,{once:true});video.addEventListener('error',fail,{once:true});
      timeout=setTimeout(()=>{cleanup();reject(new Error('MP4 frame decoding timed out. Try a shorter clip.'));},15000);
      try{video.currentTime=seconds;}catch(e){cleanup();reject(e);}
      // In rare cases the requested time is exactly the current decoded frame.
      if(!video.seeking&&video.readyState>=2&&Math.abs(video.currentTime-seconds)<0.0001)done();
    });
  }
  function png(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not render a PNG frame.')),'image/png'));}
  async function capture(clip,count,settings,canvas,ctx,frameOffset,total){
    const v=clip.video;const {width,height,fps}=settings;
    const ratio=Math.min(width/clip.width,height/clip.height);
    const drawW=Math.min(width,clip.width*ratio),drawH=Math.min(height,clip.height*ratio);
    for(let i=0;i<count;i++){
      if(cancelled)throw new Error('Conversion cancelled.');
      const time=Math.min(Math.max(0,clip.duration-0.002), (i+.5)/fps);
      await seek(v,time);
      if(cancelled)throw new Error('Conversion cancelled.');
      ctx.fillStyle='#000000';ctx.fillRect(0,0,width,height);
      ctx.drawImage(v,(width-drawW)/2,(height-drawH)/2,drawW,drawH);
      const data=await (await png(canvas)).arrayBuffer();
      await api.webpFrame(data);
      const complete=frameOffset+i+1;
      if(complete%5===0||complete===total)progress({title:'Decoding MP4 videos',detail:`${complete} of ${total} frames captured at ${width} × ${height}.`,percent:5+Math.floor(49*complete/total)});
    }
  }
  async function convert(){
    if(converting||clips.length<2)return;
    dismissNotice();clearError();clearResult();navStatus('idle');
    let width,height,fps,quality;
    try{
      ({width,height}=dimensions());
      fps=Number($('wm-fps').value);quality=Number($('wm-quality').value);
      if(!Number.isInteger(fps)||fps<19||fps>60)throw new Error('Choose a frame rate from 19 to 60 FPS.');
      if(!Number.isInteger(quality)||quality<50||quality>99)throw new Error('Choose a quality from 50 to 99.');
      const original=clips[0];
      if((width!==original.width||height!==original.height)&&!window.confirm(`Change output dimensions from ${original.width} × ${original.height} to ${width} × ${height}?\n\nWebP Maker will never change them automatically.`))return;
      const mismatched=clips.filter(c=>c.width!==width||c.height!==height);
      if(mismatched.length&&width===original.width&&height===original.height&&
        !window.confirm('Some MP4 clips have different dimensions. They will be fitted into the first video\'s frame without stretching or cropping. Continue?'))return;
      const counts=clips.map(c=>Math.max(1,Math.round(c.duration*fps)));
      const expectedFrames=counts.reduce((a,b)=>a+b,0);
      if(expectedFrames>MAX_FRAMES)throw new Error(`That frame rate would create ${expectedFrames} frames. Choose a lower FPS (${MAX_FRAMES} maximum) or use shorter clips.`);
      if(width>4096||height>4096)throw new Error('Output dimensions must be 4096 pixels or smaller on each side.');
      cancelled=false;busy(true);navStatus('running');$('wm-progress-wrap').hidden=false;
      progress({title:'Starting conversion',detail:'Decoding MP4s inside Electron. No FFmpeg and no uploads.',percent:0});
      // Source IDs include the clip order. Cached frames are never reused for
      // different videos, a different order, or a different output size.
      const sourceKey=clips.map(c=>c.instanceId).join(',');
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
          await capture(clips[i],counts[i],{width,height,fps},canvas,ctx,offset,expectedFrames);
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
      for(const [k,value] of [['Quality',result.sceneQualities?result.sceneQualities.map((q,i)=>`Clip ${i+1}: ${q}`).join(' · '):result.quality],['Resolution',`${result.width} × ${result.height}`],['Frame rate',`${result.fps} FPS`],['Duration',`${result.duration}s`],['Frames',result.frames]]){
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
    const name=(clips[0]?.name||'animation').replace(/\.mp4$/i,'').replace(/[^A-Za-z0-9 _.-]/g,'_').slice(0,80)+'_Animated.webp';
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
  $('wm-size').addEventListener('change',updateSizeUI);
  $('wm-width').addEventListener('input',()=>{
    if(!clips.length)return;
    const w=Number($('wm-width').value);if(w>0&&w<=4096)$('wm-height').value=Math.max(2,Math.round(w*clips[0].height/clips[0].width));
  });
  $('wm-height').addEventListener('input',()=>{
    if(!clips.length)return;
    const h=Number($('wm-height').value);if(h>0&&h<=4096)$('wm-width').value=Math.max(2,Math.round(h*clips[0].width/clips[0].height));
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
