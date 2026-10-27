'use strict';
/* A WebP that is over 9.99 MB: the error says the real size, the too-big file is kept (not deleted) so it can be previewed and saved
   (right-click > Save image as), and a retry that fits clears it. ImageMagick is replaced by a fake that writes still frames of a chosen size. */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const {WebpMaker, MAX_BYTES} = require(path.join(__dirname, '..', 'lib', 'webpMaker.js'));
(async () => {
  if (process.platform === 'win32') { console.log('WebP oversize self-test skipped on Windows (it uses a fake ImageMagick script).'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jbs-over-'));
  const fake = path.join(tmp, 'fake-magick');
  fs.writeFileSync(fake, `#!/usr/bin/env node
const fs=require('fs'),a=process.argv.slice(2),end=a.indexOf('+adjoin'),names=a.slice(a.indexOf('-quality')+2,end),pat=a[a.length-1];
const n=+process.env.FAKE_STILL_BYTES,payload=Buffer.alloc(n,7),h=Buffer.alloc(8);h.write('VP8L',0,4,'ascii');h.writeUInt32LE(n,4);
const body=Buffer.concat([Buffer.from('WEBP'),h,payload,Buffer.alloc(n%2)]),riff=Buffer.alloc(8);riff.write('RIFF',0,4,'ascii');riff.writeUInt32LE(body.length,4);
names.forEach((_,i)=>fs.writeFileSync(pat.replace('%06d',String(i).padStart(6,'0')),Buffer.concat([riff,body])));
`, {mode: 0o755});
  process.env.JBS_WEBP_MAGICK = fake;
  const maker = new WebpMaker({appRoot: tmp, userData: tmp, onProgress() {}});
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(40)]);
  const run = async still => {
    process.env.FAKE_STILL_BYTES = String(still);
    maker.begin({width: 480, height: 480, fps: 20, quality: 60, expectedFrames: 20, clipFrames: [20], sourceKey: '1'});
    if (!maker.job.cached) for (let i = 0; i < 20; i++) maker.frame(png);
    return maker.finish();
  };

  // 1. 20 frames of about 600 KB: about 12 MB, over the limit even at the floor (20 FPS, quality 60)
  await assert.rejects(run(600000), e => {
    assert(/still exceeds 9\.99 MB: the file is 1[12]\.\d\d MB at 20 FPS and quality 60, [12]\.\d\d MB over the limit/.test(e.message), 'the message states the real size: ' + e.message);
    return true;
  });
  assert.strictEqual(maker.resultPath(), null, 'a too-big file is never a valid result');
  assert.throws(() => maker.preview(), /Convert an animation/);
  assert.throws(() => maker.save(path.join(tmp, 'no.webp')), /No valid WebP/);
  const p = maker.preview(true);
  assert(p.oversize === true && p.bytes > MAX_BYTES && p.data.startsWith('data:image/webp;base64,'), 'the too-big file is kept and can be previewed');
  const dest = path.join(tmp, 'saved.webp'), s = maker.save(dest, true);
  assert(s.saved && fs.statSync(dest).size === p.bytes, 'right-click > Save image as writes the kept file');

  // 2. the retry uses the kept PNG frames, fits, and the too-big file is gone
  const r = await run(100000);
  assert(r.bytes <= MAX_BYTES, 'the retry fits');
  assert.strictEqual(maker.oversize, null);
  assert(fs.statSync(maker.output).size <= MAX_BYTES && maker.resultPath() === maker.output, 'the result on disk is the one that fits');
  assert.strictEqual(maker.preview(true).oversize, false);
  maker.dispose(); fs.rmSync(tmp, {recursive: true, force: true});
  console.log('WebP oversize self-test passed: the error names the real size; the too-big file is kept for Save image as; a retry that fits clears it.');
})().catch(e => { console.error(e); process.exit(1); });
