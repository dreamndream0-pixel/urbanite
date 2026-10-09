'use client';

import { useEffect, useState } from 'react';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

type ShopRow = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  owner_email: string;
  products: number;
  orders: number;
  created_at: string;
};

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'urbanite.com.tw';
const shopHref = (slug: string) => (slug === 'urbanite' ? `https://www.${ROOT}` : `https://${slug}.${ROOT}`);
const day = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

// 平台後台:所有店家(停用 / 恢復、方案)
export default function ShopsManager() {
  const [shops, setShops] = useState<ShopRow[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/admin/shops', { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '讀取失敗');
      setShops(d.shops);
    } catch (e) {
      setError(e instanceof Error ? e.message : '讀取失敗');
    }
  }
  useEffect(() => {
    Promise.resolve().then(load);
  }, []);

  async function patch(shop: ShopRow, update: Partial<Pick<ShopRow, 'status' | 'plan'>>) {
    if (update.status === 'suspended' && !(await uiConfirm(`停用「${shop.name || shop.slug}」?停用後客人打開會看到「這家店暫停營業中」,店主也無法進後台。`, { danger: true }))) return;
    const res = await fetch('/api/admin/shops', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: shop.id, ...update }) });
    const d = await res.json();
    if (!res.ok) return void uiAlert(d.error ?? '更新失敗');
    setShops((list) => (list ?? []).map((s) => (s.id === shop.id ? { ...s, ...d } : s)));
  }

  if (error) return <p className="rounded-xl bg-[#fbf3f0] p-4 text-sm text-[#a33a2b]">{error}</p>;
  if (!shops) return <p className="py-10 text-center text-sm text-[#a99e8f]">載入中…</p>;
  const q = query.trim().toLowerCase();
  const list = q ? shops.filter((s) => `${s.slug} ${s.name} ${s.owner_email}`.toLowerCase().includes(q)) : shops;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold">店家管理</h2>
          <p className="text-xs text-[#8a7f72]">共 {shops.length} 家店 · 啟用中 {shops.filter((s) => s.status === 'active').length} 家</p>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋店名、網址、店主 email" className="ml-auto w-full rounded-full border border-[#e5ded4] bg-white px-4 py-2 text-sm outline-none focus:border-[#1f1b19] sm:w-72" />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-[#e5ded4] bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[#faf7f2] text-left text-xs text-[#8a7f72]">
            <tr>
              <th className="px-4 py-3 font-medium">店家</th>
              <th className="px-4 py-3 font-medium">店主</th>
              <th className="px-4 py-3 font-medium">方案</th>
              <th className="px-4 py-3 text-right font-medium">商品</th>
              <th className="px-4 py-3 text-right font-medium">訂單</th>
              <th className="px-4 py-3 font-medium">開店日</th>
              <th className="px-4 py-3 font-medium">狀態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3eee7]">
            {list.map((s) => {
              const platform = s.slug === 'urbanite';
              return (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#1f1b19]">{s.name || s.slug}</p>
                    <a href={shopHref(s.slug)} target="_blank" rel="noreferrer" className="text-xs text-[#6b6156] underline underline-offset-2">
                      {platform ? `www.${ROOT}` : `${s.slug}.${ROOT}`}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#5f5852]">{platform ? '平台' : s.owner_email || '—'}</td>
                  <td className="px-4 py-3">
                    {platform ? (
                      <span className="text-xs text-[#8a7f72]">平台</span>
                    ) : (
                      <select value={s.plan} onChange={(e) => void patch(s, { plan: e.target.value })} className="rounded-lg border border-[#e5ded4] bg-white px-2 py-1 text-xs">
                        <option value="pro">U Pro(匯款 / 自行寄件)</option>
                        <option value="max">U Max</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.products}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.orders}</td>
                  <td className="px-4 py-3 text-xs text-[#8a7f72]">{day(s.created_at)}</td>
                  <td className="px-4 py-3">
                    {platform ? (
                      <span className="text-xs text-[#1f7a44]">營運中</span>
                    ) : s.status === 'active' ? (
                      <button type="button" onClick={() => void patch(s, { status: 'suspended' })} className="rounded-full bg-[#e9f7ee] px-3 py-1 text-xs text-[#1f7a44] hover:bg-[#fbeaea] hover:text-[#a33a2b]">
                        營運中 · 停用
                      </button>
                    ) : (
                      <button type="button" onClick={() => void patch(s, { status: 'active' })} className="rounded-full bg-[#fbeaea] px-3 py-1 text-xs text-[#a33a2b] hover:bg-[#e9f7ee] hover:text-[#1f7a44]">
                        已停用 · 恢復
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
