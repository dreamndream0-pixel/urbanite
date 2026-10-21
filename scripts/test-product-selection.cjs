/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, imports = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)((name) => { if (name in imports) return imports[name]; throw new Error(`Unexpected import ${name}`); }, mod, mod.exports);
  return mod.exports;
}
const stock = load('lib/cart-stock.ts');
const selection = load('lib/product-selection.ts', { './cart-stock': stock });
const product = { id: 'matrix', status: '上架中', inventory: 3, specs: [{ name: '顏色', options: ['紅', '藍', '白'], display: 'image' }, { name: '尺寸', options: ['S', 'M'] }], variants: [
  { options: ['紅', 'S'], inventory: 0 }, { options: ['紅', 'M'], inventory: 2 }, { options: ['藍', 'S'], inventory: 1 }, { options: ['藍', 'M'], inventory: 0 }, { options: ['白', 'S'], inventory: 0 },
], color_images: { 紅: '/red.webp', 藍: '/blue.webp', S: '/small.webp' } };
assert.deepEqual(selection.initialSpecSelection(product), ['紅', 'M']);
assert.equal(selection.specOptionAvailable(product, 0, '藍'), true);
assert.equal(selection.specOptionAvailable(product, 0, '白'), false);
assert.deepEqual(selection.selectSpecOption(product, ['紅', 'M'], 0, '藍'), ['藍', 'S']);
assert.deepEqual(selection.selectSpecOption(product, ['藍', 'S'], 1, 'M'), ['紅', 'M']);
assert.deepEqual(selection.selectSpecOption(product, ['紅', 'M'], 0, '紅'), ['紅', 'M']);
assert.deepEqual(selection.resolveSpecSelection(product, ['舊名稱']), ['紅', 'M']);
assert.deepEqual(selection.resolveSpecSelection(product, ['藍', 'M']), ['藍', 'M'], 'Do not silently change a still-valid sold-out choice');
assert.equal(selection.selectedSpecImage(product, ['藍', 'S'], '藍'), '/blue.webp');
assert.equal(selection.selectedSpecImage(product, ['藍', 'S'], 'S'), '/small.webp');
assert.equal(selection.selectedSpecImage(product, ['藍', 'M'], '紅'), '/blue.webp');
assert.equal(selection.selectedSpecImage(product, ['白', 'M']), '');
assert.deepEqual(selection.initialSpecSelection({ ...product, specs: [], variants: [] }), []);
const changed = { ...product, specs: [{ name: '入數', options: ['1入', '5入'] }], variants: [{ options: ['1入'], inventory: 0 }, { options: ['5入'], inventory: 2 }] };
assert.deepEqual(selection.resolveSpecSelection(changed, ['紅', 'M']), ['5入']);
const ambiguous = { ...changed, variants: [changed.variants[1], changed.variants[1]] };
assert.equal(selection.specOptionAvailable(ambiguous, 0, '5入'), false);
console.log('Shared product selection: default stock, valid selections, changed spec schemas, image preference, cross-dimension fallback, sold-out and duplicate variants passed.');
