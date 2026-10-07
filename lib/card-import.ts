// 一鍵搬家:讀取會員自己在其他名片服務(Linktree、Portaly…)的頁面,轉成我們的區塊
// 只接受下列名片服務的網址(避免被拿來讀任意網站)

export type ImportedImage = { image: string; title: string; url: string };
export type ImportedItem =
  | { kind: 'link'; title: string; url: string; image: string } // image:縮圖網址或 icon:圖示
  | { kind: 'text'; title: string }
  | { kind: 'video'; title: string; url: string }
  | { kind: 'image'; title: string; layout: 'banner' | 'scroll' | 'grid2' | 'grid3' | 'circle3' | 'square' | 'mosaic' | 'mosaic5'; items: ImportedImage[]; url?: string; shared?: boolean } // 圖文連結;shared = 共用標題與連結
  | { kind: 'divider' }
  | { kind: 'social'; title: string; url: string; platform: string };

// 我們內建的線條圖示(其他平台的圖示名稱對得上就沿用)
const ICON_KEYS = new Set('instagram line facebook threads youtube tiktok shopping-bag gift tag ticket truck heart star message calendar map-pin x pinterest xiaohongshu shopping-cart store percent credit-card wallet package shirt scissors ruler palette gem crown sparkles flame zap award trophy thumbs-up smile phone smartphone mail send bell megaphone link globe share qr-code user users handshake hand clock timer map house plane car bike camera image video play music headphones book file newspaper clipboard bookmark download search info help hash chart coffee utensils cake leaf flower sprout sun moon umbrella dumbbell baby dog paw recycle briefcase laptop graduation lightbulb rocket target lock shield settings wrench'.split(' '));
const iconOf = (name: string) => (ICON_KEYS.has(name) ? `icon:${name}` : '');
const isVideo = (url: string) => /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/|vimeo\.com\/\d)/i.test(url);

