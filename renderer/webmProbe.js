// EBML/WebM video metadata reader for AI-generated VP9 files mislabeled .mp4.
// Uses local Blob slices, never uploads files. Missing Duration is inferred from
// the last video block timestamp plus its observed frame interval.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.webpWebmProbe=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const ID={EBML:0x1a45dfa3,SEGMENT:0x18538067,INFO:0x1549a966,TRACKS:0x1654ae6b,
    TRACK:0xae,TRACKTYPE:0x83,TRACKNUMBER:0xd7,DEFAULTDURATION:0x23e383,
    CLUSTER:0x1f43b675,TIMESCALE:0x2ad7b1,DURATION:0x4489,
    CLUSTERTIME:0xe7,SIMPLEBLOCK:0xa3,BLOCKGROUP:0xa0,BLOCK:0xa1};
  const MAX_ELEMENTS=250000;
  const number=b=>b.reduce((n,x)=>n*256+x,0);
  function vint(bytes,at,keepMarker){
    if(at>=bytes.length)return null;
    const first=bytes[at];let bit=128,length=1;
    while(!(first&bit)&&length<=8){bit>>=1;length++;}
    if(length>8||at+length>bytes.length)return null;
    let value=keepMarker?first:first&(bit-1),unknown=!keepMarker&&value===bit-1;
    for(let i=1;i<length;i++){value=value*256+bytes[at+i];unknown=unknown&&bytes[at+i]===255;}
    if(unknown)return {value:null,len:length,unknown:true};
    return Number.isSafeInteger(value)?{value,len:length,unknown:false}:null;
  }
  async function bytes(file,at,size){return new Uint8Array(await file.slice(at,Math.min(file.size,at+size)).arrayBuffer());}
  async function head(file,at,limit){
    if(at+2>limit)return null;
    const raw=await bytes(file,at,16),id=vint(raw,0,true);
    if(!id||id.len>4)return null;
    const size=vint(raw,id.len,false);if(!size)return null;
    const start=at+id.len+size.len,end=size.unknown?limit:start+size.value;
    if(start>limit||end>limit||end<=at)return null;
    return {id:id.value,start,end,unknown:size.unknown};
  }
  async function readNumber(file,h){return h.end-h.start<=8?number(await bytes(file,h.start,h.end-h.start)):0;}
  async function scan(file,start,end,visit){
    let at=start,count=0;
    while(at<end&&count++<MAX_ELEMENTS){
      const h=await head(file,at,end);if(!h)break;
      await visit(h);if(h.end<=at)break;at=h.end;
    }
  }
  async function probeWebm(file){
    if(!file||!Number.isSafeInteger(file.size)||file.size<8)return {};
    if(number(await bytes(file,0,4))!==ID.EBML)return {};
    let segment=null;
    await scan(file,0,file.size,async h=>{if(h.id===ID.SEGMENT)segment=h;});
    if(!segment)return {container:'webm',duration:null};
    let scale=1000000,declared=null,videoTrack=null,defaultDuration=null;
    let lastPts=-1,lastDelta=0,blocks=0;
    const clusters=[];
    await scan(file,segment.start,segment.end,async h=>{
      if(h.id===ID.INFO)await scan(file,h.start,h.end,async n=>{
        if(n.id===ID.TIMESCALE){const v=await readNumber(file,n);if(v>0)scale=v;}
        if(n.id===ID.DURATION&&[4,8].includes(n.end-n.start)){
          const b=await bytes(file,n.start,n.end-n.start),d=new DataView(b.buffer,b.byteOffset,b.byteLength);
          const v=b.length===4?d.getFloat32(0,false):d.getFloat64(0,false);
          if(Number.isFinite(v)&&v>0)declared=v;
        }
      });
      if(h.id===ID.TRACKS)await scan(file,h.start,h.end,async n=>{
        if(n.id!==ID.TRACK)return;
        let id=null,type=null,frame=null;
        await scan(file,n.start,n.end,async t=>{
          if(t.id===ID.TRACKNUMBER)id=await readNumber(file,t);
          if(t.id===ID.TRACKTYPE)type=await readNumber(file,t);
          if(t.id===ID.DEFAULTDURATION)frame=await readNumber(file,t);
        });
        if(type===1){videoTrack=id;if(frame>0)defaultDuration=frame;}
      });
      if(h.id===ID.CLUSTER)clusters.push(h);
    });
    for(const c of clusters){
      let clusterTime=0;const relativeTimes=[];
      async function record(h){
        if(h.end-h.start<4)return;
        const b=await bytes(file,h.start,16),v=vint(b,0,false);
        if(!v||b.length<v.len+3||(videoTrack!==null&&v.value!==videoTrack))return;
        const raw=(b[v.len]<<8)|b[v.len+1];relativeTimes.push(raw>=32768?raw-65536:raw);
      }
      await scan(file,c.start,c.end,async h=>{
        if(h.id===ID.CLUSTERTIME)clusterTime=await readNumber(file,h);
        if(h.id===ID.SIMPLEBLOCK)await record(h);
        if(h.id===ID.BLOCKGROUP)await scan(file,h.start,h.end,async n=>{if(n.id===ID.BLOCK)await record(n);});
      });
      for(const relative of relativeTimes){
        const pts=clusterTime+relative;
        if(pts<0)continue;
        if(pts>lastPts){if(lastPts>=0&&pts-lastPts<10000)lastDelta=pts-lastPts;lastPts=pts;}
        blocks++;
      }
    }
    const unit=scale/1000000000;
    const ticks=defaultDuration?defaultDuration/scale:lastDelta;
    const inferred=lastPts>=0?(lastPts+ticks)*unit:null;
    const duration=Number.isFinite(declared)&&declared>0?declared*unit:inferred;
    return {container:'webm',duration:Number.isFinite(duration)&&duration>0&&duration<86400?duration:null,videoBlocks:blocks};
  }
  return {probeWebm};
});
