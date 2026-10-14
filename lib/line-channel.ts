// LINE 機器人的「目前是哪家店」:主站 URBANITE 或店家子網域,共用同一套機器人程式。
// webhook、後台 API、排程用 runAsShop() 包起來,line-bot / line-messaging 內部就會用該店家的資料與 LINE 金鑰。
// 只能在伺服器端使用。
import { AsyncLocalStorage } from 'node:async_hooks';
import { createAdminClient } from '@/lib/supabase/admin';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { getIntegrations, getShopSecret } from '@/lib/integrations';
import { scopedClient, shopUrl, URBANITE_SHOP_ID, type Shop } from '@/lib/shop';

type BotShop = { id: string; slug: string; name: string };
const store = new AsyncLocalStorage<BotShop>();
const PLATFORM: BotShop = { id: URBANITE_SHOP_ID, slug: 'urbanite', name: 'URBANITE' };

export function runAsShop<T>(shop: Pick<Shop, 'id' | 'slug' | 'name'> | null | undefined, fn: () => Promise<T>): Promise<T> {
  return store.run(shop ? { id: shop.id, slug: shop.slug, name: shop.name } : PLATFORM, fn);
}

export const botShop = (): BotShop => store.getStore() ?? PLATFORM;
export const botShopId = () => botShop().id;
export const botIsPlatform = () => botShopId() === URBANITE_SHOP_ID;

// 前台網址:主站用設定的網址;店家用子網域
export function botSiteUrl() {
  return botIsPlatform() ? getConfiguredSiteUrl() : shopUrl(botShop().slug, '').replace(/\/$/, '');
}

// LINE Messaging API 金鑰:主站 → 串接設定;店家 → 店家服務設定(LINE 官方帳號)
export async function botChannel(): Promise<{ channelSecret: string; accessToken: string }> {
  if (botIsPlatform()) {
    const cfg = await getIntegrations(['LINE_MESSAGING_CHANNEL_SECRET', 'LINE_MESSAGING_ACCESS_TOKEN'] as const);
    return { channelSecret: cfg.LINE_MESSAGING_CHANNEL_SECRET, accessToken: cfg.LINE_MESSAGING_ACCESS_TOKEN };
  }
  const cfg = await getShopSecret<{ channelSecret?: string; accessToken?: string }>('LINE', botShopId());
  return { channelSecret: cfg?.channelSecret ?? '', accessToken: cfg?.accessToken ?? '' };
}

// LINE 機器人資料表是否已分店家(migration-line-bot-shops.sql 是否已執行);結果快取在記憶體
let schemaReady: boolean | null = null;
export async function lineBotSchemaReady() {
  if (schemaReady) return true;
  const { error } = await createAdminClient().from('line_bot_config').select('shop_id').limit(1);
  schemaReady = !error;
  return schemaReady;
}

export const LINE_BOT_SCHEMA_ERROR = 'LINE 機器人資料庫尚未更新(請執行 supabase/migration-line-bot-shops.sql)';

// LINE 機器人資料表的查詢 client:已分店家 → 依店家過濾;尚未更新 → 只有主站可用(舊資料都是主站的)
export async function lineBotDb() {
  if (await lineBotSchemaReady()) return scopedClient(botShopId());
  if (!botIsPlatform()) throw new Error(LINE_BOT_SCHEMA_ERROR);
  return createAdminClient();
}
