'use strict';
// Local persistence for the single-window Introduction Editor tab.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const Core=require('./core');
const MAX_DOC_BYTES=350000;
const ALLOWED=new Set(['bootstrap','draft','templates','template-save','template-delete','template-export','template-import','copy','save-return','close']);
function create({app,clipboard,dialog,onClose}){
  const folder=()=>path.join(app.getPath('userData'),'introduction-designer');
  const names=()=>({templates:path.join(folder(),'templates.json'),draft:path.join(folder(),'working-draft.json')});
  function get(file,fallback){try{const b=fs.readFileSync(file);if(b.length>MAX_DOC_BYTES*5)return fallback;return JSON.parse(b.toString('utf8'));}catch{return fallback;}}
  function write(file,value){
    const text=JSON.stringify(value,null,2);if(Buffer.byteLength(text)>MAX_DOC_BYTES*5)throw Error('Template storage limit reached.');
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const tmp=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
    fs.writeFileSync(tmp,text,{mode:0o600,encoding:'utf8'});fs.renameSync(tmp,file);
  }
  function ensureDoc(doc){
    if(!doc||typeof doc!=='object'||Array.isArray(doc))throw Error('Invalid design document.');
    if(Buffer.byteLength(JSON.stringify(doc),'utf8')>MAX_DOC_BYTES)throw Error('Design exceeds 350 KB.');
    return doc;
  }
  function list(){const data=get(names().templates,[]);return Array.isArray(data)?data.filter(v=>v&&v.id&&v.name&&v.design).slice(0,100):[];}
  function templateName(name){const clean=String(name||'').trim().slice(0,90);if(!clean)throw Error('Enter a template name.');return clean;}
  async function handle(action,args=[]){
    if(!ALLOWED.has(action)||!Array.isArray(args))throw Error('Introduction Editor action not allowed.');
    switch(action){
      case 'bootstrap':return {embedded:false,seed:null,draft:get(names().draft,null),templates:list(),appVersion:app.getVersion()};
      case 'draft':ensureDoc(args[0]);write(names().draft,args[0]);return true;
      case 'templates':return list();
      case 'template-save':{
        const [name,doc,id]=args;ensureDoc(doc);
        const saved=list(),clean=templateName(name);
        const key=typeof id==='string'&&saved.some(t=>t.id===id)?id:randomUUID();
        const record={id:key,name:clean,design:Core.forTemplate(doc),savedAt:new Date().toISOString()};
        const index=saved.findIndex(t=>t.id===key);
        if(index>=0)saved[index]=record;else saved.push(record);
        if(saved.length>100)throw Error('Maximum 100 saved templates. Export or delete a template.');
        write(names().templates,saved);return record;
      }
      case 'template-delete':{
        const saved=list().filter(t=>t.id!==args[0]);write(names().templates,saved);return saved;
      }
      case 'template-export':{
        const record=list().find(t=>t.id===args[0]);if(!record)throw Error('Choose a saved template.');
        const selection=await dialog.showSaveDialog({title:'Export Introduction template',defaultPath:record.name.replace(/[^a-z0-9._-]/gi,'_')+'.json',filters:[{name:'Introduction template',extensions:['json']}]});
        if(selection.canceled||!selection.filePath)return false;
        const data=JSON.stringify({type:'juicychat-introduction-template',version:1,...record},null,2);
        fs.writeFileSync(selection.filePath,data,'utf8');return true;
      }
      case 'template-import':{
        const selection=await dialog.showOpenDialog({title:'Import Introduction template',properties:['openFile'],filters:[{name:'JSON templates',extensions:['json']}]});
        if(selection.canceled||!selection.filePaths?.length)return null;
        const b=fs.readFileSync(selection.filePaths[0]);if(b.length>MAX_DOC_BYTES)throw Error('Template exceeds 350 KB.');
        const record=JSON.parse(b.toString('utf8'));
        if(record.type!=='juicychat-introduction-template'||!record.design)throw Error('That file is not an Introduction template.');
        ensureDoc(record.design);const saved=list();if(saved.length>=100)throw Error('Template library is full.');
        const imported={id:randomUUID(),name:templateName(record.name||'Imported template'),design:Core.forTemplate(record.design),savedAt:new Date().toISOString()};
        saved.push(imported);write(names().templates,saved);return imported;
      }
      case 'copy':{
        const html=String(args[0]||'');const result=Core.verifyOutput(html);
        if(!result.valid)throw Error(result.issues.join(' '));
        clipboard.writeText(html);return result.length;
      }
      case 'save-return':{
        // the finished design goes back to the Bot Builder: checked again here, and the template version (the same HTML with {{intro}}, {{name}} and {{scene}} where the bot's own words go) is made for it
        const payload=args[0]||{},doc=ensureDoc(payload.design),html=String(payload.html||'');
        const result=Core.verifyOutput(html);if(!result.valid)throw Error(result.issues.join(' '));
        if(doc.mode!=='source'&&Core.compile(doc,{formatted:true})!==html)throw Error('Design changed during save. Please try again.');
        write(names().draft,doc);
        let templateHtml='';
        try{
          if(doc.mode==='source')templateHtml=String(doc.sourceHtml||'').replace(/\{\{\s*extra\s*\}\}/gi,'');
          else{
            const tdoc=JSON.parse(JSON.stringify(doc));
            tdoc.fields={...(doc.fields||{}),intro:'{{intro}}',name:'{{name}}',scene:'{{scene}}',extra:''};
            templateHtml=Core.compile(tdoc,{formatted:true});
          }
        }catch{templateHtml='';}
        return {html,design:doc,templateHtml};
      }
      case 'close':if(typeof onClose==='function')onClose();return true;
      default:throw Error('Unsupported action.');
    }
  }
  return {handle};
}
module.exports={create,ALLOWED};
