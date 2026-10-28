// Image Compressor (v1.2.6). Makes a PNG smaller than the size limit (1 MB = 1,000,000 bytes, so it fits under either meaning of "1 MB"),
// saved next to the source as <name>_compressed.png. No AI, no internet, no extra install: plain Node (zlib).
//
// It always tries the gentlest step first and stops at the first one that fits:
//   1. Lossless: the same pixels, packed better (best filters, strongest compression, metadata such as text and EXIF dropped; colour
//      profiles kept). Every pixel is identical to the original.
//   2. Near-lossless: every colour stays within ±1 to ±4 of the original (out of 255 levels), gentlest first. No dither, no banding,
//      transparency exact. You cannot see the difference.
//   3. 256 colours: the picture is redrawn with the 256 colours that suit it best, with fine dithering (how TinyPNG-style tools work).
//      Only when near-lossless still does not fit.
//   4. Smaller: only when 256 colours is still too big, the picture is scaled down in small steps until it fits.
// The result always says which step it took, so you know whether the pixels are untouched.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TARGET = 1000000;
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4};
const KEEP_CHUNKS = new Set(['sRGB', 'gAMA', 'cHRM', 'iCCP', 'cICP', 'pHYs']);     // what the colours look like, and the print size: kept

// ---------------------------------------------------------------- CRC / chunks
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// ---------------------------------------------------------------- decode (every PNG kind: grey, RGB, palette, alpha, 1 to 16 bits, interlaced)
function decode(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('This is not a PNG file.');
  let p = 8, ihdr = null, plte = null, trns = null; const idat = [], keep = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (p + 12 + len > buf.length) throw new Error('The PNG file is cut off (incomplete).');
    if (type === 'IHDR') ihdr = {width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12]};
    else if (type === 'PLTE') plte = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'acTL') throw new Error('This is an animated PNG. Compressing it would keep only its first frame, so it was left alone.');
    else if (KEEP_CHUNKS.has(type)) keep.push({type, data: Buffer.from(data)});
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!ihdr) throw new Error('The PNG file has no image header.');
  const {width, height, bitDepth, colorType, interlace} = ihdr, ch = CHANNELS[colorType];
  if (!ch || !width || !height) throw new Error('This PNG uses a format the compressor does not know.');
  if (width * height > 80e6) throw new Error('This picture is too large to compress here (over 80 megapixels).');
  if (colorType === 3 && !plte) throw new Error('The PNG palette is missing.');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const samples = (bitDepth === 16 ? new Uint16Array(width * height * ch) : new Uint8Array(width * height * ch));
  const bpp = Math.max(1, (ch * bitDepth) >> 3);
  let off = 0;
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((width - x0) / dx), ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil((pw * ch * bitDepth) / 8);
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < ph; y++) {
      if (off + 1 + stride > raw.length) throw new Error('The PNG file is damaged (its picture data is too short).');
      const ft = raw[off], line = Buffer.from(raw.subarray(off + 1, off + 1 + stride)); off += 1 + stride;
      unfilter(ft, line, prev, bpp);
      const yy = y0 + y * dy;
      for (let x = 0; x < pw; x++) {
        const xx = x0 + x * dx, o = (yy * width + xx) * ch;
        for (let c = 0; c < ch; c++) samples[o + c] = readSample(line, x * ch + c, bitDepth);
      }
      prev = line;
    }
  }
  return {width, height, bitDepth, colorType, plte, trns, keep, samples, ch};
}
function readSample(line, i, bd) {
  if (bd === 8) return line[i];
  if (bd === 16) return (line[i * 2] << 8) | line[i * 2 + 1];
  const per = 8 / bd, byte = line[Math.floor(i / per)], shift = 8 - bd * (i % per + 1);
  return (byte >> shift) & ((1 << bd) - 1);
}
function unfilter(ft, line, prev, bpp) {
  const n = line.length;
  if (ft === 0) return;
  if (ft === 1) { for (let i = bpp; i < n; i++) line[i] = (line[i] + line[i - bpp]) & 255; return; }
  if (ft === 2) { for (let i = 0; i < n; i++) line[i] = (line[i] + prev[i]) & 255; return; }
  if (ft === 3) { for (let i = 0; i < n; i++) line[i] = (line[i] + (((i >= bpp ? line[i - bpp] : 0) + prev[i]) >> 1)) & 255; return; }
  if (ft === 4) { for (let i = 0; i < n; i++) { const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; line[i] = (line[i] + paeth(a, b, c)) & 255; } return; }
  throw new Error('The PNG file is damaged (unknown row filter).');
}
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }

