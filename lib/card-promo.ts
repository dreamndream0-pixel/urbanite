import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CardTier } from '@/lib/card-plan';

// 名片方案限時免費:活動期間所有會員都能使用指定等級(目前開放 U Plus)
export type CardPromo = { enabled: boolean; tier: CardTier; start: string; end: string; note: string };

export const EMPTY_PROMO: CardPromo = { enabled: false, tier: 'plus', start: '', end: '', note: '' };

const isoOrEmpty = (v: unknown) => {
  const t = typeof v === 'string' && v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
};

export function cleanPromo(raw: unknown): CardPromo {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    tier: 'plus', // U Pro / U Max 還沒開放購買,先只開放 U Plus
    start: isoOrEmpty(o.start),
    end: isoOrEmpty(o.end),
    note: typeof o.note === 'string' ? o.note.trim().slice(0, 60) : '',
  };
}

// 進行中:已開啟、已到開始時間、還沒到結束時間(一定要有結束時間)
export function promoActive(p: CardPromo, now = Date.now()) {
  if (!p.enabled || !p.end) return false;
  if (p.start && new Date(p.start).getTime() > now) return false;
  return now < new Date(p.end).getTime();
}

export function promoStatus(p: CardPromo, now = Date.now()) {
  if (!p.enabled) return '未開啟';
  if (!p.end) return '缺少結束時間';
  if (p.start && new Date(p.start).getTime() > now) return '尚未開始';
  return now < new Date(p.end).getTime() ? '進行中' : '已結束';
}

// 「10/31 23:59」(台灣時間)
export function promoDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

// 同一次請求只讀一次
export const getCardPromo = cache(async (): Promise<CardPromo> => {
  try {
    const { data } = await createAdminClient().from('site_settings').select('card_promo').eq('id', 1).maybeSingle();
    return cleanPromo(data?.card_promo);
  } catch {
    return EMPTY_PROMO;
  }
});
