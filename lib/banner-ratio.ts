export const BANNER_RATIOS = [
  { key: 'auto', label: '自動適配' },
  { key: 'portrait', label: '直式 4:5' },
  { key: 'square', label: '正方形 1:1' },
  { key: 'wide', label: '橫式 16:9' },
] as const;
export type BannerRatio = typeof BANNER_RATIOS[number]['key'];
export type BannerRatios = Partial<Record<string, BannerRatio>>;
export const bannerImageSize = (ratio: BannerRatio = 'auto'): [number, number] => ratio === 'square' ? [1200, 1200] : ratio === 'wide' ? [1600, 900] : [1080, 1350];

export const isBannerRatio = (value: unknown): value is BannerRatio => BANNER_RATIOS.some((r) => r.key === value);

export function resolveBannerRatios(raw: unknown): BannerRatios {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([group, ratio]) => /^[1-9]$/.test(group) && isBannerRatio(ratio)));
}

export function bannerRatioForGroup(ratios: BannerRatios | undefined, group: number, override: BannerRatio = 'auto') {
  const ratio = override === 'auto' ? ratios?.[String(group)] : override;
  return ratio && ratio !== 'auto' ? ratio : undefined;
}
