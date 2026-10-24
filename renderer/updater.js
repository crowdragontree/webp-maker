(() => {
  'use strict';
  const api=window.webpMaker;
  if(!api?.updaterState||!api?.checkForUpdates)return;
  const $=id=>document.getElementById(id);
  const version=$('wm-app-version'),status=$('wm-update-status'),check=$('wm-update-check'),install=$('wm-update-install');
  function show(state){
    if(!state)return;
    if(state.currentVersion)version.textContent='v'+state.currentVersion;
    const phase=state.phase||'idle';
    status.dataset.phase=phase;
    status.textContent=state.message||'Check for updates';
    check.disabled=['checking','downloading','verifying','ready','restarting'].includes(phase);
    install.hidden=phase!=='available';
    install.textContent=phase==='available'?'Update & restart':'Update';
    if(phase==='downloading')status.textContent=state.message||`Downloading… ${state.percent||0}%`;
    if(phase==='ready')status.textContent='Download verified. Restarting to install…';
  }
  api.onUpdaterStatus(show);
  api.updaterState().then(show).catch(e=>{status.textContent='Could not read app version: '+e.message;});
  check.addEventListener('click',async()=>{
    check.disabled=true;
    try{show(await api.checkForUpdates());}catch(e){show({phase:'error',message:e.message});}
  });
  install.addEventListener('click',async()=>{
    install.disabled=true;
    try{
      const result=await api.installUpdate();
      if(result?.cancelled)show({phase:'available',message:'Update is available. Install whenever you are ready.'});
    }catch(e){
      if(/finish or cancel.*conversion/i.test(e.message||'')){
        show({phase:'available',message:e.message});
      }else show({phase:'error',message:e.message||String(e)});
    }finally{install.disabled=false;}
  });
})();
