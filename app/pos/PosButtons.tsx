'use client';

import Image from 'next/image';
import { canOptimizeStoreImage } from '@/lib/store-image';
import { posMoney, variantKey, type PosButton, type PosProduct } from '@/lib/pos';
import type { StockLocation } from '@/lib/stock-locations';
import { Modal } from './PosPanels';
import { btnDark } from './ui';

// POS 首頁的按鈕(後台「POS・分店」→「POS 按鈕」設定):例如一個品牌一顆
export function ButtonGrid({ buttons, qtyOf, onOpen, onAll }: { buttons: PosButton[]; qtyOf: (b: PosButton) => number; onOpen: (b: PosButton) => void; onAll: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
      {buttons.map((b) => {
        const qty = qtyOf(b);
        return (
          <button key={b.id} type="button" onClick={() => onOpen(b)} style={{ background: b.color }}
            className="relative flex min-h-[104px] min-w-0 flex-col justify-between rounded-2xl p-3.5 text-left text-white shadow-sm active:scale-[0.98]">
            <span className="line-clamp-2 break-words text-lg! font-bold! leading-tight">{b.name}</span>
            <span className="text-xs! opacity-75">{b.productIds.length} 款</span>
            {qty ? <span className="absolute right-2 top-2 grid h-7 min-w-7 place-items-center rounded-full bg-white px-1.5 text-sm! font-bold! text-[#1f1b19]">{qty}</span> : null}
          </button>
        );
      })}
      <button type="button" onClick={onAll} className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-dashed border-[#cdbfae] bg-white p-3.5 text-left active:scale-[0.98]">
        <span className="text-lg! font-bold! leading-tight">全部商品</span>
        <span className="text-xs! text-[#8a7f72]">依分類瀏覽</span>
      </button>
    </div>
  );
}

// 按下按鈕後的彈窗:直接列出每個商品的所有品項(規格),點一下就加入;不關閉,可以連續加
// 品項很多(例:顏色 × 尺寸)的商品,一個顏色一列,後面接尺寸
export function ButtonModal({ button, products, lineQty, onAdd, onClose }: {
  button: PosButton;
  products: PosProduct[];
  lineQty: (productId: string, variant?: string) => number;
  onAdd: (product: PosProduct, variant: string) => void;
  onClose: () => void;
}) {
  const total = products.reduce((n, p) => n + lineQty(p.id), 0);
  return (
    <Modal wide title={button.name} onClose={onClose} footer={
      <button type="button" className={`${btnDark} w-full`} onClick={onClose}>{total ? `完成(已加入 ${total} 件)` : '關閉'}</button>
    }>
      {!products.length ? (
        <p className="py-10 text-center text-sm! text-[#8a7f72]">這顆按鈕還沒有加入商品,請到後台「POS・分店調貨」→「POS 按鈕」設定。</p>
      ) : (
        <div className="space-y-5">
          {products.map((p) => <ProductItems key={p.id} product={p} showName={products.length > 1} lineQty={lineQty} onAdd={onAdd} />)}
        </div>
      )}
    </Modal>
  );
}

function ProductItems({ product: p, showName, lineQty, onAdd }: { product: PosProduct; showName: boolean; lineQty: (productId: string, variant?: string) => number; onAdd: (product: PosProduct, variant: string) => void }) {
  const variants = p.variants ?? [];
  // 一個品項的按鈕:名稱、價格、庫存、已加入數量
  // compact:顏色 × 尺寸的小格子,只放尺寸和庫存(價格和商品不同才顯示)
  const cell = (key: string, label: string, price: number, stock: number, compact = false) => {
    const qty = lineQty(p.id, key);
    const out = stock <= 0;
    return (
      <button key={key || p.id} type="button" onClick={() => onAdd(p, key)}
        className={`relative min-w-0 rounded-xl border text-left active:bg-[#f3ede4] ${compact ? 'px-2 py-2' : 'px-3 py-2.5'} ${qty ? 'border-[#1f1b19] bg-[#faf7f2]' : out ? 'border-[#eee6da] text-[#b3a99b]' : 'border-[#d7c9bd] bg-white'}`}>
        <span className="block break-words text-[15px]! font-semibold! leading-snug">{label}</span>
        {compact ? (
          <span className="mt-0.5 block text-[11px]! leading-tight tabular-nums!">
            {price !== p.price ? <span className="block">{posMoney(price)}</span> : null}
            <span className={out ? 'text-[#c84767]' : 'text-[#8a7f72]'}>{out ? '無庫存' : `剩 ${stock}`}</span>
          </span>
        ) : (
          <span className="mt-1 flex justify-between gap-1 text-xs! tabular-nums!"><span>{posMoney(price)}</span><span className={out ? 'text-[#c84767]' : 'text-[#8a7f72]'}>{out ? '無庫存' : `庫存 ${stock}`}</span></span>
        )}
        {qty ? <span className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-[#1f1b19] px-1.5 text-xs! font-bold! text-white">{qty}</span> : null}
      </button>
    );
  };
  // 顏色 × 尺寸這種多維、品項多的:一個顏色一列
  const grouped = variants.length > 6 && variants.every((v) => v.options.length >= 2);
  const firsts = grouped ? [...new Set(variants.map((v) => v.options[0]))] : [];
  return (
    <section>
      {showName || !variants.length ? (
        <div className="mb-2 flex items-center gap-2">
          {p.image ? <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-[#f3ede4]"><Image src={p.image} alt="" fill sizes="36px" className="object-cover" unoptimized={!canOptimizeStoreImage(p.image)} /></span> : null}
          <p className="min-w-0 truncate text-sm! font-semibold!">{p.name}</p>
        </div>
      ) : null}
      {!variants.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{cell('', p.name, p.price, p.inventory ?? 0)}</div>
      ) : grouped ? (
        <div className="space-y-3">
          {firsts.map((first) => (
            <div key={first}>
              <p className="mb-1 text-sm! font-semibold! text-[#5f5852]">{first}</p>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
                {variants.filter((v) => v.options[0] === first).map((v) => cell(variantKey(v.options), v.options.slice(1).join(' / '), v.price ?? p.price, v.inventory ?? 0, true))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {variants.map((v) => cell(variantKey(v.options), variantKey(v.options), v.price ?? p.price, v.inventory ?? 0))}
        </div>
      )}
    </section>
  );
}

// 切換這台 POS 所在的分店 / 倉庫(庫存、班別、發票號碼都跟著據點)
export function LocationPicker({ locations, current, onPick, onClose }: { locations: StockLocation[]; current: string; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <Modal title="這台 POS 在哪個據點" onClose={onClose}>
      <p className="mb-3 text-sm! text-[#8a7f72]">庫存、班別和發票號碼都依據點分開。選好之後這台裝置會記住。</p>
      <div className="space-y-2">
        {locations.map((l) => (
          <button key={l.id} type="button" onClick={() => onPick(l.id)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left active:bg-[#f3ede4] ${l.id === current ? 'border-[#1f1b19]' : 'border-[#e5ded4]'}`}>
            <span className="text-sm! font-semibold!">{l.name}</span>
            <span className="text-xs! text-[#8a7f72]">{l.kind === 'warehouse' ? '倉庫' : '分店'}{l.id === current ? ' · 目前' : ''}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
