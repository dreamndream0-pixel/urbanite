'use client';

import { useEffect, useMemo, useState } from 'react';
import { uiAlert } from '@/lib/ui-dialog';
import { AUTO_COMPLETE_DAYS, resolveLoyalty, type LoyaltySettings } from '@/lib/loyalty-settings';
import MembershipCardEditor from './MembershipCardEditor';
import { MEMBERSHIP_DESIGNS, membershipDesign } from '@/lib/membership-card';

type Member = { user_id: string; name: string; email: string; phone: string; tier: string; tierKey: string; spend: number; balance: number; pending: number; orders: number };
type Entry = { id: number; kind: string; amount: number; note: string; created_at: string };
type Summary = { balance: number; pending: number; expiringSoon: number; entries: Entry[] };

const money = (n: number) => `NT$${Math.round(n).toLocaleString('en-US')}`;
const KIND_LABEL: Record<string, string> = { earn: '回饋入帳', redeem: '結帳折抵', return: '退回', expire: '到期', clawback: '退款追回', adjust: '人工調整' };
const card = 'rounded-xl border border-[#e5ded4] bg-white p-5';
const input = 'w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f1b19]/40';

// 後台「會員回饋」:會員列表(等級、消費、回饋金)與回饋/等級設定
export default function LoyaltyManager() {
  const [tab, setTab] = useState<'members' | 'settings'>('members');
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-[#e5ded4] bg-white p-1">
        {([['members', '會員列表'], ['settings', '等級與回饋設定']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-lg px-4 py-2 text-sm ${tab === k ? 'bg-[#1f1b19] font-medium text-white' : 'text-[#6b6156] hover:bg-[#f6f2ec]'}`}>{label}</button>
        ))}
      </div>
      {tab === 'members' ? <Members /> : <Settings />}
    </div>
  );
}

function Members() {
  const [data, setData] = useState<{ enabled: boolean; members: Member[] } | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Member | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    fetch('/api/admin/loyalty/members', { cache: 'no-store' })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? '讀取失敗'); setData(d); })
      .catch((e) => setError(e instanceof Error ? e.message : '讀取失敗'));
  }, [reload]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (data?.members ?? []).filter((m) => !k || `${m.name} ${m.email} ${m.phone}`.toLowerCase().includes(k));
  }, [data, q]);
  if (error) return <p className={`${card} text-sm text-[#c0392b]`}>{error}</p>;
  if (!data) return <p className={`${card} text-sm text-[#8a7f72]`}>讀取中…</p>;
  return (
    <div className="space-y-3">
      {!data.enabled ? <p className="rounded-xl border border-[#f0d9b5] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5a1c]">回饋金尚未開啟。到「等級與回饋設定」開啟後,訂單完成才會累積回饋。</p> : null}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名、Email、電話" className={input} />
      <div className="overflow-hidden rounded-xl border border-[#e5ded4] bg-white">
        {list.length === 0 ? <p className="p-6 text-center text-sm text-[#a99e8f]">沒有會員</p> : list.map((m) => (
          <button key={m.user_id} type="button" onClick={() => setOpen(m)} className="flex w-full items-center gap-3 border-b border-[#f3eee7] px-4 py-3 text-left last:border-0 hover:bg-[#faf7f2]">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#1f1b19]">{m.name || m.email || '未命名會員'} <span className="ml-1 rounded-full bg-[#f3eee7] px-2 py-0.5 text-[11px] font-medium text-[#8a6a3c]">{m.tier}</span></p>
              <p className="truncate text-xs text-[#8a7f72]">{m.email}{m.phone ? `・${m.phone}` : ''}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-[#6b6156]">
              <p>回饋金 <b className="text-[#1f1b19]">{money(m.balance)}</b>{m.pending ? <span className="text-[#a99e8f]">(待入帳 {money(m.pending)})</span> : null}</p>
              <p>有效消費 {money(m.spend)}・{m.orders} 筆訂單</p>
            </div>
          </button>
        ))}
      </div>
      {open ? <MemberDetail member={open} onClose={() => setOpen(null)} onChanged={() => setReload((n) => n + 1)} /> : null}
    </div>
  );
}

function MemberDetail({ member, onClose, onChanged }: { member: Member; onClose: () => void; onChanged: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/admin/loyalty/members/${member.user_id}`, { cache: 'no-store' }).then((r) => r.json()).then(setSummary).catch(() => {});
  }, [member.user_id]);
  async function adjust() {
    const n = Math.trunc(Number(amount));
    if (!n) return void uiAlert('請輸入調整金額(加發填正數,扣除填負數)');
    if (!note.trim()) return void uiAlert('請填寫調整原因');
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/loyalty/members/${member.user_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: n, note }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '調整失敗');
      setSummary(d); setAmount(''); setNote(''); onChanged();
    } catch (e) { void uiAlert(e instanceof Error ? e.message : '調整失敗'); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{member.name || member.email}</p>
            <p className="text-xs text-[#8a7f72]">{member.tier}・有效消費 {money(member.spend)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉" className="rounded p-1 text-xl leading-none hover:bg-[#efe8dd]">×</button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[['可用', summary?.balance ?? 0], ['待入帳', summary?.pending ?? 0], ['30 天內到期', summary?.expiringSoon ?? 0]].map(([label, v]) => (
            <div key={label as string} className="rounded-lg bg-[#faf7f2] p-3"><p className="text-[11px] text-[#8a7f72]">{label}</p><p className="font-semibold">{money(Number(v))}</p></div>
          ))}
        </div>
        <div className="mt-4 space-y-2 rounded-lg border border-[#efe8dd] p-3">
          <p className="text-sm font-semibold">人工調整</p>
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ''))} inputMode="numeric" placeholder="+100 / -50" className={input} />
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="原因(必填,例:客訴補償)" className={input} />
          </div>
          <button type="button" disabled={busy} onClick={() => void adjust()} className="w-full rounded-full bg-[#1f1b19] py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? '處理中…' : '確認調整'}</button>
          <p className="text-[11px] text-[#a99e8f]">加發的回饋金有效期限依設定計算;扣除時先扣快到期的。會記錄操作人員。</p>
        </div>
        <p className="mt-4 text-sm font-semibold">回饋金明細</p>
        <div className="mt-2 divide-y divide-[#f3eee7] text-sm">
          {!summary ? <p className="py-4 text-center text-xs text-[#a99e8f]">讀取中…</p> : summary.entries.length === 0 ? <p className="py-4 text-center text-xs text-[#a99e8f]">尚無紀錄</p> : summary.entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><p>{KIND_LABEL[e.kind] ?? e.kind}</p><p className="truncate text-[11px] text-[#a99e8f]">{new Date(e.created_at).toLocaleString('zh-TW')}{e.note ? `・${e.note}` : ''}</p></div>
              <span className={`shrink-0 font-semibold ${e.amount >= 0 ? 'text-[#1f7a44]' : 'text-[#c0392b]'}`}>{e.amount >= 0 ? '+' : ''}{e.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const [s, setS] = useState<LoyaltySettings | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    fetch('/api/admin/loyalty', { cache: 'no-store' }).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error || '讀取設定失敗'); return data; }).then((d) => setS(resolveLoyalty(d.settings))).catch((e) => setLoadError(e instanceof Error ? e.message : '讀取設定失敗'));
  }, []);
  if (loadError) return <p role="alert" className={`${card} text-sm text-[#c0392b]`}>{loadError}</p>;
  if (!s) return <p className={`${card} text-sm text-[#8a7f72]`}>讀取中…</p>;
  const num = (v: string) => Number(v.replace(/[^\d.]/g, '')) || 0;
  const setTier = (i: number, patch: Partial<LoyaltySettings['tiers'][number]>) => setS({ ...s, tiers: s.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  async function save() {
    setBusy(true); setSaved('');
    try {
      const r = await fetch('/api/admin/loyalty', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: s }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? '儲存失敗');
      setS(resolveLoyalty(d.settings)); setSaved('已儲存');
    } catch (e) { void uiAlert(e instanceof Error ? e.message : '儲存失敗'); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <fieldset disabled={busy || imageBusy} className="min-w-0 space-y-4">
      <section className={card}>
        <label className="flex items-center justify-between gap-3">
          <div><p className="font-semibold">開啟會員回饋金</p><p className="text-xs text-[#8a7f72]">開啟後,已完成的訂單依會員等級累積回饋金,結帳時可折抵(等同現金,可和優惠券併用)。</p></div>
          <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="h-6 w-6 accent-[#1f1b19]" />
        </label>
      </section>
      <section className={card}>
        <p className="font-semibold">消費等級</p>
        <p className="mt-1 text-xs text-[#8a7f72]">依近 {s.keepMonths} 個月有效消費(已完成訂單的商品實付金額,扣除運費、回饋金折抵與退款)自動升級;升級後保級 {s.keepMonths} 個月。</p>
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4rem_1.5rem] gap-2 text-[11px] text-[#8a7f72]"><span>等級名稱</span><span>消費門檻</span><span>回饋 %</span><span /></div>
          {s.tiers.map((t, i) => (
            <div key={t.key} className="space-y-2 border-b border-[#eee8df] pb-3">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4rem_1.5rem] items-center gap-2">
              <input aria-label={`${t.name}等級名稱`} maxLength={20} value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} className={input} />
              <input aria-label={`${t.name}消費門檻`} value={i === 0 ? '0' : String(t.threshold)} disabled={i === 0} onChange={(e) => setTier(i, { threshold: num(e.target.value) })} inputMode="numeric" className={`${input} disabled:bg-[#f6f2ec]`} />
              <input aria-label={`${t.name}回饋率`} value={String(t.rate)} onChange={(e) => setTier(i, { rate: num(e.target.value) })} inputMode="decimal" className={input} />
              {i > 0 ? <button type="button" onClick={() => setS({ ...s, tiers: s.tiers.filter((_, j) => j !== i) })} className="text-[#c0392b]" aria-label="刪除等級">×</button> : <span />}
              </div>
              <label className="flex min-w-0 items-center gap-3 text-xs text-[#6b6156]"><span className="shrink-0">卡片顏色</span><select aria-label={`${t.name}卡片顏色`} value={membershipDesign(t.cardDesign).id} onChange={(e) => setTier(i, { cardDesign: membershipDesign(e.target.value).id })} className={`${input} max-w-xs`}>{MEMBERSHIP_DESIGNS.map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}</select></label>
            </div>
          ))}
          {s.tiers.length < 6 ? <button type="button" onClick={() => setS({ ...s, tiers: [...s.tiers, { key: `t${Date.now().toString(36)}`, name: '新等級', threshold: (s.tiers.at(-1)?.threshold ?? 0) + 10000, rate: (s.tiers.at(-1)?.rate ?? 1) + 1 }] })} className="rounded-full border border-[#d7c9bd] px-3 py-1 text-xs">＋ 新增等級</button> : null}
        </div>
      </section>
      <MembershipCardEditor settings={s} onChange={(update) => setS((current) => current ? update(current) : current)} onBusyChange={setImageBusy} />
      <section className={card}>
        <p className="font-semibold">回饋金規則</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([['delayDays', '訂單完成後幾天入帳', '天'], ['validDays', '入帳後可使用天數', '天'], ['maxRedeemPct', '每筆最多折抵商品金額', '%'], ['keepMonths', '等級計算期間與保級', '個月']] as const).map(([k, label, unit]) => (
            <label key={k} className="block text-sm text-[#6b6156]">{label}
              <div className="mt-1 flex items-center gap-2"><input value={String(s[k])} onChange={(e) => setS({ ...s, [k]: num(e.target.value) })} inputMode="numeric" className={input} /><span className="shrink-0 text-xs">{unit}</span></div>
            </label>
          ))}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-[#8a7f72]">
          <li>1 元回饋金折抵 NT$1;運費不可折抵;先用快到期的回饋金。</li>
          <li>回饋 = 實付商品金額 × 下單時等級的回饋率,無條件捨去。</li>
          <li>到貨(宅配送達或超商取貨){AUTO_COMPLETE_DAYS} 天後訂單自動完成;有退貨處理中的訂單會延後入帳。</li>
          <li>取消或退款:依比例退回用掉的回饋金,並追回該筆訂單的回饋;已用掉的列為待扣回,由之後的回饋抵扣。</li>
        </ul>
      </section>
      </fieldset>
      <div className="sticky bottom-3 flex items-center justify-center gap-3">
        <button type="button" disabled={busy || imageBusy} onClick={() => void save()} className="w-full max-w-xs rounded-full bg-[#1f1b19] py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-50">{busy ? '儲存中…' : imageBusy ? '圖片上傳中…' : '儲存設定'}</button>
        {saved ? <span className="text-sm text-[#1f7a44]">{saved}</span> : null}
      </div>
    </div>
  );
}
