'use client';

import type { BotCard, MessageSet } from '@/lib/line-bot-types';
import type { Discount, Product } from '@/lib/types';

const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });

const SAMPLE_VARS: Record<string, string> = { LINE名稱: '小宇', 會員姓名: '黃小宇', 訂單編號: 'UB20261005001', 訂單金額: 'NT$1,280', 取貨門市: '全家 信義店', 物流單號: '8123456789', 退款金額: 'NT$1,280' };
export const fill = (t: string, vars = SAMPLE_VARS) => t.replace(/\{([^{}]+)\}/g, (m, k) => vars[k] ?? m);

// 手機 LINE 聊天畫面預覽(後台編輯時即時顯示)
export default function LinePreview({
  set,
  brand,
  products = [],
  coupons = [],
  userText,
  logoUrl = '',
  compact = false,
}: {
  set: MessageSet;
  brand: string;
  products?: Product[];
  coupons?: Discount[];
  userText?: string;
  logoUrl?: string;
  compact?: boolean;
}) {
  return (
    <div className={`overflow-hidden rounded-[26px] border-[7px] border-[#1f1b19] bg-[#8fa6c3] ${compact ? '' : 'min-h-[520px]'}`}>
      <div className="flex items-center gap-2 bg-[#2d3b4f] px-3 py-2.5 text-white">
        <span className="text-sm">‹</span>
        <span className="flex-1 truncate text-center text-[13px] font-medium">Urbanite</span>
        <span className="w-3" />
      </div>
      <div className="space-y-2 px-2.5 py-3">
        {userText ? (
          <div className="flex justify-end">
            <span className="max-w-[75%] rounded-2xl rounded-tr-sm bg-[#a4e386] px-3 py-1.5 text-[13px] leading-5 text-[#111]">{userText}</span>
          </div>
        ) : null}
        {set.messages.length === 0 ? <p className="py-8 text-center text-xs text-white/80">還沒有訊息</p> : null}
        {set.messages.map((m, i) => (
          <div key={m.id} className="flex items-start gap-1.5">
            {i === 0 ? (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[9px] font-bold text-[#1f1b19]">
                {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : 'U'}
              </span>
            ) : (
              <span className="w-7 shrink-0" />
            )}
            <div className="min-w-0 max-w-[82%]">
              {m.type === 'text' ? (
                <p className="whitespace-pre-line break-words rounded-2xl rounded-tl-sm bg-white px-3 py-1.5 text-[13px] leading-5 text-[#111]">{fill(m.text) || <span className="text-[#bbb]">(空白)</span>}</p>
              ) : m.type === 'image' ? (
                m.url ? <img src={m.url} alt="" className="max-h-52 rounded-xl object-cover" /> : <Placeholder text="圖片" />
              ) : m.type === 'card' ? (
                <Bubble card={m.card} brand={brand} />
              ) : m.type === 'carousel' ? (
                <Scroller>{m.cards.map((c, j) => <Bubble key={j} card={c} brand={brand} width={180} />)}</Scroller>
              ) : m.type === 'products' ? (
                m.productIds.length ? (
                  <Scroller>
                    {m.productIds.map((id) => {
                      const p = products.find((x) => x.id === id);
                      if (!p) return null;
                      return <Bubble key={id} width={160} brand={brand} tall card={{ image: p.image || p.images?.[0] || '', title: p.name, body: formatter.format(p.price), buttons: [{ label: '查看商品', action: { type: 'url', value: '' } }] }} />;
                    })}
                  </Scroller>
                ) : (
                  <Placeholder text="選擇商品" />
                )
              ) : m.type === 'coupon' ? (
                <CouponBubble coupon={coupons.find((c) => c.id === m.couponId)} brand={brand} />
              ) : (
                <BindBubble />
              )}
            </div>
          </div>
        ))}
        {set.quickReplies.filter(Boolean).length ? (
          <div className="flex gap-1.5 overflow-x-auto pt-1 [scrollbar-width:none]">
            {set.quickReplies.filter(Boolean).map((q) => (
              <span key={q} className="shrink-0 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[11px] text-[#2d3b4f]">{q}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return <div className="flex h-24 w-40 items-center justify-center rounded-xl bg-white/70 text-xs text-[#8a8a8a]">{text}</div>;
}

function Scroller({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">{children}</div>;
}

function Bubble({ card, brand, width = 220, tall = false }: { card: BotCard; brand: string; width?: number; tall?: boolean }) {
  const buttons = card.buttons.filter((b) => b.label.trim()).slice(0, 3);
  return (
    <div className="shrink-0 overflow-hidden rounded-xl bg-white" style={{ width }}>
      {card.image ? <img src={card.image} alt="" className={`w-full object-cover ${tall ? 'aspect-[4/5]' : 'aspect-[20/13]'}`} /> : null}
      <div className="space-y-1 px-3 py-2.5">
        {card.title ? <p className="text-[13px] font-bold leading-5 text-[#1f1b19]">{fill(card.title)}</p> : null}
        {card.body ? <p className="whitespace-pre-line text-[11px] leading-4 text-[#6b6156]">{fill(card.body)}</p> : null}
        {!card.title && !card.body && !card.image ? <p className="text-[11px] text-[#bbb]">(空白卡片)</p> : null}
      </div>
      {buttons.length ? (
        <div className="space-y-1 px-2.5 pb-2.5">
          {buttons.map((b, i) => (
            <span key={i} className={`block rounded-md py-1.5 text-center text-[12px] ${i === 0 ? 'font-semibold text-white' : 'text-[#6b6156]'}`} style={i === 0 ? { background: brand } : undefined}>
              {b.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CouponBubble({ coupon, brand }: { coupon?: Discount; brand: string }) {
  if (!coupon) return <Placeholder text="選擇優惠券" />;
  const value = coupon.type === 'percent' ? `${coupon.value}% OFF` : coupon.type === 'free_shipping' ? '免運' : `折 ${formatter.format(coupon.value)}`;
  return (
    <div className="w-[220px] overflow-hidden rounded-xl bg-white">
      <div className="px-4 py-3">
        <p className="text-[9px] font-bold tracking-wider text-[#a99e8f]">COUPON</p>
        <p className="text-[13px] font-bold text-[#1f1b19]">{coupon.name || coupon.code}</p>
        <p className="mt-1 text-2xl font-bold" style={{ color: brand }}>{value}</p>
        <p className="text-[10px] text-[#8a7f72]">{coupon.min_spend ? `滿 ${formatter.format(coupon.min_spend)} 可用` : '無消費門檻'}</p>
        <div className="my-2 h-px bg-[#eee6db]" />
        <p className="text-[10px] text-[#6b6156]">代碼 {coupon.code}</p>
      </div>
      <div className="px-2.5 pb-2.5">
        <span className="block rounded-md py-1.5 text-center text-[12px] font-semibold text-white" style={{ background: brand }}>領取優惠券</span>
      </div>
    </div>
  );
}

function BindBubble() {
  return (
    <div className="w-[220px] overflow-hidden rounded-xl bg-white">
      <div className="space-y-1 px-3 py-2.5">
        <p className="text-[13px] font-bold text-[#1f1b19]">綁定官網會員</p>
        <p className="text-[11px] leading-4 text-[#6b6156]">第一次來選「新會員」。已經用 Google 或 Email 註冊過的,選「已有官網帳號」。</p>
      </div>
      <div className="space-y-1 px-2.5 pb-2.5">
        <span className="block rounded-md bg-[#06C755] py-1.5 text-center text-[12px] font-semibold text-white">新會員 LINE 一鍵加入</span>
        <span className="block py-1 text-center text-[12px] text-[#6b6156]">已有官網帳號,綁定</span>
      </div>
    </div>
  );
}
