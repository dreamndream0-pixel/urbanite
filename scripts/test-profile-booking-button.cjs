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
const plan = load('lib/card-plan.ts');
const { resolveBookingButton: resolve, bookingButtonIndex: index, DEFAULT_BOOKING_BUTTON: defaults } = booking;
assert.deepEqual(resolve(undefined), defaults);
assert.deepEqual(resolve(null), defaults);
assert.equal(resolve({ label: '  預約美甲  ', visible: false }).label, '預約美甲');
assert.equal(resolve({ label: ' '.repeat(10) }).label, '線上預約');
assert.equal(resolve({ label: 'a'.repeat(120) }).label.length, 80);
assert.equal(resolve({ color: 'url(https://evil.invalid)', textColor: 'red', style: 'script', shape: 'fake' }).color, '');
assert.equal(resolve({ color: '#AbC123' }).color, '#AbC123');
assert.equal(resolve({ visible: false }).visible, false);
const blocks = ['a', 'hidden', 'image', 'c'].map((id) => ({ id }));
const visible = blocks.filter((b) => b.id !== 'hidden');
assert.equal(index(blocks, visible, ''), 0);
assert.equal(index(blocks, visible, 'a'), 1);
assert.equal(index(blocks, visible, 'hidden'), 1);
assert.equal(index(blocks, visible, 'image'), 2);
assert.equal(index(blocks, visible, 'deleted'), 3);
assert.equal(index(blocks, visible, booking.BOOKING_BUTTON_END), 3);
assert.equal(index([], [], 'deleted'), 0);
const editorIds = (items) => items.map(item => item.id);
const unified = booking.profileContentItems(blocks, 'image');
assert.deepEqual(editorIds(unified), ['a', 'hidden', 'image', booking.BOOKING_EDITOR_ID, 'c']);
assert.equal(booking.profileContentOrder(unified).after, 'image');
assert.deepEqual(booking.profileContentOrder(unified).blocks, blocks);
for (const after of ['', 'hidden', 'deleted', booking.BOOKING_BUTTON_END]) {
  const items = booking.profileContentItems(blocks, after);
  assert.equal(items.filter(item => !item.block).length, 1);
  assert.equal(booking.profileContentOrder(items).blocks.length, blocks.length);
}
assert.equal(booking.profileContentOrder(booking.profileContentItems([], 'deleted')).after, '');
const moved = [unified[0], unified[1], unified[3], unified[2], unified[4]];
assert.equal(booking.profileContentOrder(moved).after, 'hidden');
const config = resolve({ after: 'image', label: '預約美甲', style: 'outline', shape: 'square', color: '#123456', shadow: false });
const theme = profile.resolveTheme({ bookingButton: config, bgColor: '#abcdef' });
assert.deepEqual(theme.bookingButton, config);
for (const template of profile.CARD_TEMPLATES) assert.deepEqual(profile.resolveTheme({ ...theme, ...template.theme }).bookingButton, config);
const free = load('lib/card-free-view.ts', { '@/lib/profile-card': profile, '@/lib/card-plan': plan, '@/lib/profile-booking-button': booking });
const freeCard = free.applyFreeView({ theme, show_footer_logo: false }, []).card;
assert.equal(freeCard.theme.bookingButton.after, 'image');
assert.equal(freeCard.theme.bookingButton.label, '預約美甲');
assert.equal(freeCard.theme.bookingButton.style, 'accent');

(async () => {
  let business = null;
  let schedule = { services: [], hours: [] };
  const link = load('lib/booking/card-link.ts', { './server': { getPublicBusiness: async () => business, loadSchedule: async () => schedule } });
  assert.equal(await link.getCardBookingHref('studio'), '');
  business = { card: { slug: 'studio' }, business: { id: 'business' } };
  assert.equal(await link.getCardBookingHref('studio'), '');
  schedule = { services: [{}], hours: [] };
  assert.equal(await link.getCardBookingHref('studio'), '');
  schedule.hours = [{}];
  assert.equal(await link.getCardBookingHref('studio'), '/@studio/book');

  let owner = { card: { id: 'owned-card', slug: 'studio', theme: { bgColor: '#abcdef', bookingButton: defaults } }, plan: { limits: plan.PRO_LIMITS, isAdmin: true } };
  let saved;
  let fail = false;
  const db = { from(table) {
    assert.ok(['profile_cards', 'profile_card_blocks'].includes(table));
    const chain = {
      select: () => chain, order: () => chain,
      update: (data) => { saved = data; return chain; },
      eq: (field, value) => { assert.equal(value, 'owned-card', 'Only the authenticated owner card may be accessed'); return chain; },
      single: async () => ({ data: { ...owner.card, ...saved }, error: fail ? { message: 'Write failed' } : null }),
      then: (done) => Promise.resolve({ data: [], error: null }).then(done),
    }; return chain;
  } };
  const route = load('app/api/profile-card/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/card-access': { requireCardOwner: async () => owner },
    '@/lib/card-plan': plan, '@/lib/profile-card': profile, '@/lib/profile-booking-button': booking, '@/lib/booking/card-link': link,
  });
  const req = (body) => new Request('https://site.test/api/profile-card', { method: 'PATCH', body: JSON.stringify(body) });
  assert.equal((await (await route.GET()).json()).bookingHref, '/@studio/book');
  const result = await route.PATCH(req({ booking_button: { ...config, href: 'https://evil.invalid' }, id: 'another-card', owner_user_id: 'another-user' }));
  assert.equal(result.status, 200);
  assert.equal(saved.theme.bgColor, '#abcdef');
  assert.deepEqual(saved.theme.bookingButton, config);
  assert.equal(saved.id, undefined);
  assert.equal(saved.theme.bookingButton.href, undefined);
  assert.equal(saved.owner_user_id, undefined);
  assert.equal((await route.PATCH(req({ theme: { bgColor: '#ffffff', bookingButton: config } }))).status, 200);
  assert.deepEqual(saved.theme.bookingButton, config);
  owner.plan = { limits: plan.FREE_LIMITS, isAdmin: false };
  await route.PATCH(req({ booking_button: config }));
  assert.equal(saved.theme.bookingButton.after, 'image');
  assert.equal(saved.theme.bookingButton.style, 'accent');
  await route.PATCH(req({ theme: { template: 'ivory', bookingButton: config } }));
  assert.equal(saved.theme.bookingButton.after, 'image');
  assert.equal(saved.theme.bookingButton.color, '');
  fail = true;
  assert.equal((await route.PATCH(req({ booking_button: config }))).status, 400);
  owner = null;
  assert.equal((await route.GET()).status, 401);
  assert.equal((await route.PATCH(req({ booking_button: config }))).status, 401);
  console.log('Booking button: defaults, safe options, block anchors (hidden/deleted/empty), template and free-plan retention, availability, owner-only API persistence, failure and authorization passed. Database mocked.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
