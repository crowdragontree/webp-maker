'use strict';
// No network access. Covers release lookup/semver, mandatory digest validation,
// safe ZIP inspection, update staging and (on Linux) safe out-of-process replacement.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {PortableUpdater,assetForRelease,compareVersions,validateZip,downloadVerified,usable7ZipExecutable}=require('../lib/portableUpdater');
const ROOT=path.resolve(__dirname,'..');
const fixtureDir=path.join(ROOT,'tests','update-fixtures');
const digest=file=>'sha256:'+crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function releaseFor(platform,version='1.0.4'){
  const name=platform==='win32'?'WebP-Maker-Windows-x64.zip':'WebP-Maker-Linux-x64.zip';
  const file=path.join(fixtureDir,`${platform}.zip`);
  return {tag_name:`v${version}`,draft:false,prerelease:false,assets:[{name,state:'uploaded',size:fs.statSync(file).size,digest:digest(file),browser_download_url:`https://github.com/crowdragontree/webp-maker/releases/download/v${version}/${name}`}]};
}
async function main(){
  assert.equal(compareVersions('v1.0.4','1.0.2'),1);
  assert.equal(compareVersions('1.0.2','v1.0.4'),-1);
  assert.equal(compareVersions('v1.0.2','1.0.2'),0);
  assert.equal(compareVersions('2.0.0','1.99.99'),1);
  for(const platform of ['win32','linux']){
    assert.equal(assetForRelease(releaseFor(platform),platform,'1.0.2').version,'1.0.4');
    assert.equal(assetForRelease(releaseFor(platform),platform,'1.0.4'),null);
    assert.throws(()=>assetForRelease({...releaseFor(platform),assets:[]},platform,'1.0.2'),/no WebP-Maker/);
    const missingDigest=releaseFor(platform);delete missingDigest.assets[0].digest;
    assert.throws(()=>assetForRelease(missingDigest,platform,'1.0.2'),/SHA-256/);
    const latest=releaseFor(platform);latest.assets[0].browser_download_url='https://attacker.example/download.zip';
    assert.throws(()=>assetForRelease(latest,platform,'1.0.2'),/unexpected update address/);
    const zip=path.join(fixtureDir,`${platform}.zip`);
    assert((await validateZip(zip)).entries>=3);
  }
  await assert.rejects(()=>validateZip(path.join(fixtureDir,'traversal.zip')),/unsafe file name/);
  const tmp=await fsp.mkdtemp(path.join(os.tmpdir(),'webpmaker-updater-test-'));
  try{
    // Regression test for GitHub's EACCES failure: strip Unix execute bits
    // from an actual copy of 7za, then verify the same repair used by the
    // production updater makes that binary runnable again.
    const real7zip=require('7zip-bin').path7za;
    assert(fs.existsSync(real7zip),'7zip-bin must be installed for the updater test');
    if(process.platform==='linux'){
      const nonExecutable=path.join(tmp,'7za-with-lost-execute-permission');
      await fsp.copyFile(real7zip,nonExecutable);
      await fsp.chmod(nonExecutable,0o644);
      await assert.rejects(()=>fsp.access(nonExecutable,fs.constants.X_OK),/EACCES/);
      await usable7ZipExecutable(nonExecutable);
      assert((fs.statSync(nonExecutable).mode&0o111)!==0,'7za execute permission was not restored');
      const permissionTestOutput=path.join(tmp,'permission-recovery-extracted');
      await fsp.mkdir(permissionTestOutput);
      execFileSync(nonExecutable,['x','-y','-tzip','-bso0','-bsp0',`-o${permissionTestOutput}`,
        path.join(fixtureDir,'linux.zip')],{timeout:30000,windowsHide:true,stdio:'ignore'});
      assert(fs.existsSync(path.join(permissionTestOutput,'WebP-Maker-linux-x64','WebP-Maker')),
        '7za could not extract a real ZIP after executable permission repair');
      // Also recreate EACCES on the actual installed dependency: prepare()
      // must repair this exact binary via its normal, unmocked extraction path.
      await fsp.chmod(real7zip,0o644);
    }
    // Verify stream checksum failure leaves nothing on disk, never a partial install.
    const fake=path.join(fixtureDir,'win32.zip'),binary=fs.readFileSync(fake);
    const oldFetch=global.fetch;
    global.fetch=async()=>new Response(binary,{status:200,headers:{'content-type':'application/zip'}});
    try{
      await assert.rejects(()=>downloadVerified({url:'https://example.invalid/update.zip',destination:path.join(tmp,'bad.zip'),
        size:binary.length,sha256:'f'.repeat(64)}),/SHA-256 integrity/);
      assert(!fs.existsSync(path.join(tmp,'bad.zip')));
      await downloadVerified({url:'https://example.invalid/update.zip',destination:path.join(tmp,'good.zip'),size:binary.length,sha256:digest(fake).slice(7)});
      assert.equal(fs.readFileSync(path.join(tmp,'good.zip')).compare(binary),0);
    }finally{global.fetch=oldFetch;}
    for(const platform of ['win32','linux']){
      const parent=path.join(tmp,platform);await fsp.mkdir(parent);
      const installDir=path.join(parent,'Installed-WebP-Maker');await fsp.mkdir(installDir);
      await fsp.writeFile(path.join(installDir,'OLD_VERSION'),'1.0.2');
      const userData=path.join(tmp,'userdata-'+platform);
      const snapshots=[];
      const updater=new PortableUpdater({version:'1.0.2',platform,appRoot:ROOT,installDir,userData,
        fetchRelease:async()=>releaseFor(platform),onStatus:s=>snapshots.push(s),
        download:async({destination})=>{await fsp.copyFile(path.join(fixtureDir,`${platform}.zip`),destination);}});
      assert.equal((await updater.check()).phase,'available');
      const stage=await updater.prepare();
      assert.equal(stage.version,'1.0.4');
      assert(fs.existsSync(path.join(stage.stage,'resources','app','package.json')));
      assert(fs.existsSync(path.join(installDir,'OLD_VERSION')),'Old version changed before restart!');
      assert(snapshots.some(s=>s.phase==='ready'));
      if(platform==='linux' && process.platform==='linux'){
        // A fake install with a dead PID verifies atomic swap and restart script.
        await fsp.chmod(path.join(stage.stage,'WebP-Maker'),0o755);
        const log=path.join(tmp,'linux-update.log');
        execFileSync('/bin/sh',[path.join(ROOT,'scripts','install-portable-update.sh'),'999999999',installDir,
          stage.stage,stage.backup,'WebP-Maker',log],{timeout:10000});
        assert(fs.existsSync(path.join(installDir,'resources','app','package.json')));
        assert(fs.existsSync(path.join(stage.backup,'OLD_VERSION')));
      }
    }
    if(process.platform==='linux'){
      assert((fs.statSync(require('7zip-bin').path7za).mode&0o111)!==0,
        'The production updater did not repair the installed 7za executable');
    }
    console.log('Portable WebP Maker updater self-test passed (Windows + Linux release validation, ZIP safety, Linux 7za EACCES recovery, staged installs and Linux swap).');
  }finally{await fsp.rm(tmp,{recursive:true,force:true,maxRetries:2}).catch(()=>{});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
