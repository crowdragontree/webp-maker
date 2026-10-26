// Every ready-made look must compile to valid JuicyChat HTML inside the 15,000-character limit, in the stacked layout.
const assert = require('assert'), path = require('path');
const C = require(path.join('..', 'core.js')), Looks = require(path.join('..', 'looks.js'));
const s = C.starter(); assert.equal(s.layout.mode, 'flow'); assert.ok(s.blocks.length && s.blocks.every(b => !b.placement), 'a new design is stacked');
assert.equal(C.initial().layout.mode, 'freeform', 'initial() is unchanged');
const list = Looks.list(); assert.ok(list.length >= 6);
for (const l of list) {
  const d = Looks.design(l.id, C); assert.equal(d.layout.mode, 'flow', l.id);
  const html = C.formatHtml(C.compile(d)), v = C.verifyOutput(html);
  assert.ok(v.valid, `${l.id}: ${v.issues.join(' ')}`); assert.ok(v.length < 9000, `${l.id} is ${v.length} characters`);
  assert.ok(html.includes(Looks.sample.scene) && html.includes(Looks.sample.name), l.id + ' shows the sample text');
}
console.log('Looks test passed: ' + list.length + ' looks are valid, stacked and within the limit.');
