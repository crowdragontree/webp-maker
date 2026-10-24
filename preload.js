'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('webpMaker',{
  webpBegin:options=>ipcRenderer.invoke('webpmaker:begin',options),
  webpFrame:png=>ipcRenderer.invoke('webpmaker:frame',png),
  webpFinish:()=>ipcRenderer.invoke('webpmaker:finish'),
  webpCancel:()=>ipcRenderer.invoke('webpmaker:cancel'),
  webpPreview:()=>ipcRenderer.invoke('webpmaker:preview'),
  webpSave:name=>ipcRenderer.invoke('webpmaker:save',name),
  onWebpProgress:cb=>ipcRenderer.on('webpmaker:progress',(_,x)=>cb(x)),
  updaterState:()=>ipcRenderer.invoke('updates:state'),
  checkForUpdates:()=>ipcRenderer.invoke('updates:check'),
  installUpdate:()=>ipcRenderer.invoke('updates:install'),
  onUpdaterStatus:cb=>ipcRenderer.on('updates:status',(_,state)=>cb(state))
});
