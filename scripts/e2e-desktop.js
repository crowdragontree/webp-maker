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

async function waitFor(fn,{timeout=60000,label='condition',interval=350}={}){
  const deadline=Date.now()+timeout;
  let latest;
  while(Date.now()<deadline){
    latest=await fn();
    if(latest?.error)throw new Error(`${label}: ${latest.error}`);
    if(latest?.ready)return latest;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(latest)}`);
}

function inspectWebp(file){
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
  assert.deepStrictEqual(dimensions,{width:480,height:640},'WebP dimensions changed');
  assert(frames>=12,`Expected at least 12 animation frames, got ${frames}`);
  assert(duration>=800&&duration<=1200,`Unexpected animation duration ${duration} ms`);
  return {bytes:b.length,frames,width:dimensions.width,height:dimensions.height,loop,durationMs:duration};
}

async function run({win,maker,appRoot,toolsDir,reportPath}){
  assert(['win32','linux'].includes(process.platform),'Packaged E2E requires Windows or Linux');
  const isWindows=process.platform==='win32';
  assert(reportPath,'WEBP_MAKER_E2E_REPORT is required');
  const started=Date.now();
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
  const uiFps=await win.webContents.executeJavaScript(`document.getElementById('wm-fps').value`);
  const uiQuality=await win.webContents.executeJavaScript(`document.getElementById('wm-quality').value`);
  assert.strictEqual(uiFps,'24','The default FPS changed unexpectedly');
  assert.strictEqual(uiQuality,'80','The default quality changed unexpectedly');
  await win.webContents.executeJavaScript(`document.getElementById('wm-convert').click()`);
  await waitFor(async()=>win.webContents.executeJavaScript(`(()=>({
    ready:!document.getElementById('wm-result').hidden &&
      document.getElementById('wm-preview').src.startsWith('data:image/webp;base64,') &&
      document.getElementById('wm-progress-pct').textContent.trim()==='100%',
    error:document.getElementById('wm-error').hidden?'':document.getElementById('wm-error').textContent,
    status:document.getElementById('wm-progress-title').textContent,
    progress:document.getElementById('wm-progress-detail').textContent
  }))()`),{timeout:360000,label:'real MP4-to-WebP conversion',interval:600});
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
  const report={ok:true,stage:'complete',download:'real ImageMagick GitHub release',
    extraction:isWindows?'bundled 7zip-bin Windows executable':'bundled Linux ImageMagick AppImage, extracted without FUSE',
    decoding:'real Electron HTML5 video and PNG canvas capture',
    encoding:'actual ImageMagick WebP Maker pipeline',
    verified:'RIFF, VP8X, ANIM infinite loop, frames, duration, dimensions, size, and decoding',
    imageMagick:version.split(/\r?\n/)[0],...metrics,elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(1))};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log(`PASS: packaged ${process.platform} first-run WebP conversion`,report);
  return report;
}
module.exports={run,inspectWebp};
