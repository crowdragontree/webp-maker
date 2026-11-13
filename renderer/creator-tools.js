'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const api=window.creatorTools;
  if(!api)throw new Error('Juicy Chat Creator Tools desktop bridge unavailable.');
  const navs=[...document.querySelectorAll('.jcct-tabs [data-tab]')];
  const TABS={webpmaker:'WebP Maker',compressor:'Image Compressor',builder:'Bot Builder',introduction:'Introduction Editor',analytics:'Analytics',settings:'Settings'};
  function switchTo(name){
    if(!Object.prototype.hasOwnProperty.call(TABS,name))return;
    if(name==='analytics'&&!(analyticsInfo&&analyticsInfo.installed))return;      // only when the JuicyChat Analytics Tool is installed
    if(name==='analytics')analyticsFrame();
    for(const btn of navs){const current=btn.dataset.tab===name;btn.classList.toggle('active',current);btn.setAttribute('aria-selected',String(current));}
    for(const section of document.querySelectorAll('.jcct-main>.view'))section.classList.toggle('active',section.id==='view-'+name);
    document.title=`Juicy Chat Creator Tools - ${TABS[name]}`;
    if(name==='builder'&&typeof window.builderOnShow==='function')window.builderOnShow();
    if(name==='webpmaker'&&window.WebpOverlay)window.WebpOverlay.refresh();
    if(name==='settings'&&window.LT&&typeof window.LT.refresh==='function')window.LT.refresh();
  }
  navs.forEach(btn=>btn.addEventListener('click',()=>switchTo(btn.dataset.tab)));
  api.onSelectTab(name=>switchTo(name));
  const frame=$('jcct-introduction-frame');
  const allowed=new Set(['bootstrap','draft','templates','template-save','template-delete','template-export','template-import','copy','save-return','close']);
  // The Bot Builder opens the Introduction Editor with the bot's words (and its earlier design). Save and Return sends the finished design back to the Bot Builder.
  let designerContext=null;
  window.CreatorHost={
    switchTo,
    openDesigner(payload){
      designerContext=payload&&typeof payload==='object'?JSON.parse(JSON.stringify(payload)):null;
      switchTo('introduction');
      try{frame.contentWindow.postMessage({type:'jcct:intro:context',payload:designerContext},'*');}catch{/* the editor is still loading: it reads the context when it starts */}
    }
  };
  window.addEventListener('message',async event=>{
    const req=event.data;
    if(event.source!==frame.contentWindow||!req||req.type!=='jcct:intro:request'||!Number.isSafeInteger(req.id)||!allowed.has(req.action)||!Array.isArray(req.args))return;
    let response;
    try{
      let value;
      if(req.action==='save-return'){
        // Opened from Build Introduction: the design goes back to that bot. Opened from the tab: it goes to the bot open in the Bot Builder.
        let context=designerContext&&designerContext.context||null;
        if(!designerContext){
          const active=window.BuilderIntro&&typeof window.BuilderIntro.active==='function'?window.BuilderIntro.active():null;
          if(!active)throw new Error('Open or choose a bot in the Bot Builder first, then Save and Return will put this Introduction into it.');
          if(!confirm(`Save this Introduction into "${active.label}" in the Bot Builder? It replaces that bot's current Introduction.`)){response={type:'jcct:intro:response',id:req.id,ok:false,error:'Save and Return cancelled.'};event.source.postMessage(response,'*');return;}
          context=active.context;
        }
        value=await api.introRequest('save-return',req.args);
        window.dispatchEvent(new CustomEvent('creator:intro-returned',{detail:{...value,context}}));
        switchTo('builder');
      }else if(req.action==='close'){
        value=true;switchTo(designerContext?'builder':'webpmaker');
      }else{
        value=await api.introRequest(req.action,req.args);
        if(req.action==='bootstrap'&&value&&typeof value==='object')value={...value,embedded:true,seed:designerContext};
      }
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
  // ---- v1.5.1: the Analytics tab and its sign-in in Settings, only when the JuicyChat Analytics Tool is installed on this computer.
  // The tab is the Analytics Tool's own window (from its folder), in a frame; it talks to the Analytics Tool's code that this app runs
  // with its own sign-in and data. Updating the Analytics Tool updates what shows here.
  let analyticsInfo=null,aFrame=null,aAuth=null,aRuntime={ready:null,installing:false,msg:'',err:''};
  const aView=$('view-analytics'),aNav=document.querySelector('.jcct-tabs [data-tab="analytics"]'),aBox=$('jcct-analytics-signin');
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function analyticsFrame(){
    if(!analyticsInfo||!analyticsInfo.installed)return null;
    const src=analyticsInfo.pageUrl+'?v='+encodeURIComponent(analyticsInfo.version||'');
    if(aFrame&&aFrame.dataset.src===src)return aFrame;
    aView.innerHTML='';aFrame=document.createElement('iframe');aFrame.id='jcct-analytics-frame';aFrame.title='Analytics';aFrame.dataset.src=src;aFrame.src=src;aView.appendChild(aFrame);
    return aFrame;
  }
  function applyAnalytics(info){
    const was=analyticsInfo;analyticsInfo=info&&info.installed?info:{installed:false};
    aNav.hidden=!analyticsInfo.installed;
    if(!analyticsInfo.installed){aFrame=null;aView.innerHTML='';if(aView.classList.contains('active'))switchTo('webpmaker');}
    else if(was&&was.installed&&(was.version!==analyticsInfo.version||was.pageUrl!==analyticsInfo.pageUrl)&&aFrame)analyticsFrame();   // the Analytics Tool was updated: its new window loads
    renderAnalyticsSignin(true);
  }
  const ask=(method,...args)=>api.analyticsInvoke(method,args);
  function aStatus(st){aAuth=st||aAuth;const el=$('jcct-an-status');if(!el||!aAuth)return;const k=aAuth.status==='signed-in'?'signed-in':aAuth.status==='signed-out'?'signed-out':aAuth.status==='checking'?'checking':'unknown';
    el.className='jcct-an-status '+k;el.innerHTML=`<span class="jcct-an-dot"></span><div><strong>${esc(k==='signed-in'?'Signed in':k==='signed-out'?'Not signed in':k==='checking'?'Checking session':'Session not confirmed')}</strong><small>${esc(aAuth.message||'')}</small></div>`;}
  async function renderAnalyticsSignin(refresh){
    if(!aBox)return;
    if(!analyticsInfo||!analyticsInfo.installed){aBox.innerHTML='';return;}
    if(refresh){try{const r=await ask('runtimeStatus');aRuntime.ready=!!r.ready;aRuntime.installing=!!r.installing;}catch(e){aRuntime.err=e.message;}}
    const scanner=aRuntime.ready?'':`<div class="jcct-an-runtime"><b>Install the JuicyChat scanner first (one time only)</b><p class="micro">Signing in, collecting and pulling your bots use the JuicyChat scanner of the Analytics Tool: Python with Playwright and Chromium. It is installed once on this computer and kept when either app updates.</p><button type="button" class="primary sm" id="jcct-an-install" ${aRuntime.installing?'disabled':''}>${aRuntime.installing?'Installing...':'Install scanner'}</button><p class="micro" id="jcct-an-runtime-msg">${esc(aRuntime.err||aRuntime.msg)}</p></div>`;
    aBox.innerHTML=`<div class="panel" id="jcct-analytics-panel"><div class="panel-head"><div><h3>JuicyChat sign-in (Analytics)</h3><p>The sign-in the Analytics tab uses. Paste a magic link from your JuicyChat account email and press Sign in: the app signs in by itself in the background (no browser window) and keeps the session. This is the Creator Tool's own sign-in, separate from the JuicyChat Analytics Tool's (v${esc(analyticsInfo.version)}).</p></div></div>
      ${scanner}<div class="jcct-an-row"><input id="jcct-an-link" type="password" placeholder="https://... magic link" autocomplete="off"><button type="button" class="primary" id="jcct-an-signin">Sign in</button></div>
      <div class="jcct-an-session"><div id="jcct-an-status" class="jcct-an-status unknown"></div><div class="jcct-an-actions"><button type="button" class="ghost" id="jcct-an-check">Check Session</button><button type="button" class="ghost" id="jcct-an-reset">Reset Saved Login</button></div></div></div>`;
    if(!aAuth)try{aAuth=await ask('authStatus');}catch{}
    aStatus();
    const inst=$('jcct-an-install');if(inst)inst.onclick=async()=>{aRuntime.installing=true;aRuntime.err='';renderAnalyticsSignin(false);try{const r=await ask('runtimeInstall');aRuntime.ready=!!r.ready;}catch(e){aRuntime.err=e.message;}aRuntime.installing=false;renderAnalyticsSignin(false);};
    $('jcct-an-signin').onclick=async()=>{const link=$('jcct-an-link').value.trim();if(!link){aStatus({status:'signed-out',message:'Paste a fresh JuicyChat magic link first.'});return;}
      const b=$('jcct-an-signin');b.disabled=true;aStatus({status:'checking',message:'Signing in in the background...'});
      try{const r=await ask('openLogin',link);aStatus(r.auth);if(r.ok)$('jcct-an-link').value='';}catch(e){aStatus({status:'signed-out',message:e.message});}finally{b.disabled=false;}};
    $('jcct-an-check').onclick=async()=>{aStatus({status:'checking',message:'Checking the saved JuicyChat session...'});try{aStatus(await ask('authStatus'));}catch(e){aStatus({status:'unknown',message:e.message});}};
    $('jcct-an-reset').onclick=async()=>{if(!confirm('Clear the saved JuicyChat login from the Creator Tool\'s Analytics tab? You will need a fresh magic link to sign in again.'))return;try{aStatus(await ask('resetLogin'));}catch(e){aStatus({status:'unknown',message:e.message});}};
  }
  // the frame asks; the answer goes back to the frame
  window.addEventListener('message',async event=>{
    const m=event.data;if(!aFrame||event.source!==aFrame.contentWindow||!m||m.type!=='jat:request'||!Number.isSafeInteger(m.id)||typeof m.method!=='string')return;
    const src=event.source;let r;
    try{r={type:'jat:response',id:m.id,ok:true,value:await api.analyticsInvoke(m.method,Array.isArray(m.args)?m.args:[])};}catch(e){r={type:'jat:response',id:m.id,ok:false,error:String(e&&e.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,'')};}
    try{src.postMessage(r,'*');}catch{}
  });
  api.onAnalyticsEvent(ev=>{
    if(!ev)return;
    if(aFrame&&aFrame.contentWindow)try{aFrame.contentWindow.postMessage({type:'jat:event',channel:ev.channel,payload:ev.payload},'*');}catch{}
    if(ev.channel==='juicy:authStatus')aStatus(ev.payload);
    if(ev.channel==='runtime:progress'){aRuntime.msg=`Step ${ev.payload.step} of ${ev.payload.steps}: ${ev.payload.message||''}`;const m=$('jcct-an-runtime-msg');if(m)m.textContent=aRuntime.msg;}
  });
  api.onAnalyticsChanged(applyAnalytics);
  api.analyticsInfo().then(applyAnalytics).catch(()=>applyAnalytics(null));
  switchTo('webpmaker');
})();
