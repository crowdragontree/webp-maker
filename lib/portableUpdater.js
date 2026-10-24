'use strict';
// Update portable ZIP distributions from the project's public, published GitHub releases.
// No MP4/WebP files or personal data are sent to GitHub.
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {pipeline}=require('node:stream/promises');
const {Readable,Transform}=require('node:stream');

const API='https://api.github.com/repos/crowdragontree/webp-maker/releases/latest';
const ASSETS={win32:'WebP-Maker-Windows-x64.zip',linux:'WebP-Maker-Linux-x64.zip'};
const MAX_DOWNLOAD=750*1024*1024;
const MAX_UNPACKED=2*1024*1024*1024;
const RELEASE_PREFIX='https://github.com/crowdragontree/webp-maker/releases/download/';

function versionParts(v){
  const m=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v||''));
  return m?[+m[1],+m[2],+m[3]]:null;
}
function compareVersions(a,b){
  const av=versionParts(a),bv=versionParts(b);
  if(!av||!bv)throw new Error('Invalid release version; expected v1.2.3.');
  for(let i=0;i<3;i++)if(av[i]!==bv[i])return av[i]>bv[i]?1:-1;
  return 0;
}
function assetForRelease(release,platform,currentVersion){
  if(!release||release.draft||release.prerelease||!versionParts(release.tag_name))throw new Error('GitHub has no published stable version available.');
  const name=ASSETS[platform];
  if(!name)throw new Error('Updates are supported on Windows and Linux only.');
  const newer=compareVersions(release.tag_name,currentVersion)>0;
  if(!newer)return null;
  const asset=release.assets?.find(a=>a.name===name&&a.state==='uploaded');
  if(!asset)throw new Error(`Release ${release.tag_name} has no ${name}. Please wait until both downloads are published.`);
  const expected=`${RELEASE_PREFIX}${encodeURIComponent(release.tag_name)}/${name}`;
  if(asset.browser_download_url!==expected)throw new Error('GitHub returned an unexpected update address. Update cancelled.');
  if(!/^sha256:[0-9a-f]{64}$/i.test(asset.digest||''))throw new Error('GitHub has not provided a SHA-256 checksum for this download. Update cancelled.');
  if(!Number.isSafeInteger(asset.size)||asset.size<10000||asset.size>MAX_DOWNLOAD)throw new Error('The released file has an unexpected size.');
  return {version:release.tag_name.replace(/^v/,''),name,url:asset.browser_download_url,
    sha256:asset.digest.slice(7).toLowerCase(),size:asset.size};
}
async function getJson(url){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),15000);
  try{
    const r=await fetch(url,{headers:{'Accept':'application/vnd.github+json','User-Agent':'WebP-Maker-Portability-Updates'},signal:ctrl.signal,cache:'no-store'});
    if(!r.ok)throw new Error(r.status===403?'GitHub update checks are temporarily limited. Try again later.':`GitHub release lookup failed (HTTP ${r.status}).`);
    return await r.json();
  }finally{clearTimeout(timer);}
}
async function downloadVerified({url,destination,size,sha256,progress}){
  const ctrl=new AbortController();
  const timeout=setTimeout(()=>ctrl.abort(),900000);
  const hash=crypto.createHash('sha256');
  let bytes=0;
  try{
    const res=await fetch(url,{redirect:'follow',headers:{'User-Agent':'WebP-Maker-Portability-Updates'},signal:ctrl.signal});
    if(!res.ok||!res.body)throw new Error(`Download failed (HTTP ${res.status}).`);
    const type=res.headers.get('content-type')||'';
    if(/text\/html/i.test(type))throw new Error('GitHub returned a web page instead of the application download.');
    await fsp.mkdir(path.dirname(destination),{recursive:true});
    const meter=new Transform({transform(chunk,_,cb){
      bytes+=chunk.length;
      if(bytes>MAX_DOWNLOAD||bytes>size){cb(new Error('Update file is larger than GitHub reported.'));return;}
      hash.update(chunk);
      if(bytes===size||bytes%(4*1024*1024)<chunk.length)progress?.({phase:'downloading',percent:Math.floor(100*bytes/size),detail:`Downloaded ${(bytes/1e6).toFixed(1)} / ${(size/1e6).toFixed(1)} MB`});
      cb(null,chunk);
    }});
    await pipeline(Readable.fromWeb(res.body),meter,fs.createWriteStream(destination,{flags:'wx',mode:0o600}));
    if(bytes!==size)throw new Error(`Download incomplete (${bytes} of ${size} bytes).`);
    if(hash.digest('hex')!==sha256)throw new Error('Downloaded update failed the SHA-256 integrity check. No files were changed.');
    return bytes;
  }catch(e){await fsp.rm(destination,{force:true}).catch(()=>{});throw e;}
  finally{clearTimeout(timeout);}
}
function run(command,args,{timeout=120000}={}){
  return new Promise((resolve,reject)=>{
    let stderr='';
    const proc=spawn(command,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
    proc.stderr.on('data',b=>{if(stderr.length<4000)stderr+=b.toString();});
    const timer=setTimeout(()=>{proc.kill();reject(new Error('Extracting the update timed out.'));},timeout);
    proc.on('error',e=>{clearTimeout(timer);reject(e);});
    proc.on('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error(`Could not extract the application ZIP (code ${code}): ${stderr.slice(-400)}`));});
  });
}
// Files copied from GitHub or extracted from ZIPs can lose Unix execute bits.
// Repair the bundled 7-Zip executable before spawning it, both during tests
// and in already-distributed portable Linux applications.
async function usable7ZipExecutable(binary){
  const stat=await fsp.stat(binary).catch(e=>{
    if(e.code==='ENOENT')throw new Error('The bundled ZIP extractor is missing.');
    throw e;
  });
  if(!stat.isFile())throw new Error('The bundled ZIP extractor is not a regular file.');
  if(process.platform!=='win32'){
    try{
      await fsp.access(binary,fs.constants.X_OK);
    }catch(e){
      if(e.code!=='EACCES')throw e;
      // 0644 -> 0755, retaining existing read/write permission bits.
      await fsp.chmod(binary,(stat.mode&0o7777)|0o111);
      await fsp.access(binary,fs.constants.X_OK);
    }
  }
  return binary;
}
// Read only the ZIP central directory to reject traversal paths, symlinks and zip bombs
// before passing the verified release asset to 7-Zip for extraction.
async function validateZip(file){
  const h=await fsp.open(file,'r');
  try{
    const st=await h.stat();
    const tailSize=Math.min(st.size,65557);
    const tail=Buffer.alloc(tailSize);
    await h.read(tail,0,tailSize,st.size-tailSize);
    let pos=-1;
    for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50){pos=i;break;}
    if(pos<0)throw new Error('Downloaded update is not a valid ZIP archive.');
    const count=tail.readUInt16LE(pos+10);
    const cdSize=tail.readUInt32LE(pos+12),cdOffset=tail.readUInt32LE(pos+16);
    if(!count||count>25000||cdSize>32*1024*1024||cdOffset+cdSize>st.size)throw new Error('Update ZIP has an invalid file index.');
    const directory=Buffer.alloc(cdSize);
    await h.read(directory,0,cdSize,cdOffset);
    let p=0,unpacked=0;
    for(let i=0;i<count;i++){
      if(p+46>directory.length||directory.readUInt32LE(p)!==0x02014b50)throw new Error('Update ZIP file index is corrupted.');
      const size=directory.readUInt32LE(p+24),nameSize=directory.readUInt16LE(p+28),extra=directory.readUInt16LE(p+30),comment=directory.readUInt16LE(p+32);
      const mode=(directory.readUInt32LE(p+38)>>>16)&0xffff;
      if(p+46+nameSize+extra+comment>directory.length)throw new Error('Update ZIP file index is truncated.');
      const filename=directory.subarray(p+46,p+46+nameSize).toString('utf8');
      if(!filename||filename.startsWith('/')||filename.includes('\\')||filename.includes('\0')||
          filename.split('/').some(s=>s==='..')||/^[A-Za-z]:/.test(filename))throw new Error('Update ZIP contains an unsafe file name.');
      if((mode&0xf000)===0xa000)throw new Error('Update ZIP contains a symbolic link.');
      unpacked+=size;
      if(unpacked>MAX_UNPACKED)throw new Error('Update would unpack more than 2 GB.');
      p+=46+nameSize+extra+comment;
    }
    if(p!==directory.length)throw new Error('Unexpected ZIP index data.');
    return {entries:count,unpackedBytes:unpacked};
  }finally{await h.close();}
}

class PortableUpdater{
  constructor({version,platform=process.platform,appRoot,installDir,userData,onStatus=()=>{},isBusy=()=>false,
    packaged=true,fetchRelease=()=>getJson(API),download=downloadVerified,extractor=null}={}){
    this.version=version;this.platform=platform;this.appRoot=appRoot;this.installDir=installDir;this.userData=userData;
    this.onStatus=onStatus;this.isBusy=isBusy;this.packaged=packaged;this.fetchRelease=fetchRelease;this.download=download;this.extractor=extractor;
    this.state={phase:'idle',currentVersion:version};this.available=null;this.checkPromise=null;this.installing=false;this.prepared=null;
  }
  emit(update){this.state={...this.state,...update};this.onStatus(this.state);return this.state;}
  async check({silent=false}={}){
    if(this.checkPromise)return this.checkPromise;
    this.checkPromise=(async()=>{
      this.emit({phase:'checking',message:'Checking GitHub for updates…'});
      try{
        const release=await this.fetchRelease();
        const asset=assetForRelease(release,this.platform,this.version);
        this.available=asset;
        if(!asset)return this.emit({phase:'current',version:this.version,message:`You're up to date (v${this.version}).`});
        return this.emit({phase:'available',version:asset.version,message:`WebP Maker v${asset.version} is available.`});
      }catch(e){
        return this.emit({phase:'error',message:silent?'Could not check for updates.':'Update check failed: '+e.message});
      }finally{this.checkPromise=null;}
    })();
    return this.checkPromise;
  }
  async prepare(){
    if(this.installing)throw new Error('An update is already being prepared.');
    if(this.isBusy())throw new Error('Wait for WebP conversion to finish before updating.');
    if(!this.packaged)throw new Error('Automatic installation works in the packaged Windows/Linux app, not a development checkout.');
    if(!this.available)throw new Error('Please check for updates first.');
    this.installing=true;
    let downloadFile,unpackedRoot,staging;
    try{
      const asset=this.available;
      const parent=path.dirname(this.installDir);
      // Test write access in the folder where the existing portable application lives.
      const probe=await fsp.mkdtemp(path.join(parent,'.webp-maker-write-check-'));
      await fsp.rm(probe,{recursive:true,force:true});
      await fsp.mkdir(path.join(this.userData,'updates'),{recursive:true});
      const unique=crypto.randomBytes(5).toString('hex');
      downloadFile=path.join(this.userData,'updates',`webp-maker-${asset.version}-${unique}.zip`);
      unpackedRoot=path.join(parent,`.webp-maker-unpack-${unique}`);
      staging=path.join(parent,`.webp-maker-stage-${unique}`);
      this.emit({phase:'downloading',version:asset.version,percent:0,message:'Downloading verified update…'});
      await this.download({...asset,destination:downloadFile,progress:x=>this.emit({...x,version:asset.version,message:x.detail||'Downloading update…'})});
      this.emit({phase:'verifying',message:'Verifying and unpacking the update…',percent:100});
      await validateZip(downloadFile);
      await fsp.mkdir(unpackedRoot,{recursive:true});
      if(this.extractor)await this.extractor(downloadFile,unpackedRoot);
      else{
        const seven=await usable7ZipExecutable(require('7zip-bin').path7za);
        await run(seven,['x','-y','-tzip','-bso0','-bsp0',`-o${unpackedRoot}`,downloadFile]);
      }
      const source=this.platform==='linux'?path.join(unpackedRoot,'WebP-Maker-linux-x64'):unpackedRoot;
      const exe=this.platform==='win32'?'WebP-Maker.exe':'WebP-Maker';
      if(!fs.existsSync(path.join(source,exe)))throw new Error(`This release does not contain ${exe}.`);
      if(this.platform==='linux'){
        // ZIP extractors do not consistently restore executable permissions.
        for(const rel of [exe,'resources/app/node_modules/7zip-bin/linux/x64/7za',
          'resources/app/resources/webpmaker/linux/ImageMagick.AppImage']){
          const executable=path.join(source,rel);
          if(fs.existsSync(executable))await fsp.chmod(executable,0o755);
        }
      }
      const pkg=JSON.parse(await fsp.readFile(path.join(source,'resources','app','package.json'),'utf8'));
      if(pkg.version!==asset.version)throw new Error(`The released app is version ${pkg.version}, but the release tag says ${asset.version}. Update cancelled.`);
      // Do not replace the current installation until extraction and validation pass.
      await fsp.rename(source,staging);
      await fsp.rm(unpackedRoot,{recursive:true,force:true}).catch(()=>{});
      await fsp.rm(downloadFile,{force:true}).catch(()=>{});
      const backup=path.join(parent,`.webp-maker-backup-${unique}`);
      this.prepared={version:asset.version,target:this.installDir,stage:staging,backup,exe};
      this.emit({phase:'ready',version:asset.version,message:`v${asset.version} verified. Ready to restart and install.`});
      return this.prepared;
    }catch(e){
      await Promise.all([downloadFile&&fsp.rm(downloadFile,{force:true}),unpackedRoot&&fsp.rm(unpackedRoot,{recursive:true,force:true}),staging&&fsp.rm(staging,{recursive:true,force:true})].filter(Boolean).map(p=>p.catch(()=>{})));
      this.emit({phase:'error',message:'Update not installed: '+e.message});
      throw e;
    }finally{this.installing=false;}
  }
  async launchInstaller(pid=process.pid){
    const p=this.prepared;
    if(!p||!fs.existsSync(p.stage))throw new Error('No verified update is ready.');
    if(this.isBusy())throw new Error('Finish your WebP conversion before restarting.');
    const runtimeDir=await fsp.mkdtemp(path.join(this.userData,'updates','installer-'));
    const isWin=this.platform==='win32';
    const filename=isWin?'install-portable-update.ps1':'install-portable-update.sh';
    const script=path.join(runtimeDir,filename);
    await fsp.copyFile(path.join(this.appRoot,'scripts',filename),script);
    if(!isWin)await fsp.chmod(script,0o700);
    const log=path.join(runtimeDir,'install.log');
    const marker=path.join(this.userData,'updates','pending-update.json');
    await fsp.writeFile(marker,JSON.stringify({...p,log,platform:this.platform},null,2),{mode:0o600});
    const args=isWin?['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ParentPid',String(pid),
        '-Target',p.target,'-Stage',p.stage,'-Backup',p.backup,'-Executable',p.exe,'-LogFile',log]:
      [script,String(pid),p.target,p.stage,p.backup,p.exe,log];
    const command=isWin?'powershell.exe':'/bin/sh';
    const child=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true,cwd:runtimeDir});
    await new Promise((resolve,reject)=>{
      child.once('error',reject);
      child.once('spawn',resolve);
    });
    child.unref();
    this.emit({phase:'restarting',message:'Closing WebP Maker to install the update…'});
    return true;
  }
  async cleanupSuccessfulUpdate(){
    const marker=path.join(this.userData,'updates','pending-update.json');
    try{
      const p=JSON.parse(await fsp.readFile(marker,'utf8'));
      if(p.platform!==this.platform||p.target!==this.installDir)return;
      if(p.version!==this.version){
        this.emit({phase:'error',message:`The update to v${p.version} did not complete. Your previous version is still installed.`});
        return;
      }
      if(p.backup&&path.dirname(p.backup)===path.dirname(this.installDir)&&path.basename(p.backup).startsWith('.webp-maker-backup-')){
        await fsp.rm(p.backup,{recursive:true,force:true,maxRetries:5,retryDelay:1000});
      }
      await fsp.rm(marker,{force:true});
    }catch(e){if(e.code!=='ENOENT')console.warn('Could not clean up old update:',e.message);}
  }
}
module.exports={PortableUpdater,assetForRelease,compareVersions,validateZip,downloadVerified,usable7ZipExecutable,ASSETS,API};
