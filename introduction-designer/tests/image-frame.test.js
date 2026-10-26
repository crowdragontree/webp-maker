'use strict';
const assert=require('node:assert/strict'),C=require('../core');
for(const cropped of [false,true]){
  const d=C.initial();d.blocks=[{
    id:'frame-test',type:'image',url:'https://images.example.test/picture.png',
    frameOn:true,framePadding:12,frameBorderWidth:3,frameBorderStyle:'solid',
    frameBorderColor:'#a1b2c3',frameRadius:22,imageRadius:10,
    frameBackgroundOn:true,frameBackgroundColor:'#112233',frameShadow:5,
    crop:{enabled:cropped,zoom:160,offsetX:5,offsetY:-4},
    placement:{x:10,y:99,w:72,h:200}
  }];
  const exportHtml=C.compile(d,{formatted:true});
  assert(C.verifyOutput(exportHtml).valid);
  for(const text of ['padding: 12px','3px solid #a1b2c3','border-radius: 22px',
    'border-radius: 10px','background: #112233'])assert(exportHtml.includes(text),text);
  assert(!exportHtml.includes('data-intro-image-frame'));
  assert(exportHtml.includes('src="https://images.example.test/picture.png"'));
  if(cropped)assert(exportHtml.includes('width: 160%'));
  const preview=C.compile(d,{preview:true});
  assert(preview.includes('data-intro-image-frame="true"'));
  assert((preview.match(/data-block-id="frame-test"/g)||[]).length===1);
  const original=JSON.parse(JSON.stringify(d.blocks[0].placement));
  d.blocks[0].framePadding=20;
  assert.deepEqual(d.blocks[0].placement,original,'Padding changes must not mutate coordinates');
  assert(C.compile(d).includes('padding: 20px'));
}
const old=C.initial();old.blocks=[{id:'old',type:'image',url:'https://images.example.test/old.png',
  radius:16,placement:{x:4,y:15,w:90,h:130}}];
assert(C.verifyOutput(C.compile(old)).valid);
assert(C.compile(old).includes('padding: 0px'),'Existing images should retain 0 frame padding');
console.log('Image frame regression passed: spacing, borders, crop, export, existing images.');
