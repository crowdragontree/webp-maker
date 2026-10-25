'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Core=require('../introduction-designer/core');
const {create,ALLOWED}=require('../introduction-designer/inline-host');
(async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'creator-tools-intro-test-'));
  try{
    let copied='',closed=0;
    const service=create({app:{getPath:()=>folder,getVersion:()=> '1.1.6'},clipboard:{writeText:s=>copied=s},dialog:{},onClose:()=>closed++});
    assert(ALLOWED.has('copy')&&!ALLOWED.has('arbitrary:ipc'));
    const boot=await service.handle('bootstrap');assert(!boot.embedded&&boot.templates.length===0);
    const doc=Core.initial();const html=Core.compile(doc,{formatted:true});
    assert(html.includes('\n')&&!html.includes('Midnight at the Shrine'));
    const length=await service.handle('copy',[html]);assert.equal(length,html.length);assert.equal(copied,html);
    await assert.rejects(()=>service.handle('copy',['a'.repeat(15001)]),/15,000/);
    await service.handle('draft',[doc]);assert((await service.handle('bootstrap')).draft);
    const saved=await service.handle('template-save',['Main template',doc]);
    assert.equal((await service.handle('templates')).length,1);
    assert.equal((await service.handle('templates'))[0].design.fields.intro,'');
    assert(saved.id);
    await service.handle('template-delete',[saved.id]);assert.equal((await service.handle('templates')).length,0);
    await assert.rejects(()=>service.handle('shell:execute',[]),/not allowed/);
    await service.handle('close');assert.equal(closed,1);
    console.log('Juicy Chat Creator Tools Introduction Editor IPC, template, clipboard, draft, and 15,000 character checks passed.');
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
