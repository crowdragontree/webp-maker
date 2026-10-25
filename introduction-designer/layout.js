'use strict';
/* Collision-aware, grid-snapped Introduction canvas. Pure data helpers for
 * browser + Node tests; no UI libraries or runtime dependencies. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IntroLayout=api;
})(typeof window!=='undefined'?window:null,function(){
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const MAX_HEIGHT=3000,DEFAULT_GAP=10;
  const asNum=(n,d)=>Number.isFinite(Number(n))?Number(n):d;
  function region(p){return {x:asNum(p?.x,5),y:asNum(p?.y,0),w:asNum(p?.w,90),h:asNum(p?.h,80)};}
  function bounds(p){const r=region(p);return {...r,right:r.x+r.w,bottom:r.y+r.h};}
  function overlap(a,b,gapY=DEFAULT_GAP,gapX=1){
    const p=bounds(a),q=bounds(b);
    return p.x<q.right+gapX && q.x<p.right+gapX && p.y<q.bottom+gapY && q.y<p.bottom+gapY;
  }
  // Editor-like smart guides: align the selected left / center / right and
  // top / middle / bottom with the canvas and unselected elements. These
  // guides change only the selected element and do not behave like a grid lock.
  function alignedEdge(value,anchors,targets,tolerance){
    let best=null;
    for(const anchor of anchors){
      for(const target of targets){
        const delta=target.value-anchor.value;
        const distance=Math.abs(delta);
        if(distance>tolerance)continue;
        if(!best||distance<best.distance || (distance===best.distance&&target.priority>best.priority)){
          best={delta,distance,position:target.value,source:target.source,priority:target.priority,edge:anchor.label};
        }
      }
    }
    return best;
  }
  function snap(candidate,others,opts={}){
    const p=region(candidate),peers=others.map(bounds);
    const xTargets=[{value:0,source:'canvas',priority:1},{value:50,source:'canvas',priority:2},{value:100,source:'canvas',priority:1}],
      yTargets=[{value:0,source:'canvas',priority:1},{value:asNum(opts.canvasHeight,610)/2,source:'canvas',priority:2},{value:asNum(opts.canvasHeight,610),source:'canvas',priority:1}];
    for(const peer of peers){
      xTargets.push({value:peer.x,source:'element',priority:3},{value:(peer.x+peer.right)/2,source:'element',priority:3},{value:peer.right,source:'element',priority:3});
      yTargets.push({value:peer.y,source:'element',priority:3},{value:(peer.y+peer.bottom)/2,source:'element',priority:3},{value:peer.bottom,source:'element',priority:3});
    }
    const xAnchors=[{value:p.x,label:'left'},{value:p.x+p.w/2,label:'center'},{value:p.x+p.w,label:'right'}];
    const yAnchors=[{value:p.y,label:'top'},{value:p.y+p.h/2,label:'middle'},{value:p.y+p.h,label:'bottom'}];
    const x=alignedEdge(p.x,xAnchors,xTargets,opts.thresholdX??1.5);
    const y=alignedEdge(p.y,yAnchors,yTargets,opts.thresholdY??7);
    const placement={...p,x:clamp(Math.round(p.x+(x?.delta||0)),0,100-p.w),y:Math.max(0,Math.round(p.y+(y?.delta||0)))};
    const guides={x:x?{position:x.position,edge:x.edge,source:x.source}:null,y:y?{position:y.position,edge:y.edge,source:y.source}:null};
    return {placement,guides};
  }
  function snapResize(candidate,others,opts={}){
    const p=region(candidate),peers=others.map(bounds),direction=opts.handle||'se';
    const xTargets=[{value:0,source:'canvas',priority:1},{value:50,source:'canvas',priority:2},{value:100,source:'canvas',priority:1}];
    const yTargets=[{value:0,source:'canvas',priority:1},{value:asNum(opts.canvasHeight,610)/2,source:'canvas',priority:2},{value:asNum(opts.canvasHeight,610),source:'canvas',priority:1}];
    peers.forEach(peer=>{
      xTargets.push({value:peer.x,source:'element',priority:3},{value:peer.right,source:'element',priority:3},{value:(peer.x+peer.right)/2,source:'element',priority:3});
      yTargets.push({value:peer.y,source:'element',priority:3},{value:peer.bottom,source:'element',priority:3},{value:(peer.y+peer.bottom)/2,source:'element',priority:3});
    });
    const next={...p},guides={x:null,y:null};
    if(direction.includes('w')||direction.includes('e')){
      const west=direction.includes('w');
      const moving=west?p.x:p.x+p.w;
      const result=alignedEdge(moving,[{value:moving,label:west?'left':'right'}],xTargets,opts.thresholdX??1.5);
      if(result){
        const edge=clamp(Math.round(moving+result.delta),0,100);
        if(west){const right=p.x+p.w;next.x=clamp(edge,0,right-5);next.w=right-next.x;}
        else next.w=clamp(edge-p.x,5,100-p.x);
        guides.x={position:result.position,edge:result.edge,source:result.source};
      }
    }
    if(direction.includes('n')||direction.includes('s')){
      const north=direction.includes('n');
      const moving=north?p.y:p.y+p.h;
      const result=alignedEdge(moving,[{value:moving,label:north?'top':'bottom'}],yTargets,opts.thresholdY??7);
      if(result){
        const edge=Math.max(0,Math.round(moving+result.delta));
        if(north){const bottom=p.y+p.h;next.y=clamp(edge,0,bottom-24);next.h=bottom-next.y;}
        else next.h=clamp(edge-p.y,24,1200);
        guides.y={position:result.position,edge:result.edge,source:result.source};
      }
    }
    return {placement:next,guides};
  }
  function normalize(p){
    const r=region(p);r.w=clamp(Math.round(r.w),5,100);r.x=clamp(Math.round(r.x),0,100-r.w);
    r.h=clamp(Math.round(r.h),24,1200);r.y=clamp(Math.round(r.y),0,MAX_HEIGHT-r.h);
    return r;
  }
  // Editing an element moves ONLY that element. Existing blocks are anchors:
  // snap the selection into nearby free space without shuffling anything else.
  // New designs can still be normalized once (focusId=null) on initial load.
  function arrange(blocks,focusId,proposal,height=610,opts={}){
    const placements=new Map();
    const list=(blocks||[]).filter(b=>b&&b.id).map((b,index)=>({id:b.id,p:normalize(b.placement),index}));
    if(!list.length)return {placements,height:Math.max(240,height),ok:true,guides:{}};
    const focus=focusId&&list.find(e=>e.id===focusId)||null;
    let guides={};
    if(focus){
      let desired=normalize(proposal||focus.p);
      if(opts.snap!==false){const snapped=opts.action==='resize'?snapResize(desired,list.filter(e=>e!==focus).map(e=>e.p),{...opts,canvasHeight:height}):snap(desired,list.filter(e=>e!==focus).map(e=>e.p),{...opts,canvasHeight:height});desired=normalize(snapped.placement);guides=snapped.guides;}
      placements.set(focus.id,desired);
    }
    if(focus){
      const peers=list.filter(e=>e!==focus).map(e=>e.p);
      const desired=placements.get(focus.id);
      const occupied=p=>peers.some(q=>overlap(p,q));
      // Free position genuinely means free: the pointer follows the mouse,
      // including when crossing another element. Nothing else moves.
      // People who prefer non-overlapping layouts can enable the optional
      // overlap prevention mode (applied at drop, not each pointer movement).
      if(occupied(desired) && opts.collision==='reject'){
        for(const peer of list.filter(e=>e!==focus))placements.set(peer.id,peer.p);
        return {placements,height,ok:false,reason:'Overlap prevention is on. Move into a free space or turn off Prevent overlap.'};
      }
      if(occupied(desired) && opts.collision==='avoid'){
        const xs=new Set([desired.x,0,100-desired.w]),ys=new Set([desired.y,0]);
        for(const other of peers){
          xs.add(other.x+other.w+1);xs.add(other.x-desired.w-1);
          ys.add(other.y+other.h+DEFAULT_GAP);ys.add(other.y-desired.h-DEFAULT_GAP);
        }
        const validXs=[...xs].filter(x=>x>=0&&x+desired.w<=100).map(Math.round);
        const validYs=[...ys].filter(y=>y>=0&&y+desired.h<=MAX_HEIGHT).map(Math.round);
        let best=null,bestCost=Infinity;
        for(const x of validXs)for(const y of validYs){
          const candidate={...desired,x,y};
          const cost=Math.abs(x-desired.x)*5+Math.abs(y-desired.y);
          if(cost<bestCost&&!occupied(candidate)){best=candidate;bestCost=cost;}
        }
        if(best)placements.set(focus.id,best);
      }
      // Existing blocks are immutable peers during any selected edit.
      for(const peer of list.filter(e=>e!==focus))placements.set(peer.id,peer.p);
      const maxBottom=Math.max(...[...placements.values()].map(p=>p.y+p.h),240);
      return {placements,height:Math.min(MAX_HEIGHT,Math.max(Number(height)||610,maxBottom+35)),ok:true,guides};
    }
    const rest=list.filter(e=>e!==focus).sort((a,b)=>a.p.y-b.p.y||a.index-b.index);
    for(const el of rest){
      const candidate={...el.p};
      // Only shift vertically. Keeping each element's left/width intact means
      // users can place independent columns beside each other.
      for(let steps=0;steps<=list.length;steps++){
        const clashes=[...placements.values()].filter(q=>overlap(candidate,q));
        if(!clashes.length)break;
        const next=Math.max(...clashes.map(q=>q.y+q.h+DEFAULT_GAP));
        if(next<=candidate.y||next+candidate.h>MAX_HEIGHT) return {placements,height,ok:false,reason:'The canvas has reached its 3,000 px height limit.'};
        candidate.y=next;
      }
      if([...placements.values()].some(q=>overlap(candidate,q)))return {placements,height,ok:false,reason:'Unable to place all blocks without overlap.'};
      placements.set(el.id,candidate);
    }
    const maxBottom=Math.max(...[...placements.values()].map(p=>p.y+p.h),240);
    return {placements,height:Math.min(MAX_HEIGHT,Math.max(Number(height)||610,maxBottom+35)),ok:true,guides};
  }
  // Drag-and-drop interaction has two phases. During the pointer move, only the
  // active element follows the cursor (arrange(..., collision:'free')). Once the
  // pointer is RELEASED, reserve its exact destination and move conflicting
  // neighbors downward, cascading only through subsequent collisions.
  // Nothing is pushed during the pointer move, and the dragged object is never
  // relocated behind the user's back. Unaffected neighbors keep their positions.
  function makeRoom(blocks,focusId,proposal,height=610,opts={}){
    const list=(blocks||[]).filter(b=>b&&b.id).map((b,index)=>({id:b.id,p:normalize(b.placement),index}));
    const focus=list.find(b=>b.id===focusId);
    if(!focus)return {ok:false,placements:new Map(),height,reason:'Selected element was not found.'};
    const placements=new Map(list.map(b=>[b.id,{...b.p}]));
    const desired=normalize(proposal||focus.p);
    placements.set(focusId,desired);
    const peers=list.filter(b=>b.id!==focusId).sort((a,b)=>a.p.y-b.p.y||a.index-b.index);
    const queue=[focusId];const displaced=new Set();
    let operations=0;
    while(queue.length){
      const movingId=queue.shift(),anchor=placements.get(movingId);
      for(const peer of peers){
        if(peer.id===movingId)continue;
        const current=placements.get(peer.id);
        // Adjacent independent columns must not be shuffled.
        if(!overlap(anchor,current,opts.gap??DEFAULT_GAP,0))continue;
        const nextY=Math.ceil(anchor.y+anchor.h+(opts.gap??DEFAULT_GAP));
        if(nextY<=current.y)continue;
        if(nextY+current.h>MAX_HEIGHT)return {ok:false,placements:new Map(),height,
          reason:'There is not enough canvas space to make room. Increase space or reduce element sizes.'};
        placements.set(peer.id,{...current,y:nextY});
        displaced.add(peer.id);queue.push(peer.id);
        if(++operations>list.length*list.length*2)return {ok:false,placements:new Map(),height,
          reason:'Could not make room for all elements without overlap.'};
      }
    }
    const maxBottom=Math.max(240,...[...placements.values()].map(p=>p.y+p.h));
    return {ok:true,placements,height:Math.min(MAX_HEIGHT,Math.max(Number(height)||610,maxBottom+35)),
      guides:{},displaced:[...displaced]};
  }
  // Direction-aware slot reorder for MOVING an existing layer. Unlike
  // makeRoom() (useful when inserting a NEW layer), this fills the vacated
  // slot with elements the dragged layer passed. Moving down shifts those
  // elements UP; moving up shifts them DOWN. Side-by-side elements that form
  // one row move together. No peer changes until pointerup / drop.
  function reorderDrop(blocks,focusId,proposal,height=610,opts={}){
    const list=(blocks||[]).filter(b=>b&&b.id).map((b,index)=>({id:b.id,p:normalize(b.placement),index}));
    const focus=list.find(b=>b.id===focusId);
    if(!focus)return {ok:false,placements:new Map(),height,reason:'Selected element was not found.'};
    const placements=new Map(list.map(b=>[b.id,{...b.p}]));
    const desired=normalize(proposal||focus.p);
    const old=focus.p;
    const delta=desired.y-old.y;
    const gap=Math.max(0,Number.isFinite(opts.gap)?opts.gap:DEFAULT_GAP);
    const yMid=p=>p.y+p.h/2;
    const horizontal=(a,b)=>a.x < b.x+b.w && b.x < a.x+a.w;
    const result=displaced=>{
      const maxBottom=Math.max(240,...[...placements.values()].map(p=>p.y+p.h));
      if(maxBottom>MAX_HEIGHT)return {ok:false,placements:new Map(),height,reason:'The design exceeds the 3,000 px canvas limit.'};
      // Do not validate old, knowingly overlapped imported layers as new
      // collisions. Validate that the newly positioned objects are clear.
      const moved=new Set([focusId,...displaced]);
      for(const a of list){
        if(!moved.has(a.id))continue;
        for(const b of list){
          if(a.id===b.id)continue;
          if(overlap(placements.get(a.id),placements.get(b.id),0,0)){
            return {ok:false,placements:new Map(),height,reason:'The drop cannot be reordered without covering another element. Try a nearby position.'};
          }
        }
      }
      return {ok:true,placements,height:Math.min(MAX_HEIGHT,Math.max(Number(height)||610,maxBottom+35)),guides:{},displaced};
    };
    if(Math.abs(delta)<1){
      placements.set(focusId,desired);
      return result([]);
    }
    const direction=delta>0?1:-1;
    const oldCenter=yMid(old),newCenter=yMid(desired);
    const crossed=list.filter(el=>{
      if(el.id===focusId)return false;
      const peer=el.p;
      // Keep columns independent: a peer must occupy the same vertical lane
      // at the original AND destination X position to inherit the old slot.
      if(!horizontal(old,peer)||!horizontal(desired,peer))return false;
      const center=yMid(peer);
      const verticalOverlap=Math.max(0,Math.min(desired.y+desired.h,peer.y+peer.h)-Math.max(desired.y,peer.y));
      // A large moving panel can cover most of a short row while its center
      // has not crossed that row's center. Treat a majority-covered row as
      // crossed, but ignore tiny corner intersections with tall paragraphs.
      const mostlyCovered=verticalOverlap>=peer.h*.5;
      if(direction>0)return center>oldCenter && (center<=newCenter||mostlyCovered);
      return center<oldCenter && (center>=newCenter||mostlyCovered);
    }).sort((a,b)=>a.p.y-b.p.y||a.index-b.index);
    // A small drop can partially overlap the NEXT row without crossing its
    // midpoint. Treat that as an insertion into the next slot instead of
    // pushing that row down or leaving an accidental overlap.
    if(!crossed.length){
      const touching=list.filter(el=>el.id!==focusId&&horizontal(old,el.p)&&horizontal(desired,el.p) &&
        (direction>0?yMid(el.p)>oldCenter:yMid(el.p)<oldCenter) &&
        overlap(desired,el.p,0,0)).sort((a,b)=>Math.abs(a.p.y-desired.y)-Math.abs(b.p.y-desired.y));
      if(touching.length)crossed.push(touching[0]);
    }
    if(!crossed.length){
      placements.set(focusId,desired);
      return result([]);
    }
    // A row may have two or more independent columns at the same Y. Keep
    // their relative positions intact rather than stacking them vertically.
    const rows=[];
    for(const el of crossed){
      const last=rows[rows.length-1];
      if(last&&el.p.y<last.bottom){
        last.members.push(el);
        last.bottom=Math.max(last.bottom,el.p.y+el.p.h);
      }else rows.push({top:el.p.y,bottom:el.p.y+el.p.h,members:[el]});
    }
    const focusRow={top:old.y,bottom:old.y+old.h,members:[focus]};
    const before=direction>0?[focusRow,...rows]:[...rows,focusRow];
    // Original inter-row gaps are kept at their slots, so the total affected
    // section keeps the same height and unrelated rows never drift.
    const gaps=before.slice(1).map((row,i)=>Math.max(0,row.top-before[i].bottom));
    const after=direction>0?[...rows,focusRow]:[focusRow,...rows];
    let cursor=before[0].top;
    for(let i=0;i<after.length;i++){
      const row=after[i];
      for(const item of row.members){
        if(item.id===focusId)placements.set(item.id,{...desired,y:cursor});
        else placements.set(item.id,{...item.p,y:cursor+(item.p.y-row.top)});
      }
      cursor+=row.bottom-row.top+(gaps[i]||0);
    }
    // If released in a truly empty gap beyond the crossed rows, preserve the
    // pointer's exact location when there is enough room to do so safely.
    const reorderedFocus=placements.get(focusId);
    if((direction>0&&desired.y>reorderedFocus.y)||(direction<0&&desired.y<reorderedFocus.y)){
      const alternative={...reorderedFocus,y:desired.y};
      if(!list.some(peer=>peer.id!==focusId&&overlap(alternative,placements.get(peer.id),gap,0))){
        placements.set(focusId,alternative);
      }
    }
    return result(crossed.map(el=>el.id));
  }
  return {snap,snapResize,normalize,region,overlap,arrange,makeRoom,reorderDrop,MAX_HEIGHT,DEFAULT_GAP};
});
