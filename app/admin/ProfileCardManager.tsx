'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import ProfileCardView, { type CardProduct } from '@/app/components/ProfileCardView';
import { LayoutThumb } from '@/app/components/ProfileImageBlock';
import LinkIcon, { ICON_PREFIX, isIconImage, LINK_ICONS } from '@/app/components/LinkIcon';
import SocialIcon from '@/app/components/SocialIcon';
import {
  BIO_LIMIT,
  BLOCK_TYPES,
  blockItems,
  blockOptions,
  HOTSPOT_LIMIT,
  type HotSpot,
  normalizeUrl,
  FOLLOW_PLATFORMS,
  followPlatform,
  IMAGE_LAYOUTS,
  IMAGE_LIMIT,
  LINK_STYLES,
  LINK_TITLE_LIMIT,
  PROFILE_LAYOUTS,
  CARD_TEMPLATES,
  cardPath,
  coverSpec,
  FONT_OPTIONS,
  isBlockComplete,
  isBlockInWindow,
  MAX_TAGS,
  resolveTheme,
  SLUG_PATTERN,
  SOCIAL_PLATFORMS,
  SOURCE_LABELS,
  TAG_SUGGESTIONS,
  videoEmbedUrl,
  type BlockItem,
  type BlockOptions,
  type BlockType,
  type CardTheme,
  type ProfileCard,
  type ProfileCardBlock,
} from '@/lib/profile-card';
import type { Product } from '@/lib/types';
import { FREE_TEMPLATE_KEYS, PRO_LIMITS, type CardPlanInfo } from '@/lib/card-plan';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { detectPlatform } from '@/lib/social-fetch';

const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });

// 上傳前縮圖:頭像裁成正方形,其他圖片限制最長邊;PNG 保留透明
function resizeImage(file: File, max: number, square: boolean, jpeg = false): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      const side = Math.min(sw, sh);
      const scale = Math.min(1, max / (square ? side : Math.max(sw, sh)));
      const w = Math.round((square ? side : sw) * scale);
      const h = Math.round((square ? side : sh) * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('無法處理圖片'));
      ctx.imageSmoothingQuality = 'high';
      if (square) ctx.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, w, h);
      else ctx.drawImage(img, 0, 0, w, h);
      const png = file.type === 'image/png' && !jpeg;
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('圖片處理失敗'))), png ? 'image/png' : 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片讀取失敗')); };
    img.src = url;
  });
}

async function uploadImage(file: File, square = false, max = 1600, jpeg = false) {
  const blob = await resizeImage(file, square ? 600 : max, square, jpeg);
  const form = new FormData();
  form.append('file', new File([blob], blob.type === 'image/png' ? 'image.png' : 'image.jpg', { type: blob.type }));
  form.append('productId', 'card');
  form.append('folder', 'profile-card');
  const res = await fetch('/api/profile-card/upload', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? '上傳失敗');
  return String(data.image_url);
}

