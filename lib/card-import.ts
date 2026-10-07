// 一鍵搬家:讀取會員自己在其他名片服務(Linktree、Portaly…)的頁面,轉成我們的區塊
// 只接受下列名片服務的網址(避免被拿來讀任意網站)

export type ImportedItem =
  | { kind: 'link'; title: string; url: string; image: string }
  | { kind: 'text'; title: string }
  | { kind: 'video'; title: string; url: string };

export type ImportedProfile = {
  source: string;
  name: string;
  bio: string;
  avatar: string;
  socials: { type: string; value: string }[];
  items: ImportedItem[];
};

const SOURCES: [RegExp, string][] = [
  [/(^|\.)linktr\.ee$/, 'Linktree'],
  [/(^|\.)portaly\.cc$/, 'Portaly'],
  [/(^|\.)linkgoods\.com$/, 'LINKGOODS'],
  [/(^|\.)linkfly\.to$/, 'Linkfly'],
  [/(^|\.)lit\.link$/, 'lit.link'],
  [/(^|\.)beacons\.ai$/, 'Beacons'],
  [/(^|\.)bio\.link$/, 'bio.link'],
  [/(^|\.)taplink\.(cc|at)$/, 'Taplink'],
  [/(^|\.)lnk\.bio$/, 'lnk.bio'],
  [/(^|\.)solo\.to$/, 'solo.to'],
  [/(^|\.)campsite\.bio$/, 'Campsite'],
  [/(^|\.)allmylinks\.com$/, 'AllMyLinks'],
  [/(^|\.)msha\.ke$/, 'Milkshake'],
  [/(^|\.)hoo\.be$/, 'hoo.be'],
  [/(^|\.)linkr\.bio$/, 'Linkr'],
  [/(^|\.)bento\.me$/, 'Bento'],
  [/(^|\.)carrd\.co$/, 'Carrd'],
  [/(^|\.)instabio\.cc$/, 'Instabio'],
];

export function importSource(url: string) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return '';
    const host = u.hostname.toLowerCase();
    return SOURCES.find(([re]) => re.test(host))?.[1] ?? '';
  } catch {
    return '';
  }
}

export const SUPPORTED_SOURCES = SOURCES.map(([, name]) => name);

// 社群網址 → 我們的社群類型
const SOCIAL_HOSTS: [RegExp, string][] = [
  [/instagram\.com/, 'instagram'],
  [/facebook\.com|fb\.com/, 'facebook'],
  [/threads\.(net|com)/, 'threads'],
  [/tiktok\.com/, 'tiktok'],
  [/youtube\.com|youtu\.be/, 'youtube'],
  [/(^|\.)x\.com|twitter\.com/, 'x'],
  [/pinterest\./, 'pinterest'],
  [/line\.me|lin\.ee/, 'line'],
  [/xiaohongshu\.com|xhslink\.com/, 'xiaohongshu'],
];
function socialType(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SOCIAL_HOSTS.find(([re]) => re.test(host))?.[1] ?? '';
  } catch {
    return '';
  }
}

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
    .trim();
}
function meta(html: string, prop: string) {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)`, 'i')) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
  return m ? decode(m[1]) : '';
}
function nextData(html: string): Record<string, unknown> | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isHttp = (u: string) => /^https?:\/\//i.test(u);

// ---------- Linktree ----------
function parseLinktree(html: string): ImportedProfile | null {
  const p = (nextData(html) as { props?: { pageProps?: Record<string, unknown> } } | null)?.props?.pageProps;
  if (!p) return null;
  const account = (p.account ?? {}) as Record<string, unknown>;
  const items: ImportedItem[] = [];
  for (const l of (p.links as Record<string, unknown>[] | undefined) ?? []) {
    const type = str(l.type);
    const title = str(l.title);
    const url = str(l.url);
    if (type === 'HEADER' && title) items.push({ kind: 'text', title });
    else if (/YOUTUBE|VIDEO/i.test(type) && isHttp(url)) items.push({ kind: 'video', title, url });
    else if (isHttp(url) && title) {
      const mod = (l.modifiers ?? {}) as Record<string, unknown>;
      items.push({ kind: 'link', title, url, image: str(l.thumbnail) || str(mod.thumbnailUrl) });
    }
  }
  const socials = ((p.socialLinks as Record<string, unknown>[] | undefined) ?? [])
    .map((s) => ({ type: socialType(str(s.url)) || str(s.type).toLowerCase(), value: str(s.url) }))
    .filter((s) => s.value);
  return {
    source: 'Linktree',
    name: str(p.pageTitle) || str(account.pageTitle) || str(p.username),
    bio: str(p.description) || str(account.description),
    avatar: str(account.profilePictureUrl) || str(p.customAvatar),
    socials,
    items,
  };
}

// ---------- Portaly ----------
function parsePortaly(html: string): ImportedProfile | null {
  const d = (nextData(html) as { props?: { pageProps?: { data?: Record<string, unknown> } } } | null)?.props?.pageProps?.data;
  if (!d) return null;
  const links = (d.links ?? {}) as Record<string, { url?: string; title?: string }>;
  const blocks = (Array.isArray(d.blocks) ? d.blocks : []) as Record<string, unknown>[];
  const order = (Array.isArray(d.blockOrders) ? d.blockOrders : []) as string[];
  const sorted = order.length ? [...blocks].sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id))) : blocks;
  const items: ImportedItem[] = [];
  for (const b of sorted) {
    if (String(b.hidden) === 'true') continue;
    const type = str(b.type);
    const list = (Array.isArray(b.items) ? b.items : []) as Record<string, unknown>[];
    if (type === 'title') {
      const title = str(b.title) || str(list[0]?.text);
      if (title) items.push({ kind: 'text', title });
      continue;
    }
    for (const it of list) {
      const yt = str(it.urlyoutube);
      if (yt) {
        items.push({ kind: 'video', title: str(it.text), url: yt });
        continue;
      }
      const url = str(links[str(it.linkId)]?.url);
      const title = str(it.text) || str(links[str(it.linkId)]?.title);
      if (isHttp(url) && title) items.push({ kind: 'link', title, url, image: str(it.image) });
    }
  }
  const social = ((d.social as { links?: Record<string, string> } | undefined)?.links ?? {}) as Record<string, string>;
  const handleUrl: Record<string, (v: string) => string> = {
    instagram: (v) => `https://www.instagram.com/${v.replace(/^@/, '')}`,
    threads: (v) => `https://www.threads.net/@${v.replace(/^@/, '')}`,
    tiktok: (v) => `https://www.tiktok.com/@${v.replace(/^@/, '')}`,
  };
  const socials = Object.entries(social)
    .filter(([, v]) => str(v) && !/^mailto:|@.+\.\w+$/.test(str(v)))
    .map(([k, v]) => {
      const value = isHttp(v) ? v : handleUrl[k.toLowerCase()]?.(v) ?? v;
      return { type: socialType(value) || k.toLowerCase(), value };
    })
    .filter((s) => isHttp(s.value));
  return { source: 'Portaly', name: str(d.name), bio: str(d.description), avatar: str(d.avatar), socials, items };
}

