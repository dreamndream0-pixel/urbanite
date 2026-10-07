'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import ContactLineButton from '@/app/card/ContactLineButton';
import { PERIODS, tierInfo, tierRank, TIERS, type CardPeriod, type CardPlanInfo, type CardTier, type PaidTier } from '@/lib/card-plan';

type Payment = { order_no: string; tier: string; period: string; amount: number; paid_at: string | null };

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '');

export default function UpgradeClient({ plan, payments, result, table, lineUrl, promo = null }: { plan: CardPlanInfo; payments: Payment[]; result: string; table: ReactNode; lineUrl: string; promo?: { tier: string; end: string } | null }) {
  const inPromo = (key: string) => Boolean(promo && tierRank(key as CardTier) <= tierRank(promo.tier as CardTier));
  // 自己組字串(台灣時間),避免伺服器和瀏覽器的日期格式不同造成畫面不一致
  const promoEnd = promo ? (() => { const d = new Date(new Date(promo.end).getTime() + 8 * 3600000); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; })() : '';
  const buyable = TIERS.filter((t) => t.key !== 'free');
  const [tier, setTier] = useState<PaidTier>(plan.tier === 'free' ? 'plus' : (plan.tier as PaidTier));
  const [period, setPeriod] = useState<CardPeriod>('year');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = tierInfo(tier);
  const price = chosen.prices?.[period] ?? 0;
  const action = plan.tier === tier ? '續約' : tierRank(tier) > tierRank(plan.tier) ? '升級' : '改為';

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/card-plan/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier, period }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '無法建立付款');
      // 送往藍新付款頁
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = data.action;
      for (const [k, v] of Object.entries(data.params as Record<string, string>)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = k;
        input.value = v;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      setError(e instanceof Error ? e.message : '無法建立付款');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {result === 'success' ? (
        <p className="mb-6 rounded-xl border border-[#cfe9d6] bg-[#f3fbf5] px-4 py-3 text-sm text-[#1f5a33]">付款完成,方案已經開通。回到「我的名片」就能使用新功能。</p>
      ) : result === 'fail' ? (
        <p className="mb-6 rounded-xl border border-[#e8c4c4] bg-[#fbf3f0] px-4 py-3 text-sm text-[#a33a2b]">付款沒有完成。如果已經扣款,通常幾分鐘內會自動開通,重新整理這頁就能看到。</p>
      ) : null}

      <h1 className="font-serif-tc text-2xl font-bold tracking-[0.06em]">方案</h1>
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-1 rounded-2xl border border-[#e5ded4] bg-white p-5">
        <div>
          <p className="text-xs text-[#8a7f72]">目前方案</p>
          <p className="mt-1 text-xl font-semibold">{tierInfo(plan.tier).name}</p>
        </div>
        <p className="text-sm text-[#6b6156]">
          {plan.isAdmin ? '管理員帳號,所有功能都已開啟。' : plan.promo ? `限時免費中,${promoEnd} 結束後回到 U Free。想繼續使用可以先購買,付費期間從今天開始算。` : plan.tier !== 'free' ? `${date(plan.expiresAt)} 到期,到期後自動回到 U Free。` : '免費個人名片。升級後解鎖更多功能。'}
        </p>
      </div>

      {!plan.isAdmin ? (
        <section className="mt-6 rounded-2xl border border-[#e5ded4] bg-white p-5">
          <p className="text-base font-semibold">選擇方案</p>
          <p className="mt-1 text-xs text-[#a99e8f]">預付制,不會自動扣款。同方案續約會接在目前到期日之後;換成更高等級從付款當天起算。</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {buyable.map((t) => {
              const on = tier === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTier(t.key as PaidTier)}
                  className={`rounded-xl border p-4 text-left transition ${on ? 'border-[#1f1b19] bg-[#faf7f2]' : 'border-[#e5ded4] hover:border-[#1f1b19]/30'}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{t.name}</span>
                    {!t.available && !inPromo(t.key) ? <span className="rounded-full bg-[#e9f7ee] px-2 py-0.5 text-[10px] text-[#1f7a44]">聯繫專員</span> : null}
                    {inPromo(t.key) ? <span className="rounded-full bg-[#121b33] px-2 py-0.5 text-[10px] font-semibold text-[#dcbc84]">限時免費</span> : !t.available ? null : plan.tier === t.key ? <span className="text-[10px] text-[#1f7a44]">目前方案</span> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-[#8a7f72]">{t.tagline}</span>
                  {inPromo(t.key) ? (
                    <span className="mt-2 block">
                      <span className="text-lg font-bold text-[#702838]">限時免費</span>
                      <span className="ml-2 text-xs text-[#a99e8f] line-through">NT${t.prices?.month} / 月</span>
                      <span className="block text-[11px] text-[#8a7f72]">至 {promoEnd}</span>
                    </span>
                  ) : (
                    <span className="mt-2 block text-lg font-bold">NT${t.prices?.month}<span className="text-xs font-normal text-[#8a7f72]"> / 月</span></span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(PERIODS) as CardPeriod[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                className={`rounded-full px-4 py-2 text-sm transition ${period === k ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] text-[#5f5852]'}`}
              >
                {PERIODS[k].label} NT${chosen.prices?.[k].toLocaleString()}
                {k === 'year' && chosen.prices ? <span className="ml-1 text-[11px] opacity-70">(省 NT${(chosen.prices.month * 12 - chosen.prices.year).toLocaleString()})</span> : null}
              </button>
            ))}
          </div>

          {error ? <p className="mt-3 text-sm text-[#c0392b]">{error}</p> : null}
          {inPromo(tier) ? (
            <p className="mt-5 rounded-xl bg-[#fbf6ec] px-4 py-3 text-center text-sm text-[#6b4a1f]">
              {chosen.name} 限時免費中,現在就能使用,不用付款。{chosen.available ? '想在活動結束後繼續使用,可以先購買。' : ''}
            </p>
          ) : null}
          {chosen.available ? (
            <>
              <button type="button" onClick={pay} disabled={busy} className="mt-5 w-full rounded-full bg-[#1f1b19] py-3 text-sm font-semibold text-white transition hover:bg-[#3a322e] disabled:opacity-50">
                {busy ? '前往付款頁…' : `${action} ${chosen.name}・付款 NT$${price.toLocaleString()}`}
              </button>
              <p className="mt-2 text-center text-[11px] text-[#a99e8f]">付款由藍新金流處理,可用信用卡、ATM、超商代碼等方式</p>
            </>
          ) : inPromo(tier) ? null : (
            <>
              <ContactLineButton href={lineUrl} className="mt-5 py-3 text-sm" />
              <p className="mt-2 text-center text-[11px] text-[#a99e8f]">{chosen.name} 由專員協助開通,加入官方 LINE 告訴我們你的需求</p>
            </>
          )}
        </section>
      ) : null}

      <section className="mt-6">
        <p className="mb-3 text-sm font-semibold">方案比較</p>
        {table}
      </section>

      {payments.length ? (
        <section className="mt-6 rounded-2xl border border-[#e5ded4] bg-white p-5">
          <p className="text-sm font-semibold">付款紀錄</p>
          <div className="mt-3 divide-y divide-[#f3eee7] text-sm">
            {payments.map((p) => (
              <div key={p.order_no} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[#6b6156]">{p.order_no}</span>
                <span>{tierInfo(p.tier as PaidTier).name} {PERIODS[p.period as CardPeriod]?.label ?? p.period}</span>
                <span className="w-20 text-right">NT${p.amount.toLocaleString()}</span>
                <span className="w-24 text-right text-xs text-[#a99e8f]">{date(p.paid_at)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-8 text-center">
        <Link href="/mycard" className="text-sm text-[#6b6156] underline underline-offset-2">回到我的名片</Link>
      </p>
    </div>
  );
}
