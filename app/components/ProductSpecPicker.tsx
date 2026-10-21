'use client';

import type { Product } from '@/lib/types';
import { stockOf } from '@/lib/cart-stock';
import { selectSpecOption, specOptionAvailable } from '@/lib/product-selection';

export default function ProductSpecPicker({ product, selected, onChange }: {
  product: Product;
  selected: string[];
  onChange: (selection: string[], option: string) => void;
}) {
  const soldOut = stockOf(product, selected.join(' / ')) <= 0;
  return (
    <div data-product-spec-picker>
      {(product.specs ?? []).map((dim, index) => (
        <section key={dim.name} className="mt-3" data-product-spec={dim.name}>
          <p className="mb-1.5 text-xs text-[var(--c-muted)]">{dim.name}：{selected[index] || '請選擇'}</p>
          <div role="group" aria-label={dim.name} className="flex flex-wrap gap-1.5">
            {dim.options.map((option) => {
              const chosen = selected[index] === option;
              const unavailable = chosen ? soldOut : !specOptionAvailable(product, index, option);
              const image = dim.display === 'image' ? product.color_images?.[option] : '';
              return (
                <button key={option} type="button" title={option} aria-label={option} aria-pressed={chosen}
                  disabled={!chosen && unavailable}
                  onClick={() => onChange(selectSpecOption(product, selected, index, option), option)}
                  className={`relative bg-transparent ${image ? 'h-11 w-11 overflow-hidden p-0' : 'min-w-10 px-3 py-[7px] text-xs! font-semibold'} ${unavailable
                    ? 'spec-sold-out cursor-not-allowed border-[0.5px] border-[var(--c-border)] text-[var(--c-text)] opacity-40'
                    : chosen ? 'border border-[var(--c-sale)] text-[var(--c-sale)]'
                      : 'border-[0.5px] border-[var(--c-border-strong)] text-[var(--c-text)]'}`}>
                  {/* The label remains accessible when the option uses a photo. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : option}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
