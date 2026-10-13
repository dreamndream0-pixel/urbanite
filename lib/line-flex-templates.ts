import { lineIconUrl } from '@/lib/line-icons';
// LINE Flex 卡片模板庫:會員卡、商品卡、訂單卡、優惠券卡(各 5 款)。
// 純函式:輸入資料與連結,輸出 LINE Flex bubble。前台預覽(app/admin/line-bot/FlexView)與伺服器傳送共用。

// ---------- 模板清單 ----------
export const MEMBER_STYLES = [
  { key: 'classic', label: '經典會員卡' },
  { key: 'vip', label: '質感形象' },
  { key: 'progress', label: '消費進度' },
  { key: 'diamond', label: '高端尊榮' },
  { key: 'fresh', label: '清新生活' },
] as const;
export const PRODUCT_STYLES = [
  { key: 'fashion', label: '時尚精品' },
  { key: 'beauty', label: '美妝保養' },
  { key: 'food', label: '餐飲美食' },
  { key: 'tech', label: '3C 科技' },
  { key: 'home', label: '居家生活' },
] as const;
export const COUPON_STYLES = [
  { key: 'discount', label: '折扣券' },
  { key: 'freeship', label: '免運券' },
  { key: 'limited', label: '限時優惠' },
  { key: 'birthday', label: '生日禮券' },
  { key: 'vip', label: '會員限定' },
] as const;
export const ORDER_KINDS = [
  { key: 'created', label: '訂單成立' },
  { key: 'shipping', label: '出貨通知' },
  { key: 'delivered', label: '送達通知' },
  { key: 'detail', label: '訂單明細' },
  { key: 'return', label: '退貨退款' },
] as const;

export type MemberStyle = (typeof MEMBER_STYLES)[number]['key'];
export type ProductStyle = (typeof PRODUCT_STYLES)[number]['key'];
export type CouponStyle = (typeof COUPON_STYLES)[number]['key'];
export type OrderKind = (typeof ORDER_KINDS)[number]['key'];

export type Flex = Record<string, unknown>;

