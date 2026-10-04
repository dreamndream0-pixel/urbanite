'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  TEMPLATE_CATEGORIES,
  videoEmbedUrl,
  type BlockItem,
  type BlockOptions,
  type BlockType,
  type CardTheme,
  type ProfileCard,
  type ProfileCardBlock,
} from '@/lib/profile-card';
import type { Product } from '@/lib/types';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });

// 上傳前縮圖:頭像裁成正方形,其他圖片限制最長邊;PNG 保留透明
function resizeImage(file: File, max: number, square: boolean): Promise<Blob> {
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
      const png = file.type === 'image/png';
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('圖片處理失敗'))), png ? 'image/png' : 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片讀取失敗')); };
    img.src = url;
  });
}

async function uploadImage(file: File, square = false) {
  const blob = await resizeImage(file, square ? 600 : 1600, square);
  const form = new FormData();
  form.append('file', new File([blob], blob.type === 'image/png' ? 'image.png' : 'image.jpg', { type: blob.type }));
  form.append('productId', 'card');
  form.append('folder', 'profile-card');
  const res = await fetch('/api/products/image', { method: 'POST', body: form });
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

function Pills<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-full px-4 py-2 text-sm transition ${value === o.key ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] bg-white text-[#5f5852] hover:border-[#1f1b19]/30'}`}
        >
          {o.label}
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
  { key: 'content', label: '我的內容', icon: <><rect x="4" y="4" width="16" height="6" rx="2" /><rect x="4" y="14" width="16" height="6" rx="2" /></> },
  { key: 'style', label: '外觀風格', icon: <><path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="8" r="1" /></> },
  { key: 'stats', label: '數據分析', icon: <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" /> },
  { key: 'settings', label: '設定', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></> },
];

// 後台「個人名片」:最上方網址+複製;我的內容 / 外觀風格 / 數據分析 / 設定;即時預覽
export default function ProfileCardManager({ products, lineUrl = '' }: { products: Product[]; lineUrl?: string }) {
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

  useEffect(() => {
    Promise.resolve().then(() => setOrigin(window.location.origin));
    fetch('/api/profile-card', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '讀取失敗');
        setCard(data.card);
        setDraft(data.card);
        setBlocks(data.blocks);
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
    if (!res.ok) return void uiAlert(data.error ?? '新增失敗');
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
                      {BLOCK_TYPES.map((t) => (
                        <button key={t.type} type="button" onClick={() => addBlock(t.type)} className="flex items-start gap-2.5 rounded-xl border border-[#efe8dd] p-3 text-left transition hover:border-[#1f1b19]/30 hover:bg-[#faf7f2]">
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
                    ＋ 新增區塊
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

  const timedPanel = (
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

  return (
    <div className="flex overflow-hidden rounded-2xl border border-[#ebe4da] bg-white">
      <div className="flex items-stretch border-r border-[#f3eee7] bg-[#fcfaf7] px-1.5">{handle}</div>
      <div className="min-w-0 flex-1">
        <div className="flex cursor-pointer items-center gap-3 p-3.5" onClick={onToggleOpen}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f6f2ec] text-[#6b6156]">
            {block.type === 'image' && blockItems(block)[0] ? (
              <img src={blockItems(block)[0].image} alt="" className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <Icon size={17}>{BLOCK_ICON[block.type]}</Icon>
            )}
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
                  {lineUrl ? '留空會使用「系統設定 → 頁尾 → 結帳頁 LINE 設定」的連結。' : '尚未設定官方 LINE,請填網址,或到「系統設定 → 頁尾 → 結帳頁 LINE 設定」設定。'}
                </p>
              </>
            )}
            {block.type === 'divider' && <p className="text-xs text-[#a99e8f]">分隔線沒有內容,可拖曳調整位置。</p>}
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
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-[#ebe4da] bg-white">
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
  const [category, setCategory] = useState<(typeof TEMPLATE_CATEGORIES)[number]['key']>('all');
  // 樣板縮圖只放前幾個區塊,輪播不自動播放
  const sampleBlocks = useMemo(
    () => blocks.slice(0, 5).map((b) => (b.options ? { ...b, options: { ...b.options, autoplay: false } } : b)),
    [blocks],
  );
  const [uploading, setUploading] = useState(false);
  const theme = resolveTheme(draft.theme);
  const setTheme = (patch: Partial<CardTheme>) => setDraft({ ...draft, theme: { ...theme, ...patch } });

  async function uploadBg(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setTheme({ bgType: 'image', bgImage: await uploadImage(file) });
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
        {([['template', '樣板'], ['background', '背景'], ['profile', '簡介樣式'], ['button', '連結樣式']] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`shrink-0 rounded-full px-4 py-2 text-sm transition ${tab === key ? 'bg-[#efe8dd] font-medium text-[#1f1b19]' : 'text-[#8a7f72] hover:bg-[#f6f2ec]'}`}>
            {label}
          </button>
        ))}
        <button type="button" onClick={onPreview} className="ml-auto shrink-0 rounded-full border border-[#d7c9bd] bg-white px-4 py-2 text-sm text-[#6b6156] lg:hidden">預覽</button>
      </div>

      {tab === 'template' ? (
        <section className="rounded-2xl border border-[#ebe4da] bg-white p-4">
          <p className="text-sm leading-6 text-[#6b6156]">挑一個樣板快速套用,之後還能在「背景」「簡介樣式」「連結樣式」再微調。封面照片與大頭照不會被樣板覆蓋。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPLATE_CATEGORIES.map((c) => {
              const count = c.key === 'all' ? CARD_TEMPLATES.length : CARD_TEMPLATES.filter((t) => t.category === c.key).length;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`rounded-full px-4 py-1.5 text-sm transition ${category === c.key ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] text-[#5f5852] hover:border-[#1f1b19]/30'}`}
                >
                  {c.label}({count})
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CARD_TEMPLATES.filter((t) => category === 'all' || t.category === category).map((tpl) => {
              const selected = theme.template === tpl.key;
              return (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => setTheme({ ...tpl.theme, template: tpl.key })}
                  className={`overflow-hidden rounded-2xl border text-left transition ${selected ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/15' : 'border-[#e5ded4] hover:border-[#1f1b19]/30'}`}
                >
                  <MiniPreview card={{ ...draft, theme: { ...theme, ...tpl.theme } }} blocks={sampleBlocks} productMap={productMap} lineUrl={lineUrl} />
                  <div className="flex items-center justify-between border-t border-[#efe8dd] bg-white px-3 py-2">
                    <span className="text-sm">{tpl.name}</span>
                    {selected ? <span className="text-xs text-[#1f7a44]">使用中</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === 'background' ? (
        <Section title="背景">
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
            onChange={(v) => setTheme({ bgType: v })}
          />
          <ColorField label={theme.bgType === 'gradient' ? '漸層上方' : '背景色'} value={theme.bgColor} onChange={(v) => setTheme({ bgColor: v })} />
          {theme.bgType === 'gradient' ? <ColorField label="漸層下方" value={theme.bgColor2} onChange={(v) => setTheme({ bgColor2: v })} /> : null}
          {theme.bgType === 'image' ? (
            <div className="flex items-center gap-3">
              {theme.bgImage ? <img src={theme.bgImage} alt="" className="h-20 w-16 rounded-xl border border-[#efe8dd] object-cover" /> : null}
              <label className="cursor-pointer rounded-full border border-[#d7c9bd] px-4 py-1.5 text-xs font-medium hover:bg-[#f6f2ec]">
                {uploading ? '上傳中…' : theme.bgImage ? '更換背景圖' : '上傳背景圖'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(e) => { void uploadBg(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>
          ) : null}
          <ColorField label="文字顏色" value={theme.textColor} onChange={(v) => setTheme({ textColor: v })} />
          <ColorField label="次要文字" value={theme.mutedColor} onChange={(v) => setTheme({ mutedColor: v })} />
          <ColorField label="重點色(價格等)" value={theme.accentColor} onChange={(v) => setTheme({ accentColor: v })} />
          <div className="flex items-center gap-3 pt-1">
            <span className="text-sm">頂部色塊</span>
            <Toggle on={theme.headerBand} onChange={(v) => setTheme({ headerBand: v })} label="頂部色塊" />
            <span className="ml-auto text-[11px] text-[#a99e8f]">有封面照片時以照片為主</span>
          </div>
          {theme.headerBand ? <ColorField label="色塊顏色" value={theme.bandColor} onChange={(v) => setTheme({ bandColor: v })} /> : null}
        </Section>
      ) : null}

      {tab === 'profile' ? (
        <Section title="簡介樣式">
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">版面配置</p>
            <Pills value={theme.layout} options={PROFILE_LAYOUTS} onChange={(v) => setTheme({ layout: v })} />
            {theme.layout === 'hero' ? <p className="mt-2 text-[11px] text-[#a99e8f]">封面照片會延伸到名稱與簡述後方;沒有封面時改用大頭照。</p> : null}
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">頭像形狀(主照片)</p>
            <Pills value={theme.avatarShape} options={[{ key: 'circle', label: '圓形' }, { key: 'square', label: '方形' }, { key: 'portrait', label: '直式 4:5' }]} onChange={(v) => setTheme({ avatarShape: v })} />
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">文字排列</p>
            <Pills value={theme.align} options={[{ key: 'center', label: '置中' }, { key: 'left', label: '靠左' }]} onChange={(v) => setTheme({ align: v })} />
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">字體</p>
            <Pills value={theme.font} options={FONT_OPTIONS.map((f) => ({ key: f.key, label: f.label }))} onChange={(v) => setTheme({ font: v })} />
          </div>
        </Section>
      ) : null}

      {tab === 'button' ? (
        <Section title="連結樣式">
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">排列方式</p>
            <Pills value={theme.linkStyle} options={LINK_STYLES} onChange={(v) => setTheme({ linkStyle: v })} />
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">形狀</p>
            <Pills value={theme.buttonShape} options={[{ key: 'pill', label: '膠囊' }, { key: 'rounded', label: '圓角' }, { key: 'square', label: '直角' }]} onChange={(v) => setTheme({ buttonShape: v })} />
          </div>
          <div>
            <p className="mb-2 text-xs text-[#8a7f72]">樣式</p>
            <Pills value={theme.buttonFill} options={[{ key: 'solid', label: '實心' }, { key: 'soft', label: '淡色' }, { key: 'outline', label: '外框' }]} onChange={(v) => setTheme({ buttonFill: v })} />
          </div>
          <ColorField label={theme.buttonFill === 'outline' ? '外框顏色' : '按鈕顏色'} value={theme.buttonColor} onChange={(v) => setTheme({ buttonColor: v })} />
          <ColorField label="按鈕文字" value={theme.buttonTextColor} onChange={(v) => setTheme({ buttonTextColor: v })} />
          <div className="flex items-center gap-3">
            <span className="text-sm">陰影</span>
            <Toggle on={theme.buttonShadow} onChange={(v) => setTheme({ buttonShadow: v })} label="按鈕陰影" />
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
type Stats = { days: number; views: number; clicks: number; daily: { day: string; views: number; clicks: number }[]; blocks: Record<string, number>; sources: Record<string, number> };

function StatsPanel({ cardId, url, blocks, productMap }: { cardId: string; url: string; blocks: ProfileCardBlock[]; productMap: Record<string, CardProduct> }) {
  const [days, setDays] = useState<7 | 30>(7);
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
      <Pills value={String(days) as '7' | '30'} options={[{ key: '7', label: '近 7 天' }, { key: '30', label: '近 30 天' }]} onChange={(v) => setDays(v === '30' ? 30 : 7)} />

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
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#ebe4da] bg-white p-4">
        <p className="mb-3 text-sm font-semibold">流量來源</p>
        {sources.length === 0 ? (
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

      <Section title="頁面">
        <div className="flex items-center gap-3">
          <span className="text-sm">公開名片頁</span>
          <Toggle on={draft.published} onChange={(v) => set('published', v)} label="公開名片頁" />
        </div>
        <p className="-mt-2 text-xs leading-5 text-[#a99e8f]">關閉後,訪客會看到「這個頁面暫停中」,管理員仍可預覽。</p>
        <div className="flex items-center gap-3">
          <span className="text-sm">頁尾顯示 URBANITE Logo</span>
          <Toggle on={draft.show_footer_logo !== false} onChange={(v) => set('show_footer_logo', v)} label="頁尾 Logo" />
        </div>
      </Section>
    </div>
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
