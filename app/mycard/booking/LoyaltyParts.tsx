'use client';

import { useCallback, useEffect, useState } from 'react';
import { uiAlert, uiConfirm, uiPrompt } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { formatDateTime, money } from '@/lib/booking/shared';
import type { CustomerPackage } from '@/lib/booking/loyalty';
import { api, btnSm, card, errMsg, input, type Data } from './ui';

// ---------- 設定:套票商品 ----------
type ProductDraft = { id?: string; name: string; scope: 'service' | 'addon'; service_ids: string[]; addon_ids: string[]; sessions: number; price: number; valid_days: number; active: boolean };

export function PackageProducts({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<ProductDraft | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return void uiAlert('請填寫套票名稱');
    setBusy(true);
    try { await api('/api/mycard/booking/products', { method: 'POST', body: JSON.stringify(editing) }); uiToast('已儲存套票'); setEditing(null); void reload(); }
    catch (e) { void uiAlert(errMsg(e)); }
    finally { setBusy(false); }
  }
  const services = data.services.filter((s) => s.price_mode !== 'quote');
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">套票</p>
          <p className="text-xs text-[#8a7f72]">例:頭皮護理 10 次、卸甲加購 5 次。在「顧客」檔案裡售出;預約時保留 1 次,完成才扣,取消會退回。</p>
        </div>
        <button type="button" onClick={() => setEditing({ name: '', scope: 'service', service_ids: [], addon_ids: [], sessions: 10, price: 0, valid_days: 365, active: true })} className={`${btnSm} shrink-0`}>+ 新增</button>
      </div>
      {editing ? (
        <div className="space-y-2 rounded-xl bg-[#faf7f2] p-3">
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={40} placeholder="套票名稱" aria-label="套票名稱" className={input} />
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-xs text-[#8a7f72]">次數<input inputMode="numeric" value={editing.sessions || ''} onChange={(e) => setEditing({ ...editing, sessions: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`${input} mt-1`} /></label>
            <label className="block text-xs text-[#8a7f72]">售價<input inputMode="numeric" value={editing.price || ''} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`${input} mt-1`} /></label>
            <label className="block text-xs text-[#8a7f72]">有效天數<input inputMode="numeric" value={editing.valid_days || ''} onChange={(e) => setEditing({ ...editing, valid_days: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={`${input} mt-1`} /></label>
          </div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="票券種類">
            {([['service', '服務票券', '折抵主服務'], ['addon', '加購票券', '折抵加購項目']] as const).map(([k, label, hint]) => (
              <button key={k} type="button" aria-pressed={editing.scope === k} onClick={() => setEditing({ ...editing, scope: k })} className={`rounded-xl border bg-white p-2 text-left ${editing.scope === k ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5ded4]'}`}>
                <span className="block text-sm font-semibold">{label}</span><span className="block text-[11px] text-[#8a7f72]">{hint}</span>
              </button>
            ))}
          </div>
          {editing.scope === 'addon' ? (
            <div>
              <p className="text-xs text-[#8a7f72]">可兌換的加購(都不勾 = 全部加購)</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {data.addons.filter((a) => a.active).map((a) => {
                  const on = editing.addon_ids.includes(a.id);
                  const svc = data.services.find((s) => s.id === a.service_id)?.name;
                  return <button key={a.id} type="button" aria-pressed={on} onClick={() => setEditing({ ...editing, addon_ids: on ? editing.addon_ids.filter((x) => x !== a.id) : [...editing.addon_ids, a.id] })} className={`rounded-full px-2.5 py-1 text-xs ${on ? 'bg-[#1f1b19] text-white' : 'border border-[#d7c9bd] bg-white'}`}>{a.name}{svc ? `(${svc})` : ''}</button>;
                })}
                {!data.addons.some((a) => a.active) ? <span className="text-xs text-[#a99e8f]">還沒有加購項目,請先到「服務」新增</span> : null}
              </div>
            </div>
          ) : (
          <div>
            <p className="text-xs text-[#8a7f72]">可兌換的服務(都不勾 = 全部服務)</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {services.map((s) => {
                const on = editing.service_ids.includes(s.id);
                return <button key={s.id} type="button" aria-pressed={on} onClick={() => setEditing({ ...editing, service_ids: on ? editing.service_ids.filter((x) => x !== s.id) : [...editing.service_ids, s.id] })} className={`rounded-full px-2.5 py-1 text-xs ${on ? 'bg-[#1f1b19] text-white' : 'border border-[#d7c9bd] bg-white'}`}>{s.name}</button>;
              })}
            </div>
          </div>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />販售中</label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className={btnSm}>取消</button><button type="button" disabled={busy} onClick={() => void save()} className={`${btnSm} border-[#1f1b19] bg-[#1f1b19] text-white`}>儲存</button></div>
        </div>
      ) : null}
      {data.products.length ? (
        <div className="divide-y divide-[#f0ebe2]">
          {data.products.map((p) => (
            <div key={p.id} className={`flex items-center gap-2 py-2 text-sm ${p.active ? '' : 'opacity-60'}`}>
              <span className="min-w-0 flex-1 truncate">{p.scope === 'addon' ? '【加購】' : ''}{p.name} · {p.sessions} 次 · {money(p.price)} · {p.valid_days} 天{p.active ? '' : '(停售)'}</span>
              <button type="button" onClick={() => setEditing({ ...p, scope: p.scope ?? 'service', addon_ids: p.addon_ids ?? [] })} className={btnSm}>編輯</button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ---------- 顧客檔案:套票與點數 ----------
type Loyalty = { packages: CustomerPackage[]; points: number; ledger: { id: number; kind: string; points: number; note: string; created_at: string }[] };

export function LoyaltyPanel({ customerId, data }: { customerId: string; data: Data }) {
  const [l, setL] = useState<Loyalty | null>(null);
  const [selling, setSelling] = useState(false);
  const products = data.products.filter((p) => p.active);
  const [sale, setSale] = useState({ product_id: products[0]?.id ?? '', price: String(products[0]?.price ?? ''), method: 'cash' });
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const load = useCallback(async () => {
    try { setL(await api<Loyalty>(`/api/mycard/booking/customers/${customerId}/loyalty`)); } catch (e) { void uiAlert(errMsg(e)); }
  }, [customerId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try { await api(`/api/mycard/booking/customers/${customerId}/loyalty`, { method: 'POST', body: JSON.stringify(body) }); uiToast(ok); setSelling(false); void load(); }
    catch (e) { void uiAlert(errMsg(e)); }
    finally { setBusy(false); }
  }
  async function adjust() {
    const v = await uiPrompt('調整點數(加點填正數,扣點填負數):', { placeholder: '例:50 或 -20' });
    if (v === null) return;
    const n = Math.round(Number(v));
    if (!n) return void uiAlert('請輸入點數');
    await post({ action: 'adjust', points: n, note: '店家手動調整' }, '已調整點數');
  }

  if (!l) return null;
  const pkgs = l.packages;
  if (!products.length && !pkgs.length && !data.business.reward_enabled) return null;
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">套票與點數</p>
        {data.business.reward_enabled ? <button type="button" disabled={busy} onClick={() => void adjust()} className="text-xs text-[#1f6f8b]">{l.points} 點 · 調整</button> : null}
      </div>
      {pkgs.length ? pkgs.map((p) => {
        const expired = new Date(p.expires_at).getTime() < now;
        return (
          <div key={p.id} className="rounded-xl bg-[#faf7f2] p-3 text-sm">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 font-semibold">{p.name}</p>
              <span className="shrink-0 text-xs text-[#6b6156]">{p.status === 'refunded' ? '已退款' : expired ? '已過期' : `可用 ${p.available} / ${p.sessions_total}`}</span>
            </div>
            <div className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
              <span className="bg-[#d5cbbd]" style={{ flex: p.used }} /><span className="bg-[#e7c98f]" style={{ flex: p.reserved }} /><span className="bg-[#9cc8a6]" style={{ flex: p.available }} />
            </div>
            <p className="mt-1 text-xs text-[#8a7f72]">已用 {p.used} · 預約保留 {p.reserved} · {formatDateTime(p.expires_at).split(' ')[0]} 到期 · 售價 {money(p.price_paid)}</p>
            {p.status === 'active' && !expired ? <button type="button" disabled={busy} onClick={() => void (async () => { if (await uiConfirm(`退款「${p.name}」?剩餘 ${p.available} 次會作廢;退款金額請另外處理。`, { danger: true })) await post({ action: 'refund', package_id: p.id, note: '' }, '已退款'); })()} className="mt-1 text-xs text-[#a03b3b]">退款</button> : null}
          </div>
        );
      }) : <p className="text-sm text-[#a99e8f]">沒有套票</p>}
      {products.length ? (
        selling ? (
          <div className="space-y-2 rounded-xl bg-[#faf7f2] p-3">
            <select value={sale.product_id} onChange={(e) => setSale({ ...sale, product_id: e.target.value, price: String(products.find((p) => p.id === e.target.value)?.price ?? '') })} aria-label="套票" className={input}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}({p.sessions} 次)</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input inputMode="numeric" value={sale.price} onChange={(e) => setSale({ ...sale, price: e.target.value.replace(/\D/g, '') })} placeholder="實收金額" aria-label="實收金額" className={input} />
              <select value={sale.method} onChange={(e) => setSale({ ...sale, method: e.target.value })} aria-label="付款方式" className={input}>
                <option value="cash">現金</option><option value="transfer">轉帳</option><option value="card">刷卡</option><option value="other">其他</option>
              </select>
            </div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setSelling(false)} className={btnSm}>取消</button><button type="button" disabled={busy || !sale.product_id} onClick={() => void post({ action: 'sell', ...sale, price: Number(sale.price) || 0 }, '已售出套票')} className={`${btnSm} border-[#1f1b19] bg-[#1f1b19] text-white`}>確認售出</button></div>
          </div>
        ) : <button type="button" onClick={() => setSelling(true)} className={btnSm}>+ 售出套票</button>
      ) : null}
      {data.business.reward_enabled && l.ledger.length ? (
        <details className="text-xs text-[#6b6156]">
          <summary className="cursor-pointer">最近點數紀錄</summary>
          <ul className="mt-1 space-y-0.5">{l.ledger.map((r) => <li key={r.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{formatDateTime(r.created_at)} {r.note}</span><span className="shrink-0 tabular-nums">{r.points > 0 ? `+${r.points}` : r.points}</span></li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}