// ---------- 小工具 ----------
const money = (n: number) => `NT$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const clip = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const safe = (v: unknown, max: number, fallback = '-') => clip(v, max) || fallback;
// 商品簡介可能是後台編輯器的 HTML:去掉標籤與實體字元
export const plainText = (v: unknown) => String(v ?? '')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&[a-z#0-9]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const https = (u?: string | null) => (u && /^https:\/\//.test(u) ? u : '');

type TextOpts = { size?: string; weight?: 'bold' | 'regular'; color?: string; align?: 'start' | 'center' | 'end'; wrap?: boolean; flex?: number; margin?: string; decoration?: string; maxLines?: number; gravity?: string };
const txt = (text: string, o: TextOpts = {}): Flex => ({ type: 'text', text: text || ' ', ...o });
const box = (layout: 'vertical' | 'horizontal' | 'baseline', contents: Flex[], o: Flex = {}): Flex => ({ type: 'box', layout, contents, ...o });
const sep = (color = '#eeeeee', margin = 'md'): Flex => ({ type: 'separator', color, margin });
const space = (flex = 1): Flex => ({ type: 'box', layout: 'vertical', contents: [], flex });

// 自訂按鈕(圓角、可做外框),整個 box 可點
function pill(label: string, uri: string, o: { bg?: string; fg: string; border?: string; flex?: number; radius?: string } ): Flex {
  return box('vertical', [txt(label, { size: 'sm', weight: 'bold', color: o.fg, align: 'center' })], {
    action: { type: 'uri', label: clip(label, 20) || '查看', uri },
    paddingAll: '10px',
    cornerRadius: o.radius ?? '8px',
    ...(o.bg ? { backgroundColor: o.bg } : {}),
    ...(o.border ? { borderWidth: '1px', borderColor: o.border } : {}),
    flex: o.flex ?? 1,
  });
}
// SVG 線條圖示(轉成 PNG 的網址,見 lib/line-icons)
const icon = (name: string, color: string, size = '20px'): Flex => ({ type: 'image', url: lineIconUrl(name, color), size, aspectRatio: '1:1', aspectMode: 'fit', flex: 0 });

const pills = (a: Flex, b?: Flex): Flex => box('horizontal', b ? [a, b] : [a], { spacing: 'sm' });

// 圖示格(圖示 + 文字),整格可點
function cell(name: string, label: string, uri: string, o: { fg: string; iconBg?: string; iconFg?: string }): Flex {
  return box('vertical', [
    box('vertical', [icon(name, o.iconFg ?? o.fg)], { width: '36px', height: '36px', cornerRadius: '18px', backgroundColor: o.iconBg ?? '#00000010', justifyContent: 'center', alignItems: 'center' }),
    txt(label, { size: 'xxs', color: o.fg, align: 'center', margin: 'sm' }),
  ], { flex: 1, alignItems: 'center', action: { type: 'uri', label: clip(label, 20), uri } });
}

// 進度條(0~1)
function bar(ratio: number, fg: string, bg = '#00000014'): Flex {
  const pct = Math.max(2, Math.min(100, Math.round(ratio * 100)));
  return box('vertical', [box('vertical', [], { width: `${pct}%`, height: '6px', backgroundColor: fg, cornerRadius: '3px' })], { height: '6px', backgroundColor: bg, cornerRadius: '3px', margin: 'md' });
}

// 步驟進度(訂單出貨、退貨)
function steps(labels: string[], active: number, color: string): Flex {
  const dot = (i: number) => box('vertical', i <= active ? [icon('check', '#ffffff', '12px')] : [], {
    width: '18px', height: '18px', cornerRadius: '9px', backgroundColor: i <= active ? color : '#dddddd', justifyContent: 'center', alignItems: 'center',
  });
  const line = (i: number) => box('vertical', [], { flex: 1, height: '2px', backgroundColor: i < active ? color : '#dddddd' });
  const row: Flex[] = [];
  labels.forEach((_, i) => { if (i) row.push(line(i)); row.push(dot(i)); });
  return box('vertical', [
    box('horizontal', row, { alignItems: 'center' }),
    box('horizontal', labels.map((l, i) => txt(l, { size: 'xxs', color: i <= active ? '#333333' : '#aaaaaa', align: i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'center', flex: 1 })), { margin: 'sm' }),
  ], { margin: 'lg' });
}

const kv = (k: string, v: string, o: { kc?: string; vc?: string; bold?: boolean } = {}): Flex =>
  box('horizontal', [txt(k, { size: 'xs', color: o.kc ?? '#888888', flex: 4 }), txt(v, { size: o.bold ? 'md' : 'xs', color: o.vc ?? '#222222', align: 'end', flex: 6, weight: o.bold ? 'bold' : 'regular', wrap: true })], { margin: 'sm' });

const bubble = (body: Flex, o: Flex = {}): Flex => ({ type: 'bubble', size: 'mega', body, ...o });

// ---------- 會員卡 ----------
export type MemberData = {
  shopName: string;
  name: string;
  memberNo: string;
  avatar?: string;
  orderCount: number;
  couponCount: number;
  spent: number; // 累計消費
};
export type MemberLinks = { account: string; orders: string; coupons: string; home: string };

export function memberBubble(style: MemberStyle | string, d: MemberData, l: MemberLinks): Flex {
  const shop = safe(d.shopName, 30, 'MEMBER').toUpperCase();
  const name = safe(d.name, 30, '會員');
  const no = `會員編號 ${safe(d.memberNo, 20)}`;
  const avatar = https(d.avatar);
  // 消費進度:下一個整數門檻(5,000 為單位)
  const next = Math.max(5000, Math.ceil((d.spent + 1) / 5000) * 5000);

  if (style === 'vip') {
    const green = '#24402f';
    const face = avatar
      ? box('vertical', [{ type: 'image', url: avatar, aspectMode: 'cover', aspectRatio: '1:1', size: 'full' }], { width: '64px', height: '64px', cornerRadius: '32px', borderWidth: '2px', borderColor: '#ffffff' })
      : box('vertical', [txt(name.slice(0, 1), { size: 'xl', weight: 'bold', color: green, align: 'center' })], { width: '64px', height: '64px', cornerRadius: '32px', backgroundColor: '#efe6d6', justifyContent: 'center' });
    return bubble(box('vertical', [
      box('vertical', [
        txt(shop, { size: 'xxs', color: '#e9dcc3', align: 'center', weight: 'bold' }),
        txt('VIP 尊榮會員', { size: 'lg', color: '#ffffff', align: 'center', weight: 'bold', margin: 'sm' }),
        box('horizontal', [space(), face, space()], { margin: 'lg' }),
      ], { backgroundColor: green, paddingAll: '20px', paddingBottom: '16px' }),
      box('vertical', [
        box('horizontal', [txt(name, { weight: 'bold', size: 'md', color: '#222222', flex: 5 }), txt(`${d.orderCount} 筆訂單`, { size: 'sm', color: green, weight: 'bold', align: 'end', flex: 5 })]),
        txt(no, { size: 'xxs', color: '#999999', margin: 'xs' }),
        sep('#eee6d8', 'lg'),
        box('horizontal', [
          cell('gift', '專屬優惠', l.coupons, { fg: '#555555', iconBg: '#f1ebe0' }),
          cell('package', '我的訂單', l.orders, { fg: '#555555', iconBg: '#f1ebe0' }),
          cell('user', '會員中心', l.account, { fg: '#555555', iconBg: '#f1ebe0' }),
        ], { margin: 'lg' }),
        box('vertical', [pill('查看會員權益 →', l.account, { bg: green, fg: '#ffffff', radius: '20px' })], { margin: 'lg' }),
      ], { backgroundColor: '#fbf8f2', paddingAll: '18px' }),
    ], { paddingAll: '0px' }));
  }

  if (style === 'progress') {
    const pink = '#d9506b';
    return bubble(box('vertical', [
      txt('HELLO!', { size: 'sm', color: pink, weight: 'bold' }),
      txt(name, { size: 'xl', weight: 'bold', color: '#222222' }),
      txt(`歡迎回到 ${safe(d.shopName, 30, '')}`, { size: 'xs', color: '#999999' }),
      box('vertical', [
        box('baseline', [txt(money(d.spent), { size: 'xxl', weight: 'bold', color: '#222222', flex: 0 }), txt('累計消費', { size: 'xs', color: '#999999', margin: 'md' })]),
        txt(`再消費 ${money(next - d.spent)} 達 ${money(next)}`, { size: 'xs', color: '#666666', margin: 'sm' }),
        bar(d.spent / next, pink, '#f5dde3'),
        txt(`${money(d.spent)} / ${money(next)}`, { size: 'xxs', color: '#aaaaaa', align: 'end', margin: 'sm' }),
      ], { backgroundColor: '#ffffff', cornerRadius: '14px', paddingAll: '16px', margin: 'lg' }),
      box('horizontal', [
        cell('gift', '會員優惠', l.coupons, { fg: '#555555', iconBg: '#ffffff', iconFg: pink }),
        cell('package', '我的訂單', l.orders, { fg: '#555555', iconBg: '#ffffff', iconFg: pink }),
        cell('user', '個人資料', l.account, { fg: '#555555', iconBg: '#ffffff', iconFg: pink }),
      ], { margin: 'lg' }),
    ], { background: { type: 'linearGradient', angle: '160deg', startColor: '#fde7ea', endColor: '#f7d2d9' }, paddingAll: '20px' }));
  }

  if (style === 'diamond') {
    const gold = '#d8b878';
    const dark = (name: string, label: string, uri: string) => cell(name, label, uri, { fg: '#d9d9d9', iconBg: '#2b2b2b', iconFg: gold });
    return bubble(box('vertical', [
      txt(shop, { size: 'xxs', color: '#a8a8a8', align: 'center', weight: 'bold' }),
      txt('DIAMOND MEMBER', { size: 'md', color: gold, align: 'center', weight: 'bold', margin: 'sm' }),
      box('horizontal', [space(), icon('gem', '#e8e8e8', '48px'), space()], { margin: 'md' }),
      txt(name, { size: 'md', color: '#ffffff', align: 'center', weight: 'bold', margin: 'md' }),
      txt(no, { size: 'xxs', color: '#9a9a9a', align: 'center', margin: 'xs' }),
      box('horizontal', [dark('message', '專屬客服', l.account), dark('gift', '我的優惠', l.coupons), dark('package', '我的訂單', l.orders), dark('user', '會員中心', l.account)], { margin: 'xl', paddingAll: '10px', backgroundColor: '#1d1d1d', cornerRadius: '12px' }),
      box('vertical', [pill('探索會員禮遇 →', l.home, { fg: gold, border: gold, radius: '20px' })], { margin: 'lg' }),
    ], { backgroundColor: '#0f0f0f', paddingAll: '20px' }));
  }

  if (style === 'fresh') {
    const sage = '#5c7350';
    const wcell = (name: string, label: string, uri: string) => cell(name, label, uri, { fg: '#555555', iconBg: '#eef2ea', iconFg: sage });
    return bubble(box('vertical', [
      txt(shop, { size: 'sm', color: '#eef2ea', weight: 'bold' }),
      txt('會員中心', { size: 'lg', color: '#ffffff', weight: 'bold' }),
      txt(name, { size: 'md', color: '#ffffff', margin: 'lg' }),
      txt('您的日常更美好', { size: 'xs', color: '#dfe7d8' }),
      box('horizontal', [
        box('vertical', [txt('可用優惠券', { size: 'xs', color: '#888888' }), txt(`${d.couponCount} 張`, { size: 'xl', weight: 'bold', color: '#222222' })], { flex: 1 }),
        box('vertical', [icon('chevron', '#999999', '20px')], { flex: 0, justifyContent: 'center' }),
      ], { backgroundColor: '#ffffff', cornerRadius: '12px', paddingAll: '14px', margin: 'lg', action: { type: 'uri', label: '可用優惠券', uri: l.coupons } }),
      box('horizontal', [wcell('tag', '最新優惠', l.coupons), wcell('package', '我的訂單', l.orders), wcell('settings', '會員設定', l.account)], { backgroundColor: '#ffffff', cornerRadius: '12px', paddingAll: '12px', margin: 'md' }),
    ], { background: { type: 'linearGradient', angle: '160deg', startColor: '#6d8660', endColor: '#4c6143' }, paddingAll: '20px' }));
  }

  // classic(預設):米金色
  const gold = '#a8802f';
  return bubble(box('vertical', [
    txt(shop, { size: 'xxs', color: '#6b5a3c', align: 'center', weight: 'bold' }),
    box('horizontal', [space(), icon('crown', gold, '32px'), space()], { margin: 'md' }),
    txt('GOLD MEMBER', { size: 'md', color: gold, align: 'center', weight: 'bold' }),
    sep('#e2d4b8', 'lg'),
    txt(`${name} 會員`, { size: 'md', color: '#222222', align: 'center', weight: 'bold', margin: 'lg' }),
    txt(no, { size: 'xxs', color: '#999999', align: 'center', margin: 'xs' }),
    txt(`${d.orderCount}`, { size: 'xxl', color: '#222222', align: 'center', weight: 'bold', margin: 'lg' }),
    txt('累計訂單', { size: 'xxs', color: '#999999', align: 'center' }),
    box('vertical', [pills(pill('會員優惠', l.coupons, { bg: '#1f1b19', fg: '#ffffff' }), pill('我的訂單', l.orders, { bg: '#ffffff', fg: '#1f1b19', border: '#d9cdb6' }))], { margin: 'xl' }),
  ], { background: { type: 'linearGradient', angle: '180deg', startColor: '#fbf7ee', endColor: '#efe3cc' }, paddingAll: '22px' }));
}

// ---------- 商品卡 ----------
export type ProductData = { name: string; subtitle?: string; price: number; originalPrice?: number | null; image?: string; url: string; badge?: string };

const PRODUCT_THEME: Record<ProductStyle, { bg: string; fg: string; sub: string; primary: string; primaryFg: string; outline: string; badgeBg: string; badge: string }> = {
  fashion: { bg: '#ffffff', fg: '#222222', sub: '#999999', primary: '#6e5038', primaryFg: '#ffffff', outline: '#6e5038', badgeBg: '#6e5038', badge: '' },
  beauty: { bg: '#ffffff', fg: '#222222', sub: '#999999', primary: '#b06a5e', primaryFg: '#ffffff', outline: '#c99b92', badgeBg: '#8d6bd1', badge: 'NEW' },
  food: { bg: '#ffffff', fg: '#222222', sub: '#999999', primary: '#8a5a2b', primaryFg: '#ffffff', outline: '#8a5a2b', badgeBg: '#8a5a2b', badge: '' },
  tech: { bg: '#1c1c1e', fg: '#ffffff', sub: '#a1a1a6', primary: '#ffffff', primaryFg: '#1c1c1e', outline: '#8e8e93', badgeBg: '#000000', badge: '熱門商品' },
  home: { bg: '#ffffff', fg: '#222222', sub: '#999999', primary: '#8a6a4a', primaryFg: '#ffffff', outline: '#8a6a4a', badgeBg: '#6d7f5f', badge: '' },
};

export function productBubble(style: ProductStyle | string, p: ProductData): Flex {
  const t = PRODUCT_THEME[(style in PRODUCT_THEME ? style : 'fashion') as ProductStyle];
  const image = https(p.image);
  const badge = p.badge ?? t.badge;
  const hero = image
    ? box('vertical', [
        { type: 'image', url: image, size: 'full', aspectRatio: '4:3', aspectMode: 'cover' },
        ...(badge ? [box('vertical', [txt(badge, { size: 'xxs', color: '#ffffff', weight: 'bold' })], { position: 'absolute', offsetTop: '10px', offsetStart: '10px', backgroundColor: t.badgeBg, cornerRadius: '10px', paddingStart: '8px', paddingEnd: '8px', paddingTop: '2px', paddingBottom: '2px' })] : []),
      ], { paddingAll: '0px' })
    : undefined;
  const onSale = p.originalPrice && p.originalPrice > p.price;
  return {
    type: 'bubble', size: 'kilo',
    ...(hero ? { hero } : {}),
    body: box('vertical', [
      txt(safe(p.name, 60, '商品'), { size: 'md', weight: 'bold', color: t.fg, wrap: true, maxLines: 2 }),
      ...(plainText(p.subtitle) ? [txt(clip(plainText(p.subtitle), 60), { size: 'xs', color: t.sub, wrap: true, maxLines: 1 })] : []),
      box('baseline', [
        txt(money(p.price), { size: 'md', weight: 'bold', color: t.fg, flex: 0 }),
        ...(onSale ? [txt(money(p.originalPrice!), { size: 'xs', color: t.sub, decoration: 'line-through', margin: 'md', flex: 0 })] : []),
      ], { margin: 'sm' }),
    ], { backgroundColor: t.bg, paddingAll: '14px', spacing: 'xs' }),
    footer: box('vertical', [pills(
      pill('查看商品', p.url, { fg: style === 'tech' ? '#ffffff' : t.outline, border: t.outline }),
      pill('立即購買', p.url, { bg: t.primary, fg: t.primaryFg }),
    )], { backgroundColor: t.bg, paddingAll: '12px', paddingTop: '0px' }),
  };
}

// ---------- 優惠券 ----------
export type CouponData = { name: string; valueText: string; condition: string; code: string; expiry?: string; claimUrl: string; shopUrl: string };

export function couponValueText(c: { type: string; value: number }) {
  if (c.type === 'free_shipping') return '免運';
  if (c.type === 'percent') {
    const off = (100 - Number(c.value)) / 10;
    return `${Number.isInteger(off) ? off : off.toFixed(1)} 折`;
  }
  return `NT$ ${Math.round(Number(c.value) || 0).toLocaleString('en-US')}`;
}
export const defaultCouponStyle = (type: string): CouponStyle => (type === 'free_shipping' ? 'freeship' : 'discount');

export function couponBubble(style: CouponStyle | string, c: CouponData): Flex {
  const meta = box('horizontal', [txt(`代碼 ${safe(c.code, 20)}`, { size: 'xxs', flex: 1 }), txt(c.expiry ? `有效期限 ${c.expiry}` : '無使用期限', { size: 'xxs', align: 'end', flex: 1 })], { margin: 'lg' });
  const recolor = (b: Flex, color: string): Flex => ({ ...b, contents: (b.contents as Flex[]).map((x) => ({ ...x, color })) });
  type T = { bg: Flex; label: string; labelColor: string; valueColor: string; subColor: string; deco: string; primary: { bg: string; fg: string }; second: { bg?: string; fg: string; border?: string }; badge?: { text: string; bg: string } };
  const themes: Record<CouponStyle, T> = {
    discount: { bg: { background: { type: 'linearGradient', angle: '135deg', startColor: '#fff1f1', endColor: '#fbdcdc' } }, label: '全館折扣券', labelColor: '#c8323c', valueColor: '#c8323c', subColor: '#8a5a5a', deco: 'ticket', primary: { bg: '#c8323c', fg: '#ffffff' }, second: { bg: '#ffffff', fg: '#c8323c', border: '#e8b4b4' } },
    freeship: { bg: { background: { type: 'linearGradient', angle: '135deg', startColor: '#f7f3e8', endColor: '#e9e1cc' } }, label: '免運券', labelColor: '#3f5a3a', valueColor: '#2f4a2b', subColor: '#6b6a55', deco: 'truck', primary: { bg: '#3f5a3a', fg: '#ffffff' }, second: { bg: '#ffffff', fg: '#3f5a3a', border: '#c9cdb6' } },
    limited: { bg: { backgroundColor: '#141414' }, label: '期間限定', labelColor: '#ffffff', valueColor: '#e7c27a', subColor: '#bdbdbd', deco: 'hourglass', primary: { bg: '#d4a44c', fg: '#1a1a1a' }, second: { bg: '#3a3a3a', fg: '#eeeeee' }, badge: { text: '期間限定', bg: '#c8323c' } },
    birthday: { bg: { background: { type: 'linearGradient', angle: '135deg', startColor: '#fff0f4', endColor: '#fbd5e0' } }, label: '生日專屬禮', labelColor: '#c23b5e', valueColor: '#c23b5e', subColor: '#8a5a6a', deco: 'gift', primary: { bg: '#c23b5e', fg: '#ffffff' }, second: { bg: '#ffffff', fg: '#c23b5e', border: '#efb7c6' } },
    vip: { bg: { background: { type: 'linearGradient', angle: '135deg', startColor: '#1f3a2b', endColor: '#13261b' } }, label: '會員專屬券', labelColor: '#e9dcc3', valueColor: '#e7c27a', subColor: '#c9d3c5', deco: 'crown', primary: { bg: '#d4a44c', fg: '#1a1a1a' }, second: { bg: '#ffffff', fg: '#1f3a2b' } },
  };
  const key = (style in themes ? style : 'discount') as CouponStyle;
  const t = themes[key];
  const top: Flex[] = [
    t.badge
      ? box('horizontal', [box('vertical', [txt(t.badge.text, { size: 'xxs', color: '#ffffff', weight: 'bold' })], { backgroundColor: t.badge.bg, cornerRadius: '4px', paddingStart: '6px', paddingEnd: '6px', paddingTop: '2px', paddingBottom: '2px', flex: 0 }), space()])
      : txt(t.label, { size: 'sm', color: t.labelColor, weight: 'bold' }),
    box('horizontal', [
      box('vertical', [
        txt(safe(c.valueText, 20), { size: '3xl', weight: 'bold', color: t.valueColor }),
        txt(safe(c.name, 40, t.label), { size: 'sm', color: key === 'limited' || key === 'vip' ? '#ffffff' : '#333333', weight: 'bold', wrap: true }),
        txt(safe(c.condition, 60, '無消費門檻'), { size: 'xs', color: t.subColor, wrap: true }),
      ], { flex: 7 }),
      ...(t.deco ? [box('vertical', [icon(t.deco, t.valueColor, '56px')], { flex: 3, alignItems: 'flex-end', justifyContent: 'center' })] : []),
    ], { margin: 'md' }),
    recolor(meta, t.subColor),
  ];
  return {
    type: 'bubble', size: 'mega',
    body: box('vertical', top, { ...t.bg, paddingAll: '20px' }),
    footer: box('vertical', [pills(
      pill('立即領取', c.claimUrl, { bg: t.primary.bg, fg: t.primary.fg }),
      pill('去逛逛', c.shopUrl, { bg: t.second.bg, fg: t.second.fg, border: t.second.border }),
    )], { ...t.bg, paddingAll: '14px', paddingTop: '0px' }),
  };
}

// ---------- 訂單卡 ----------
export type OrderCardItem = { name: string; variant?: string; quantity: number; price: number; image?: string };
export type OrderCardData = {
  shopName: string;
  title: string; // 例:訂單已出貨
  subtitle?: string;
  orderNo: string;
  total: number;
  date?: string;
  items: OrderCardItem[];
  rows?: [string, string][]; // 額外資訊(付款方式、門市、物流單號…)
  step?: number; // 出貨/退貨進度(0 起算)
  ship?: { step: number; last: string; rows: [string, string][] } | null; // 訂單明細卡的出貨狀態(進度、物流、單號)
  link: string; // 查看訂單
  homeLink: string;
  buttonLabel?: string;
};

const ORDER_THEME: Record<OrderKind, { color: string; icon: string; second: string }> = {
  created: { color: '#2e9e5b', icon: 'check', second: '繼續購物' },
  shipping: { color: '#2f6fe0', icon: 'truck', second: '逛逛商品' },
  delivered: { color: '#2e9e5b', icon: 'check', second: '再次購買' },
  detail: { color: '#2e9e5b', icon: 'receipt', second: '逛逛商品' },
  return: { color: '#e8732e', icon: 'undo', second: '逛逛商品' },
};

export function orderBubble(kind: OrderKind | string, d: OrderCardData, color?: string, event?: string): Flex {
  const k = (kind in ORDER_THEME ? kind : 'created') as OrderKind;
  const th = ORDER_THEME[k];
  const c = color ?? th.color;
  const head = box('horizontal', [
    box('vertical', [icon(event === 'cancelled' ? 'x' : th.icon, '#ffffff', '20px')], { width: '36px', height: '36px', cornerRadius: '18px', backgroundColor: c, justifyContent: 'center', alignItems: 'center', flex: 0 }),
    box('vertical', [
      txt(safe(d.title, 30, '訂單通知'), { size: 'lg', weight: 'bold', color: c }),
      ...(d.subtitle ? [txt(clip(d.subtitle, 80), { size: 'xs', color: '#666666', wrap: true })] : []),
    ], { paddingStart: '12px', flex: 1 }),
  ], { alignItems: 'center' });
  const first = d.items[0];
  const thumb = (u?: string, size = '56px') => https(u)
    ? box('vertical', [{ type: 'image', url: https(u), size: 'full', aspectMode: 'cover', aspectRatio: '1:1' }], { width: size, height: size, cornerRadius: '8px', flex: 0 })
    : box('vertical', [icon('package', '#aaaaaa', '24px')], { width: size, height: size, cornerRadius: '8px', backgroundColor: '#f2f2f2', justifyContent: 'center', alignItems: 'center', flex: 0 });
  const count = d.items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  const extra = (d.rows ?? []).filter(([, v]) => v).map(([kk, v]) => kv(kk, v));
  const body: Flex[] = [head, sep('#eeeeee', 'lg'), kv('訂單編號', d.orderNo)];

  if (k === 'detail') {
    body.splice(0, 3,
      box('horizontal', [icon('receipt', c, '18px'), txt('訂單明細', { size: 'md', weight: 'bold', color: '#222222', flex: 1, margin: 'sm' }), txt(clip(d.title, 20), { size: 'xs', color: c, weight: 'bold', align: 'end', flex: 0 })]),
      box('horizontal', [txt(`#${d.orderNo}`, { size: 'xxs', color: '#999999' }), txt(d.date ?? '', { size: 'xxs', color: '#999999', align: 'end' })], { margin: 'xs' }),
      sep('#eeeeee', 'md'),
    );
    // 出貨狀態:進度條+物流資訊
    if (d.ship) {
      body.push(steps(['訂單處理', '已出貨', '配送中', d.ship.last], d.ship.step, c));
      body.push(...d.ship.rows.filter(([, v]) => v).map(([kk, v]) => kv(kk, v)));
      body.push(sep('#eeeeee', 'md'));
    }
    d.items.slice(0, 4).forEach((i) => body.push(box('horizontal', [
      thumb(i.image, '44px'),
      box('vertical', [txt(safe(i.name, 40, '商品'), { size: 'xs', color: '#222222', wrap: true, maxLines: 2 }), ...(i.variant ? [txt(clip(i.variant, 30), { size: 'xxs', color: '#999999' })] : [])], { flex: 1, paddingStart: '10px' }),
      box('vertical', [txt(`×${i.quantity}`, { size: 'xxs', color: '#999999', align: 'end' }), txt(money(i.price * i.quantity), { size: 'xs', color: '#222222', align: 'end' })], { flex: 0 }),
    ], { margin: 'md', alignItems: 'center' })));
    if (d.items.length > 4) body.push(txt(`等 ${d.items.length - 4} 項商品`, { size: 'xxs', color: '#aaaaaa', margin: 'sm' }));
    body.push(sep('#eeeeee', 'md'), ...extra, kv('合計金額', money(d.total), { bold: true }));
  } else {
    // 取消:訂單金額+取消日期,不顯示退貨進度
    const cancelled = event === 'cancelled';
    if (k === 'created' || k === 'return') body.push(kv(k === 'return' && !cancelled ? '退款金額' : '訂單金額', money(d.total), { bold: k === 'created' }));
    if (d.date) body.push(kv(cancelled ? '下單日期' : k === 'return' ? '申請日期' : k === 'delivered' ? '送達時間' : '日期', d.date));
    body.push(...extra);
    if (k === 'shipping') body.push(steps(['訂單處理', '已出貨', '配送中', '已送達'], d.step ?? 1, c));
    if (k === 'return' && !cancelled) body.push(steps(['申請成立', '商品退回', '審核中', '退款完成'], d.step ?? 0, c));
    if (k === 'created' || k === 'delivered' || k === 'return') {
      body.push(box('horizontal', [
        thumb(first?.image),
        box('vertical', [
          txt(safe(first?.name, 40, '商品'), { size: 'xs', color: '#222222', wrap: true, maxLines: 2 }),
          txt(count > 1 ? `共 ${count} 件商品` : first?.variant || ' ', { size: 'xxs', color: '#999999' }),
        ], { flex: 1, paddingStart: '12px' }),
      ], { margin: 'lg', alignItems: 'center', backgroundColor: '#fafafa', cornerRadius: '10px', paddingAll: '10px' }));
    }
  }
  const dark = k === 'shipping' || k === 'return' ? c : '#1f1b19';
  return {
    type: 'bubble', size: 'mega',
    body: box('vertical', body, { paddingAll: '18px' }),
    footer: box('vertical', [pills(
      pill(clip(d.buttonLabel, 20) || (k === 'return' && event !== 'cancelled' ? '查看進度' : '查看訂單'), d.link, { bg: dark, fg: '#ffffff' }),
      pill(th.second, d.homeLink, { bg: '#ffffff', fg: '#333333', border: '#dddddd' }),
    )], { paddingAll: '14px', paddingTop: '0px' }),
    styles: { footer: { separator: false } },
  };
}

