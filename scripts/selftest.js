'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
const renderer=fs.readFileSync(path.join(__dirname,'..','renderer','index.html'),'utf8');
const {WebpMaker,MAX_BYTES}=require('../lib/webpMaker');
assert.equal(MAX_BYTES,9990000);
assert(typeof WebpMaker==='function');
for(const x of ['wm-input','wm-preview','wm-fps','wm-quality','wm-size','wm-save','wm-expand','wm-crop','wm-crop-position','wm-crop-preview','wm-freeform-status','wm-freeform-reset','wm-width','wm-height'])assert(renderer.includes('id="'+x+'"'),x);
assert(main.includes('webpmaker:finish')&&main.includes('webpmaker:save'));
for(const name of ['test-clip-1.mp4','test-clip-2.mp4','comfy-webm-1.mp4','comfy-webm-2.mp4','comfy-webm-3.mp4']) {
  const file=path.join(__dirname,'..','tests','fixtures',name);
  assert(fs.statSync(file).size>1000,`Missing MP4 end-to-end test fixture: ${name}`);
}
assert(main.includes('--webp-e2e'),'Packaged end-to-end test entrypoint is missing');
assert(renderer.includes('id="wm-app-version"')&&renderer.includes('id="wm-update-check"')&&renderer.includes('id="wm-update-install"'), 'Version and update controls are missing.');
assert(main.includes('updates:check')&&main.includes('updates:install'), 'Electron update API is missing.');
assert(/^\d+\.\d+\.\d+$/.test(require('../package.json').version), 'Update version must use major.minor.patch.');
assert(typeof require('./e2e-desktop').inspectWebp==='function','WebP validator missing');
assert(fs.readFileSync(path.join(__dirname,'e2e-desktop.js'),'utf8').includes("['win32','linux'].includes(process.platform)"),'Linux packaged-app E2E support is missing');
console.log('Standalone WebP Maker self-test passed');
require('./metadata-selftest').catch(e=>{console.error(e);process.exitCode=1;});

require('./video-crop-selftest').catch(e=>{console.error(e);process.exitCode=1;});
require('./sevenzip-selftest');