// every picture as 8-bit RGBA (for the colour checks and the 256-colour step). exact8: false when 16-bit values had to be rounded
function toRGBA8(img) {
  const {width, height, bitDepth, colorType, plte, trns, samples, ch} = img, n = width * height, out = new Uint8Array(n * 4);
  const max = (1 << bitDepth) - 1, to8 = v => bitDepth === 16 ? v >> 8 : bitDepth === 8 ? v : Math.round(v * 255 / max);
  let exact8 = true; if (bitDepth === 16) for (let i = 0; i < samples.length; i++) if ((samples[i] >> 8) !== (samples[i] & 255)) { exact8 = false; break; }
  const tr = trns && colorType === 0 ? trns.readUInt16BE(0) : null, tg = trns && colorType === 2 ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)] : null;
  for (let i = 0; i < n; i++) {
    const s = i * ch, o = i * 4;
    if (colorType === 3) { const k = samples[s]; out[o] = plte[k * 3] || 0; out[o + 1] = plte[k * 3 + 1] || 0; out[o + 2] = plte[k * 3 + 2] || 0; out[o + 3] = trns && k < trns.length ? trns[k] : 255; continue; }
    if (colorType === 0 || colorType === 4) { const g = to8(samples[s]); out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = colorType === 4 ? to8(samples[s + 1]) : (tr !== null && samples[s] === tr ? 0 : 255); continue; }
    out[o] = to8(samples[s]); out[o + 1] = to8(samples[s + 1]); out[o + 2] = to8(samples[s + 2]);
    out[o + 3] = colorType === 6 ? to8(samples[s + 3]) : (tg && samples[s] === tg[0] && samples[s + 1] === tg[1] && samples[s + 2] === tg[2] ? 0 : 255);
  }
  return {rgba: out, exact8};
}

