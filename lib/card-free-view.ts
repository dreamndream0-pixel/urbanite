import { CARD_TEMPLATES, type ProfileCard, type ProfileCardBlock } from '@/lib/profile-card';
import { FREE_LIMITS, FREE_TEMPLATE_KEYS } from '@/lib/card-plan';

// 付費或限時免費結束後,名片自動回到免費版樣子(資料不刪,升級後就恢復)
export function applyFreeView(card: ProfileCard, blocks: ProfileCardBlock[]) {
  const theme = (card.theme ?? {}) as Record<string, unknown>;
  const key = FREE_TEMPLATE_KEYS.includes(String(theme.template)) ? String(theme.template) : 'ivory';
  const tpl = CARD_TEMPLATES.find((t) => t.key === key);
  const freeCard: ProfileCard = {
    ...card,
    theme: { ...(tpl?.theme ?? {}), template: key, coverImage: theme.coverImage ?? '', showAvatar: theme.showAvatar ?? true } as ProfileCard['theme'],
    show_footer_logo: true,
    seo_title: '',
    seo_description: '',
    seo_image: '',
  };
  const freeBlocks = blocks
    .filter((b) => b.type !== 'hotspot')
    .map((b) => ({ ...b, start_at: null, end_at: null }))
    .filter((b) => b.enabled)
    .slice(0, FREE_LIMITS.maxBlocks);
  return { card: freeCard, blocks: freeBlocks };
}
