'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {probeMp4} = require('../renderer/mp4Probe');

const box = (name, data) => { const hdr=Buffer.alloc(8); hdr.writeUInt32BE(data.length+8,0); hdr.write(name,4,4,'ascii'); return Buffer.concat([hdr,data]); };
function makeFixture(fragmented=false) {
  const mvhd=Buffer.alloc(20);mvhd.writeUInt32BE(1000,12);mvhd.writeUInt32BE(fragmented?0:2000,16);
  const tkhd=Buffer.alloc(84);tkhd.writeUInt32BE(1,12);tkhd.writeUInt32BE(480*65536,76);tkhd.writeUInt32BE(640*65536,80);
  const mdhd=Buffer.alloc(20);mdhd.writeUInt32BE(24000,12);mdhd.writeUInt32BE(fragmented?0:48000,16);
  const hdlr=Buffer.alloc(12);hdlr.write('vide',8);
  const stts=Buffer.alloc(16);stts.writeUInt32BE(1,4);stts.writeUInt32BE(48,8);stts.writeUInt32BE(1000,12);
  const mdia=box('mdia',Buffer.concat([box('mdhd',mdhd),box('hdlr',hdlr),box('minf',box('stbl',box('stts',stts)))]));
  const trak=box('trak',Buffer.concat([box('tkhd',tkhd),mdia]));
  const trex=Buffer.alloc(24);trex.writeUInt32BE(1,4);trex.writeUInt32BE(1000,12);
  const mvex=fragmented?box('mvex',box('trex',trex)):Buffer.alloc(0);
  const moov=box('moov',Buffer.concat([box('mvhd',mvhd),trak,mvex]));
  const ftyp=box('ftyp',Buffer.from('isom0000'));
  if(!fragmented) return Buffer.concat([ftyp,box('mdat',Buffer.from('0123456789')),moov]);
  const tfhd=Buffer.alloc(8);tfhd.writeUInt32BE(1,4);
  const trun=Buffer.alloc(8);trun.writeUInt32BE(48,4);
  const moof=box('moof',box('traf',Buffer.concat([box('tfhd',tfhd),box('trun',trun)])));
  return Buffer.concat([ftyp,moov,moof,box('mdat',Buffer.from('0123456789'))]);
}
function asFile(buffer) {
  return {size:buffer.length,name:'clip.mp4',lastModified:2,
    slice:(start,end)=>new Blob([buffer.subarray(start,end)])};
}
async function run() {
  for(const fragmented of [false,true]) {
    const probe=await probeMp4(asFile(makeFixture(fragmented)));
    assert.deepStrictEqual(probe,{width:480,height:640,duration:2},'MP4 header metadata '+fragmented);
  }
  const source=fs.readFileSync(path.join(__dirname,'..','renderer','webpmaker.js'),'utf8');
  const start=source.indexOf('  function loadMetadata(file){');
  const end=source.indexOf('  async function addFiles(files){',start);
  assert(start>0&&end>start,'metadata loader exists');
  const makeLoader=new Function('env',`const document=env.document, URL=env.URL, window=env.window; let clipInstanceSerial=0; ${source.slice(start,end)}; return loadMetadata;`);
  async function simulate({duration,probeResult={},late=false,unsupported=false}) {
    class Video extends EventTarget {
      constructor(){super();this.readyState=0;this.duration=duration;this.videoWidth=480;this.videoHeight=640;this.seekable={length:0};}
      load(){if(!this.src||this.queued)return;this.queued=true;setTimeout(()=>{
        this.readyState=1;
        if(unsupported){this.error={code:4};this.dispatchEvent(new Event('error'));return;}
        this.dispatchEvent(new Event('loadedmetadata'));
        if(late)setTimeout(()=>{this.duration=2;this.dispatchEvent(new Event('durationchange'));},5);
      },0);}
      removeAttribute(k){if(k==='src')this.src='';}
    }
    const env={window:{webpMp4Probe:{probeMp4:async()=>probeResult}},
      document:{createElement:()=>new Video()},
      URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}}};
    return makeLoader(env)(asFile(makeFixture()));
  }
  assert.strictEqual((await simulate({duration:2})).duration,2,'normal video');
  assert.strictEqual((await simulate({duration:Infinity,probeResult:{duration:2}})).duration,2,'Infinity duration fallback');
  assert.strictEqual((await simulate({duration:NaN,late:true})).duration,2,'late durationchange');
  await assert.rejects(simulate({duration:NaN,unsupported:true}),/Unsupported or unreadable video format/,'codec feedback');
  console.log('MP4 metadata fallback tests passed');
}
module.exports=run();
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1;});