// ---------------------------------------------------------------- encode
// rows: Buffer of unfiltered rows (each `stride` bytes). Tries "no filter" and the per-row best filter, keeps the smaller.
function packRows(width, height, ch, bitDepth, get) {
  const stride = Math.ceil((width * ch * bitDepth) / 8), rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const base = y * stride;
    if (bitDepth === 8) { for (let i = 0; i < width * ch; i++) rows[base + i] = get(y * width * ch + i); continue; }
    if (bitDepth === 16) { for (let i = 0; i < width * ch; i++) { const v = get(y * width * ch + i); rows[base + i * 2] = v >> 8; rows[base + i * 2 + 1] = v & 255; } continue; }
    const per = 8 / bitDepth;
    for (let i = 0; i < width * ch; i++) rows[base + Math.floor(i / per)] |= get(y * width * ch + i) << (8 - bitDepth * (i % per + 1));
  }
  return {rows, stride};
}
function filterRows(rows, stride, height, bpp, mode) {
  const out = Buffer.alloc((stride + 1) * height), cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const line = rows.subarray(y * stride, (y + 1) * stride);
    let best = 0;
    if (mode === 'adaptive') {
      let bestSum = Infinity;
      for (let f = 0; f < 5; f++) {
        const c = cand[f]; let sum = 0;
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], cc = i >= bpp ? prev[i - bpp] : 0;
          const v = (line[i] - (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? ((a + b) >> 1) : paeth(a, b, cc))) & 255;
          c[i] = v; sum += v < 128 ? v : 256 - v;
          if (sum >= bestSum) break;
        }
        if (sum < bestSum) { bestSum = sum; best = f; }
      }
      // the loop above may have stopped early for the winner's rivals only: recompute the winner fully
      const c = cand[best]; for (let i = 0; i < stride; i++) { const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], cc = i >= bpp ? prev[i - bpp] : 0; c[i] = (line[i] - (best === 0 ? 0 : best === 1 ? a : best === 2 ? b : best === 3 ? ((a + b) >> 1) : paeth(a, b, cc))) & 255; }
      out[y * (stride + 1)] = best; c.copy(out, y * (stride + 1) + 1);
    } else { out[y * (stride + 1)] = 0; line.copy(out, y * (stride + 1) + 1); }
    prev = line;
  }
  return out;
}
function encode({width, height, colorType, bitDepth, ch, get, plte, trns, keep}, quick) {
  const {rows, stride} = packRows(width, height, ch, bitDepth, get), bpp = Math.max(1, (ch * bitDepth) >> 3);
  const modes = colorType === 3 || bitDepth < 8 ? ['none', 'adaptive'] : ['adaptive', 'none'];
  let best = null;
  for (const mode of quick ? modes.slice(0, 1) : modes) {
    const filtered = filterRows(rows, stride, height, bpp, mode);
    for (const strategy of quick ? [zlib.constants.Z_DEFAULT_STRATEGY] : [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FILTERED]) {
      const z = zlib.deflateSync(filtered, {level: 9, memLevel: 9, strategy});
      if (!best || z.length < best.length) best = z;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = bitDepth; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [SIG, chunk('IHDR', ihdr)];
  for (const k of keep || []) if (k.type !== 'pHYs') parts.push(chunk(k.type, k.data));      // colour information goes before PLTE / IDAT
  for (const k of keep || []) if (k.type === 'pHYs') parts.push(chunk(k.type, k.data));
  if (plte) parts.push(chunk('PLTE', plte));
  if (trns && trns.length) parts.push(chunk('tRNS', trns));
  parts.push(chunk('IDAT', best), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
const depthFor = n => n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8;

// ---------------------------------------------------------------- step 1: lossless
function lossless(img, quick) {
  const {width, height} = img, n = width * height, out = [];
  const keep = img.keep;
  // the same format as the original, packed better (always possible, and the only lossless choice for real 16-bit pictures)
  {
    let trns = img.trns; if (img.colorType === 3 && trns) { let e = trns.length; while (e > 0 && trns[e - 1] === 255) e--; trns = trns.subarray(0, e); }
    out.push(encode({width, height, colorType: img.colorType, bitDepth: img.bitDepth, ch: img.ch, get: i => img.samples[i], plte: img.plte, trns, keep}, quick));
  }
  const {rgba, exact8} = toRGBA8(img);
  if (img.bitDepth === 16 && !exact8) return out.reduce((a, b) => b.length < a.length ? b : a);
  let opaque = true, grey = true;
  for (let i = 0; i < n; i++) { const o = i * 4; if (rgba[o + 3] !== 255) opaque = false; if (rgba[o] !== rgba[o + 1] || rgba[o] !== rgba[o + 2]) grey = false; if (!opaque && !grey) break; }
  // a palette when the picture has 256 colours or fewer (exact, so still lossless)
  const pal = new Map(), idx = new Uint8Array(n);
  for (let i = 0; i < n && pal.size <= 256; i++) { const o = i * 4, k = ((rgba[o] << 24) | (rgba[o + 1] << 16) | (rgba[o + 2] << 8) | rgba[o + 3]) >>> 0; let v = pal.get(k); if (v === undefined) { if (pal.size === 256) { pal.set(k, -1); break; } v = pal.size; pal.set(k, v); } idx[i] = v; }
  if (pal.size <= 256) {
    // transparent entries first so tRNS stays short
    const entries = [...pal.entries()].map(([k, v]) => ({k, v, a: k & 255})).sort((x, y) => (x.a === 255) - (y.a === 255));
    const remap = new Uint8Array(256), plte = Buffer.alloc(entries.length * 3), alphas = [];
    entries.forEach((e, j) => { remap[e.v] = j; plte[j * 3] = e.k >>> 24; plte[j * 3 + 1] = (e.k >>> 16) & 255; plte[j * 3 + 2] = (e.k >>> 8) & 255; if (e.a !== 255) alphas.push(e.a); });
    out.push(encode({width, height, colorType: 3, bitDepth: depthFor(entries.length), ch: 1, get: i => remap[idx[i]], plte, trns: Buffer.from(alphas), keep}, quick));
  }
  if (grey) {
    let gd = 8; for (const d of [1, 2, 4]) { const step = 255 / ((1 << d) - 1); let ok = true; for (let i = 0; i < n && ok; i++) if (rgba[i * 4] % step) ok = false; if (ok) { gd = d; break; } }
    const sc = gd === 8 ? 1 : 255 / ((1 << gd) - 1);
    if (opaque) out.push(encode({width, height, colorType: 0, bitDepth: gd, ch: 1, get: i => rgba[i * 4] / sc, keep}, quick));
    else out.push(encode({width, height, colorType: 4, bitDepth: 8, ch: 2, get: i => rgba[(i >> 1) * 4 + ((i & 1) ? 3 : 0)], keep}, quick));
  } else if (opaque) out.push(encode({width, height, colorType: 2, bitDepth: 8, ch: 3, get: i => rgba[Math.floor(i / 3) * 4 + i % 3], keep}, quick));
  else out.push(encode({width, height, colorType: 6, bitDepth: 8, ch: 4, get: i => rgba[i], keep}, quick));
  return out.reduce((a, b) => b.length < a.length ? b : a);
}

// ---------------------------------------------------------------- step 2: near-lossless (every colour within ±q/2 of the original)
// Each pixel is predicted from its already-written neighbours (the PNG "Paeth" filter) and only the difference is stored, rounded to a
// multiple of q. Small round differences pack far better, and no pixel moves more than q/2 levels (out of 255) from the original: no dither
// pattern, no banding, no new colours. Alpha (transparency) is kept exact.
function nearLossless(rgba, width, height, q, keep) {
  if (q <= 1) throw new Error('q must be 2 or more');
  let opaque = true; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { opaque = false; break; }
  const ch = opaque ? 3 : 4, stride = width * ch, out = Buffer.alloc((stride + 1) * height), half = q >> 1;
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const o0 = y * (stride + 1); out[o0] = 4;              // Paeth on every row
    for (let x = 0; x < width; x++) for (let c = 0; c < ch; c++) {
      const i = x * ch + c, v = rgba[(y * width + x) * 4 + c], a = x ? cur[i - ch] : 0, b = prev[i], cc = x ? prev[i - ch] : 0, pred = paeth(a, b, cc);
      let val;
      if (c === 3 || q <= 1) val = v;                                        // alpha stays exact
      else { const d = v - pred, qd = d >= 0 ? Math.floor((d + half) / q) * q : -Math.floor((-d + half) / q) * q; val = pred + qd; if (val < 0) val = 0; else if (val > 255) val = 255; if (Math.abs(val - v) > half) val = v; }
      cur[i] = val; out[o0 + 1 + i] = (val - pred) & 255;
    }
    const t = prev; prev = cur; cur = t;
  }
  const z = zlib.deflateSync(out, {level: 7, memLevel: 9});
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
  const parts = [SIG, chunk('IHDR', ihdr)];
  for (const k of keep || []) if (k.type !== 'pHYs') parts.push(chunk(k.type, k.data));
  for (const k of keep || []) if (k.type === 'pHYs') parts.push(chunk(k.type, k.data));
  parts.push(chunk('IDAT', z), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------- step 3: 256 colours (median cut on a colour histogram, refined, then dithered)
function quantize(rgba, width, height, colors = 256, dither = 0.75) {
  const n = width * height;
  // histogram on 6 bits per channel (transparent pixels count as one colour)
  const hist = new Map();
  for (let i = 0; i < n; i++) {
    const o = i * 4, a = rgba[o + 3];
    const k = a === 0 ? -1 : ((rgba[o] >> 2) << 18) | ((rgba[o + 1] >> 2) << 12) | ((rgba[o + 2] >> 2) << 6) | (a >> 2);
    let h = hist.get(k); if (!h) { h = [0, 0, 0, 0, 0]; hist.set(k, h); }
    h[0]++; h[1] += rgba[o]; h[2] += rgba[o + 1]; h[3] += rgba[o + 2]; h[4] += a;
  }
  const hasClear = hist.has(-1);
  const pts = [...hist.entries()].filter(([k]) => k !== -1).map(([, h]) => [h[1] / h[0], h[2] / h[0], h[3] / h[0], h[4] / h[0], h[0]]);
  const want = Math.max(2, colors - (hasClear ? 1 : 0));
  // split the box whose colours are most spread out (sum of squared distances, weighted by how many pixels use them) on its widest channel, at the weighted mean
  const W = [1, 1.2, 0.8, 2];                    // green matters most to the eye, alpha most of all at edges
  const stats = b => { let w = 0; const m = [0, 0, 0, 0], q = [0, 0, 0, 0]; for (const p of b) { w += p[4]; for (let c = 0; c < 4; c++) { m[c] += p[c] * p[4]; q[c] += p[c] * p[c] * p[4]; } }
    const v = m.map((x, c) => (q[c] - x * x / w) * W[c]); return {w, v, sse: v[0] + v[1] + v[2] + v[3], mean: m.map(x => x / w)}; };
  let boxes = [{b: pts, ...stats(pts)}];
  while (boxes.length < want) {
    let bi = -1, top = 0; boxes.forEach((x, i) => { if (x.b.length > 1 && x.sse > top) { top = x.sse; bi = i; } });
    if (bi < 0) break;
    const x = boxes[bi], c = x.v.indexOf(Math.max(...x.v)), cut = x.mean[c];
    const lo = x.b.filter(p => p[c] <= cut), hi = x.b.filter(p => p[c] > cut);
    if (!lo.length || !hi.length) { x.sse = 0; continue; }
    boxes.splice(bi, 1, {b: lo, ...stats(lo)}, {b: hi, ...stats(hi)});
  }
  let pal = boxes.map(x => x.mean);
  // k-means passes over the histogram pull each colour to the middle of what it stands for
  for (let pass = 0; pass < 6; pass++) {
    const sum = pal.map(() => [0, 0, 0, 0, 0]);
    for (const p of pts) { const j = nearest(pal, p[0], p[1], p[2], p[3]); const s = sum[j]; for (let c = 0; c < 4; c++) s[c] += p[c] * p[4]; s[4] += p[4]; }
    pal = pal.map((q, j) => sum[j][4] ? sum[j].slice(0, 4).map(v => v / sum[j][4]) : q);
  }
  pal = pal.map(q => q.map(v => Math.max(0, Math.min(255, Math.round(v)))));
  if (hasClear) pal.unshift([0, 0, 0, 0]);
  // map every pixel (Floyd-Steinberg, serpentine; transparent pixels stay transparent and spread no error)
  const idx = new Uint8Array(n), cache = new Int16Array(1 << 22).fill(-1), solid = pal.map(q => q[3] > 0);
  for (const q of pal) if (q[3] >= 250) q[3] = 255;                 // nearly opaque colours are opaque
  let err = new Float32Array((width + 2) * 4), next = new Float32Array((width + 2) * 4);
  for (let y = 0; y < height; y++) {
    const ltr = !(y & 1);
    for (let s = 0; s < width; s++) {
      const x = ltr ? s : width - 1 - s, o = (y * width + x) * 4, e = (x + 1) * 4;
      if (rgba[o + 3] === 0 && hasClear) { idx[y * width + x] = 0; continue; }
      const r = clamp(rgba[o] + err[e] * dither), g = clamp(rgba[o + 1] + err[e + 1] * dither), b = clamp(rgba[o + 2] + err[e + 2] * dither), a = rgba[o + 3];      // alpha is never dithered: edges stay clean
      const key = ((r >> 2) << 16) | ((g >> 2) << 10) | ((b >> 2) << 4) | (a >> 4);
      let j = cache[key]; if (j < 0) { j = nearest(pal, r, g, b, a, solid); cache[key] = j; }
      idx[y * width + x] = j;
      const q = pal[j], er = r - q[0], eg = g - q[1], eb = b - q[2], d = ltr ? 4 : -4;
      for (let c = 0; c < 3; c++) {
        const ev = c === 0 ? er : c === 1 ? eg : eb;
        err[e + d + c] += ev * 7 / 16; next[e - d + c] += ev * 3 / 16; next[e + c] += ev * 5 / 16; next[e + d + c] += ev / 16;
      }
    }
    const t = err; err = next; next = t; next.fill(0);
  }
  return {pal, idx};
}
const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
function nearest(pal, r, g, b, a, solid) {
  let bj = 0, bd = Infinity;
  for (let j = 0; j < pal.length; j++) {
    if (solid && !solid[j] && a > 0) continue;
    const q = pal[j], dr = r - q[0], dg = g - q[1], db = b - q[2], da = a - q[3];
    const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11 + da * da * 2;
    if (d < bd) { bd = d; bj = j; }
  }
  return bj;
}
function palettePng(width, height, q, keep) {
  const order = q.pal.map((c, j) => ({c, j})).sort((x, y) => (x.c[3] === 255) - (y.c[3] === 255)), remap = new Uint8Array(256), plte = Buffer.alloc(order.length * 3), alphas = [];
  order.forEach((e, k) => { remap[e.j] = k; plte[k * 3] = e.c[0]; plte[k * 3 + 1] = e.c[1]; plte[k * 3 + 2] = e.c[2]; if (e.c[3] !== 255) alphas.push(e.c[3]); });
  return encode({width, height, colorType: 3, bitDepth: depthFor(order.length), ch: 1, get: i => remap[q.idx[i]], plte, trns: Buffer.from(alphas), keep});
}

// ---------------------------------------------------------------- step 4: scale down (area average, alpha-aware)
function resize(rgba, w, h, nw, nh) {
  const out = new Uint8Array(nw * nh * 4), acc = new Float64Array(nw * 4), sx = w / nw, sy = h / nh;
  for (let y = 0; y < nh; y++) {
    acc.fill(0); const y0 = y * sy, y1 = y0 + sy;
    let wsum = 0;
    for (let iy = Math.floor(y0); iy < Math.min(h, Math.ceil(y1)); iy++) {
      const wy = Math.min(y1, iy + 1) - Math.max(y0, iy); if (wy <= 0) continue; wsum += wy;
      for (let x = 0; x < nw; x++) {
        const x0 = x * sx, x1 = x0 + sx;
        for (let ix = Math.floor(x0); ix < Math.min(w, Math.ceil(x1)); ix++) {
          const wx = Math.min(x1, ix + 1) - Math.max(x0, ix); if (wx <= 0) continue;
          const o = (iy * w + ix) * 4, a = rgba[o + 3] / 255, wgt = wx * wy;
          acc[x * 4] += rgba[o] * a * wgt; acc[x * 4 + 1] += rgba[o + 1] * a * wgt; acc[x * 4 + 2] += rgba[o + 2] * a * wgt; acc[x * 4 + 3] += a * wgt;
        }
      }
    }
    for (let x = 0; x < nw; x++) {
      const area = sx * wsum, a = acc[x * 4 + 3], o = (y * nw + x) * 4;
      out[o + 3] = Math.round(255 * a / area);
      for (let c = 0; c < 3; c++) out[o + c] = a > 0 ? Math.round(acc[x * 4 + c] / a) : 0;
    }
  }
  return out;
}

// ---------------------------------------------------------------- one picture
function compressBuffer(buf, {target = TARGET, onStep} = {}) {
  const img = decode(buf), step = m => { try { onStep && onStep(m); } catch (_) { /* progress only */ } };
  step('Packing it losslessly');
  // a quick lossless pass first: when even that is far over the limit, the slower thorough variants (which gain a few percent) are skipped
  let best = lossless(img, true); if (best.length <= target * 1.4) best = lossless(img); if (best.length > buf.length) best = buf;
  const base = {inBytes: buf.length, width: img.width, height: img.height, newWidth: img.width, newHeight: img.height};
  if (best.length <= target) return {...base, out: best, outBytes: best.length, method: 'lossless', note: best === buf ? 'Already as small as it gets: saved unchanged.' : 'Lossless: every pixel is identical to the original.'};
  const {rgba} = toRGBA8(img);
  // near-lossless, gentlest first: within ±1, ±2, ±3, ±4 levels
  const QS = [2, 4, 6, 8, 12, 16, 24];
  for (let k = 0; k < QS.length; k++) {
    const q = QS[k];
    step(`Packing it near-losslessly (within ±${q >> 1})`);
    const png = nearLossless(rgba, img.width, img.height, q, img.keep);
    if (png.length > target * 2 && k + 2 < QS.length) k++;          // far over: the next level cannot be enough either, so it is skipped
    if (png.length <= target) return {...base, out: png, outBytes: png.length, method: 'near', within: q >> 1, note: `Near-lossless: every colour is within ±${q >> 1} of 255 levels of the original${q <= 16 ? ' (no visible change)' : ' (a faint grain can show in very smooth areas when zoomed in)'}. Transparency is exact.`};
  }
  step('Choosing the best 256 colours');
  let q = quantize(rgba, img.width, img.height); let png = palettePng(img.width, img.height, q, img.keep);
  if (png.length <= target) return {...base, out: png, outBytes: png.length, method: 'colors', note: '256 colours: close to the original at normal size, but fine grain can show in smooth gradients. Near-lossless (within ±12) could not fit under the limit.'};
  // scale down in small steps (near-lossless within ±2 at the smaller size keeps it smooth), guided by how far over it still is
  let scale = 1, last = nearLossless(rgba, img.width, img.height, 16, img.keep).length;
  for (let tries = 0; tries < 14; tries++) {
    scale = Math.max(0.2, scale * Math.min(0.97, Math.sqrt(target / last) * 0.98));
    const nw = Math.max(1, Math.round(img.width * scale)), nh = Math.max(1, Math.round(img.height * scale));
    step(`Scaling to ${nw} × ${nh}`);
    const small = resize(rgba, img.width, img.height, nw, nh);
    png = nearLossless(small, nw, nh, 16, img.keep); last = png.length;
    if (png.length <= target) return {...base, out: png, outBytes: png.length, method: 'resized', newWidth: nw, newHeight: nh, note: `Scaled to ${nw} × ${nh} (${Math.round(scale * 100)}% of the width), near-lossless (within ±8) at that size. It could not fit at full size even with 256 colours.`};
    if (scale <= 0.2) break;
  }
  throw new Error('Could not get this picture under the limit without shrinking it below 20% of its size, so nothing was saved.');
}

// the file next to the source: <name>_compressed.png (an earlier one is replaced)
const outPathFor = file => { const p = path.parse(file); return path.join(p.dir, `${p.name}_compressed.png`); };
// file: the picture's own path. A PNG is read from there; any other kind of picture arrives already turned into PNG bytes by the app window (opts.pngBytes).
// The copy is saved as <name>_compressed.png next to the original (opts.outFile names a different place).
function compressFile(file, opts = {}) {
  const isPng = /\.png$/i.test(file);
  if (!isPng && !opts.pngBytes) throw new Error('This picture has to be turned into a PNG first.');
  if (isPng && /_compressed\.png$/i.test(file)) throw new Error('This is already a compressed copy (its name ends in _compressed). Compress the original instead.');
  const buf = opts.pngBytes ? Buffer.from(opts.pngBytes) : fs.readFileSync(file), r = compressBuffer(buf, opts), out = opts.outFile || outPathFor(file);
  if (!isPng) r.inBytes = (() => { try { return fs.statSync(file).size; } catch (_) { return r.inBytes; } })();      // the size you start from is the original file's
  const tmp = out + '.tmp-' + process.pid; fs.writeFileSync(tmp, r.out); fs.renameSync(tmp, out);
  delete r.out; return {...r, file, outFile: out, converted: !isPng};
}

module.exports = {nearLossless, TARGET, decode, toRGBA8, lossless, quantize, resize, encode, compressBuffer, compressFile, outPathFor};
