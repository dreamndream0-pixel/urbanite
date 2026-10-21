/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sharp = require('sharp');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', js)((name) => { if (name in mocks) return mocks[name]; if (name.startsWith('.') || name.startsWith('@/')) throw new Error(`Unexpected import ${name}`); return require(name); }, mod, mod.exports);
  return mod.exports;
}
const card = load('lib/membership-card.ts');
const loyalty = load('lib/loyalty-settings.ts', { './membership-card': card });
const legacy = loyalty.resolveLoyalty({ enabled: true, tiers: loyalty.DEFAULT_TIERS });
assert.equal(card.MEMBERSHIP_DESIGNS.length, 10);
assert.equal(card.MEMBERSHIP_ICONS.length, 9);
assert.equal(legacy.tiers[0].cardDesign, 'champagne');
assert.equal(legacy.tiers[1].cardDesign, 'silver');
assert.equal(legacy.tiers[2].cardDesign, 'gold');
assert.equal(loyalty.DEFAULT_TIERS[0].cardDesign, undefined, 'Defaults must not be mutated');
for (const spend of [0, 1500, 3000, 9999, 10000, 100000]) {
  const tier = loyalty.tierForSpend(legacy, spend);
  assert.equal(tier.key, spend >= 10000 ? 'gold' : spend >= 3000 ? 'silver' : 'normal');
}
assert.equal(loyalty.nextTier(legacy, legacy.tiers[2]), null);
assert.equal(loyalty.earnAmount(1000, 2), 20);
assert.equal(loyalty.maxRedeem(legacy, 1000, 500), 200);
for (const [spend, target, percent] of [[0, 3000, 0], [1500, 3000, 50], [9000, 3000, 100], [-1, 3000, 0], [NaN, 3000, 0], [0, null, 100]]) assert.equal(card.membershipProgress(spend, target), percent);
const custom = loyalty.resolveLoyalty({ ...legacy, card: { enabled: false, title: '品牌權益', subtitle: '每次光臨都值得', actionLabel: '會員明細' }, tiers: legacy.tiers.map((tier) => ({ ...tier, cardDesign: 'emerald', benefits: [{ label: '{rate}% 回饋，門檻 {threshold}', icon: 'heart', image: 'https://assets.example/icon.webp' }] })) });
assert.equal(custom.card.enabled, false);
assert.equal(custom.tiers[0].cardDesign, 'emerald');
assert.equal(custom.tiers[0].benefits[0].icon, 'heart');
assert.equal(card.membershipBenefitLabel(custom.tiers[1].benefits[0].label, custom.tiers[1]), '2% 回饋，門檻 3,000');
assert.deepEqual(loyalty.resolveLoyalty(JSON.parse(JSON.stringify(custom))), custom);
assert.equal(card.resolveMembershipBenefits([{ icon: 'javascript:evil', image: 'javascript:alert(1)', label: 'x'.repeat(100) }])[0].image, '');
assert.equal(card.resolveMembershipBenefits([{ icon: 'invalid' }])[0].icon, 'coins');
assert.equal(card.resolveMembershipBenefits([{ label: 'x'.repeat(100) }])[0].label.length, 60);
assert.equal(card.membershipImage('https://user:password@assets.example/icon.png'), '');
assert.equal(card.membershipImage('data:image/svg+xml,evil'), '');
assert.equal(card.membershipDesign('invalid').id, 'black-gold');
assert.equal(card.resolveMembershipCard({ actionLabel: '' }).actionLabel, '查看權益');
assert.equal(card.resolveMembershipCard({}).title, 'VIP membership');
assert.equal(card.resolveMembershipCard({ title: '會員專屬禮遇' }).title, 'VIP membership');
assert.equal(card.resolveMembershipCard({ title: '品牌 VIP' }).title, '品牌 VIP', 'Preserve custom headings');
assert.equal(card.resolveMembershipCard({ intro: '可編輯副標語' }).intro, '可編輯副標語');
assert.equal(card.resolveMembershipBenefits([{ description: '專屬回饋' }])[0].description, '專屬回饋');
for (const [months, label] of [[12, '年'], [6, '6個月'], [24, '2年'], [1, '1個月'], [NaN, '年']]) assert.equal(card.membershipPeriod(months), label);
assert.equal(new Set(Object.values(card.MEMBERSHIP_BADGES)).size, 10);
assert.equal(new Set(Object.values(card.MEMBERSHIP_BACKDROPS)).size, 10);
assert.ok(card.MEMBERSHIP_DESIGNS.every((design) => /^#[0-9a-f]{6}$/i.test(card.MEMBERSHIP_BACKDROPS[design.id])));
const scroll = load('lib/page-scroll.ts');
const originalDocument = global.document;
try {
  let form = false;
  global.document = { documentElement: { getAttribute: (key) => key === 'data-document-form' ? form ? 'membership' : null : 'ios-chrome' } };
  assert.equal(scroll.bodyScrolls(), true);
  form = true; assert.equal(scroll.bodyScrolls(), false, 'Native form mode disables nested body scrolling');
  form = false; assert.equal(scroll.bodyScrolls(), true, 'Leaving the form restores the existing iPhone scrolling mode');
} finally { if (originalDocument === undefined) delete global.document; else global.document = originalDocument; }

(async () => {
  for (const design of card.MEMBERSHIP_DESIGNS) {
    const file = path.join(__dirname, '../public/membership/cards', `${design.file}.webp`);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, 1448); assert.equal(metadata.height, 1086);
    assert.ok(fs.existsSync(file.replace('.webp', '.thumb.webp')));
    const circles = card.MEMBERSHIP_BENEFIT_CIRCLES[design.id];
    assert.equal(circles.length, 3, `${design.id}: each original ring has its own placement`);
    const { data: rgb, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const [x, y, radius] of circles) {
      const pixel = (px, py, channel) => rgb[(Math.round(py) * info.width + Math.round(px)) * info.channels + channel];
      const edges = Array.from({ length: 96 }, (_, index) => {
        const angle = index * Math.PI / 48;
        let squared = 0;
        for (let c = 0; c < 3; c++) {
          const delta = pixel(x + (radius + 2) * Math.cos(angle), y + (radius + 2) * Math.sin(angle), c)
            - pixel(x + (radius - 2) * Math.cos(angle), y + (radius - 2) * Math.sin(angle), c);
          squared += delta * delta;
        }
        return Math.sqrt(squared);
      }).sort((a, b) => a - b);
      assert.ok(edges.slice(12, 84).reduce((a, b) => a + b) / 72 > 85, `${design.id}: (${x}, ${y}) must match an actual circular border in the source image`);
    }
    if (process.argv[2]) {
      const original = await sharp(path.join(process.argv[2], `${design.file}.png`)).ensureAlpha().raw().toBuffer();
      const stored = await sharp(file).ensureAlpha().raw().toBuffer();
      assert.ok(original.equals(stored), `${design.id}: Original artwork pixels must remain unchanged`);
    }
  }
  for (const icon of card.MEMBERSHIP_ICONS) {
    const svg = fs.readFileSync(path.join(__dirname, '../public/membership/icons', `${icon.id}.svg`), 'utf8');
    assert.ok(svg.startsWith('<svg'));
    assert.ok(!/script|foreignObject|onload|href=|<image/i.test(svg));
  }
  let user = null; const scopes = [];
  const route = load('app/api/me/credit/route.ts', {
    'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
    '@/lib/supabase/server': { getSessionUser: async () => user },
    '@/lib/shop': { getCurrentShop: async () => ({ id: 'shop-a', name: '品牌 A' }), scopedClient: (shop) => { assert.equal(shop, 'shop-a'); return { from(table) { assert.equal(table, 'customers'); const chain = { select: () => chain, eq: (key, value) => { scopes.push([key, value]); return chain; }, maybeSingle: async () => ({ data: { name: '王小美' } }) }; return chain; } }; } },
    '@/lib/loyalty': { getLoyalty: async (id) => { assert.equal(id, 'shop-a'); return legacy; }, creditSummary: async (shop, id) => { assert.equal(shop, 'shop-a'); assert.equal(id, 'user-a'); return { balance: 30, pending: 10 }; }, memberTier: async (_db, id) => { assert.equal(id, 'user-a'); return { tier: legacy.tiers[0], next: legacy.tiers[1], spend: 1500, toNext: 1500, keptUntil: null }; } },
  });
  assert.equal((await route.GET()).status, 401);
  user = { id: 'user-a', user_metadata: { name: '登入名稱' } };
  const response = await route.GET(); const data = await response.json();
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(data.card.memberName, '王小美'); assert.equal(data.card.brandName, '品牌 A');
  assert.equal(data.spend, 1500); assert.equal(data.toNext, 1500); assert.equal(data.balance, 30);
  assert.deepEqual(scopes, [['user_id', 'user-a']]);
  assert.ok(!JSON.stringify(data).includes('accessToken'));
  console.log('Membership cards: ten original backgrounds, safe SVG assets, legacy settings, configurable styles/benefits, actual member data, tenant/user scope, upgrade progress and unchanged credit calculations passed. All API data mocked.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
