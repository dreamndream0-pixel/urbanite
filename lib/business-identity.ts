import { createAdminClient } from '@/lib/supabase/admin';
import { RESERVED_SHOP_SLUGS, SHOP_SLUG_PATTERN } from '@/lib/shop';
import { RESERVED_SLUGS } from '@/lib/card-plan';

export type IdentityShop = { id: string; name: string; slug: string };

// Only an unambiguous, directly owned shop can become the shared business.
export async function identityShop(userId: string): Promise<IdentityShop | null> {
  const { data, error } = await createAdminClient().from('shops').select('id, name, slug').eq('owner_user_id', userId).limit(2);
  if (error) throw new Error('無法讀取店家資料，請稍後再試');
  return data?.length === 1 ? data[0] as IdentityShop : null;
}

export async function businessSlugProblem(slug: string, cardId: string, shopId?: string | null) {
  if (!SHOP_SLUG_PATTERN.test(slug)) return '共用網址請使用小寫英文、數字、連字號，3–30 字';
  if ((RESERVED_SLUGS.includes(slug) || RESERVED_SHOP_SLUGS.has(slug) || slug.startsWith('line-')) && !(shopId && slug === 'urbanite')) return '這個網址不能使用，請換一個';
  const db = createAdminClient();
  const card = await db.from('profile_cards').select('id').eq('slug', slug).maybeSingle();
  const shop = await db.from('shops').select('id').eq('slug', slug).maybeSingle();
  if (card.error || shop.error) return '暫時無法檢查網址，請稍後再試';
  if ((card.data && card.data.id !== cardId) || (shop.data && shop.data.id !== shopId)) return '這個網址已經有人使用了';
  return '';
}
