// 會員回饋金與消費等級的設定(前後台共用,純函式)。
import { membershipDesign, resolveMembershipBenefits, resolveMembershipCard, type MembershipBenefit, type MembershipCardSettings, type MembershipDesignId } from './membership-card';

export type LoyaltyTier = { key: string; name: string; threshold: number; rate: number; cardDesign?: MembershipDesignId; benefits?: MembershipBenefit[] };
export type LoyaltySettings = {
  enabled: boolean;
  tiers: LoyaltyTier[]; // 依門檻由低到高
  delayDays: number; // 訂單完成後幾天入帳
  validDays: number; // 入帳後可用天數
  maxRedeemPct: number; // 每筆最多折抵商品金額的百分比
  keepMonths: number; // 等級計算區間與保級月數
  card?: MembershipCardSettings;
};

export const DEFAULT_TIERS: LoyaltyTier[] = [
  { key: 'normal', name: '一般會員', threshold: 0, rate: 1 },
  { key: 'silver', name: '銀卡會員', threshold: 3000, rate: 2 },
  { key: 'gold', name: '金卡會員', threshold: 10000, rate: 3 },
];

export const DEFAULT_LOYALTY: LoyaltySettings = { enabled: false, tiers: DEFAULT_TIERS, delayDays: 14, validDays: 180, maxRedeemPct: 20, keepMonths: 12 };
export const AUTO_COMPLETE_DAYS = 7; // 到貨後幾天自動完成訂單(所有店家)

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function resolveLoyalty(raw: unknown): LoyaltySettings {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<LoyaltySettings>;
  const tiers = Array.isArray(d.tiers) && d.tiers.length
    ? d.tiers.slice(0, 6).map((t, i) => ({
        key: String(t?.key || `t${i}`).slice(0, 20),
        name: String(t?.name || `等級 ${i + 1}`).slice(0, 20),
        threshold: i === 0 ? 0 : int(t?.threshold, 0, 100_000_000, 0),
        rate: Math.min(100, Math.max(0, Math.round(Number(t?.rate) * 10) / 10 || 0)),
        cardDesign: membershipDesign(t?.cardDesign || (i === 0 ? 'champagne' : i === 1 ? 'silver' : i === 2 ? 'gold' : 'black-gold')).id,
        benefits: resolveMembershipBenefits(t?.benefits),
      })).sort((a, b) => a.threshold - b.threshold)
    : DEFAULT_TIERS.map((tier, i) => ({ ...tier, cardDesign: membershipDesign(i === 0 ? 'champagne' : i === 1 ? 'silver' : 'gold').id, benefits: resolveMembershipBenefits(null) }));
  tiers[0] = { ...tiers[0], threshold: 0 };
  return {
    enabled: d.enabled === true,
    tiers,
    delayDays: int(d.delayDays, 0, 90, DEFAULT_LOYALTY.delayDays),
    validDays: int(d.validDays, 7, 3650, DEFAULT_LOYALTY.validDays),
    maxRedeemPct: int(d.maxRedeemPct, 1, 100, DEFAULT_LOYALTY.maxRedeemPct),
    keepMonths: int(d.keepMonths, 1, 36, DEFAULT_LOYALTY.keepMonths),
    card: resolveMembershipCard(d.card),
  };
}

// 依消費金額取得等級(門檻由低到高,取最高的符合等級)
export function tierForSpend(settings: LoyaltySettings, spend: number): LoyaltyTier {
  let tier = settings.tiers[0];
  for (const t of settings.tiers) if (spend >= t.threshold) tier = t;
  return tier;
}

export function nextTier(settings: LoyaltySettings, tier: LoyaltyTier) {
  const i = settings.tiers.findIndex((t) => t.key === tier.key);
  return i >= 0 ? settings.tiers[i + 1] ?? null : null;
}

// 本筆最多可折抵:商品折扣後金額 × 上限 %,且不超過餘額
export function maxRedeem(settings: LoyaltySettings, productAmount: number, balance: number) {
  return Math.max(0, Math.min(Math.floor(balance), Math.floor((Math.max(0, productAmount) * settings.maxRedeemPct) / 100)));
}

// 回饋 = 實付商品金額 × 回饋率,無條件捨去
export const earnAmount = (paidProductAmount: number, rate: number) => Math.max(0, Math.floor((Math.max(0, paidProductAmount) * rate) / 100));
