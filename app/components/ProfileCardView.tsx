'use client';

import Link from 'next/link';
import SocialIcon from '@/app/components/SocialIcon';
import { isBlockComplete, normalizeUrl, socialUrl, SOCIAL_PLATFORMS, type ProfileCard, type ProfileCardBlock } from '@/lib/profile-card';

export type CardProduct = { id: string; name: string; price: number; original_price: number | null; image: string };

const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });

// 個人名片頁(前台與後台預覽共用)。樣板:米白底、黑色按鈕、酒紅點綴,與官網一致。
export default function ProfileCardView({
  card,
  blocks,
  products,
  logoUrl = '',
  preview = false,
}: {
  card: ProfileCard;
  blocks: ProfileCardBlock[];
  products: Record<string, CardProduct>;
  logoUrl?: string;
  preview?: boolean;
}) {
  const visible = blocks.filter((b) => b.enabled && isBlockComplete(b) && (b.type !== 'product' || products[b.product_id]));
  const socials = card.show_socials ? card.socials.filter((s) => s.value.trim()) : [];

  function track(blockId: string) {
    if (preview) return;
    try {
      navigator.sendBeacon?.('/api/profile-card/click', new Blob([JSON.stringify({ block_id: blockId })], { type: 'application/json' }));
    } catch {
      /* 計數失敗不影響開啟連結 */
    }
  }

  return (
    <div className="min-h-full bg-[#f6f2ec] text-[#1f1b19]">
      <div className="mx-auto flex max-w-[440px] flex-col items-center px-5 pb-10 pt-12">
        {/* 頭像 */}
        <div className="h-24 w-24 overflow-hidden rounded-full border border-[#e5ded4] bg-white">
          {card.avatar_url ? <img src={card.avatar_url} alt={card.display_name} className="h-full w-full object-contain" /> : null}
        </div>

        <h1 className="mt-4 text-center text-[22px] font-semibold tracking-[0.04em]">{card.display_name || card.slug}</h1>

        {card.show_tags && card.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {card.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-[#1f1b19]/15 bg-white/60 px-3 py-1 text-xs text-[#5f5852]">{tag}</span>
            ))}
          </div>
        ) : null}

        {socials.length > 0 ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {socials.map((s, i) => {
              const label = SOCIAL_PLATFORMS.find((p) => p.type === s.type)?.label ?? s.type;
              return (
                <a
                  key={`${s.type}-${i}`}
                  href={socialUrl(s)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1f1b19]/15 bg-white text-[#1f1b19] transition hover:border-[#1f1b19]/40"
                >
                  <SocialIcon type={s.type} />
                </a>
              );
            })}
          </div>
        ) : null}

        {card.show_bio && card.bio ? (
          <p className="mt-4 max-w-[320px] whitespace-pre-line text-center text-sm leading-6 text-[#6b6156]">{card.bio}</p>
        ) : null}

        {card.show_email && card.email ? (
          <a href={`mailto:${card.email}`} className="mt-2 text-xs text-[#8a7f72] underline-offset-2 hover:underline">{card.email}</a>
        ) : null}

        {/* 區塊 */}
        <div className="mt-8 w-full space-y-3">
          {visible.map((b) => {
            if (b.type === 'text') {
              return (
                <p key={b.id} className="flex items-center gap-3 pt-3 text-xs tracking-[0.2em] text-[#8a7f72]">
                  <span className="h-px flex-1 bg-[#1f1b19]/12" />
                  {b.title}
                  <span className="h-px flex-1 bg-[#1f1b19]/12" />
                </p>
              );
            }
            if (b.type === 'image') {
              const img = <img src={b.image} alt={b.title} className="block w-full rounded-2xl border border-[#e5ded4] bg-white object-cover" />;
              return b.url ? (
                <a key={b.id} href={normalizeUrl(b.url)} target="_blank" rel="noreferrer" onClick={() => track(b.id)} className="block">{img}</a>
              ) : (
                <div key={b.id}>{img}</div>
              );
            }
            if (b.type === 'product') {
              const p = products[b.product_id];
              return (
                <Link
                  key={b.id}
                  href={`/products/${encodeURIComponent(p.id)}`}
                  onClick={() => track(b.id)}
                  className="flex items-center gap-3 rounded-2xl border border-[#e5ded4] bg-white p-3 transition hover:border-[#1f1b19]/30"
                >
                  <span className="aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-lg bg-[#f6f2ec]">
                    {p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-sm font-medium leading-5">{b.title || p.name}</span>
                    <span className="mt-1 flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-[#702838]">{formatter.format(p.price)}</span>
                      {p.original_price && p.original_price > p.price ? (
                        <span className="text-xs text-[#b3a897] line-through">{formatter.format(p.original_price)}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[#8a7f72]">查看 →</span>
                </Link>
              );
            }
            return (
              <a
                key={b.id}
                href={normalizeUrl(b.url)}
                target="_blank"
                rel="noreferrer"
                onClick={() => track(b.id)}
                className="relative flex min-h-[56px] items-center justify-center rounded-full bg-[#1f1b19] px-14 py-3 text-center text-sm font-medium leading-5 text-white transition hover:bg-[#3a322e]"
              >
                {b.image ? (
                  <img src={b.image} alt="" className="absolute left-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white object-cover" />
                ) : null}
                {b.title}
              </a>
            );
          })}
        </div>

        {/* 頁尾 */}
        <Link href="/" className="mt-12 flex flex-col items-center gap-1 opacity-70 transition hover:opacity-100">
          {logoUrl ? <img src={logoUrl} alt="URBANITE" className="h-5 w-auto object-contain" /> : <span className="text-xs tracking-[0.3em]">URBANITE</span>}
        </Link>
      </div>
    </div>
  );
}
