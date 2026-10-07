import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ImportedProfile } from '@/lib/card-import';
import type { CardPlanInfo } from '@/lib/card-plan';
import { BIO_LIMIT, videoEmbedUrl, type ProfileCard, type SocialLink } from '@/lib/profile-card';

export type ImportChoice = { name?: boolean; bio?: boolean; avatar?: boolean; socials?: boolean; items?: number[] };

// 下載圖片存到自己的空間(其他平台的圖片網址可能會失效)
async function storeImage(userId: string, url: string, size: number, square: boolean) {
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return '';
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length > 8 * 1024 * 1024) return '';
    const buf = await sharp(raw).resize(size, size, { fit: square ? 'cover' : 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    const supabase = createAdminClient();
    const path = `profile-card/${userId}/import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
    const { error } = await supabase.storage.from('assets').upload(path, buf, { contentType: 'image/webp', upsert: false });
    return error ? '' : supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;
  } catch {
    return '';
  }
}

// 把讀到的內容寫進名片:勾選的項目新增成區塊(依方案上限),頭像/名稱/簡介/社群依選擇更新
export async function applyImport(user: { id: string }, card: ProfileCard, plan: CardPlanInfo, profile: ImportedProfile, apply: ImportChoice) {
  const supabase = createAdminClient();

  // 區塊數量上限(免費版 8 個)
  const { data: existing } = await supabase.from('profile_card_blocks').select('sort_order').eq('card_id', card.id);
  const room = Math.max(0, plan.limits.maxBlocks - (existing?.length ?? 0));
  const picked = (Array.isArray(apply.items) ? apply.items : [])
    .filter((i) => Number.isInteger(i) && i >= 0 && i < profile.items.length)
    .map((i) => profile.items[i]);
  const toAdd = picked.slice(0, room);
  const skipped = picked.length - toAdd.length;

  // 連結縮圖一起搬過來
  const thumbs = await Promise.all(toAdd.map((it) => (it.kind === 'link' && it.image ? storeImage(user.id, it.image, 400, false) : Promise.resolve(''))));
  let order = Math.max(0, ...(existing ?? []).map((b) => Number(b.sort_order) || 0)) + 1;
  const rows = toAdd.map((it, i) => {
    const base = { card_id: card.id, sort_order: order++, enabled: true, title: '', url: '', image: '', product_id: '' };
    if (it.kind === 'text') return { ...base, type: 'text', title: it.title };
    if (it.kind === 'video' && videoEmbedUrl(it.url)) return { ...base, type: 'video', title: it.title, url: it.url };
    return { ...base, type: 'link', title: it.title || it.url, url: it.url, image: thumbs[i] };
  });
  if (rows.length) {
    const { error } = await supabase.from('profile_card_blocks').insert(rows);
    if (error) throw new Error(error.message);
  }

  // 名片資料
  const update: Record<string, unknown> = {};
  if (apply.name && profile.name) update.display_name = profile.name;
  if (apply.bio && profile.bio) update.bio = profile.bio.slice(0, BIO_LIMIT);
  if (apply.avatar && profile.avatar) {
    const avatar = await storeImage(user.id, profile.avatar, 400, true);
    if (avatar) update.avatar_url = avatar;
  }
  if (apply.socials && profile.socials.length) {
    const current = (Array.isArray(card.socials) ? card.socials : []) as SocialLink[];
    const merged = [...current];
    for (const s of profile.socials) {
      if (!merged.some((m) => m.type === s.type && m.value.trim())) merged.push({ type: s.type, value: s.value });
    }
    update.socials = merged;
  }
  if (Object.keys(update).length) {
    update.updated_at = new Date().toISOString();
    await supabase.from('profile_cards').update(update).eq('id', card.id);
  }
  return { added: rows.length, skipped, maxBlocks: plan.limits.maxBlocks };
}
