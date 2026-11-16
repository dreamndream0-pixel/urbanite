'use client';

import { useState } from 'react';
import Image from 'next/image';
import { canOptimizeStoreImage } from '@/lib/store-image';
import { posMoney, variantKey, type PosButton, type PosProduct } from '@/lib/pos';
import type { StockLocation } from '@/lib/stock-locations';
import { Modal, VariantChooser } from './PosPanels';
import { btnDark } from './ui';

const priceLabel = (p: PosProduct) => {
  const prices = p.variants?.length ? p.variants.map((v) => v.price ?? p.price) : [p.price];
  const min = Math.min(...prices);
  return `${posMoney(min)}${prices.some((x) => x !== min) ? ' 起' : ''}`;
};

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

// 按下按鈕後的彈窗:先選型號(商品),再選顏色 / 尺寸;加入後不關閉,可以連續加
export function ButtonModal({ button, products, lineQty, onAdd, onClose }: {
  button: PosButton;
  products: PosProduct[];
  lineQty: (productId: string, variant?: string) => number;
  onAdd: (product: PosProduct, variant: string) => void;
  onClose: () => void;
}) {
  const [product, setProduct] = useState<PosProduct | null>(null);
  const total = products.reduce((n, p) => n + lineQty(p.id), 0);
  // 商品資料更新(庫存)後用最新的
  const current = product ? products.find((p) => p.id === product.id) ?? product : null;
  return (
    <Modal wide title={current ? current.name : button.name} onClose={onClose} footer={
      <div className="flex gap-2">
        {current ? <button type="button" className="rounded-xl border border-[#d7c9bd] bg-white px-4 py-2.5 text-sm! font-semibold!" onClick={() => setProduct(null)}>← 回{button.name}</button> : null}
        <button type="button" className={`${btnDark} flex-1`} onClick={onClose}>{total ? `完成(已加入 ${total} 件)` : '關閉'}</button>
      </div>
    }>
      {current ? (
        <VariantChooser product={current} qtyOf={(v) => lineQty(current.id, v)} onPick={(v) => onAdd(current, v)} />
      ) : !products.length ? (
        <p className="py-10 text-center text-sm! text-[#8a7f72]">這顆按鈕還沒有加入商品,請到後台「POS・分店」→「POS 按鈕」設定。</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {products.map((p) => {
            const qty = lineQty(p.id);
            const out = (p.inventory ?? 0) <= 0;
            const single = !p.variants?.length || p.variants.length === 1;
            return (
              <button key={p.id} type="button" onClick={() => (single ? onAdd(p, p.variants?.length ? variantKey(p.variants[0].options) : '') : setProduct(p))}
                className={`relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white text-left active:scale-[0.98] ${qty ? 'border-[#1f1b19]' : 'border-[#e5ded4]'} ${out ? 'opacity-55' : ''}`}>
                <span className="relative block aspect-[4/3] w-full bg-[#f3ede4]">
                  {p.image ? <Image src={p.image} alt="" fill sizes="(min-width: 640px) 200px, 45vw" className="object-cover" unoptimized={!canOptimizeStoreImage(p.image)} /> : null}
                  {qty ? <span className="absolute right-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-[#1f1b19] px-1.5 text-xs! font-bold! text-white">{qty}</span> : null}
                </span>
                <span className="block px-2 pb-2 pt-1.5">
                  <span className="line-clamp-2 min-h-[2.5em] text-[13px]! font-medium! leading-tight">{p.name}</span>
                  <span className="mt-1 flex items-baseline justify-between gap-1">
                    <span className="truncate text-sm! font-bold! tabular-nums!">{priceLabel(p)}</span>
                    <span className={`shrink-0 text-[11px]! tabular-nums! ${out ? 'text-[#c84767]' : 'text-[#8a7f72]'}`}>{out ? '無庫存' : `庫存 ${p.inventory}`}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
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