export type ImportedProfile = {
  source: string;
  name: string;
  bio: string;
  avatar: string;
  socials: { type: string; value: string }[];
  tags?: string[]; // 擅長領域 / 標籤
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
  const all = ((p.links as Record<string, unknown>[] | undefined) ?? []).filter((l) => l && typeof l === 'object');
  const parentOf = (l: Record<string, unknown>) => {
    const raw = l.parent;
    if (!raw) return '';
    try {
      const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return String((o as { id?: unknown }).id ?? '');
    } catch {
      return '';
    }
  };
  const groupLayout = (g: Record<string, unknown>) => {
    try {
      const c = typeof g.context === 'string' ? JSON.parse(g.context) : g.context;
      return str((c as { layoutOption?: unknown })?.layoutOption) || str(g.layoutOption);
    } catch {
      return str(g.layoutOption);
    }
  };
  const one = (l: Record<string, unknown>): ImportedItem | null => {
    const type = str(l.type);
    const title = str(l.title);
    const url = str(l.url);
    const thumb = str(l.thumbnail) || str((l.modifiers as Record<string, unknown> | undefined)?.thumbnailUrl);
    if (type === 'HEADER') return title ? { kind: 'text', title } : null;
    if (/VIDEO/i.test(type) || isVideo(url)) return isHttp(url) ? { kind: 'video', title, url } : null;
    if (!isHttp(url)) return null;
    // 精選版型(大圖)→ 圖文連結
    if (str(l.layoutOption) === 'featured' && thumb) return { kind: 'image', title, layout: 'banner', items: [{ image: thumb, title, url }] };
    return { kind: 'link', title: title || url, url, image: thumb };
  };
  const items: ImportedItem[] = [];
  for (const l of all.filter((x) => !parentOf(x))) {
    if (str(l.type) !== 'GROUP') {
      const it = one(l);
      if (it) items.push(it);
      continue;
    }
    // 群組:標題 + 底下的連結;輪播 / 方格版型而且有圖 → 圖文連結
    const title = str(l.title);
    if (title) items.push({ kind: 'text', title });
    const children = all.filter((c) => parentOf(c) === String(l.id)).sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
    const layout = groupLayout(l);
    const withImages = children.filter((c) => str(c.thumbnail) && isHttp(str(c.url)) && !/VIDEO/i.test(str(c.type)));
    if ((layout === 'carousel' || layout === 'grid') && withImages.length >= 2) {
      for (let i = 0; i < withImages.length; i += 10) {
        items.push({
          kind: 'image',
          title: '',
          layout: layout === 'carousel' ? 'scroll' : 'grid2',
          items: withImages.slice(i, i + 10).map((c) => ({ image: str(c.thumbnail), title: str(c.title), url: str(c.url) })),
        });
      }
      for (const c of children.filter((c) => !withImages.includes(c))) {
        const it = one(c);
        if (it) items.push(it);
      }
    } else {
      for (const c of children) {
        const it = one(c);
        if (it) items.push(it);
      }
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
  const linkUrl = (it: Record<string, unknown>) => str(links[str(it.linkId)]?.url);
  for (const b of sorted) {
    if (String(b.hidden) === 'true') continue;
    const type = str(b.type);
    const list = ((Array.isArray(b.items) ? b.items : []) as Record<string, unknown>[]).filter((it) => String(it.hidden) !== 'true');
    if (type === 'title') {
      const title = str(b.text) || str(b.title) || str(list[0]?.text);
      if (title) items.push({ kind: 'text', title });
    } else if (type === 'divider') {
      items.push({ kind: 'divider' });
    } else if (type === 'grid' || type === 'banner') {
      // 方格 / 橫幅 → 圖文連結(一個區塊最多 10 張)
      const imgs = list.filter((it) => str(it.image)).map((it) => ({ image: str(it.image), title: str(it.label) || str(it.text) || str(it.alt), url: linkUrl(it) }));
      const variant = str(b.variant);
      const layout: 'banner' | 'scroll' | 'grid2' | 'grid3' | 'circle3' =
        type === 'banner' ? (imgs.length > 1 ? 'scroll' : 'banner') : variant === 'round' ? 'circle3' : imgs.length >= 3 && imgs.length % 3 === 0 ? 'grid3' : 'grid2';
      const size = layout === 'circle3' || layout === 'grid3' ? 9 : 10;
      for (let i = 0; i < imgs.length; i += size) items.push({ kind: 'image', title: '', layout, items: imgs.slice(i, i + size) });
    } else if (type === 'player') {
      for (const it of list) {
        const yt = str(it.urlyoutube) || str(it.url);
        if (yt) items.push({ kind: 'video', title: str(it.text), url: yt });
      }
    } else if (type === 'integrations') {
      // 社群嵌入(IG、Threads…)→ 社群追蹤卡片
      const platform = str(b.platform);
      const url = str(b[`url-${platform}`]);
      if (isHttp(url)) items.push({ kind: 'social', title: '', url, platform });
    } else {
      for (const it of list) {
        const yt = str(it.urlyoutube);
        if (yt) {
          items.push({ kind: 'video', title: str(it.text), url: yt });
          continue;
        }
        const url = linkUrl(it);
        const title = str(it.text) || str(links[str(it.linkId)]?.title);
        if (!isHttp(url) || !title) continue;
        if (isVideo(url)) items.push({ kind: 'video', title, url });
        else items.push({ kind: 'link', title, url, image: str(it.image) || iconOf(str(it.icon)) });
      }
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

// ---------- LINKGOODS(Nuxt + Apollo 快取)----------
// Nuxt 3 的 __NUXT_DATA__ 是 devalue 格式:一個大陣列,裡面的數字都是索引
function nuxtData(html: string): unknown {
  const m = html.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let a: unknown[];
  try {
    a = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const memo = new Map<number, unknown>();
  const WRAP = new Set(['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef', 'Set', 'Map', 'Object']);
  const r = (i: unknown): unknown => {
    if (typeof i !== 'number' || i < 0 || i >= a.length) return undefined;
    if (memo.has(i)) return memo.get(i);
    const v = a[i];
    if (Array.isArray(v)) {
      if (v[0] === 'null') {
        const o: Record<string, unknown> = {};
        memo.set(i, o);
        for (let k = 1; k < v.length; k += 2) o[String(v[k])] = r(v[k + 1]);
        return o;
      }
      if (typeof v[0] === 'string' && WRAP.has(v[0])) {
        const out = r(v[1]);
        memo.set(i, out);
        return out;
      }
      if (v[0] === 'Date') return v[1];
      const out: unknown[] = [];
      memo.set(i, out);
      for (const x of v) out.push(r(x));
      return out;
    }
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      memo.set(i, o);
      for (const k of Object.keys(v)) o[k] = r((v as Record<string, unknown>)[k]);
      return o;
    }
    return v;
  };
  return r(0);
}

// 連結按鈕的圖示:依網址猜我們內建的圖示
function guessIcon(url: string) {
  const social = socialType(url);
  if (social && ICON_KEYS.has(social)) return `icon:${social}`;
  if (/shopee|momo|pchome|rakuten|pinkoi|shopline|cyberbiz|91app|easystore/i.test(url)) return 'icon:shopping-bag';
  return 'icon:globe';
}

function parseLinkgoods(html: string): ImportedProfile | null {
  type Obj = Record<string, unknown>;
  const root = nuxtData(html) as { data?: Obj } | null;
  const cache = root?.data?.['_apollo:default'] as Record<string, Obj> | undefined;
  if (!cache?.ROOT_QUERY) return null;
  const deref = (x: unknown): Obj => ((x && typeof x === 'object' && '__ref' in x ? cache[String((x as Obj).__ref)] : (x as Obj | undefined)) ?? {});
  const q = cache.ROOT_QUERY;
  const user = deref(q[Object.keys(q).find((k) => k.startsWith('user(')) ?? '']);
  const json = (v: unknown): Obj => {
    try {
      return (typeof v === 'string' ? JSON.parse(v) : v ?? {}) as Obj;
    } catch {
      return {};
    }
  };
  const order = json(q[Object.keys(q).find((k) => k.startsWith('productSort(')) ?? '']) as unknown;
  const items: ImportedItem[] = [];
  for (const s of (Array.isArray(order) ? order : []) as Obj[]) {
    if (s.isShow === false) continue;
    const mode = str(s.mode);
    if (mode === 'DIVIDER') {
      // 有文字的分隔線 = 區段標題
      const title = str(s.title);
      items.push(title ? { kind: 'text', title } : { kind: 'divider' });
      continue;
    }
    const p = cache[`Product:${str(s.id)}`];
    if (!p || p.isShow === false) continue;
    const title = str(p.title) || str(s.title);
    const url = str(p.sourceUrl) || str(p.shortUrl);
    if (mode === 'RICHTEXT') {
      const text = decode(str(p.content).replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
      if (text || title) items.push({ kind: 'text', title: text || title });
      continue;
    }
    if (/VIDEO/.test(mode) || isVideo(url)) {
      if (isHttp(url)) items.push({ kind: 'video', title, url });
      continue;
    }
    const photos = ((Array.isArray(p.productItems) ? p.productItems : []) as unknown[])
      .map(deref)
      .map((it) => ({ image: str(deref(it.photo).url), title: str(it.title), url: str(it.sourceUrl) || str(it.shortUrl) }))
      .filter((x) => isHttp(x.image));
    if (!photos.length && isHttp(str(p.thumbnail)) && mode === 'IMAGETEXT') photos.push({ image: str(p.thumbnail), title: '', url });
    if (photos.length) {
      // LINKGOODS 圖文版型(template.layoutId):
      //   1 = 左邊一張大圖 + 右邊四張小圖 → 一大四小(三、四張 → 一大兩小)
      //   2 = 一排三張方圖,超過三張可左右滑 → 三欄方格 / 橫向滑動
      //   5 與其他 = 整張寬的輪播圖(有圓點)→ 方形輪播
      // 標題在圖片上方 → 先放一個文字標題
      const list = photos.map((x) => ({ ...x, url: x.url || url }));
      const layoutId = str(json(p.template).layoutId);
      const push = (layout: Extract<ImportedItem, { kind: 'image' }>['layout'], size: number) => {
        if (title) items.push({ kind: 'text', title });
        for (let i = 0; i < list.length; i += size) items.push({ kind: 'image', title: '', layout, items: list.slice(i, i + size), url });
      };
      if (list.length === 1) items.push({ kind: 'image', title, layout: 'square', items: list, url, shared: Boolean(title) });
      else if (layoutId === '1') push(list.length >= 5 ? 'mosaic5' : list.length >= 3 ? 'mosaic' : 'grid2', list.length >= 5 ? 5 : 3);
      else if (layoutId === '2') push(list.length <= 3 ? 'grid3' : 'scroll', 10);
      else push('square', 10);
      continue;
    }
    if (!isHttp(url)) continue;
    const hasIcon = /ICON/.test(str(json(p.template).thumbnailType));
    items.push({ kind: 'link', title: title || url, url, image: hasIcon ? guessIcon(url) : '' });
  }
  const socialKeys = Array.isArray(user.socialAccountUrlOrder) ? (user.socialAccountUrlOrder as string[]) : [];
  const allKeys = [...socialKeys, ...Object.keys(user).filter((k) => /Url$/.test(k) && !socialKeys.includes(k))];
  const socials = allKeys
    .map((k) => str(user[k]))
    .filter(isHttp)
    .map((value) => ({ type: socialType(value), value }))
    .filter((x) => x.type);
  // 擅長領域 → 標籤
  const tags = ((Array.isArray(user.kolFields) ? user.kolFields : []) as unknown[]).map((f) => str(deref(f).name)).filter(Boolean);
  const bio = user.isDescriptionShow === false ? '' : str(user.description);
  return { source: 'LINKGOODS', name: str(user.nickname) || str(user.username), bio, avatar: str(user.photo), socials, tags, items };
}

// ---------- Linkfly(內容在另一個 JSON 檔,頁面載入後才抓)----------
async function parseLinkfly(html: string): Promise<ImportedProfile | null> {
  type Obj = Record<string, unknown>;
  const m = html.match(/window\.__data=(\{[\s\S]*?\});<\/script>/);
  if (!m) return null;
  let data: Obj;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const basic = (data.basic ?? {}) as Obj;
  const bioId = str((data.bio as Obj | undefined)?.id);
  const uid = str(basic.uid);
  const img = (p: string) => (!p ? '' : isHttp(p) ? p : `https://fly.linkcdn.cc/${p.replace(/^\//, '')}`);
  const items: ImportedItem[] = [];
  const socials: { type: string; value: string }[] = [];
  if (bioId) {
    const get = async (url: string) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' }, cache: 'no-store' });
      return res.ok ? ((await res.json()) as Obj) : null;
    };
    const file = await get(`https://fly.linkcdn.cc/upload/lnkcmpts/${bioId}.json?lnkcmpt=${String(data.vt ?? '')}`).catch(() => null);
    const json = (v: unknown): unknown => {
      try {
        return typeof v === 'string' ? JSON.parse(v || 'null') : v;
      } catch {
        return null;
      }
    };
    const contents = ((json(file?.contents) as Obj[] | null) ?? []).filter((c) => c && Number(c.state ?? 1) === 1);
    const orders = (json(file?.orders) as string[] | null) ?? [];
    contents.sort((a, b) => (orders.indexOf(str(a.id)) + 1 || 999) - (orders.indexOf(str(b.id)) + 1 || 999));
    for (const c of contents) {
      // 社群列
      if (Array.isArray(c.socials)) {
        for (const s of c.socials as Obj[]) if (isHttp(str(s.link))) socials.push({ type: socialType(str(s.link)), value: str(s.link) });
        continue;
      }
      // TikTok 帳號嵌入 → 社群追蹤卡片(帳號網址要另外查)
      if (str(c.subtype) === 'cmpt-tiktok-profile' && uid) {
        const id = str(c.path) || str(((json(c.text) as Obj | null)?.provider as Obj | undefined)?.id);
        const r = id ? await get(`https://api.linkfly.to/v/2.0/share/${uid}/link/${bioId}/itgr/tiktok/op/profile/?id=${encodeURIComponent(id)}`).catch(() => null) : null;
        const link = str(((r?.data as Obj | undefined)?.user as Obj | undefined)?.profile_deep_link);
        if (isHttp(link)) items.push({ kind: 'social', title: '', url: link, platform: 'tiktok' });
        continue;
      }
      const buttons = Array.isArray(c.buttons) ? (c.buttons as Obj[]) : null;
      if (!buttons) {
        const link = str(c.link);
        if (isHttp(link)) items.push(isVideo(link) ? { kind: 'video', title: str(c.title), url: link } : { kind: 'link', title: str(c.title) || link, url: link, image: img(str(c.image)) });
        continue;
      }
      if (str(c.title)) items.push({ kind: 'text', title: str(c.title) });
      for (const b of buttons) {
        const type = Number(b.type);
        const title = str(b.title);
        if (type === 11) {
          // 標題
          if (title) items.push({ kind: 'text', title });
          continue;
        }
        if (type === 13) {
          // 圖片連結
          const t = (json(b.text) as Obj | null) ?? {};
          const image = img(str(t.url) || str(t.image) || str(b.icon));
          const link = str(t.link) || str(b.link);
          if (image) items.push({ kind: 'image', title: '', layout: 'banner', items: [{ image, title, url: link }] });
          continue;
        }
        const link = str(b.link) || str(b.link1);
        if (!isHttp(link)) continue;
        if (isVideo(link)) items.push({ kind: 'video', title, url: link });
        else items.push({ kind: 'link', title: title || link, url: link, image: img(str(b.icon)) });
      }
    }
  }
  return {
    source: 'Linkfly',
    name: str(basic.title),
    bio: str(basic.desc).replace(/\s*\n\s*/g, ' '),
    avatar: img(str(basic.cover)),
    socials: socials.filter((s) => s.type),
    items,
  };
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
    const inner = m[2];
    const text = decode(inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const img = decode((inner.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i) || [])[1] ?? '');
    const s = socialType(url);
    if (s && (!text || text.length < 3)) {
      if (!socials.some((x) => x.type === s)) socials.push({ type: s, value: url });
      seen.add(url);
      continue;
    }
    if (SKIP_TEXT.test(text) || text.length > 80) continue;
    if (!text && img) {
      // 只有圖片的連結:接在前一個圖文連結後面,或開一個新的
      seen.add(url);
      const last = items[items.length - 1];
      if (last?.kind === 'image' && last.items.length < 10) last.items.push({ image: img, title: '', url });
      else items.push({ kind: 'image', title: '', layout: 'banner', items: [{ image: img, title: '', url }] });
      continue;
    }
    if (!text) continue;
    seen.add(url);
    if (isVideo(url)) items.push({ kind: 'video', title: text, url });
    else items.push({ kind: 'link', title: text, url, image: img });
  }
  for (const it of items) if (it.kind === 'image' && it.items.length > 1) it.layout = 'scroll';
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
  const parsed =
    (source === 'Linktree' ? parseLinktree(html) : source === 'Portaly' ? parsePortaly(html) : source === 'LINKGOODS' ? parseLinkgoods(html) : source === 'Linkfly' ? await parseLinkfly(html) : null) ??
    parseGeneric(html, url, source);
  // 去除重複、清理長度
  const seen = new Set<string>();
  parsed.items = parsed.items
    .filter((it) => {
      const key =
        it.kind === 'text' ? `t:${it.title}`
        : it.kind === 'divider' ? `d:${Math.random()}`
        : it.kind === 'image' ? `i:${it.title}:${it.items.map((x) => x.image).join('|')}`
        : `${it.kind}:${it.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60)
    .map((it) => ('title' in it ? { ...it, title: it.title.slice(0, 80) } : it));
  // 只保留名片支援的社群(其他平台的連結已經在項目清單裡)
  const supported = new Set(['instagram', 'line', 'facebook', 'threads', 'tiktok', 'youtube', 'xiaohongshu', 'pinterest', 'x']);
  parsed.socials = parsed.socials.filter((s, i, arr) => supported.has(s.type) && arr.findIndex((x) => x.type === s.type) === i);
  parsed.name = parsed.name.slice(0, 40);
  parsed.bio = parsed.bio.slice(0, 120);
  parsed.tags = [...new Set((parsed.tags ?? []).map((t) => t.trim().slice(0, 12)).filter(Boolean))];
  return parsed;
}
