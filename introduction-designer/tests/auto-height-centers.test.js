'use strict';
const assert=require('node:assert/strict');
const C=require('../core'), L=require('../layout');
const doc=C.initial();
assert.equal(doc.layout.autoHeight,true,'new designs must have automatic height enabled');
assert.equal(C.canvasHeight(doc),592,'canvas must fit last element + 35px, not a fixed 610px');
const priorY=doc.blocks[0].placement.y;
doc.blocks[0].placement.y=1230;
assert.equal(C.canvasHeight(doc),1337,'moving down must extend the background');
assert(C.compile(doc).includes('min-height: 1337px'));
doc.blocks[0].placement.y=priorY;
assert.equal(C.canvasHeight(doc),592,'moving back up must shrink the background to content height');
assert(C.compile(doc).includes('min-height: 592px'));
// Old drafts with a cached expanded height should not inherit that height.
doc.layout.height=2700;delete doc.layout.autoHeight;
assert.equal(C.canvasHeight(doc),592,'legacy cached height must not lock new Auto mode');
// Manual height remains a deliberate opt-out.
doc.layout.autoHeight=false;doc.layout.height=920;
assert.equal(C.canvasHeight(doc),920);
doc.layout.autoHeight=true;
assert.equal(C.canvasHeight(doc),592);
// Adding a layer below the canvas extends it, removing that layer shrinks it.
const added={id:'last',type:'text',placement:{x:5,y:1200,w:90,h:65}};
doc.blocks.push(added);assert.equal(C.canvasHeight(doc),1300);
doc.blocks.pop();assert.equal(C.canvasHeight(doc),592);
doc.blocks=[];assert.equal(C.canvasHeight(doc),240,'empty canvas shrinks to the minimum 240px');
// Align both horizontal and vertical centers and the right/bottom edges.
const x=L.snap({x:31,y:140,w:38,h:80},[],{canvasHeight:610,thresholdX:2,thresholdY:5});
assert.equal(x.guides.x.position,50);
const y=L.snap({x:5,y:264,w:90,h:80},[],{canvasHeight:610,thresholdX:2,thresholdY:5});
assert.equal(y.guides.y.position,305,'canvas center guide should snap at 305 px');
const bottom=L.snap({x:5,y:531,w:90,h:80},[],{canvasHeight:610,thresholdX:2,thresholdY:5});
assert.equal(bottom.guides.y.position,610,'bottom guide should exist too');
console.log('PASS: automatic canvas grow/shrink, legacy cached height, manual override, added/removed blocks, center and bottom guides.');
