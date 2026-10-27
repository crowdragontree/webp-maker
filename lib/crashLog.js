'use strict';
// A plain text log of crashes and errors, for the person who runs the app to send to the developer.
// It never throws: a logging problem must not become a second problem.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const MAX_BYTES=1024*1024;   // the log is moved aside (once) when it grows past this, so it can never fill a disk
const MB=n=>Math.round(n/1048576);
class CrashLog{
  constructor({dir,now=()=>new Date()}){
    this.dir=dir;this.file=path.join(dir,'creator-tool-crash.log');this.session=path.join(dir,'session-state.json');this.now=now;
    this.errorLines=0;
    try{fs.mkdirSync(dir,{recursive:true});}catch{}
  }
  line(kind,detail){
    const stamp=this.now().toISOString();
    const text=typeof detail==='string'?detail:(detail&&detail.stack)||JSON.stringify(detail);
    return `[${stamp}] ${kind}${text?': '+String(text).replace(/\r?\n/g,'\n    '):''}\n`;
  }
  write(kind,detail){
    try{
      try{if(fs.statSync(this.file).size>MAX_BYTES)fs.renameSync(this.file,this.file+'.old');}catch{}
      fs.appendFileSync(this.file,this.line(kind,detail));
      return true;
    }catch{return false;}
  }
  // The same numbers every time, so two logs can be compared.
  memory(label){
    const free=os.freemem(),total=os.totalmem();
    this.write('memory',`${label}: computer ${MB(total-free)} of ${MB(total)} MB in use`);
  }
  // One line per app process (window, GPU, utility): how much memory each is holding.
  processes(label,metrics){
    try{
      const rows=(metrics||[]).map(m=>`${m.type}${m.name?' '+m.name:''} pid ${m.pid}: ${MB((m.memory&&m.memory.workingSetSize||0)/1024)} MB in use, peak ${MB((m.memory&&m.memory.peakWorkingSetSize||0)/1024)} MB`);
      this.write('memory',`${label}: ${rows.join(' | ')}`);
    }catch{}
  }
  // Called at start. A run that never reached a normal exit left `clean:false` behind.
  startSession(info){
    let previous=null;
    try{previous=JSON.parse(fs.readFileSync(this.session,'utf8'));}catch{}
    const unclean=!!(previous&&previous.clean===false);
    if(unclean)
      this.write('previous run did not close normally',`it started ${previous.startedAt} (version ${previous.version||'?'}) and never reached a normal exit: the app was closed by Windows/Linux, crashed hard, or lost power`);
    this.write('start',info);
    try{fs.writeFileSync(this.session,JSON.stringify({startedAt:this.now().toISOString(),version:info&&info.version,clean:false}));}catch{}
    return unclean;   // true: the last run crashed or was cut off
  }
  endSession(){
    try{
      const state=JSON.parse(fs.readFileSync(this.session,'utf8'));state.clean=true;
      fs.writeFileSync(this.session,JSON.stringify(state));
    }catch{}
    this.write('exit','closed normally');
  }
  // Errors printed by the window. Capped so one error that repeats cannot flood the file.
  windowError(text,source,line){
    if(++this.errorLines>200){if(this.errorLines===201)this.write('window error','more than 200 errors: the rest are not logged');return;}
    this.write('window error',`${text}${source?`\n(${source}${line?':'+line:''})`:''}`);
  }
}
module.exports={CrashLog,MAX_BYTES};
