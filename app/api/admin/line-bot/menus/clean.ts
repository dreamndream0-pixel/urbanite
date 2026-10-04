import { MENU_LAYOUTS } from '@/lib/line-bot-types';

// 圖文選單欄位整理
export function cleanMenu(body: Record<string, unknown>) {
  const out: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string') out.name = body.name.trim().slice(0, 60);
  if (body.audience === 'guest' || body.audience === 'member') out.audience = body.audience;
  if (body.size === 'large' || body.size === 'compact') out.size = body.size;
  if (typeof body.layout === 'string' && MENU_LAYOUTS.some((l) => l.key === body.layout)) out.layout = body.layout;
  if (Array.isArray(body.areas)) out.areas = body.areas.slice(0, 6);
  if (body.design && typeof body.design === 'object') out.design = body.design;
  if (typeof body.image_url === 'string') out.image_url = body.image_url;
  if (typeof body.chat_bar_text === 'string') out.chat_bar_text = body.chat_bar_text.trim().slice(0, 14) || '選單';
  return out;
}
