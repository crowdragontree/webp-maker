// Read-only WebM/Matroska metadata fallback for mislabeled .mp4 files (common in
// AI video exports). This reads small header slices; it never decodes frames or
// uses FFmpeg. A missing Segment Info/Duration is recovered from video blocks.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.webpWebmProbe=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const EBML=0x1a45dfa3,SEGMENT=0x18538067,INFO=0x1549a966,TRACKS=0x1654ae6b,
    TRACK=0xae,TRACKTYPE=0x83,TRACKNUMBER=0xd7,DEFAULTDURATION=0x23e383,
    CLUSTER=0x1f43b675,TIMESCALE=0x2ad7b1,DURATION=0x4489,
    CLUSTERTIME=0xe7,SIMPLEBLOCK=0xa3,BLOCKGROUP=0xa0,BLOCK=0xa1;
  const MAX_ITER=250000,MAX_READ=64;
  const asNumber=b=>{let n=0;for(const x of b)n=n*256+x;return n;};
  function vint(bytes,offset,keepMarker){
    if(offset>=bytes.length)return null;
    const first=bytes[offset];
    let bit=0x80,len=1;
    while(!(first&bit)&&len<=8){bit>>=1;len++;}
    if(len>8||!bit||offset+len>bytes.length)return null;
    let value=keepMarker?first:first&(bit-1);
    let unknown=!keepMarker&&(value===(bit-1));
    for(let i=1;i<len;i++){
      value=value*256+bytes[offset+i];
      unknown=unknown&&bytes[offset+i]===255;
    }
    if(unknown)return {value:null,len,unknown:true};
    if(!Number.isSafeInteger(value))return null;
    return {value,len,unknown:false};
  }
  async function read(file,offset,count){
    return new Uint8Array(await file.slice(offset,Math.min(file.size,offset+count)).arrayBuffer());
  }
  async function head(file,offset,limit){
    if(offset+2>limit)return null;
    const b=await read(file,offset,MAX_READ);
    const id=vint(b,0,true);if(!id||id.len>4)return null;
    const size=vint(b,id.len,false);if(!size)return null;
    const start=offset+id.len+size.len;
    const end=size.unknown?limit:start+size.value;
    if(start>limit||end>limit||end<=offset)return null;
    return {id:id.value,start,end,unknown:size.unknown};
  }
  async function number(file,h){return h.end-h.start<=8?asNumber(await read(file,h.start,h.end-h.start)):0;}
  async function scan(file,start,end,fn){
    let at=start,n=0;
    while(at<end&&n++<MAX_ITER){
      const h=await head(file,at,end);if(!h)break;
      await fn(h);
      // EBML may encode an unknown-length Segment or Cluster. Segment uses EOF.
      if(h.end<=at)break;
      at=h.end;
    }
  }
  async function probeWebm(file){
    if(!file||!Number.isSafeInteger(file.size)||file.size<8)return {};
    const signature=await read(file,0,4);
    if(signature.length!==4||asNumber(signature)!==EBML)return {};
    let segment=null;
    await scan(file,0,file.size,async h=>{if(h.id===SEGMENT)segment=h;});
    if(!segment)return {container:'webm',duration:null};
    let scale=1000000,declared=null,videoTrack=null,defaultDuration=null,lastPts=-1,prevPts=-1;
    const clusters=[];
    await scan(file,segment.start,segment.end,async h=>{
      if(h.id===INFO){
        await scan(file,h.start,h.end,async node=>{
          if(node.id===TIMESCALE){const n=await number(file,node);if(n>0)scale=n;}
          if(node.id===DURATION&&[4,8].includes(node.end-node.start)){
            const bytes=await read(file,node.start,node.end-node.start);
            const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
            const val=bytes.length===4?dv.getFloat32(0,false):dv.getFloat64(0,false);
            if(Number.isFinite(val)&&val>0)declared=val;
          }
        });
      }
      if(h.id===TRACKS){
        await scan(file,h.start,h.end,async node=>{
          if(node.id!==TRACK)return;
          let numberValue=null,type=null,frameLength=null;
          await scan(file,node.start,node.end,async field=>{
            if(field.id===TRACKNUMBER)numberValue=await number(file,field);
            if(field.id===TRACKTYPE)type=await number(file,field);
            if(field.id===DEFAULTDURATION)frameLength=await number(file,field);
          });
          if(type===1){videoTrack=numberValue;if(frameLength>0)defaultDuration=frameLength;}
        });
      }
      if(h.id===CLUSTER)clusters.push(h);
    });
    let lastDelta=0,blocks=0;
    for(const cluster of clusters){
      let clusterTime=0;
      // Cluster Timestamp is normally first, but read all headers without
      // loading entire video data or embedded ComfyUI PROMPT tags.
      const packets=[];
      async function recordBlock(h){
        if(h.end-h.start<4)return;
        const b=await read(file,h.start,16);
        const track=vint(b,0,false);if(!track||b.length<track.len+3)return;
        if(videoTrack!==null&&track.value!==videoTrack)return;
        const raw=(b[track.len]<<8)|b[track.len+1];
        const relative=raw>=32768?raw-65536:raw;
        packets.push(relative);
      }
      await scan(file,cluster.start,cluster.end,async h=>{
        if(h.id===CLUSTERTIME)clusterTime=await number(file,h);
        if(h.id===SIMPLEBLOCK)await recordBlock(h);
        if(h.id===BLOCKGROUP)await scan(file,h.start,h.end,async n=>{if(n.id===BLOCK)await recordBlock(n);});
      });
      for(const relative of packets){
        const pts=clusterTime+relative;
        if(pts>=0){
          if(pts>lastPts){if(lastPts>=0&&pts-lastPts<5000)lastDelta=pts-lastPts;prevPts=lastPts;lastPts=pts;}
          blocks++;
        }
      }
    }
    const unit=scale/1000000000;
    const ticks=Number.isFinite(defaultDuration)&&defaultDuration>0?defaultDuration/scale:lastDelta||
      (lastPts>0&&prevPts>=0?lastPts-prevPts:0);
    const inferred=lastPts>=0?(lastPts+ticks)*unit:null;
    const duration=Number.isFinite(declared)&&declared>0?declared*unit:inferred;
    return {container:'webm',duration:Number.isFinite(duration)&&duration>0&&duration<86400?duration:null,
      videoBlocks:blocks};
  }
  return {probeWebm};
});
