'use strict';
// Shared standalone / Studio IPC integration. Designer user data is stored in the
// current application's private userData directory, never in the source ZIP.
const fs=require('fs');
const path=require('path');
const {randomUUID}=require('crypto');
const Core=require('./core');
const MAX_DOC_BYTES=350000;
function register({app,BrowserWindow,ipcMain,clipboard,dialog,parentWindow,standalone=false}){
  let editor=null,seed=null;
  const base=()=>path.join(app.getPath('userData'),'introduction-designer');
  const files=()=>({templates:path.join(base(),'templates.json'),draft:path.join(base(),'working-draft.json')});
  function readJSON(file,fallback){try{const b=fs.readFileSync(file);if(b.length>MAX_DOC_BYTES*5)return fallback;return JSON.parse(b.toString('utf8'));}catch{return fallback;}}
  function writeJSON(file,value){const content=JSON.stringify(value,null,2);if(Buffer.byteLength(content)>MAX_DOC_BYTES*5)throw Error('Too much template data.');fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,content,'utf8');fs.renameSync(temp,file);}
  function ensureDocument(doc){if(!doc||typeof doc!=='object'||Array.isArray(doc))throw Error('Invalid design document.');if(Buffer.byteLength(JSON.stringify(doc),'utf8')>MAX_DOC_BYTES)throw Error('Design is too large to save.');return doc;}
  function list(){return readJSON(files().templates,[]).filter(v=>v&&v.id&&v.name&&v.design).slice(0,100);}
  function fromDesigner(event){if(!editor||editor.isDestroyed()||event.sender!==editor.webContents)throw Error('This action is only available inside Introduction Designer.');}
  function sendReturn(result){const parent=typeof parentWindow==='function'?parentWindow():null;if(!parent||parent.isDestroyed())throw Error('The Studio window is no longer available. Copy Introduction instead.');parent.webContents.send('intro-designer:returned',result);parent.show();parent.focus();}
  function launch(payload){
    seed=payload&&typeof payload==='object'?JSON.parse(JSON.stringify(payload)):null;
    if(editor&&!editor.isDestroyed()){editor.show();editor.focus();editor.webContents.send('intro-designer:new-context',seed);return true;}
    editor=new BrowserWindow({width:1640,height:1040,minWidth:960,minHeight:660,show:false,backgroundColor:'#100d17',title:'Introduction Designer',autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    editor.loadFile(path.join(__dirname,'index.html'));
    editor.once('ready-to-show',()=>{if(editor&&!editor.isDestroyed())editor.show();});
    editor.on('closed',()=>{editor=null;seed=null;});
    editor.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    return true;
  }
  ipcMain.handle('intro-designer:open',(event,payload)=>{
    if(standalone)throw Error('Introduction Designer is already open.');
    const parent=parentWindow?.();if(!parent||event.sender!==parent.webContents)throw Error('Only the Bot Builder can open this designer.');
    return launch(payload);
  });
  ipcMain.handle('intro-designer:bootstrap',event=>{fromDesigner(event);return {embedded:!standalone,seed:seed||null,draft:readJSON(files().draft,null),templates:list(),appVersion:app.getVersion()};});
  ipcMain.handle('intro-designer:draft',(event,doc)=>{fromDesigner(event);ensureDocument(doc);writeJSON(files().draft,doc);return true;});
  ipcMain.handle('intro-designer:templates',event=>{fromDesigner(event);return list();});
  ipcMain.handle('intro-designer:template-save',(event,name,doc,id)=>{
    fromDesigner(event);ensureDocument(doc);
    const clean=String(name||'').trim().slice(0,90);if(!clean)throw Error('Enter a template name.');
    const templates=list(),key=typeof id==='string'&&templates.some(t=>t.id===id)?id:randomUUID();
    const record={id:key,name:clean,design:Core.forTemplate(doc),savedAt:new Date().toISOString()};
    const at=templates.findIndex(t=>t.id===key);if(at>=0)templates[at]=record;else templates.push(record);
    if(templates.length>100)throw Error('You have reached the 100-template limit. Export or delete some templates.');
    writeJSON(files().templates,templates);return record;
  });
  ipcMain.handle('intro-designer:template-delete',(event,id)=>{fromDesigner(event);const l=list();const out=l.filter(x=>x.id!==id);writeJSON(files().templates,out);return out;});
  ipcMain.handle('intro-designer:template-export',async(event,id)=>{
    fromDesigner(event);const record=list().find(x=>x.id===id);if(!record)throw Error('Choose a saved template first.');
    const selected=await dialog.showSaveDialog(editor,{title:'Export Introduction template',defaultPath:record.name.replace(/[^a-z0-9._-]/gi,'_')+'.json',filters:[{name:'Introduction Designer template',extensions:['json']}]});
    if(selected.canceled||!selected.filePath)return false;
    fs.writeFileSync(selected.filePath,JSON.stringify({type:'juicychat-introduction-template',version:1,...record},null,2),'utf8');return true;
  });
  ipcMain.handle('intro-designer:template-import',async event=>{
    fromDesigner(event);const selected=await dialog.showOpenDialog(editor,{title:'Import a design template',properties:['openFile'],filters:[{name:'JSON templates',extensions:['json']}]});
    if(selected.canceled||!selected.filePaths?.length)return null;
    const b=fs.readFileSync(selected.filePaths[0]);if(b.length>MAX_DOC_BYTES)throw Error('Template exceeds the 350 KB design limit.');
    const template=JSON.parse(b.toString('utf8'));
    if(template.type!=='juicychat-introduction-template'||!template.design)throw Error('This is not an Introduction Designer template file.');
    ensureDocument(template.design);const name=String(template.name||'Imported template').slice(0,90);
    const templates=list();if(templates.length>=100)throw Error('Template library is full.');
    const newRecord={id:randomUUID(),name,design:Core.forTemplate(template.design),savedAt:new Date().toISOString()};
    templates.push(newRecord);writeJSON(files().templates,templates);return newRecord;
  });
  ipcMain.handle('intro-designer:copy',(event,html)=>{fromDesigner(event);const check=Core.verifyOutput(html);if(!check.valid)throw Error(check.issues.join(' '));clipboard.writeText(html);return check.length;});
  ipcMain.handle('intro-designer:save-return',(event,payload)=>{
    fromDesigner(event);if(standalone)throw Error('Save and Return is only available when opened from Studio.');
    const doc=ensureDocument(payload?.design),html=String(payload?.html||'');
    const check=Core.verifyOutput(html);if(!check.valid)throw Error(check.issues.join(' '));
    if(doc.mode!=='source'&&Core.compile(doc,{formatted:true})!==html)throw Error('Design changed during save. Please try again.');
    writeJSON(files().draft,doc);
    sendReturn({html,design:doc,context:seed?.context||null});if(editor&&!editor.isDestroyed())editor.close();return true;
  });
  ipcMain.handle('intro-designer:close',event=>{fromDesigner(event);editor.close();return true;});
  return {open:launch};
}
module.exports={register};
