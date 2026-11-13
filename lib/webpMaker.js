'use strict';
// WebP Maker: local-only ImageMagick animated WebP encoder.
// Electron's HTML5 video decoder supplies lossless PNG frames; no FFmpeg is used.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawn,execFileSync} = require('child_process');

const MIB = 1048576; // sizes are counted the way Windows Explorer and ezgif count them: 1 MB = 1,048,576 bytes
const MAX_BYTES = 10_475_274; // 9.99 MB counted that way (9.99 x 1,048,576), strictly below 10 MB.
const MAX_FRAMES = 1500;
const MAX_DIMENSION = 4096;
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const exists = p => {try {return fs.statSync(p).isFile();} catch {return false;}};
const remove = p => {if(p) {try {fs.rmSync(p,{recursive:true,force:true,maxRetries:2,retryDelay:150});} catch {}}};
const unlink = p => {try {fs.rmSync(p,{force:true});} catch {}};
const text = v => String(v||'').replace(/\s+/g,' ').trim();
const PNG_HEADER = Buffer.from([137,80,78,71,13,10,26,10]);
// The encoding methods, in the order WebP Maker offers them when one cannot get under 9.99 MB. Every method runs the same FPS /
// quality steps on the PNG frames already decoded from the MP4s; only how each frame is prepared, which frames are kept and how
// low quality may go differ.
//   standard: every frame, as it was decoded.
//   grain:    ImageMagick -enhance smooths fine grain and noise in every frame before it is encoded.
//   motion:   up to a third of the frames in each clip are skipped where the picture barely changes (never two in a row,
//             never a clip's first or last frame); the frame before is shown for those slots, so timing is unchanged.
//   quality:  every frame, with quality allowed down to 40 instead of 75.
const METHODS = {
  standard:{label:'Standard encoding',qualityFloor:75},
  grain:{label:'Grain reduction',qualityFloor:75},
  motion:{label:'Motion-timed frames',qualityFloor:75},
  quality:{label:'Lower quality',qualityFloor:40}
};
const MOTION_DROP_SHARE = 1/3;   // motion-timed: at most this share of a clip's frames is skipped
const SIGNATURE = 64*64;          // motion-timed: bytes in one frame's grey 64 x 64 thumbnail

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
function packIndependentFrames(files,target,{width,height,fps,durations}){
  if(!files.length)throw new Error('No encoded WebP frames to combine.');
  // Cumulative rounded milliseconds prevent drift at 23/24 FPS. Motion-timed frames pass their own durations.
  const times=durations!==undefined?durations:
    (Number.isInteger(fps)&&fps>=1&&fps<=1000?files.map((_,i)=>Math.round((i+1)*1000/fps)-Math.round(i*1000/fps)):null);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width>16384||height>16384||
    !Array.isArray(times)||times.length!==files.length||times.some(ms=>!Number.isInteger(ms)||ms<1||ms>0xFFFFFF))
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
    writeUint24(h,times[i],12);
    h[15]=2; // no blending: each complete frame replaces the previous one
    const frame=webpChunk('ANMF',Buffer.concat([h,...payload]));
    chunks.push(frame);total+=frame.length;
  });
  const riff=Buffer.alloc(12);riff.write('RIFF',0,4,'ascii');
  riff.writeUInt32LE(total-8,4);riff.write('WEBP',8,4,'ascii');
  fs.writeFileSync(target,Buffer.concat([riff,...chunks],total));
}

