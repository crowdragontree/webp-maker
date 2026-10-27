'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('juicyApp',{
  webpBegin:opts=>ipcRenderer.invoke('webpmaker:begin',opts),
  webpFrame:buffer=>ipcRenderer.invoke('webpmaker:frame',buffer),
  webpFinish:()=>ipcRenderer.invoke('webpmaker:finish'),
  webpCancel:()=>ipcRenderer.invoke('webpmaker:cancel'),
  webpPreview:allowOver=>ipcRenderer.invoke('webpmaker:preview',allowOver),
  webpSave:(filename,allowOver)=>ipcRenderer.invoke('webpmaker:save',filename,allowOver),
  webpNotify:status=>ipcRenderer.invoke('webpmaker:notify',status),
  onWebpProgress:fn=>ipcRenderer.on('webpmaker:progress',(_event,x)=>fn(x)),
  onWebpOpen:fn=>ipcRenderer.on('webpmaker:open',fn)
});
contextBridge.exposeInMainWorld('creatorTools',{
  introRequest:(action,args)=>ipcRenderer.invoke('creator-tools:intro',action,args),
  updateState:()=>ipcRenderer.invoke('updates:state'),
  checkUpdates:()=>ipcRenderer.invoke('updates:check'),
  installUpdate:()=>ipcRenderer.invoke('updates:install'),
  onUpdateStatus:fn=>ipcRenderer.on('updates:status',(_event,x)=>fn(x)),
  onSelectTab:fn=>ipcRenderer.on('creator-tools:select-tab',(_event,x)=>fn(x))
});
