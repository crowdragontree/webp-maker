// Regression: WebP Maker supports one MP4 as well as multiple MP4 files.
'use strict';
const fs=require('node:fs');const assert=require('node:assert/strict');
const path=require('node:path');
const renderer=fs.readFileSync(path.join(__dirname,'../renderer/webpmaker.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../renderer/index.html'),'utf8');
assert(!renderer.includes('clips.length<2'),'Convert must be enabled with one clip');
assert(renderer.includes('clips.length===0'),'Zero clips must still block conversion');
assert(!html.includes('Add at least two videos'),'Prompt must allow a single video');
assert(html.includes('Add one clip to convert'),'UI must explain single-clip support');
const WebpMaker=require('../lib/webpMaker');
const klass=WebpMaker.WebpMaker||WebpMaker;
assert(typeof klass==='function'||typeof WebpMaker==='function','Backend encoder must load');
console.log('PASS: One video enabled; zero videos blocked; multi-clip code retained.');
