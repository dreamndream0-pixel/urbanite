'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import ProfileCardView, { type CardProduct } from '@/app/components/ProfileCardView';
import SocialIcon from '@/app/components/SocialIcon';
import {
  BIO_LIMIT,
  BLOCK_TYPES,
  cardPath,
  isBlockComplete,
  MAX_TAGS,
  SLUG_PATTERN,
  SOCIAL_PLATFORMS,
  TAG_SUGGESTIONS,
  type BlockType,
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

const inputClass = 'w-full rounded-xl border border-[#e5ded4] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#1f1b19]/40';

// 後台「個人名片」:最上方網址+複製、連結區塊、個人簡介、即時預覽
export default function ProfileCardManager({ products }: { products: Product[] }) {
  const [card, setCard] = useState<ProfileCard | null>(null);
  const [draft, setDraft] = useState<ProfileCard | null>(null);
  const [blocks, setBlocks] = useState<ProfileCardBlock[]>([]);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<'links' | 'profile'>('links');
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
  const profileDirty = JSON.stringify(card) !== JSON.stringify(draft);

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
    if (!res.ok) void uiAlert((await res.json()).error ?? '儲存失敗');
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

  // ---------- 個人簡介 ----------
  async function saveProfile() {
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

  const preview = <ProfileCardView card={draft} blocks={blocks} products={productMap} preview />;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-6">
      <div className="space-y-4">
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

        {/* 分頁 */}
        <div className="flex items-center gap-2">
          {([['links', '連結'], ['profile', '個人簡介']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${tab === key ? 'bg-[#1f1b19] text-white' : 'bg-[#efe8dd] text-[#6b6156] hover:bg-[#e7dfd2]'}`}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setPreviewOpen(true)} className="ml-auto rounded-full border border-[#d7c9bd] bg-white px-4 py-2 text-sm text-[#6b6156] lg:hidden">
            預覽
          </button>
        </div>

        {tab === 'links' ? (
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

        {tab === 'profile' ? (
          <div className="sticky bottom-3 flex justify-center pt-2">
            <button
              type="button"
              onClick={saveProfile}
              disabled={saving || !profileDirty}
              className="w-full max-w-xs rounded-full bg-[#1f1b19] py-3 text-sm font-semibold text-white shadow-lg transition disabled:opacity-40"
            >
              {saving ? '儲存中…' : profileDirty ? '儲存' : '已儲存'}
            </button>
          </div>
        ) : null}
      </div>

      {/* 桌機即時預覽 */}
      <aside className="sticky top-24 hidden lg:block">
        <p className="mb-2 text-center text-xs text-[#a99e8f]">即時預覽</p>
        <div className="mx-auto h-[680px] w-[340px] overflow-y-auto rounded-[36px] border-[10px] border-[#1f1b19] bg-[#f6f2ec]">{preview}</div>
      </aside>

      {/* 手機預覽 */}
      {previewOpen ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-[#f6f2ec]">
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
  const [order, setOrder] = useState(blocks);
  const [dragId, setDragId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const orderRef = useRef(order);
  useEffect(() => { if (!dragId) { setOrder(blocks); orderRef.current = blocks; } }, [blocks, dragId]);

  function onMove(clientY: number) {
    if (!dragId) return;
    const list = orderRef.current;
    const from = list.findIndex((b) => b.id === dragId);
    let to = from;
    list.forEach((b, i) => {
      const el = rowRefs.current.get(b.id);
      if (!el || b.id === dragId) return;
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (i < from && clientY < mid) to = Math.min(to, i);
      if (i > from && clientY > mid) to = Math.max(to, i);
    });
    if (to !== from) {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      orderRef.current = next;
      setOrder(next);
    }
  }

  function end() {
    if (!dragId) return;
    setDragId(null);
    const changed = orderRef.current.some((b, i) => b.id !== blocks[i]?.id);
    if (changed) onReorder(orderRef.current);
  }

  return (
    <div className="space-y-2.5" onPointerMove={(e) => onMove(e.clientY)} onPointerUp={end} onPointerCancel={end}>
      {order.map((b) => {
        const handle = (
          <span
            role="button"
            aria-label="拖曳排序"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDragId(b.id); }}
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
  onToggleOpen: () => void;
  onPatch: (patch: Partial<ProfileCardBlock>) => void;
  onLocalChange: (patch: Partial<ProfileCardBlock>) => void;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const complete = isBlockComplete(block);
  const typeLabel = BLOCK_TYPES.find((t) => t.type === block.type)?.label ?? '';
  const product = block.product_id ? productMap[block.product_id] : undefined;
  const title = block.type === 'product' ? block.title || product?.name || '' : block.title;

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

  return (
    <div className="flex overflow-hidden rounded-2xl border border-[#ebe4da] bg-white">
      <div className="flex items-stretch border-r border-[#f3eee7] bg-[#fcfaf7] px-1.5">{handle}</div>
      <div className="min-w-0 flex-1">
        <div className="flex cursor-pointer items-center gap-3 p-3.5" onClick={onToggleOpen}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f6f2ec] text-[#6b6156]">
            {block.type === 'image' && block.image ? (
              <img src={block.image} alt="" className="h-9 w-9 rounded-xl object-cover" />
            ) : (
              <Icon size={17}>{BLOCK_ICON[block.type]}</Icon>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm ${title ? 'text-[#1f1b19]' : 'text-[#b3a897]'}`}>{title || `未命名的${typeLabel}`}</p>
            <p className="text-[11px] text-[#a99e8f]">
              {typeLabel}
              {block.type !== 'text' && block.clicks > 0 ? ` · ${block.clicks} 次點擊` : ''}
            </p>
          </div>
          {complete ? (
            <Toggle on={block.enabled} onChange={(v) => onPatch({ enabled: v })} label="顯示" />
          ) : (
            <span className="shrink-0 text-xs text-[#c84767]">草稿</span>
          )}
        </div>

        {open ? (
          <div className="space-y-3 border-t border-[#f3eee7] px-3.5 pb-3.5 pt-3">
            {block.type === 'link' && (
              <>
                {field('title', '標題', '例如:官方網站|全館商品')}
                {field('url', '網址', 'urbanite.com.tw')}
              </>
            )}
            {block.type === 'text' && field('title', '文字', '例如:—— 本週新品 ——')}
            {block.type === 'image' && (
              <>
                {field('url', '點擊後前往(選填)', 'urbanite.com.tw/promo/…')}
                {field('title', '圖片說明(選填)', '例如:秋季新品')}
              </>
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

            {(block.type === 'link' || block.type === 'image') && (
              <div className="flex items-center gap-3">
                {block.image ? <img src={block.image} alt="" className="h-12 w-12 rounded-xl border border-[#efe8dd] object-cover" /> : null}
                <label className="cursor-pointer rounded-full border border-[#d7c9bd] px-3.5 py-1.5 text-xs font-medium text-[#1f1b19] hover:bg-[#f6f2ec]">
                  {uploading ? '上傳中…' : block.image ? '更換圖片' : block.type === 'link' ? '加上縮圖(選填)' : '上傳圖片'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {block.image && block.type === 'link' ? (
                  <button type="button" onClick={() => onPatch({ image: '' })} className="text-xs text-[#8a7f72]">移除縮圖</button>
                ) : null}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button type="button" onClick={onDelete} className="text-xs text-[#c0392b] hover:underline">刪除區塊</button>
            </div>
          </div>
        ) : null}
      </div>
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

function ProfileEditor({ draft, setDraft }: { draft: ProfileCard; setDraft: (c: ProfileCard) => void }) {
  const [uploading, setUploading] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const set = <K extends keyof ProfileCard>(key: K, value: ProfileCard[K]) => setDraft({ ...draft, [key]: value });
  const unused = SOCIAL_PLATFORMS.filter((p) => !draft.socials.some((s) => s.type === p.type));
  const [adding, setAdding] = useState(false);

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
      <Section title="大頭照及名稱">
        <div className="flex items-center gap-4">
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
          <textarea
            value={draft.bio}
            maxLength={BIO_LIMIT}
            rows={3}
            onChange={(e) => set('bio', e.target.value)}
            placeholder="一句話讓大家知道你是誰"
            className={`${inputClass} resize-none leading-6`}
          />
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
              <input
                value={s.value}
                onChange={(e) => set('socials', draft.socials.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))}
                placeholder={platform?.placeholder}
                className={inputClass}
              />
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
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`rounded-xl border px-3 py-2 text-sm transition ${draft.tags.includes(tag) ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#e5ded4] text-[#5f5852] hover:border-[#1f1b19]/30'}`}
            >
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

      <Section title="頁面狀態" defaultOpen={false}>
        <div className="flex items-center gap-3">
          <span className="text-sm">公開名片頁</span>
          <Toggle on={draft.published} onChange={(v) => set('published', v)} label="公開名片頁" />
        </div>
        <p className="text-xs leading-5 text-[#a99e8f]">關閉後,訪客會看到「這個頁面暫停中」,管理員仍可預覽。</p>
      </Section>
    </div>
  );
}
