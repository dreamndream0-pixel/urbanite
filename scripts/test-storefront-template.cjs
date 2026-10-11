const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, imports = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)((name) => imports[name] || require(name), mod, mod.exports);
  return mod.exports;
}
const design = load('lib/storefront-template.ts');
const theme = load('lib/site-theme.ts', { './storefront-template': design });
assert.equal(theme.resolveSiteTheme(null).storefront.enabled, false);
assert.equal(design.resolveStorefront({ enabled: 'true', style: 'unknown' }).enabled, false);
assert.equal(design.resolveStorefront({ style: '__proto__' }).style, 'classic');
assert.equal(design.resolveStorefront({ title: '<script>hello</script>' }).title, '<script>hello</script>'); // React renders plain text.
assert.equal(design.resolveStorefront({ title: 42 }).title, design.DEFAULT_STOREFRONT.title);
assert.equal(design.resolveStorefront({ title: 'x'.repeat(200) }).title.length, 80);
assert.equal(design.resolveStorefront({ title: '  ' }).title, '');
for (const template of design.STOREFRONT_TEMPLATES) {
  const saved = theme.resolveSiteTheme({ storefront: { ...design.DEFAULT_STOREFRONT, enabled: true, style: template.key, title: '自訂標題' } });
  assert.equal(saved.storefront.style, template.key);
  assert.equal(saved.storefront.title, '自訂標題');
  assert.deepEqual(theme.resolveSiteTheme(JSON.parse(JSON.stringify(saved))), saved);
}
console.log('Storefront configuration: 25 checks passed');
