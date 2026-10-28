/* Every picture format the tools open (v1.3.0).
   PNG, APNG, JPG, GIF, WebP, BMP, ICO, AVIF and SVG are opened by the app's own browser engine. TIFF is read here (no extra install): plain, LZW, Deflate and
   PackBits, grey / colour / palette / CMYK, 1 to 16 bits, with or without transparency, strips or tiles, either byte order. HEIC / HEIF is opened through Windows'
   own picture codec when the "HEIF Image Extensions" are installed (the app asks Windows; nothing is installed by the app).
   The same file runs in the app window and in Node (for the tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(typeof require === 'function' ? require : null);
  else root.ImageFormats = factory(null);
})(typeof self !== 'undefined' ? self : this, function (req) {
  'use strict';
  const EXTS = ['png', 'apng', 'jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp', 'gif', 'webp', 'bmp', 'dib', 'ico', 'cur', 'tif', 'tiff', 'avif', 'heic', 'heif', 'svg'];
  const ACCEPT = EXTS.map(x => '.' + x).join(',') + ',image/*';
  const extOf = name => { const m = /\.([A-Za-z0-9]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  const isImageName = name => EXTS.includes(extOf(name));
  const DIALOG_EXTS = EXTS.slice();

  // what a file really is, from its first bytes (a wrong extension does not matter)
  function sniff(b) {
    if (!b || b.length < 4) return '';
    const s = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
    if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'png';
    if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
    if (s(0, 3) === 'GIF') return 'gif';
    if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'webp';
    if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) return 'tiff';
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2b && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2b)) return 'bigtiff';
    if (b[0] === 0 && b[1] === 0 && (b[2] === 1 || b[2] === 2) && b[3] === 0) return 'ico';
    if (s(4, 4) === 'ftyp') { const brand = s(8, 4); if (/^avi[fs]$/.test(brand)) return 'avif'; if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return 'heic'; }
    const head = s(0, Math.min(b.length, 512)).replace(/^﻿/, '').trimStart();
    if (/^<\?xml|^<svg/i.test(head) && /<svg[\s>]/i.test(s(0, Math.min(b.length, 4096)))) return 'svg';
    return '';
  }

  // ---------------------------------------------------------------- inflate (Node: zlib, browser: DecompressionStream)
  async function inflate(data) {
    if (req) { try { return new Uint8Array(req('zlib').inflateSync(Buffer.from(data.buffer, data.byteOffset, data.length))); } catch (e) { return new Uint8Array(req('zlib').inflateRawSync(Buffer.from(data.buffer, data.byteOffset, data.length))); } }
    const run = async fmt => { const ds = new DecompressionStream(fmt), w = ds.writable.getWriter(); w.write(data); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); };
    try { return await run('deflate'); } catch (_) { return await run('deflate-raw'); }
  }
  // TIFF LZW (most significant bit first, the code size grows one code early)
  function lzw(src, expect) {
    const out = new Uint8Array(Math.max(expect, 16)), prefix = new Int32Array(4096), suffix = new Uint8Array(4096), len = new Uint16Array(4096), first = new Uint8Array(4096);
    for (let i = 0; i < 256; i++) { suffix[i] = i; len[i] = 1; first[i] = i; prefix[i] = -1; }
    let o = 0, next = 258, bits = 9, prev = -1, acc = 0, nb = 0, p = 0;
    const put = code => { const n = len[code]; if (o + n > out.length) throw new Error('The TIFF data is larger than its header says.'); let k = o + n - 1, c = code; while (c >= 0) { out[k--] = suffix[c]; c = prefix[c]; } o += n; };
    for (;;) {
      while (nb < bits && p < src.length) { acc = ((acc << 8) | src[p++]) >>> 0; nb += 8; }
      if (nb < bits) break;
      const code = (acc >>> (nb - bits)) & ((1 << bits) - 1); nb -= bits; acc &= nb ? (1 << nb) - 1 : 0;
      if (code === 257) break;
      if (code === 256) { next = 258; bits = 9; prev = -1; continue; }
      if (prev === -1) { if (code > 255) throw new Error('The TIFF data is damaged.'); put(code); prev = code; continue; }
      if (code < next) { put(code); } else if (code === next) { prefix[next] = prev; suffix[next] = first[prev]; len[next] = len[prev] + 1; first[next] = first[prev]; put(code); next++; if (next === 511) bits = 10; else if (next === 1023) bits = 11; else if (next === 2047) bits = 12; prev = code; continue; } else throw new Error('The TIFF data is damaged.');
      if (next < 4096) { prefix[next] = prev; suffix[next] = first[code]; len[next] = len[prev] + 1; first[next] = first[prev]; next++; if (next === 511) bits = 10; else if (next === 1023) bits = 11; else if (next === 2047) bits = 12; }
      prev = code;
    }
    return out.subarray(0, o);
  }
  function packBits(src, expect) {
    const out = new Uint8Array(expect); let i = 0, o = 0;
    while (i < src.length && o < expect) {
      const n = src[i++] << 24 >> 24;
      if (n >= 0) { const c = Math.min(n + 1, src.length - i, expect - o); out.set(src.subarray(i, i + c), o); i += n + 1; o += c; }
      else if (n !== -128) { const c = Math.min(1 - n, expect - o), v = src[i++]; out.fill(v, o, o + c); o += c; }
    }
    return out;
  }

  // ---------------------------------------------------------------- TIFF -> RGBA
  const TYPE_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8};
  async function decodeTiff(input) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    const kind = sniff(b); if (kind === 'bigtiff') throw new Error('This is a BigTIFF file (over 4 GB), which is not supported.'); if (kind !== 'tiff') throw new Error('This is not a TIFF file.');
    const le = b[0] === 0x49, dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
    const ifd = u32(4); if (ifd + 2 > b.length) throw new Error('The TIFF file is cut off.');
    const n = u16(ifd), tags = {};
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12; if (e + 12 > b.length) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4), size = (TYPE_SIZE[type] || 1) * count, at = size <= 4 ? e + 8 : u32(e + 8);
      if (at + size > b.length) continue;
      const vals = []; for (let k = 0; k < count && k < 1 << 20; k++) { const p = at + k * (TYPE_SIZE[type] || 1); vals.push(type === 3 || type === 8 ? u16(p) : type === 4 || type === 9 ? u32(p) : type === 1 || type === 2 || type === 6 || type === 7 ? b[p] : type === 11 ? dv.getFloat32(p, le) : 0); }
      tags[tag] = vals;
    }
    const get = (t, d) => (tags[t] && tags[t].length ? tags[t][0] : d);
    const W = get(256), H = get(257); if (!W || !H) throw new Error('The TIFF file has no picture size.');
    if (W * H > 120e6) throw new Error('This TIFF is too large to open here (over 120 megapixels).');
    const spp = get(277, 1), bps = (tags[258] && tags[258].length ? tags[258][0] : 1), comp = get(259, 1), photo = get(262, 1), planar = get(284, 1), pred = get(317, 1), fmt = get(339, 1);
    const extra = tags[338] || [];
    if (fmt === 3) throw new Error('This TIFF stores floating-point pixels, which are not supported.');
    if (![1, 2, 4, 8, 16].includes(bps)) throw new Error(`This TIFF uses ${bps} bits per sample, which is not supported.`);
    if (![1, 5, 8, 32946, 32773].includes(comp)) throw new Error(comp === 7 || comp === 6 ? 'This TIFF is compressed with JPEG inside the TIFF, which is not supported. Save it as an ordinary TIFF, PNG or JPG.' : comp === 3 || comp === 4 ? 'This TIFF uses fax (CCITT) compression, which is not supported.' : `This TIFF uses compression type ${comp}, which is not supported.`);
    if (![0, 1, 2, 3, 5].includes(photo)) throw new Error(photo === 6 ? 'This TIFF stores its colours as YCbCr, which is not supported. Save it as an ordinary TIFF, PNG or JPG.' : 'This TIFF uses a colour layout that is not supported.');
    if (pred !== 1 && pred !== 2) throw new Error('This TIFF uses a prediction mode that is not supported.');
    const chans = planar === 2 ? 1 : spp, pxBytesBits = chans * bps;
    const sample = new Uint16Array(W * H * spp);
    const rowBytes = w => Math.ceil(w * pxBytesBits / 8);
    const decodeBlock = async (data, w, h) => {                       // one strip or tile -> Uint16 samples (w*h*chans)
      const rb = rowBytes(w), expect = rb * h;
      let raw;
      if (comp === 1) raw = data; else if (comp === 5) raw = lzw(data, expect); else if (comp === 32773) raw = packBits(data, expect); else raw = await inflate(data);
      if (raw.length < expect) { const t = new Uint8Array(expect); t.set(raw); raw = t; }
      const out = new Uint16Array(w * h * chans);
      for (let y = 0; y < h; y++) {
        const ro = y * rb, oo = y * w * chans, cnt = w * chans;
        if (bps === 8) for (let i = 0; i < cnt; i++) out[oo + i] = raw[ro + i];
        else if (bps === 16) for (let i = 0; i < cnt; i++) out[oo + i] = le ? raw[ro + i * 2] | (raw[ro + i * 2 + 1] << 8) : (raw[ro + i * 2] << 8) | raw[ro + i * 2 + 1];
        else { const per = 8 / bps, mask = (1 << bps) - 1; for (let i = 0; i < cnt; i++) { const byte = raw[ro + Math.floor(i / per)], sh = 8 - bps * ((i % per) + 1); out[oo + i] = (byte >> sh) & mask; } }
        if (pred === 2 && bps >= 8) { const mod = bps === 16 ? 0xffff : 0xff; for (let x = 1; x < w; x++) for (let c = 0; c < chans; c++) out[oo + x * chans + c] = (out[oo + x * chans + c] + out[oo + (x - 1) * chans + c]) & mod; }
      }
      return out;
    };
    if (tags[324]) {                                                   // tiles
      if (planar === 2) throw new Error('This TIFF stores its colours in separate tiles, which is not supported.');
      const tw = get(322), tl = get(323), offs = tags[324], cnts = tags[325] || [], across = Math.ceil(W / tw);
      for (let t = 0; t < offs.length; t++) {
        const tx = (t % across) * tw, ty = Math.floor(t / across) * tl; if (ty >= H) break;
        const blk = await decodeBlock(b.subarray(offs[t], offs[t] + (cnts[t] || b.length - offs[t])), tw, tl);
        for (let y = 0; y < tl && ty + y < H; y++) for (let x = 0; x < tw && tx + x < W; x++) for (let c = 0; c < spp; c++) sample[((ty + y) * W + tx + x) * spp + c] = blk[(y * tw + x) * chans + c];
      }
    } else {
      const offs = tags[273]; if (!offs) throw new Error('The TIFF file has no picture data.');
      const cnts = tags[279] || [], rps = Math.min(get(278, H), H) || H, per = Math.ceil(H / rps);
      for (let s = 0; s < offs.length; s++) {
        const plane = planar === 2 ? Math.floor(s / per) : 0, strip = planar === 2 ? s % per : s, y0 = strip * rps; if (y0 >= H) continue;
        const h = Math.min(rps, H - y0), len = cnts[s] != null ? cnts[s] : (comp === 1 ? rowBytes(W) * h : b.length - offs[s]);
        const blk = await decodeBlock(b.subarray(offs[s], Math.min(b.length, offs[s] + len)), W, h);
        if (planar === 2) { for (let i = 0; i < W * h; i++) sample[(y0 * W + i) * spp + plane] = blk[i]; }
        else sample.set(blk, y0 * W * spp);
      }
    }
    // -> RGBA8
    const max = (1 << bps) - 1, to8 = v => bps === 16 ? v >> 8 : bps === 8 ? v : Math.round(v * 255 / max);
    const rgba = new Uint8ClampedArray(W * H * 4);
    const base = photo === 2 ? 3 : photo === 5 ? 4 : 1;
    const alphaCh = spp > base && (extra[0] === 1 || extra[0] === 2) ? base : -1, premul = extra[0] === 1;
    const cmap = tags[320], csz = 1 << bps;
    for (let i = 0, n2 = W * H; i < n2; i++) {
      const s = i * spp, o = i * 4; let r, g, bl;
      if (photo === 3) { const k = sample[s]; if (!cmap) { r = g = bl = to8(k); } else { r = cmap[k] >> 8; g = cmap[csz + k] >> 8; bl = cmap[2 * csz + k] >> 8; } }
      else if (photo === 2) { r = to8(sample[s]); g = to8(sample[s + 1]); bl = to8(sample[s + 2]); }
      else if (photo === 5) { const c = to8(sample[s]), m = to8(sample[s + 1]), y = to8(sample[s + 2]), k = to8(sample[s + 3]); r = (255 - c) * (255 - k) / 255; g = (255 - m) * (255 - k) / 255; bl = (255 - y) * (255 - k) / 255; }
      else { let v = to8(sample[s]); if (photo === 0) v = 255 - v; r = g = bl = v; }
      let a = 255; if (alphaCh >= 0) { a = to8(sample[s + alphaCh]); if (premul && a > 0 && a < 255) { r = Math.min(255, r * 255 / a); g = Math.min(255, g * 255 / a); bl = Math.min(255, bl * 255 / a); } }
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = bl; rgba[o + 3] = a;
    }
    // orientation (EXIF-style tag 274)
    const ori = get(274, 1);
    if (ori > 1 && ori <= 8) return orient({width: W, height: H, rgba}, ori);
    return {width: W, height: H, rgba};
  }
  function orient(img, o) {
    const {width: w, height: h, rgba} = img, swap = o >= 5, W = swap ? h : w, H = swap ? w : h, out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let X, Y;
      switch (o) { case 2: X = w - 1 - x; Y = y; break; case 3: X = w - 1 - x; Y = h - 1 - y; break; case 4: X = x; Y = h - 1 - y; break; case 5: X = y; Y = x; break; case 6: X = h - 1 - y; Y = x; break; case 7: X = h - 1 - y; Y = w - 1 - x; break; default: X = y; Y = w - 1 - x; }
      const s = (y * w + x) * 4, d = (Y * W + X) * 4; out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
    }
    return {width: W, height: H, rgba: out};
  }

  // ---------------------------------------------------------------- browser side: any picture file -> something a canvas can draw
  const SIZE_LIMIT = 8192;
  async function viaImg(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
      let w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { w = 1024; h = 1024; }
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }
  // file: a File or Blob (name optional). hooks.heic(bytes, name) -> Promise<Uint8Array PNG>, given by the app window when it can ask Windows.
  // Returns a canvas or an ImageBitmap, and throws an error written for the person to read.
  async function toDrawable(file, hooks) {
    hooks = hooks || {};
    const name = file.name || '';
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) throw new Error(`${name || 'The picture'} is empty.`);
    let kind = sniff(bytes) || (extOf(name) === 'svg' ? 'svg' : '');
    if (!kind) { const x = extOf(name); kind = /^tiff?$/.test(x) ? 'tiff' : /^(jpe?g|jpe|jfif|pjpe?g|pjp)$/.test(x) ? 'jpeg' : x; }
    if (kind === 'tiff') {
      const t = await decodeTiff(bytes);
      const c = document.createElement('canvas'); c.width = t.width; c.height = t.height; c.getContext('2d').putImageData(new ImageData(t.rgba, t.width, t.height), 0, 0); return c;
    }
    if (kind === 'heic') {
      if (hooks.heic) { let png; try { png = await hooks.heic(bytes, name); } catch (e) { throw new Error(`${name || 'This HEIC picture'} could not be opened: ${e && e.message ? e.message : e}`); } return viaImg(new Blob([png], {type: 'image/png'})); }
      throw new Error(`${name || 'This HEIC picture'} cannot be opened here. Save it as a JPG or PNG first.`);
    }
    const type = {png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml'}[kind] || '';
    const blob = new Blob([bytes], type ? {type} : {});
    if (kind !== 'svg') { try { return await createImageBitmap(blob, {imageOrientation: 'from-image'}); } catch (_) { /* try the other way below */ } }
    try { return await viaImg(blob); }
    catch (_) { throw new Error(`${name || 'This file'} is not a picture the app can read${kind === 'avif' ? ' (this AVIF could not be decoded)' : ''}. Try saving it as a PNG or JPG.`); }
  }
  async function toPngBytes(file, hooks) {
    const d = await toDrawable(file, hooks); let c = d;
    if (typeof ImageBitmap !== 'undefined' && d instanceof ImageBitmap) { c = document.createElement('canvas'); c.width = d.width; c.height = d.height; c.getContext('2d').drawImage(d, 0, 0); if (d.close) d.close(); }
    const blob = await new Promise((ok, no) => c.toBlob(x => x ? ok(x) : no(new Error('Could not turn the picture into a PNG.')), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  return {EXTS, ACCEPT, DIALOG_EXTS, extOf, isImageName, sniff, decodeTiff, toDrawable, toPngBytes, SIZE_LIMIT};
});
