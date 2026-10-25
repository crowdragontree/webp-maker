'use strict';
const assert=require('node:assert/strict');
const L=require('../layout');
const block=(id,x,y,w=90,h=70)=>({id,placement:{x,y,w,h}});
const allClear=answer=>{
 assert(answer.ok,answer.reason);
 const all=[...answer.placements.entries()];
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const [a,A]=all[i],[b,B]=all[j];
  assert(!L.overlap(A,B,0,0),`${a} and ${b} overlap: ${JSON.stringify(A)} ${JSON.stringify(B)}`);
 }
};
// Main regression: drag SCENE downward past CHARACTER and DIVIDER.
// The crossed elements must move UP and fill its original space.
{
 const original=[block('scene',5,20,90,72),block('character',5,105,90,65),block('divider',5,183,90,55),block('intro',5,251,90,205),block('extra',5,470,90,50)];
 const preview=L.arrange(original,'scene',{...original[0].placement,y:190},610,{snap:false,collision:'free'});
 assert(preview.ok);
 for(const p of original.slice(1))assert.deepEqual(preview.placements.get(p.id),p.placement,'Peers MUST NOT move during drag');
 const release=L.reorderDrop(original,'scene',{...original[0].placement,y:190},610);
 allClear(release);
 assert.equal(release.placements.get('character').y,20,'CHARACTER must move UP into Scene slot');
 assert.equal(release.placements.get('divider').y,98,'DIVIDER must move UP into Character slot');
 assert.equal(release.placements.get('scene').y,166,'Scene must finish AFTER divider, not cover it');
 assert.deepEqual(release.placements.get('intro'),original[3].placement);
 assert.deepEqual(release.placements.get('extra'),original[4].placement);
}
// Move back upward: reversed direction, every intervening layer moves DOWN.
{
 const original=[block('scene',5,20,90,72),block('character',5,105,90,65),block('divider',5,183,90,55),block('intro',5,251,90,205),block('extra',5,470,90,50)];
 const release=L.reorderDrop(original,'intro',{...original[3].placement,y:25},610);
 allClear(release);
 assert.equal(release.placements.get('intro').y,20);
 for(const p of original.slice(0,3))assert(release.placements.get(p.id).y>p.placement.y,`${p.id} should move DOWN`);
 assert.deepEqual(release.placements.get('extra'),original[4].placement);
}
// Repeated moves must not make everything drift down over time.
{
 let current=[block('a',5,20),block('b',5,100),block('c',5,180),block('d',5,260)];
 for(let cycle=0;cycle<10;cycle++){
  let answer=L.reorderDrop(current,'a',{...current[0].placement,y:260},610);
  allClear(answer);
  current=current.map(p=>({...p,placement:answer.placements.get(p.id)}));
  assert.equal(current.find(p=>p.id==='b').placement.y,20);
  assert.equal(current.find(p=>p.id==='c').placement.y,100);
  assert.equal(current.find(p=>p.id==='d').placement.y,180);
  answer=L.reorderDrop(current,'a',{...current[0].placement,y:20},610);
  allClear(answer);
  current=current.map(p=>({...p,placement:answer.placements.get(p.id)}));
  assert.deepEqual(current.map(p=>p.placement.y),[20,100,180,260]);
 }
}
// Independent columns stay in place, including a right column at same Y.
{
 const original=[block('leftTop',5,20,40,75),block('rightTop',55,20,40,75),block('leftBottom',5,110,40,75),block('rightBottom',55,110,40,75),block('footer',5,210,40,75)];
 const answer=L.reorderDrop(original,'leftTop',{...original[0].placement,y:110},610);
 allClear(answer);
 assert.equal(answer.placements.get('leftBottom').y,20);
 assert.equal(answer.placements.get('leftTop').y,110);
 assert.deepEqual(answer.placements.get('rightTop'),original[1].placement);
 assert.deepEqual(answer.placements.get('rightBottom'),original[3].placement);
 assert.deepEqual(answer.placements.get('footer'),original[4].placement);
}
// A wide block crossing a side-by-side ROW moves both peers up together.
{
 const original=[block('banner',5,20,90,75),block('left',5,110,40,75),block('right',55,110,40,75),block('footer',5,200,90,75)];
 const answer=L.reorderDrop(original,'banner',{...original[0].placement,y:110},610);
 allClear(answer);
 assert.equal(answer.placements.get('left').y,20);
 assert.equal(answer.placements.get('right').y,20);
 assert.equal(answer.placements.get('banner').y,110);
 assert.deepEqual(answer.placements.get('footer'),original[3].placement);
}
// An unobstructed free move keeps exact pixel coordinates.
{
 const original=[block('a',5,20,90,75),block('b',5,200,90,75)];
 const answer=L.reorderDrop(original,'a',{...original[0].placement,y:108},610);
 allClear(answer);
 assert.equal(answer.placements.get('a').y,108);
 assert.equal(answer.placements.get('b').y,200);
}
console.log('PASS: downward drag fills old slots UP, upward drag fills slots DOWN, repeated drags avoid drift, independent columns, side-by-side rows, and free gaps.');
