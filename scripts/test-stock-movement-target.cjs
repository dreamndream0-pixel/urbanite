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
const targeting = load('lib/stock-movement-target.ts');
const resolve = targeting.resolveStockMovementTarget;
const plain = { id: 'plain', name: '無規格商品', specs: [], variants: [], inventory: 5 };
const color = { ...plain, id: 'color', specs: [{ name: '顏色', options: ['紅', '藍'] }], variants: [{ options: ['紅'], inventory: 2 }, { options: ['藍'], inventory: 3 }] };
const size = { ...color, id: 'size', specs: [{ name: '尺寸', options: ['S', 'M'] }], variants: [{ options: ['S'], inventory: 2 }, { options: ['M'], inventory: 3 }] };
const empty = { ...plain, variants: [{ options: [], inventory: 5 }] };
assert.deepEqual(resolve(plain), { ok: true, variantKey: '', variantIndex: null });
assert.deepEqual(resolve(empty), { ok: true, variantKey: '', variantIndex: 0 });
assert.equal(resolve(undefined).ok, false);
assert.equal(resolve(plain, '不存在').ok, false);
for (const [product, key] of [[color, '紅'], [size, 'M']]) {
  assert.equal(resolve(product).ok, false);
  assert.equal(resolve(product, key).variantKey, key);
  assert.equal(resolve(product, '錯誤').ok, false);
}
const single = { ...color, variants: [color.variants[0]] };
assert.equal(resolve(single).variantKey, '紅');
const complex = { ...plain, specs: [{ name: '顏色', options: ['紅'] }, { name: '尺寸', options: ['M'] }, { name: '材質', options: ['棉', '麻'] }], variants: [{ options: ['紅', 'M', '棉'], inventory: 2 }, { options: ['紅', 'M', '麻'], inventory: 3 }] };
assert.equal(resolve(complex, '紅 / M').ok, false);
assert.equal(resolve(complex, '紅 / M / 麻').variantIndex, 1);
assert.equal(resolve({ ...color, variants: [color.variants[0], color.variants[0]] }, '紅').ok, false);
assert.equal(resolve({ ...plain, specs: color.specs }).ok, false);
assert.equal(resolve({ ...color, variants: [{ options: [], inventory: 0 }] }).ok, false);
assert.equal(resolve({ ...plain, variants: [null] }).ok, false);
console.log('Stock targets: plain/default, color-only, size-only, singleton, complete multi-dimension, missing/stale/duplicate/incomplete targets passed.');

(async () => {
  let admin = null;
  let product = structuredClone(plain);
  let productError = false;
  let writeError = false;
  const updates = [];
  const movements = [];
  let movementRecord = null;
  let deletes = 0;
  const db = { from(table) {
    if (table === 'products') {
      let requestedId;
      let patch;
      const chain = {
        select: () => chain,
        eq: (_field, id) => { requestedId = id; return chain; },
        maybeSingle: async () => ({ data: product?.id === requestedId ? product : null, error: productError ? { message: 'Read failed' } : null }),
        update: (value) => { patch = value; return chain; },
        then: (done) => { if (!writeError) { updates.push(patch); product = { ...product, ...patch }; } return Promise.resolve({ error: writeError ? { message: 'Write failed' } : null }).then(done); },
      };
      return chain;
    }
    assert.equal(table, 'stock_movements');
    let pending;
    const chain = { insert: (row) => { pending = row; return chain; }, select: () => chain, eq: () => chain,
      maybeSingle: async () => ({ data: movementRecord, error: null }), delete: () => { deletes++; return chain; },
      then: (done) => Promise.resolve({ error: null }).then(done),
      single: async () => { movements.push(pending); return { data: { id: 'movement', ...pending }, error: null }; } };
    return chain;
  } };
  const route = load('app/api/stock-movements/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/supabase/server': { getAdminUser: async () => admin },
    '@/lib/shop': { shopAdminClient: async () => db },
    '@/lib/stock-movement-target': targeting,
  });
  const request = (body) => new Request('https://shop.test/api/stock-movements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: product?.id, quantity: 4, type: 'in', ...body }) });
  assert.equal((await route.POST(request({}))).status, 401);
  admin = { id: 'owner' };
  assert.equal((await route.POST(request({}))).status, 201);
  assert.equal(product.inventory, 9);
  assert.equal(movements.at(-1).variant_key, '');
  for (const [source, key, expectedIndex] of [[empty, '', 0], [single, '', 0], [color, '藍', 1], [size, 'M', 1], [complex, '紅 / M / 麻', 1]]) {
    product = structuredClone(source);
    const before = product.variants.map((v) => v.inventory);
    const response = await route.POST(request({ variant_key: key }));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).variant_key, source.variants[expectedIndex].options.join(' / '));
    assert.deepEqual(product.variants.map((v) => v.inventory), before.map((n, index) => n + (index === expectedIndex ? 4 : 0)));
    assert.equal(product.inventory, product.variants.reduce((n, v) => n + v.inventory, 0));
  }
  product = structuredClone(size);
  assert.equal((await route.POST(request({ type: 'out', variant_key: 'M', quantity: 2 }))).status, 201);
  assert.deepEqual(product.variants.map((v) => v.inventory), [2, 1]);
  assert.equal(movements.at(-1).type, 'out');
  const beforeUpdates = updates.length;
  const beforeMovements = movements.length;
  product = structuredClone(color);
  for (const body of [{}, { variant_key: 'missing' }, { product_id: 'other-shop-product' }, { product_id: '' }, { quantity: 0 }, { quantity: -2 }, { quantity: 1.5 }, { quantity: 'invalid' }]) {
    assert.equal((await route.POST(request(body))).status, 400);
  }
  productError = true;
  assert.equal((await route.POST(request({ variant_key: '紅' }))).status, 500);
  productError = false;
  writeError = true;
  assert.equal((await route.POST(request({ variant_key: '紅' }))).status, 500);
  assert.equal(updates.length, beforeUpdates);
  assert.equal(movements.length, beforeMovements);
  product = { ...color, variants: [color.variants[0], color.variants[0]] };
  writeError = false;
  assert.equal((await route.POST(request({ variant_key: '紅' }))).status, 400);
  assert.equal(updates.length, beforeUpdates);
  product = { ...structuredClone(empty), inventory: 9, variants: [{ options: [], inventory: 9 }] };
  movementRecord = { id: 'undo', product_id: product.id, variant_key: '', type: 'in', quantity: 4 };
  const deletion = () => new Request('https://shop.test/api/stock-movements?id=undo', { method: 'DELETE' });
  assert.equal((await route.DELETE(deletion())).status, 200);
  assert.equal(product.inventory, 5);
  assert.equal(product.variants[0].inventory, 5);
  assert.equal(deletes, 1);
  product = structuredClone(single);
  movementRecord = { ...movementRecord, product_id: product.id };
  const beforeUndo = updates.length;
  assert.equal((await route.DELETE(deletion())).status, 409);
  assert.equal(deletes, 1);
  assert.equal(updates.length, beforeUndo);
  console.log('Stock API: authorization, exact shop product/variant matching, targeted inventory/total/journal updates and rejected-input no-write checks passed. Database mocked.');
  console.log('Stock reversal: empty-options default variant reverses correctly; changed targets are blocked before any write.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
