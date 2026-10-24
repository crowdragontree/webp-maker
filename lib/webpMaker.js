'use strict';
// WebP Maker: local-only ImageMagick animated WebP encoder.
// Electron's HTML5 video decoder supplies lossless PNG frames; no FFmpeg is used.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawn,execFileSync} = require('child_process');

const MAX_BYTES = 9_990_000; // 9.99 decimal megabytes, strictly below 10 MB.
const MAX_FRAMES = 1500;
const MAX_DIMENSION = 4096;
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const exists = p => {try {return fs.statSync(p).isFile();} catch {return false;}};
const remove = p => {if(p) {try {fs.rmSync(p,{recursive:true,force:true,maxRetries:2,retryDelay:150});} catch {}}};
const unlink = p => {try {fs.rmSync(p,{force:true});} catch {}};
const text = v => String(v||'').replace(/\s+/g,' ').trim();
const PNG_HEADER = Buffer.from([137,80,78,71,13,10,26,10]);

// Assemble independently compressed full-size WebP still frames into one
// infinite-loop animation. No lossy frame-difference compression or blending:
// each frame is decoded from its own image data, so moving edges cannot carry
// square patches from a neighboring frame. This is a RIFF/WebP container mux,
// not another encoder or an FFmpeg dependency.
function writeUint24(buf,value,offset){
  buf[offset]=value&255;buf[offset+1]=(value>>>8)&255;buf[offset+2]=(value>>>16)&255;
}
function webpChunk(tag,data){
  const out=Buffer.alloc(8+data.length+(data.length%2));
  out.write(tag,0,4,'ascii');out.writeUInt32LE(data.length,4);data.copy(out,8);
  return out;
}
function packIndependentFrames(files,target,{width,height,fps}){
  if(!files.length)throw new Error('No encoded WebP frames to combine.');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||
    width>16384||height>16384||!Number.isInteger(fps)||fps<1||fps>1000)
    throw new Error('Invalid WebP animation dimensions or timing.');
  const vp8x=Buffer.alloc(10);vp8x[0]=0x02; // ANIMATION feature flag
  writeUint24(vp8x,width-1,4);writeUint24(vp8x,height-1,7);
  const anim=Buffer.alloc(6);anim.writeUInt16LE(0,4); // loop count 0 = forever
  const chunks=[webpChunk('VP8X',vp8x),webpChunk('ANIM',anim)];
  let total=12+chunks.reduce((n,c)=>n+c.length,0);
  files.forEach((file,i)=>{
    const data=fs.readFileSync(file);
    if(data.length<20||data.toString('ascii',0,4)!=='RIFF'||
       data.toString('ascii',8,12)!=='WEBP'||data.readUInt32LE(4)+8>data.length)
      throw new Error(`ImageMagick produced an invalid standalone WebP frame ${i+1}.`);
    const payload=[];
    let offset=12;
    while(offset+8<=data.length){
      const tag=data.toString('ascii',offset,offset+4);
      const size=data.readUInt32LE(offset+4);
      const padded=size+(size%2);
      if(offset+8+padded>data.length)throw new Error('Invalid WebP frame chunk length.');
      if(tag==='VP8 '||tag==='VP8L'||tag==='ALPH')
        payload.push(data.subarray(offset,offset+8+padded));
      offset+=8+padded;
    }
    if(!payload.some(c=>['VP8 ','VP8L'].includes(c.toString('ascii',0,4))))
      throw new Error('Missing WebP image payload.');
    const h=Buffer.alloc(16);
    writeUint24(h,width-1,6);writeUint24(h,height-1,9);
    // Cumulative rounded milliseconds prevent drift at 23/24 FPS.
    const duration=Math.round((i+1)*1000/fps)-Math.round(i*1000/fps);
    writeUint24(h,duration,12);
    h[15]=2; // no blending: each complete frame replaces the previous one
    const frame=webpChunk('ANMF',Buffer.concat([h,...payload]));
    chunks.push(frame);total+=frame.length;
  });
  const riff=Buffer.alloc(12);riff.write('RIFF',0,4,'ascii');
  riff.writeUInt32LE(total-8,4);riff.write('WEBP',8,4,'ascii');
  fs.writeFileSync(target,Buffer.concat([riff,...chunks],total));
}

