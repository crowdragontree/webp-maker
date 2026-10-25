'use strict';
/* CI-only: download verified official ImageMagick for portable releases.
 * ImageMagick is never required as a user-installed dependency. */
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const version='7.1.2-34';
const platform=process.argv[2];
if(!['win32','linux'].includes(platform))throw Error('Usage: node scripts/bundle-imagemagick.js win32|linux');
const names={win32:`ImageMagick-${version}-portable-Q16-x64.7z`,linux:`ImageMagick-${version}-gcc-x86_64.AppImage`};
const headers={'User-Agent':'JuicyChatCreatorTools-Build','Accept':'application/vnd.github+json'};
if(process.env.GITHUB_TOKEN)headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
async function retrieve(url){
 const resp=await fetch(url,{headers,signal:AbortSignal.timeout(180000)});
 if(!resp.ok)throw Error(`Download failed: HTTP ${resp.status} ${url}`);
 return resp;
}
async function main(){
 const release=await (await retrieve(`https://api.github.com/repos/ImageMagick/ImageMagick/releases/tags/${version}`)).json();
 const asset=release.assets?.find(x=>x.name===names[platform]);
 if(!asset)throw Error('The official ImageMagick release is missing '+names[platform]);
 if(!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||''))throw Error('ImageMagick download has no verifiable SHA-256 digest.');
 if(!Number.isSafeInteger(asset.size)||asset.size<1000000||asset.size>100000000)throw Error('Unreasonable ImageMagick asset size.');
 const temporary=await fsp.mkdtemp(path.join(os.tmpdir(),'jcct-imagemagick-'));
 try{
  const archive=path.join(temporary,asset.name);
  const response=await retrieve(asset.browser_download_url);
  const fd=await fsp.open(archive,'wx');const hash=crypto.createHash('sha256');let bytes=0;
  try{
   for await(const chunk of response.body){bytes+=chunk.length; if(bytes>asset.size)throw Error('Archive larger than declared asset.');hash.update(chunk);await fd.write(chunk);}
  }finally{await fd.close();}
  if(bytes!==asset.size||hash.digest('hex')!==asset.digest.slice(7).toLowerCase())throw Error('ImageMagick SHA-256 verification failed.');
  const dest=path.join(__dirname,'..','resources','webpmaker',platform==='win32'?'windows':'linux');
  await fsp.mkdir(dest,{recursive:true});
  if(platform==='linux'){
   await fsp.copyFile(archive,path.join(dest,'magick'));
   await fsp.chmod(path.join(dest,'magick'),0o755);
   console.log('Verified and bundled official Linux ImageMagick AppImage.');
  }else{
   const directory=path.join(temporary,'extracted');await fsp.mkdir(directory);
   const seven=require('7zip-bin').path7za;
   const res=spawnSync(seven,['x','-y',`-o${directory}`,archive],{timeout:240000,windowsHide:true,encoding:'utf8'});
   if(res.error||res.status!==0)throw Error('Unable to unpack official ImageMagick portable archive: '+(res.stderr||res.error));
   async function locate(dir){for(const e of await fsp.readdir(dir,{withFileTypes:true})){
    const item=path.join(dir,e.name);if(e.isDirectory()){const found=await locate(item);if(found)return found;}else if(e.name.toLowerCase()==='magick.exe')return dir;
   }return null;}
   const sub=await locate(directory);if(!sub)throw Error('Official ImageMagick archive contained no magick.exe');
   await fsp.cp(sub,dest,{recursive:true,force:true});
   if(!fs.existsSync(path.join(dest,'magick.exe')))throw Error('Windows portable ImageMagick missing after extraction.');
   console.log('Verified and bundled official Windows portable ImageMagick.');
  }
 }finally{await fsp.rm(temporary,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
