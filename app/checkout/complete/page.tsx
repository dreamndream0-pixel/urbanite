'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ShopHeader from '@/app/components/ShopHeader';
import { useShopHome } from '@/lib/shop-home';
import LineContactCard from '@/app/components/LineContactCard';

type OrderStatus = {
  order_no: string;
  paid: boolean;
  status: string;
  total: number;
  payment_method?: string;
};

function CompleteInner() {
  const sp = useSearchParams();
  const orderNo = sp.get('order_no') || '';
  const hintStatus = sp.get('status') || ''; // paid / fail(來自藍新導回)
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(() => Boolean(orderNo));

  useEffect(() => {
    if (!orderNo) {
      return;
    }
    let tries = 0;
    let stop = false;
    async function poll() {
      try {
        const res = await fetch(`/api/orders/status?order_no=${encodeURIComponent(orderNo)}`);
        if (res.ok) {
          const data = (await res.json()) as OrderStatus;
          setOrder(data);
          // 已付款就停止;否則在導回顯示 paid 時,輪詢幾次等 ReturnURL 入帳
          if (data.paid || hintStatus !== 'paid' || tries >= 5) {
            setLoading(false);
            return;
          }
        }
      } catch {
        /* 忽略,續試 */
      }
      tries += 1;
      if (!stop && tries <= 5) setTimeout(poll, 1500);
      else setLoading(false);
    }
    poll();
    return () => {
      stop = true;
    };
  }, [orderNo, hintStatus]);

  const shopHome = useShopHome();
  const paid = order?.paid ?? false;
  const failed = hintStatus === 'fail' && !paid;

  return (
    <main className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)]">
      <ShopHeader leftLabel="← 回商店" />

      <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
        <div className="rounded-2xl bg-[var(--c-surface)] p-8 text-center shadow-sm">
          {loading ? (
            <>
              <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-[3px] border-[var(--c-border)] border-t-[var(--c-sale)]" />
              <p className="text-[var(--c-text2)]">確認付款結果中…</p>
            </>
          ) : paid ? (
            <>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#e9f7ee] text-[#1f7a44]">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-lg font-semibold text-[#1f7a44]">付款成功,訂單成立!</p>
              {orderNo && <p className="mt-2 text-[var(--c-text2)]">單號:{orderNo}</p>}
              <p className="mt-1 text-sm text-[var(--c-muted)]">我們會盡快為你備貨,感謝購買。</p>
            </>
          ) : failed ? (
            <>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fdecec] text-[#c0392b]">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </div>
              <p className="text-lg font-semibold text-[#c0392b]">付款未完成</p>
              {orderNo && <p className="mt-2 text-[var(--c-text2)]">單號:{orderNo}</p>}
              <p className="mt-1 text-sm text-[var(--c-muted)]">訂單已保留,你可以重新付款或改用其他方式。</p>
              {orderNo && (
                <a
                  href={`/api/payment/newebpay/checkout?order=${encodeURIComponent(orderNo)}`}
                  className="mt-5 inline-block rounded-full bg-[var(--c-sale)] px-6 py-3 font-semibold text-white"
                >
                  重新付款
                </a>
              )}
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">訂單已成立</p>
              {orderNo && <p className="mt-2 text-[var(--c-text2)]">單號:{orderNo}</p>}
              <p className="mt-1 text-sm text-[var(--c-muted)]">
                {order && !order.paid ? '款項尚未入帳,若已付款請稍候更新。' : '感謝購買。'}
              </p>
            </>
          )}

          {!loading && !failed && <LineContactCard />}

          <Link
            href={shopHome}
            className="mt-6 inline-block rounded-full border border-[var(--c-text)] px-6 py-3 font-semibold"
          >
            繼續購物
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function CompletePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--c-bg)]" />}>
      <CompleteInner />
    </Suspense>
  );
}
