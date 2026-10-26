'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {app,BrowserWindow,ipcMain,dialog,clipboard,Notification,shell,nativeImage}=require('electron');
const {WebpMaker}=require('./lib/webpMaker');
const {create:createIntroService}=require('./introduction-designer/inline-host');
const {PortableUpdater}=require('./lib/portableUpdater');
const E2E=process.argv.includes('--creator-tools-e2e');
// The program used to be WebP-Maker(.exe). Copies from v1.0.2-v1.1.0 only accept
// an update that contains that file name, and restart it afterwards. Releases
// therefore also ship a WebP-Maker copy, which immediately hands over to
// JuicyChat Creator Tool; that one then removes the old name (finishRename).
const EXE_NAME=process.platform==='win32'?'JuicyChat Creator Tool.exe':'JuicyChat Creator Tool';
const LEGACY_EXE_NAME=process.platform==='win32'?'WebP-Maker.exe':'WebP-Maker';
const INSTALL_DIR=path.dirname(process.execPath);
if(app.isPackaged&&path.basename(process.execPath)===LEGACY_EXE_NAME&&fs.existsSync(path.join(INSTALL_DIR,EXE_NAME))){
  const next=path.join(INSTALL_DIR,EXE_NAME);
  if(process.platform!=='win32')for(const f of [EXE_NAME,'chrome_crashpad_handler'])try{fs.chmodSync(path.join(INSTALL_DIR,f),0o755);}catch{}
  spawn(next,process.argv.slice(1),{cwd:INSTALL_DIR,detached:true,stdio:'ignore'}).unref();
  process.exit(0);
}
async function finishRename(){
  if(!app.isPackaged||E2E||path.basename(process.execPath)!==EXE_NAME)return;
  const legacy=path.join(INSTALL_DIR,LEGACY_EXE_NAME);
  // Windows: shortcuts and pins that still open WebP-Maker.exe now open the new name.
  if(process.platform==='win32'){
    const roaming=app.getPath('appData');
    for(const dir of [app.getPath('desktop'),path.join(roaming,'Microsoft','Windows','Start Menu','Programs'),
      path.join(roaming,'Microsoft','Internet Explorer','Quick Launch'),
      path.join(roaming,'Microsoft','Internet Explorer','Quick Launch','User Pinned','TaskBar'),
      path.join(roaming,'Microsoft','Internet Explorer','Quick Launch','User Pinned','StartMenu')]){
      let links=[];try{links=fs.readdirSync(dir).filter(n=>/\.lnk$/i.test(n));}catch{continue;}
      for(const name of links){
        const link=path.join(dir,name);
        try{
          const info=shell.readShortcutLink(link);
          if(path.resolve(info.target).toLowerCase()===legacy.toLowerCase())
            shell.writeShortcutLink(link,'update',{target:process.execPath,cwd:INSTALL_DIR,icon:process.execPath,iconIndex:0});
        }catch{}
      }
    }
  }
  // Remove the old program name once the hand-over process has exited.
  for(let i=0;i<60&&fs.existsSync(legacy);i++){
    try{fs.rmSync(legacy,{force:true});}catch{await new Promise(r=>setTimeout(r,500));}
  }
  // Remove previous-version backups left next to the app by both updaters.
  const parent=path.dirname(INSTALL_DIR);
  let siblings=[];try{siblings=fs.readdirSync(parent,{withFileTypes:true});}catch{}
  for(const entry of siblings){
    if(!entry.isDirectory()||!/^\.(webp-maker|jcct)-backup-/.test(entry.name))continue;
    const backup=path.join(parent,entry.name);
    if(fs.existsSync(path.join(backup,'resources','app','package.json')))
      await fs.promises.rm(backup,{recursive:true,force:true,maxRetries:5,retryDelay:1000}).catch(()=>{});
  }
  const oldMarker=path.join(app.getPath('appData'),'WebP Maker','updates','pending-update.json');
  try{if(JSON.parse(fs.readFileSync(oldMarker,'utf8')).target===INSTALL_DIR)fs.rmSync(oldMarker,{force:true});}catch{}
}
app.setName('Juicy Chat Creator Tools');
const lock=app.requestSingleInstanceLock();
let win=null,maker=null,updater=null,intro=null,quitting=false;
if(!lock)app.quit();
else app.on('second-instance',()=>{if(win&&!win.isDestroyed()){win.show();win.focus();}});
function send(channel,value){if(win&&!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.send(channel,value);}
function conversionActive(){return !!maker?.job&&!maker.job.cancelled;}
function launch(){
  const icon=path.join(__dirname,'assets','icon.png');
  win=new BrowserWindow({width:1550,height:1030,minWidth:1050,minHeight:720,show:false,title:'Juicy Chat Creator Tools',backgroundColor:'#100b16',autoHideMenuBar:true,
    icon,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,webviewTag:false}});
  win.loadFile(path.join(__dirname,'renderer','index.html'));
  win.once('ready-to-show',()=>{win.show();});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{const wanted=new URL('file://'+path.join(__dirname,'renderer','index.html')).href;if(url!==wanted)event.preventDefault();});
  win.on('close',async event=>{
    if(quitting||!conversionActive())return;
    event.preventDefault();
    const choice=await dialog.showMessageBox(win,{type:'warning',title:'Juicy Chat Creator Tools',message:'Abort the WebP conversion and exit?',
      detail:'The current WebP conversion will stop and its unfinished output will be discarded. Introduction Editor drafts are autosaved.',
      buttons:['Keep converting','Abort conversion and exit'],defaultId:0,cancelId:0,noLink:true});
    if(choice.response===1){maker.cancel();quitting=true;win.close();}
  });
  win.on('closed',()=>{win=null;});
}
app.whenReady().then(async()=>{
  if(!lock)return;
  maker=new WebpMaker({appRoot:__dirname,userData:app.getPath('userData'),onProgress:data=>send('webpmaker:progress',data)});
  intro=createIntroService({app,clipboard,dialog,onClose:()=>send('creator-tools:select-tab','webpmaker')});
  const verifySender=event=>{
    if(!win||win.isDestroyed()||event.sender!==win.webContents)throw Error('Action requires the Juicy Chat Creator Tools desktop window.');
  };
  for(const [name,method] of Object.entries({begin:'begin',frame:'frame',finish:'finish',cancel:'cancel',preview:'preview'})){
    ipcMain.handle('webpmaker:'+name,(event,...args)=>{verifySender(event);return maker[method](...args);});
  }
  ipcMain.handle('webpmaker:save',async(event,suggested)=>{
    verifySender(event);
    if(!maker.resultPath())throw Error('Convert a WebP before saving.');
    const safeName=String(suggested||'Animation.webp').replace(/[\\/:*?"<>|]/g,'_').replace(/\.webp$/i,'')+'.webp';
    const saved=await dialog.showSaveDialog(win,{title:'Save animated WebP',defaultPath:safeName,filters:[{name:'Animated WebP',extensions:['webp']}]});
    return saved.canceled||!saved.filePath?{canceled:true}:maker.save(saved.filePath);
  });
  ipcMain.handle('webpmaker:notify',(event,status)=>{
    verifySender(event);if(status!=='complete'&&status!=='failed')return false;
    try{
      if(!Notification.isSupported()||win?.isFocused())return false;
      const complete=status==='complete';const notification=new Notification({title:complete?'WebP conversion complete':'WebP conversion failed',body:complete?'Your animation is ready to preview and save.':'Switch to WebP Maker to see details.'});
      notification.on('click',()=>{if(win&&!win.isDestroyed()){win.show();win.focus();send('creator-tools:select-tab','webpmaker');}});
      notification.show();return true;
    }catch{return false;}
  });
  ipcMain.handle('creator-tools:intro',(event,action,args)=>{verifySender(event);return intro.handle(action,args);});
  updater=new PortableUpdater({version:app.getVersion(),platform:process.platform,appRoot:__dirname,packaged:app.isPackaged,
    installDir:path.dirname(app.getPath('exe')),userData:app.getPath('userData'),busy:conversionActive,onStatus:status=>send('updates:status',status)});
  ipcMain.handle('updates:state',event=>{verifySender(event);return updater.state;});
  ipcMain.handle('updates:check',event=>{verifySender(event);return updater.check();});
  ipcMain.handle('updates:install',async event=>{
    verifySender(event);
    if(conversionActive())throw Error('Finish or cancel the current WebP conversion before updating.');
    if(!updater.available)throw Error('Check for updates first.');
    const choice=await dialog.showMessageBox(win,{type:'question',title:'Install update?',message:`Update Juicy Chat Creator Tools to v${updater.available.version}?`,
      detail:'A verified ZIP from GitHub will replace the portable app after it closes, then restart it. Your Introduction templates and video files stay on your computer.',
      buttons:['Update & Restart','Not now'],defaultId:0,cancelId:1});
    if(choice.response!==0)return {cancelled:true};
    const stage=await updater.prepare();await updater.launchInstaller(stage);
    quitting=true;app.quit();return {restarting:true};
  });
  launch();
  if(!E2E)setTimeout(()=>finishRename().catch(()=>{}),3000).unref();
  if(!E2E){setTimeout(()=>updater.check({silent:true}),4500).unref();setInterval(()=>updater.check({silent:true}),6*60*60*1000).unref();}
  if(E2E)require('./scripts/e2e-desktop').run({app,win,maker,dialog,root:__dirname}).catch(e=>{console.error('E2E FAILED:',e);process.exitCode=1;quitting=true;app.quit();});
}).catch(e=>{console.error(e);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{quitting=true;});
