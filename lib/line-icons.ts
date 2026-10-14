// LINE 卡片用的線條圖示(Lucide 風格 SVG path,24×24)。
// LINE Flex 只能顯示 PNG/JPEG,由 /api/line/icon/[name] 轉成 PNG;卡片模板用 lineIconUrl() 取得網址。
import { PRIMARY_SITE_URL } from '@/lib/site-url';

type Shape = { d?: string; circle?: [number, number, number]; rect?: [number, number, number, number, number] };

export const LINE_ICONS: Record<string, Shape[]> = {
  message: [{ d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }],
  gift: [{ rect: [3, 8, 18, 4, 1] }, { d: 'M12 8v13' }, { d: 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7' }, { d: 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5' }],
  package: [{ d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z' }, { d: 'M12 22V12' }, { d: 'm3.3 7 7.7 4.7a2 2 0 0 0 2 0L20.7 7' }, { d: 'm7.5 4.27 9 5.15' }],
  user: [{ d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }, { circle: [12, 7, 4] }],
  settings: [{ d: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12' }, { circle: [16, 6, 2] }, { circle: [10, 12, 2] }, { circle: [18, 18, 2] }],
  tag: [{ d: 'M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z' }, { circle: [7.5, 7.5, 1] }],
  truck: [{ d: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2' }, { d: 'M15 18H9' }, { d: 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14' }, { circle: [17, 18, 2] }, { circle: [7, 18, 2] }],
  hourglass: [{ d: 'M5 22h14M5 2h14' }, { d: 'M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22' }, { d: 'M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2' }],
  crown: [{ d: 'M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.28-3.67a.5.5 0 0 1 .8.52l-2.84 10.25a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.28 3.67a1 1 0 0 0 1.52-.3z' }, { d: 'M5 21h14' }],
  check: [{ d: 'M20 6 9 17l-5-5' }],
  undo: [{ d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }, { d: 'M3 3v5h5' }],
  receipt: [{ d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }, { d: 'M14 2v4a2 2 0 0 0 2 2h4' }, { d: 'M10 9H8M16 13H8M16 17H8' }],
  gem: [{ d: 'M6 3h12l4 6-10 13L2 9Z' }, { d: 'M11 3 8 9l4 13 4-13-3-6' }, { d: 'M2 9h20' }],
  x: [{ d: 'M18 6 6 18M6 6l12 12' }],
  chevron: [{ d: 'm9 18 6-6-6-6' }],
  ticket: [{ d: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z' }, { d: 'M13 5v2M13 17v2M13 11v2' }],
};

export type LineIconName = keyof typeof LINE_ICONS;

// 圖示 PNG 網址(放在主站,所有店家共用);color 為 6 碼 hex
export function lineIconUrl(name: string, color: string) {
  const c = color.replace('#', '').slice(0, 6).toLowerCase();
  return `${PRIMARY_SITE_URL}/api/line/icon/${encodeURIComponent(name)}?c=${/^[0-9a-f]{6}$/.test(c) ? c : '333333'}`;
}
