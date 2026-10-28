// HEIC / HEIF pictures (iPhone photos): opened through Windows' own picture codec (WIC), the same one Photos uses. Nothing is installed by the app.
// Windows needs Microsoft's free "HEIF Image Extensions" for this; without them the person is told what to do. Not available on other systems.
const {execFile} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = "$ErrorActionPreference='Stop';Add-Type -AssemblyName PresentationCore;$s=[System.IO.File]::OpenRead($env:JBS_IN);try{$d=[System.Windows.Media.Imaging.BitmapDecoder]::Create($s,[System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,[System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad);$e=New-Object System.Windows.Media.Imaging.PngBitmapEncoder;$e.Frames.Add($d.Frames[0]);$o=[System.IO.File]::Create($env:JBS_OUT);try{$e.Save($o)}finally{$o.Close()}}finally{$s.Close()}";
const NEEDS = 'Windows could not open this HEIC picture. Install "HEIF Image Extensions" from the Microsoft Store (it is free), or save the picture as a JPG or PNG first.';

function toPng(bytes, name) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('HEIC pictures can only be opened on Windows (with the free "HEIF Image Extensions"). Save the picture as a JPG or PNG first.'));
    let dir; try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jbs-heic-')); } catch (e) { return reject(new Error('Could not make a temporary folder: ' + e.message)); }
    const src = path.join(dir, 'in.heic'), out = path.join(dir, 'out.png');
    const done = (err, val) => { try { fs.rmSync(dir, {recursive: true, force: true}); } catch (_) { /* temp folder */ } err ? reject(err) : resolve(val); };
    try { fs.writeFileSync(src, bytes); } catch (e) { return done(e); }
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], {env: {...process.env, JBS_IN: src, JBS_OUT: out}, timeout: 90000, windowsHide: true}, err => {
      if (err || !fs.existsSync(out)) return done(new Error(NEEDS));
      try { done(null, fs.readFileSync(out)); } catch (e) { done(new Error(NEEDS)); }
    });
  });
}
module.exports = {toPng};
