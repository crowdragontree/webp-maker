'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {outputSize,rect,ratios,freeformRegion,moveFreeform,resizeFreeform}=require('../renderer/frameGeometry');
const {probeWebm}=require('../renderer/webmProbe');
const fixture=i=>path.join(__dirname,'..','tests','fixtures',`comfy-webm-${i}.mp4`);
async function main(){
  const src={width:720,height:720};
  assert.deepEqual(Object.keys(ratios),['16:9','9:16','3:4','4:3','1:1']);
  assert.deepEqual(outputSize(src,'480',0,0,'3:4'),{width:480,height:640});
  assert.deepEqual(outputSize(src,'480',0,0,'16:9'),{width:480,height:270});
  assert.deepEqual(outputSize(src,'480',0,0,'9:16'),{width:480,height:853});
  assert.deepEqual(outputSize(src,'480',0,0,'4:3'),{width:480,height:360});
  assert.deepEqual(outputSize(src,'480',0,0,'1:1'),{width:480,height:480});
  assert.deepEqual(outputSize(src,'custom',480,640,'fill'),{width:480,height:640});
  assert.deepEqual(outputSize(src,'custom',500,600,'fill'),{width:500,height:600});
  assert.throws(()=>outputSize(src,'custom',360,640,'fill'),/Output width/);
  const crop=rect(720,720,480,640,'3:4','center');
  assert.deepEqual(crop,{sx:90,sy:0,sw:540,sh:720,dx:0,dy:0,dw:480,dh:640});
  const right=rect(720,720,480,640,'fill','right');
  assert.equal(right.sx,180);
  const fit=rect(720,720,480,640,'fit','center');
  assert.deepEqual(fit,{sx:0,sy:0,sw:720,sh:720,dx:0,dy:80,dw:480,dh:480});
  // Freeform cropping is per source clip and never stretches its pixels.
  const centered=freeformRegion(720,720,480,640);
  assert.deepEqual({sx:centered.sx,sy:centered.sy,sw:centered.sw,sh:centered.sh},
    {sx:90,sy:0,sw:540,sh:720});
  assert(Math.abs(centered.sw/centered.sh-480/640)<1e-9);
  const moved=moveFreeform(720,720,480,640,{cx:.5,cy:.5,scale:.65},.35,-.1);
  const placed=freeformRegion(720,720,480,640,moved);
  assert(placed.sx>=0&&placed.sy>=0&&placed.sx+placed.sw<=720&&placed.sy+placed.sh<=720);
  assert(placed.cx>.5&&placed.cy<.5,'Dragging did not move crop selection');
  const before=freeformRegion(720,720,480,640,{cx:.5,cy:.5,scale:.7});
  const pointerX=(before.sx+before.sw*.72)/720;
  const pointerY=(before.sy+before.sh*.72)/720;
  const resized=resizeFreeform(720,720,480,640,{cx:.5,cy:.5,scale:.7},'se',pointerX,pointerY);
  const after=freeformRegion(720,720,480,640,resized);
  assert(after.sw<before.sw,'Corner handle must shrink the freeform rectangle');
  assert(Math.abs(after.sx-before.sx)<.01&&Math.abs(after.sy-before.sy)<.01,
    'Resizing must keep opposite corner fixed');
  assert(Math.abs(after.sw/after.sh-480/640)<1e-9,'Resizing must never distort aspect ratio');
  const bounded=freeformRegion(720,720,480,640,moveFreeform(720,720,480,640,
    {cx:.5,cy:.5,scale:.5},100,100));
  assert(Math.abs(bounded.sx+bounded.sw-720)<.01&&Math.abs(bounded.sy+bounded.sh-720)<.01,
    'Moving freeform crop must clamp to source edges');
  const different=freeformRegion(1280,720,480,640,{cx:.15,cy:.55,scale:.8});
  assert(different.sx>=0&&different.sy>=0&&different.sx+different.sw<=1280+1e-8);
  const extracted=rect(720,720,480,640,'freeform','center',resized);
  assert(Math.abs(extracted.sw-after.sw)<.01&&Math.abs(extracted.sx-after.sx)<.01,
    'Conversion crop must match the freeform preview rectangle');
  for(let i=1;i<=3;i++){
    const buf=fs.readFileSync(fixture(i));
    assert(buf.length>1000,'Synthetic VP9 fixture was not bundled');
    const video=await probeWebm({size:buf.length,slice:(start,end)=>new Blob([buf.subarray(start,end)])});
    assert.equal(video.container,'webm','Mislabeled MP4 failed to be recognized as WebM');
    assert.equal(video.videoBlocks,13,'Not all VP9 frames were counted');
    assert(Math.abs(video.duration-.8125)<0.001,'Missing WebM Duration was not inferred from frame timecodes');
  }
  console.log('WebM/VP9 duration and crop geometry regression tests passed (3 mislabeled .mp4 clips, 5 crop ratios, independent custom size, draggable freeform geometry).');
}
module.exports=main();
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1;});
