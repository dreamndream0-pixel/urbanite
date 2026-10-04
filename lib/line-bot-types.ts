// LINE 機器人:前後台共用的型別、預設文案、圖文選單格局(不含伺服器程式)

// ---------- 訊息 ----------
export type BotPage = 'home' | 'account' | 'orders' | 'coupons' | 'join';
export type BotAction = { type: 'url'; value: string } | { type: 'keyword'; value: string } | { type: 'page'; value: BotPage };
export type BotButton = { label: string; action: BotAction };
export type BotCard = { image: string; title: string; body: string; buttons: BotButton[] };

export type BotMessage =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image'; url: string }
  | { id: string; type: 'card'; card: BotCard }
  | { id: string; type: 'carousel'; cards: BotCard[] }
  | { id: string; type: 'products'; productIds: string[] }
  | { id: string; type: 'coupon'; couponId: string }
  | { id: string; type: 'bind' };

export type MessageSet = { messages: BotMessage[]; quickReplies: string[] };

export const MAX_MESSAGES = 5; // LINE 一次回覆最多 5 則
export const MAX_QUICK_REPLIES = 13;
export const MAX_CARD_BUTTONS = 3;
export const MAX_CAROUSEL = 10;

export const PAGE_OPTIONS: { key: BotPage; label: string; path: string }[] = [
  { key: 'home', label: '官網首頁', path: '/' },
  { key: 'account', label: '會員中心', path: '/account' },
  { key: 'orders', label: '我的訂單', path: '/account?tab=orders' },
  { key: 'coupons', label: '我的優惠券', path: '/account?tab=coupons' },
  { key: 'join', label: 'LINE 一鍵加入會員', path: '/auth/line/start?next=/account' },
];

export const MESSAGE_TYPES: { type: BotMessage['type']; label: string; hint: string }[] = [
  { type: 'text', label: '文字', hint: '可插入變數' },
  { type: 'image', label: '圖片', hint: '單張圖片' },
  { type: 'card', label: '圖文卡片', hint: '圖片、標題、按鈕' },
  { type: 'carousel', label: '多頁卡片', hint: '左右滑動' },
  { type: 'products', label: '商品', hint: '選網站商品' },
  { type: 'coupon', label: '優惠券', hint: '附領取按鈕' },
  { type: 'bind', label: '會員綁定', hint: '加入會員/綁定' },
];

export const VARIABLES = ['{LINE名稱}', '{會員姓名}'];
export const ORDER_VARIABLES = ['{會員姓名}', '{訂單編號}', '{訂單金額}', '{取貨門市}', '{物流單號}', '{退款金額}'];

const uid = () => Math.random().toString(36).slice(2, 10);
export const newId = uid;

export function blankMessage(type: BotMessage['type']): BotMessage {
  const id = uid();
  switch (type) {
    case 'text': return { id, type, text: '' };
    case 'image': return { id, type, url: '' };
    case 'card': return { id, type, card: blankCard() };
    case 'carousel': return { id, type, cards: [blankCard(), blankCard()] };
    case 'products': return { id, type, productIds: [] };
    case 'coupon': return { id, type, couponId: '' };
    default: return { id, type: 'bind' };
  }
}

export function blankCard(): BotCard {
  return { image: '', title: '', body: '', buttons: [{ label: '查看', action: { type: 'page', value: 'home' } }] };
}

const set = (messages: BotMessage[], quickReplies: string[] = []): MessageSet => ({ messages, quickReplies });
const text = (t: string): BotMessage => ({ id: uid(), type: 'text', text: t });

// ---------- 內建查詢 / 訂單通知 ----------
export type BuiltinKey = 'orders' | 'coupons' | 'credit' | 'member' | 'bind';
export type Builtin = { enabled: boolean; keywords: string[]; intro: string };