// 訂單事件 → 卡片種類與進度
export function orderKindOf(event?: string): { kind: OrderKind; step?: number } {
  switch (event) {
    case 'created': case 'paid': return { kind: 'created' };
    case 'ready': return { kind: 'shipping', step: 0 };
    case 'shipped': return { kind: 'shipping', step: 1 };
    case 'arrived': case 'at_store': return { kind: 'shipping', step: 2 };
    case 'picked_up': case 'delivered': case 'completed': return { kind: 'delivered' };
    case 'return_requested': return { kind: 'return', step: 0 };
    case 'refunded': return { kind: 'return', step: 3 };
    case 'cancelled': return { kind: 'return', step: 3 };
    default: return { kind: 'detail' };
  }
}

// ---------- 範例資料(後台預覽、模板挑選) ----------
const SAMPLE_IMG = '';
export const SAMPLE_MEMBER: MemberData = { shopName: 'URBAN SELECT', name: '王小明', memberNo: 'UB20240088', orderCount: 12, couponCount: 3, spent: 8650 };
export const SAMPLE_LINKS: MemberLinks = { account: 'https://example.com', orders: 'https://example.com', coupons: 'https://example.com', home: 'https://example.com' };
export const SAMPLE_PRODUCT: ProductData = { name: '質感風衣外套', subtitle: '經典剪裁・四季百搭', price: 2980, originalPrice: 3680, image: SAMPLE_IMG, url: 'https://example.com' };
export const SAMPLE_COUPON: CouponData = { name: '全館折扣券', valueText: 'NT$ 100', condition: '滿 NT$1,000 可用', code: 'URB100', expiry: '2026/12/31', claimUrl: 'https://example.com', shopUrl: 'https://example.com' };
export const SAMPLE_ORDER: OrderCardData = {
  shopName: 'URBAN SELECT', title: '訂單成立', subtitle: '感謝您的訂購!', orderNo: 'UR202610130001', total: 7260, date: '2026/10/13',
  items: [{ name: '質感風衣外套', variant: '米色 / M', quantity: 1, price: 2980 }, { name: '經典皮革包', quantity: 1, price: 4280 }],
  link: 'https://example.com', homeLink: 'https://example.com',
};
