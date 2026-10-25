'use strict';
const assert=require('node:assert/strict');
const C=require('../core');
const doc=C.initial();
let html=C.compile(doc);
assert(html.includes('<h3')&&html.includes('Scene Name')&&html.includes('Character Name')&&html.includes('Introduction'));
assert(html.includes('style=')&&!html.includes('<script')&&!html.includes('<style'));
assert(!html.includes('data-block-id'));
assert(C.compile(doc,{preview:true}).includes('data-block-id="b1"'));
assert(C.verifyOutput(html).valid);
assert(C.verifyOutput('x'.repeat(15000)).valid);
assert(!C.verifyOutput('x'.repeat(15001)).valid);
assert.equal(C.verifyOutput('x'.repeat(15001)).remaining,-1);
doc.fields.intro='<script>alert(1)</script> & {{bad}}';
html=C.compile(doc);
assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp;'));
assert(!html.includes('<script>'));
doc.blocks.push({id:'image1',type:'image',url:'javascript:alert(1)'});
html=C.compile(doc);
assert(!html.includes('javascript:'));
doc.blocks[doc.blocks.length-1].url='https://images.example.org/safe.png';
html=C.compile(doc);
assert(html.includes('src="https://images.example.org/safe.png"'));
assert(!html.includes('<h1')&&!html.includes('<h2'));
assert(C.safeHttps('http://example.com/a.png')==='');
assert(C.safeHttps('https://example.com/a.png')==='https://example.com/a.png');
assert(C.safeCss('background','url(https://danger.org/a)')==='');
assert(C.safeCss('color','red;position:fixed')==='');
doc.fields.intro='My story';
const template=C.forTemplate(doc);
for(const key of C.SLOTS)assert.strictEqual(template.fields[key],'');
assert.equal(template.blocks.length,doc.blocks.length);
for(const type of C.TYPES){
 const d=C.initial();d.blocks=[{type,id:'t',text:'Test',url:'https://example.com/img.png',left:'Alpha',right:'Beta'}];
 const html=C.compile(d);assert(C.verifyOutput(html).valid,`invalid type ${type}`);
}
// Direct placement exports use supported static CSS Grid, not executable
// scripts or absolute-positioned children, and preview grips never leak out.
{
  const design=C.initial();
  assert.equal(design.layout.mode,'freeform');
  const moved=design.blocks[0];
  moved.placement={x:34,y:120,w:56,h:75};
  const compiled=C.compile(design,{formatted:true});
  assert(compiled.includes('display: grid')&&compiled.includes('grid-template-columns: repeat(100'));
  assert(compiled.includes('grid-column: 35 / span 56'));
  assert(compiled.includes('grid-row: 121 / span 75'));
  assert(!compiled.includes('data-block-id')&&!compiled.includes('id-resize-grip'));
  assert(!compiled.includes('<script')&&!compiled.includes('position: absolute'));
  assert(compiled.includes('\n  '),'Copied HTML should have indentation');
  assert(C.verifyOutput(compiled).valid);
  const oversized=C.initial();oversized.fields.intro='X'.repeat(16000);
  assert(C.verifyOutput(C.compile(oversized,{formatted:true})).valid===false);
  const saved=C.forTemplate(design);
  assert.deepEqual(saved.blocks[0].placement,moved.placement);
  assert.equal(saved.layout.mode,'freeform');
  const legacy=C.initial();delete legacy.layout;
  assert(!C.compile(legacy).includes('grid-auto-rows'));
  assert.deepEqual(C.placementOf({placement:{x:95,y:700,w:90,h:80}},610),{x:95,y:530,w:5,h:80});
  // Nested borders remain independent wrappers around the positioned canvas.
  design.theme.frames=[C.newFrame('a'),C.newFrame('b')];
  const nested=C.compile(design,{formatted:true});
  assert(nested.includes('grid-auto-rows: 1px'));
  assert(C.verifyOutput(nested).valid);
}
console.log('Introduction Designer core tests passed: HTML formatting, free-position CSS Grid, bounds, saved layouts, borders, 15k, escaping, image safety and block types.');
{
  const d=C.initial();
  d.blocks=[{id:'custom-divider',type:'divider',text:'✦',dividerUrl:'https://images.example.test/divider.png',dividerImageWidth:80}];
  const html=C.compile(d);
  assert.match(html,/src="https:\/\/images\.example\.test\/divider\.png"/);
  assert.match(html,/height: auto/);
  assert.doesNotMatch(html,/aspect-ratio: 3 \/ 4/);
  const imp=C.initial();imp.layout.mode='flow';
  imp.importedCardStyle='border: 1px solid rgb(113, 56, 79); box-shadow: rgba(0, 0, 0, 0.9) 0px 0px 22px inset';
  imp.theme.frames=[{importedStyle:'padding: 2px; background: rgb(217, 111, 174); border-radius: 10px'}];
  imp.blocks=[{id:'imported',type:'heading',text:'Imported Test',importedTag:'div',importedStyle:'text-shadow: 0 0 10px rgba(242, 155, 203, 0.7); color: rgb(242, 155, 203)'}];
  const result=C.compile(imp,{formatted:true});
  assert.match(result,/border: 1px solid rgb\(113, 56, 79\)/);
  assert.match(result,/border-radius: 10px/);
  assert.match(result,/box-shadow: rgba\(0, 0, 0, 0\.9\)/);
  assert.match(result,/text-shadow: 0 0 10px/);
}
console.log('Imported nested border CSS and image-backed dividers preserved in output.');
// Image cropping must survive static JuicyChat HTML export without scripts,
// alter only the selected crop data, and retain the original image URL.
{
  const d=C.initial();
  d.blocks=[
    {id:'crop-a',type:'image',url:'https://images.example.org/art.png',alt:'Art',crop:{enabled:true,zoom:185,focusX:30,focusY:65,offsetX:10,offsetY:-12},placement:{x:5,y:10,w:90,h:200}},
    {id:'crop-b',type:'divider',dividerUrl:'https://images.example.org/divider.png',dividerImageMode:'replace',crop:{enabled:true,zoom:125,focusX:50,focusY:50,offsetX:0,offsetY:0},placement:{x:5,y:250,w:90,h:90}}
  ];
  const html=C.compile(d,{formatted:true});
  assert.match(html,/src="https:\/\/images\.example\.org\/art\.png"/);
  assert.match(html,/src="https:\/\/images\.example\.org\/divider\.png"/);
  assert.match(html,/position: absolute/);
  assert.match(html,/overflow: hidden/);
  assert.match(html,/object-fit: cover/);
  assert.match(html,/object-position: 30% 65%/);
  assert.match(html,/width: 185%/);
  assert(!html.includes('data-intro-crop-image'));
  assert(C.verifyOutput(html).valid);
  const preview=C.compile(d,{preview:true});
  assert(preview.includes('data-intro-crop-image'));
  const clipped=C.imageCrop(d.blocks[0]);
  assert.equal(clipped.zoom,185);
  assert.equal(clipped.offsetX,10);
  const copy=JSON.parse(JSON.stringify(d));
  assert.deepEqual(copy.blocks[0].crop,d.blocks[0].crop);
  d.blocks[0].crop.enabled=false;
  assert(!C.compile(d).includes('object-position: 30% 65%'));
}
console.log('Image and divider crop regression passed: preserved URLs, focus, clipping, preview/export, and reset.');

assert.equal(C.safeCss('position','fixed'),'');
assert.equal(C.safeCss('position','absolute'),'absolute');