export const BUILTIN_LABELS: Record<BuiltinKey, { label: string; hint: string }> = {
  orders: { label: '訂單查詢', hint: '回覆最近 5 筆訂單與狀態' },
  coupons: { label: '優惠券', hint: '回覆可使用的優惠券' },
  credit: { label: '購物金', hint: '回覆購物金餘額' },
  member: { label: '會員資料', hint: '回覆會員資料(手機、Email 遮蔽)' },
  bind: { label: '會員綁定', hint: '未綁定:加入會員/綁定;已綁定:告知已是會員' },
};

export type NotifyKey = 'paid' | 'shipped' | 'at_store' | 'delivered' | 'refunded' | 'cancelled';
export type NotifyRule = { enabled: boolean; text: string; button: boolean };

export const NOTIFY_LABELS: Record<NotifyKey, { label: string; hint: string }> = {
  paid: { label: '付款完成', hint: '收到付款(線上付款或後台標記已付款)' },
  shipped: { label: '已出貨', hint: '訂單出貨、物流配送中' },
  at_store: { label: '已到店', hint: '超商取貨:包裹送達門市' },
  delivered: { label: '已取貨/送達', hint: '客人取貨或宅配送達' },
  refunded: { label: '退款完成', hint: '標記已退款' },
  cancelled: { label: '訂單取消', hint: '訂單取消' },
};

export type BotConfig = {
  welcomeGuest: MessageSet;
  welcomeMember: MessageSet;
  defaultReply: MessageSet & { enabled: boolean };
  alreadyMember: string;
  builtins: Record<BuiltinKey, Builtin>;
  notify: Record<NotifyKey, NotifyRule>;
  brandColor: string;
};

export const DEFAULT_BOT_CONFIG: BotConfig = {
  welcomeGuest: set([
    text('嗨 {LINE名稱},謝謝你加入 Urbanite。\n\n綁定官網會員之後,訂單進度、優惠券和購物金都可以直接在這裡查。'),
    { id: uid(), type: 'bind' },
  ]),
  welcomeMember: set([text('{會員姓名},歡迎回來。\n想查訂單或優惠券,點下面的按鈕就可以。')], ['訂單查詢', '優惠券', '購物金', '會員資料']),
  defaultReply: { enabled: false, ...set([text('收到你的訊息了,客服會在營業時間回覆你(週一至週五 11:00–18:00)。')]) },
  alreadyMember: '{會員姓名},你已經是 Urbanite 官網會員了,LINE 也綁定好了。',
  builtins: {
    orders: { enabled: true, keywords: ['訂單', '出貨', '物流'], intro: '你最近的訂單:' },
    coupons: { enabled: true, keywords: ['優惠', '折價', '折扣', 'coupon'], intro: '你目前可以用的優惠券:' },
    credit: { enabled: true, keywords: ['購物金', '回饋金', '點數'], intro: '' },
    member: { enabled: true, keywords: ['會員資料', '我的資料', '帳號'], intro: '' },
    bind: { enabled: true, keywords: ['綁定', '加入會員', '註冊'], intro: '點下面的按鈕加入會員或登入,就會完成 LINE 綁定。' },
  },
  notify: {
    paid: { enabled: false, button: true, text: '{會員姓名} 你好,訂單 {訂單編號} 已收到付款 {訂單金額},我們會盡快幫你出貨。' },
    shipped: { enabled: false, button: true, text: '訂單 {訂單編號} 已經出貨了。\n物流單號:{物流單號}' },
    at_store: { enabled: false, button: true, text: '訂單 {訂單編號} 已送到 {取貨門市},記得在 7 天內取貨喔。' },
    delivered: { enabled: false, button: false, text: '訂單 {訂單編號} 已經送達,謝謝你在 Urbanite 購物。' },
    refunded: { enabled: false, button: true, text: '訂單 {訂單編號} 的退款 {退款金額} 已經處理完成。' },
    cancelled: { enabled: false, button: false, text: '訂單 {訂單編號} 已取消,有任何問題都可以直接在這裡留言給我們。' },
  },
  brandColor: '#1f1b19',
};

