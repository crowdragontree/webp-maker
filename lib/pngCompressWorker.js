// Runs the Image Compressor away from the app window, so the window never freezes while a big picture is packed.
const { parentPort } = require('worker_threads');
const PC = require('./pngCompress');
parentPort.on('message', ({id, file, target, png, outFile}) => {
  try {
    const r = PC.compressFile(file, {target, pngBytes: png, outFile, onStep: step => parentPort.postMessage({id, step})});
    parentPort.postMessage({id, done: true, result: {ok: true, ...r}});
  } catch (e) {
    parentPort.postMessage({id, done: true, result: {ok: false, file, error: e && e.message ? e.message : String(e)}});
  }
});
