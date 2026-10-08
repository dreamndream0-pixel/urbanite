'use client';

import { useId, useState } from 'react';
import { TIER_FEATURES, TIERS, tierRank, type CardTier } from '@/lib/card-plan';

// 四個等級的功能比較表(介紹頁、方案頁共用);手機上可左右滑動
export default function TierTable({ current, promoTier }: { current?: CardTier; promoTier?: CardTier }) {
  const [selected, setSelected] = useState<CardTier>(current ?? 'plus');
  const selectId = useId();
  const index = TIERS.findIndex(tier => tier.key === selected);
  return (
    <>
    <div className="md:hidden">
      <div className="flex items-center justify-between gap-4 border-b border-[#d5cec2] py-4">
        <label htmlFor={selectId}>比較方案</label>
        <select id={selectId} value={selected} onChange={event => setSelected(event.target.value as CardTier)} className="rounded border border-[#cfc6b9] bg-white px-4 py-3">
          {TIERS.map(tier => <option key={tier.key} value={tier.key}>{tier.name}{current === tier.key ? '（目前）' : ''}</option>)}
        </select>
      </div>
      {promoTier && selected !== 'free' && tierRank(selected) <= tierRank(promoTier) && <p className="py-3 text-sm text-[#52684c]">限時免費</p>}
      {TIER_FEATURES.map(group => <section key={group.group} className="py-4">
        <h3 className="mb-2 text-sm font-semibold">{group.group}</h3>
        <dl>{group.rows.map(row => <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_minmax(90px,0.8fr)] gap-4 border-b border-[#e5ded4] py-3 text-sm">
          <dt>{row.label}</dt><dd className="text-right">{row.values[index] === '✓' ? '包含' : row.values[index] === '—' ? '不包含' : row.values[index]}</dd>
        </div>)}</dl>
      </section>)}
    </div>
    <div className="hidden overflow-x-auto rounded-lg border border-[#e5ded4] bg-white [scrollbar-width:thin] md:block" role="region" aria-label="四方案功能比較" tabIndex={0}>
      <table className="w-full min-w-[880px] table-fixed border-collapse text-sm">
        <thead>
          <tr className="bg-[#faf7f2] text-left">
            <th className="sticky left-0 z-10 w-[200px] bg-[#faf7f2] px-4 py-3 text-xs font-semibold text-[#6b6156]">功能</th>
            {TIERS.map((t) => (
              <th key={t.key} className={`px-3 py-3 text-xs font-semibold ${t.key === current ? 'text-[#702838]' : 'text-[#1f1b19]'}`}>
                {t.name}
                {t.key === current ? <span className="ml-1 font-normal">(目前)</span> : null}
                {!t.available ? <span className="ml-1 rounded-full bg-[#e9f7ee] px-1.5 py-0.5 text-[10px] font-normal text-[#1f7a44]">聯繫專員</span> : null}
                {promoTier && t.key !== 'free' && tierRank(t.key) <= tierRank(promoTier) ? <span className="ml-1 rounded-full bg-[#121b33] px-1.5 py-0.5 text-[10px] font-semibold text-[#dcbc84]">限時免費</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        {TIER_FEATURES.map((g) => (
          <tbody key={g.group}>
            <tr>
              <td colSpan={5} className="border-t border-[#e5ded4] bg-[#fcfaf7] px-4 pb-1.5 pt-3 text-[11px] font-semibold tracking-[0.15em] text-[#a99e8f]">{g.group}</td>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.label} className="border-t border-[#f3eee7]">
                <td className="sticky left-0 bg-white px-4 py-2.5 text-[#1f1b19]">{r.label}</td>
                {r.values.map((v, i) => (
                  <td key={i} className={`px-3 py-2.5 ${v === '—' ? 'text-[#c9bcad]' : 'text-[#1f1b19]'}`}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
    </>
  );
}
