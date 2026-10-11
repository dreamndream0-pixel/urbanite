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
const blocks = load('lib/storefront-blocks.ts');
const design = load('lib/storefront-template.ts', { './storefront-blocks': blocks });
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
const state = load('lib/site-theme-state.ts', { './site-theme': theme });
const list = blocks.starterBlocks(design.DEFAULT_STOREFRONT);
assert.equal(list.length, 4);
assert.deepEqual(blocks.moveBlock(list, 0, 2).map((b) => b.id), ['categories', 'products', 'hero', 'feature']);
assert.deepEqual(blocks.moveBlock(list, -1, 2), list);
assert.equal(blocks.resolveBlocks([]).length, 0);
assert.equal(blocks.resolveBlocks(null), undefined);
assert.equal(blocks.resolveBlocks(Array(25).fill(list[0])).length, 20);
assert.equal(new Set(blocks.resolveBlocks([list[0], list[0]]).map((b) => b.id)).size, 2);
for (const url of ['javascript:alert(1)', 'data:text/html,hi', '//evil.test', '/\\evil.test', 'https://user:pass@evil.test', 'http://example.com']) assert.equal(blocks.safeBlockUrl(url), '');
for (const url of ['https://example.com/image.png', '/products/123', '#store-products']) assert.equal(blocks.safeBlockUrl(url), url);
const bounded = blocks.resolveBlocks([{ ...list[0], spacing: Infinity, columns: 9, limit: -1, background: 'red; color:blue', title: 'x'.repeat(999) }])[0];
assert.equal(bounded.spacing, 24);
assert.equal(bounded.columns, 2);
assert.equal(bounded.limit, 1);
assert.equal(bounded.background, '');
assert.equal(bounded.title.length, 120);
const published = theme.resolveSiteTheme({ storefront: { enabled: true, title: 'Published', blocks: list } });
const draft = theme.resolveSiteTheme({ ...published, storefront: { ...published.storefront, title: 'Private draft', blocks: list.slice(1) } });
const stored = state.draftSiteTheme(published, draft);
assert.deepEqual(theme.resolveSiteTheme(stored), published);
assert.deepEqual(state.editableSiteTheme(stored), draft);
assert.equal('draft' in theme.resolveSiteTheme(stored), false);
assert.deepEqual(theme.resolveSiteTheme(draft), draft);
console.log('Block validation, ordering, URL safety and draft isolation: 25 checks passed');
