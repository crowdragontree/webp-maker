'use strict';
// Test the bundled Windows 7-Zip executable using a real .7z archive.
// This is run in GitHub's Windows build after npm install.
const fs=require('fs'),os=require('os'),path=require('path');
const assert=require('assert');
const {spawnSync}=require('child_process');
if(process.platform==='win32'){
  const exe=require('7zip-bin').path7za;
  assert(fs.existsSync(exe),'7-Zip executable must be present in the Windows build');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'webpmaker-7z-test-'));
  try{
    const input=path.join(tmp,'input');
    const output=path.join(tmp,'output');
    fs.mkdirSync(input);fs.mkdirSync(output);
    fs.writeFileSync(path.join(input,'example.txt'),'ImageMagick archive extraction test');
    const archive=path.join(tmp,'example.7z');
    const archiveResult=spawnSync(exe,['a','-t7z','-m0=lzma2',archive,'example.txt'],{cwd:input,encoding:'utf8'});
    assert.strictEqual(archiveResult.status,0,`Cannot create LZMA2 test archive: ${archiveResult.stderr}`);
    const extractResult=spawnSync(exe,['x',archive,`-o${output}`,'-y','-bd'],{encoding:'utf8'});
    assert.strictEqual(extractResult.status,0,`Cannot extract LZMA2 test archive: ${extractResult.stderr}`);
    assert.strictEqual(fs.readFileSync(path.join(output,'example.txt'),'utf8'),'ImageMagick archive extraction test');
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  console.log('Windows LZMA/7-Zip extractor self-test passed.');
}else{
  console.log('Windows LZMA/7-Zip extractor self-test skipped (requires Windows).');
}
