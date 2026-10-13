import { getShopSecret, setShopSecret } from '@/lib/integrations';
import { resolveOrderNotificationSettings, type OrderNotificationSettings } from './order-notification-settings';
type Stored = { settings: OrderNotificationSettings; since: string };
const KIND = 'ORDER_NOTIFICATIONS';
export async function getOrderNotificationConfig(shopId: string): Promise<Stored | null> {
  const raw = await getShopSecret<Stored>(KIND, shopId, true);
  if (!raw) return null;
  return { settings: resolveOrderNotificationSettings(raw.settings), since: raw.since };
}
export async function saveOrderNotificationConfig(shopId: string, raw: unknown) {
  const old = await getOrderNotificationConfig(shopId);
  const config = { settings: resolveOrderNotificationSettings(raw), since: old?.since || new Date().toISOString() };
  await setShopSecret(KIND, shopId, config);
  return config.settings;
}
