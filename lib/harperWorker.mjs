/* Harper worker (v1.4.1): runs Harper (Automattic, Apache-2.0) on its own thread so the app never waits on it.
 * Harper is a rule-based grammar checker compiled to WebAssembly; it ships inside the app (vendor/harper), nothing is downloaded.
 * Messages: {id, text} -> {id, ok, lints: [{offset, length, kind, message, replacements}]} (offsets in the text's own characters). */
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = workerData.vendor;
const { LocalLinter, Dialect } = await import(pathToFileURL(path.join(dir, 'index.js')).href);
const { BinaryModuleImpl } = await import(pathToFileURL(path.join(dir, (await import('node:fs')).readdirSync(dir).find(f => /^BinaryModule-.*\.js$/.test(f)))).href);
const binary = BinaryModuleImpl.create(pathToFileURL(path.join(dir, 'harper_wasm_bg.wasm')).href, 'full');
const linter = new LocalLinter({ binary, dialect: Dialect.American });
await linter.setup();

parentPort.on('message', async msg => {
  try {
    const text = String(msg.text || ''), conv = i => i;   // harper.js already gives positions in the text's own (JavaScript) characters, emoji included
    const lints = await linter.lint(text, { language: 'plaintext' });
    const out = lints.map(l => {
      const s = l.span(), a = conv(s.start), b = conv(s.end);
      const reps = l.suggestions().map(x => { const k = x.kind(); return k === 1 ? '' : k === 2 ? text.slice(a, b) + x.get_replacement_text() : x.get_replacement_text(); });
      const o = { offset: a, length: b - a, kind: l.lint_kind(), message: l.message(), replacements: [...new Set(reps)] };
      l.free(); return o;
    });
    parentPort.postMessage({ id: msg.id, ok: true, lints: out });
  } catch (er) { parentPort.postMessage({ id: msg.id, ok: false, error: String(er && er.message || er) }); }
});
parentPort.postMessage({ ready: true });