// ---------- 其他平台:通用解析 ----------
const SKIP_TEXT = /privacy|terms|cookie|report|sign ?up|log ?in|create your|隱私|條款|檢舉|註冊|登入|免費建立|try for free/i;
function parseGeneric(html: string, pageUrl: string, source: string): ImportedProfile {
  const pageHost = new URL(pageUrl).hostname.replace(/^www\./, '');
  const seen = new Set<string>();
  const items: ImportedItem[] = [];
  const socials: { type: string; value: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = decode(m[1]);
    let host = '';
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    if (host === pageHost || host.endsWith(`.${pageHost}`) || seen.has(url)) continue;
    const text = decode(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const s = socialType(url);
    if (s && (!text || text.length < 3)) {
      if (!socials.some((x) => x.type === s)) socials.push({ type: s, value: url });
      seen.add(url);
      continue;
    }
    if (!text || SKIP_TEXT.test(text) || text.length > 80) continue;
    seen.add(url);
    items.push({ kind: 'link', title: text, url, image: '' });
  }
  return {
    source,
    name: meta(html, 'og:title').replace(/\s*[|｜–-]\s*[^|｜–-]+$/, '').slice(0, 40),
    bio: meta(html, 'og:description').slice(0, 120),
    avatar: meta(html, 'og:image'),
    socials,
    items,
  };
}

export async function readImportPage(url: string): Promise<ImportedProfile> {
  const source = importSource(url);
  if (!source) throw new Error(`目前支援:${SUPPORTED_SOURCES.slice(0, 8).join('、')} 等名片服務的網址`);
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', 'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (res.status === 403 || res.status === 429) throw new Error(`${source} 不允許自動讀取,這個平台請改用手動新增`);
  if (!res.ok) throw new Error(`讀取失敗(${res.status}),請確認網址是公開的個人頁`);
  const html = (await res.text()).slice(0, 6_000_000);
  const parsed = (source === 'Linktree' ? parseLinktree(html) : source === 'Portaly' ? parsePortaly(html) : null) ?? parseGeneric(html, url, source);
  // 去除重複、清理長度
  const seen = new Set<string>();
  parsed.items = parsed.items
    .filter((it) => {
      const key = it.kind === 'text' ? `t:${it.title}` : `${it.kind}:${it.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60)
    .map((it) => ({ ...it, title: it.title.slice(0, 80) }));
  // 只保留名片支援的社群(其他平台的連結已經在項目清單裡)
  const supported = new Set(['instagram', 'line', 'facebook', 'threads', 'tiktok', 'youtube', 'xiaohongshu', 'pinterest', 'x']);
  parsed.socials = parsed.socials.filter((s, i, arr) => supported.has(s.type) && arr.findIndex((x) => x.type === s.type) === i);
  parsed.name = parsed.name.slice(0, 40);
  parsed.bio = parsed.bio.slice(0, 120);
  return parsed;
}