class WebpMaker {
  constructor({appRoot,userData,onProgress=()=>{},toolsDir}) {
    this.appRoot=appRoot;
    this.userData=userData;
    this.onProgress=onProgress;
    this.binDir=toolsDir||path.join(appRoot,'.runtime','webp-maker-tools');
    this.job=null;
    this.cachedFrames=null;
    this.output=null;
    this.workDir=null;
    this.latest=null;
  }
  progress(title,detail,percent) {
    this.onProgress({title,detail,percent:clamp(Math.round(percent||0),0,100)});
  }
  // Never invoke a shell with source filenames or user-supplied arguments.
  // ImageMagick's -monitor writes progress to stderr; keep errors separate.
  command(exe,args,{cwd,env,onMonitor}={}) {
    return new Promise((resolve,reject)=>{
      const job=this.job;
      if(!job||job.cancelled)return reject(new Error('Conversion cancelled.'));
      const child=spawn(exe,args,{cwd,env:env||process.env,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
      job.child=child;
      let diagnostic='';
      let pending='';
      child.stderr.on('data',chunk=>{
        const content=pending+String(chunk);
        if(!onMonitor){diagnostic=(diagnostic+content).slice(-4000);pending='';return;}
        const lines=content.split(/[\r\n]+/);
        pending=lines.pop().slice(-1200);
        for(const line of lines){
          if(line.startsWith('load image[')||line.startsWith('Encode/Image')){
            try{onMonitor(line);}catch{} // UI progress errors must not stop encoding.
          }else if(line.trim()&&!/\d+% complete/.test(line)){
            diagnostic=(diagnostic+'\n'+line).slice(-4000);
          }
        }
      });
      child.stdout.on('data',()=>{});
      child.once('error',e=>{if(job.child===child)job.child=null;reject(new Error(`Could not start ImageMagick: ${e.message}`));});
      child.once('close',code=>{
        if(job.child===child)job.child=null;
        if(job.cancelled)return reject(new Error('Conversion cancelled.'));
        if(code!==0)return reject(new Error(`ImageMagick exited with code ${code}: ${text(diagnostic||pending).slice(-900)}`));
        resolve();
      });
    });
  }
  async magick() {
    // Honor a locally configured ImageMagick binary when developing/test-driving
    // from source. Production builds otherwise use their platform-specific copy.
    if(process.env.JBS_WEBP_MAGICK)return process.env.JBS_WEBP_MAGICK;

    if(process.platform==='linux'){
      if(process.arch!=='x64')throw new Error('This Linux download supports 64-bit x86 PCs.');
      const target=path.join(this.binDir,'imagemagick-linux');
      const appRun=path.join(target,'AppRun');
      if(exists(appRun))return appRun;
      const appImage=path.join(this.appRoot,'resources','webpmaker','linux','ImageMagick.AppImage');
      if(!exists(appImage)){
        // Source-code developers may run with a system copy; the GitHub Linux
        // desktop download always bundles a pinned, checksum-verified AppImage.
        try {
          return execFileSync('which',['magick'],{encoding:'utf8',timeout:4000}).trim().split(/\r?\n/)[0];
        }catch{
          throw new Error('The Linux ImageMagick bundle is missing. Download the complete Linux ZIP, not the source-code ZIP.');
        }
      }
      this.progress('Preparing ImageMagick','Unpacking bundled ImageMagick locally for first use; no download or installation.',3);
      fs.mkdirSync(this.binDir,{recursive:true});
      const stage=fs.mkdtempSync(path.join(this.binDir,'imagemagick-unpack-'));
      try{
        // Unpack from a private writable copy. This also supports apps extracted
        // into read-only locations and ZIP tools that lose executable bits.
        const privateAppImage=path.join(stage,'ImageMagick.AppImage');
        fs.copyFileSync(appImage,privateAppImage);
        fs.chmodSync(privateAppImage,0o755);
        // Extract instead of mounting the AppImage, so libfuse is not needed.
        await this.command(privateAppImage,['--appimage-extract'],{cwd:stage});
        const extracted=path.join(stage,'squashfs-root');
        const entry=path.join(extracted,'AppRun');
        if(!exists(entry))throw new Error('The packaged ImageMagick AppImage is incomplete.');
        fs.chmodSync(entry,0o755);
        remove(target);
        fs.renameSync(extracted,target);
        return appRun;
      }catch(e){
        throw new Error(`Unable to prepare bundled Linux ImageMagick: ${e.message}`);
      }finally{remove(stage);}
    }

    if(process.platform!=='win32')throw new Error('WebP Maker is available for Windows and Linux only.');
    let executable=path.join(this.binDir,'imagemagick','magick.exe');
    if(exists(executable))return executable;
    // A preexisting system copy is supported, but is not required.
    try {
      const match=execFileSync('where.exe',['magick.exe'],{encoding:'utf8',windowsHide:true,timeout:4000}).split(/\r?\n/).find(exists);
      if(match)return match;
    } catch {}
    this.progress('Preparing ImageMagick','Downloading a private portable ImageMagick copy for first use (no installer).',3);
    const setup=path.join(this.appRoot,'resources','webpmaker','setup-webpmaker.ps1');
    if(!exists(setup))throw new Error('The ImageMagick setup file is missing.');
    // Ship the LZMA-capable 7-Zip binary inside the Windows app. Do not rely on
    // tar.exe, which cannot unpack this official ImageMagick .7z on some PCs.
    const sevenZip=require('7zip-bin').path7za;
    if(!exists(sevenZip))throw new Error('The bundled 7-Zip extractor is missing. Download the complete Windows app ZIP again.');
    await this.command('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
      '-File',setup,'-ToolsDir',this.binDir,'-SevenZipPath',sevenZip]);
    executable=path.join(this.binDir,'imagemagick','magick.exe');
    if(!exists(executable))throw new Error('Portable ImageMagick could not be prepared. Please check your connection and retry.');
    return executable;
  }
  begin(opts={}) {
    if(this.job)throw new Error('A WebP conversion is already running.');
    const width=Number(opts.width),height=Number(opts.height),fps=Number(opts.fps),quality=Number(opts.quality),expectedFrames=Number(opts.expectedFrames);
    if(!Number.isInteger(width)||width<480||width>MAX_DIMENSION||!Number.isInteger(height)||height<2||height>MAX_DIMENSION)throw new Error('Output width must be between 480 and 4096 px. Height must be between 2 and 4096 px.');
    if(!Number.isInteger(fps)||fps<19||fps>60)throw new Error('Frame rate must be between 19 and 60 FPS.');
    if(!Number.isInteger(quality)||quality<50||quality>99)throw new Error('Quality must be between 50 and 99.');
    if(!Number.isInteger(expectedFrames)||expectedFrames<2||expectedFrames>MAX_FRAMES)throw new Error(`Too many frames. Choose a lower frame rate so the total is ${MAX_FRAMES} frames or fewer.`);
    // Keep clip boundaries so automatic FPS changes cannot skip short clips
    // or shift the scene joins. Each clip's frames are sampled separately.
    const clipFrames=opts.clipFrames===undefined?[expectedFrames]:opts.clipFrames;
    if(!Array.isArray(clipFrames)||clipFrames.length<1||clipFrames.length>30||
       clipFrames.some(n=>!Number.isInteger(n)||n<1)||
       clipFrames.reduce((sum,n)=>sum+n,0)!==expectedFrames)
      throw new Error('Invalid MP4 frame counts. Please restart the conversion.');
    // A failed size check must not discard already-decoded lossless frames.
    // Reuse them when the source clips/order and dimensions are unchanged and
    // the requested FPS is not higher than the original capture FPS.
    const sourceKey=String(opts.sourceKey||'');
    if(!sourceKey||sourceKey.length>2048||!/^[0-9,]+$/.test(sourceKey))
      throw new Error('Invalid source clip identifiers. Reload WebP Maker and retry.');
    const cache=this.cachedFrames;
    const frameDir=this.workDir&&path.join(this.workDir,'frames');
    const canReuse=!!(cache&&cache.complete&&cache.sourceKey===sourceKey&&
      cache.width===width&&cache.height===height&&fps<=cache.fps&&
      frameDir&&fs.existsSync(frameDir)&&
      fs.readdirSync(frameDir).filter(n=>/^f\d{6}\.png$/.test(n)).length===cache.expectedFrames);
    if(!canReuse){
      this.reset();
      this.workDir=fs.mkdtempSync(path.join(os.tmpdir(),'jbs-webp-maker-'));
      fs.mkdirSync(path.join(this.workDir,'frames'));
      this.cachedFrames={sourceKey,width,height,fps,expectedFrames,clipFrames:[...clipFrames],complete:false};
    }else{
      // Keep the original PNG frames; delete stale encoded candidates only.
      if(this.output)unlink(this.output);
      this.output=null;
      this.latest=null;
      for(const file of fs.readdirSync(this.workDir))
        if(/^candidate-q\d+-fps\d+\.webp$/.test(file))unlink(path.join(this.workDir,file));
    }
    const captured=this.cachedFrames;
    this.job={cancelled:false,child:null,width,height,fps,quality,
      expectedFrames:captured.expectedFrames,clipFrames:[...captured.clipFrames],
      count:canReuse?captured.expectedFrames:0,baseFps:captured.fps,cached:canReuse};
    this.progress(canReuse?'Reusing decoded frames':'Preparing frames',
      canReuse?`Using ${captured.expectedFrames} cached PNG frames captured at ${captured.fps} FPS; only WebP encoding will run.`:
      `Output: ${width} × ${height}, ${fps} FPS. Original dimensions are not changed unless selected.`,canReuse?54:5);
    return {ready:true,maxBytes:MAX_BYTES,cached:canReuse,
      cachedFrames:captured.expectedFrames,sourceFps:captured.fps};
  }
  frame(data) {
    const job=this.job;
    if(!job||job.cancelled)throw new Error('Start a conversion before providing frames.');
    if(job.cached)throw new Error('Cached frames are already available; decoding again is unnecessary.');
    if(job.count>=job.expectedFrames)throw new Error('Received more frames than expected.');
    // IPC transmits typed arrays without a binary shell protocol or large base64 strings.
    let buf;
    if(data instanceof ArrayBuffer)buf=Buffer.from(data);
    else if(ArrayBuffer.isView(data))buf=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
    else if(Buffer.isBuffer(data))buf=data;
    else throw new Error('Invalid image frame payload.');
    if(buf.length<30||buf.length>32*1024*1024||!buf.subarray(0,8).equals(PNG_HEADER))throw new Error('The video decoder did not return a valid PNG frame.');
    const target=path.join(this.workDir,'frames',`f${String(++job.count).padStart(6,'0')}.png`);
    fs.writeFileSync(target,buf);
    if(job.count===job.expectedFrames&&this.cachedFrames)this.cachedFrames.complete=true;
    if(job.count%10===0||job.count===job.expectedFrames)this.progress('Decoding MP4 videos',`Frame ${job.count} of ${job.expectedFrames} captured locally.`,5+Math.floor(job.count/job.expectedFrames*49));
    return {frames:job.count};
  }
  async finish() {
    const job=this.job;
    if(!job||job.cancelled)throw new Error('Conversion cancelled.');
    if(job.count!==job.expectedFrames)throw new Error(`Frame capture was incomplete (${job.count}/${job.expectedFrames}).`);
    try {
      const magick=await this.magick();
      const framesDir=path.join(this.workDir,'frames');
      const names=fs.readdirSync(framesDir).filter(f=>/^f\d{6}\.png$/.test(f)).sort();
      if(names.length!==job.expectedFrames)throw new Error('One or more image frames are missing.');
      // Size optimization order requested by the user (starting at 24 FPS / Q85):
      // 24/85, 23/85, 23/80, 22/80, 21/80, 21/75, 20/75.
      // Subsequent FPS adjustments are always by 1; quality adjustments during
      // the reduction phase are by 5, never automatically below Q75 or 20 FPS.
      // Once a candidate fits, gently refine upward by 1, quality FIRST, then
      // FPS. Frame choices are resampled separately inside each MP4 clip and
      // all attempts reuse the already-decoded lossless PNGs.
      const minimumAutoFps=Math.min(job.fps,20);
      const minimumAutoQuality=Math.min(job.quality,75);
      const reductionSteps=['fps','quality','fps','fps','quality','fps'];
      const attempted=new Map();
      let attempt=0;
      async function encodeCandidate(targetFps,targetQuality,reason){
        const key=`${targetFps}:${targetQuality}`;
        if(attempted.has(key))return attempted.get(key);
        if(job.cancelled)throw new Error('Conversion cancelled.');
        attempt++;
        const frameNames=[];
        let offset=0;
        for(const sourceCount of job.clipFrames){
          const outputCount=Math.max(1,Math.round(sourceCount*targetFps/job.baseFps));
          for(let i=0;i<outputCount;i++){
            const sourceIndex=Math.min(sourceCount-1,Math.floor((i+.5)*sourceCount/outputCount));
            frameNames.push(names[offset+sourceIndex]);
          }
          offset+=sourceCount;
        }
        // Frame timing is kept in hundredths of a second, with alternating
        // delays to avoid speeding up 23/24 FPS. The loop is always infinite.
        const out=path.join(this.workDir,`candidate-q${targetQuality}-fps${targetFps}.webp`);
        const started=Date.now();
        const update=()=>{
          if(job.cancelled)return;
          const seconds=Math.floor((Date.now()-started)/1000);
          const elapsed=seconds>=60?`${Math.floor(seconds/60)}m ${seconds%60}s`:`${seconds}s`;
          const estimate=Math.min(92,55+Math.floor(37*(1-Math.exp(-seconds/30))));
          this.progress(reason,`${targetFps} FPS / quality ${targetQuality} (pass ${attempt}); ${frameNames.length} frames. Elapsed ${elapsed}. Dimensions unchanged.`,estimate);
        };
        update();
        const heartbeat=setInterval(update,1000);
        const stillsDir=path.join(this.workDir,`stills-q${targetQuality}-fps${targetFps}`);
        fs.mkdirSync(stillsDir,{recursive:true});
        try {
          // +adjoin makes ImageMagick encode separate full-size frames; unlike
          // a multi-frame animation pass, it cannot introduce delta-frame
          // blending artifacts. Method 4 is fast on independent frames.
          await this.command(magick,['-define','webp:lossless=false',
            '-define','webp:method=4','-quality',String(targetQuality),
            ...frameNames,'+adjoin',path.join(stillsDir,'frame_%06d.webp')],
            {cwd:framesDir,env:{...process.env,MAGICK_TEMPORARY_PATH:this.workDir}});
          const stills=fs.readdirSync(stillsDir).filter(n=>/^frame_\d{6}\.webp$/.test(n)).sort();
          if(stills.length!==frameNames.length)
            throw new Error(`Incomplete WebP encoding (${stills.length} of ${frameNames.length} frames).`);
          packIndependentFrames(stills.map(n=>path.join(stillsDir,n)),out,
            {width:job.width,height:job.height,fps:targetFps});
        }finally{
          clearInterval(heartbeat);
          remove(stillsDir); // keep only the compressed result and original PNG frames
        }
        const bytes=fs.statSync(out).size;
        const fits=bytes<=MAX_BYTES;
        const candidate={path:fits?out:null,bytes,quality:targetQuality,fps:targetFps,frames:frameNames.length,fits};
        attempted.set(key,candidate);
        if(!fits)unlink(out);
        this.progress('Checking size',`${targetFps} FPS / Q${targetQuality}: ${(bytes/1e6).toFixed(2)} MB (maximum 9.99 MB).`,94);
        return candidate;
      }
      // Bind the encoder function to this WebpMaker instance.
      const encode=encodeCandidate.bind(this);
      function nextReduction(curFps,curQuality,index){
        // If a step cannot be taken because one floor was reached, move to
        // the next type of step. Never decrement quality below 75 automatically.
        for(let i=0;i<reductionSteps.length;i++){
          const step=reductionSteps[index%reductionSteps.length];
          index++;
          if(step==='fps'&&curFps>minimumAutoFps)
            return {fps:curFps-1,quality:curQuality,index};
          if(step==='quality'&&curQuality>minimumAutoQuality)
            return {fps:curFps,quality:Math.max(minimumAutoQuality,curQuality-5),index};
        }
        return null;
      }
      let fps=job.fps,quality=job.quality,reductionIndex=0;
      let selected=null;
      while(true){
        const trial=await encode(fps,quality,'Encoding with ImageMagick');
        if(trial.fits){selected=trial;break;}
        const next=nextReduction(fps,quality,reductionIndex);
        if(!next){
          const floor=`${minimumAutoFps} FPS and quality ${minimumAutoQuality}`;
          throw new Error(`The WebP still exceeds 9.99 MB at ${floor}. WebP Maker will not lower FPS or quality further automatically. Adjust the settings manually and convert again.`);
        }
        fps=next.fps;quality=next.quality;reductionIndex=next.index;
      }
      // Quality takes precedence over frame rate. If quality can be increased
      // by one, preserve the higher quality even if one less FPS is needed.
      // If the first fit is significantly under 9.99 MB, try one-point
      // improvements until we find the best result supported by the size cap.
      function choose(candidate){
        if(selected.path&&selected.path!==candidate.path)unlink(selected.path);
        selected=candidate;
      }
      const refinementLimit=24; // bounded so a lengthy clip cannot retry forever
      let refinements=0;
      while(selected.quality<job.quality&&refinements<refinementLimit){
        const desiredQuality=selected.quality+1;
        let candidate=null;
        let testFps=selected.fps;
        while(testFps>=minimumAutoFps&&refinements<refinementLimit){
          const key=`${testFps}:${desiredQuality}`;
          if(!attempted.has(key))refinements++;
          const trial=await encode(testFps,desiredQuality,'Refining image quality');
          if(trial.fits){candidate=trial;break;}
          testFps--;
        }
        if(!candidate)break;
        choose(candidate);
      }
      // With the best quality established, raise FPS one frame at a time.
      while(selected.fps<job.fps&&refinements<refinementLimit){
        const candidateFps=selected.fps+1;
        const key=`${candidateFps}:${selected.quality}`;
        if(!attempted.has(key))refinements++;
        const trial=await encode(candidateFps,selected.quality,'Refining frame rate');
        if(!trial.fits)break;
        choose(trial);
      }
      // Adaptive per-clip encoding: instead of forcing the same quality onto
      // every MP4 scene, preserve smoother / cheaper-to-compress scenes at a
      // higher quality and recover the bytes from the most expensive scene.
      // This operates ONLY on cached PNGs and never changes size, FPS or loop.
      // The initial uniform candidate remains a safe fallback at all times.
      if(job.clipFrames.length>=2){
        const chunked=[];
        let sourceOffset=0;
        for(const sourceCount of job.clipFrames){
          const n=Math.max(1,Math.round(sourceCount*selected.fps/job.baseFps));
          const files=[];
          for(let i=0;i<n;i++){
            const sourceIndex=Math.min(sourceCount-1,Math.floor((i+.5)*sourceCount/n));
            files.push(names[sourceOffset+sourceIndex]);
          }
          chunked.push(files);
          sourceOffset+=sourceCount;
        }
        // Small source PNGs usually represent smoother imagery and can be
        // protected at a modest cost; larger ones provide more budget savings
        // with a small quality adjustment. No character/content recognition.
        const scores=chunked.map(files=>{
          const step=Math.max(1,Math.floor(files.length/8));
          const sampled=files.filter((_,i)=>i%step===0).slice(0,8);
          return sampled.reduce((n,f)=>n+fs.statSync(path.join(framesDir,f)).size,0)/sampled.length;
        });
        const preference=scores.indexOf(Math.min(...scores));
        const sacrifice=scores.indexOf(Math.max(...scores));
        if(preference!==sacrifice){
          const higher=Math.min(99,job.quality+1,selected.quality+3);
          const lowerFloor=Math.max(minimumAutoQuality,selected.quality-3);
          const framesEncoded=new Map();
          async function adaptiveClip(i,q){
            const cacheKey=`${i}:${selected.fps}:${q}`;
            if(framesEncoded.has(cacheKey))return framesEncoded.get(cacheKey);
            const dir=path.join(this.workDir,`adaptive-clip${i}-fps${selected.fps}-q${q}`);
            fs.mkdirSync(dir,{recursive:true});
            await this.command(magick,['-define','webp:lossless=false',
              '-define','webp:method=4','-quality',String(q),
              ...chunked[i],'+adjoin',path.join(dir,'frame_%06d.webp')],
              {cwd:framesDir,env:{...process.env,MAGICK_TEMPORARY_PATH:this.workDir}});
            const results=fs.readdirSync(dir).filter(n=>/^frame_\d{6}\.webp$/.test(n)).sort().map(f=>path.join(dir,f));
            if(results.length!==chunked[i].length)throw new Error(`Incomplete adaptive encoding for clip ${i+1}.`);
            framesEncoded.set(cacheKey,results);
            return results;
          }
          // Only use the adaptive result if it is genuinely under the cap.
          // Keep the original successful uniform candidate if not.
          if(higher>selected.quality){
            for(let low=selected.quality;low>=lowerFloor;low--){
              if(job.cancelled)throw new Error('Conversion cancelled.');
              const qualities=job.clipFrames.map(()=>selected.quality);
              qualities[preference]=higher;qualities[sacrifice]=low;
              const pathOut=path.join(this.workDir,`candidate-adaptive-fps${selected.fps}-hi${higher}-low${low}.webp`);
              this.progress('Adaptive quality optimization',
                `Prioritizing smooth scenes: clip ${preference+1} Q${higher}, clip ${sacrifice+1} Q${low}. Dimensions and FPS unchanged.`,94);
              const clips=[];
              try{
                for(let i=0;i<chunked.length;i++)clips.push(...await adaptiveClip.call(this,i,qualities[i]));
                packIndependentFrames(clips,pathOut,{width:job.width,height:job.height,fps:selected.fps});
                const bytes=fs.statSync(pathOut).size;
                if(bytes<=MAX_BYTES){
                  if(selected.path&&selected.path!==pathOut)unlink(selected.path);
                  selected={path:pathOut,bytes,quality:Math.min(...qualities),fps:selected.fps,frames:clips.length,fits:true,sceneQualities:qualities};
                  break;
                }
                unlink(pathOut);
              }catch(e){unlink(pathOut);throw e;}
            }
          }
          // Temporary independent frames are only needed to assemble the final
          // RIFF animation, not to preview or save it. Retain source PNG cache.
          for(const [key] of framesEncoded){
            const [i,fps,q]=key.split(':');
            remove(path.join(this.workDir,`adaptive-clip${i}-fps${fps}-q${q}`));
          }
        }
      }
      this.output=selected.path;
      this.latest={bytes:selected.bytes,quality:selected.quality,width:job.width,height:job.height,fps:selected.fps,frames:selected.frames,
        duration:Number((selected.frames/selected.fps).toFixed(2)),loop:'infinite',
        sceneQualities:selected.sceneQualities||null};
      this.progress('WebP ready',`${(selected.bytes/1e6).toFixed(2)} MB, ${job.width} × ${job.height}, ${selected.fps} FPS, infinite loop.`,100);
      // Preserve lossless source frames for later quality/FPS adjustments.
      // They are cleared when sources/size change, or on app shutdown.
      return this.latest;
    } catch(e) {
      // An oversized file is an encoding failure, not a decoding failure.
      // Retain completed PNG frames so manually retrying can skip MP4 decoding.
      if(!this.cachedFrames?.complete)this.reset();
      else{this.output=null;this.latest=null;}
      throw e;
    } finally {
      if(this.job===job)this.job=null;
    }
  }
  cancel() {
    if(!this.job)return {cancelled:false};
    this.job.cancelled=true;
    if(this.job.child){try{this.job.child.kill();}catch{}}
    this.progress('Cancelled','Temporary video frames are being cleared.',0);
    this.reset();
    // A cancelled capture has no child process waiting for completion.
    // Release the job immediately so another conversion can start.
    if(!this.job.child)this.job=null;
    return {cancelled:true};
  }
  reset() {
    if(this.output)this.output=null;
    this.latest=null;
    this.cachedFrames=null;
    if(this.workDir)remove(this.workDir);
    this.workDir=null;
  }
  resultPath(){return this.output&&exists(this.output)&&fs.statSync(this.output).size<=MAX_BYTES?this.output:null;}
  preview(){const p=this.resultPath();if(!p)throw new Error('Convert an animation before previewing.');return {data:'data:image/webp;base64,'+fs.readFileSync(p).toString('base64')};}
  save(where){const p=this.resultPath();if(!p)throw new Error('No valid WebP to save.');if(!/\.webp$/i.test(where))throw new Error('Choose a .webp destination.');fs.copyFileSync(p,where);return {saved:true,path:where,bytes:fs.statSync(where).size};}
  dispose(){this.cancel();this.reset();}
}
module.exports={WebpMaker,MAX_BYTES};
