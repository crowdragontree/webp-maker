// Shared, dependency-free sizing and cropping mathematics. No video is uploaded.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.webpFrameGeometry=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const ratios=Object.freeze({'16:9':16/9,'9:16':9/16,'3:4':3/4,'4:3':4/3,'1:1':1});
  const position=Object.freeze({center:[.5,.5],top:[.5,0],bottom:[.5,1],left:[0,.5],right:[1,.5]});
  const MIN_FREEFORM_SCALE=.08;
  const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
  function outputSize(source,size,customWidth,customHeight,crop){
    if(!source||!Number.isFinite(source.width)||!Number.isFinite(source.height)||source.width<2||source.height<2)
      throw new Error('Select a video with valid dimensions first.');
    const original=size==='original';
    const custom=size==='custom';
    const width=custom?Number(customWidth):original?source.width:Number(size);
    const ratio=Object.hasOwn(ratios,crop)?ratios[crop]:source.width/source.height;
    const height=custom?Number(customHeight):Math.round(width/ratio);
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<480||height<2||width>4096||height>4096)
      throw new Error('Output width must be 480-4096 px; height must be 2-4096 px.');
    return {width,height};
  }
  function validate(sourceWidth,sourceHeight,width,height){
    if(![sourceWidth,sourceHeight,width,height].every(v=>Number.isFinite(v)&&v>0))throw new Error('Invalid crop dimensions.');
  }
  // Per-clip freeform rectangle: normalized center and zoom scale. The rectangle
  // always matches output proportions, avoiding stretched or distorted frames.
  // Output dimensions can be any independently chosen width and height.
  function freeformRegion(sourceWidth,sourceHeight,width,height,selection=null){
    validate(sourceWidth,sourceHeight,width,height);
    const ratio=width/height;
    const maxWidth=Math.min(sourceWidth,sourceHeight*ratio);
    const maxHeight=maxWidth/ratio;
    const raw=Number(selection?.scale);
    const scale=Number.isFinite(raw)&&raw>0?clamp(raw,MIN_FREEFORM_SCALE,1):1;
    const sw=maxWidth*scale,sh=maxHeight*scale;
    const halfX=sw/(2*sourceWidth),halfY=sh/(2*sourceHeight);
    const x=Number(selection?.cx),y=Number(selection?.cy);
    const cx=clamp(Number.isFinite(x)?x:.5,halfX,1-halfX);
    const cy=clamp(Number.isFinite(y)?y:.5,halfY,1-halfY);
    return {sx:cx*sourceWidth-sw/2,sy:cy*sourceHeight-sh/2,sw,sh,dx:0,dy:0,dw:width,dh:height,cx,cy,scale};
  }
  function moveFreeform(sourceWidth,sourceHeight,width,height,selection,dx,dy){
    const current=freeformRegion(sourceWidth,sourceHeight,width,height,selection);
    const result=freeformRegion(sourceWidth,sourceHeight,width,height,{cx:current.cx+dx,cy:current.cy+dy,scale:current.scale});
    return {cx:result.cx,cy:result.cy,scale:result.scale};
  }
  // Resize from a corner while anchoring the opposite corner. Pointer
  // coordinates are normalized relative to the whole source, not the preview.
  function resizeFreeform(sourceWidth,sourceHeight,width,height,selection,corner,pointerX,pointerY){
    validate(sourceWidth,sourceHeight,width,height);
    if(!['nw','ne','sw','se'].includes(corner))throw new Error('Invalid crop resize handle.');
    const current=freeformRegion(sourceWidth,sourceHeight,width,height,selection);
    const signX=corner.endsWith('e')?1:-1,signY=corner.startsWith('s')?1:-1;
    const fixedX=(current.sx+(signX>0?0:current.sw));
    const fixedY=(current.sy+(signY>0?0:current.sh));
    const ratio=width/height;
    const maxWidth=Math.min(sourceWidth,sourceHeight*ratio),maxHeight=maxWidth/ratio;
    const offsetX=(pointerX*sourceWidth-fixedX)*signX;
    const offsetY=(pointerY*sourceHeight-fixedY)*signY;
    const desired=(offsetX*maxWidth+offsetY*maxHeight)/(maxWidth*maxWidth+maxHeight*maxHeight);
    const roomX=(signX>0?sourceWidth-fixedX:fixedX)/maxWidth;
    const roomY=(signY>0?sourceHeight-fixedY:fixedY)/maxHeight;
    const maximum=Math.min(1,roomX,roomY);
    const scale=clamp(desired,Math.min(MIN_FREEFORM_SCALE,maximum),maximum);
    const cropWidth=maxWidth*scale,cropHeight=maxHeight*scale;
    const result=freeformRegion(sourceWidth,sourceHeight,width,height,{
      cx:(fixedX+signX*cropWidth/2)/sourceWidth,
      cy:(fixedY+signY*cropHeight/2)/sourceHeight,
      scale
    });
    return {cx:result.cx,cy:result.cy,scale:result.scale};
  }
  function rect(sourceWidth,sourceHeight,width,height,crop='fit',where='center',selection=null){
    validate(sourceWidth,sourceHeight,width,height);
    if(crop==='freeform')return freeformRegion(sourceWidth,sourceHeight,width,height,selection);
    const [ax,ay]=position[where]||position.center;
    if(crop==='fit'){
      const scale=Math.min(width/sourceWidth,height/sourceHeight);
      const drawW=sourceWidth*scale,drawH=sourceHeight*scale;
      return {sx:0,sy:0,sw:sourceWidth,sh:sourceHeight,dx:(width-drawW)/2,dy:(height-drawH)/2,dw:drawW,dh:drawH};
    }
    const target=width/height,source=sourceWidth/sourceHeight;
    const sw=source>target?sourceHeight*target:sourceWidth;
    const sh=source>target?sourceHeight:sourceWidth/target;
    return {sx:(sourceWidth-sw)*ax,sy:(sourceHeight-sh)*ay,sw,sh,dx:0,dy:0,dw:width,dh:height};
  }
  return {ratios,outputSize,rect,freeformRegion,moveFreeform,resizeFreeform,MIN_FREEFORM_SCALE};
});