// 合併預設值(舊資料缺的欄位補上)
export function resolveBotConfig(raw: unknown): BotConfig {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<BotConfig>;
  const pickSet = (v: unknown, fallback: MessageSet): MessageSet => {
    const s = v as Partial<MessageSet> | undefined;
    return s && Array.isArray(s.messages) ? { messages: s.messages, quickReplies: Array.isArray(s.quickReplies) ? s.quickReplies : [] } : fallback;
  };
  const builtins = { ...DEFAULT_BOT_CONFIG.builtins };
  for (const k of Object.keys(builtins) as BuiltinKey[]) builtins[k] = { ...builtins[k], ...(d.builtins?.[k] ?? {}) };
  const notify = { ...DEFAULT_BOT_CONFIG.notify };
  for (const k of Object.keys(notify) as NotifyKey[]) notify[k] = { ...notify[k], ...(d.notify?.[k] ?? {}) };
  return {
    welcomeGuest: pickSet(d.welcomeGuest, DEFAULT_BOT_CONFIG.welcomeGuest),
    welcomeMember: pickSet(d.welcomeMember, DEFAULT_BOT_CONFIG.welcomeMember),
    defaultReply: { ...pickSet(d.defaultReply, DEFAULT_BOT_CONFIG.defaultReply), enabled: Boolean(d.defaultReply?.enabled) },
    alreadyMember: typeof d.alreadyMember === 'string' ? d.alreadyMember : DEFAULT_BOT_CONFIG.alreadyMember,
    builtins,
    notify,
    brandColor: typeof d.brandColor === 'string' && /^#[0-9a-f]{6}$/i.test(d.brandColor) ? d.brandColor : DEFAULT_BOT_CONFIG.brandColor,
  };
}

// ---------- 關鍵字規則 ----------
export type RuleSchedule = { days: number[]; start: string; end: string };
export type BotRule = {
  id: string;
  name: string;
  keywords: string[];
  match: 'exact' | 'contains';
  content: MessageSet;
  enabled: boolean;
  schedule: RuleSchedule | null;
  sort_order: number;
  hits: number;
};

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// ---------- 圖文選單 ----------
export type MenuSize = 'large' | 'compact';
export type MenuArea = { x: number; y: number; width: number; height: number };
export type MenuCell = { label: string; icon: string; action: BotAction };
export type MenuDesign = { mode: 'template' | 'upload'; bg: string; fg: string; line: string };
export type RichMenu = {
  id: string;
  name: string;
  audience: 'guest' | 'member';
  size: MenuSize;
  layout: string;
  areas: MenuCell[];
  design: MenuDesign;
  image_url: string;
  chat_bar_text: string;
  line_rich_menu_id: string | null;
  published_at: string | null;
};

export const MENU_SIZE: Record<MenuSize, { width: number; height: number; label: string }> = {
  large: { width: 2500, height: 1686, label: '大(2500×1686)' },
  compact: { width: 2500, height: 843, label: '小(2500×843)' },
};

