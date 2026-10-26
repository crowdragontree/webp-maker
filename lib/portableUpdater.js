'use strict';
// A portable, out-of-process updater for the existing WebP-Maker GitHub release
// filenames. Both the old WebP Maker and the renamed app can use those assets.
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const API='https://api.github.com/repos/crowdragontree/webp-maker/releases/latest';
const MAX_ZIP=900*1024*1024;
const ASSETS={win32:'WebP-Maker-Windows-x64.zip',linux:'WebP-Maker-Linux-x64.zip'};
// New releases ship 'JuicyChat Creator Tool'; older releases shipped 'WebP-Maker'.
const EXE={win32:'JuicyChat Creator Tool.exe',linux:'JuicyChat Creator Tool'};
const LEGACY_EXE={win32:'WebP-Maker.exe',linux:'WebP-Maker'};
const compare=(a,b)=>{
  const aa=String(a).replace(/^v/,''),bb=String(b).replace(/^v/,'');
  const semver=/^\d+\.\d+\.\d+$/;
  if(!semver.test(aa)||!semver.test(bb))throw Error('Invalid update version.');
  for(let i=0;i<3;i++){
    const x=Number(aa.split('.')[i]),y=Number(bb.split('.')[i]);
    if(x!==y)return Math.sign(x-y);
  }
  return 0;
};
async function requireExecutable(filename){
  const st=await fsp.stat(filename).catch(e=>{if(e.code==='ENOENT')throw Error('ZIP extractor binary is missing.');throw e;});
  if(!st.isFile())throw Error('ZIP extractor path is invalid.');
  if(process.platform==='linux'){
    try{await fsp.access(filename,fs.constants.X_OK);}catch(e){if(e.code!=='EACCES')throw e;await fsp.chmod(filename,(st.mode&0o7777)|0o111);await fsp.access(filename,fs.constants.X_OK);}
  }
  return filename;
}
function assetFor(release,platform,currentVersion){
  if(!release||release.draft||release.prerelease)return null;
  const version=String(release.tag_name||'').replace(/^v/,'');
  if(compare(version,currentVersion)<=0)return null;
  const name=ASSETS[platform];if(!name)throw Error('Automatic updates support Windows 64-bit and Linux x64 only.');
  const file=release.assets?.find(a=>a.name===name);
  if(!file)throw Error(`The GitHub release is missing ${name}.`);
  if(!/^sha256:[0-9a-f]{64}$/i.test(file.digest||''))throw Error('Release ZIP has no verifiable GitHub SHA-256 digest. Download this version manually from GitHub Releases.');
  if(!Number.isSafeInteger(file.size)||file.size<10000||file.size>MAX_ZIP)throw Error('Release ZIP size is invalid.');
  const url=new URL(file.browser_download_url);
  if(url.protocol!=='https:'||url.hostname!=='github.com'||!url.pathname.startsWith('/crowdragontree/webp-maker/releases/download/'))
    throw Error('Untrusted GitHub release URL.');
  return {version,name,url:url.href,digest:file.digest.slice(7).toLowerCase(),size:file.size};
}
async function retrieve(url,timeoutMs=15000){
  const resp=await fetch(url,{redirect:'follow',headers:{'User-Agent':'JuicyChatCreatorTools-Updater','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(timeoutMs)});
  if(!resp.ok)throw Error(`GitHub returned HTTP ${resp.status}.`);
  return resp;
}
async function download(asset,file,onProgress=()=>{}){
  const resp=await retrieve(asset.url,900000);
  const handle=await fsp.open(file,'wx',0o600);
  const digest=crypto.createHash('sha256');let downloaded=0;
  try{
    for await(const chunk of resp.body){
      const data=Buffer.from(chunk);downloaded+=data.length;
      if(downloaded>asset.size||downloaded>MAX_ZIP)throw Error('Update download exceeds its declared size.');
      digest.update(data);await handle.write(data);
      onProgress(Math.min(100,Math.round(downloaded/asset.size*100)));
    }
  }catch(e){await handle.close();await fsp.rm(file,{force:true});throw e;}
  await handle.close();
  if(downloaded!==asset.size||digest.digest('hex')!==asset.digest){await fsp.rm(file,{force:true});throw Error('Update integrity verification failed. The installed app was not changed.');}
}
// Minimal ZIP central directory inspector. Reject unsafe paths, links and
// decompression bombs before handing archives to the bundled extractor.
async function validateZip(filename){
  const fd=await fsp.open(filename,'r');
  try{
    const size=(await fd.stat()).size;
    const tail=Buffer.alloc(Math.min(size,65557));await fd.read(tail,0,tail.length,size-tail.length);
    let eocd=-1;for(let i=tail.length-22;i>=0;i--){if(tail.readUInt32LE(i)===0x06054b50){eocd=i;break;}}
    if(eocd<0)throw Error('Release download is not a valid ZIP file.');
    const count=tail.readUInt16LE(eocd+10),length=tail.readUInt32LE(eocd+12),start=tail.readUInt32LE(eocd+16);
    if(count<2||count>30000||length>64*1024*1024||start+length>size)throw Error('Unsafe ZIP directory.');
    const buf=Buffer.alloc(length);await fd.read(buf,0,length,start);
    let cursor=0,total=0;
    for(let i=0;i<count;i++){
      if(cursor+46>buf.length||buf.readUInt32LE(cursor)!==0x02014b50)throw Error('Malformed ZIP entry.');
      const nameLen=buf.readUInt16LE(cursor+28),extra=buf.readUInt16LE(cursor+30),comment=buf.readUInt16LE(cursor+32);
      const creator=buf.readUInt16LE(cursor+4),attrs=buf.readUInt32LE(cursor+38);
      const name=buf.toString('utf8',cursor+46,cursor+46+nameLen);
      if(!name||name.includes('\\')||name.startsWith('/')||name.startsWith('~')||name.includes(':')||name.split('/').includes('..')||name.includes('\0'))throw Error('Unsafe ZIP entry path.');
      if(creator>>8===3&&((attrs>>>16)&0o170000)===0o120000)throw Error('ZIP contains a symlink.');
      total+=buf.readUInt32LE(cursor+24);
      if(total>2_000_000_000)throw Error('ZIP expands beyond safe size.');
      cursor+=46+nameLen+extra+comment;
    }
    return count;
  }finally{await fd.close();}
}
function run(file,args,{cwd}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(file,args,{cwd,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    let errors='';child.stderr.on('data',b=>errors=(errors+String(b)).slice(-1000));child.stdout.on('data',()=>{});
    child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(`ZIP extraction failed (${code}). ${errors}`)));
  });
}
class PortableUpdater{
  constructor({version,platform,appRoot,installDir,userData,packaged=true,onStatus=()=>{},busy=()=>false,fetchRelease}){
    Object.assign(this,{version,platform,appRoot,installDir,userData,packaged,onStatus,busy,fetchRelease,available:null});
    this.state={phase:'idle',currentVersion:version,message:'Check for updates'};
    this.locked=false;
  }
  emit(phase,message,extra={}){this.state={...this.state,...extra,phase,message,currentVersion:this.version};this.onStatus(this.state);return this.state;}
  async check({silent=false}={}){
    if(this.locked)return this.state;
    if(!this.packaged)return this.emit('development','Updates are available for packaged releases.');
    this.emit('checking','Checking GitHub Releases...');
    try{
      const release=this.fetchRelease?await this.fetchRelease():await (await retrieve(API)).json();
      const asset=assetFor(release,this.platform,this.version);
      this.available=asset;
      if(asset)return this.emit('available',`v${asset.version} is available.`,{version:asset.version});
      return this.emit('current',`You're running the latest version (v${this.version}).`);
    }catch(e){return this.emit('error',silent?'Update check unavailable. Click to retry.':e.message);}
  }
  async prepare(){
    if(this.locked)throw Error('An update is already running.');
    if(this.busy())throw Error('Finish or cancel the current WebP conversion before updating.');
    if(!this.available)throw Error('Check for updates first.');
    if(!this.packaged)throw Error('Update a packaged application, not the development source.');
    this.locked=true;
    const a=this.available,root=path.join(this.userData,'updates'),part=path.join(root,'juicychat-'+a.version+'-'+Date.now()+'.zip');
    const target=this.installDir;
    const stage=path.join(path.dirname(target),`.jcct-stage-${a.version}-${process.pid}`);
    const backup=path.join(path.dirname(target),`.jcct-backup-${this.version}-${Date.now()}`);
    try{
      await fsp.mkdir(root,{recursive:true});
      if(fs.existsSync(stage))throw Error('A staged update already exists.');
      this.emit('downloading',`Downloading v${a.version} (0%)...`);
      await download(a,part,p=>this.emit('downloading',`Downloading v${a.version} (${p}%)...`));
      this.emit('verifying','Verifying downloaded ZIP...');
      await validateZip(part);
      const extract=path.join(root,'extract-'+Date.now());await fsp.mkdir(extract,{recursive:true});
      let exe=null;
      try{
        const seven=await requireExecutable(require('7zip-bin').path7za);
        await run(seven,['x','-y','-tzip','-bso0','-bsp0',`-o${extract}`,part]);
        const names=[EXE[this.platform],LEGACY_EXE[this.platform]];
        const nested=path.join(extract,`WebP-Maker-${this.platform==='linux'?'linux':'win32'}-x64`);
        let flat=null;
        for(const dir of [extract,nested])for(const name of names)if(!exe&&fs.existsSync(path.join(dir,name))){flat=dir;exe=name;}
        if(!exe)throw Error('Updated executable missing from ZIP.');
        const packed=JSON.parse(await fsp.readFile(path.join(flat,'resources','app','package.json'),'utf8'));
        if(compare(packed.version,a.version)!==0)throw Error('The downloaded application version does not match its GitHub release tag.');
        await fsp.rename(flat,stage);
        // Zip extraction may strip Linux executable permissions.
        if(this.platform==='linux')await fsp.chmod(path.join(stage,exe),0o755);
      }finally{await fsp.rm(extract,{recursive:true,force:true}).catch(()=>{});}
      return {stage,target,backup,exe,version:a.version,log:path.join(root,'last-update.log')};
    }catch(e){await fsp.rm(stage,{recursive:true,force:true}).catch(()=>{});this.emit('error',e.message);throw e;}
    finally{await fsp.rm(part,{force:true}).catch(()=>{});this.locked=false;}
  }
  async launchInstaller(args){
    const script=path.join(this.appRoot,'scripts',this.platform==='win32'?'install-portable-update.ps1':'install-portable-update.sh');
    if(!fs.existsSync(script))throw Error('Portable updater helper missing.');
    const cmd=this.platform==='win32'?'powershell.exe':'/bin/sh';
    const opt=this.platform==='win32'?['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ParentPid',String(process.pid),'-Target',args.target,'-Stage',args.stage,'-Backup',args.backup,'-Executable',args.exe,'-LogFile',args.log]:[script,String(process.pid),args.target,args.stage,args.backup,args.exe,args.log];
    const proc=spawn(cmd,opt,{detached:true,stdio:'ignore',windowsHide:true,cwd:this.userData});
    await new Promise((resolve,reject)=>{proc.once('spawn',resolve);proc.once('error',reject);});proc.unref();
    return this.emit('restarting',`Installing v${args.version} and restarting...`);
  }
}
module.exports={PortableUpdater,assetFor,compare,requireExecutable,validateZip,download,ASSETS,EXE,LEGACY_EXE};
