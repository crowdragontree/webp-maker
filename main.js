'use strict';
const path=require('node:path');
const fs=require('node:fs');
// Crash log, earliest part. It uses only built-in Node modules and runs before anything else loads, so even a
// crash while the app is starting (a missing or broken file) is written down and shown on screen.
// The log sits next to the program file (the portable app's own folder) so it can be found without opening the app.
const LOG_NAME='creator-tool-crash.log';
const logFolder=()=>{
  const candidates=[process.env.JCCT_CRASHLOG_DIR,path.dirname(process.execPath),require('node:os').tmpdir()].filter(Boolean);
  for(const dir of candidates){try{fs.mkdirSync(dir,{recursive:true});fs.accessSync(dir,fs.constants.W_OK);return dir;}catch{}}
  return null;
};
let crashLog=null;   // the full logger, created once the app is ready to name its folders
function earlyWrite(kind,error){
  if(crashLog){crashLog.write(kind,error);return crashLog.file;}
  try{
    const dir=logFolder();if(!dir)return null;
    const file=path.join(dir,LOG_NAME);
    fs.appendFileSync(file,`[${new Date().toISOString()}] ${kind}: ${String(error&&error.stack||error).replace(/\r?\n/g,'\n    ')}\n`);
    return file;
  }catch{return null;}
}
function reportStartupError(kind,error){
  const file=earlyWrite(kind,error);
  try{
    const {dialog:d}=require('electron');
    if(kind==='main process error'&&d)
      d.showErrorBox('Juicy Chat Creator Tools hit an error',`${error&&error.message||error}\n\n`+(file?`Details were saved to:\n${file}\n\nPlease send that file to the developer.`:'The details could not be saved.'));
  }catch{}
}
process.on('uncaughtException',error=>reportStartupError('main process error',error));
process.on('unhandledRejection',reason=>earlyWrite('unhandled promise rejection',reason));
const {spawn}=require('node:child_process');
const {app,BrowserWindow,ipcMain,dialog,clipboard,Notification,shell,nativeImage}=require('electron');
const {WebpMaker}=require('./lib/webpMaker');
const {create:createIntroService}=require('./introduction-designer/inline-host');
const {PortableUpdater,finishUpdate,ASSETS}=require('./lib/portableUpdater');
const {CrashLog}=require('./lib/crashLog');
const BotBuilder=require('./lib/botBuilder');
const imageService=require('./lib/imageService');
const LANGUAGETOOL=require('./lib/languagetool');
// Started by the updater from the downloaded copy: install it, then exit.
const FINISH_UPDATE=process.argv.find(a=>a.startsWith('--jcct-finish-update='));
if(FINISH_UPDATE){
  finishUpdate(FINISH_UPDATE.slice('--jcct-finish-update='.length)).catch(()=>{}).finally(()=>process.exit(0));
  return;
}
// Build-time test of the full update path (see the GitHub workflow).
const UPDATE_E2E=process.argv.includes('--creator-tools-update-e2e');
const E2E=process.argv.includes('--creator-tools-e2e')||UPDATE_E2E;
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
  // v1.2.2: this no longer rewrites old WebP-Maker shortcuts or removes WebP-Maker.exe. On a Windows 10 computer the app was cut off hard about 3 seconds after every start,
  // exactly when this step ran, and reading and writing shortcut files is the only native Windows call in the first seconds. The old WebP-Maker.exe, if it is still there,
  // is harmless: it only hands over to this program. Shortcuts that point at it keep working.
  crashLog.write('startup step','clean-up of old update files: start');
  // Remove previous-version backups and unused update copies left next to the app.
  const parent=path.dirname(INSTALL_DIR);
  let siblings=[];try{siblings=fs.readdirSync(parent,{withFileTypes:true});}catch{}
  for(const entry of siblings){
    if(!entry.isDirectory()||!/^\.(webp-maker|jcct)-(backup|stage|unpack)-/.test(entry.name))continue;
    const backup=path.join(parent,entry.name);
    if(fs.existsSync(path.join(backup,'resources','app','package.json')))
      await fs.promises.rm(backup,{recursive:true,force:true,maxRetries:5,retryDelay:1000}).catch(()=>{});
  }
  const oldMarker=path.join(app.getPath('appData'),'WebP Maker','updates','pending-update.json');
  try{if(JSON.parse(fs.readFileSync(oldMarker,'utf8')).target===INSTALL_DIR)fs.rmSync(oldMarker,{force:true});}catch{}
  crashLog.write('startup step','clean-up of old update files: done');
}
app.setName('Juicy Chat Creator Tools');
// Crash log: a text file in the app's data folder that can be sent to the developer (header button: Crash log).
// Crash dumps stay in a separate folder next to it and are not needed unless the developer asks for them.
const logDir=logFolder()||path.join(app.getPath('userData'),'logs');
crashLog=new CrashLog({dir:logDir});
try{app.setPath('crashDumps',path.join(app.getPath('userData'),'logs','crash-dumps'));require('electron').crashReporter.start({uploadToServer:false,compress:true});}catch(e){crashLog.write('crash dumps could not be turned on',e);}
app.on('render-process-gone',(event,contents,details)=>{
  crashLog.write('WINDOW CRASHED',`reason: ${details.reason}, exit code: ${details.exitCode}`);
  crashLog.processes('memory at the crash (last known)',lastMetrics);crashLog.memory('at the crash');
  offerCrashLog(`The window crashed (${details.reason}).`);
});
app.on('child-process-gone',(event,details)=>crashLog.write('helper process stopped',`${details.type}${details.name?' '+details.name:''}: ${details.reason}, exit code ${details.exitCode}`));
let lastMetrics=[];
const sampleMemory=()=>{try{lastMetrics=app.getAppMetrics();}catch{}};
// After a crash: offer to open the folder holding the log, so it can be sent to the developer. At most once a minute.
let lastPrompt=0;
function offerCrashLog(message){
  if(Date.now()-lastPrompt<60000)return;lastPrompt=Date.now();
  dialog.showMessageBox(win&&!win.isDestroyed()?win:undefined,{type:'error',title:'Juicy Chat Creator Tools',message,
    detail:`What happened was saved in this file. Please send it to the developer:\n${crashLog.file}`,buttons:['Show the crash log','Close'],defaultId:0,cancelId:1,noLink:true})
    .then(choice=>{if(choice.response===0)showCrashLog();}).catch(()=>{});
}
function showCrashLog(){
  if(!fs.existsSync(crashLog.file))crashLog.write('log opened','no problems recorded yet');
  shell.showItemInFolder(crashLog.file);
}
app.on('will-quit',()=>crashLog.endSession());
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
  const wc=win.webContents;
  wc.once('did-finish-load',()=>crashLog.write('startup step','window: page loaded'));
  win.once('ready-to-show',()=>crashLog.write('startup step','window: shown'));
  wc.on('unresponsive',()=>crashLog.write('window stopped responding','the window is frozen or very busy'));
  wc.on('responsive',()=>crashLog.write('window responds again',''));
  wc.on('did-fail-load',(event,code,description,url)=>crashLog.write('window failed to load',`${description} (${code}) ${url}`));
  wc.on('preload-error',(event,file,error)=>crashLog.write('window helper script failed',`${file}\n${error&&error.stack||error}`));
  // Electron 32 passes (event, level, message, line, source); newer versions put the same fields on the event.
  wc.on('console-message',(event,level,message,line,source)=>{
    const d=level&&typeof level==='object'?level:event&&event.level!==undefined?event:null;
    const isError=d?(d.level==='error'||d.level===3):level>=3;
    if(isError)crashLog.windowError(d?d.message:message,d?d.sourceId:source,d?d.lineNumber:line);
  });
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
  crashLog.write('startup step','app ready');
  if(!lock)return;
  maker=new WebpMaker({appRoot:__dirname,userData:app.getPath('userData'),onProgress:data=>send('webpmaker:progress',data)});
  intro=createIntroService({app,clipboard,dialog,onClose:()=>send('creator-tools:select-tab','webpmaker')});
  const verifySender=event=>{
    if(!win||win.isDestroyed()||event.sender!==win.webContents)throw Error('Action requires the Juicy Chat Creator Tools desktop window.');
  };
  const lastRunCrashed=crashLog.startSession({version:app.getVersion(),platform:`${process.platform} ${process.arch}`,os:require('node:os').release(),electron:process.versions.electron,chrome:process.versions.chrome,
    packaged:app.isPackaged,memory:`${Math.round(require('node:os').totalmem()/1048576)} MB`,program:path.basename(process.execPath)});
  let memoryTimer=null;
  const watchMemory=()=>{
    if(memoryTimer)return;sampleMemory();
    memoryTimer=setInterval(()=>{if(!conversionActive()){clearInterval(memoryTimer);memoryTimer=null;return;}sampleMemory();crashLog.processes('memory during conversion',lastMetrics);},15000);
    memoryTimer.unref();
  };
  for(const [name,method] of Object.entries({begin:'begin',frame:'frame',finish:'finish',cancel:'cancel',preview:'preview'})){
    ipcMain.handle('webpmaker:'+name,async(event,...args)=>{
      verifySender(event);
      try{
        if(name==='begin'){
          const o=args[0]||{};
          crashLog.write('conversion starts',`${o.width}x${o.height}, ${o.fps} FPS, quality ${o.quality}, ${o.expectedFrames} frames from ${Array.isArray(o.clipFrames)?o.clipFrames.length:'?'} clips`);
          sampleMemory();crashLog.processes('memory before the conversion',lastMetrics);
        }
        const result=await maker[method](...args);
        if(name==='begin')watchMemory();
        if(name==='finish')crashLog.write('conversion finished','');
        return result;
      }catch(error){crashLog.write(`conversion step "${name}" failed`,error);throw error;}
    });
  }
  ipcMain.handle('crashlog:open',event=>{
    verifySender(event);
    showCrashLog();return {path:crashLog.file};
  });
  ipcMain.handle('webpmaker:save',async(event,suggested,allowOver)=>{
    verifySender(event);
    if(!maker.resultPath(!!allowOver))throw Error('Convert a WebP before saving.');
    const safeName=String(suggested||'Animation.webp').replace(/[\\/:*?"<>|]/g,'_').replace(/\.webp$/i,'')+'.webp';
    const saved=await dialog.showSaveDialog(win,{title:'Save animated WebP',defaultPath:safeName,filters:[{name:'Animated WebP',extensions:['webp']}]});
    return saved.canceled||!saved.filePath?{canceled:true}:maker.save(saved.filePath,!!allowOver);
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
  // ---- Image Compressor and picture reading (every picture format)
  imageService.register({ipcMain,dialog,shell,app,getWindow:()=>win,send,verify:verifySender});
  // ---- Bot Builder: the person's own templates, limits, drafts and saved bots live in the app's data folder
  const builder=BotBuilder.create({userData:app.getPath('userData'),resourcesDir:path.join(__dirname,'resources')});
  const fileName=(name,fallback)=>String(name||fallback).replace(/[\\/:*?"<>|]/g,'').trim()||fallback;
  ipcMain.handle('builder:templates',event=>{verifySender(event);return builder.templates();});
  ipcMain.handle('builder:state',event=>{verifySender(event);return builder.state();});
  ipcMain.handle('builder:saveDraft',(event,id,values)=>{verifySender(event);return builder.saveDraft(id,values);});
  ipcMain.handle('builder:setLimits',(event,id,limits)=>{verifySender(event);return builder.setLimits(String(id||''),limits);});
  ipcMain.handle('builder:remove',(event,id)=>{verifySender(event);return builder.remove(id);});
  ipcMain.handle('builder:hiddenTemplates',event=>{verifySender(event);return builder.hiddenList();});
  ipcMain.handle('builder:unhide',(event,id)=>{verifySender(event);return builder.unhide(String(id||''));});
  ipcMain.handle('builder:templateInfo',(event,id)=>{verifySender(event);return builder.info(id);});
  ipcMain.handle('builder:templateLogs',event=>{verifySender(event);return builder.logs();});
  ipcMain.handle('builder:closeTemplateLog',(event,id)=>{verifySender(event);return builder.closeLog(id);});
  ipcMain.handle('builder:restore',(event,id)=>{verifySender(event);return builder.restore(id);});
  ipcMain.handle('builder:import',async event=>{
    verifySender(event);
    const picked=await dialog.showOpenDialog(win,{title:'Add bot template',properties:['openFile','multiSelections'],filters:[{name:'Text templates',extensions:['txt']}]});
    if(picked.canceled||!picked.filePaths.length)return {added:[],errors:[]};
    return builder.addFiles(picked.filePaths);
  });
  ipcMain.handle('builder:replace',async(event,id)=>{
    verifySender(event);
    const picked=await dialog.showOpenDialog(win,{title:'Choose the updated template',properties:['openFile'],filters:[{name:'Text templates',extensions:['txt']}]});
    if(picked.canceled||!picked.filePaths.length)return {replaced:false};
    return builder.replaceFrom(id,picked.filePaths[0]);
  });
  ipcMain.handle('builder:saveBot',(event,templateId,values,full)=>{verifySender(event);return builder.saveBot(String(templateId||''),values,full);});
  ipcMain.handle('builder:savedBots',event=>{verifySender(event);return builder.savedBots();});
  ipcMain.handle('builder:loadSavedBot',(event,key)=>{verifySender(event);return builder.loadSavedBot(String(key||''));});
  ipcMain.handle('builder:deleteSavedBot',(event,key)=>{verifySender(event);return builder.deleteSavedBot(String(key||''));});
  // Save the finished bot as .txt or .json
  ipcMain.handle('builder:export',async(event,name,text)=>{
    verifySender(event);
    const json=/\.json$/i.test(String(name||''));
    const saved=await dialog.showSaveDialog(win,{title:json?'Save bot as .json':'Save bot as .txt',defaultPath:fileName(name,json?'Bot.json':'Bot.txt'),filters:json?[{name:'JSON',extensions:['json']}]:[{name:'Text',extensions:['txt']}]});
    if(saved.canceled||!saved.filePath)return null;
    fs.writeFileSync(saved.filePath,String(text||''),'utf8');return saved.filePath;
  });
  // Open a bot that was built somewhere else (.txt) and fill the sections from it
  ipcMain.handle('builder:openBot',async event=>{
    verifySender(event);
    const picked=await dialog.showOpenDialog(win,{title:'Open a built bot (.txt or .json)',properties:['openFile'],filters:[{name:'Built bot',extensions:['txt','json']}]});
    if(picked.canceled||!picked.filePaths||!picked.filePaths[0])return null;
    const file=picked.filePaths[0];if(fs.statSync(file).size>5e6)throw Error('That file is too large to be a bot (over 5 MB).');
    return {name:path.basename(file),text:fs.readFileSync(file,'utf8')};
  });
  // ---- Grammar engine (LanguageTool): installed and run on this computer only
  const LTM=LANGUAGETOOL.create({userData:app.getPath('userData')});
  const lt=fn=>async(event,...a)=>{verifySender(event);try{return await fn(...a);}catch(e){return {ok:false,error:String(e&&e.message||e)};}};
  ipcMain.handle('lt:status',lt(()=>({ok:true,...LTM.status()})));
  ipcMain.handle('lt:install',lt(async()=>{await LTM.install(p=>send('lt:progress',p));return {ok:true,...LTM.status()};}));
  ipcMain.handle('lt:remove',lt(async()=>({ok:true,...(await LTM.remove())})));
  ipcMain.handle('lt:enable',lt(on=>({ok:true,...LTM.setEnabled(on)})));
  ipcMain.handle('lt:check',lt(text=>LTM.check(String(text||'').slice(0,20000))));
  app.on('before-quit',()=>{try{LTM.stop();}catch{}});
  ipcMain.handle('creator-tools:copy',(event,text)=>{verifySender(event);clipboard.writeText(String(text==null?'':text).slice(0,2000000));return true;});
  let testRelease;
  if(UPDATE_E2E){
    const zip=process.env.CREATOR_TOOLS_UPDATE_ZIP,next=process.env.CREATOR_TOOLS_UPDATE_VERSION,name=ASSETS[process.platform];
    const bytes=fs.readFileSync(zip),digest='sha256:'+require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    testRelease={fetchRelease:async()=>({tag_name:next,assets:[{name,digest,size:bytes.length,browser_download_url:`https://github.com/crowdragontree/webp-maker/releases/download/${next}/${name}`}]}),
      downloader:async(asset,file)=>fs.promises.copyFile(zip,file)};
  }
  updater=new PortableUpdater({version:app.getVersion(),platform:process.platform,appRoot:__dirname,packaged:app.isPackaged,
    installDir:path.dirname(app.getPath('exe')),userData:app.getPath('userData'),busy:conversionActive,onStatus:status=>send('updates:status',status),...testRelease});
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
  crashLog.write('startup step','window: creating');
  launch();
  crashLog.write('startup step','window: created');
  if(lastRunCrashed&&!E2E)setTimeout(()=>{crashLog.write('startup step','crash log offer: shown');offerCrashLog('The last time you used the app, it did not close normally.');},2500).unref();
  if(!E2E)setTimeout(()=>finishRename().catch(()=>{}),3000).unref();
  if(!E2E){setTimeout(()=>{crashLog.write('startup step','update check: start');Promise.resolve(updater.check({silent:true})).catch(()=>{}).finally(()=>crashLog.write('startup step','update check: done'));},4500).unref();setInterval(()=>updater.check({silent:true}),6*60*60*1000).unref();}
  if(UPDATE_E2E)(async()=>{
    // Same steps as clicking Check for updates, then Update & Restart.
    await updater.check();if(!updater.available)throw Error('Update test: no update offered. '+updater.state.message);
    const stage=await updater.prepare();await updater.launchInstaller(stage);
    quitting=true;app.quit();
  })().catch(e=>{
    console.error('UPDATE E2E FAILED:',e);
    try{fs.mkdirSync(path.join(app.getPath('userData'),'updates'),{recursive:true});fs.appendFileSync(path.join(app.getPath('userData'),'updates','last-update.log'),`UPDATE TEST FAILED BEFORE INSTALL: ${e.stack||e}\n`);}catch{}
    process.exitCode=1;quitting=true;app.quit();
  });
  else if(E2E)require('./scripts/e2e-desktop').run({app,win,maker,dialog,root:__dirname}).catch(e=>{console.error('E2E FAILED:',e);process.exitCode=1;quitting=true;app.quit();});
}).catch(e=>{console.error(e);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{quitting=true;});
