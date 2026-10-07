import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ImportedItem, ImportedProfile } from '@/lib/card-import';
import { FREE_TEMPLATE_KEYS, type CardPlanInfo } from '@/lib/card-plan';
import { matchTemplate, templateTheme } from '@/lib/card-template-match';
import { detectPlatform, fetchSocialProfile } from '@/lib/social-fetch';
import { BIO_LIMIT, videoEmbedUrl, type ProfileCard, type SocialLink, MAX_TAGS } from '@/lib/profile-card';

export type ImportChoice = { name?: boolean; bio?: boolean; avatar?: boolean; socials?: boolean; tags?: boolean; template?: string; items?: number[] }; // template:'auto' = 自動挑最接近的,或指定模板 key

// 這個方案能用的模板
export function templateAllowed(plan: Pick<CardPlanInfo, 'limits'>) {
  return (key: string) => plan.limits.allTemplates || FREE_TEMPLATE_KEYS.includes(key);
}

// 下載圖片存到自己的空間(其他平台的圖片網址可能會失效)
async function storeImage(userId: string, url: string, size: number, square: boolean) {
  if (!/^https?:\/\//i.test(url)) return '';
  try {
    // 圖片伺服器偶爾很慢:等 15 秒,失敗再試一次
    const get = () => fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', accept: 'image/*,*/*;q=0.8' } });
    const res = await get().catch(() => get());
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return '';
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length > 25 * 1024 * 1024) return ''; // 原圖可能很大(LINKGOODS 常見 9MB),壓縮後只剩幾百 KB
    const buf = await sharp(raw).resize(size, size, { fit: square ? 'cover' : 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    const supabase = createAdminClient();
    const path = `profile-card/${userId}/import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
    const { error } = await supabase.storage.from('assets').upload(path, buf, { contentType: 'image/webp', upsert: false });
    return error ? '' : supabase.storage.from('assets').getPublicUrl(path).data.publicUrl;
  } catch {
    return '';
  }
}

// 讀到的項目 → 名片區塊(實際搬家與官網預覽共用);image(key, 原網址) 回傳要用的圖片網址
const FOLLOW = ['instagram', 'youtube', 'tiktok', 'facebook', 'threads', 'x', 'line', 'xiaohongshu', 'pinterest'];
// 社群追蹤卡片:搬家時直接讀取頭像、名稱、追蹤數與簡介(抓不到就維持空白,之後打開編輯會再抓)
// avatar(原網址) 回傳要存的頭像網址:實際搬家會下載到自己的空間,預覽直接用原網址
export async function fillSocialRows<T extends { type: string; url: string; title: string; image: string; options: Record<string, unknown> }>(rows: T[], avatar: (url: string) => Promise<string>) {
  const social = rows.filter((r) => r.type === 'social' && detectPlatform(r.url)).slice(0, 8);
  await Promise.all(
    social.map(async (r) => {
      try {
        const p = await fetchSocialProfile(r.url);
        if (!p) return;
        r.title = p.name || r.title;
        r.image = p.image ? (await avatar(p.image)) || r.image : r.image;
        r.options = { ...r.options, platform: p.platform || r.options.platform, statA: p.statA, statB: p.statB, bio: p.bio, fetchedAt: new Date().toISOString(), fetchedUrl: r.url };
      } catch {
        /* 抓不到就跳過 */
      }
    }),
  );
  return rows;
}

export function importRows(items: ImportedItem[], cardId: string, startOrder: number, image: (key: string, original: string) => string) {
  const card = { id: cardId };
  let order = startOrder;
  return items.flatMap((it, i) => {
    // 一次新增多筆時欄位要一致(沒填的欄位不能是 null)
    const base = { card_id: card.id, sort_order: order++, enabled: true, title: '', url: '', image: '', product_id: '', items: [] as unknown[], options: {} as Record<string, unknown> };
    switch (it.kind) {
      case 'text':
        return [{ ...base, type: 'text', title: it.title }];
      case 'divider':
        return [{ ...base, type: 'divider' }];
      case 'video':
        return [videoEmbedUrl(it.url) ? { ...base, type: 'video', title: it.title, url: it.url } : { ...base, type: 'link', title: it.title || it.url, url: it.url }];
      case 'social': {
        const platform = FOLLOW.includes(it.platform) ? it.platform : '';
        return [platform ? { ...base, type: 'social', url: it.url, options: { platform } } : { ...base, type: 'link', title: it.title || it.url, url: it.url }];
      }
      case 'image': {
        // 圖文連結:每張圖各自的標題與連結
        const items = it.items.map((img, j) => ({ image: image(`${i}:${j}`, img.image), title: img.title.slice(0, 80), url: img.url })).filter((x) => x.image);
        if (!items.length) return [];
        return [{ ...base, type: 'image', title: it.title, url: it.url || (items.find((x) => x.url)?.url ?? ''), image: items[0].image, items, options: { layout: it.layout === 'square' ? 'square' : it.layout, captionMode: it.shared ? 'link' : 'custom' } }];
      }
      default:
        return [{ ...base, type: 'link', title: it.title || it.url, url: it.url, image: it.image.startsWith('icon:') ? it.image : image(`${i}`, it.image) }];
    }
  });
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

  // 所有圖片(連結縮圖、圖文連結的每一張)都下載存到自己的空間;同時最多 8 張
  const jobs: { key: string; url: string; size: number }[] = [];
  toAdd.forEach((it, i) => {
    if (it.kind === 'link' && /^https?:/i.test(it.image)) jobs.push({ key: `${i}`, url: it.image, size: 400 });
    if (it.kind === 'image') it.items.forEach((img, j) => jobs.push({ key: `${i}:${j}`, url: img.image, size: it.layout === 'banner' || it.layout === 'scroll' ? 1200 : 800 }));
  });
  const stored = new Map<string, string>();
  for (let k = 0; k < jobs.length; k += 8) {
    const batch = jobs.slice(k, k + 8);
    const urls = await Promise.all(batch.map((j) => storeImage(user.id, j.url, j.size, false)));
    batch.forEach((j, n) => stored.set(j.key, urls[n]));
  }

  const order = Math.max(0, ...(existing ?? []).map((b) => Number(b.sort_order) || 0)) + 1;
  const rows = importRows(toAdd, card.id, order, (key) => stored.get(key) ?? '');
  await fillSocialRows(rows, (src) => storeImage(user.id, src, 400, true));
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
  if (apply.tags && profile.tags?.length) {
    // 擅長領域:補進標籤(名片最多 3 個)並顯示
    const current = Array.isArray(card.tags) ? card.tags : [];
    update.tags = [...new Set([...current, ...profile.tags])].slice(0, MAX_TAGS);
    update.show_tags = true;
  }
  if (apply.template) {
    // 套用模板:指定的模板方案不能用時,改挑方案內最接近的
    const allowed = templateAllowed(plan);
    let key = apply.template === 'auto' ? matchTemplate(profile.style, allowed) : apply.template;
    if (key && !allowed(key)) key = matchTemplate(profile.style, allowed);
    const theme = key ? templateTheme(key, (card.theme ?? {}) as Record<string, unknown>) : null;
    if (theme) update.theme = theme;
  }
  if (Object.keys(update).length) {
    update.updated_at = new Date().toISOString();
    await supabase.from('profile_cards').update(update).eq('id', card.id);
  }
  return { added: rows.length, skipped, maxBlocks: plan.limits.maxBlocks };
}