// 格局:以 2500 寬為基準的區塊座標
const W = 2500;
const H = 1686;
const h = 843;
export const MENU_LAYOUTS: { key: string; size: MenuSize; label: string; areas: MenuArea[] }[] = [
  { key: 'l6', size: 'large', label: '6 格', areas: [0, 1, 2, 3, 4, 5].map((i) => ({ x: Math.round((i % 3) * W / 3), y: i < 3 ? 0 : h, width: Math.round(W / 3), height: h })) },
  { key: 'l4', size: 'large', label: '4 格', areas: [0, 1, 2, 3].map((i) => ({ x: (i % 2) * 1250, y: i < 2 ? 0 : h, width: 1250, height: h })) },
  { key: 'l3', size: 'large', label: '上 1 下 2', areas: [{ x: 0, y: 0, width: W, height: h }, { x: 0, y: h, width: 1250, height: h }, { x: 1250, y: h, width: 1250, height: h }] },
  { key: 'l3c', size: 'large', label: '左 1 右 2', areas: [{ x: 0, y: 0, width: 1250, height: H }, { x: 1250, y: 0, width: 1250, height: h }, { x: 1250, y: h, width: 1250, height: h }] },
  { key: 'l2', size: 'large', label: '左右 2 格', areas: [{ x: 0, y: 0, width: 1250, height: H }, { x: 1250, y: 0, width: 1250, height: H }] },
  { key: 'l1', size: 'large', label: '1 格', areas: [{ x: 0, y: 0, width: W, height: H }] },
  { key: 'c3', size: 'compact', label: '3 格', areas: [0, 1, 2].map((i) => ({ x: Math.round(i * W / 3), y: 0, width: Math.round(W / 3), height: h })) },
  { key: 'c2', size: 'compact', label: '2 格', areas: [0, 1].map((i) => ({ x: i * 1250, y: 0, width: 1250, height: h })) },
  { key: 'c1', size: 'compact', label: '1 格', areas: [{ x: 0, y: 0, width: W, height: h }] },
];

export const DEFAULT_MENU_DESIGN: MenuDesign = { mode: 'template', bg: '#f6f2ec', fg: '#1f1b19', line: '#ddd3c6' };

export function defaultCells(count: number, audience: 'guest' | 'member'): MenuCell[] {
  const guest: MenuCell[] = [
    { label: '加入會員', icon: 'user', action: { type: 'keyword', value: '綁定' } },
    { label: '逛官網', icon: 'shopping-bag', action: { type: 'page', value: 'home' } },
    { label: '最新優惠', icon: 'ticket', action: { type: 'page', value: 'coupons' } },
    { label: '聯絡客服', icon: 'message', action: { type: 'keyword', value: '客服' } },
    { label: '尺寸指南', icon: 'ruler', action: { type: 'page', value: 'home' } },
    { label: 'Instagram', icon: 'instagram', action: { type: 'url', value: 'https://www.instagram.com/' } },
  ];
  const member: MenuCell[] = [
    { label: '我的訂單', icon: 'package', action: { type: 'keyword', value: '訂單查詢' } },
    { label: '我的優惠券', icon: 'ticket', action: { type: 'keyword', value: '優惠券' } },
    { label: '購物金', icon: 'wallet', action: { type: 'keyword', value: '購物金' } },
    { label: '逛官網', icon: 'shopping-bag', action: { type: 'page', value: 'home' } },
    { label: '會員中心', icon: 'user', action: { type: 'page', value: 'account' } },
    { label: '聯絡客服', icon: 'message', action: { type: 'keyword', value: '客服' } },
  ];
  return (audience === 'member' ? member : guest).slice(0, count);
}

// ---------- 推播 ----------
export type BroadcastAudience = 'all' | 'members' | 'buyers' | 'non_buyers' | 'recent_buyers' | 'inactive' | 'birthday';
export const AUDIENCE_OPTIONS: { key: BroadcastAudience; label: string; hint: string }[] = [
  { key: 'all', label: '所有好友', hint: '加入官方 LINE 的所有人' },
  { key: 'members', label: '已綁定會員', hint: '綁定官網會員的好友' },
  { key: 'buyers', label: '買過的會員', hint: '至少下過一筆訂單' },
  { key: 'non_buyers', label: '還沒買過的會員', hint: '綁定了但還沒下單' },
  { key: 'recent_buyers', label: '近 30 天有下單', hint: '最近 30 天內下過單' },
  { key: 'inactive', label: '超過 90 天沒下單', hint: '曾經買過,但 90 天內沒有訂單' },
  { key: 'birthday', label: '本月壽星', hint: '生日在這個月的會員' },
];

export type Broadcast = {
  id: string;
  title: string;
  content: MessageSet;
  audience: BroadcastAudience;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduled_at: string | null;
  sent_at: string | null;
  recipients: number;
  error: string;
  created_at: string;
};
