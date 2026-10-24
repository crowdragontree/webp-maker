'use strict';
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('path');
const fs=require('fs');
const os=require('os');
const E2E=process.argv.includes('--webp-e2e') && !!process.env.WEBP_MAKER_E2E_REPORT;
const {WebpMaker}=require('./lib/webpMaker');
const {PortableUpdater}=require('./lib/portableUpdater');
let win,maker,updater,quitting=false;
app.setName('WebP Maker');
const getWindow=()=>win&&!win.isDestroyed()?win:null;
function create(){
  win=new BrowserWindow({width:1380,height:820,minWidth:980,minHeight:600,backgroundColor:'#0e0b12',show:false,
    icon:path.join(__dirname,'assets','icon.png'),webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:!E2E,preload:path.join(__dirname,'preload.js')}});
  win.loadFile(path.join(__dirname,'renderer','index.html'));
  win.once('ready-to-show',()=>{if(!E2E)win.show();});
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
  const e2eTools=E2E?fs.mkdtempSync(path.join(os.tmpdir(),'webpmaker-e2e-tools-')):null;
  maker=new WebpMaker({appRoot:__dirname,userData:app.getPath('userData'),
    toolsDir:e2eTools||path.join(app.getPath('userData'),'webp-maker-tools'),
    forcePrivateImageMagick:E2E,
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
  // Portable ZIP apps check published GitHub releases automatically, without sending videos.
  updater=new PortableUpdater({version:app.getVersion(),platform:process.platform,
    appRoot:__dirname,installDir:path.dirname(app.getPath('exe')),
    userData:app.getPath('userData'),packaged:app.isPackaged,
    isBusy:()=>!!maker?.job&&!maker.job.cancelled,
    onStatus:state=>getWindow()?.webContents.send('updates:status',state)});
  ipcMain.handle('updates:state',()=>updater.state);
  ipcMain.handle('updates:check',()=>updater.check());
  ipcMain.handle('updates:install',async()=>{
    if(!updater.available)throw new Error('Check for updates first.');
    if(maker?.job&&!maker.job.cancelled)throw new Error('Finish or cancel the current WebP conversion before updating.');
    const decision=await dialog.showMessageBox(getWindow(),{type:'question',
      title:'Install WebP Maker update?',message:`Update to WebP Maker v${updater.available.version}?`,
      detail:'The app will download a verified copy from your GitHub Releases, close, replace its portable files, and restart. No videos are uploaded.',
      buttons:['Update and restart','Not now'],defaultId:0,cancelId:1});
    if(decision.response!==0)return {cancelled:true};
    await updater.prepare();
    await updater.launchInstaller();
    quitting=true;app.quit();
    return {restarting:true};
  });
  create();
  if(!E2E){
    setTimeout(()=>updater.cleanupSuccessfulUpdate().catch(console.error),1500).unref();
    setTimeout(()=>updater.check({silent:true}).catch(console.error),3500).unref();
    setInterval(()=>updater.check({silent:true}).catch(console.error),6*60*60*1000).unref();
  }
  if(E2E){
    // Runs against the ACTUAL packaged Windows or Linux application, using Electron's
    // MP4 decoder, the existing UI/IPC, and freshly downloaded ImageMagick.
    require('./scripts/e2e-desktop').run({win,maker,appRoot:__dirname,toolsDir:e2eTools,
      reportPath:process.env.WEBP_MAKER_E2E_REPORT}).then(()=>{
      quitting=true;app.exit(0);
    }).catch(error=>{
      console.error(`WebP Maker ${process.platform} E2E FAILED:`,error);
      try{fs.writeFileSync(process.env.WEBP_MAKER_E2E_REPORT,JSON.stringify({ok:false,error:String(error?.stack||error)},null,2));}catch{}
      quitting=true;app.exit(1);
    });
  }
});
app.on('before-quit',()=>{quitting=true;try{maker?.dispose();}catch{}});
app.on('window-all-closed',()=>app.quit());
