// LINE 機器人分店家:runAsShop 情境、店家金鑰/網址、資料庫未更新時的保護。不連線 LINE 或資料庫。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let checks = 0;
const ok = (a, b) => { assert.deepEqual(a, b); checks++; };

function load(path, mocks) {
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)((key) => {
    if (key === 'node:async_hooks') return require('node:async_hooks');
    if (!(key in mocks)) throw new Error(`Unexpected import ${key}`);
    return mocks[key];
  }, mod, mod.exports);
  return mod.exports;
}

const PLATFORM = '00000000-0000-0000-0000-000000000001';
let schemaError = null;
const scoped = [];
const channel = load('lib/line-channel.ts', {
  '@/lib/supabase/admin': { createAdminClient: () => ({ admin: true, from: () => ({ select: () => ({ limit: async () => ({ error: schemaError }) }) }) }) },
  '@/lib/site-url': { getConfiguredSiteUrl: () => 'https://www.example.test' },
  '@/lib/integrations': {
    getIntegrations: async () => ({ LINE_MESSAGING_CHANNEL_SECRET: 'platform-secret', LINE_MESSAGING_ACCESS_TOKEN: 'platform-token' }),
    getShopSecret: async (kind, id) => (kind === 'LINE' && id === 'shop-a' ? { channelSecret: 'a-secret', accessToken: 'a-token' } : null),
  },
  '@/lib/shop': { URBANITE_SHOP_ID: PLATFORM, shopUrl: (slug, path) => `https://${slug}.example.test${path}`, scopedClient: (id) => { scoped.push(id); return { scopedFor: id }; } },
});

(async () => {
  // 預設(沒包 runAsShop)= 主站
  ok(channel.botShopId(), PLATFORM);
  ok(channel.botIsPlatform(), true);
  ok(channel.botSiteUrl(), 'https://www.example.test');
  ok((await channel.botChannel()).accessToken, 'platform-token');

  const shopA = { id: 'shop-a', slug: 'chue', name: 'CHUÉ' };
  await channel.runAsShop(shopA, async () => {
    ok(channel.botShopId(), 'shop-a');
    ok(channel.botIsPlatform(), false);
    ok(channel.botShop().name, 'CHUÉ');
    ok(channel.botSiteUrl(), 'https://chue.example.test');
    ok(await channel.botChannel(), { channelSecret: 'a-secret', accessToken: 'a-token' });
    // 平行的另一家店不會互相干擾
    await channel.runAsShop({ id: 'shop-b', slug: 'b', name: 'B' }, async () => {
      ok(channel.botShopId(), 'shop-b');
      ok(await channel.botChannel(), { channelSecret: '', accessToken: '' });
    });
    ok(channel.botShopId(), 'shop-a');
  });
  ok(channel.botShopId(), PLATFORM);

  // 資料庫尚未更新:主站沿用舊資料表(不加店家條件),店家擋下
  schemaError = { message: 'column shop_id does not exist' };
  ok((await channel.lineBotDb()).admin, true);
  await assert.rejects(() => channel.runAsShop(shopA, () => channel.lineBotDb()), (e) => e.message === channel.LINE_BOT_SCHEMA_ERROR); checks++;

  // 更新後:一律依店家過濾
  schemaError = null;
  ok(await channel.runAsShop(shopA, () => channel.lineBotDb()), { scopedFor: 'shop-a' });
  ok(await channel.lineBotDb(), { scopedFor: PLATFORM });

  // LINE 機器人資料表都在店家過濾清單裡
  const shopSource = fs.readFileSync('lib/shop.ts', 'utf8');
  for (const t of ['line_bot_config', 'line_bot_rules', 'line_rich_menus', 'line_broadcasts', 'line_events']) ok(shopSource.includes(`'${t}'`), true);

  console.log(`Passed ${checks} LINE bot shop-isolation checks; no live LINE or database requests.`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
