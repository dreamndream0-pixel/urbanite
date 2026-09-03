'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ShopHeader from '@/app/components/ShopHeader';

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
  const hintStatus = sp.get('status') || ''; // paid / fail(來自綠界導回)
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

  const paid = order?.paid ?? false;
  const failed = hintStatus === 'fail' && !paid;

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <ShopHeader leftLabel="← 回商店" />

      <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          {loading ? (
            <>
              <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-[3px] border-[#e5ded4] border-t-[#c84767]" />
              <p className="text-[#6b6156]">確認付款結果中…</p>
            </>
          ) : paid ? (
            <>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#e9f7ee] text-2xl">
                ✓
              </div>
              <p className="text-lg font-semibold text-[#1f7a44]">付款成功,訂單成立!</p>
              {orderNo && <p className="mt-2 text-[#6b6156]">單號:{orderNo}</p>}
              <p className="mt-1 text-sm text-[#8a7f72]">我們會盡快為你備貨,感謝購買。</p>
            </>
          ) : failed ? (
            <>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fdecec] text-2xl">
                ✕
              </div>
              <p className="text-lg font-semibold text-[#c0392b]">付款未完成</p>
              {orderNo && <p className="mt-2 text-[#6b6156]">單號:{orderNo}</p>}
              <p className="mt-1 text-sm text-[#8a7f72]">訂單已保留,你可以重新付款或改用其他方式。</p>
              {orderNo && (
                <a
                  href={`/api/payment/ecpay/checkout?order=${encodeURIComponent(orderNo)}`}
                  className="mt-5 inline-block rounded-full bg-[#c84767] px-6 py-3 font-semibold text-white"
                >
                  重新付款
                </a>
              )}
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">訂單已成立</p>
              {orderNo && <p className="mt-2 text-[#6b6156]">單號:{orderNo}</p>}
              <p className="mt-1 text-sm text-[#8a7f72]">
                {order && !order.paid ? '款項尚未入帳,若已付款請稍候更新。' : '感謝購買。'}
              </p>
            </>
          )}

          <Link
            href="/"
            className="mt-6 inline-block rounded-full border border-[#1f1b19] px-6 py-3 font-semibold"
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
    <Suspense fallback={<main className="min-h-screen bg-[#f6f2ec]" />}>
      <CompleteInner />
    </Suspense>
  );
}
