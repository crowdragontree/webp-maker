'use strict';
/* The merge timeline: frame counts, the cross-fade overlap (minimum 0.25 s) and reading an animated WebP's frame timing. */
const assert = require('assert'), path = require('path');
const T = require(path.join(__dirname, '..', 'renderer', 'webpTimeline.js'));
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-9, `${m || ''}: ${a} vs ${b}`);

// 1. without a cross-fade the plan is exactly what WebP Maker always did: every clip on its own grid, round(seconds * fps) frames, sampled mid-frame
{
  const p = T.plan({durations: [2, 3.04], fps: 24});
  assert.deepStrictEqual(p.counts, [48, 73]);
  assert.strictEqual(p.frames.length, 121);
  near(p.frames[0].t, 0.5 / 24); near(p.frames[47].t, 47.5 / 24); near(p.frames[48].t, 0.5 / 24, 'second clip restarts');
  assert(p.frames.every(f => !f.blend), 'no blending without a cross-fade');
  assert.strictEqual(p.crossfade, 0);
  assert.strictEqual(T.plan({durations: [1, 1], fps: 24, crossfade: 0.5}).crossfade, 0.5);
}
// 2. one clip: a cross-fade has nothing to fade between and is ignored
{
  const p = T.plan({durations: [2], fps: 24, crossfade: 0.5});
  assert.strictEqual(p.frames.length, 48); assert.strictEqual(p.crossfade, 0);
}
// 3. two clips with a 0.5 s cross-fade: 2 + 3 - 0.5 = 4.5 s = 108 frames; the 12 frames of the overlap fade the first clip out and the second in
{
  const p = T.plan({durations: [2, 3], fps: 24, crossfade: 0.5});
  near(p.total, 4.5, 'total length'); assert.strictEqual(p.frames.length, 108);
  const blended = p.frames.filter(f => f.blend);
  assert.strictEqual(blended.length, 12, 'half a second at 24 FPS');
  let last = 0;
  for (const f of blended) { assert.strictEqual(f.clip, 1); assert.strictEqual(f.blend.clip, 0); assert(f.blend.alpha > last && f.blend.alpha < 1, 'alpha rises from 0 to 1, never touching either end'); last = f.blend.alpha; }
  near(blended[0].blend.alpha, 0.5 / 12); near(blended[11].blend.alpha, 11.5 / 12);
  // the outgoing clip is in its last half second while the incoming one is in its first
  for (const f of blended) { assert(f.blend.t >= 1.5 - 1e-9 && f.blend.t < 2, 'outgoing clip: last 0.5 s'); assert(f.t >= 0 && f.t < 0.5, 'incoming clip: first 0.5 s'); }
  // before the overlap only clip 0, after it only clip 1
  assert(p.frames.slice(0, 36).every(f => f.clip === 0 && !f.blend) && p.frames.slice(48).every(f => f.clip === 1 && !f.blend));
  assert.deepStrictEqual(p.counts, [36, 72], 'the cross-fade frames belong to the clip fading in');
  assert.strictEqual(p.counts.reduce((a, b) => a + b, 0), p.frames.length);
  // the picture never jumps: the fade starts from the outgoing clip's own picture and ends on the incoming clip's own picture
  near(p.frames[35].t, 35.5 / 24); near(p.frames[36].blend.t, 36.5 / 24);
}
// 4. three clips: the middle one is overlapped on both sides and needs at least twice the cross-fade
{
  const p = T.plan({durations: [2, 1, 2], fps: 24, crossfade: 0.5});
  near(p.total, 4, 'total'); assert.strictEqual(p.frames.length, 96);
  assert.strictEqual(p.frames.filter(f => f.blend).length, 24);
  assert(p.counts.every(c => c >= 1) && p.counts.reduce((a, b) => a + b, 0) === 96);
  assert.throws(() => T.plan({durations: [2, 0.9, 2], fps: 24, crossfade: 0.5}), e => e.clipIndex === 1 && e.need === 1 && e.have === 0.9, 'a middle clip shorter than 2 x the cross-fade');
  assert.throws(() => T.plan({durations: [0.4, 2], fps: 24, crossfade: 0.5}), e => e.clipIndex === 0 && e.need === 0.5, 'the first clip shorter than the cross-fade');
  assert.throws(() => T.plan({durations: [2, 0.4], fps: 24, crossfade: 0.5}), e => e.clipIndex === 1);
}
// 5. the cross-fade is never shorter than 0.25 s
{
  assert.throws(() => T.plan({durations: [2, 2], fps: 24, crossfade: 0.2}), /at least 0\.25/);
  assert.doesNotThrow(() => T.plan({durations: [2, 2], fps: 24, crossfade: 0.25}));
  assert.strictEqual(T.MIN_CROSSFADE, 0.25);
  assert.strictEqual(T.plan({durations: [2, 2], fps: 19, crossfade: 0.25}).frames.filter(f => f.blend).length, 5, 'at the lowest FPS the shortest fade still has frames to fade with');
}
// 6. images: three pictures of 2 s each with a 0.5 s cross-fade (two joins) = 6 - 1 = 5 s
{
  const p = T.plan({durations: [2, 2, 2], fps: 20, crossfade: 0.5});
  near(p.total, 5); assert.strictEqual(p.frames.length, 100);
  assert.strictEqual(p.frames.filter(f => f.blend).length, 20, 'two joins of 10 frames');
}
// 7. every clip keeps frames at any frame rate and fade length
for (const fps of [19, 24, 30, 60]) for (const x of [0.25, 0.5, 1]) {
  const d = [3, 2.5, 4, 2];
  const p = T.plan({durations: d, fps, crossfade: x});
  assert(p.counts.every(c => c >= 1), `fps ${fps} fade ${x}`);
  assert.strictEqual(p.counts.reduce((a, b) => a + b, 0), p.frames.length);
  for (const f of p.frames) { assert(f.t >= 0 && f.t < d[f.clip]); if (f.blend) assert(f.blend.t >= 0 && f.blend.t < d[f.blend.clip] && f.blend.alpha >= 0 && f.blend.alpha < 1); }
}

