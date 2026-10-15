// 促銷管理 → 活動管理:商品頁價格上方的促銷文字(例如「全店消費滿 $2,000 免運費」)。
// 存在 site_settings.promo_notices(jsonb);沒設定過時用預設的一則免運文字。
export type PromoNotice = { id: string; text: string; active: boolean };

export const DEFAULT_PROMO_NOTICES: PromoNotice[] = [
  { id: 'free-shipping', text: '全店消費滿 $2,000 免運費', active: true },
];

export const MAX_PROMO_NOTICES = 10;

export function resolvePromoNotices(raw: unknown): PromoNotice[] {
  if (!Array.isArray(raw)) return DEFAULT_PROMO_NOTICES;
  return raw
    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
    .map((n, i) => ({
      id: typeof n.id === 'string' && n.id ? n.id.slice(0, 40) : `notice-${i}`,
      text: typeof n.text === 'string' ? n.text.trim().slice(0, 120) : '',
      active: n.active !== false,
    }))
    .filter((n) => n.text)
    .slice(0, MAX_PROMO_NOTICES);
}
