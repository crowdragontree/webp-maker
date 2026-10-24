'use strict';
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('path');
const {WebpMaker}=require('./lib/webpMaker');
let win,maker,quitting=false;
app.setName('WebP Maker');
const getWindow=()=>win&&!win.isDestroyed()?win:null;
function create(){
  win=new BrowserWindow({width:1380,height:820,minWidth:980,minHeight:600,backgroundColor:'#0e0b12',show:false,
    icon:path.join(__dirname,'assets','icon.png'),webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:false,preload:path.join(__dirname,'preload.js')}});
  win.loadFile(path.join(__dirname,'renderer','index.html'));
  win.once('ready-to-show',()=>win.show());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.on('close',e=>{
    if(quitting||!maker?.job||maker.job.cancelled)return;
    e.preventDefault();
    dialog.showMessageBox(win,{type:'warning',title:'WebP conversion in progress',message:'Abort conversion and exit?',
      detail:'Closing will discard the current conversion. Your MP4 files are not changed.',
      buttons:['Keep converting','Abort conversion & Exit'],defaultId:0,cancelId:0}).then(r=>{
        if(r.response!==1)return;quitting=true;try{maker.cancel();}catch{}win.close();
      });
  });
}
app.whenReady().then(()=>{
  // No file is transmitted to a server. Portable ImageMagick is obtained only once.
  maker=new WebpMaker({appRoot:__dirname,userData:app.getPath('userData'),
    toolsDir:path.join(app.getPath('userData'),'webp-maker-tools'),
    onProgress:data=>getWindow()?.webContents.send('webpmaker:progress',data)});
  ipcMain.handle('webpmaker:begin',(_,opts)=>maker.begin(opts));
  ipcMain.handle('webpmaker:frame',(_,frame)=>maker.frame(frame));
  ipcMain.handle('webpmaker:finish',()=>maker.finish());
  ipcMain.handle('webpmaker:cancel',()=>maker.cancel());
  ipcMain.handle('webpmaker:preview',()=>maker.preview());
  ipcMain.handle('webpmaker:save',async(_,suggested)=>{
    if(!maker.resultPath())throw new Error('Convert an animation before saving it.');
    const safe=String(suggested||'Animation.webp').replace(/[\\/:*?"<>|]/g,'_').replace(/\.webp$/i,'')+'.webp';
    const r=await dialog.showSaveDialog(getWindow(),{title:'Save animated WebP',defaultPath:safe,filters:[{name:'Animated WebP',extensions:['webp']}]});
    return r.canceled||!r.filePath?{canceled:true}:maker.save(r.filePath);
  });
  create();
});
app.on('before-quit',()=>{quitting=true;try{maker?.dispose();}catch{}});
app.on('window-all-closed',()=>app.quit());
