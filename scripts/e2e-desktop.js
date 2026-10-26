'use strict';
// Runs ONLY when the packaged desktop app is launched with --webp-e2e and
// WEBP_MAKER_E2E_REPORT. Uses real HTML5 MP4 decoding, real app IPC, and the
// production ImageMagick setup. Does not depend on FFmpeg or a mock encoder.
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {execFileSync}=require('child_process');
const {MAX_BYTES}=require('../lib/webpMaker');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// A renderer-side JavaScript promise can remain pending indefinitely when the
// Electron compositor freezes. Bound each poll separately so GitHub prints a
// specific failure instead of waiting until the whole job is killed.
async function boundedPoll(fn,label,limitMs){
  let timer;
  try{
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(
        `Electron renderer did not answer during ${label} (>${limitMs} ms).`)),limitMs);})
    ]);
  }finally{clearTimeout(timer);}
}
async function waitFor(fn,{timeout=60000,label='condition',interval=350}={}){
  const deadline=Date.now()+timeout;
  let latest;
  while(Date.now()<deadline){
    latest=await boundedPoll(fn,label,Math.min(15000,Math.max(1000,deadline-Date.now())));
    if(latest?.error)throw new Error(`${label}: ${latest.error}`);
    if(latest?.ready)return latest;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(latest)}`);
}

function inspectWebp(file,{width=480,height=640,minFrames=12,minDurationMs=800,maxDurationMs=1200}={}){
  const b=fs.readFileSync(file);
  assert(b.length>100,'WebP output is unexpectedly small');
  assert(b.length<=MAX_BYTES,`WebP output is ${b.length} bytes; limit is ${MAX_BYTES}`);
  assert.strictEqual(b.toString('ascii',0,4),'RIFF','Not a RIFF container');
  assert.strictEqual(b.toString('ascii',8,12),'WEBP','Not a WebP container');
  assert.strictEqual(b.readUInt32LE(4)+8,b.length,'Truncated or oversized RIFF');
  let pos=12,dimensions=null,loop=null,frames=0,animated=false,duration=0;
  while(pos+8<=b.length){
    const type=b.toString('ascii',pos,pos+4),len=b.readUInt32LE(pos+4),start=pos+8;
    assert(start+len<=b.length,`Broken WebP ${type} chunk`);
    if(type==='VP8X'){
      assert(len>=10,'Invalid VP8X chunk');
      animated=(b[start]&0x02)!==0;
      dimensions={width:1+b[start+4]+(b[start+5]<<8)+(b[start+6]<<16),
        height:1+b[start+7]+(b[start+8]<<8)+(b[start+9]<<16)};
    }
    if(type==='ANIM'){
      assert(len>=6,'Invalid ANIM chunk');
      loop=b.readUInt16LE(start+4);
    }
    if(type==='ANMF'){
      assert(len>=16,'Invalid ANMF chunk');
      frames++;
      duration+=b[start+12]+(b[start+13]<<8)+(b[start+14]<<16);
    }
    pos=start+len+(len%2);
  }
  assert.strictEqual(pos,b.length,'WebP chunks do not consume the complete file');
  assert(animated,'WebP animation flag is missing');
  assert.strictEqual(loop,0,'WebP must loop forever (ANIM count 0)');
  assert.deepStrictEqual(dimensions,{width,height},'WebP dimensions changed');
  assert(frames>=minFrames,`Expected at least ${minFrames} animation frames, got ${frames}`);
  assert(duration>=minDurationMs&&duration<=maxDurationMs,`Unexpected animation duration ${duration} ms`);
  return {bytes:b.length,frames,width:dimensions.width,height:dimensions.height,loop,durationMs:duration};
}

async function run({win,maker,appRoot,toolsDir,reportPath}){
  assert(['win32','linux'].includes(process.platform),'Packaged E2E requires Windows or Linux');
  const isWindows=process.platform==='win32';
  assert(reportPath,'WEBP_MAKER_E2E_REPORT is required');
  const started=Date.now();
  // Checkpoint output allows GitHub to identify the LAST reached stage even
  // if Electron or an external process becomes unresponsive. A partial report
  // is never a pass: only the final report sets ok:true.
  const checkpoint=(stage,detail='')=>{
    const state={ok:false,stage,detail,elapsedSeconds:Math.round((Date.now()-started)/1000)};
    fs.writeFileSync(reportPath,JSON.stringify(state,null,2));
    console.log(`[WebP Maker E2E] ${stage}${detail?' - '+detail:''}`);
  };
  checkpoint('starting');
  const nativeExe=isWindows?path.join(toolsDir,'imagemagick','magick.exe'):
    path.join(toolsDir,'imagemagick-linux','AppRun');
  if(!isWindows){
    const bundle=path.join(appRoot,'resources','webpmaker','linux','ImageMagick.AppImage');
    assert(fs.existsSync(bundle),'Packaged Linux download is missing the bundled ImageMagick AppImage');
  }
  assert(!fs.existsSync(nativeExe),'ImageMagick was already present; first-run download not tested');
  const fixtures=['test-clip-1.mp4','test-clip-2.mp4'].map(name=>{
    const file=path.join(appRoot,'tests','fixtures',name);
    assert(fs.existsSync(file),`Packaged app is missing ${name}`);
    return [name,fs.readFileSync(file).toString('base64')];
  });
  if(!win.webContents.getURL().startsWith('file:')||win.webContents.isLoadingMainFrame())await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('App window failed to load')),25000);
    win.webContents.once('did-finish-load',()=>{clearTimeout(timer);resolve();});
    win.webContents.once('did-fail-load',(_,code,description)=>{clearTimeout(timer);reject(new Error(`UI load ${code}: ${description}`));});
  });
  checkpoint('loading-two-h264-fixtures');
  // The actual file input fires its normal change event. The regular WebP
  // Maker renderer then probes both MP4s, decodes via HTML5 video, transfers
  // PNG frames through Electron IPC, and calls ImageMagick via WebpMaker.finish.
  await win.webContents.executeJavaScript(`(()=>{
    const dt=new DataTransfer();
    for(const [name,b64] of ${JSON.stringify(fixtures)}){
      const binary=atob(b64),bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      dt.items.add(new File([bytes],name,{type:'video/mp4',lastModified:0}));
    }
    const input=document.getElementById('wm-input');
    input.files=dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return dt.files.length;
  })()`);
  await waitFor(async()=>win.webContents.executeJavaScript(`(()=>({
    ready:document.getElementById('wm-count').textContent.trim()==='(2)'&&
      !document.getElementById('wm-convert').disabled,
    error:document.getElementById('wm-error').hidden?'':document.getElementById('wm-error').textContent
  }))()`),{timeout:75000,label:'both MP4s to load and pass metadata checks'});
  const installedVersion=await win.webContents.executeJavaScript(`document.getElementById('wm-app-version').textContent.trim()`);
  assert.strictEqual(installedVersion,'v'+require('../package.json').version,'Displayed app version is wrong');
  const uiFps=await win.webContents.executeJavaScript(`document.getElementById('wm-fps').value`);
  const uiQuality=await win.webContents.executeJavaScript(`document.getElementById('wm-quality').value`);
  assert.strictEqual(uiFps,'24','The default FPS changed unexpectedly');
  assert.strictEqual(uiQuality,'80','The default quality changed unexpectedly');
  checkpoint('converting-two-h264-fixtures');
  await win.webContents.executeJavaScript(`document.getElementById('wm-convert').click()`);
  await waitFor(async()=>win.webContents.executeJavaScript(`(()=>({
    ready:!document.getElementById('wm-result').hidden &&
      document.getElementById('wm-preview').src.startsWith('data:image/webp;base64,') &&
      document.getElementById('wm-progress-pct').textContent.trim()==='100%',
    error:document.getElementById('wm-error').hidden?'':document.getElementById('wm-error').textContent,
    status:document.getElementById('wm-progress-title').textContent,
    progress:document.getElementById('wm-progress-detail').textContent
  }))()`),{timeout:360000,label:'real MP4-to-WebP conversion',interval:600});
  checkpoint('validating-first-webp-output');
  // The only acceptable route is a private ImageMagick downloaded and extracted
  // by the packaged app. A machine-wide ImageMagick is not an adequate test.
  assert(fs.existsSync(nativeExe),'First-run setup did not install portable ImageMagick');
  const version=execFileSync(nativeExe,['-version'],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert(/ImageMagick 7/.test(version),'Extracted ImageMagick did not start successfully');
  const result=maker.resultPath();
  assert(result&&fs.existsSync(result),'The app did not produce a saved WebP result');
  // Check the app's actual save operation, not only its temporary output.
  const savedPath=path.join(path.dirname(reportPath),`WebP-Maker-${isWindows?'Windows':'Linux'}-E2E-Output.webp`);
  const saveResult=maker.save(savedPath);
  assert(saveResult.saved&&fs.existsSync(savedPath),'WebP Maker save failed');
  assert.strictEqual(fs.readFileSync(savedPath).compare(fs.readFileSync(result)),0,
    'Saved WebP differs from the converted result');
  const metrics=inspectWebp(savedPath);
  // Ask the freshly extracted encoder to actually decode the output. A RIFF
  // header alone is not enough to prove that the animation is usable.
  const decodeInfo=execFileSync(nativeExe,[`${result}[0]`,'-format','%m %wx%h','info:'],
    {encoding:'utf8',windowsHide:true,timeout:30000}).trim();
  assert(/WEBP 480x640/.test(decodeInfo),`ImageMagick failed to decode WebP: ${decodeInfo}`);
  // Regression for ComfyUI exports: a .mp4 filename containing a VP9/WebM
  // stream with no Duration in its container. Confirm ALL THREE clips move
  // in the final WebP, not just that its header has multiple ANMF frames.
  checkpoint('loading-three-webm-vp9-fixtures');
  const comfyFixtures=[1,2,3].map(i=>{
    const name=`comfy-webm-${i}.mp4`;
    const file=path.join(appRoot,'tests','fixtures',name);
    assert(fs.existsSync(file),`Missing real-format regression fixture ${name}`);
    return [name,fs.readFileSync(file).toString('base64')];
  });
  await win.webContents.executeJavaScript(`document.getElementById('wm-clear').click()`);
  await win.webContents.executeJavaScript(`(()=>{
    const dt=new DataTransfer();
    for(const [name,b64] of ${JSON.stringify(comfyFixtures)}){
      const binary=atob(b64),bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      // Deliberately labeled MP4, exactly as the problematic ComfyUI files.
      dt.items.add(new File([bytes],name,{type:'video/mp4',lastModified:0}));
    }
    const input=document.getElementById('wm-input');
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await waitFor(async()=>win.webContents.executeJavaScript(`(()=>({
    ready:document.getElementById('wm-count').textContent.trim()==='(3)' &&
      !document.getElementById('wm-convert').disabled,
    error:document.getElementById('wm-error').hidden?'':document.getElementById('wm-error').textContent
  }))()`),{timeout:75000,label:'three real VP9/WebM streams to load'});
  const cropChoice=await win.webContents.executeJavaScript(`(()=>{
    const crop=document.getElementById('wm-crop');crop.value='3:4';
    crop.dispatchEvent(new Event('change',{bubbles:true}));
    const label=document.getElementById('wm-output-dimensions').textContent;
    return {label,width:document.getElementById('wm-size').value,
      formats:[...document.querySelectorAll('#wm-clips .wm-clip-copy small')].map(e=>e.textContent)};
  })()`);
  assert(cropChoice.label.includes('480 × 640'),`3:4 crop isn't 480x640: ${JSON.stringify(cropChoice)}`);
  assert(cropChoice.formats.every(f=>f.includes('WebM video')&&f.includes('0.81s')),
    `WebM detection or duration failed: ${JSON.stringify(cropChoice.formats)}`);
  // Switch the tested 480x640 preset into Freeform. The output dimensions
  // must remain exactly 480x640 and each clip must have its own crop selection.
  const freeformChoice=await win.webContents.executeJavaScript(`(()=>{
    const crop=document.getElementById('wm-crop');crop.value='freeform';
    crop.dispatchEvent(new Event('change',{bubbles:true}));
    const editor=document.getElementById('wm-crop-preview-wrap');
    const output=document.getElementById('wm-output-dimensions').textContent;
    const canvas=document.getElementById('wm-crop-preview');
    // Prepare unique clip 2/3 selections through the same pointer handlers
    // used by actual mouse and touch users in the renderer.
    canvas.setPointerCapture=()=>{};
    canvas.hasPointerCapture=()=>false;
    const select=document.getElementById('wm-crop-preview-clip');
    function dragClip(option,dx,dy){
      select.selectedIndex=option;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      const r=canvas.getBoundingClientRect();
      const x=r.left+r.width/2, y=r.top+r.height/2;
      canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:71+option,button:0,clientX:x,clientY:y,bubbles:true}));
      canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:71+option,clientX:x+dx,clientY:y+dy,bubbles:true}));
      canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:71+option,clientX:x+dx,clientY:y+dy,bubbles:true}));
    }
    // Not enough room to move a full-height 3:4 crop vertically. Move it
    // sideways and resize different clips to exercise independent framing.
    dragClip(1,20,0);
    dragClip(2,-20,0);
    return {output,open:editor.open,visible:!editor.hidden,custom:document.getElementById('wm-size').value,
      crop:crop.value,freeformTools:!document.getElementById('wm-freeform-tools').hidden};
  })()`);
  assert(freeformChoice.output.includes('480 \u00d7 640')&&freeformChoice.custom==='custom',
    `Switching to Freeform changed the 480x640 output: ${JSON.stringify(freeformChoice)}`);
  assert(freeformChoice.open&&freeformChoice.visible&&freeformChoice.freeformTools,
    `Freeform crop editor did not open: ${JSON.stringify(freeformChoice)}`);

  // Converting a square source into 480x640 asks for user confirmation in
  // production. The packaged E2E runs with its window HIDDEN, so a native
  // confirm dialog would hang forever waiting for a nonexistent tester.
  // A test-only override explicitly accepts that one user choice. Normal
  // WebP Maker behavior and prompts are never modified by this script.
  await win.webContents.executeJavaScript(`(()=>{
    window.__webpMakerE2eConfirmations=[];
    window.confirm=function(message){
      window.__webpMakerE2eConfirmations.push(String(message));
      return true;
    };
  })()`);
  checkpoint('converting-three-vp9-fixtures-with-freeform-crop');
  await win.webContents.executeJavaScript(`document.getElementById('wm-convert').click()`);
  const confirmations=await win.webContents.executeJavaScript('window.__webpMakerE2eConfirmations');
  assert(confirmations.some(message=>message.includes('Change output dimensions')),
    `Expected the square-to-480x640 confirmation to be exercised: ${JSON.stringify(confirmations)}`);
  await waitFor(async()=>win.webContents.executeJavaScript(`(()=>({
    ready:!document.getElementById('wm-result').hidden &&
      document.getElementById('wm-progress-pct').textContent.trim()==='100%',
    error:document.getElementById('wm-error').hidden?'':document.getElementById('wm-error').textContent,
    status:document.getElementById('wm-progress-title').textContent,
    progress:document.getElementById('wm-progress-detail').textContent
  }))()`),{timeout:360000,label:'three ComfyUI-style video clips to animate with freeform crop',interval:600});
  checkpoint('validating-three-vp9-clips-animated-webp');
  const secondResult=maker.resultPath();
  assert(secondResult,'No WebP generated from the VP9/WebM videos');
  // Each independent freeform crop must reach the real encoder. Crop keys
  // are numeric-only for the backend source-validation and cache contract.
  const cropKey=maker.cachedFrames?.sourceKey||'';
  assert(/^[0-9,]+$/.test(cropKey),'Freeform source cache key must contain only numeric IDs');
  const fields=cropKey.split(',');
  assert.strictEqual(fields.length,14,'Missing three independent clip crop selections');
  assert(new Set([fields[5],fields[8],fields[11]]).size>=2,
    'Clip-specific freeform crop positions did not reach the encoder');
  const secondSave=path.join(path.dirname(reportPath),`WebP-Maker-${isWindows?'Windows':'Linux'}-Comfy-Crop-Regression.webp`);
  maker.save(secondSave);
  const comfyMetrics=inspectWebp(secondSave,{width:480,height:640,minFrames:36,minDurationMs:2000,maxDurationMs:2800});
  const signatureText=execFileSync(nativeExe,[secondSave,'-coalesce','-format','%#\n','info:'],
    {encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:10*1024*1024});
  const signatures=signatureText.trim().split(/\r?\n/).filter(Boolean);
  assert.strictEqual(signatures.length,comfyMetrics.frames,
    `ImageMagick decoded only ${signatures.length}/${comfyMetrics.frames} frames`);
  const perClip=Math.round(0.8125*maker.latest.fps);
  assert.strictEqual(comfyMetrics.frames,perClip*3,'Clip boundaries or durations were lost');
  const uniqueFrames=[];
  for(let i=0;i<3;i++){
    const segment=signatures.slice(i*perClip,(i+1)*perClip);
    const unique=new Set(segment).size;
    assert(unique>=5,`Clip ${i+1} is a still-frame slideshow: ${unique} moving frames of ${segment.length}`);
    uniqueFrames.push(unique);
  }
  const report={ok:true,stage:'complete',download:'real ImageMagick GitHub release',
    extraction:isWindows?'bundled 7zip-bin Windows executable':'bundled Linux ImageMagick AppImage, extracted without FUSE',
    decoding:'real Electron HTML5 video and PNG canvas capture',
    encoding:'actual ImageMagick WebP Maker pipeline',
    verified:'RIFF, VP8X, ANIM infinite loop, frames, duration, dimensions, size, and decoding',
    imageMagick:version.split(/\r?\n/)[0],...metrics,comfyRegression:{...comfyMetrics,uniqueFrames},elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(1))};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log(`PASS: packaged ${process.platform} first-run WebP conversion`,report);
  return report;
}
module.exports={run,inspectWebp};
