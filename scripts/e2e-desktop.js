'use strict';
// Required packaged Windows/Linux smoke test. Launch the built Electron app,
// decode three real VP9/WebM videos via Chromium, and encode one animated WebP
// via the bundled ImageMagick. No mocked decoder or encoder.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(callback,{label='operation',limit=240000}={}){
  const end=Date.now()+limit;let state;
  while(Date.now()<end){state=await callback();if(state&&state.ok)return state;if(state?.error)throw Error(`${label}: ${state.error}`);await sleep(350);}
  throw Error(`${label} timed out. Last state: ${JSON.stringify(state)}`);
}
function countWebp(filename){
  const b=fs.readFileSync(filename);
  assert(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP');
  assert(b.length>100&&b.length<=9990000);
  const frames=b.toString('latin1').match(/ANMF/g)||[];
  assert(frames.length>=30,`Expected animation frames, got ${frames.length}`);
  assert(b.includes(Buffer.from('ANIM')),'Animation chunk missing');
  return frames.length;
}
async function run({app,win,maker,root}){
  const out=process.env.CREATOR_TOOLS_E2E_REPORT||path.join(os.tmpdir(),`jcct-e2e-${process.pid}.json`);
  try{
    if(win.webContents.isLoading())await new Promise((resolve,reject)=>{win.webContents.once('did-finish-load',resolve);win.webContents.once('did-fail-load',(_,code,msg)=>reject(Error(`${code}: ${msg}`)));});
    const tabs=await win.webContents.executeJavaScript(`(()=>{
      const all=[...document.querySelectorAll('.jcct-tabs [data-tab]')].map(b=>b.dataset.tab);
      document.querySelector('[data-tab="introduction"]').click();
      const isEditor=document.querySelector('#view-introduction').classList.contains('active');
      document.querySelector('[data-tab="webpmaker"]').click();
      return {all,isEditor,version:document.getElementById('jcct-version').textContent};
    })()`);
    assert.deepEqual(tabs.all,['webpmaker','compressor','builder','introduction','settings']);assert(tabs.isEditor);
    const samples=[1,2,3].map(i=>{
      const name=`webp-vp9-${i}.mp4`,file=path.join(root,'tests','fixtures',name);
      assert(fs.existsSync(file),`Test fixture missing: ${name}`);
      return {name,blob:fs.readFileSync(file).toString('base64')};
    });
    await win.webContents.executeJavaScript(`(()=>{
      const dt=new DataTransfer();
      for(const f of ${JSON.stringify(samples)}){
        const bin=atob(f.blob),bytes=new Uint8Array(bin.length);
        for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
        dt.items.add(new File([bytes],f.name,{type:'video/mp4',lastModified:0}));
      }
      const el=document.getElementById('wm-input');el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await until(async()=>win.webContents.executeJavaScript(`(()=>({
      ok:document.querySelector('#wm-count').textContent.includes('(3)') &&
        !document.querySelector('#wm-convert').disabled,
      error:document.querySelector('#wm-error').hidden?'':document.querySelector('#wm-error').textContent,
      status:document.querySelector('#wm-count').textContent
    }))()`),{label:'Load three real MP4-labeled VP9 videos',limit:45000});
    await win.webContents.executeJavaScript(`(()=>{
      // A real user clicks OK on the size-change prompt; an unattended
      // test must answer it, or the modal blocks the window forever.
      window.confirm=()=>true;window.alert=()=>{};
      const el=document.querySelector('#wm-crop');el.value='3:4';el.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('#wm-convert').click();
    })()`);
    await until(async()=>win.webContents.executeJavaScript(`(()=>({
      ok:!document.querySelector('#wm-result').hidden && document.querySelector('#wm-progress-pct').textContent==='100%',
      error:document.querySelector('#wm-error').hidden?'':document.querySelector('#wm-error').textContent,
      status:document.querySelector('#wm-progress-title')?.textContent,
      detail:document.querySelector('#wm-progress-detail')?.textContent
    }))()`),{label:'Real MP4-to-WebP conversion',limit:360000});
    assert(maker.resultPath(),'Conversion succeeded in UI but no WebP output exists');
    const outfile=path.join(path.dirname(out),'jcct-e2e-result.webp');
    maker.save(outfile);const frames=countWebp(outfile);
    const info=maker.latest;
    assert.equal(info.width,480);assert.equal(info.height,640);assert.equal(info.loop,'infinite');
    const magick=await maker.magick();
    const signatures=execFileSync(magick,[outfile,'-coalesce','-format','%#\n','info:'],
      {timeout:90000,encoding:'utf8',windowsHide:true,maxBuffer:6000000,env:{...process.env,APPIMAGE_EXTRACT_AND_RUN:'1'}})
      .trim().split(/\r?\n/).filter(Boolean);
    assert.equal(signatures.length,frames);
    const source=maker.cachedFrames?.clipFrames||[20,20,20];
    const total=source.reduce((a,b)=>a+b,0);
    const sizes=source.map((n,i)=>i===source.length-1?frames-source.slice(0,-1).reduce((acc,x)=>acc+Math.max(1,Math.round(x*frames/total)),0):Math.max(1,Math.round(n*frames/total))); 
    let cursor=0;const unique=sizes.map(count=>{const result=new Set(signatures.slice(cursor,cursor+count)).size;cursor+=count;return result;});
    assert(unique.every(n=>n>=5),`Frozen video detected; unique frames by clip: ${unique}`);
    fs.writeFileSync(out,JSON.stringify({ok:true,version:app.getVersion(),tabs,frames,unique,bytes:info.bytes,width:info.width,height:info.height},null,2));
    console.log('PASS: packaged Windows/Linux app, five tabs, three moving VP9 clips, 480x640 animated WebP, 9.99MB cap.');
  }catch(e){
    const error=String(e&&e.stack||e);
    fs.writeFileSync(out,JSON.stringify({ok:false,error},null,2));
    throw e;
  }finally{try{maker.dispose();}catch{}app.quit();}
}
module.exports={run};
