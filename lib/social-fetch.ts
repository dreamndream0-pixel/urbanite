// 社群追蹤卡片:從個人頁網址抓名稱、頭像、追蹤數、簡介
// 用分享預覽(Open Graph)的方式讀取,只接受下列社群平台的網址

import { fetchPublic } from '@/lib/public-fetch';
import { detectPlatform } from '@/lib/social-platform';
export { detectPlatform };

export type SocialProfile = { platform: string; name: string; avatar: string; statA: string; statB: string; bio: string };


function decode(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/ /g, ' ')
    .trim();
}

function meta(html: string, prop: string) {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)`, 'i')) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
  return m ? decode(m[1]) : '';
}

// 「4640萬位訂閱者」→「4640萬 位訂閱者」
function tidyStat(s: string) {
  const v = s.trim().replace(/\s+/g, ' ');
  const m = v.match(/^([\d.,]+\s*[萬億kmbKMB]?)\s*(.+)$/);
  if (!m) return v;
  // 英文標籤換成中文
  const label = m[2].replace(/^followers$/i, '位粉絲').replace(/^likes$/i, '個讚').replace(/^subscribers$/i, '位訂閱者').replace(/^posts$/i, '篇貼文');
  return `${m[1].replace(/\s+/g, '').toUpperCase()} ${label}`;
}

// 「名稱(@帳號)• Instagram…」→「名稱」
function cleanName(title: string, platform: string) {
  let t = title;
  if (platform === 'tiktok') t = t.replace(/\s+on TikTok.*$/i, '');
  if (platform === 'x') t = t.replace(/^X\s*上的\s*/, '').replace(/\s+on X.*$/i, '');
  t = t.replace(/\s*[（(]@[^)）]*[)）].*$/, '').replace(/\s*[•|-]\s*(Instagram|Threads|Facebook|YouTube|Pinterest).*$/i, '');
  return t.trim().slice(0, 40);
}

function parse(platform: string, html: string): Omit<SocialProfile, 'avatar'> & { image: string } {
  const title = meta(html, 'og:title');
  const desc = meta(html, 'og:description') || meta(html, 'description');
  const image = meta(html, 'og:image');
  const name = cleanName(title, platform);
  let statA = '';
  let statB = '';
  let bio = '';

  if (platform === 'youtube') {
    const subs = html.match(/"([\d.,]+\s*[萬億KMB]?\s*(?:位訂閱者|subscribers))"/i)?.[1] ?? '';
    statA = subs ? tidyStat(subs) : '';
    bio = desc;
  } else if (platform === 'instagram') {
    // 687M 位粉絲、305 人追蹤中、8,612 篇貼文 - … / 687M Followers, 305 Following, 8,612 Posts - …
    const head = desc.split(/\s+-\s+/)[0];
    const parts = head.split(/、|,\s+/); // 數字裡的千分位逗號不切
    statA = tidyStat(parts.find((p) => /粉絲|followers/i.test(p)) ?? '');
    statB = tidyStat(parts.find((p) => /貼文|posts/i.test(p)) ?? '');
  } else if (platform === 'tiktok') {
    // @帳號 96.1m Followers, 1 Following, 465.1m Likes - …
    const head = desc.split(/\s+-\s+/)[0].replace(/^@\S+\s+/, '');
    const parts = head.split(/、|,\s+/);
    statA = tidyStat(parts.find((p) => /粉絲|followers/i.test(p)) ?? '');
    statB = tidyStat(parts.find((p) => /讚|likes/i.test(p)) ?? '');
  } else if (platform === 'threads') {
    // 574.7 萬位粉絲 • 168 則串文 • …
    const parts = desc.split(/\s*•\s*/);
    statA = tidyStat(parts.find((p) => /粉絲|followers/i.test(p)) ?? '');
    statB = tidyStat(parts.find((p) => /串文|threads/i.test(p)) ?? '');
    bio = parts.filter((p) => !/粉絲|followers|串文|threads|查看|see /i.test(p)).join(' ').trim();
  } else if (platform === 'facebook') {
    // 名稱 。 154,815,204 位粉絲 · 468,387 人正在談論這個 · 簡介
    const parts = desc.split(/\s*[·。]\s*/).filter(Boolean);
    statA = tidyStat(parts.find((p) => /粉絲|followers|likes|讚/i.test(p)) ?? '');
    bio = parts.filter((p) => p !== name && !/粉絲|followers|likes|讚|談論|talking/i.test(p)).join(' ').trim();
  } else {
    bio = desc;
  }
  return { platform, name, image, statA, statB, bio: bio.slice(0, 120) };
}

export async function fetchSocialProfile(url: string): Promise<(Omit<SocialProfile, 'avatar'> & { image: string }) | null> {
  const platform = detectPlatform(url);
  if (!platform) return null;
  const { res } = await fetchPublic(url, 4_000_000, 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)');
  if (!res.ok) throw new Error(`讀取失敗(${res.status})`);
  const html = (await res.text()).slice(0, 4_000_000);
  return parse(platform, html);
}

// 名片頁被瀏覽時,超過一天沒更新的社群卡片在背景更新追蹤數(只更新數字,不動名稱頭像)
export const SOCIAL_REFRESH_MS = 24 * 3600 * 1000;

export function isStaleSocial(options: { fetchedAt?: string } | null | undefined, now = Date.now()) {
  const t = options?.fetchedAt ? new Date(options.fetchedAt).getTime() : 0;
  return !t || now - t > SOCIAL_REFRESH_MS;
}