const BLOCK_ICON: Record<BlockType, ReactNode> = {
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  text: <path d="M5 6V5h14v1M12 5v14M9 19h6" />,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20.5 16l-5-5-8 8" /></>,
  product: <><path d="M6 8h12l-1 12H7z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  video: <><rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="M10.5 9.5v5l4-2.5z" /></>,
  line: <path d="M12 4C7 4 3 7.2 3 11.2c0 3.6 3.2 6.6 7.6 7.1.4.1.8.3.8.8l-.1 1.4c0 .3.3.6.7.4 1.3-.8 5.6-3.4 7.4-5.6 1.1-1.3 1.6-2.6 1.6-4.1C21 7.2 17 4 12 4z" />,
  divider: <path d="M4 12h16" />,
  hotspot: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><rect x="7" y="12" width="10" height="4" rx="1" strokeDasharray="2 1.6" /><path d="M7 7.5h6" /></>,
  social: <><circle cx="12" cy="9" r="3.2" /><path d="M6 19c.8-3 3.2-4.6 6-4.6s5.2 1.6 6 4.6" /><path d="M17.5 4.5l1 1 2-2" /></>,
};

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-[#8cc97c]' : 'bg-[#ddd6cc]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Pills<T extends string>({ value, options, onChange, plus = [] }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; plus?: T[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`relative rounded-full px-4 py-2 text-sm transition ${value === o.key ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] bg-white text-[#5f5852] hover:border-[#1f1b19]/30'}`}
        >
          {o.label}
          {plus.includes(o.key) ? <PlusCorner /> : null}
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-[#efe8dd] px-3 py-2">
      <span className="text-sm text-[#5f5852]">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-xs uppercase text-[#a99e8f]">{value}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 cursor-pointer rounded-lg border border-[#e5ded4] bg-white p-0.5" />
      </span>
    </label>
  );
}

const inputClass = 'w-full rounded-xl border border-[#e5ded4] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#1f1b19]/40';

// datetime-local 與 ISO 互轉(以裝置時區顯示)
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

type MainTab = 'content' | 'style' | 'stats' | 'settings';
const MAIN_TABS: { key: MainTab; label: string; icon: ReactNode }[] = [
  { key: 'content', label: '我的名片', icon: <><rect x="4" y="4" width="16" height="6" rx="2" /><rect x="4" y="14" width="16" height="6" rx="2" /></> },
  { key: 'style', label: '版面編輯', icon: <><path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="8" r="1" /></> },
  { key: 'stats', label: '數據分析', icon: <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" /> },
  { key: 'settings', label: '名片設定', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></> },
];

// ---------- 方案(免費 / Pro) ----------
const ADMIN_PLAN: CardPlanInfo = { tier: 'max', pro: true, isAdmin: true, expiresAt: null, limits: PRO_LIMITS };
const PlanCtx = createContext<{ plan: CardPlanInfo; upgradeHref: string }>({ plan: ADMIN_PLAN, upgradeHref: '/mycard/upgrade' });
const usePlan = () => useContext(PlanCtx);

// 樣板分類:全部 / 免費 / U Plus / 其他(之後的專屬樣板)
type TemplateFilter = 'all' | 'free' | 'plus' | 'other';
const TEMPLATE_FILTERS: { key: TemplateFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'free', label: '免費' },
  { key: 'plus', label: 'U Plus' },
  { key: 'other', label: '其他' },
];
function templateIn(filter: TemplateFilter, key: string) {
  if (filter === 'all') return true;
  if (filter === 'free') return FREE_TEMPLATE_KEYS.includes(key);
  if (filter === 'plus') return !FREE_TEMPLATE_KEYS.includes(key);
  return false;
}

// 社群追蹤卡片:平台、網址、頭像、名稱、兩個數字、按鈕文字
function SocialFollowEditor({
  block,
  uploading,
  onUpload,
  onLocalChange,
  onPatch,
  field,
}: {
  block: ProfileCardBlock;
  uploading: boolean;
  onUpload: (file: File | undefined) => void;
  onLocalChange: (patch: Partial<ProfileCardBlock>) => void;
  onPatch: (patch: Partial<ProfileCardBlock>) => void;
  field: (key: 'title' | 'url', label: string, placeholder: string) => ReactNode;
}) {
  const options = blockOptions(block);
  const platform = followPlatform(options.platform);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const latest = useRef({ block, options });
  useEffect(() => {
    latest.current = { block, options };
  });
  const setOption = (patch: Partial<BlockOptions>, save: boolean) => {
    const next = { ...options, ...patch };
    if (save) onPatch({ options: next });
    else onLocalChange({ options: next });
  };

  // 貼上 / 修改網址後自動抓取(抓不到的欄位保留原本內容)
  const url = block.url.trim();
  const target = normalizeUrl(url);
  const shouldFetch = Boolean(url && detectPlatform(target) && target !== options.fetchedUrl);
  useEffect(() => {
    if (!shouldFetch) return;
    const timer = setTimeout(async () => {
      setFetching(true);
      setFetchError('');
      try {
        const res = await fetch('/api/profile-card/social-fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: target }) });
        const data = await res.json();
        const { block: b, options: o } = latest.current;
        if (!res.ok) {
          setFetchError(data.error ?? '抓不到資料');
          onPatch({ url: b.url, options: { ...o, fetchedUrl: target } });
          return;
        }
        onPatch({
          url: b.url,
          title: data.name || b.title,
          image: data.avatar || b.image,
          options: {
            ...o,
            platform: FOLLOW_PLATFORMS.some((p) => p.key === data.platform) ? data.platform : o.platform,
            statA: data.statA,
            statB: data.statB,
            bio: o.bio || data.bio,
            fetchedAt: data.fetchedAt,
            fetchedUrl: target,
          },
        });
      } catch {
        setFetchError('網路不穩,稍後再試');
      } finally {
        setFetching(false);
      }
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, shouldFetch]);

  const stats = [options.statA, options.statB].filter(Boolean).join(' · ');
  const updated = options.fetchedAt ? new Date(options.fetchedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <>
      {field('url', '社群個人頁網址', 'https://www.youtube.com/@… 或 instagram.com/…')}
      <div className="rounded-xl bg-[#faf7f2] px-3 py-2.5 text-xs leading-5">
        {fetching ? (
          <p className="text-[#6b6156]">正在讀取頭像、名稱與追蹤數…</p>
        ) : fetchError ? (
          <p className="text-[#c0392b]">{fetchError}</p>
        ) : options.fetchedAt ? (
          <>
            <p className="text-[#1f1b19]">
              <span className="text-[#8a7f72]">追蹤數:</span>
              {stats || '這個平台沒有公開追蹤數'}
            </p>
            <p className="mt-0.5 text-[11px] text-[#a99e8f]">每天自動更新・上次 {updated}</p>
          </>
        ) : (
          <p className="text-[#a99e8f]">貼上網址就會自動抓取頭像、名稱與追蹤數。支援 YouTube、Instagram、TikTok、Threads、Facebook、X,需為公開帳號。</p>
        )}
      </div>
      <div>
        <span className="mb-1.5 block text-xs text-[#8a7f72]">平台</span>
        <div className="flex flex-wrap gap-1.5">
          {FOLLOW_PLATFORMS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setOption({ platform: p.key }, true)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${options.platform === p.key ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] text-[#5f5852]'}`}
            >
              <SocialIcon type={p.key} size={14} />
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[#f6f2ec]">
          {block.image ? <img src={block.image} alt="" className="h-full w-full object-cover" /> : null}
        </span>
        <label className="cursor-pointer rounded-full border border-[#d7c9bd] px-4 py-1.5 text-xs font-medium hover:bg-[#f6f2ec]">
          {uploading ? '上傳中…' : block.image ? '更換頭像' : '上傳頭像'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {block.image ? <button type="button" onClick={() => onPatch({ image: '' })} className="text-xs text-[#8a7f72]">移除</button> : null}
      </div>
      {field('title', '名稱', '自動帶入,可修改')}
      <label className="block">
        <span className="mb-1 block text-xs text-[#8a7f72]">簡介(選填)</span>
        <textarea value={options.bio} rows={2} maxLength={120} onChange={(e) => setOption({ bio: e.target.value }, false)} onBlur={(e) => setOption({ bio: e.target.value }, true)} placeholder="一句話介紹這個帳號" className={`${inputClass} resize-none`} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-[#8a7f72]">按鈕文字(選填)</span>
        <input value={options.button} onChange={(e) => setOption({ button: e.target.value }, false)} onBlur={(e) => setOption({ button: e.target.value }, true)} placeholder={platform.action} className={inputClass} />
      </label>
    </>
  );
}

// U Plus 膠囊(行內文字標示)
function ProBadge() {
  return <span className="inline-flex shrink-0 rounded-full bg-[#1f1b19] px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-white">U PLUS</span>;
}

// U Plus 圓形徽章:壓在邊框右上角(父層需 relative,且不能 overflow-hidden)
function PlusCorner({ size = 18 }: { size?: number }) {
  const offset = -Math.round(size * 0.38);
  return (
    <img
      src="/brand/uplus-badge.png"
      alt="U Plus"
      title="U Plus 功能"
      className="pointer-events-none absolute z-10 rounded-full shadow-[0_2px_6px_rgba(18,27,51,0.35)]"
      style={{ width: size, height: size, right: offset, top: offset }}
    />
  );
}

function ProLock({ title, desc, image }: { title: string; desc: string; image?: string }) {
  const { upgradeHref } = usePlan();
  return (
    <div className="relative rounded-2xl border border-[#e5ded4] bg-white px-5 py-6 text-center">
      <PlusCorner size={30} />
      {/* 有示意圖:圖在上、說明在下;沒有圖:膠囊+說明 */}
      {image ? <img src={image} alt="" loading="lazy" className="mx-auto w-full max-w-md rounded-xl border border-[#efe8dd]" /> : <ProBadge />}
      <p className={`${image ? 'mt-4' : 'mt-2'} text-sm font-semibold text-[#1f1b19]`}>{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#8a7f72]">{desc}</p>
      <a href={upgradeHref} className="mt-4 inline-block rounded-full bg-[#1f1b19] px-5 py-2 text-xs font-semibold text-white">升級 U Plus</a>
    </div>
  );
}

async function askUpgrade(message: string, href: string) {
  if (await uiConfirm(`${message}\n\n要現在升級 U Plus 嗎?`)) window.location.href = href;
}

// 「個人名片」編輯器:後台(店家)與會員「我的名片」共用;最上方網址+複製;我的內容 / 外觀風格 / 數據分析 / 設定;即時預覽
export default function ProfileCardManager({ products, lineUrl = '', upgradeHref = '/mycard/upgrade' }: { products: Product[]; lineUrl?: string; upgradeHref?: string }) {
  const [plan, setPlan] = useState<CardPlanInfo>(ADMIN_PLAN);
  const [card, setCard] = useState<ProfileCard | null>(null);
  const [draft, setDraft] = useState<ProfileCard | null>(null);
  const [blocks, setBlocks] = useState<ProfileCardBlock[]>([]);
  const [loadError, setLoadError] = useState('');
  const [mainTab, setMainTab] = useState<MainTab>('content');
  const [contentTab, setContentTab] = useState<'links' | 'profile'>('links');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState('');
  const [picker, setPicker] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  function reloadCard() {
    return fetch('/api/profile-card', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!data.card) return;
        setCard(data.card);
        setDraft(data.card);
        setBlocks(data.blocks);
      });
  }

  useEffect(() => {
    Promise.resolve().then(() => setOrigin(window.location.origin));
    fetch('/api/profile-card', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '讀取失敗');
        setCard(data.card);
        setDraft(data.card);
        setBlocks(data.blocks);
        if (data.plan) setPlan(data.plan);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : '讀取失敗'));
  }, []);

  const productMap = useMemo(() => {
    const map: Record<string, CardProduct> = {};
    for (const p of products) {
      if (p.status === '已下架') continue;
      map[p.id] = { id: p.id, name: p.name, price: p.price, original_price: p.original_price, image: p.image || p.images?.[0] || '' };
    }
    return map;
  }, [products]);

  if (loadError) {
    return <p className="rounded-2xl border border-[#e0b4b4] bg-[#fbf3f0] p-5 text-sm text-[#c0392b]">{loadError}</p>;
  }
  if (!card || !draft) return <p className="py-16 text-center text-sm text-[#a99e8f]">載入中…</p>;

  const url = `${origin}${cardPath(card.slug)}`;
  const dirty = JSON.stringify(card) !== JSON.stringify(draft);
  const needsSave = mainTab === 'style' || mainTab === 'settings' || (mainTab === 'content' && contentTab === 'profile');

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      void uiAlert('無法複製,請長按網址手動複製');
    }
  }

  async function openQr() {
    setQr(await QRCode.toDataURL(url, { width: 560, margin: 2, color: { dark: '#1f1b19', light: '#ffffff' } }));
  }

  // ---------- 區塊 ----------
  async function addBlock(type: BlockType) {
    setPicker(false);
    const res = await fetch('/api/profile-card/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: card!.id, type }),
    });
    const data = await res.json();
    if (!res.ok) return void (data.upgrade ? askUpgrade(data.error, upgradeHref) : uiAlert(data.error ?? '新增失敗'));
    setBlocks((list) => [data as ProfileCardBlock, ...list]);
    setOpenId(data.id);
  }

  async function patchBlock(id: string, patch: Partial<ProfileCardBlock>) {
    setBlocks((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    const res = await fetch(`/api/profile-card/blocks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) return void uiAlert(data.error ?? '儲存失敗');
    setBlocks((list) => list.map((b) => (b.id === id ? (data as ProfileCardBlock) : b)));
  }

  async function deleteBlock(id: string) {
    if (!(await uiConfirm('確定刪除這個區塊?', { danger: true }))) return;
    const res = await fetch(`/api/profile-card/blocks/${id}`, { method: 'DELETE' });
    if (!res.ok) return void uiAlert('刪除失敗');
    setBlocks((list) => list.filter((b) => b.id !== id));
  }

  async function saveOrder(list: ProfileCardBlock[]) {
    await fetch('/api/profile-card/blocks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: list.map((b) => b.id) }),
    });
  }

  // ---------- 名片資料(簡介 / 外觀 / 設定) ----------
  async function saveCard() {
    if (!draft) return;
    if (!SLUG_PATTERN.test(draft.slug)) return void uiAlert('網址代稱只能用小寫英文、數字、點、底線、連字號(2–30 字)');
    setSaving(true);
    try {
      const res = await fetch('/api/profile-card', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '儲存失敗');
      setCard(data);
      setDraft(data);
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  const preview = <ProfileCardView card={draft} blocks={blocks} products={productMap} lineUrl={lineUrl} preview />;

  return (
    <PlanCtx.Provider value={{ plan, upgradeHref }}>
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
      <div className="space-y-4 pb-20">
        {/* 網址 */}
        <div className="flex items-center gap-3 rounded-2xl border border-[#e5ded4] bg-white px-4 py-3">
          <span className="text-[#8a7f72]"><Icon>{BLOCK_ICON.link}</Icon></span>
          <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
            <span className="block text-[11px] text-[#a99e8f]">我的名片網址</span>
            <span className="block truncate text-sm font-medium text-[#1f1b19]">{url.replace(/^https?:\/\//, '')}</span>
          </a>
          <button type="button" onClick={copyUrl} className="shrink-0 rounded-full border border-[#d7c9bd] px-3.5 py-1.5 text-xs font-semibold text-[#1f1b19] transition hover:bg-[#f6f2ec]">
            {copied ? '已複製' : '複製'}
          </button>
          <button type="button" onClick={openQr} aria-label="QR Code" className="shrink-0 rounded-full border border-[#d7c9bd] p-1.5 text-[#1f1b19] transition hover:bg-[#f6f2ec]">
            <Icon size={16}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2" /></Icon>
          </button>
        </div>

        {/* 主分頁 */}
        <div className="grid grid-cols-4 gap-1 rounded-2xl border border-[#e5ded4] bg-white p-1">
          {MAIN_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMainTab(t.key)}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] transition sm:flex-row sm:justify-center sm:gap-1.5 sm:text-sm ${mainTab === t.key ? 'bg-[#1f1b19] text-white' : 'text-[#6b6156] hover:bg-[#f6f2ec]'}`}
            >
              <Icon size={16}>{t.icon}</Icon>
              {t.label}
            </button>
          ))}
        </div>

        {mainTab === 'content' ? (
          <>
            <div className="flex items-center gap-2">
              {([['links', '連結'], ['profile', '個人簡介']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setContentTab(key)}
                  className={`rounded-full px-4 py-2 text-sm transition ${contentTab === key ? 'bg-[#efe8dd] font-medium text-[#1f1b19]' : 'text-[#8a7f72] hover:bg-[#f6f2ec]'}`}
                >
                  {label}
                </button>
              ))}
              <button type="button" onClick={() => setPreviewOpen(true)} className="ml-auto rounded-full border border-[#d7c9bd] bg-white px-4 py-2 text-sm text-[#6b6156] lg:hidden">預覽</button>
            </div>
            {contentTab === 'links' ? (
              <div className="space-y-3">
                {picker ? (
                  <div className="rounded-2xl border border-[#e5ded4] bg-white p-3">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-sm font-medium">選擇區塊類型</span>
                      <button type="button" onClick={() => setPicker(false)} className="text-xs text-[#8a7f72]">取消</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {BLOCK_TYPES.filter((t) => plan.isAdmin || t.type !== 'product').map((t) => (
                        <button key={t.type} type="button" onClick={() => addBlock(t.type)} className="relative flex items-start gap-2.5 rounded-xl border border-[#efe8dd] p-3 text-left transition hover:border-[#1f1b19]/30 hover:bg-[#faf7f2]">
                          {t.type === 'hotspot' && !plan.limits.customStyle ? <PlusCorner size={22} /> : null}
                          <span className="mt-0.5 text-[#6b6156]"><Icon>{BLOCK_ICON[t.type]}</Icon></span>
                          <span>
                            <span className="block text-sm font-medium">{t.label}</span>
                            <span className="block text-[11px] leading-4 text-[#a99e8f]">{t.hint}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setPicker(true)} className="w-full rounded-2xl border border-dashed border-[#c9bcad] bg-white/60 py-3 text-sm font-medium text-[#1f1b19] transition hover:bg-white">
                    ＋ 新增區塊{plan.pro ? '' : `(${blocks.length}/${plan.limits.maxBlocks})`}
                  </button>
                )}
                {importOpen ? (
                  <ImportPanel onClose={() => setImportOpen(false)} onDone={() => void reloadCard()} />
                ) : (
                  <button type="button" onClick={() => setImportOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/60 py-2.5 text-xs text-[#6b6156] transition hover:bg-white">
                    <Icon size={15}><path d="M4 12h12M12 6l6 6-6 6" /><path d="M20 5v14" /></Icon>
                    一鍵搬家:從 Linktree、Portaly 等其他名片匯入
                  </button>
                )}
                {blocks.length === 0 ? (
                  <p className="py-10 text-center text-sm text-[#a99e8f]">還沒有區塊,先新增一個連結按鈕吧。</p>
                ) : (
                  <BlockList
                    blocks={blocks}
                    onReorder={(list) => { setBlocks(list); void saveOrder(list); }}
                    render={(b, handle) => (
                      <BlockRow
                        block={b}
                        handle={handle}
                        open={openId === b.id}
                        products={products}
                        productMap={productMap}
                        lineUrl={lineUrl}
                        onToggleOpen={() => setOpenId(openId === b.id ? null : b.id)}
                        onPatch={(patch) => patchBlock(b.id, patch)}
                        onLocalChange={(patch) => setBlocks((list) => list.map((x) => (x.id === b.id ? { ...x, ...patch } : x)))}
                        onDelete={() => deleteBlock(b.id)}
                      />
                    )}
                  />
                )}
              </div>
            ) : (
              <ProfileEditor draft={draft} setDraft={setDraft} />
            )}
          </>
        ) : null}

        {mainTab === 'style' ? <StyleEditor draft={draft} setDraft={setDraft} onPreview={() => setPreviewOpen(true)} blocks={blocks} productMap={productMap} lineUrl={lineUrl} /> : null}
        {mainTab === 'stats' ? <StatsPanel cardId={card.id} url={url} blocks={blocks} productMap={productMap} /> : null}
        {mainTab === 'settings' ? <SettingsEditor draft={draft} setDraft={setDraft} /> : null}

        {needsSave ? (
          <div className="sticky bottom-3 z-10 flex justify-center pt-2">
            <button
              type="button"
              onClick={saveCard}
              disabled={saving || !dirty}
              className="w-full max-w-xs rounded-full bg-[#1f1b19] py-3 text-sm font-semibold text-white shadow-lg transition disabled:opacity-40"
            >
              {saving ? '儲存中…' : dirty ? '儲存' : '已儲存'}
            </button>
          </div>
        ) : null}
      </div>

      {/* 桌機即時預覽 */}
      <aside className="sticky top-24 hidden lg:block">
        <p className="mb-2 text-center text-xs text-[#a99e8f]">即時預覽</p>
        <div className="mx-auto h-[680px] w-[340px] overflow-y-auto rounded-[36px] border-[10px] border-[#1f1b19] bg-white">{preview}</div>
      </aside>

      {/* 手機預覽 */}
      {previewOpen ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-[#e5ded4] bg-white px-4 py-3">
            <span className="text-sm font-medium">預覽</span>
            <button type="button" onClick={() => setPreviewOpen(false)} className="rounded-full border border-[#d7c9bd] px-3 py-1 text-xs">關閉</button>
          </div>
          <div className="flex-1 overflow-y-auto">{preview}</div>
        </div>
      ) : null}

      {/* QR Code */}
      {qr ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setQr('')}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <img src={qr} alt="名片 QR Code" className="mx-auto w-56" />
            <p className="mt-2 truncate text-xs text-[#8a7f72]">{url.replace(/^https?:\/\//, '')}</p>
            <div className="mt-4 flex justify-center gap-2">
              <a href={qr} download={`${card.slug}-qrcode.png`} className="rounded-full bg-[#1f1b19] px-4 py-2 text-xs font-semibold text-white">下載圖片</a>
              <button type="button" onClick={() => setQr('')} className="rounded-full border border-[#d7c9bd] px-4 py-2 text-xs">關閉</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </PlanCtx.Provider>
  );
}

// 可拖曳排序的清單(按住左側把手拖曳;手機與滑鼠皆可)
function BlockList({
  blocks,
  onReorder,
  render,
}: {
  blocks: ProfileCardBlock[];
  onReorder: (list: ProfileCardBlock[]) => void;
  render: (block: ProfileCardBlock, handle: ReactNode) => ReactNode;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<ProfileCardBlock[] | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const order = dragOrder ?? blocks;

  function onMove(clientY: number) {
    if (!dragId || !dragOrder) return;
    const from = dragOrder.findIndex((b) => b.id === dragId);
    let to = from;
    dragOrder.forEach((b, i) => {
      const el = rowRefs.current.get(b.id);
      if (!el || b.id === dragId) return;
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (i < from && clientY < mid) to = Math.min(to, i);
      if (i > from && clientY > mid) to = Math.max(to, i);
    });
    if (to !== from) {
      const next = [...dragOrder];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setDragOrder(next);
    }
  }

  function end() {
    if (!dragId || !dragOrder) return;
    const changed = dragOrder.some((b, i) => b.id !== blocks[i]?.id);
    if (changed) onReorder(dragOrder);
    setDragId(null);
    setDragOrder(null);
  }

  return (
    <div className="space-y-2.5" onPointerMove={(e) => onMove(e.clientY)} onPointerUp={end} onPointerCancel={end}>
      {order.map((b) => {
        const handle = (
          <span
            role="button"
            aria-label="拖曳排序"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDragId(b.id); setDragOrder(blocks); }}
            className="flex h-full cursor-grab touch-none select-none items-center px-1 text-[#c4b8aa] active:cursor-grabbing"
          >
            <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
              {[3, 9, 15].map((y) => [4, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />))}
            </svg>
          </span>
        );
        return (
          <div
            key={b.id}
            ref={(el) => { if (el) rowRefs.current.set(b.id, el); else rowRefs.current.delete(b.id); }}
            className={`transition-shadow ${dragId === b.id ? 'relative z-10 rounded-2xl shadow-lg' : ''}`}
          >
            {render(b, handle)}
          </div>
        );
      })}
    </div>
  );
}

// 區塊列表左側縮圖:有設定圖片/圖示就顯示,否則顯示區塊類型圖示
function BlockThumb({ block, productImage }: { block: ProfileCardBlock; productImage?: string }) {
  const img = (src: string, contain = false) => <img src={src} alt="" className={`h-full w-full ${contain ? 'object-contain p-1' : 'object-cover'}`} />;
  if (block.type === 'link' && block.image) {
    if (isIconImage(block.image)) return <span className="text-[#1f1b19]"><LinkIcon value={block.image} size={18} /></span>;
    return img(block.image, /\.png(\?|$)/i.test(block.image));
  }
  if (block.type === 'image' && blockItems(block)[0]) return img(blockItems(block)[0].image);
  if (block.type === 'hotspot' && block.image) return img(block.image);
  if (block.type === 'product' && productImage) return img(productImage);
  if (block.type === 'social') {
    if (block.image) return img(block.image);
    const p = followPlatform(blockOptions(block).platform);
    return <span className="flex h-full w-full items-center justify-center text-white" style={{ background: p.color }}><SocialIcon type={p.key} size={17} /></span>;
  }
  if (block.type === 'video') {
    const id = videoEmbedUrl(block.url).match(/embed\/([\w-]{11})/)?.[1];
    if (id) return img(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`);
  }
  if (block.type === 'line') return <span className="flex h-full w-full items-center justify-center bg-[#06C755] text-white"><SocialIcon type="line" size={18} /></span>;
  return <Icon size={17}>{BLOCK_ICON[block.type]}</Icon>;
}

function BlockRow({
  block,
  handle,
  open,
  products,
  productMap,
  lineUrl,
  onToggleOpen,
  onPatch,
  onLocalChange,
  onDelete,
}: {
  block: ProfileCardBlock;
  handle: ReactNode;
  open: boolean;
  products: Product[];
  productMap: Record<string, CardProduct>;
  lineUrl: string;
  onToggleOpen: () => void;
  onPatch: (patch: Partial<ProfileCardBlock>) => void;
  onLocalChange: (patch: Partial<ProfileCardBlock>) => void;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [timed, setTimed] = useState(Boolean(block.start_at || block.end_at));
  const [dirty, setDirty] = useState(false); // 圖文連結:按「完成」才儲存
  const complete = isBlockComplete(block);
  const inWindow = isBlockInWindow(block);
  const typeLabel = BLOCK_TYPES.find((t) => t.type === block.type)?.label ?? '';
  const product = block.product_id ? productMap[block.product_id] : undefined;
  const title =
    block.type === 'product' ? block.title || product?.name || ''
    : block.type === 'line' ? block.title || '加入官方 LINE'
    : block.type === 'divider' ? '分隔線'
    : block.type === 'social' ? block.title || followPlatform(blockOptions(block).platform).label
    : block.type === 'hotspot' ? block.title || `熱區圖片(${blockOptions(block).spots.length} 個連結)`
    : block.title;

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      onPatch({ image: await uploadImage(file) });
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  const field = (key: 'title' | 'url', label: string, placeholder: string) => (
    <label className="block">
      <span className="mb-1 block text-xs text-[#8a7f72]">{label}</span>
      <input
        value={block[key]}
        onChange={(e) => onLocalChange({ [key]: e.target.value })}
        onBlur={(e) => onPatch({ [key]: e.target.value })}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );

  const matches = search.trim()
    ? products.filter((p) => p.status !== '已下架' && `${p.name} ${p.id}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : [];

  let status: ReactNode;
  if (dirty) status = <span className="shrink-0 text-xs text-[#b07a2a]">未儲存</span>;
  else if (!complete) status = <span className="shrink-0 text-xs text-[#c84767]">草稿</span>;
  else status = <Toggle on={block.enabled} onChange={(v) => onPatch({ enabled: v })} label="顯示" />;

  const { plan, upgradeHref } = usePlan();
  const timedPanelPro = (
    <>
            {/* 限時顯示 */}
            <div className="rounded-xl bg-[#faf7f2] p-3">
              <div className="flex items-center gap-3">
                <span className="text-sm">限時顯示</span>
                <Toggle
                  on={timed}
                  label="限時顯示"
                  onChange={(v) => {
                    setTimed(v);
                    if (!v && (block.start_at || block.end_at)) onPatch({ start_at: null, end_at: null });
                  }}
                />
                <span className="ml-auto text-[11px] text-[#a99e8f]">時間外自動隱藏</span>
              </div>
              {timed ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-[#8a7f72]">開始</span>
                    <input type="datetime-local" value={toLocalInput(block.start_at)} onChange={(e) => onPatch({ start_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-[#8a7f72]">結束</span>
                    <input type="datetime-local" value={toLocalInput(block.end_at)} onChange={(e) => onPatch({ end_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inputClass} />
                  </label>
                </div>
              ) : null}
            </div>
    </>
  );

  const timedPanel = plan.limits.timed ? (
    timedPanelPro
  ) : (
    <div className="relative flex items-center gap-2 rounded-xl border border-[#efe8dd] bg-[#faf7f2] p-3 text-sm">
      <PlusCorner size={22} />
      <span>限時顯示</span>
      <ProBadge />
      <a href={upgradeHref} className="ml-auto text-xs text-[#6b6156] underline underline-offset-2">升級解鎖</a>
    </div>
  );

  return (
    <div className="flex overflow-hidden rounded-2xl border border-[#ebe4da] bg-white">
      <div className="flex items-stretch border-r border-[#f3eee7] bg-[#fcfaf7] px-1.5">{handle}</div>
      <div className="min-w-0 flex-1">
        <div className="flex cursor-pointer items-center gap-3 p-3.5" onClick={onToggleOpen}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f6f2ec] text-[#6b6156]">
            <BlockThumb block={block} productImage={product?.image} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm ${title ? 'text-[#1f1b19]' : 'text-[#b3a897]'}`}>{title || `未命名的${typeLabel}`}</p>
            <p className="text-[11px] text-[#a99e8f]">
              {typeLabel}
              {!['text', 'divider', 'video'].includes(block.type) && block.clicks > 0 ? ` · ${block.clicks} 次點擊` : ''}
              {block.start_at || block.end_at ? (inWindow ? ' · 限時顯示中' : ' · 限時(目前未顯示)') : ''}
            </p>
          </div>
          {status}
        </div>

        {open && block.type === 'image' ? (
          <ImageBlockEditor
            block={block}
            timed={timed}
            setTimed={setTimed}
            timedPanel={timedPanel}
            onEdit={(patch) => { onLocalChange(patch); setDirty(true); }}
            onDone={() => {
              onPatch({ title: block.title, url: block.url, items: blockItems(block), options: blockOptions(block) });
              setDirty(false);
              if (block.url.trim()) onToggleOpen(); // 網址未填:留在編輯畫面提示
            }}
            onCollapse={onToggleOpen}
            onDelete={onDelete}
          />
        ) : open ? (
          <div className="space-y-3 border-t border-[#f3eee7] px-3.5 pb-3.5 pt-3">
            {block.type === 'link' && (
              <>
                {field('title', '標題', '例如:官方網站|全館商品')}
                {field('url', '網址', 'urbanite.com.tw')}
              </>
            )}
            {block.type === 'text' && field('title', '文字', '例如:本週新品')}
            {block.type === 'video' && (
              <>
                {field('url', 'YouTube 影片網址', 'https://youtu.be/…')}
                {block.url && !videoEmbedUrl(block.url) ? <p className="text-xs text-[#c0392b]">目前支援 YouTube 與 Vimeo 影片網址</p> : null}
                {field('title', '影片標題(選填)', '例如:秋季新品開箱')}
              </>
            )}
            {block.type === 'line' && (
              <>
                {field('title', '按鈕文字(選填)', '加入官方 LINE')}
                {field('url', 'LINE 加好友網址(選填)', lineUrl || 'https://lin.ee/…')}
                <p className="text-[11px] leading-5 text-[#a99e8f]">
                  {!plan.isAdmin ? '填入你的 LINE 加好友網址(例如 https://lin.ee/…)或 https://line.me/ti/p/~你的ID' : lineUrl ? '留空會使用「系統設定 → 頁尾 → 結帳頁 LINE 設定」的連結。' : '尚未設定官方 LINE,請填網址,或到「系統設定 → 頁尾 → 結帳頁 LINE 設定」設定。'}
                </p>
              </>
            )}
            {block.type === 'divider' && <p className="text-xs text-[#a99e8f]">分隔線沒有內容,可拖曳調整位置。</p>}
            {block.type === 'hotspot' && <HotspotEditor block={block} onLocalChange={onLocalChange} onPatch={onPatch} field={field} />}
            {block.type === 'social' && (
              <SocialFollowEditor block={block} uploading={uploading} onUpload={(file) => void upload(file)} onLocalChange={onLocalChange} onPatch={onPatch} field={field} />
            )}
            {block.type === 'product' && (
              <div className="space-y-2">
                {product ? (
                  <div className="flex items-center gap-3 rounded-xl border border-[#efe8dd] p-2.5">
                    <span className="aspect-[4/5] w-11 shrink-0 overflow-hidden rounded-lg bg-[#f6f2ec]">
                      {product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{product.name}</span>
                      <span className="text-xs text-[#702838]">{formatter.format(product.price)}</span>
                    </span>
                    <button type="button" onClick={() => onPatch({ product_id: '' })} className="text-xs text-[#8a7f72]">更換</button>
                  </div>
                ) : (
                  <>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋商品名稱或代碼" className={inputClass} />
                    {matches.length > 0 && (
                      <div className="divide-y divide-[#f3eee7] overflow-hidden rounded-xl border border-[#efe8dd]">
                        {matches.map((p) => (
                          <button key={p.id} type="button" onClick={() => { onPatch({ product_id: p.id }); setSearch(''); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[#faf7f2]">
                            <span className="aspect-[4/5] w-8 shrink-0 overflow-hidden rounded bg-[#f6f2ec]">
                              {p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            <span className="text-xs text-[#8a7f72]">{formatter.format(p.price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {product ? field('title', '顯示名稱(選填,預設為商品名稱)', product.name) : null}
              </div>
            )}

            {block.type === 'link' && (
              <LinkThumbPicker value={block.image} uploading={uploading} onUpload={(file) => void upload(file)} onChange={(image) => onPatch({ image })} />
            )}

            {timedPanel}

            <div className="flex justify-end pt-1">
              <button type="button" onClick={onDelete} className="text-xs text-[#c0392b] hover:underline">刪除區塊</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// 圖文連結編輯器(LINKGOODS 風格):網址自動帶出標題圖片、多張圖片、圖文版型、自動輪播、版型選擇
function ImageBlockEditor({
  block,
  timed,
  setTimed,
  timedPanel,
  onEdit,
  onDone,
  onCollapse,
  onDelete,
}: {
  block: ProfileCardBlock;
  timed: boolean;
  setTimed: (v: boolean) => void;
  timedPanel: ReactNode;
  onEdit: (patch: Partial<ProfileCardBlock>) => void;
  onDone: () => void;
  onCollapse: () => void;
  onDelete: () => void;
}) {
  const items = blockItems(block);
  const options = blockOptions(block);
  const [uploading, setUploading] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [showRequired, setShowRequired] = useState(false);
  const lastFetched = useRef(block.url.trim());
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const layoutInfo = IMAGE_LAYOUTS.find((l) => l.key === options.layout);
  const canAutoplay = Boolean(layoutInfo?.single) && items.length > 1;

  const setItems = (next: BlockItem[]) => onEdit({ items: next, image: next[0]?.image ?? '' });
  const setOptions = (patch: BlockOptions) => onEdit({ options: { ...options, ...patch } });

  async function autoFill(raw: string) {
    const url = raw.trim();
    if (!url || url === lastFetched.current) return;
    lastFetched.current = url;
    setUrlError('');
    setFetching(true);
    try {
      const res = await fetch(`/api/profile-card/og?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '無法讀取這個網址');
      const patch: Partial<ProfileCardBlock> = {};
      if (data.title && !block.title.trim()) patch.title = String(data.title).slice(0, LINK_TITLE_LIMIT);
      if (data.image && itemsRef.current.length === 0) {
        patch.items = [{ image: String(data.image), title: '', url: '' }];
        patch.image = String(data.image);
      }
      if (Object.keys(patch).length) onEdit(patch);
    } catch (e) {
      setUrlError(e instanceof Error ? e.message : '無法讀取這個網址');
    } finally {
      setFetching(false);
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, IMAGE_LIMIT - items.length);
    if (list.some((file) => file.size > 10 * 1024 * 1024)) return void uiAlert('單張圖片請小於 10MB');
    setUploading(list.length);
    try {
      for (const file of list) {
        const image = await uploadImage(file);
        setItems([...itemsRef.current, { image, title: '', url: '' }]);
        itemsRef.current = [...itemsRef.current, { image, title: '', url: '' }];
        setUploading((n) => Math.max(n - 1, 0));
      }
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(0);
    }
  }

  function moveItem(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  }

  const label = (text: string, required = false, extra?: ReactNode) => (
    <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[#1f1b19]">
      {text}
      {required ? <span className="text-[#c84767]">*</span> : null}
      {extra ? <span className="ml-auto text-xs font-normal text-[#a99e8f]">{extra}</span> : null}
    </span>
  );

  return (
    <div className="space-y-5 border-t border-[#f3eee7] px-3.5 pb-3.5 pt-3">
      <div className="-mb-2 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setTimed(!timed)}
          aria-label="限時顯示"
          className={`rounded-full p-2 transition ${timed || block.start_at || block.end_at ? 'bg-[#f6f2ec] text-[#1f1b19]' : 'text-[#8a7f72] hover:bg-[#f6f2ec]'}`}
        >
          <Icon size={17}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>
        </button>
        <button type="button" onClick={onDelete} aria-label="刪除" className="rounded-full p-2 text-[#8a7f72] transition hover:bg-[#f6f2ec] hover:text-[#c0392b]">
          <Icon size={17}><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 12.2h9.4L17.5 7M10.3 10.5v5.5M13.7 10.5v5.5" /></Icon>
        </button>
      </div>
      {timed ? timedPanel : null}

      <label className="block">
        {label('圖文連結網址', true, fetching ? '讀取中…' : undefined)}
        <input
          value={block.url}
          onChange={(e) => onEdit({ url: e.target.value })}
          onBlur={(e) => void autoFill(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text) window.setTimeout(() => void autoFill(text), 0);
          }}
          placeholder="輸入或貼上網址,標題圖片等資訊將自動帶出"
          className={`${inputClass} ${showRequired && !block.url.trim() ? 'border-[#c84767]' : ''}`}
        />
        {urlError ? <span className="mt-1 block text-xs text-[#c0392b]">{urlError}</span> : null}
        {showRequired && !block.url.trim() ? <span className="mt-1 block text-xs text-[#c84767]">請填寫圖文連結網址,未填寫前會以草稿保存</span> : null}
      </label>

      <label className="block">
        {label('連結標題', false, `${block.title.length}/${LINK_TITLE_LIMIT}`)}
        <input value={block.title} maxLength={LINK_TITLE_LIMIT} onChange={(e) => onEdit({ title: e.target.value })} placeholder="輸入連結標題" className={inputClass} />
      </label>

      <div>
        {label('圖片素材', false, `建議 ${layoutInfo?.size ?? ''} · 單張上限 10MB · ${items.length}/${IMAGE_LIMIT}`)}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {items.map((item, i) => (
            <div key={`${item.image}-${i}`} className="relative aspect-square overflow-hidden rounded-xl border border-[#efe8dd] bg-[#f6f2ec]">
              <img src={item.image} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="移除圖片" className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
                <Icon size={12}><path d="M6 6l12 12M18 6L6 18" /></Icon>
              </button>
              {i > 0 ? (
                <button type="button" onClick={() => moveItem(i, -1)} aria-label="往前移" className="absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
                  <Icon size={12}><path d="M14.5 6l-6 6 6 6" /></Icon>
                </button>
              ) : items.length > 1 ? (
                <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] text-white">封面</span>
              ) : null}
            </div>
          ))}
          {items.length < IMAGE_LIMIT ? (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#c9bcad] text-[#8a7f72] transition hover:bg-[#faf7f2]">
              {uploading ? <span className="text-xs">上傳中…</span> : <Icon size={22}><path d="M12 5v14M5 12h14" /></Icon>}
              <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading > 0} onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
            </label>
          ) : null}
        </div>
      </div>

      <div>
        {label('圖文版型')}
        <div className="flex flex-wrap gap-5">
          {([['link', '連結標題'], ['custom', '圖片自訂標題']] as const).map(([key, text]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
              <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border ${options.captionMode === key ? 'border-[#1f1b19]' : 'border-[#c9bcad]'}`}>
                {options.captionMode === key ? <span className="h-2.5 w-2.5 rounded-full bg-[#1f1b19]" /> : null}
              </span>
              <input type="radio" className="sr-only" checked={options.captionMode === key} onChange={() => setOptions({ captionMode: key })} />
              {text}
            </label>
          ))}
        </div>
        {options.captionMode === 'custom' ? (
          items.length === 0 ? (
            <p className="mt-2 text-xs text-[#a99e8f]">上傳圖片後,可替每張圖片設定標題與連結。</p>
          ) : (
            <div className="mt-3 space-y-2">
              {items.map((item, i) => (
                <div key={`${item.image}-${i}`} className="flex gap-2.5 rounded-xl border border-[#efe8dd] p-2">
                  <img src={item.image} alt="" className="h-[68px] w-[68px] shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <input
                      value={item.title}
                      maxLength={LINK_TITLE_LIMIT}
                      onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                      placeholder="圖片標題"
                      className="w-full rounded-lg border border-[#e5ded4] px-2.5 py-1.5 text-sm outline-none focus:border-[#1f1b19]/40"
                    />
                    <input
                      value={item.url}
                      onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                      placeholder="連結網址(選填,預設為上方網址)"
                      className="w-full rounded-lg border border-[#e5ded4] px-2.5 py-1.5 text-xs outline-none focus:border-[#1f1b19]/40"
                    />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">開啟自動輪播</span>
        <span className={canAutoplay ? '' : 'pointer-events-none opacity-40'}>
          <Toggle on={options.autoplay && canAutoplay} onChange={(v) => setOptions({ autoplay: v })} label="開啟自動輪播" />
        </span>
        {!canAutoplay ? <span className="text-[11px] text-[#a99e8f]">單張式版型且有 2 張以上圖片時可輪播</span> : null}
      </div>

      <div>
        {label('版型')}
        {layoutInfo ? (
          <div className="mb-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-xl bg-[#faf7f2] px-3.5 py-2.5 text-xs leading-5">
            <span className="text-[#a99e8f]">目前版型</span>
            <span className="font-medium text-[#1f1b19]">{layoutInfo.label}</span>
            <span className="text-[#a99e8f]">圖片比例</span>
            <span className="text-[#5f5852]">{layoutInfo.ratio}</span>
            <span className="text-[#a99e8f]">建議尺寸</span>
            <span className="font-medium text-[#702838]">{layoutInfo.size} px</span>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {IMAGE_LAYOUTS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setOptions({ layout: l.key })}
              className={`flex flex-col items-center gap-2 rounded-xl border p-2.5 transition ${options.layout === l.key ? 'border-[#1f1b19] bg-[#faf7f2] text-[#1f1b19]' : 'border-[#efe8dd] text-[#8a7f72] hover:border-[#1f1b19]/30'}`}
            >
              <span className="flex h-9 w-full items-center px-1"><LayoutThumb layout={l.key} /></span>
              <span className="text-[11px] leading-4">{l.label}</span>
              <span className="-mt-1.5 text-center text-[10px] leading-3.5 text-[#b3a897]">{l.ratio}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-[#f3eee7] pt-3">
        <button type="button" onClick={onCollapse} className="flex items-center gap-1 text-xs text-[#8a7f72]">
          <Icon size={14}><path d="M6 15l6-6 6 6" /></Icon>
          收合
        </button>
        <span className="ml-auto text-[11px] text-[#a99e8f]">請記得按下完成按鈕</span>
        <button
          type="button"
          onClick={() => {
            if (!block.url.trim()) setShowRequired(true);
            onDone();
          }}
          disabled={uploading > 0}
          className="rounded-full bg-[#1f1b19] px-5 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          完成
        </button>
      </div>
    </div>
  );
}

// 連結按鈕縮圖:上傳圖片(PNG 透明背景會保留)或選內建圖示(預設顯示 2 排,其餘收合)
const ICON_ROWS_SHOWN = 16;
// 一鍵搬家:貼上自己在其他名片服務的網址,預覽後勾選要匯入的內容
type ImportPreview = {
  source: string;
  name: string;
  bio: string;
  avatar: string;
  socials: { type: string; value: string }[];
  items: ({ kind: 'link'; title: string; url: string; image: string } | { kind: 'text'; title: string } | { kind: 'video'; title: string; url: string })[];
  maxBlocks: number;
};

function ImportPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { plan, upgradeHref } = usePlan();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ImportPreview | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [opts, setOpts] = useState({ name: true, bio: true, avatar: true, socials: true });
  const [mine, setMine] = useState(false);
  const [result, setResult] = useState('');

  async function read() {
    setBusy(true);
    setError('');
    setData(null);
    setResult('');
    try {
      const res = await fetch('/api/profile-card/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '讀取失敗');
      setData(d);
      setPicked(d.items.map((_: unknown, i: number) => i));
    } catch (e) {
      setError(e instanceof Error ? e.message : '讀取失敗');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/profile-card/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, apply: { ...opts, items: picked } }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '匯入失敗');
      setResult(d.skipped ? `已匯入 ${d.added} 個區塊。免費版最多 ${d.maxBlocks} 個區塊,還有 ${d.skipped} 個沒有匯入。` : `已匯入 ${d.added} 個區塊,頭像與資料也更新好了。`);
      setData(null);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '匯入失敗');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const kindLabel = { link: '連結', text: '標題', video: '影片' } as const;

  return (
    <div className="space-y-3 rounded-2xl border border-[#e5ded4] bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">一鍵搬家</p>
        <button type="button" onClick={onClose} className="text-xs text-[#8a7f72]">關閉</button>
      </div>
      <p className="text-xs leading-5 text-[#8a7f72]">貼上你在 Linktree、Portaly、LINKGOODS、Linkfly、lit.link 等服務的個人頁網址,會讀取頭像、名稱、簡介和所有連結,勾選後匯入。</p>
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://linktr.ee/你的帳號" className={`${inputClass} min-w-0 flex-1`} />
        <button type="button" onClick={() => void read()} disabled={busy || !url.trim()} className="shrink-0 rounded-full bg-[#1f1b19] px-4 text-xs font-semibold text-white disabled:opacity-50">
          {busy && !data ? '讀取中…' : '讀取'}
        </button>
      </div>
      {error ? <p className="rounded-xl bg-[#fbf3f0] px-3 py-2 text-xs text-[#a33a2b]">{error}</p> : null}
      {result ? <p className="rounded-xl bg-[#f3fbf5] px-3 py-2 text-xs text-[#1f5a33]">{result}</p> : null}

      {data ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-[#faf7f2] p-3">
            {data.avatar ? <img src={data.avatar} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" /> : <span className="h-12 w-12 shrink-0 rounded-full bg-[#efe8dd]" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{data.name || '(沒有名稱)'}</p>
              <p className="line-clamp-2 text-xs text-[#8a7f72]">{data.bio || '(沒有簡介)'}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] text-[#8a7f72]">{data.source}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {([['avatar', '換成這個頭像'], ['name', '換成這個名稱'], ['bio', '換成這段簡介'], ['socials', `加入社群帳號(${data.socials.length})`]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6b6156]">讀到 {data.items.length} 個項目,已勾選 {picked.length} 個</span>
            <button type="button" onClick={() => setPicked(picked.length === data.items.length ? [] : data.items.map((_, i) => i))} className="text-[#6b6156] underline underline-offset-2">
              {picked.length === data.items.length ? '全部取消' : '全部勾選'}
            </button>
          </div>
          <div className="max-h-72 divide-y divide-[#f3eee7] overflow-y-auto rounded-xl border border-[#efe8dd]">
            {data.items.map((it, i) => (
              <label key={i} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-xs">
                <input type="checkbox" checked={picked.includes(i)} onChange={() => toggle(i)} />
                {it.kind === 'link' && it.image ? <img src={it.image} alt="" className="h-7 w-7 shrink-0 rounded object-cover" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#f6f2ec] text-[10px] text-[#8a7f72]">{kindLabel[it.kind]}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[#1f1b19]">{it.title || '(無標題)'}</span>
                  {'url' in it ? <span className="block truncate text-[#a99e8f]">{it.url}</span> : null}
                </span>
              </label>
            ))}
          </div>
          {!plan.pro && picked.length > data.maxBlocks ? (
            <p className="text-[11px] leading-5 text-[#8a5a1c]">
              免費版最多 {data.maxBlocks} 個區塊,超過的不會匯入。<a href={upgradeHref} className="underline">升級 U Plus</a> 不限數量。
            </p>
          ) : null}
          <label className="flex items-start gap-2 text-[11px] leading-5 text-[#6b6156]">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="mt-1" />
            我確認這是我自己的頁面,有權使用上面的內容與圖片。
          </label>
          <button type="button" onClick={() => void apply()} disabled={busy || !mine || (!picked.length && !opts.avatar && !opts.name && !opts.bio && !opts.socials)} className="w-full rounded-full bg-[#1f1b19] py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? '匯入中…' : `匯入勾選的 ${picked.length} 個項目`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const newSpotId = () => Math.random().toString(36).slice(2, 10);

// 熱區圖片:上傳整張設計圖,在圖上框出可以點的區域
function HotspotEditor({
  block,
  onLocalChange,
  onPatch,
  field,
}: {
  block: ProfileCardBlock;
  onLocalChange: (patch: Partial<ProfileCardBlock>) => void;
  onPatch: (patch: Partial<ProfileCardBlock>) => void;
  field: (key: 'title' | 'url', label: string, placeholder: string) => ReactNode;
}) {
  const options = blockOptions(block);
  const spots = options.spots;
  const [uploading, setUploading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [selected, setSelected] = useState('');
  const [live, setLive] = useState<HotSpot[] | null>(null); // 拖曳中的暫時位置
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'draw' | 'move' | 'resize'; id?: string; sx: number; sy: number; orig?: HotSpot } | null>(null);
  const shown = live ?? spots;
  const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
  const round = (v: number) => Math.round(v * 100) / 100;

  const save = (next: HotSpot[]) => onPatch({ options: { ...options, spots: next } });
  const local = (next: HotSpot[]) => onLocalChange({ options: { ...options, spots: next } });
  const updateSpot = (id: string, patch: Partial<HotSpot>, persist: boolean) => {
    const next = spots.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp));
    if (persist) save(next);
    else local(next);
  };

  // 拖曳時游標移出圖片也能繼續追蹤
  function capture(e: React.PointerEvent) {
    try {
      box.current?.setPointerCapture(e.pointerId);
    } catch {
      /* 部分瀏覽器不支援,略過 */
    }
  }

  function point(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
  }

  function onBoxDown(e: React.PointerEvent) {
    if (!drawing) return;
    const p = point(e);
    capture(e);
    drag.current = { mode: 'draw', sx: p.x, sy: p.y };
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onSpotDown(e: React.PointerEvent, sp: HotSpot, mode: 'move' | 'resize') {
    e.stopPropagation();
    const p = point(e);
    setSelected(sp.id);
    capture(e);
    drag.current = { mode, id: sp.id, sx: p.x, sy: p.y, orig: sp };
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    if (d.mode === 'draw') {
      setRect({ x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy) });
      return;
    }
    const o = d.orig!;
    const dx = p.x - d.sx;
    const dy = p.y - d.sy;
    const next =
      d.mode === 'move'
        ? { ...o, x: round(clamp(o.x + dx, 0, 100 - o.w)), y: round(clamp(o.y + dy, 0, 100 - o.h)) }
        : { ...o, w: round(clamp(o.w + dx, 3, 100 - o.x)), h: round(clamp(o.h + dy, 1, 100 - o.y)) };
    setLive(spots.map((sp) => (sp.id === o.id ? next : sp)));
  }

  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === 'draw') {
      const r = rect;
      setRect(null);
      setDrawing(false);
      if (!r || r.w < 3 || r.h < 1) return;
      if (spots.length >= HOTSPOT_LIMIT) return void uiAlert(`一張圖最多 ${HOTSPOT_LIMIT} 個熱區`);
      const sp: HotSpot = { id: newSpotId(), x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h), label: '', url: '', shape: 'rect' };
      save([...spots, sp]);
      setSelected(sp.id);
      return;
    }
    if (live) save(live);
    setLive(null);
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      onPatch({ image: await uploadImage(file, false, 3200, true) });
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  const sel = spots.find((sp) => sp.id === selected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-full border border-[#d7c9bd] bg-white px-4 py-1.5 text-xs font-medium hover:bg-[#f6f2ec]">
          {uploading ? '上傳中…' : block.image ? '更換圖片' : '上傳設計圖'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <span className="text-[11px] text-[#a99e8f]">建議寬 1080px,長圖可切成幾段分開上傳</span>
      </div>

      {block.image ? (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawing(!drawing)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${drawing ? 'bg-[#d4f53c] text-[#1f1b19]' : 'bg-[#1f1b19] text-white'}`}
            >
              {drawing ? '在圖上拖拉框出位置…(點這裡取消)' : '＋ 新增熱區'}
            </button>
            <span className="text-[11px] text-[#a99e8f]">{spots.length} / {HOTSPOT_LIMIT}</span>
          </div>

          <div
            ref={box}
            onPointerDown={onBoxDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className={`relative select-none overflow-hidden rounded-xl border border-[#e5ded4] ${drawing ? 'cursor-crosshair' : ''}`}
            style={{ touchAction: drawing ? 'none' : 'auto' }}
          >
            <img src={block.image} alt="" draggable={false} className="pointer-events-none block h-auto w-full" />
            {shown.map((sp, n) => {
              const on = sp.id === selected;
              return (
                <div
                  key={sp.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelected(sp.id);
                  }}
                  className={`absolute flex items-start justify-start border-2 ${sp.shape === 'circle' ? 'rounded-full' : 'rounded-md'} ${on ? 'border-[#d4f53c] bg-[#d4f53c]/25' : 'border-white/90 bg-[#1f1b19]/25'}`}
                  style={{ left: `${sp.x}%`, top: `${sp.y}%`, width: `${sp.w}%`, height: `${sp.h}%`, boxShadow: '0 0 0 1px rgba(0,0,0,0.35)' }}
                >
                  <span className={`m-0.5 rounded bg-[#1f1b19] px-1.5 text-[10px] font-semibold leading-4 text-white ${sp.shape === 'circle' ? 'mx-auto' : ''}`}>{n + 1}{sp.url ? '' : ' 未設定'}</span>
                  {on ? (
                    <span
                      onPointerDown={(e) => onSpotDown(e, sp, 'move')}
                      title="拖移"
                      className="absolute -left-2.5 -top-2.5 flex h-6 w-6 cursor-move items-center justify-center rounded-full border-2 border-[#1f1b19] bg-white text-[13px] leading-none text-[#1f1b19] shadow"
                      style={{ touchAction: 'none' }}
                    >
                      ✥
                    </span>
                  ) : null}
                  {on ? (
                    <span
                      onPointerDown={(e) => onSpotDown(e, sp, 'resize')}
                      className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-[#1f1b19] bg-[#d4f53c]"
                      style={{ touchAction: 'none' }}
                    />
                  ) : null}
                </div>
              );
            })}
            {rect ? (
              <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-[#d4f53c] bg-[#d4f53c]/20" style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }} />
            ) : null}
          </div>
          <p className="text-[11px] leading-5 text-[#a99e8f]">點一下框框選取,按住左上角 ✥ 拖移,拉右下角的圓點調整大小。名片上這些框框是透明的,只有點的時候才看得出來。</p>

          {sel ? (
            <div className="space-y-2 rounded-xl border border-[#d4f53c] bg-[#fbfde9] p-3">
              <p className="text-xs font-semibold">熱區 {spots.findIndex((sp) => sp.id === sel.id) + 1}</p>
              <input value={sel.label} onChange={(e) => updateSpot(sel.id, { label: e.target.value }, false)} onBlur={(e) => updateSpot(sel.id, { label: e.target.value }, true)} placeholder="名稱(例如:菜單)" className={inputClass} />
              <input value={sel.url} onChange={(e) => updateSpot(sel.id, { url: e.target.value }, false)} onBlur={(e) => updateSpot(sel.id, { url: e.target.value }, true)} placeholder="連結網址" className={inputClass} />
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8a7f72]">形狀</span>
                {([['rect', '方形'], ['circle', '圓形']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateSpot(sel.id, { shape: key }, true)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${sel.shape === key ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] bg-white text-[#5f5852]'}`}
                  >
                    <span className={`inline-block h-3 w-3 border-[1.5px] border-current ${key === 'circle' ? 'rounded-full' : 'rounded-[3px]'}`} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" onClick={() => setSelected('')} className="rounded-full bg-[#1f1b19] px-4 py-1.5 text-xs font-semibold text-white">完成</button>
                <button
                  type="button"
                  onClick={() => {
                    if (spots.length >= HOTSPOT_LIMIT) return void uiAlert(`一張圖最多 ${HOTSPOT_LIMIT} 個熱區`);
                    // 複製:同大小、同形狀與連結,往右下移一點
                    const copy: HotSpot = { ...sel, id: newSpotId(), x: round(clamp(sel.x + 3, 0, 100 - sel.w)), y: round(clamp(sel.y + 2, 0, 100 - sel.h)) };
                    save([...spots, copy]);
                    setSelected(copy.id);
                  }}
                  className="rounded-full border border-[#d7c9bd] bg-white px-4 py-1.5 text-xs font-medium"
                >
                  複製熱區
                </button>
                <button type="button" onClick={() => { save(spots.filter((sp) => sp.id !== sel.id)); setSelected(''); }} className="ml-auto text-xs text-[#c0392b]">刪除</button>
              </div>
            </div>
          ) : null}

          {spots.length ? (
            <div className="divide-y divide-[#f3eee7] rounded-xl border border-[#efe8dd] bg-white">
              {spots.map((sp, n) => (
                <button key={sp.id} type="button" onClick={() => setSelected(sp.id)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${sp.id === selected ? 'bg-[#fbfde9]' : ''}`}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#1f1b19] text-[10px] font-semibold text-white">{n + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{sp.label || '未命名'}</span>
                  <span className={`max-w-[45%] truncate ${sp.url ? 'text-[#a99e8f]' : 'text-[#c0392b]'}`}>{sp.url || '還沒設定連結'}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {field('title', '名稱(選填,顯示在數據分析)', '例如:首頁主視覺')}
    </div>
  );
}

// 社群圖示(PNG,public/icons/social):四種樣式
const SOCIAL_BRANDS: [string, string][] = [
  ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['threads', 'Threads'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['shopee', '蝦皮購物'], ['x', 'X'], ['linkedin', 'LinkedIn'],
  ['pinterest', 'Pinterest'], ['whatsapp', 'WhatsApp'], ['telegram', 'Telegram'], ['messenger', 'Messenger'], ['discord', 'Discord'], ['twitch', 'Twitch'], ['snapchat', 'Snapchat'],
];
const SOCIAL_UTILS: [string, string][] = [
  ['user', '個人'], ['phone', '電話'], ['home', '首頁'], ['mail', 'Email'], ['location', '地點'], ['globe', '網站'], ['click', '點擊'],
  ['heart', '喜歡'], ['like', '讚'], ['plus', '新增'], ['send', '傳送'], ['search', '搜尋'], ['bookmark', '收藏'], ['chat', '聊天'],
];
const SOCIAL_ICON_SETS: { key: string; label: string; items: { src: string; label: string }[] }[] = [
  { key: 'color', label: '彩色圓形', items: SOCIAL_BRANDS.map(([k, l]) => ({ src: `/icons/social/${k}-color.png`, label: l })) },
  { key: 'logo', label: '彩色', items: SOCIAL_BRANDS.map(([k, l]) => ({ src: `/icons/social/${k}-logo.png`, label: l })) },
  { key: 'black', label: '黑色圓形', items: SOCIAL_BRANDS.map(([k, l]) => ({ src: `/icons/social/${k}-black.png`, label: l })) },
  { key: 'util', label: '常用圖示', items: SOCIAL_UTILS.map(([k, l]) => ({ src: `/icons/social/${k}-color.png`, label: l })) },
];

function SocialIconPicker({ value, onChange }: { value: string; onChange: (image: string) => void }) {
  const current = SOCIAL_ICON_SETS.find((s) => s.items.some((i) => i.src === value));
  const [set, setSet] = useState(current?.key ?? 'color');
  const items = SOCIAL_ICON_SETS.find((s) => s.key === set)?.items ?? [];
  return (
    <div className="space-y-2 border-t border-[#efe8dd] pt-2.5">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-[#6b6156]">社群圖示</p>
        <div className="flex flex-wrap gap-1">
          {SOCIAL_ICON_SETS.map((s) => (
            <button key={s.key} type="button" onClick={() => setSet(s.key)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] transition ${set === s.key ? 'bg-[#1f1b19] text-white' : 'text-[#8a7f72] hover:bg-white'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {items.map((i) => {
          const selected = i.src === value;
          return (
            <button
              key={i.src}
              type="button"
              title={i.label}
              aria-label={i.label}
              aria-pressed={selected}
              onClick={() => onChange(selected ? '' : i.src)}
              className={`flex aspect-square items-center justify-center rounded-lg border bg-white p-1.5 transition ${selected ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/20' : 'border-[#efe8dd] hover:border-[#1f1b19]/30'}`}
            >
              <img src={i.src} alt="" loading="lazy" className="h-full w-full object-contain" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LinkThumbPicker({
  value,
  uploading,
  onUpload,
  onChange,
}: {
  value: string;
  uploading: boolean;
  onUpload: (file: File | undefined) => void;
  onChange: (image: string) => void;
}) {
  const [more, setMore] = useState(false);
  const icon = isIconImage(value);
  const selectedKey = icon ? value.slice(ICON_PREFIX.length) : '';
  // 選到收合區的圖示時,自動展開讓使用者看得到
  const selectedHidden = LINK_ICONS.findIndex((i) => i.key === selectedKey) >= ICON_ROWS_SHOWN;
  const open = more || selectedHidden;
  const list = open ? LINK_ICONS : LINK_ICONS.slice(0, ICON_ROWS_SHOWN);
  return (
    <div className="space-y-2.5 rounded-xl bg-[#faf7f2] p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#efe8dd] bg-white text-[#1f1b19]">
          {!value ? (
            <span className="text-[10px] text-[#b3a897]">無縮圖</span>
          ) : icon ? (
            <LinkIcon value={value} size={24} />
          ) : (
            <img src={value} alt="" className={`h-full w-full ${/\.png(\?|$)/i.test(value) ? 'object-contain' : 'object-cover'}`} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">縮圖(選填)</p>
          <p className="text-[11px] text-[#a99e8f]">上傳 PNG / JPG / WEBP(透明 PNG 會保留透明),或從下方選圖示</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-full border border-[#d7c9bd] bg-white px-3.5 py-1.5 text-xs font-medium text-[#1f1b19] hover:bg-[#f6f2ec]">
          {uploading ? '上傳中…' : '上傳圖片'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {value ? (
          <button type="button" onClick={() => onChange('')} className="text-xs text-[#8a7f72]">移除縮圖</button>
        ) : null}
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {list.map((i) => {
          const selected = i.key === selectedKey;
          return (
            <button
              key={i.key}
              type="button"
              title={i.label}
              aria-label={i.label}
              aria-pressed={selected}
              onClick={() => onChange(selected ? '' : `${ICON_PREFIX}${i.key}`)}
              className={`flex aspect-square items-center justify-center rounded-lg border transition ${selected ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#efe8dd] bg-white text-[#3d3935] hover:border-[#1f1b19]/30'}`}
            >
              <LinkIcon value={`${ICON_PREFIX}${i.key}`} size={18} />
            </button>
          );
        })}
      </div>
      {!selectedHidden ? (
        <button type="button" onClick={() => setMore(!more)} className="flex w-full items-center justify-center gap-1 py-1 text-xs text-[#6b6156]">
          {open ? '收合圖示' : `顯示更多圖示(${LINK_ICONS.length - ICON_ROWS_SHOWN})`}
          <Icon size={14}><path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></Icon>
        </button>
      ) : null}
      <SocialIconPicker value={value} onChange={onChange} />
    </div>
  );
}

function Section({ title, children, defaultOpen = true, plus = false }: { title: string; children: ReactNode; defaultOpen?: boolean; plus?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="relative rounded-2xl border border-[#ebe4da] bg-white">
      {plus ? <PlusCorner size={24} /> : null}
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="text-base font-semibold">{title}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`text-[#8a7f72] transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? <div className="space-y-4 px-5 pb-5">{children}</div> : null}
    </section>
  );
}

// 封面照片:目前版面的顯示位置、比例、建議尺寸
function CoverSizeInfo({ layout, shape }: { layout: CardTheme['layout']; shape: CardTheme['avatarShape'] }) {
  const spec = coverSpec(layout, shape);
  const name = PROFILE_LAYOUTS.find((l) => l.key === layout)?.label ?? '';
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-xl bg-[#faf7f2] px-3.5 py-3 text-xs leading-5">
      <span className="text-[#a99e8f]">目前版面</span>
      <span className="font-medium text-[#1f1b19]">{name}</span>
      <span className="text-[#a99e8f]">顯示位置</span>
      <span className="text-[#5f5852]">{spec.where}</span>
      <span className="text-[#a99e8f]">顯示比例</span>
      <span className="text-[#5f5852]">{spec.ratio}</span>
      <span className="text-[#a99e8f]">建議尺寸</span>
      <span className="font-medium text-[#702838]">{spec.size} px</span>
    </div>
  );
}

// 封面縮圖預覽:比例、裁切位置、圓形 / 弧形都與名片頁相同
function CoverPreview({ image, layout, shape }: { image: string; layout: CardTheme['layout']; shape: CardTheme['avatarShape'] }) {
  const spec = coverSpec(layout, shape);
  const tall = spec.aspect === null || spec.aspect < 1;
  return (
    <div className={tall ? 'mx-auto w-full max-w-[240px]' : 'w-full'}>
      <div
        className={`relative overflow-hidden border border-dashed border-[#c9bcad] bg-[#faf7f2] ${spec.round ? 'rounded-full' : 'rounded-xl'}`}
        style={{
          aspectRatio: spec.aspect ? String(spec.aspect) : image ? undefined : '4 / 5',
          clipPath: spec.arch && image ? 'ellipse(85% 100% at 50% 0)' : undefined,
        }}
      >
        {image ? (
          <img src={image} alt="" className={spec.aspect ? 'h-full w-full object-cover' : 'block h-auto w-full'} style={{ objectPosition: spec.position }} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-[#a99e8f]">{spec.ratio} 封面預覽</span>
        )}
      </div>
      <p className="mt-1 text-center text-[11px] text-[#a99e8f]">名片頁實際顯示範圍</p>
    </div>
  );
}

// 各版面封面尺寸一覽(收合)
function CoverSizeTable({ shape, current }: { shape: CardTheme['avatarShape']; current: CardTheme['layout'] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[#efe8dd]">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs text-[#6b6156]">
        各版面封面尺寸一覽
        <Icon size={14}><path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></Icon>
      </button>
      {open ? (
        <div className="divide-y divide-[#f3eee7] border-t border-[#efe8dd] text-xs">
          {PROFILE_LAYOUTS.map((l) => {
            const spec = coverSpec(l.key, shape);
            return (
              <div key={l.key} className={`grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3.5 py-2 ${l.key === current ? 'bg-[#faf7f2] font-medium' : ''}`}>
                <span className="text-[#1f1b19]">{l.label}</span>
                <span className="truncate text-[#8a7f72]">{spec.ratio}</span>
                <span className="text-right text-[#5f5852]">{spec.size}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ProfileEditor({ draft, setDraft }: { draft: ProfileCard; setDraft: (c: ProfileCard) => void }) {
  const [uploading, setUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [adding, setAdding] = useState(false);
  const set = <K extends keyof ProfileCard>(key: K, value: ProfileCard[K]) => setDraft({ ...draft, [key]: value });
  const unused = SOCIAL_PLATFORMS.filter((p) => !draft.socials.some((s) => s.type === p.type));

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      set('avatar_url', await uploadImage(file, true));
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  const theme = resolveTheme(draft.theme);
  const setTheme = (patch: Partial<CardTheme>) => setDraft({ ...draft, theme: { ...theme, ...patch } });

  async function uploadCover(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return void uiAlert('圖片請小於 10MB');
    setCoverUploading(true);
    try {
      setTheme({ coverImage: await uploadImage(file) });
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setCoverUploading(false);
    }
  }

  function moveSocial(index: number, delta: number) {
    const next = [...draft.socials];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set('socials', next);
  }

  function toggleTag(tag: string) {
    if (draft.tags.includes(tag)) set('tags', draft.tags.filter((t) => t !== tag));
    else if (draft.tags.length >= MAX_TAGS) void uiAlert(`最多選 ${MAX_TAGS} 個`);
    else set('tags', [...draft.tags, tag]);
  }

  return (
    <div className="space-y-4">
      <Section title="封面照片">
        <CoverSizeInfo layout={theme.layout} shape={theme.avatarShape} />
        <CoverPreview image={theme.coverImage} layout={theme.layout} shape={theme.avatarShape} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-full border border-[#d7c9bd] px-4 py-1.5 text-xs font-medium hover:bg-[#f6f2ec]">
            {coverUploading ? '上傳中…' : theme.coverImage ? '更換封面' : '上傳封面'}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={coverUploading} onChange={(e) => { void uploadCover(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {theme.coverImage ? <button type="button" onClick={() => setTheme({ coverImage: '' })} className="text-xs text-[#8a7f72]">移除</button> : null}
          <span className="text-[11px] text-[#a99e8f]">單張上限 10MB</span>
        </div>
        <CoverSizeTable shape={theme.avatarShape} current={theme.layout} />
      </Section>

      <Section title="大頭照及名稱">
        <div className="flex items-center gap-3">
          <span className="text-sm">顯示大頭照</span>
          <Toggle on={theme.showAvatar} onChange={(v) => setTheme({ showAvatar: v })} label="顯示大頭照" />
        </div>
        <div className={`flex items-center gap-4 ${theme.showAvatar ? '' : 'opacity-40'}`}>
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-dashed border-[#c9bcad] bg-[#faf7f2]">
            {draft.avatar_url ? <img src={draft.avatar_url} alt="" className="h-full w-full object-contain" /> : null}
          </div>
          <div className="space-y-2">
            <label className="inline-block cursor-pointer rounded-full border border-[#d7c9bd] px-4 py-1.5 text-xs font-medium hover:bg-[#f6f2ec]">
              {uploading ? '上傳中…' : draft.avatar_url ? '更換照片' : '上傳照片'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {draft.avatar_url ? <button type="button" onClick={() => set('avatar_url', '')} className="block text-xs text-[#8a7f72]">移除</button> : null}
            <p className="text-[11px] text-[#a99e8f]">會自動裁成正方形</p>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-[#8a7f72]">網址代稱</span>
          <div className="flex items-center rounded-xl border border-[#e5ded4] bg-white pl-3.5 focus-within:border-[#1f1b19]/40">
            <span className="shrink-0 text-sm text-[#a99e8f]">urbanite.com.tw/@</span>
            <input
              value={draft.slug}
              onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
              className="min-w-0 flex-1 bg-transparent py-2.5 pr-3.5 text-sm outline-none"
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[#8a7f72]">顯示名稱</span>
          <input value={draft.display_name} onChange={(e) => set('display_name', e.target.value)} className={inputClass} />
        </label>
        <div>
          <div className="mb-1.5 flex items-center gap-3">
            <span className="text-sm">E-mail</span>
            <Toggle on={draft.show_email} onChange={(v) => set('show_email', v)} label="顯示 E-mail" />
          </div>
          <input value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="service@urbanite.com.tw" className={inputClass} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center gap-3">
            <span className="text-sm">簡述</span>
            <Toggle on={draft.show_bio} onChange={(v) => set('show_bio', v)} label="顯示簡述" />
            <span className="ml-auto text-[11px] text-[#a99e8f]">{draft.bio.length}/{BIO_LIMIT}</span>
          </div>
          <textarea value={draft.bio} maxLength={BIO_LIMIT} rows={3} onChange={(e) => set('bio', e.target.value)} placeholder="一句話讓大家知道你是誰" className={`${inputClass} resize-none leading-6`} />
        </div>
      </Section>

      <Section title="社群帳號">
        <div className="flex items-center gap-3">
          <span className="text-sm">顯示社群帳號</span>
          <Toggle on={draft.show_socials} onChange={(v) => set('show_socials', v)} label="顯示社群帳號" />
        </div>
        {draft.socials.map((s, i) => {
          const platform = SOCIAL_PLATFORMS.find((p) => p.type === s.type);
          return (
            <div key={s.type}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[#1f1b19]"><SocialIcon type={s.type} size={18} /></span>
                <span className="text-sm">{platform?.label ?? s.type}</span>
                <span className="ml-auto flex items-center gap-1 text-[#a99e8f]">
                  <button type="button" aria-label="上移" disabled={i === 0} onClick={() => moveSocial(i, -1)} className="rounded p-1 hover:bg-[#f6f2ec] disabled:opacity-30">↑</button>
                  <button type="button" aria-label="下移" disabled={i === draft.socials.length - 1} onClick={() => moveSocial(i, 1)} className="rounded p-1 hover:bg-[#f6f2ec] disabled:opacity-30">↓</button>
                  <button type="button" aria-label="刪除" onClick={() => set('socials', draft.socials.filter((_, idx) => idx !== i))} className="rounded p-1 text-[#c0392b] hover:bg-[#fbf3f0]">✕</button>
                </span>
              </div>
              <input value={s.value} onChange={(e) => set('socials', draft.socials.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))} placeholder={platform?.placeholder} className={inputClass} />
            </div>
          );
        })}
        {unused.length > 0 ? (
          adding ? (
            <div className="flex flex-wrap gap-2">
              {unused.map((p) => (
                <button key={p.type} type="button" onClick={() => { set('socials', [...draft.socials, { type: p.type, value: '' }]); setAdding(false); }} className="flex items-center gap-1.5 rounded-full border border-[#e5ded4] px-3 py-1.5 text-xs hover:border-[#1f1b19]/30">
                  <SocialIcon type={p.type} size={14} />
                  {p.label}
                </button>
              ))}
              <button type="button" onClick={() => setAdding(false)} className="px-2 text-xs text-[#8a7f72]">取消</button>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="rounded-full border border-[#1f1b19] px-4 py-2 text-sm font-medium">＋ 新增社群</button>
          )
        ) : null}
      </Section>

      <Section title="擅長領域">
        <div className="flex items-center gap-3">
          <span className="text-sm">顯示標籤</span>
          <Toggle on={draft.show_tags} onChange={(v) => set('show_tags', v)} label="顯示標籤" />
          <span className="ml-auto text-[11px] text-[#a99e8f]">最多 {MAX_TAGS} 個</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...new Set([...TAG_SUGGESTIONS, ...draft.tags])].map((tag) => (
            <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`rounded-xl border px-3 py-2 text-sm transition ${draft.tags.includes(tag) ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#e5ded4] text-[#5f5852] hover:border-[#1f1b19]/30'}`}>
              {tag}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const tag = customTag.trim();
            if (!tag) return;
            if (!draft.tags.includes(tag)) toggleTag(tag);
            setCustomTag('');
          }}
        >
          <input value={customTag} onChange={(e) => setCustomTag(e.target.value)} maxLength={10} placeholder="自訂標籤名稱" className={inputClass} />
          <button type="submit" className="shrink-0 rounded-xl border border-[#d7c9bd] px-4 text-sm">加入</button>
        </form>
      </Section>
    </div>
  );
}

// ---------- 外觀風格 ----------
function StyleEditor({
  draft,
  setDraft,
  onPreview,
  blocks,
  productMap,
  lineUrl,
}: {
  draft: ProfileCard;
  setDraft: (c: ProfileCard) => void;
  onPreview: () => void;
  blocks: ProfileCardBlock[];
  productMap: Record<string, CardProduct>;
  lineUrl: string;
}) {
  const [tab, setTab] = useState<'template' | 'background' | 'profile' | 'button'>('template');
  const { plan, upgradeHref } = usePlan();
  const [category, setCategory] = useState<TemplateFilter>('all');
  // 樣板縮圖只放前幾個區塊,輪播不自動播放
  const sampleBlocks = useMemo(
    () => blocks.slice(0, 5).map((b) => (b.options ? { ...b, options: { ...b.options, autoplay: false } } : b)),
    [blocks],
  );
  const [uploading, setUploading] = useState(false);
  const theme = resolveTheme(draft.theme);
  const setTheme = (patch: Partial<CardTheme>) => setDraft({ ...draft, theme: { ...theme, ...patch } });
  // 背景 / 簡介樣式 / 連結樣式:免費版看得到,動到任何設定就提示升級(拖曳色盤只跳一次)
  const locked = !plan.limits.customStyle;
  const asking = useRef(false);
  const askPlus = () => {
    if (asking.current) return;
    asking.current = true;
    void askUpgrade('自訂樣式是 U Plus 功能。', upgradeHref).finally(() => {
      asking.current = false;
    });
  };
  const editTheme = (patch: Partial<CardTheme>) => (locked ? askPlus() : setTheme(patch));

  async function uploadBg(file: File | undefined) {
    if (!file) return;
    if (locked) return askPlus();
    setUploading(true);
    try {
      setTheme({ bgType: 'image', bgImage: await uploadImage(file, false, 1920) });
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 -mt-2 overflow-x-auto pr-2 pt-2 [scrollbar-width:none]">
        {([['template', '樣板'], ['background', '背景'], ['profile', '簡介樣式'], ['button', '連結樣式']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`relative shrink-0 rounded-full px-4 py-2 text-sm transition ${tab === key ? 'bg-[#efe8dd] font-medium text-[#1f1b19]' : 'text-[#8a7f72] hover:bg-[#f6f2ec]'}`}>
            {label}
            {key !== 'template' && !plan.limits.customStyle ? <PlusCorner /> : null}
          </button>
        ))}
        <button type="button" onClick={onPreview} className="ml-auto shrink-0 rounded-full border border-[#d7c9bd] bg-white px-4 py-2 text-sm text-[#6b6156] lg:hidden">預覽</button>
      </div>

      {tab === 'template' ? (
        <section className="rounded-2xl border border-[#ebe4da] bg-white p-4">
          <p className="text-sm leading-6 text-[#6b6156]">挑一個樣板快速套用,之後還能在「背景」「簡介樣式」「連結樣式」再微調。封面照片與大頭照不會被樣板覆蓋。</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {TEMPLATE_FILTERS.map((c) => {
              const count = CARD_TEMPLATES.filter((t) => templateIn(c.key, t.key)).length;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`whitespace-nowrap rounded-full px-1 py-1.5 text-[13px] transition sm:text-sm ${category === c.key ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] text-[#5f5852] hover:border-[#1f1b19]/30'}`}
                >
                  {c.label}({count})
                </button>
              );
            })}
          </div>
          {category === 'other' ? (
            <p className="mt-4 rounded-xl bg-[#faf7f2] px-4 py-6 text-center text-sm leading-6 text-[#8a7f72]">更多樣板陸續推出,U Pro、U Max 專屬樣板也會放在這裡。</p>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CARD_TEMPLATES.filter((t) => templateIn(category, t.key)).map((tpl) => {
              const selected = theme.template === tpl.key;
              const locked = !plan.limits.allTemplates && !FREE_TEMPLATE_KEYS.includes(tpl.key);
              return (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => (locked ? void askUpgrade(`「${tpl.name}」是 U Plus 樣板。`, upgradeHref) : setTheme({ ...tpl.theme, template: tpl.key, ...(tpl.key === 'blank' ? { imageOnly: true } : theme.template === 'blank' ? { imageOnly: false } : {}) }))}
                  className={`relative rounded-2xl border text-left transition ${selected ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/15' : 'border-[#e5ded4] hover:border-[#1f1b19]/30'}`}
                >
                  {locked ? <PlusCorner size={30} /> : null}
                  <div className="overflow-hidden rounded-[15px]">
                    <MiniPreview card={{ ...draft, theme: { ...theme, ...tpl.theme } }} blocks={sampleBlocks} productMap={productMap} lineUrl={lineUrl} />
                    <div className="flex items-center justify-between border-t border-[#efe8dd] bg-white px-3 py-2">
                      <span className="text-sm">{tpl.name}</span>
                      {selected ? <span className="text-xs text-[#1f7a44]">使用中</span> : locked ? <ProBadge /> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab !== 'template' && locked ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[#e5ded4] bg-white px-4 py-3">
          <img src="/brand/uplus-badge.png" alt="" className="h-8 w-8 shrink-0 rounded-full" />
          <p className="min-w-0 flex-1 text-xs leading-5 text-[#6b6156]">以下是 U Plus 功能,可以先看看有哪些設定;要修改時會提示升級。</p>
          <a href={upgradeHref} className="shrink-0 rounded-full bg-[#1f1b19] px-3.5 py-1.5 text-xs font-semibold text-white">升級</a>
        </div>
      ) : null}

      {tab === 'background' ? (
        <Section title="背景" plus={locked}>
          <Pills
            value={theme.bgType}
            options={[
              { key: 'color', label: '純色' },
              { key: 'gradient', label: '漸層' },
              { key: 'grid', label: '格紋' },
              { key: 'dots', label: '點點' },
              { key: 'stripes', label: '條紋' },
              { key: 'image', label: '圖片' },
            ]}
            onChange={(v) => editTheme({ bgType: v })}
          />
          <ColorField label={theme.bgType === 'gradient' ? '漸層上方' : '背景色'} value={theme.bgColor} onChange={(v) => editTheme({ bgColor: v })} />
          {theme.bgType === 'gradient' ? <ColorField label="漸層下方" value={theme.bgColor2} onChange={(v) => editTheme({ bgColor2: v })} /> : null}
          {/* 背景圖片:整個手機畫面的底圖,上傳後自動切換成「圖片」 */}
          <div className="flex gap-4 rounded-xl border border-[#efe8dd] bg-[#fcfaf7] p-3">
            <span className="flex aspect-[9/16] w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#e5ded4] bg-white text-[10px] text-[#b3a897]">
              {theme.bgType === 'image' && theme.bgImage ? <img src={theme.bgImage} alt="" className="h-full w-full object-cover" /> : '9:16'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">背景圖片</p>
              <p className="mt-1 text-[11px] leading-5 text-[#8a7f72]">
                整個手機畫面的底圖,捲動時固定不動。
                <br />
                建議尺寸 1080 × 1920 px(9:16 直式),主體放在中間,檔案 5MB 以內。
              </p>
              <div className="mt-2 flex items-center gap-3">
                <label className="cursor-pointer rounded-full border border-[#d7c9bd] bg-white px-4 py-1.5 text-xs font-medium hover:bg-[#f6f2ec]">
                  {uploading ? '上傳中…' : theme.bgType === 'image' && theme.bgImage ? '更換背景圖' : '上傳背景圖'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(e) => { void uploadBg(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {theme.bgType === 'image' && theme.bgImage ? (
                  <button type="button" onClick={() => editTheme({ bgType: 'color', bgImage: '' })} className="text-xs text-[#8a7f72]">移除</button>
                ) : null}
              </div>
              {theme.bgType === 'image' && theme.bgImage ? <p className="mt-2 text-[11px] leading-5 text-[#a99e8f]">圖片偏深時,把下面的「文字顏色」改成淺色比較好閱讀。</p> : null}
            </div>
          </div>
          <ColorField label="文字顏色" value={theme.textColor} onChange={(v) => editTheme({ textColor: v })} />
          <ColorField label="次要文字" value={theme.mutedColor} onChange={(v) => editTheme({ mutedColor: v })} />
          <ColorField label="重點色(價格等)" value={theme.accentColor} onChange={(v) => editTheme({ accentColor: v })} />
          <div className="flex items-center gap-3 pt-1">
            <span className="text-sm">頂部色塊</span>
            <Toggle on={theme.headerBand} onChange={(v) => editTheme({ headerBand: v })} label="頂部色塊" />
            <span className="ml-auto text-[11px] text-[#a99e8f]">有封面照片時以照片為主</span>
          </div>
          {theme.headerBand ? <ColorField label="色塊顏色" value={theme.bandColor} onChange={(v) => editTheme({ bandColor: v })} /> : null}
        </Section>
      ) : null}

      {tab === 'profile' ? (
        <Section title="簡介樣式" plus={locked}>
          <div className="flex items-start gap-3 rounded-xl bg-[#faf7f2] p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm">純圖片版面</p>
              <p className="mt-0.5 text-[11px] leading-5 text-[#a99e8f]">隱藏頭像、名稱、簡介與社群圖示,整頁只顯示你的區塊。搭配「熱區圖片」就能用整張設計圖當名片。</p>
            </div>
            <Toggle on={theme.imageOnly} onChange={(v) => editTheme({ imageOnly: v })} label="純圖片版面" />
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">版面配置</p>
            <Pills value={theme.layout} options={PROFILE_LAYOUTS} onChange={(v) => editTheme({ layout: v })} />
            {theme.layout === 'hero' ? <p className="mt-2 text-[11px] text-[#a99e8f]">封面照片會延伸到名稱與簡述後方;沒有封面時改用大頭照。</p> : null}
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">頭像形狀(主照片)</p>
            <Pills value={theme.avatarShape} options={[{ key: 'circle', label: '圓形' }, { key: 'square', label: '方形' }, { key: 'portrait', label: '直式 4:5' }]} onChange={(v) => editTheme({ avatarShape: v })} />
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">文字排列</p>
            <Pills value={theme.align} options={[{ key: 'center', label: '置中' }, { key: 'left', label: '靠左' }]} onChange={(v) => editTheme({ align: v })} />
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">字體</p>
            <Pills value={theme.font} options={FONT_OPTIONS.map((f) => ({ key: f.key, label: f.label }))} onChange={(v) => editTheme({ font: v })} />
          </div>
        </Section>
      ) : null}

      {tab === 'button' ? (
        <Section title="連結樣式" plus={locked}>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">排列方式</p>
            <Pills value={theme.linkStyle} options={LINK_STYLES} onChange={(v) => editTheme({ linkStyle: v })} />
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">形狀</p>
            <Pills value={theme.buttonShape} options={[{ key: 'pill', label: '膠囊' }, { key: 'rounded', label: '圓角' }, { key: 'square', label: '直角' }]} onChange={(v) => editTheme({ buttonShape: v })} />
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">樣式</p>
            <Pills value={theme.buttonFill} options={[{ key: 'solid', label: '實心' }, { key: 'soft', label: '淡色' }, { key: 'outline', label: '外框' }]} onChange={(v) => editTheme({ buttonFill: v })} />
          </div>
          <ColorField label={theme.buttonFill === 'outline' ? '外框顏色' : '按鈕顏色'} value={theme.buttonColor} onChange={(v) => editTheme({ buttonColor: v })} />
          <ColorField label="按鈕文字" value={theme.buttonTextColor} onChange={(v) => editTheme({ buttonTextColor: v })} />
          <div className="flex items-center gap-3">
            <span className="text-sm">陰影</span>
            <Toggle on={theme.buttonShadow} onChange={(v) => editTheme({ buttonShadow: v })} label="按鈕陰影" />
          </div>
        </Section>
      ) : null}
    </div>
  );
}

// 樣板縮圖:用真正的名片畫面縮小顯示
function MiniPreview({ card, blocks, productMap, lineUrl }: { card: ProfileCard; blocks: ProfileCardBlock[]; productMap: Record<string, CardProduct>; lineUrl: string }) {
  const WIDTH = 360;
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setScale(el.offsetWidth / WIDTH || 0.4);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={boxRef} className="pointer-events-none relative aspect-[9/19] overflow-hidden bg-white" aria-hidden="true">
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: WIDTH, height: `${100 / scale}%`, transform: `scale(${scale})` }}>
        <ProfileCardView card={card} blocks={blocks} products={productMap} lineUrl={lineUrl} preview />
      </div>
    </div>
  );
}

// ---------- 數據分析 ----------
type Stats = { days: number; views: number; clicks: number; daily: { day: string; views: number; clicks: number }[]; blocks: Record<string, number>; spots?: Record<string, Record<string, number>>; sources: Record<string, number> };

function StatsPanel({ cardId, url, blocks, productMap }: { cardId: string; url: string; blocks: ProfileCardBlock[]; productMap: Record<string, CardProduct> }) {
  const [days, setDays] = useState<7 | 30>(7);
  const { plan, upgradeHref } = usePlan();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/profile-card/stats?card_id=${cardId}&days=${days}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '讀取失敗');
        setStats(data);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : '讀取失敗'));
  }, [cardId, days]);

  if (error) return <p className="rounded-2xl border border-[#e0b4b4] bg-[#fbf3f0] p-4 text-sm text-[#c0392b]">{error}</p>;
  if (!stats) return <p className="py-12 text-center text-sm text-[#a99e8f]">載入中…</p>;

  const max = Math.max(1, ...stats.daily.map((d) => d.views));
  const ctr = stats.views ? Math.round((stats.clicks / stats.views) * 1000) / 10 : 0;
  const ranked = blocks
    .filter((b) => !['text', 'divider', 'video'].includes(b.type))
    .map((b) => ({ block: b, count: stats.blocks[b.id] ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const sources = Object.entries(stats.sources).sort((a, b) => b[1] - a[1]);
  const sourceTotal = sources.reduce((n, [, v]) => n + v, 0);
  const nameOf = (b: ProfileCardBlock) =>
    b.type === 'product' ? b.title || productMap[b.product_id]?.name || '商品卡' : b.type === 'line' ? b.title || '加入官方 LINE' : b.title || '未命名';

  return (
    <div className="space-y-4">
      <Pills value={String(days) as '7' | '30'} options={[{ key: '7', label: '近 7 天' }, { key: '30', label: '近 30 天' }]} plus={plan.limits.statsDays < 30 ? ['30'] : []} onChange={(v) => (v === '30' && plan.limits.statsDays < 30 ? void askUpgrade('近 30 天的數據是 U Plus 功能。', upgradeHref) : setDays(v === '30' ? 30 : 7))} />

      <div className="grid grid-cols-3 gap-2">
        {[
          ['瀏覽', stats.views.toLocaleString()],
          ['點擊', stats.clicks.toLocaleString()],
          ['點擊率', `${ctr}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[#ebe4da] bg-white p-3.5">
            <p className="text-xs text-[#8a7f72]">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-[#ebe4da] bg-white p-4">
        <p className="mb-3 text-sm font-semibold">每日瀏覽</p>
        <div className="flex h-32 items-end gap-[3px]">
          {stats.daily.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end">
              <div className="w-full rounded-t-[3px] bg-[#1f1b19]/80 transition group-hover:bg-[#702838]" style={{ height: `${Math.max(d.views ? 4 : 1, (d.views / max) * 100)}%`, opacity: d.views ? 1 : 0.15 }} />
              <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#1f1b19] px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                {d.day.slice(5)} · {d.views}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-[#a99e8f]">
          <span>{stats.daily[0]?.day.slice(5)}</span>
          <span>{stats.daily[stats.daily.length - 1]?.day.slice(5)}</span>
        </div>
      </section>

      <section className="rounded-2xl border border-[#ebe4da] bg-white p-4">
        <p className="mb-3 text-sm font-semibold">連結點擊</p>
        {ranked.length === 0 ? (
          <p className="text-sm text-[#a99e8f]">還沒有可點擊的區塊。</p>
        ) : (
          <div className="space-y-2.5">
            {ranked.map(({ block, count }) => (
              <div key={block.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{nameOf(block)}</span>
                  <span className="shrink-0 text-[#6b6156]">
                    {count}
                    <span className="ml-1.5 text-xs text-[#a99e8f]">{stats.views ? `${Math.round((count / stats.views) * 1000) / 10}%` : '—'}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f3eee7]">
                  <div className="h-full rounded-full bg-[#1f1b19]/70" style={{ width: `${stats.clicks ? (count / Math.max(...ranked.map((r) => r.count), 1)) * 100 : 0}%` }} />
                </div>
                {block.type === 'hotspot' ? (
                  <div className="mt-2 space-y-1 border-l-2 border-[#efe8dd] pl-3">
                    {blockOptions(block).spots.map((sp, n) => (
                      <div key={sp.id} className="flex items-center justify-between gap-3 text-xs text-[#6b6156]">
                        <span className="truncate">{n + 1}. {sp.label || sp.url || '未命名熱區'}</span>
                        <span className="shrink-0">{stats.spots?.[block.id]?.[sp.id] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#ebe4da] bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">流量來源{plan.limits.sources ? null : <ProBadge />}</p>
        {!plan.limits.sources ? (
          <p className="text-sm leading-6 text-[#a99e8f]">
            升級 U Plus 可以看到訪客來自 Instagram、LINE、Facebook、Threads 等哪個平台。
            <a href={upgradeHref} className="ml-1 text-[#1f1b19] underline underline-offset-2">升級</a>
          </p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-[#a99e8f]">這段期間還沒有瀏覽紀錄。</p>
        ) : (
          <div className="space-y-2">
            {sources.map(([key, count]) => (
              <div key={key} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 text-[#5f5852]">{SOURCE_LABELS[key] ?? key}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f3eee7]">
                  <div className="h-full rounded-full bg-[#702838]/70" style={{ width: `${(count / sourceTotal) * 100}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right text-[#6b6156]">{Math.round((count / sourceTotal) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] leading-5 text-[#a99e8f]">只統計次數與來源,不記錄個人資料。</p>
      </section>

      <ShareLinks url={url} />
    </div>
  );
}

// ---------- 設定 ----------
function SettingsEditor({ draft, setDraft }: { draft: ProfileCard; setDraft: (c: ProfileCard) => void }) {
  const { plan } = usePlan();
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof ProfileCard>(key: K, value: ProfileCard[K]) => setDraft({ ...draft, [key]: value });

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      set('seo_image', await uploadImage(file));
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  const shareTitle = draft.seo_title || draft.display_name || draft.slug;
  const shareDesc = draft.seo_description || draft.bio;
  const shareImage = draft.seo_image || draft.avatar_url;

  return (
    <div className="space-y-4">
      {plan.limits.seo ? (
      <Section title="分享預覽卡">
        <p className="text-xs leading-5 text-[#a99e8f]">貼到 LINE、Facebook、Threads 時顯示的標題、說明與圖片。留空會使用名稱、簡述與頭像。</p>
        <label className="block">
          <span className="mb-1 block text-xs text-[#8a7f72]">分享標題</span>
          <input value={draft.seo_title} onChange={(e) => set('seo_title', e.target.value)} placeholder={draft.display_name} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[#8a7f72]">分享說明</span>
          <textarea value={draft.seo_description} rows={2} onChange={(e) => set('seo_description', e.target.value)} placeholder={draft.bio} className={`${inputClass} resize-none`} />
        </label>
        <div className="flex items-center gap-3">
          <label className="cursor-pointer rounded-full border border-[#d7c9bd] px-4 py-1.5 text-xs font-medium hover:bg-[#f6f2ec]">
            {uploading ? '上傳中…' : draft.seo_image ? '更換分享圖' : '上傳分享圖'}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {draft.seo_image ? <button type="button" onClick={() => set('seo_image', '')} className="text-xs text-[#8a7f72]">移除</button> : null}
          <span className="text-[11px] text-[#a99e8f]">建議 1200 × 630</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#e5ded4]">
          <div className="aspect-[1200/630] bg-[#f6f2ec]">{shareImage ? <img src={shareImage} alt="" className="h-full w-full object-cover" /> : null}</div>
          <div className="space-y-0.5 bg-white px-3 py-2.5">
            <p className="text-[11px] text-[#a99e8f]">urbanite.com.tw</p>
            <p className="truncate text-sm font-medium">{shareTitle}</p>
            {shareDesc ? <p className="line-clamp-2 text-xs text-[#8a7f72]">{shareDesc}</p> : null}
          </div>
        </div>
      </Section>
      ) : (
        <ProLock title="自訂分享預覽是 U Plus 功能" desc="名片貼到 LINE、Facebook、Threads 時顯示的標題、說明與圖片。免費版會使用你的名稱、簡述與頭像。" image="/brand/uplus-share-preview.webp" />
      )}

      <ReferralSection />

      <Section title="頁面">
        <div className="flex items-center gap-3">
          <span className="text-sm">公開名片頁</span>
          <Toggle on={draft.published} onChange={(v) => set('published', v)} label="公開名片頁" />
        </div>
        <p className="-mt-2 text-xs leading-5 text-[#a99e8f]">關閉後,訪客會看到「這個頁面暫停中」,你登入後仍可預覽。</p>
        <div className="flex items-center gap-3">
          <span className="text-sm">頁尾顯示 {plan.isAdmin ? 'URBANITE' : 'URBANLINKS'} Logo</span>
          {plan.limits.hideFooter ? (
            <Toggle on={draft.show_footer_logo !== false} onChange={(v) => set('show_footer_logo', v)} label="頁尾 Logo" />
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-[#a99e8f]"><ProBadge />升級後可隱藏</span>
          )}
        </div>
      </Section>
    </div>
  );
}

// 推薦好友:每滿 5 位送 1 個月 U Plus
function ReferralSection() {
  const [data, setData] = useState<{ slug: string; count: number; rewards: number; progress: number; goal: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/profile-card/referral')
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;
  const url = `${window.location.origin}/card?ref=${data.slug}`;
  const left = data.goal - data.progress;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      void uiAlert(url);
    }
  }

  return (
    <Section title="分享推薦連結">
      <div className="flex gap-3 rounded-xl bg-[#f6f2ec] p-3.5">
        <img src="/brand/uplus-badge.png" alt="U Plus" className="mt-0.5 h-8 w-8 shrink-0 rounded-full" />
        <div className="text-xs leading-5 text-[#6b6156]">
          <p className="text-sm font-semibold text-[#1f1b19]">推薦 5 位朋友,送你 1 個月 U Plus</p>
          <p className="mt-0.5">朋友點你的連結註冊並完成設定,就算推薦成功。每滿 5 位自動送 1 個月,已經是付費方案會接在到期日之後。</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input readOnly value={url} onFocus={(e) => e.target.select()} className={`${inputClass} min-w-0 flex-1 text-[#6b6156]`} />
        <button type="button" onClick={copy} className="shrink-0 rounded-full bg-[#1f1b19] px-4 py-2.5 text-sm font-medium text-white">
          {copied ? '已複製' : '複製'}
        </button>
      </div>
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span>這一輪 {data.progress} / {data.goal} 位</span>
          <span className="text-xs text-[#a99e8f]">再 {left} 位就送 1 個月</span>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: data.goal }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < data.progress ? 'bg-[#1f1b19]' : 'bg-[#e5ded4]'}`} />
          ))}
        </div>
        <p className="mt-2 text-xs text-[#a99e8f]">累計推薦 {data.count} 位,已獲得 {data.rewards} 個月 U Plus</p>
      </div>
    </Section>
  );
}

// 各平台專屬分享連結:網址帶 ?from=平台,數據分析的流量來源更準確
const SHARE_PLATFORMS: { key: string; label: string; icon: string; where: string }[] = [
  { key: 'instagram', label: 'Instagram', icon: 'instagram', where: '個人簡介、限動連結' },
  { key: 'line', label: 'LINE', icon: 'line', where: '官方帳號、群組訊息' },
  { key: 'facebook', label: 'Facebook', icon: 'facebook', where: '粉專簡介、貼文' },
  { key: 'threads', label: 'Threads', icon: 'threads', where: '個人簡介、貼文' },
  { key: 'tiktok', label: 'TikTok', icon: 'tiktok', where: '個人簡介' },
  { key: 'youtube', label: 'YouTube', icon: 'youtube', where: '頻道簡介、影片說明' },
  { key: 'xiaohongshu', label: '小紅書', icon: 'xiaohongshu', where: '個人簡介' },
];

function ShareLinks({ url }: { url: string }) {
  const [copied, setCopied] = useState('');

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(`${url}?from=${key}`);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? '' : current)), 1800);
    } catch {
      void uiAlert('無法複製,請改用長按手動複製');
    }
  }

  return (
    <section className="rounded-2xl border border-[#ebe4da] bg-white p-4">
      <p className="text-sm font-semibold">各平台分享連結</p>
      <p className="mt-1 text-xs leading-5 text-[#a99e8f]">貼在哪個平台,就複製那個平台的連結,流量來源會統計得更準確。</p>
      <div className="mt-3 divide-y divide-[#f3eee7]">
        {SHARE_PLATFORMS.map((p) => (
          <div key={p.key} className="flex items-center gap-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#efe8dd] text-[#1f1b19]">
              <SocialIcon type={p.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm">{p.label}</span>
              <span className="block truncate text-[11px] text-[#a99e8f]">{p.where}</span>
            </span>
            <button
              type="button"
              onClick={() => copy(p.key)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${copied === p.key ? 'border-[#1f7a44] bg-[#e9f7ee] text-[#1f7a44]' : 'border-[#d7c9bd] text-[#1f1b19] hover:bg-[#f6f2ec]'}`}
            >
              {copied === p.key ? '已複製' : '複製連結'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
