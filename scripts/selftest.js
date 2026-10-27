'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=x=>fs.readFileSync(path.join(root,x),'utf8');
for(const file of ['main.js','preload.js','lib/webpMaker.js','lib/portableUpdater.js','lib/crashLog.js',
  'renderer/index.html','renderer/creator-tools.js','renderer/webpmaker.js','renderer/webpTimeline.js',
  'introduction-designer/index.html','introduction-designer/app.js','introduction-designer/layout.js',
  'introduction-designer/core.js','introduction-designer/creator-bridge.js',
  'assets/icon.png','assets/icon.ico', 'scripts/e2e-desktop.js'])
  assert(fs.existsSync(path.join(root,file)),`Missing application component ${file}`);
const html=read('renderer/index.html');
assert(html.includes('Juicy Chat Creator Tools')&&html.includes('WebP Maker')&&html.includes('Introduction Editor'));
assert(html.includes('id="jcct-introduction-frame"'),'Embedded editor iframe missing');
assert(read('introduction-designer/index.html').includes('layout.js'));
assert(read('introduction-designer/app.js').includes('applyArrangement'),'Smart snap engine not installed');
assert(read('introduction-designer/style.css').includes('[hidden]{display:none!important}'),'Image inspector visibility fix missing');
const app=require('../package.json');assert(/^\d+\.\d+\.\d+$/.test(app.version),'package.json version must look like 1.2.3');
assert(read('main.js').includes('CrashLog')&&read('renderer/index.html').includes('id="jcct-crash-log"'),'Crash log is not wired in');
assert(read('main.js').includes('WebpMaker')&&read('main.js').includes('createIntroService'));
const C=require('../introduction-designer/core');assert(C.verifyOutput(C.compile(C.initial(),{formatted:true})).valid);
console.log('Juicy Chat Creator Tools two-tab shell, source files, auto-update compatibility and introduction compiler checks passed.');
