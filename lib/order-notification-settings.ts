export const ORDER_NOTICE_EVENTS = [
  { key: 'created', label: '下單成立' }, { key: 'ready', label: '寄件準備' },
  { key: 'shipped', label: '已出貨' }, { key: 'paid', label: '已收款' },
  { key: 'arrived', label: '已到貨／到店' }, { key: 'picked_up', label: '已取貨' },
  { key: 'completed', label: '訂單完成' }, { key: 'cancelled', label: '訂單取消' },
  { key: 'refunded', label: '退款' }, { key: 'return_requested', label: '退貨申請' },
] as const;
// 後來新增的事件:舊的設定沒有這一列時預設開啟
const DEFAULT_ON: readonly string[] = ['return_requested'];
export type OrderNoticeEvent = typeof ORDER_NOTICE_EVENTS[number]['key'];
export type NoticeAudience = 'buyer' | 'seller';
export type NoticeChannel = 'email' | 'line';
export type OrderNotificationSettings = {
  enabled: Record<NoticeChannel, boolean>;
  rules: Record<OrderNoticeEvent, Record<NoticeAudience, Record<NoticeChannel, boolean>>>;
};
export function resolveOrderNotificationSettings(raw: unknown): OrderNotificationSettings {
  const value = raw && typeof raw === 'object' ? raw as Partial<OrderNotificationSettings> : {};
  return {
    enabled: { email: value.enabled?.email === true, line: value.enabled?.line === true },
    rules: Object.fromEntries(ORDER_NOTICE_EVENTS.map(({ key }) => [key, Object.fromEntries((['buyer', 'seller'] as const).map((audience) => [audience, DEFAULT_ON.includes(key) && !value.rules?.[key] ? { email: true, line: true } : { email: value.rules?.[key]?.[audience]?.email === true, line: value.rules?.[key]?.[audience]?.line === true }]))])) as OrderNotificationSettings['rules'],
  };
}
export function noticeEnabled(config: OrderNotificationSettings, event: OrderNoticeEvent, audience: NoticeAudience, channel: NoticeChannel) {
  return config.enabled[channel] && config.rules[event][audience][channel];
}
