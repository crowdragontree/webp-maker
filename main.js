'use strict';
const path=require('node:path');
const {app,BrowserWindow,ipcMain,dialog,clipboard,Notification,shell,nativeImage}=require('electron');
const {WebpMaker}=require('./lib/webpMaker');
const {create:createIntroService}=require('./introduction-designer/inline-host');
const {PortableUpdater}=require('./lib/portableUpdater');
const E2E=process.argv.includes('--creator-tools-e2e');
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
  if(!E2E){setTimeout(()=>updater.check({silent:true}),4500).unref();setInterval(()=>updater.check({silent:true}),6*60*60*1000).unref();}
  if(E2E)require('./scripts/e2e-desktop').run({app,win,maker,dialog,root:__dirname}).catch(e=>{console.error('E2E FAILED:',e);process.exitCode=1;quitting=true;app.quit();});
}).catch(e=>{console.error(e);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{quitting=true;});
