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
const booking = load('lib/profile-booking-button.ts');
const profile = load('lib/profile-card.ts', { './profile-booking-button': booking });
let owner = { card: { id: 'owned', theme: { bgColor: '#ffffff', bookingButton: { ...booking.DEFAULT_BOOKING_BUTTON, color: '#123456' } } } };
let blocks = [{ id: 'a', sort_order: 5 }, { id: 'b', sort_order: 8 }];
let theme, writes = [], fail = '', readError = false;
const db = { from(table) {
  let update, filters = {};
  const chain = {
    select: () => chain,
    update: data => { update = data; return chain; },
    eq: (key, value) => { filters[key] = value; return chain; },
    then: (resolve, reject) => Promise.resolve().then(() => {
      assert.equal(filters[table === 'profile_cards' ? 'id' : 'card_id'], 'owned');
      if (!update) return { data: structuredClone(blocks), error: readError ? { message: 'read' } : null };
      writes.push({ table, update, filters });
      if (fail === table) { fail = ''; return { error: { message: 'write' } }; }
      if (table === 'profile_cards') theme = update.theme;
      else blocks = blocks.map(b => b.id === filters.id ? { ...b, ...update } : b);
      return { error: null };
    }).then(resolve, reject),
  }; return chain;
} };
const route = load('app/api/profile-card/blocks/route.ts', {
  'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
  '@/lib/supabase/admin': { createAdminClient: () => db },
  '@/lib/card-access': { requireCardOwner: async () => owner },
  '@/lib/profile-card': profile, '@/lib/profile-booking-button': booking,
});
const request = body => new Request('https://example.test/api/profile-card/blocks', { method: 'PUT', body: JSON.stringify(body) });
(async () => {
  for (const body of [null, [], 5]) assert.equal((await route.PUT(request(body))).status, 400);
  for (const ids of [['a'], ['a', 'a'], ['a', 'foreign'], ['a', 'b', booking.BOOKING_EDITOR_ID]]) {
    assert.equal((await route.PUT(request({ ids, booking_after: '' }))).status, 409);
    assert.equal(writes.length, 0);
  }
  for (const after of [null, 5, 'foreign']) assert.equal((await route.PUT(request({ ids: ['a', 'b'], booking_after: after }))).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await route.PUT(request({ ids: ['b', 'a'], booking_after: 'b', card_id: 'other' }))).status, 200);
  assert.equal(theme.bgColor, '#ffffff'); assert.equal(theme.bookingButton.color, '#123456'); assert.equal(theme.bookingButton.after, 'b');
  assert.deepEqual(blocks.map(b => b.sort_order), [1, 0]);
  for (const table of ['profile_cards', 'profile_card_blocks']) {
    const previous = structuredClone(blocks); fail = table;
    assert.equal((await route.PUT(request({ ids: ['a', 'b'], booking_after: '' }))).status, 500);
    assert.deepEqual(blocks, previous, 'Partial failures must attempt to restore prior order');
  }
  const count = writes.length; readError = true;
  assert.equal((await route.PUT(request({ ids: ['a', 'b'] }))).status, 500); assert.equal(writes.length, count);
  readError = false;
  assert.equal((await route.PUT(request({ ids: ['a', 'b'] }))).status, 200, 'Existing ids-only clients remain supported');
  blocks = [];
  assert.equal((await route.PUT(request({ ids: [], booking_after: '' }))).status, 200);
  owner = null;
  assert.equal((await route.PUT(request({ ids: [] }))).status, 401);
  console.log('Profile content order: owner scoping, complete/unique ids, booking anchors, theme preservation, empty lists, compatibility and failure compensation passed. Database mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
