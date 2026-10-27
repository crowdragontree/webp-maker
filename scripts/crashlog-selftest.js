'use strict';
// The crash log: file writing, rotation, "previous run did not close normally", and the wiring in main.js
// (run against a stand-in for Electron, so every hook is exercised without opening a window).
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),{EventEmitter}=require('node:events');
const {CrashLog,MAX_BYTES}=require('../lib/crashLog');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'jcct-crashlog-'));
// --- the log itself
const dir=path.join(tmp,'unit');
let log=new CrashLog({dir});
assert(log.write('hello','world')); assert(/hello: world/.test(fs.readFileSync(log.file,'utf8')));
log.write('err',new Error('boom'));assert(/Error: boom/.test(fs.readFileSync(log.file,'utf8')),'an Error is logged with its stack');
assert.equal(log.startSession({version:'9.9.9'}),false,'first run is not a crash');log.endSession();
log=new CrashLog({dir});assert.equal(log.startSession({version:'9.9.9'}),false);   // the last session ended cleanly: no warning
assert(!/did not close normally/.test(fs.readFileSync(log.file,'utf8')));
log=new CrashLog({dir});assert.equal(log.startSession({version:'9.9.9'}),true,'start reports that the last run did not end');   // the one before never ended: warning
assert(/previous run did not close normally/.test(fs.readFileSync(log.file,'utf8')),'a run that never exited normally is reported');
for(let i=0;i<260;i++)log.windowError('same error '+i);
assert((fs.readFileSync(log.file,'utf8').match(/window error/g)||[]).length<=202,'repeating errors are capped');
const big=new CrashLog({dir:path.join(tmp,'big')});fs.writeFileSync(big.file,'x'.repeat(MAX_BYTES+10));big.write('after','rotation');
assert(fs.existsSync(big.file+'.old')&&fs.statSync(big.file).size<1000,'a log past the size limit is moved aside');
fs.writeFileSync(path.join(tmp,'afile'),'x');
assert.equal(new CrashLog({dir:path.join(tmp,'afile','sub')}).write('a','b'),false,'an unwritable folder does not throw');
// --- main.js with a stand-in for Electron
const logs=path.join(tmp,'userdata');const logsDir=path.join(tmp,'nextto');process.env.JCCT_CRASHLOG_DIR=logsDir;
const handlers=new Map(),appEvents=new EventEmitter();
class WC extends EventEmitter{send(){}isDestroyed(){return false;}setWindowOpenHandler(){}}
const wins=[];
class Win extends EventEmitter{constructor(){super();this.webContents=new WC();wins.push(this);}loadFile(){}isDestroyed(){return false;}once(){}show(){}focus(){}}
let shown=null,shownFile=null;const prompts=[];
const fakeApp=Object.assign(appEvents,{setName(){},getVersion:()=>'1.2.1',isPackaged:false,isReady:()=>true,requestSingleInstanceLock:()=>true,quit(){},
  whenReady:()=>Promise.resolve(),getPath:n=>n==='userData'?logs:path.join(tmp,n),setPath(){},getAppMetrics:()=>[{type:'Tab',pid:1,memory:{workingSetSize:2048000,peakWorkingSetSize:3000000}}]});
const electron={app:fakeApp,BrowserWindow:Win,ipcMain:{handle:(n,f)=>handlers.set(n,f)},dialog:{showErrorBox:(t,m)=>{shown=m;},showMessageBox:async(w,o)=>{prompts.push(o);return {response:0};}},clipboard:{},Notification:{isSupported:()=>false},
  shell:{showItemInFolder:f=>{shownFile=f;}},nativeImage:{},crashReporter:{start(){}}};