class WebpMaker {
  constructor({appRoot,userData,onProgress=()=>{}}) {
    this.appRoot=appRoot;
    this.userData=userData;
    this.onProgress=onProgress;
    this.binDir=path.join(appRoot,'.runtime','webp-maker-tools');
    this.job=null;
    this.cachedFrames=null;
    this.output=null;
    this.oversize=null;   // the smallest attempt that was over the size limit: kept (not deleted) so it can still be looked at and saved
    this.workDir=null;
    this.latest=null;
    this.stash=new Map();   // v1.5.4: batch key -> the finished WebP kept for that batch
    this.stashRoot=null;
  }
  progress(title,detail,percent) {
    this.onProgress({title,detail,percent:clamp(Math.round(percent||0),0,100)});
  }
  // Never invoke a shell with source filenames or user-supplied arguments.
  // ImageMagick's -monitor writes progress to stderr; keep errors separate.
  command(exe,args,{cwd,env,onMonitor,collect}={}) {
    return new Promise((resolve,reject)=>{
      const job=this.job;
      if(!job||job.cancelled)return reject(new Error('Conversion cancelled.'));
      const child=spawn(exe,args,{cwd,env:{...process.env,APPIMAGE_EXTRACT_AND_RUN:'1',...(env||{})},windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
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
      const output=[];
      child.stdout.on('data',chunk=>{if(collect)output.push(chunk);});
      child.once('error',e=>{if(job.child===child)job.child=null;reject(new Error(`Could not start ImageMagick: ${e.message}`));});
      child.once('close',code=>{
        if(job.child===child)job.child=null;
        if(job.cancelled)return reject(new Error('Conversion cancelled.'));
        if(code!==0)return reject(new Error(`ImageMagick exited with code ${code}: ${text(diagnostic||pending).slice(-900)}`));
        resolve(collect?Buffer.concat(output):undefined);
      });
    });
  }
  async magick() {
    const bundled=process.platform==='win32'?path.join(this.appRoot,'resources','webpmaker','windows','magick.exe')
      :path.join(this.appRoot,'resources','webpmaker','linux','magick');
    const privateCopy=path.join(this.binDir,'imagemagick','magick.exe');
    let executable=process.env.JBS_WEBP_MAGICK||(exists(bundled)?bundled:
      (process.platform==='win32'?privateCopy:bundled));
    if(process.platform!=='win32'){
      if(exists(executable)){
        try {fs.chmodSync(executable,0o755);}catch {}
        return executable;
      }
      // Source/development installations can use a system ImageMagick 7.
      try {execFileSync('magick',['-version'],{timeout:3000,windowsHide:true});return 'magick';} catch {}
      throw new Error('ImageMagick 7 is missing. Please use the official Linux release ZIP, which bundles the portable ImageMagick binary.');
    }
    if(exists(executable))return executable;
    // A preexisting system copy is supported, but is not required.
    try {
      const match=execFileSync('where.exe',['magick.exe'],{encoding:'utf8',windowsHide:true,timeout:4000}).split(/\r?\n/).find(exists);
      if(match)return match;
    } catch {}
    this.progress('Preparing ImageMagick','Downloading a private portable ImageMagick copy for first use (no installer).',3);
    const setup=path.join(this.appRoot,'resources','webpmaker','setup-webpmaker.ps1');
    if(!exists(setup))throw new Error('The ImageMagick setup file is missing.');
    await this.command('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',setup,'-ToolsDir',this.binDir]);
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
    const method=opts.method===undefined?'standard':opts.method;
    if(!Object.prototype.hasOwnProperty.call(METHODS,method))throw new Error('Unknown WebP encoding method.');
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
        if(/^candidate-.+\.webp$/.test(file))unlink(path.join(this.workDir,file));
    }
    const captured=this.cachedFrames;
    this.job={cancelled:false,child:null,width,height,fps,quality,method,
      expectedFrames:captured.expectedFrames,clipFrames:[...captured.clipFrames],
      count:canReuse?captured.expectedFrames:0,baseFps:captured.fps,cached:canReuse};
    this.progress(canReuse?'Reusing decoded frames':'Preparing frames',
      (method==='standard'?'':METHODS[method].label+': ')+(canReuse?`Using ${captured.expectedFrames} cached PNG frames captured at ${captured.fps} FPS; only WebP encoding will run.`:
      `Output: ${width} × ${height}, ${fps} FPS. Original dimensions are not changed unless selected.`),canReuse?54:5);
    return {ready:true,maxBytes:MAX_BYTES,cached:canReuse,method,
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
  // Motion-timed frames: a grey 64 x 64 thumbnail of every decoded PNG, read back from ImageMagick in a few batches, tells how
  // much each frame differs from another. It works on the cached PNG frames only: nothing is decoded from the MP4s again.
  async motionSignatures(magick,framesDir,names) {
    const cache=this.cachedFrames;
    if(cache&&cache.signatures&&cache.signatures.length===names.length*SIGNATURE)return cache.signatures;
    // Keep each batch to about 32 million pixels so long or large clips never load every full-size frame at once.
    const perBatch=Math.max(1,Math.min(200,Math.floor(32*MIB/Math.max(1,this.job.width*this.job.height))));
    const parts=[];
    for(let i=0;i<names.length;i+=perBatch){
      const batch=names.slice(i,i+perBatch);
      const out=await this.command(magick,[...batch,'-scale','64x64!','-colorspace','Gray','-depth','8','gray:-'],
        {cwd:framesDir,env:{...process.env,MAGICK_TEMPORARY_PATH:this.workDir},collect:true});
      if(!out||out.length!==batch.length*SIGNATURE)throw new Error('Could not measure the motion between frames.');
      parts.push(out);
      this.progress('Motion-timed frames',`Measuring motion: frame ${Math.min(names.length,i+batch.length)} of ${names.length}.`,55);
    }
    const all=Buffer.concat(parts);
    if(cache)cache.signatures=all;
    return all;
  }
  async finish() {
    const job=this.job;
    if(!job||job.cancelled)throw new Error('Conversion cancelled.');
    if(job.count!==job.expectedFrames)throw new Error(`Frame capture was incomplete (${job.count}/${job.expectedFrames}).`);
    this.clearOversize();   // a retry starts without the too-big file of the last try
    try {
      const magick=await this.magick();
      const framesDir=path.join(this.workDir,'frames');
      const names=fs.readdirSync(framesDir).filter(f=>/^f\d{6}\.png$/.test(f)).sort();
      if(names.length!==job.expectedFrames)throw new Error('One or more image frames are missing.');
      const method=job.method||'standard';
      const label=METHODS[method].label;
      const grain=method==='grain',motionTimed=method==='motion';
      const magickEnv={...process.env,MAGICK_TEMPORARY_PATH:this.workDir};
      // +adjoin makes ImageMagick encode separate full-size frames; unlike a multi-frame animation pass, it cannot introduce
      // delta-frame blending artifacts. Grain reduction adds -enhance, applied to every frame after it is read.
      const encodeArgs=(q,files,pattern)=>['-define','webp:lossless=false','-define','webp:method=6','-quality',String(q),
        ...files,...(grain?['-enhance']:[]),'+adjoin',pattern];
      const signatures=motionTimed?await this.motionSignatures(magick,framesDir,names):null;
      const change=(a,b)=>{
        let sum=0;const oa=a*SIGNATURE,ob=b*SIGNATURE;
        for(let k=0;k<SIGNATURE;k++)sum+=Math.abs(signatures[oa+k]-signatures[ob+k]);
        return sum/SIGNATURE;
      };
      // Which decoded frames make up the animation at targetFps, and how long each is shown. Frame choices are resampled
      // separately inside each MP4 clip, so short clips are never skipped and scene joins never shift. Every output slot
      // lasts the cumulative rounded milliseconds of targetFps; a motion-timed frame that is skipped adds its slot to the
      // frame before it, so the animation keeps its full length.
      const planFrames=targetFps=>{
        const clips=[],durations=[];
        let offset=0,slotIndex=0;
        const slot=i=>Math.round((i+1)*1000/targetFps)-Math.round(i*1000/targetFps);
        for(const sourceCount of job.clipFrames){
          const outputCount=Math.max(1,Math.round(sourceCount*targetFps/job.baseFps));
          const picks=[];
          for(let i=0;i<outputCount;i++)picks.push(offset+Math.min(sourceCount-1,Math.floor((i+.5)*sourceCount/outputCount)));
          offset+=sourceCount;
          const keep=picks.map(()=>true);
          if(motionTimed&&picks.length>=3){
            const limit=Math.floor(picks.length*MOTION_DROP_SHARE);
            const order=[];
            for(let j=1;j<picks.length-1;j++)order.push([change(picks[j-1],picks[j]),j]);
            order.sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
            let skipped=0;
            for(const [,j] of order){
              if(skipped>=limit)break;
              if(!keep[j-1]||!keep[j+1])continue;   // never two skipped in a row: no picture is held longer than two slots
              keep[j]=false;skipped++;
            }
          }
          const kept=[];
          for(let j=0;j<picks.length;j++){
            const ms=slot(slotIndex++);
            if(keep[j]){kept.push(names[picks[j]]);durations.push(ms);}
            else durations[durations.length-1]+=ms;
          }
          clips.push(kept);
        }
        return {clips,names:clips.flat(),durations,durationMs:durations.reduce((n,ms)=>n+ms,0)};
      };
      // Size optimization order (the same for every method, starting from the method's own starting FPS / quality):
      // FPS -1, quality -5, FPS -1, FPS -1, quality -5, FPS -1, repeated. Never automatically below 20 FPS or below the
      // method's quality floor (75; 40 for Lower quality). Once a candidate fits, gently refine upward by 1, quality FIRST,
      // then FPS. All attempts reuse the already-decoded lossless PNGs.
      const minimumAutoFps=Math.min(job.fps,20);
      const minimumAutoQuality=Math.min(job.quality,METHODS[method].qualityFloor);
      const reductionSteps=['fps','quality','fps','fps','quality','fps'];
      const attempted=new Map();
      let attempt=0;
      async function encodeCandidate(targetFps,targetQuality,reason){
        const key=`${targetFps}:${targetQuality}`;
        if(attempted.has(key))return attempted.get(key);
        if(job.cancelled)throw new Error('Conversion cancelled.');
        attempt++;
        const plan=planFrames(targetFps);
        const out=path.join(this.workDir,`candidate-${method}-q${targetQuality}-fps${targetFps}.webp`);
        const started=Date.now();
        const update=()=>{
          if(job.cancelled)return;
          const seconds=Math.floor((Date.now()-started)/1000);
          const elapsed=seconds>=60?`${Math.floor(seconds/60)}m ${seconds%60}s`:`${seconds}s`;
          const estimate=Math.min(92,55+Math.floor(37*(1-Math.exp(-seconds/30))));
          this.progress(reason,`${label}: ${targetFps} FPS / quality ${targetQuality} (pass ${attempt}); ${plan.names.length} frames${motionTimed?' (motion-timed)':''}. Elapsed ${elapsed}. Dimensions unchanged.`,estimate);
        };
        update();
        const heartbeat=setInterval(update,1000);
        const stillsDir=path.join(this.workDir,`stills-${method}-q${targetQuality}-fps${targetFps}`);
        fs.mkdirSync(stillsDir,{recursive:true});
        try {
          await this.command(magick,encodeArgs(targetQuality,plan.names,path.join(stillsDir,'frame_%06d.webp')),
            {cwd:framesDir,env:magickEnv});
          const stills=fs.readdirSync(stillsDir).filter(n=>/^frame_\d{6}\.webp$/.test(n)).sort();
          if(stills.length!==plan.names.length)
            throw new Error(`Incomplete WebP encoding (${stills.length} of ${plan.names.length} frames).`);
          packIndependentFrames(stills.map(n=>path.join(stillsDir,n)),out,
            {width:job.width,height:job.height,durations:plan.durations});
        }finally{
          clearInterval(heartbeat);
          remove(stillsDir); // keep only the compressed result and original PNG frames
        }
        const bytes=fs.statSync(out).size;
        const fits=bytes<=MAX_BYTES;
        const candidate={path:fits?out:null,bytes,quality:targetQuality,fps:targetFps,frames:plan.names.length,durationMs:plan.durationMs,fits};
        attempted.set(key,candidate);
        if(!fits){
          // keep the smallest too-big attempt (so it can still be previewed and saved); every other too-big file is deleted
          if(!this.oversize||bytes<this.oversize.bytes){this.clearOversize();this.oversize={path:out,bytes,fps:targetFps,quality:targetQuality};}
          else unlink(out);
        }
        this.progress('Checking size',`${label}: ${targetFps} FPS / Q${targetQuality}: ${(bytes/MIB).toFixed(2)} MB (maximum 9.99 MB).`,94);
        return candidate;
      }
      // Bind the encoder function to this WebpMaker instance.
      const encode=encodeCandidate.bind(this);
      function nextReduction(curFps,curQuality,index){
        // If a step cannot be taken because one floor was reached, move to the next type of step.
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
          const mb=n=>(n/MIB).toFixed(2)+' MB';
          throw new Error(`${label}: the WebP still exceeds 9.99 MB: the file is ${mb(trial.bytes)} at ${trial.fps} FPS and quality ${trial.quality}, ${mb(trial.bytes-MAX_BYTES)} over the limit. WebP Maker will not lower FPS or quality further automatically with this method (its floor is ${floor}). Adjust the settings manually and convert again.`);
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
      // This operates ONLY on cached PNGs and never changes size, FPS, the
      // method's frame choices or loop. The uniform candidate remains a safe fallback.
      if(job.clipFrames.length>=2){
        const plan=planFrames(selected.fps);
        const chunked=plan.clips;
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
            await this.command(magick,encodeArgs(q,chunked[i],path.join(dir,'frame_%06d.webp')),{cwd:framesDir,env:magickEnv});
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
              const pathOut=path.join(this.workDir,`candidate-adaptive-${method}-fps${selected.fps}-hi${higher}-low${low}.webp`);
              this.progress('Adaptive quality optimization',
                `${label}: prioritizing smooth scenes: clip ${preference+1} Q${higher}, clip ${sacrifice+1} Q${low}. Dimensions and FPS unchanged.`,94);
              const clips=[];
              try{
                for(let i=0;i<chunked.length;i++)clips.push(...await adaptiveClip.call(this,i,qualities[i]));
                packIndependentFrames(clips,pathOut,{width:job.width,height:job.height,durations:plan.durations});
                const bytes=fs.statSync(pathOut).size;
                if(bytes<=MAX_BYTES){
                  if(selected.path&&selected.path!==pathOut)unlink(selected.path);
                  selected={path:pathOut,bytes,quality:Math.min(...qualities),fps:selected.fps,frames:clips.length,durationMs:plan.durationMs,fits:true,sceneQualities:qualities};
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
      this.clearOversize();
      const seconds=(selected.durationMs||selected.frames*1000/selected.fps)/1000;
      const averageFps=Number((selected.frames/seconds).toFixed(1));
      this.latest={bytes:selected.bytes,quality:selected.quality,width:job.width,height:job.height,fps:selected.fps,frames:selected.frames,
        duration:Number(seconds.toFixed(2)),loop:'infinite',sceneQualities:selected.sceneQualities||null,
        method,methodLabel:label,averageFps};
      this.progress('WebP ready',`${label}: ${(selected.bytes/MIB).toFixed(2)} MB, ${job.width} × ${job.height}, ${selected.fps} FPS${motionTimed?` (motion-timed, ${averageFps} FPS average)`:''}, infinite loop.`,100);
      // Preserve lossless source frames for later quality/FPS adjustments.
      // They are cleared when sources/size change, or on app shutdown.
      return this.latest;
    } catch(e) {
      // An oversized file is an encoding failure, not a decoding failure.
      // Retain completed PNG frames so the next method or a manual retry can skip MP4 decoding.
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
    this.oversize=null;
    this.latest=null;
    this.cachedFrames=null;
    if(this.workDir)remove(this.workDir);
    this.workDir=null;
  }
  clearOversize(){if(this.oversize&&this.oversize.path)unlink(this.oversize.path);this.oversize=null;}
  // allowOver: also give the too-big file kept after a failed conversion, so it can be previewed and saved with right-click > Save image as
  resultPath(allowOver){
    if(this.output&&exists(this.output)&&fs.statSync(this.output).size<=MAX_BYTES)return this.output;
    return allowOver&&this.oversize&&exists(this.oversize.path)?this.oversize.path:null;
  }
  preview(allowOver){const p=this.resultPath(!!allowOver);if(!p)throw new Error('Convert an animation before previewing.');const bytes=fs.statSync(p).size;return {data:'data:image/webp;base64,'+fs.readFileSync(p).toString('base64'),bytes,oversize:bytes>MAX_BYTES};}
  save(where,allowOver){const p=this.resultPath(!!allowOver);if(!p)throw new Error('No valid WebP to save.');if(!/\.webp$/i.test(where))throw new Error('Choose a .webp destination.');fs.copyFileSync(p,where);return {saved:true,path:where,bytes:fs.statSync(where).size};}
  // ---- v1.5.4 batches: every batch is converted one after the other, and each finished WebP is kept under its batch key so the next conversion
  // (which clears the working folder) cannot remove it. A kept file can be previewed, saved on its own or saved together with the others.
  stashKey(key){const k=String(key);if(!/^[0-9]{1,9}$/.test(k))throw new Error('Invalid batch.');return k;}
  stashResult(key){
    const k=this.stashKey(key),p=this.resultPath(false);if(!p)throw new Error('Convert an animation before keeping it.');
    if(!this.stashRoot||!fs.existsSync(this.stashRoot))this.stashRoot=fs.mkdtempSync(path.join(os.tmpdir(),'jbs-webp-batches-'));
    const dest=path.join(this.stashRoot,`b${k}.webp`);fs.copyFileSync(p,dest);
    const bytes=fs.statSync(dest).size;this.stash.set(k,{path:dest,bytes});return {bytes};
  }
  stashPathOf(key){const e=this.stash.get(this.stashKey(key));if(!e||!exists(e.path))throw new Error('That batch has no finished WebP. Convert it again.');return e.path;}
  stashPreview(key){const p=this.stashPathOf(key);return {data:'data:image/webp;base64,'+fs.readFileSync(p).toString('base64'),bytes:fs.statSync(p).size};}
  stashSave(key,where){const p=this.stashPathOf(key);if(!/\.webp$/i.test(where))throw new Error('Choose a .webp destination.');fs.copyFileSync(p,where);return {saved:true,path:where,bytes:fs.statSync(where).size};}
  // entries: [{key,name}] in the order they should be saved. A name that is empty or taken (in the list or already in the folder) gets " (2)", " (3)"...
  stashSaveAll(dir,entries){
    if(!dir||!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())throw new Error('Choose a folder to save into.');
    if(!Array.isArray(entries)||!entries.length||entries.length>60)throw new Error('There are no finished WebP files to save.');
    const used=new Set(),files=[];
    for(const [i,e] of entries.entries()){
      const src=this.stashPathOf(e&&e.key);
      const base=String((e&&e.name)||'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\.webp$/i,'').replace(/^[\s.]+|[\s.]+$/g,'').slice(0,80)||`Batch ${i+1}`;
      let name=base,n=1;
      while(used.has(name.toLowerCase())||fs.existsSync(path.join(dir,name+'.webp'))){n++;name=`${base} (${n})`;}
      used.add(name.toLowerCase());
      const out=path.join(dir,name+'.webp');fs.copyFileSync(src,out);files.push({name:name+'.webp',path:out,bytes:fs.statSync(out).size});
    }
    return {saved:files.length,dir,files};
  }
  stashDrop(key){const k=this.stashKey(key),e=this.stash.get(k);if(e)unlink(e.path);this.stash.delete(k);return true;}
  stashClear(){for(const e of this.stash.values())unlink(e.path);this.stash.clear();if(this.stashRoot){remove(this.stashRoot);this.stashRoot=null;}return true;}
  dispose(){this.cancel();this.reset();this.stashClear();}
}
module.exports={WebpMaker,MAX_BYTES};
