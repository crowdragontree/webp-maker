'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const api=window.creatorTools;
  if(!api)throw new Error('Juicy Chat Creator Tools desktop bridge unavailable.');
  const navs=[...document.querySelectorAll('.jcct-tabs [data-tab]')];
  function switchTo(name){
    if(!['webpmaker','introduction'].includes(name))return;
    for(const btn of navs){const current=btn.dataset.tab===name;btn.classList.toggle('active',current);btn.setAttribute('aria-selected',String(current));}
    for(const section of document.querySelectorAll('.jcct-main>.view'))section.classList.toggle('active',section.id==='view-'+name);
    document.title=`Juicy Chat Creator Tools - ${name==='webpmaker'?'WebP Maker':'Introduction Editor'}`;
  }
  navs.forEach(btn=>btn.addEventListener('click',()=>switchTo(btn.dataset.tab)));
  api.onSelectTab(name=>switchTo(name));
  const frame=$('jcct-introduction-frame');
  const allowed=new Set(['bootstrap','draft','templates','template-save','template-delete','template-export','template-import','copy','close']);
  window.addEventListener('message',async event=>{
    const req=event.data;
    if(event.source!==frame.contentWindow||!req||req.type!=='jcct:intro:request'||!Number.isSafeInteger(req.id)||!allowed.has(req.action)||!Array.isArray(req.args))return;
    let response;
    try{
      const value=await api.introRequest(req.action,req.args);
      response={type:'jcct:intro:response',id:req.id,ok:true,value};
    }catch(e){response={type:'jcct:intro:response',id:req.id,ok:false,error:String(e?.message||e)};}
    if(event.source===frame.contentWindow)event.source.postMessage(response,'*');
  });
  const check=$('jcct-update-check'),install=$('jcct-update-install'),state=$('jcct-update-status');
  function renderUpdate(status){
    if(!status)return;
    const p=status.phase||'idle';state.dataset.state=p;state.textContent=status.message||'Check for updates';
    if(status.currentVersion)$('jcct-version').textContent='v'+status.currentVersion;
    check.disabled=['checking','downloading','verifying','staging','restarting'].includes(p);
    install.hidden=p!=='available';
    install.disabled=p!=='available';
  }
  $('jcct-crash-log').addEventListener('click',()=>{api.openCrashLog().catch(e=>renderUpdate({phase:'error',message:e.message}));});
  api.onUpdateStatus(renderUpdate);
  api.updateState().then(renderUpdate).catch(e=>renderUpdate({phase:'error',message:e.message}));
  check.addEventListener('click',async()=>{
    check.disabled=true;
    try{renderUpdate(await api.checkUpdates());}catch(e){renderUpdate({phase:'error',message:e.message});}
    finally{check.disabled=false;}
  });
  install.addEventListener('click',async()=>{
    install.disabled=true;
    try{await api.installUpdate();}catch(e){renderUpdate({phase:'error',message:e.message});install.disabled=false;}
  });
  switchTo('webpmaker');
})();
