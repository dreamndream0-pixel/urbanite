import { createAdminClient } from '@/lib/supabase/admin';
import { blockOptions, normalizeUrl, type ProfileCardBlock } from '@/lib/profile-card';
import { detectPlatform, fetchSocialProfile, isStaleSocial } from '@/lib/social-fetch';

// 背景更新:最多一次 3 張,失敗就跳過(下次瀏覽再試)
export async function refreshStaleSocialBlocks(blocks: ProfileCardBlock[]) {
  const stale = blocks.filter((b) => b.type === 'social' && b.url && detectPlatform(normalizeUrl(b.url)) && isStaleSocial(b.options)).slice(0, 3);
  if (!stale.length) return;
  const supabase = createAdminClient();
  await Promise.all(
    stale.map(async (b) => {
      const options = blockOptions(b);
      // 先記錄時間,避免同時多人瀏覽重複抓取
      await supabase.from('profile_card_blocks').update({ options: { ...options, fetchedAt: new Date().toISOString() } }).eq('id', b.id);
      try {
        const p = await fetchSocialProfile(normalizeUrl(b.url));
        if (!p) return;
        await supabase
          .from('profile_card_blocks')
          .update({ options: { ...options, statA: p.statA || options.statA, statB: p.statB || options.statB, fetchedAt: new Date().toISOString() } })
          .eq('id', b.id);
      } catch {
        /* 抓不到就保留原本的數字 */
      }
    }),
  );
}
