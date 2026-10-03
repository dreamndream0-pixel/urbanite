import type { SiteSettings } from '@/lib/types';

// 結帳完成頁的官方 LINE 設定,存在 footer_sections 的隱藏區塊(與頁尾社群按鈕相同做法,不需另開欄位)
export const CHECKOUT_LINE_SECTION_TITLE = '__checkout_line__';
// 頁尾不顯示的系統用區塊
export const HIDDEN_FOOTER_SECTION_TITLES = ['__footer_social_buttons__', CHECKOUT_LINE_SECTION_TITLE];

export type CheckoutLine = { id: string; url: string };

type Section = NonNullable<SiteSettings['footer_sections']>[number];

export function getCheckoutLine(settings?: Pick<SiteSettings, 'footer_sections'> | null): CheckoutLine {
  const item = settings?.footer_sections?.find((section) => section.title === CHECKOUT_LINE_SECTION_TITLE)?.items?.[0];
  return { id: item?.subtitle?.trim() ?? '', url: item?.url?.trim() ?? '' };
}

export function withCheckoutLine(sections: Section[], line: CheckoutLine): Section[] {
  const rest = sections.filter((section) => section.title !== CHECKOUT_LINE_SECTION_TITLE);
  const id = line.id.trim();
  const url = line.url.trim();
  if (!id && !url) return rest;
  return [...rest, { title: CHECKOUT_LINE_SECTION_TITLE, items: [{ subtitle: id, content: '', url }] }];
}

// LINE ID 顯示格式:官方帳號 ID 以 @ 開頭
export function formatLineId(id: string) {
  const v = id.trim();
  if (!v) return '';
  return v.startsWith('@') ? v : `@${v}`;
}

// 加好友連結:優先用後台填的網址,否則由 LINE ID 產生
export function lineAddFriendUrl(line: CheckoutLine) {
  const url = line.url.trim();
  if (url) {
    if (/^https?:\/\//i.test(url)) return url;
    if (/^(line\.me|lin\.ee)\//i.test(url)) return `https://${url}`;
  }
  const id = formatLineId(line.id || url);
  return id ? `https://line.me/R/ti/p/${encodeURIComponent(id)}` : '';
}
