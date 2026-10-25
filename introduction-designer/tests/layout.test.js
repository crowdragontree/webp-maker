'use strict';
const assert=require('node:assert/strict');
const L=require('../layout');
const blocks=[
 {id:'top',placement:{x:5,y:20,w:90,h:75}},
 {id:'middle',placement:{x:5,y:125,w:90,h:75}},
 {id:'bottom',placement:{x:5,y:230,w:90,h:75}}
];
function preserved(result,focused){
 assert(result.ok,result.reason);
 for(const b of blocks){if(b.id!==focused)assert.deepEqual(result.placements.get(b.id),b.placement,'Neighbor moved '+b.id);}
}
{
 // Photoshop-like freeform dragging crosses occupied blocks freely. A
 // pointer move MUST NOT silently fail or push the surrounding blocks.
 const placed=L.arrange(blocks,'bottom',{x:5,y:25,w:90,h:75},610,{snap:false,collision:'free'});
 preserved(placed,'bottom');assert.equal(placed.placements.get('bottom').y,25);
 assert(L.overlap(placed.placements.get('bottom'),blocks[0].placement,0,0),'Intentionally overlapping drag should be possible');
}
{
 const moved=L.arrange(blocks,'bottom',{x:6,y:31,w:90,h:75},610,{snap:false});
 preserved(moved,'bottom');assert.equal(moved.placements.get('bottom').x,6);assert.equal(moved.placements.get('bottom').y,31);
}
{
 const protectedMove=L.arrange(blocks,'bottom',{x:5,y:25,w:90,h:75},610,{snap:false,collision:'reject'});
 assert.equal(protectedMove.ok,false,'Optional overlap protection must reject colliding drop');
 const automaticallyPlaced=L.arrange(blocks,'bottom',{x:5,y:25,w:90,h:75},610,{snap:false,collision:'avoid'});
 preserved(automaticallyPlaced,'bottom');assert(!L.overlap(automaticallyPlaced.placements.get('bottom'),blocks[0].placement,0,0));
}
{
 const s=L.snap({x:59,y:333,w:40,h:70},[],{canvasHeight:610,thresholdX:1.5,thresholdY:7});
 assert.equal(s.placement.x,60,'Right edge should snap to canvas right');
 assert.equal(s.guides.x.position,100,'Right guide must render at 100%, not selected left');
 assert.equal(s.guides.x.edge,'right');
 const center=L.snap({x:29.5,y:400,w:40,h:70},[],{canvasHeight:610,thresholdX:1.5,thresholdY:7});
 assert.equal(center.guides.x.position,50,'Center line should be at stage 50%');
 const left=L.snap({x:1,y:400,w:40,h:70},[],{canvasHeight:610,thresholdX:1.5,thresholdY:7});
 assert.equal(left.guides.x.position,0,'Left line should be at stage 0%');
 const vertical=L.snap({x:18,y:18,w:35,h:60},[blocks[0].placement],{canvasHeight:610,thresholdX:1.5,thresholdY:7});
 assert.equal(vertical.guides.y.position,20,'Top alignment guide must render at the matched edge');
}
{
 const base={x:25,y:40,w:40,h:120};
 for(const handle of ['nw','n','ne','e','se','s','sw','w']){
  const p={...base};
  if(handle.includes('w')){p.x-=4;p.w+=4;}
  if(handle.includes('e'))p.w+=4;
  if(handle.includes('n')){p.y-=11;p.h+=11;}
  if(handle.includes('s'))p.h+=11;
  const result=L.snapResize(p,[],{handle,canvasHeight:610,thresholdX:1.5,thresholdY:7});
  const a=result.placement;
  if(handle.includes('w'))assert.equal(a.x+a.w,base.x+base.w,'East edge stays anchored '+handle);
  if(handle.includes('n'))assert.equal(a.y+a.h,base.y+base.h,'South edge stays anchored '+handle);
  if(!handle.includes('w')&&!handle.includes('e')){assert.equal(a.x,base.x);assert.equal(a.w,base.w);}
  if(!handle.includes('n')&&!handle.includes('s')){assert.equal(a.y,base.y);assert.equal(a.h,base.h);}
 }
}
{
 // Migration of legacy stacked layouts can still avoid overlaps once.
 const old=Array.from({length:16},(_,i)=>({id:'v'+i,placement:{x:5,y:20,w:90,h:70}}));
 const layout=L.arrange(old,null,null,610);assert(layout.ok);
 const spots=[...layout.placements.values()];
 for(let i=0;i<spots.length;i++)for(let j=i+1;j<spots.length;j++)assert(!L.overlap(spots[i],spots[j]),'Legacy migration overlapped');
 assert(layout.height>1100);
}
console.log('PASS: Independent free drag across other elements, optional overlap protection, six alignment references, all eight resize directions, and legacy layout migration.');