// 8. reading an animated WebP's timing (a container with three frames of 100, 250 and 0 ms)
{
  const chunk = (tag, data) => { const pad = data.length & 1; const b = Buffer.alloc(8 + data.length + pad); b.write(tag, 0, 'ascii'); b.writeUInt32LE(data.length, 4); data.copy(b, 8); return b; };
  const u24 = (b, o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; };
  const vp8x = Buffer.alloc(10); vp8x[0] = 0x02; u24(vp8x, 4, 479); u24(vp8x, 7, 269);
  const frame = ms => { const h = Buffer.alloc(16); u24(h, 6, 479); u24(h, 9, 269); u24(h, 12, ms); return chunk('ANMF', Buffer.concat([h, chunk('VP8L', Buffer.alloc(11, 1))])); };
  const body = Buffer.concat([Buffer.from('WEBP'), chunk('VP8X', vp8x), chunk('ANIM', Buffer.alloc(6)), frame(100), frame(250), frame(0)]);
  const riff = Buffer.alloc(8); riff.write('RIFF', 0, 'ascii'); riff.writeUInt32LE(body.length, 4);
  const file = Buffer.concat([riff, body]);
  const info = T.parseWebp(file);
  assert.strictEqual(info.animated, true); assert.strictEqual(info.width, 480); assert.strictEqual(info.height, 270);
  assert.deepStrictEqual(info.frames.map(f => f.ms), [100, 250, 100], 'a 0 ms frame is shown for 100 ms');
  assert.deepStrictEqual(info.starts, [0, 100, 350]); near(info.duration, 0.45);
  assert.deepStrictEqual([0, 0.05, 0.1, 0.34, 0.35, 0.44, 9].map(t => T.frameIndexAt(info.starts, t)), [0, 0, 1, 1, 2, 2, 2]);
  // a still WebP and a file that is not a WebP
  const still = Buffer.concat([riff, Buffer.concat([Buffer.from('WEBP'), chunk('VP8L', Buffer.alloc(20, 1))])]);
  assert.strictEqual(T.parseWebp(still).animated, false);
  assert.throws(() => T.parseWebp(Buffer.from('GIF89a'.repeat(10))), /not a WebP/);
}
console.log('WebP timeline self-test passed: frame plan, cross-fade overlap and the 0.25 s minimum, and animated WebP timing.');
