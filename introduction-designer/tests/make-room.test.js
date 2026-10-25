'use strict';
const assert=require('node:assert/strict');
const L=require('../layout');
const block=(id,x,y,w=90,h=75)=>({id,placement:{x,y,w,h}});
const assertClear=arrangement=>{
  assert(arrangement.ok,arrangement.reason);
  const all=[...arrangement.placements.values()];
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    assert(!L.overlap(all[i],all[j],0,0),`Actual overlap: ${JSON.stringify(all[i])} ${JSON.stringify(all[j])}`);
  }
};
{
 const originals=[block('scene',5,20),block('character',5,120),block('intro',5,220),block('extra',5,320)];
 const drag=L.arrange(originals,'character',{x:5,y:25,w:90,h:75},610,{snap:false,collision:'free'});
 assert(drag.ok);
 assert.deepEqual(drag.placements.get('scene'),originals[0].placement,'While dragging, no neighbors move');
 const drop=L.makeRoom(originals,'character',drag.placements.get('character'),610);
 assertClear(drop);
 assert.equal(drop.placements.get('character').y,25,'Dropped element MUST stay where released');
 assert.equal(drop.placements.get('scene').y,110,'Overlapping scene must shift below dropped element');
 assert.equal(drop.placements.get('intro').y,220,'Non-conflicting peers stay in place');
 assert.equal(drop.placements.get('extra').y,320);
 assert.deepEqual(drop.displaced,['scene']);
}
{
 // Cascading displacement: drop last element on the first, push the first,
 // the second, and the third, preserving the dropped element's destination.
 const originals=[block('a',5,20),block('b',5,115),block('c',5,210),block('moving',5,305)];
 const committed=L.makeRoom(originals,'moving',{x:5,y:25,w:90,h:75},610);
 assertClear(committed);
 assert.equal(committed.placements.get('moving').y,25);
 assert.equal(committed.placements.get('a').y,110);
 assert.equal(committed.placements.get('b').y,195);
 assert.equal(committed.placements.get('c').y,280);
 assert.deepEqual(committed.displaced,['a','b','c']);
}
{
 // A side-by-side text/image column stays untouched even when its vertical
 // coordinate crosses the selected element.
 const originals=[block('left',5,20,38,85),block('right',54,20,38,85),block('footer',5,130,90,75)];
 const committed=L.makeRoom(originals,'footer',{x:5,y:21,w:38,h:75},610);
 assertClear(committed);
 assert.deepEqual(committed.placements.get('right'),originals[1].placement);
 assert.equal(committed.placements.get('left').y,106);
 assert.equal(committed.placements.get('footer').y,21);
}
{
 const originals=[block('a',5,2750,90,75),block('m',5,2840,90,75)];
 const fail=L.makeRoom(originals,'m',{x:5,y:2740,w:90,h:180},3000);
 assert(!fail.ok,'Exceeding canvas max must fail instead of silently overlapping');
}
{
 // A series of repeated drops should never introduce accidental overlaps,
 // even if the selected layer crosses several rows.
 let items=Array.from({length:22},(_,i)=>block('item'+i,5,i*90+20,90,70));
 for(let i=items.length-1;i>=14;i--){
   const p=L.makeRoom(items,'item'+i,{x:5,y:20+(i-14)*3,w:90,h:70},2300);
   assertClear(p);items=items.map(b=>({...b,placement:p.placements.get(b.id)}));
 }
}
console.log('PASS: drop-target stays put; displaced layers cascade only on release; no collateral movement; adjacent columns preserve positions; canvas overflow fails safely.');