const load=Module._load;Module._load=function(request,...rest){return request==='electron'?electron:load.call(this,request,...rest);};
const before=process.listenerCount('uncaughtException');
require('../main.js');   // the stand-in stays in place: main.js asks for Electron again when it reports an error
(async()=>{
  await new Promise(r=>setTimeout(r,200));   // whenReady().then(...)
  const file=path.join(logsDir,'creator-tool-crash.log'),read=()=>fs.readFileSync(file,'utf8');
  assert(/start: .*"version":"1.2.1"/.test(read()),'start entry carries the version');
  assert(process.listenerCount('uncaughtException')>before,'main process errors are caught');
  assert(handlers.has('crashlog:open')&&handlers.has('webpmaker:begin'),'IPC handlers registered');
  // window hooks exist once a window is made
  const wc=wins[0].webContents;
  wc.emit('unresponsive');assert(/window stopped responding/.test(read()));
  wc.emit('did-fail-load',{},-6,'ERR_FILE_NOT_FOUND','file:///x');assert(/window failed to load: ERR_FILE_NOT_FOUND/.test(read()));
  wc.emit('preload-error',{},'preload.js',new Error('bad preload'));assert(/bad preload/.test(read()));
  wc.emit('console-message',{},3,'Uncaught TypeError: x is not a function',12,'file:///a.js');assert(/window error: Uncaught TypeError: x is not a function\n.*a\.js:12/.test(read()),'window errors are logged');
  wc.emit('console-message',{},1,'just info',1,'a.js');assert(!/just info/.test(read()),'info messages are not logged');
  wc.emit('console-message',{level:'error',message:'new style error',lineNumber:3,sourceId:'b.js'});assert(/new style error/.test(read()),'newer Electron event shape works');
  // render-process-gone
  appEvents.emit('render-process-gone',{},{},{reason:'oom',exitCode:-536870904});
  assert(/WINDOW CRASHED: reason: oom, exit code: -536870904/.test(read()),'a window crash is logged with its reason');
  assert(/memory at the crash/.test(read()));
  await new Promise(r=>setTimeout(r,50));
  assert(prompts.length===1&&/crashed \(oom\)/.test(prompts[0].message)&&prompts[0].buttons[0]==='Show the crash log','a crash offers the crash log');
  assert.equal(shownFile,file,'choosing Show the crash log opens its folder');shownFile=null;
  appEvents.emit('child-process-gone',{},{type:'GPU',reason:'crashed',exitCode:1});assert(/helper process stopped: GPU/.test(read()));
  process.emit('uncaughtException',new Error('main boom'));assert(/main process error: Error: main boom/.test(read())&&/main boom/.test(shown),'main error is logged and shown');
  process.emit('unhandledRejection',new Error('rejected'));assert(/unhandled promise rejection/.test(read()));
  // begin with invalid options: the failure is logged and still rejects
  const sender=wc;
  await assert.rejects(()=>handlers.get('webpmaker:begin')({sender},{width:1}),/./);
  assert(/conversion starts: 1xundefined/.test(read())&&/conversion step "begin" failed/.test(read()),'conversion start and failure are logged');
  // the Crash log button
  const res=await handlers.get('crashlog:open')({sender});
  assert.equal(res.path,file);assert.equal(shownFile,file,'the button shows the log file in its folder');
  appEvents.emit('will-quit');assert(/exit: closed normally/.test(read()));
  // A crash while the app is still loading its own files (here: a file is missing) is written next to the program and shown on screen.
  const {spawnSync}=require('node:child_process');
  const broken=path.join(tmp,'broken-app'),startLogDir=path.join(tmp,'startup-log');
  fs.cpSync(path.join(__dirname,'..','lib'),path.join(broken,'lib'),{recursive:true});fs.rmSync(path.join(broken,'lib','webpMaker.js'));
  fs.cpSync(path.join(__dirname,'..','introduction-designer'),path.join(broken,'introduction-designer'),{recursive:true});
  fs.copyFileSync(path.join(__dirname,'..','main.js'),path.join(broken,'main.js'));
  const fake=path.join(tmp,'fake-electron.js'),shownFileMarker=path.join(tmp,'dialog.txt');
  fs.writeFileSync(fake,`const M=require('node:module'),fs=require('node:fs'),load=M._load;
M._load=function(r,...a){if(r==='electron')return {app:{setName(){},requestSingleInstanceLock:()=>true,on(){},whenReady:()=>new Promise(()=>{}),isPackaged:false,getPath:()=>process.env.JCCT_CRASHLOG_DIR},
  dialog:{showErrorBox:(t,m)=>fs.writeFileSync(${JSON.stringify(shownFileMarker)},t+'|'+m)},BrowserWindow:class{},ipcMain:{},clipboard:{},Notification:{},shell:{},nativeImage:{}};return load.call(this,r,...a);};`);
  const run=spawnSync(process.execPath,['-r',fake,path.join(broken,'main.js')],{env:{...process.env,JCCT_CRASHLOG_DIR:startLogDir},encoding:'utf8',timeout:20000});
  const startLog=fs.readFileSync(path.join(startLogDir,'creator-tool-crash.log'),'utf8');
  assert(/main process error: Error: Cannot find module '\.\/lib\/webpMaker'/.test(startLog),'a crash while loading is written to the log: '+startLog.slice(0,200));
  const shown2=fs.readFileSync(shownFileMarker,'utf8');
  assert(shown2.includes(path.join(startLogDir,'creator-tool-crash.log'))&&/send that file/.test(shown2),'the message on screen names the file');
  console.log('Crash log self-test passed: file writing, size limit, hard-exit detection, a crash while the app loads, window/helper/main-process crashes, conversion steps, Crash log button.');
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
