import { TIER_FEATURES, TIERS, type CardTier } from '@/lib/card-plan';

// 四個等級的功能比較表(介紹頁、方案頁共用);手機上可左右滑動
export default function TierTable({ current, promoTier }: { current?: CardTier; promoTier?: CardTier }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#e5ded4] bg-white [scrollbar-width:thin]">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="bg-[#faf7f2] text-left">
            <th className="sticky left-0 z-10 w-[34%] bg-[#faf7f2] px-4 py-3 text-xs font-semibold text-[#6b6156]">功能</th>
            {TIERS.map((t) => (
              <th key={t.key} className={`px-3 py-3 text-xs font-semibold ${t.key === current ? 'text-[#702838]' : 'text-[#1f1b19]'}`}>
                {t.name}
                {t.key === current ? <span className="ml-1 font-normal">(目前)</span> : null}
                {!t.available ? <span className="ml-1 rounded-full bg-[#e9f7ee] px-1.5 py-0.5 text-[10px] font-normal text-[#1f7a44]">聯繫專員</span> : null}
                {promoTier === t.key ? <span className="ml-1 rounded-full bg-[#121b33] px-1.5 py-0.5 text-[10px] font-semibold text-[#dcbc84]">限時免費</span> : null}
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
  );
}
