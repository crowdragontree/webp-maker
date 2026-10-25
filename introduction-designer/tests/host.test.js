'use strict';
const assert=require('node:assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
const {register}=require('../host');const Core=require('../core');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'introDesigner-host-'));
(async()=>{
 let handlers={},output='',messages=[],windowInstance=null;
 const ipcMain={handle:(name,handler)=>{assert(!handlers[name]);handlers[name]=handler;}};
 const sender={send:(name,payload)=>messages.push({name,payload}),setWindowOpenHandler:()=>{}};
 class BrowserWindow{
   constructor(opts){this.options=opts;this.webContents={send(){},setWindowOpenHandler(){}};this.events={};windowInstance=this;}
   loadFile(file){assert(fs.existsSync(file));}
   on(event,fn){this.events[event]=fn;}
   once(event,fn){this.events[event]=fn;}
   isDestroyed(){return !!this.destroyed;}
   show(){}
   focus(){}
   close(){this.destroyed=true;this.events.closed?.();}
 }
 const studio={webContents:sender,isDestroyed:()=>false,show(){},focus(){}};
 const parentWindow=()=>studio;
 const app={getPath:()=>home,getVersion:()=>"1.2.0"};
 const service=register({app,BrowserWindow,ipcMain,clipboard:{writeText:s=>output=s},dialog:{},parentWindow,standalone:false});
 assert(handlers['intro-designer:open']);
 const payload={fields:{scene:'Scene',name:'Name',intro:'Story',extra:'Extra'}};
 assert(await handlers['intro-designer:open']({sender},payload));
 const editorSender=windowInstance.webContents;
 const call=(name,...args)=>handlers['intro-designer:'+name]({sender:editorSender},...args);
 assert.throws(()=>handlers['intro-designer:copy']({sender},'Bad'),/only available inside Introduction Designer/);
 const boot=await call('bootstrap');assert(boot.embedded);assert.deepEqual(boot.seed,payload);
 let template=Core.initial();template.fields.name='Template should have empty slots';
 const saved=await call('template-save','Glass Garden',template);
 assert(saved.id&&saved.name==='Glass Garden');
 assert.equal((await call('templates'))[0].design.fields.name,'');
 assert.equal((await call('bootstrap')).templates.length,1);
 const design=Core.initial(),html=Core.compile(design,{formatted:true});
 const copied=await call('copy',html);assert.equal(copied,html.length);assert.equal(output,html);
 assert.throws(()=>handlers['intro-designer:copy']({sender:editorSender},'x'.repeat(15001)),/15,000/);
 await call('draft',design);assert((await call('bootstrap')).draft.blocks.length);
 assert(await call('save-return',{html,design}));
 assert.equal(messages.length,1);assert.equal(messages[0].name,'intro-designer:returned');
 assert.equal(messages[0].payload.html,html);
 assert(windowInstance.isDestroyed(),'Save and Return should close designer');
 console.log('Introduction Designer host registration and access checks passed.');
})().finally(()=>fs.rmSync(home,{recursive:true,force:true}));
