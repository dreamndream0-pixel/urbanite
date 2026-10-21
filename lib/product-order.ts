import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product } from './types';

type RankedProduct = Pick<Product, 'sort_order' | 'campaign_id'>;

export function nextProductSortOrder(products: readonly RankedProduct[], campaignId: string | null = null) {
  const group = products.filter((product) => (product.campaign_id || null) === campaignId);
  if (!group.length) return 0;
  const head = Math.min(...group.map((product) => Number.isFinite(product.sort_order) ? product.sort_order : 0));
  if (head <= -2147483648) throw new Error('商品排序已達下限，請先重新排序');
  return Math.floor(head) - 1;
}

export function compareProductOrder(a: Pick<Product, 'sort_order' | 'created_at'>, b: Pick<Product, 'sort_order' | 'created_at'>) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || (b.created_at ?? '').localeCompare(a.created_at ?? '');
}

export async function readProductHeadOrder(db: SupabaseClient, campaignId: string | null = null) {
  let query = db.from('products').select('sort_order,campaign_id').order('sort_order', { ascending: true }).limit(1);
  query = campaignId ? query.eq('campaign_id', campaignId) : query.is('campaign_id', null);
  const { data, error } = await query;
  if (error) throw new Error('讀取商品排序失敗，請稍後重試');
  return nextProductSortOrder((data ?? []) as RankedProduct[], campaignId);
}
