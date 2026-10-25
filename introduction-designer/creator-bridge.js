'use strict';
// The Introduction Editor runs inside a local iframe. A deliberately narrow
// postMessage bridge gives it template/clipboard actions without Node access.
// No remote webpages or arbitrary IPC channel names are accepted.
(() => {
  const pending=new Map();
  let nextId=1;
  function invoke(action,...args){
    if(window.parent===window)return Promise.reject(new Error('Open Introduction Editor from Juicy Chat Creator Tools.'));
    return new Promise((resolve,reject)=>{
      const id=nextId++;
      const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Introduction Editor request timed out.'));},30000);
      pending.set(id,{resolve,reject,timeout});
      window.parent.postMessage({type:'jcct:intro:request',id,action,args},'*');
    });
  }
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||event.data?.type!=='jcct:intro:response')return;
    const id=event.data.id;if(!Number.isSafeInteger(id))return;
    const record=pending.get(id);if(!record)return;
    pending.delete(id);clearTimeout(record.timeout);
    if(event.data.ok)record.resolve(event.data.value);
    else record.reject(new Error(String(event.data.error||'The action was unsuccessful.')));
  });
  window.introHost={
    bootstrap:()=>invoke('bootstrap'),saveDraft:doc=>invoke('draft',doc),
    templates:()=>invoke('templates'),saveTemplate:(name,doc,id)=>invoke('template-save',name,doc,id),
    deleteTemplate:id=>invoke('template-delete',id),exportTemplate:id=>invoke('template-export',id),
    importTemplate:()=>invoke('template-import'),copy:html=>invoke('copy',html),
    saveAndReturn:()=>Promise.reject(new Error('Use Copy Introduction in this standalone app. Save and Return is available inside Juicy Blueprint Studio.')),
    close:()=>invoke('close'),onContext:()=>{}
  };
})();
