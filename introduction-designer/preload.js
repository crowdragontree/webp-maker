'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('introHost',{
  bootstrap:()=>ipcRenderer.invoke('intro-designer:bootstrap'),
  saveDraft:doc=>ipcRenderer.invoke('intro-designer:draft',doc),
  templates:()=>ipcRenderer.invoke('intro-designer:templates'),
  saveTemplate:(name,doc,id)=>ipcRenderer.invoke('intro-designer:template-save',name,doc,id),
  deleteTemplate:id=>ipcRenderer.invoke('intro-designer:template-delete',id),
  exportTemplate:id=>ipcRenderer.invoke('intro-designer:template-export',id),
  importTemplate:()=>ipcRenderer.invoke('intro-designer:template-import'),
  copy:html=>ipcRenderer.invoke('intro-designer:copy',html),
  saveAndReturn:(html,design)=>ipcRenderer.invoke('intro-designer:save-return',{html,design}),
  close:()=>ipcRenderer.invoke('intro-designer:close'),
  onContext:cb=>ipcRenderer.on('intro-designer:new-context',(_event,payload)=>cb(payload))
});
