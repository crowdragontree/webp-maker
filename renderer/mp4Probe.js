// Small, dependency-free ISO BMFF metadata fallback for local MP4 files.
// This reads container headers only; it never decodes or uploads video frames.
(function (root, factory) {
  const probe = factory();
  if (typeof module === 'object' && module.exports) module.exports = probe;
  if (root) root.webpMp4Probe = probe;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const MAX_MOOV_BYTES = 32 * 1024 * 1024;
  const u32 = (dv, n) => n + 4 <= dv.byteLength ? dv.getUint32(n, false) : 0;
  const u64 = (dv, n) => n + 8 <= dv.byteLength ? Number(dv.getBigUint64(n, false)) : 0;
  const str = (dv, n) => n + 4 <= dv.byteLength ? String.fromCharCode(...new Uint8Array(dv.buffer, dv.byteOffset + n, 4)) : '';
  const valid = x => Number.isFinite(x) && x > 0 && x < 86400 * 365;
  function boxes(dv, start, end) {
    const found = [];
    let offset = start;
    while (offset + 8 <= end) {
      let size = u32(dv, offset), header = 8;
      if (size === 1) { size = u64(dv, offset + 8); header = 16; }
      else if (size === 0) size = end - offset;
      if (!Number.isSafeInteger(size) || size < header || offset + size > end) break;
      found.push({type: str(dv, offset + 4), start: offset + header, end: offset + size});
      offset += size;
    }
    return found;
  }
  const children = (dv, box) => box ? boxes(dv, box.start, box.end) : [];
  const get = (arr, type) => arr.find(x => x.type === type);
  function times(dv, box) {
    if (!box || box.end - box.start < 20) return null;
    const p = box.start, v = dv.getUint8(p), scale = u32(dv, p + (v === 1 ? 20 : 12));
    const ticks = v === 1 ? u64(dv, p + 24) : u32(dv, p + 16);
    return scale > 0 && valid(ticks / scale) ? ticks / scale : null;
  }
  function sttsDuration(dv, box, scale) {
    if (!box || !scale) return null;
    const p = box.start, count = u32(dv, p + 4);
    if (count > 100000 || p + 8 + count * 8 > box.end) return null;
    let total = 0;
    for (let i = 0; i < count; i++) total += u32(dv, p + 8 + i * 8) * u32(dv, p + 12 + i * 8);
    return valid(total / scale) ? total / scale : null;
  }
  function track(dv, box) {
    const kids = children(dv, box), tkhd = get(kids, 'tkhd'), mdia = get(kids, 'mdia');
    const mdiaKids = children(dv, mdia), hdlr = get(mdiaKids, 'hdlr'), mdhd = get(mdiaKids, 'mdhd');
    if (!hdlr || str(dv, hdlr.start + 8) !== 'vide') return null;
    let width = 0, height = 0;
    if (tkhd && tkhd.end - tkhd.start >= 8) {
      width = u32(dv, tkhd.end - 8) / 65536;
      height = u32(dv, tkhd.end - 4) / 65536;
    }
    const p = mdhd?.start ?? 0, v = mdhd ? dv.getUint8(p) : 0;
    const scale = mdhd ? u32(dv, p + (v === 1 ? 20 : 12)) : 0;
    const sampleTable = get(children(dv, get(children(dv, get(mdiaKids, 'minf')), 'stbl')), 'stts');
    const tkhdVersion = tkhd ? dv.getUint8(tkhd.start) : 0;
    const trackId = tkhd ? u32(dv, tkhd.start + (tkhdVersion === 1 ? 20 : 12)) : 0;
    return {width: Math.round(width), height: Math.round(height), duration: times(dv, mdhd) || sttsDuration(dv, sampleTable, scale), scale, trackId};
  }
  function movie(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const top = boxes(dv, 0, dv.byteLength), moov = get(top, 'moov');
    if (!moov) return {};
    const kids = children(dv, moov), mvhd = get(kids, 'mvhd');
    const video = kids.filter(x => x.type === 'trak').map(x => track(dv, x)).find(Boolean);
    const mvex = get(kids, 'mvex');
    const trex = children(dv, mvex).filter(x => x.type === 'trex')
      .find(x => video && u32(dv, x.start + 4) === video.trackId);
    const mehd = get(children(dv, mvex), 'mehd');
    const movieScale = mvhd ? u32(dv, mvhd.start + (dv.getUint8(mvhd.start) === 1 ? 20 : 12)) : 0;
    const mehdTicks = mehd ? (dv.getUint8(mehd.start) === 1 ? u64(dv, mehd.start + 4) : u32(dv, mehd.start + 4)) : 0;
    return {width: video?.width || 0, height: video?.height || 0,
      duration: video?.duration || times(dv, mvhd) || (movieScale && valid(mehdTicks / movieScale) ? mehdTicks / movieScale : null),
      scale: video?.scale || 0, trackId: video?.trackId || 0, defaultDuration: trex ? u32(dv, trex.start + 12) : 0};
  }
  function moofDuration(bytes, videoTrack, trexDuration) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let ticks = 0;
    for (const moof of boxes(dv, 0, dv.byteLength).filter(x => x.type === 'moof')) {
      for (const traf of children(dv, moof).filter(x => x.type === 'traf')) {
        const parts = children(dv, traf), tfhd = get(parts, 'tfhd');
        if (!tfhd || u32(dv, tfhd.start + 4) !== videoTrack) continue;
        const flags = u32(dv, tfhd.start) & 0xffffff;
        let offset = tfhd.start + 8;
        if (flags & 0x000001) offset += 8;
        if (flags & 0x000002) offset += 4;
        let def = trexDuration;
        if (flags & 0x000008) {def = u32(dv, offset); offset += 4;}
        for (const trun of parts.filter(x => x.type === 'trun')) {
          const opts = u32(dv, trun.start) & 0xffffff;
          const count = u32(dv, trun.start + 4);
          if (count > 1000000) continue;
          let at = trun.start + 8;
          if (opts & 0x000001) at += 4;
          if (opts & 0x000004) at += 4;
          if (!(opts & 0x000100)) {ticks += count * def; continue;}
          const sampleSize = 4 + ((opts & 0x000200) ? 4 : 0) + ((opts & 0x000400) ? 4 : 0) + ((opts & 0x000800) ? 4 : 0);
          if (at + count * sampleSize > trun.end) continue;
          for (let i = 0; i < count; i++, at += sampleSize) ticks += u32(dv, at);
        }
      }
    }
    return ticks;
  }
  async function header(file, offset) {
    const bytes = new Uint8Array(await file.slice(offset, Math.min(offset + 16, file.size)).arrayBuffer());
    if (bytes.length < 8) return null;
    const dv = new DataView(bytes.buffer), size32 = dv.getUint32(0), type = str(dv, 4);
    let length = size32, hdr = 8;
    if (size32 === 1) { if (bytes.length < 16) return null; length = u64(dv, 8); hdr = 16; }
    else if (size32 === 0) length = file.size - offset;
    if (!Number.isSafeInteger(length) || length < hdr || length + offset > file.size) return null;
    return {type, offset, length};
  }
  async function sidxDuration(file, h) {
    if (h.length > 512000) return null;
    const bytes = new Uint8Array(await file.slice(h.offset, h.offset + h.length).arrayBuffer());
    const dv = new DataView(bytes.buffer), p = bytes[8] === 1 ? 28 : 20;
    const scale = u32(dv, 16), countAt = p + (bytes[8] === 1 ? 16 : 8) + 2;
    const count = countAt + 2 <= bytes.length ? dv.getUint16(countAt) : 0;
    if (!scale || !count || count > 10000 || countAt + 2 + count * 12 > bytes.length) return null;
    let ticks = 0;
    for (let i = 0; i < count; i++) ticks += u32(dv, countAt + 2 + i * 12 + 4);
    return valid(ticks / scale) ? ticks / scale : null;
  }
  async function probeMp4(file) {
    if (!file || !Number.isSafeInteger(file.size) || file.size < 8 || typeof file.slice !== 'function') return {};
    let offset = 0, result = {}, sidx = null, moofs = [];
    for (let i = 0; i < 5000 && offset + 8 <= file.size; i++) {
      const h = await header(file, offset);
      if (!h) break;
      if (h.type === 'moov' && h.length <= MAX_MOOV_BYTES) {
        const bytes = new Uint8Array(await file.slice(offset, offset + h.length).arrayBuffer());
        result = movie(bytes);
      } else if (h.type === 'sidx' && !sidx) {
        sidx = await sidxDuration(file, h).catch(() => null);
      } else if (h.type === 'moof' && h.length < 1024 * 1024 && moofs.length < 2500) {
        moofs.push(h);
      }
      offset += h.length;
    }
    if (!valid(result.duration) && valid(sidx)) result.duration = sidx;
    if (!valid(result.duration) && result.scale && result.trackId && moofs.length) {
      let ticks = 0;
      for (const h of moofs) {
        const data = new Uint8Array(await file.slice(h.offset, h.offset + h.length).arrayBuffer());
        ticks += moofDuration(data, result.trackId, result.defaultDuration);
      }
      const seconds = ticks / result.scale;
      if (valid(seconds)) result.duration = seconds;
    }
    return {width: result.width || 0, height: result.height || 0, duration: result.duration || null};
  }
  return {probeMp4};
});
