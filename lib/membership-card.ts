export const MEMBERSHIP_DESIGNS = [
  { id: 'black-gold', file: '01_black_gold', name: '黑金', ink: '#fff3d8', surface: '#15130f', accent: '#e6bc70', light: false },
  { id: 'silver', file: '02_silver', name: '白銀', ink: '#302c28', surface: '#e9eaec', accent: '#786149', light: true },
  { id: 'gold', file: '03_gold', name: '黃金', ink: '#49341a', surface: '#eee1cb', accent: '#94621d', light: true },
  { id: 'platinum', file: '04_platinum', name: '白金', ink: '#292b30', surface: '#dfe1e6', accent: '#73604d', light: true },
  { id: 'diamond', file: '05_diamond', name: '鑽石', ink: '#fff6e2', surface: '#161513', accent: '#e8c581', light: false },
  { id: 'royal-blue', file: '06_royal_blue', name: '皇家藍', ink: '#fff2d5', surface: '#091829', accent: '#e5bd78', light: false },
  { id: 'emerald', file: '07_emerald', name: '翡翠綠', ink: '#fff3d8', surface: '#061b13', accent: '#dfbf79', light: false },
  { id: 'rose-gold', file: '08_rose_gold', name: '玫瑰金', ink: '#fff0e6', surface: '#231513', accent: '#f0b09a', light: false },
  { id: 'amethyst', file: '09_amethyst', name: '紫水晶', ink: '#f8edff', surface: '#1d1328', accent: '#d8b0ef', light: false },
  { id: 'champagne', file: '10_champagne', name: '香檳金', ink: '#49351f', surface: '#f0e6d7', accent: '#936023', light: true },
] as const;

export const MEMBERSHIP_ICONS = [
  { id: 'coins', name: '回饋金' }, { id: 'gift', name: '禮物' }, { id: 'diamond', name: '鑽石' },
  { id: 'crown', name: '皇冠' }, { id: 'calendar', name: '預約' }, { id: 'heart', name: '愛心' },
  { id: 'star', name: '星星' }, { id: 'percent', name: '折扣' }, { id: 'headset', name: '客服' },
] as const;
export type MembershipDesignId = typeof MEMBERSHIP_DESIGNS[number]['id'];
export type MembershipIconId = typeof MEMBERSHIP_ICONS[number]['id'];
export type MembershipBenefit = { label: string; description?: string; icon: MembershipIconId; image: string };
export type MembershipCardSettings = { enabled: boolean; title: string; intro?: string; subtitle: string; actionLabel: string };
export const MEMBERSHIP_BADGES: Record<MembershipDesignId, string> = {
  'black-gold': 'BLACK', silver: 'SILVER', gold: 'GOLD', platinum: 'PLATINUM', diamond: 'DIAMOND',
  'royal-blue': 'ROYAL BLUE', emerald: 'EMERALD', 'rose-gold': 'ROSE GOLD', amethyst: 'AMETHYST', champagne: 'CHAMPAGNE',
};
export const MEMBERSHIP_BACKDROPS: Record<MembershipDesignId, string> = {
  'black-gold': '#24221c', silver: '#cbd0d4', gold: '#c6b18b', platinum: '#b7bdc6', diamond: '#303130',
  'royal-blue': '#142c43', emerald: '#143c2c', 'rose-gold': '#4b2e29', amethyst: '#352343', champagne: '#ded0bb',
};
// Circle centers/radii measured on each original 1448 x 1086 artwork.
export const MEMBERSHIP_BENEFIT_CIRCLES: Record<MembershipDesignId, readonly [number, number, number][]> = {
  'black-gold': [[522, 495, 42], [821, 495, 42], [1123, 495, 42]],
  silver: [[526, 498, 38], [825, 498, 39], [1133, 497, 41]],
  gold: [[523, 492, 39], [827, 492, 40], [1124, 493, 41]],
  platinum: [[533, 502, 41], [828, 501, 43], [1131, 501, 42]],
  diamond: [[523, 493, 42], [821, 492, 42], [1123, 492, 42]],
  'royal-blue': [[527, 496, 43], [826, 496, 43], [1128, 496, 43]],
  emerald: [[525, 496, 41], [824, 496, 42], [1126, 496, 42]],
  'rose-gold': [[521, 492, 41], [820, 492, 42], [1123, 492, 41]],
  amethyst: [[524, 493, 42], [822, 493, 42], [1123, 493, 42]],
  champagne: [[521, 495, 38], [820, 496, 39], [1123, 496, 39]],
};

export const DEFAULT_MEMBERSHIP_CARD: MembershipCardSettings = {
  enabled: true, title: 'VIP membership', intro: '專屬禮遇・美好日常', subtitle: '每一次相遇，都值得珍藏', actionLabel: '查看權益',
};
export const defaultMembershipBenefits = (): MembershipBenefit[] => [
  { label: '消費回饋 {rate}%', icon: 'coins', image: '' },
  { label: '回饋金折抵', icon: 'gift', image: '' },
  { label: '會員專屬權益', icon: 'diamond', image: '' },
];
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown, fallback: string, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : fallback;

export function membershipDesign(id: unknown) {
  return MEMBERSHIP_DESIGNS.find((design) => design.id === id) ?? MEMBERSHIP_DESIGNS[0];
}
export function membershipImage(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function resolveMembershipCard(value: unknown): MembershipCardSettings {
  const v = record(value);
  return {
    enabled: v.enabled !== false,
    title: v.title === '會員專屬禮遇' ? DEFAULT_MEMBERSHIP_CARD.title : text(v.title, DEFAULT_MEMBERSHIP_CARD.title, 24),
    intro: text(v.intro, DEFAULT_MEMBERSHIP_CARD.intro ?? '', 40),
    subtitle: text(v.subtitle, DEFAULT_MEMBERSHIP_CARD.subtitle, 40),
    actionLabel: text(v.actionLabel, DEFAULT_MEMBERSHIP_CARD.actionLabel, 12) || DEFAULT_MEMBERSHIP_CARD.actionLabel,
  };
}
export function resolveMembershipBenefits(value: unknown): MembershipBenefit[] {
  const defaults = defaultMembershipBenefits();
  return defaults.map((fallback, index) => {
    const v = record(Array.isArray(value) ? value[index] : null);
    return {
      label: text(v.label, fallback.label, 60),
      description: text(v.description, '', 60),
      icon: MEMBERSHIP_ICONS.some((icon) => icon.id === v.icon) ? v.icon as MembershipIconId : fallback.icon,
      image: membershipImage(v.image),
    };
  });
}
export function membershipBenefitLabel(label: string, tier: { rate: number; threshold: number }) {
  return label.replaceAll('{rate}', String(tier.rate)).replaceAll('{threshold}', tier.threshold.toLocaleString('en-US'));
}
export function membershipProgress(spend: number, nextThreshold: number | null) {
  if (nextThreshold === null) return 100;
  if (!Number.isFinite(spend) || !Number.isFinite(nextThreshold) || nextThreshold <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(spend / nextThreshold * 100)));
}

export function membershipPeriod(months: number) {
  const value = Number.isFinite(months) ? Math.max(1, Math.min(36, Math.floor(months))) : 12;
  return value % 12 === 0 ? value === 12 ? '年' : `${value / 12}年` : `${value}個月`;
}
