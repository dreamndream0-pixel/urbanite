/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const mod = { exports: {} };
const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/cart-stock.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('module', 'exports', js)(mod, mod.exports);
const { stockOf, remainingStock, cartItemLimit } = mod.exports;
const product = { id: 'pack', status: '上架中', inventory: 50, variants: [{ options: ['1入'], inventory: 3 }, { options: ['5入'], inventory: 1 }] };
assert.equal(stockOf(product, '1入'), 3);
assert.equal(stockOf(product, '5入'), 1);
assert.equal(stockOf(product, 'unknown'), 0);
assert.equal(stockOf(undefined, '1入'), 0, 'Missing catalog data must not grant unlimited quantities');
assert.equal(stockOf({ ...product, variants: [...product.variants, product.variants[0]] }, '1入'), 0, 'Ambiguous variant is not purchasable');
for (const inventory of [-1, NaN, Infinity, undefined]) assert.equal(stockOf({ ...product, variants: [], inventory }, '標準款'), 0);
assert.equal(stockOf({ ...product, variants: [], inventory: 2.9 }, '標準款'), 2);
for (const status of ['已下架', '已售完', 'SOLD OUT']) assert.equal(stockOf({ ...product, status }, '1入'), 0);
assert.equal(stockOf({ ...product, sale_mode: '預購' }, '1入'), 3, 'Match server stock check for preorders');
const cart = [{ productId: 'pack', variant: '1入', quantity: 2 }, { productId: 'pack', variant: '5入', quantity: 1 }];
assert.equal(remainingStock(product, '1入', cart), 1);
assert.equal(remainingStock(product, '5入', cart), 0);
assert.equal(cartItemLimit(cart[0], cart, product), 3);
assert.equal(cartItemLimit(cart[1], cart, product), 1);
const plain = { ...product, variants: [], inventory: 3 };
const aliases = [{ productId: 'pack', variant: '標準款', quantity: 2 }, { productId: 'pack', variant: '舊規格名稱', quantity: 1 }];
assert.equal(remainingStock(plain, 'any', aliases), 0, 'Unspecified products share one stock bucket');
assert.equal(cartItemLimit(aliases[0], aliases, plain), 2);
assert.equal(cartItemLimit(aliases[1], aliases, plain), 1);
assert.equal(remainingStock(product, '1入', [{ productId: 'other', variant: '1入', quantity: 99 }]), 3);
assert.equal(remainingStock(product, '1入', [{ productId: 'pack', variant: '1入', quantity: 9 }]), 0);
console.log('Cart stock: exact variants, plain products, shared stock aliases, existing cart deductions, missing/ambiguous products, sold-out status, integer limits and preorder/server consistency passed.');
