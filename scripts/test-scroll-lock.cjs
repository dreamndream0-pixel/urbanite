const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function style(value = '', priority = '') {
  return { getPropertyValue: () => value, getPropertyPriority: () => priority,
    setProperty: (_key, next, p = '') => { value = next; priority = p; }, removeProperty: () => { value = ''; priority = ''; } };
}
global.document = { documentElement: { style: style('auto', 'important') }, body: { style: style() } };
const listeners = new Map();
global.window = { addEventListener: (name, fn) => listeners.set(name, fn) };
document.addEventListener = (name, fn) => listeners.set(name, fn);
const mod = { exports: {} };
const js = ts.transpileModule(fs.readFileSync('lib/scroll-lock.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('module', 'exports', js)(mod, mod.exports);
for (let round = 0; round < 20; round++) {
  const a = mod.exports.lockScroll(), b = mod.exports.lockScroll();
  assert.equal(document.body.style.getPropertyValue('overflow'), 'hidden');
  listeners.get('touchend')();
  assert.equal(document.body.style.getPropertyValue('overflow'), 'hidden');
  a(); a();
  assert.equal(document.body.style.getPropertyValue('overflow'), 'hidden');
  b();
  assert.equal(document.body.style.getPropertyValue('overflow'), '');
  assert.equal(document.documentElement.style.getPropertyValue('overflow'), 'auto');
  assert.equal(document.documentElement.style.getPropertyPriority('overflow'), 'important');
}
document.body.style.setProperty('overflow', 'hidden');
listeners.get('pageshow')();
assert.equal(document.body.style.getPropertyValue('overflow'), '');
document.documentElement.style.setProperty('overflow', 'hidden');
listeners.get('popstate')();
assert.equal(document.documentElement.style.getPropertyValue('overflow'), '');
console.log('Scroll lock: 20 nested/out-of-order/duplicate-cleanup cycles passed; original styles restored.');
