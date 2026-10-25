// Shared crop geometry for local video-to-WebP conversion.
// The freeform crop is stored per clip as normalized center + scale; it always
// preserves the requested output aspect ratio so faces are never stretched.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.webpFrameGeometry=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const ratios=Object.freeze({'16:9':16/9,'9:16':9/16,'3:4':3/4,'4:3':4/3,'1:1':1});
  const position=Object.freeze({center:[.5,.5],top:[.5,0],bottom:[.5,1],left:[0,.5],right:[1,.5]});
  const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
  const MIN_SCALE=.08;
  function outputSize(src,choice,w,h,crop){
    if(!src||!Number.isFinite(src.width)||!Number.isFinite(src.height)||src.width<2||src.height<2)
      throw new Error('Choose a video with valid dimensions first.');
    const width=choice==='custom'?Number(w):choice==='original'?src.width:Number(choice);
    const ratio=Object.hasOwn(ratios,crop)?ratios[crop]:src.width/src.height;
    const height=choice==='custom'?Number(h):Math.round(width/ratio);
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<480||height<2||width>4096||height>4096)
      throw new Error('Output width must be 480-4096 px and height must be 2-4096 px.');
    return {width,height};
  }
  function region(sw,sh,w,h,selection){
    if(![sw,sh,w,h].every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid crop geometry.');
    const maxW=Math.min(sw,sh*w/h),maxH=maxW*h/w;
    const scale=clamp(Number.isFinite(selection?.scale)?selection.scale:1,MIN_SCALE,1);
    const width=maxW*scale,height=maxH*scale;
    const halfX=width/(2*sw),halfY=height/(2*sh);
    const cx=clamp(Number.isFinite(selection?.cx)?selection.cx:.5,halfX,1-halfX);
    const cy=clamp(Number.isFinite(selection?.cy)?selection.cy:.5,halfY,1-halfY);
    return {sx:cx*sw-width/2,sy:cy*sh-height/2,sw:width,sh:height,
      dx:0,dy:0,dw:w,dh:h,cx,cy,scale};
  }
  function move(sw,sh,w,h,selection,dx,dy){
    const r=region(sw,sh,w,h,selection);
    const n=region(sw,sh,w,h,{cx:r.cx+dx,cy:r.cy+dy,scale:r.scale});
    return {cx:n.cx,cy:n.cy,scale:n.scale};
  }
  function resize(sw,sh,w,h,selection,corner,pointerX,pointerY){
    if(!['nw','ne','sw','se'].includes(corner))throw new Error('Invalid crop handle.');
    const r=region(sw,sh,w,h,selection),sx=corner.endsWith('e')?1:-1,sy=corner.startsWith('s')?1:-1;
    const fixedX=r.sx+(sx>0?0:r.sw),fixedY=r.sy+(sy>0?0:r.sh);
    const maxW=Math.min(sw,sh*w/h),maxH=maxW*h/w;
    const dx=(pointerX*sw-fixedX)*sx,dy=(pointerY*sh-fixedY)*sy;
    const suggested=(dx*maxW+dy*maxH)/(maxW*maxW+maxH*maxH);
    const maximum=Math.min(1,(sx>0?sw-fixedX:fixedX)/maxW,(sy>0?sh-fixedY:fixedY)/maxH);
    const scale=clamp(suggested,Math.min(MIN_SCALE,maximum),maximum);
    const n=region(sw,sh,w,h,{cx:(fixedX+sx*maxW*scale/2)/sw,
      cy:(fixedY+sy*maxH*scale/2)/sh,scale});
    return {cx:n.cx,cy:n.cy,scale:n.scale};
  }
  function rect(sw,sh,w,h,crop='fit',where='center',selection=null){
    if(![sw,sh,w,h].every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid crop dimensions.');
    if(crop==='freeform')return region(sw,sh,w,h,selection);
    const [ax,ay]=position[where]||position.center;
    if(crop==='fit'){
      const scale=Math.min(w/sw,h/sh),dw=sw*scale,dh=sh*scale;
      return {sx:0,sy:0,sw,sh,dx:(w-dw)/2,dy:(h-dh)/2,dw,dh};
    }
    const target=w/h,source=sw/sh;
    const cw=source>target?sh*target:sw,ch=source>target?sh:sw/target;
    return {sx:(sw-cw)*ax,sy:(sh-ch)*ay,sw:cw,sh:ch,dx:0,dy:0,dw:w,dh:h};
  }
  return {ratios,position,outputSize,rect,region,move,resize};
});
