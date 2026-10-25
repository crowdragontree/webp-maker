// Regression checks for built-in WebP Maker, including ComfyUI-style VP9/WebM
// clips with a misleading .mp4 filename and no Duration element.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const g=require('../renderer/frameGeometry.js');
const {probeWebm}=require('../renderer/webmProbe.js');
async function main(){
  const src={width:720,height:720};
  const sizes={'16:9':[480,270],'9:16':[480,853],'3:4':[480,640],'4:3':[480,360],'1:1':[480,480]};
  for(const [crop,[width,height]] of Object.entries(sizes)){
    assert.deepEqual(g.outputSize(src,'480',0,0,crop),{width,height},`Wrong output for ${crop}`);
  }
  assert.deepEqual(g.outputSize(src,'custom',480,640,'fill'),{width:480,height:640});
  assert.deepEqual(g.outputSize(src,'custom',500,620,'freeform'),{width:500,height:620});
  assert.throws(()=>g.outputSize(src,'custom',300,620,'freeform'),/480-4096/);
  const normal=g.rect(720,720,480,640,'3:4','center');
  assert.deepEqual(normal,{sx:90,sy:0,sw:540,sh:720,dx:0,dy:0,dw:480,dh:640});
  const free=g.rect(720,720,480,640,'freeform','center');
  assert.equal(free.sx,90);assert.equal(free.sw,540);assert.equal(free.sh,720);
  const moved=g.move(720,720,480,640,{cx:.5,cy:.5,scale:.7},.25,-.15);
  const placed=g.region(720,720,480,640,moved);
  assert(placed.cx>.5&&placed.cy<.5&&placed.sx>=0&&placed.sy>=0);
  const resized=g.resize(720,720,480,640,{cx:.5,cy:.5,scale:.7},'se',.7,.8);
  const shrunk=g.region(720,720,480,640,resized);
  assert(shrunk.sw<free.sw);
  assert(Math.abs(shrunk.sw/shrunk.sh-480/640)<1e-9,'Freeform must never stretch the result');
  const final=g.rect(720,720,480,640,'freeform','center',resized);
  assert.equal(final.sw,shrunk.sw);
  for(let i=1;i<=3;i++){
    const file=path.join(__dirname,'..','tests','fixtures',`webp-vp9-${i}.mp4`);
    const b=fs.readFileSync(file);
    const info=await probeWebm({size:b.length,slice:(a,z)=>new Blob([b.subarray(a,z)])});
    assert.equal(info.container,'webm');
    assert.equal(info.videoBlocks,13);
    assert(Math.abs(info.duration-0.8125)<0.001,`Wrong fallback duration: ${info.duration}`);
  }
  console.log('WebP crop, freeform, and 3 VP9/WebM fallback-duration tests passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
