// WebP Maker: the timeline of a merge. Pure functions with no DOM, so the same file is used by Juicy Blueprint Studio and the Creator Tool
// and is tested in Node. It does two things:
//   1. reads an animated WebP file's frame timing (parseWebp, frameIndexAt), and
//   2. plans which clip and which moment of it every output frame shows, including the cross-fade overlap between neighbours (plan).
(function (root) {
  'use strict';
  const MIN_CROSSFADE = 0.25;      // seconds: the shortest cross-fade the app accepts

  // ---- an animated WebP file: its size and how long each frame is shown ----
  function parseWebp(input) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    const ascii = (a, z) => String.fromCharCode(...b.subarray(a, z));
    if (b.length < 20 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') throw new Error('This is not a WebP file.');
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const u24 = o => b[o] | b[o + 1] << 8 | b[o + 2] << 16;
    let off = 12, animated = false, width = 0, height = 0;
    const frames = [];
    while (off + 8 <= b.length) {
      const tag = ascii(off, off + 4), size = dv.getUint32(off + 4, true), data = off + 8;
      if (tag === 'VP8X' && size >= 10) { animated = !!(b[data] & 0x02); width = u24(data + 4) + 1; height = u24(data + 7) + 1; }
      else if (tag === 'ANMF' && size >= 16 && data + 16 <= b.length) {
        const ms = u24(data + 12);
        frames.push({ms: ms > 0 ? ms : 100});     // a frame that says 0 ms is shown for 100 ms, as browsers do
      }
      off = data + size + (size & 1);
    }
    const starts = [];
    let total = 0;
    for (const f of frames) { starts.push(total); total += f.ms; }
    return {animated: animated && frames.length > 0, width, height, frames, starts, durationMs: total, duration: total / 1000};
  }
  // which frame of an animated WebP is on screen at tSeconds (the last one stays when the time is past the end)
  function frameIndexAt(starts, tSeconds) {
    if (!starts.length) return 0;
    const t = Math.max(0, tSeconds) * 1000;
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }

  // ---- the plan ----
  // durations: seconds of every clip, in order. fps: output frames per second. crossfade: seconds of overlap between neighbours (0 = none).
  // Returns {frames, counts, total, crossfade}. frames[k] = {clip, t, blend?}: output frame k shows clip `clip` at `t` seconds into it; when
  // `blend` is there it also shows the clip before it ({clip, t}) fading out while this one fades in: the picture is
  // (1 - alpha) * blend + alpha * clip. counts[i] = how many frames belong to clip i (the cross-fade frames belong to the clip fading IN), which
  // is what the encoder needs to treat each clip as its own scene.
  function plan({durations, fps, crossfade = 0}) {
    const n = durations.length;
    if (!n) throw new Error('Add at least one clip.');
    if (!(fps > 0)) throw new Error('Choose a frame rate.');
    const X = Number(crossfade) || 0, frames = [], counts = new Array(n).fill(0);
    if (!(X > 0 && n > 1)) {
      // no cross-fade (or nothing to fade between): every clip on its own frame grid, one after the other
      durations.forEach((d, i) => {
        const c = Math.max(1, Math.round(d * fps));
        for (let k = 0; k < c; k++) frames.push({clip: i, t: Math.min(Math.max(0, d - 0.002), (k + 0.5) / fps)});
        counts[i] = c;
      });
      return {frames, counts, total: durations.reduce((a, b) => a + b, 0), crossfade: 0};
    }
    if (X < MIN_CROSSFADE - 1e-9) throw new Error(`The cross-fade must be at least ${MIN_CROSSFADE} seconds.`);
    // every clip is overlapped by its neighbours: the first and last clip once, a clip in the middle twice (its start and its end must not meet)
    durations.forEach((d, i) => {
      const need = (i === 0 || i === n - 1) ? X : 2 * X;
      if (d < need - 1e-9) { const e = new Error(`Clip ${i + 1} is too short for a ${X} second cross-fade.`); e.clipIndex = i; e.need = need; e.have = d; throw e; }
    });
    const starts = [0];
    for (let i = 0; i < n - 1; i++) starts.push(starts[i] + durations[i] - X);
    const total = starts[n - 1] + durations[n - 1];
    const N = Math.max(n, Math.round(total * fps));
    for (let k = 0; k < N; k++) {
      const t = Math.min((k + 0.5) / fps, total - 0.001);
      let owner = n - 1;
      while (owner > 0 && starts[owner] > t) owner--;
      const local = (i, tt) => Math.min(Math.max(0, tt), durations[i] - 0.002);
      const item = {clip: owner, t: local(owner, t - starts[owner])};
      if (owner > 0 && t < starts[owner] + X) item.blend = {clip: owner - 1, t: local(owner - 1, t - starts[owner - 1]), alpha: (t - starts[owner]) / X};
      frames.push(item);
      counts[owner]++;
    }
    return {frames, counts, total, crossfade: X};
  }

  const api = {MIN_CROSSFADE, parseWebp, frameIndexAt, plan};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.webpTimeline = api;
})(typeof window !== 'undefined' ? window : globalThis);
