'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Product, StockMovement, Variant } from '@/lib/types';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { countsFromCsv, downloadCsv, lineKey, stocktakeCsvRows, stocktakeSummary, type Stocktake, type StocktakeLine } from '@/lib/stocktake';

export type StocktakeApplied = {
  products: { id: string; inventory: number; variants: Variant[] }[];
  movements: StockMovement[];
};

const card = 'rounded-xl border border-[#e5ded4] bg-white p-4 sm:p-5';
const input = 'w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f1b19]/40';
const btn = 'rounded-full border border-[#d7c9bd] bg-white px-4 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-40';
const btnDark = 'rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white whitespace-nowrap disabled:opacity-40';
const money = (n: number) => `${n < 0 ? '-' : ''}NT$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleString('zh-TW', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

// 庫存管理 → 盤點:建立盤點單(拍下系統庫存)→ 填實盤數量(可匯出盤點表、匯入實盤)→ 完成盤點寫入調整
export default function StocktakeManager({ categories, onApplied }: { products: Product[]; categories: Category[]; onApplied: (r: StocktakeApplied) => void }) {
  const [list, setList] = useState<Stocktake[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/stocktakes', { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (!res.ok) { setList([]); return void uiAlert(data?.error ?? '讀取盤點單失敗'); }
    setList(data as Stocktake[]);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const open = list?.find((s) => s.id === openId) ?? null;
  if (open) {
    return (
      <StocktakeDetail
        key={open.id}
        stocktake={open}
        onBack={() => setOpenId(null)}
        onChange={(next) => setList((l) => (l ?? []).map((s) => (s.id === next.id ? next : s)))}
        onRemoved={(id) => { setList((l) => (l ?? []).filter((s) => s.id !== id)); setOpenId(null); }}
        onApplied={onApplied}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">庫存盤點</h2>
            <p className="mt-1 text-xs leading-5 text-[#8a7f72]">建立盤點單會記下當下的系統庫存。清點後填入實盤數量(可匯出盤點表到 Excel 填寫再匯入),按「完成盤點」才會把差異寫入庫存與進出庫紀錄。</p>
          </div>
          <button type="button" onClick={() => setCreating(true)} className={btnDark}>+ 新增盤點單</button>
        </div>
      </div>

      {creating && (
        <CreateStocktake
          categories={categories}
          onCancel={() => setCreating(false)}
          onCreated={(st) => { setCreating(false); setList((l) => [st, ...(l ?? [])]); setOpenId(st.id); }}
        />
      )}

      {list === null ? (
        <p className="py-10 text-center text-sm text-[#8a7f72]">載入中…</p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#e5ded4] bg-white py-10 text-center text-sm text-[#a99e8f]">還沒有盤點單,按「新增盤點單」開始第一次盤點。</p>
      ) : (
        <div className="space-y-2">
          {list.map((st) => {
            const s = stocktakeSummary(st.lines);
            const done = st.status === 'done';
            return (
              <button key={st.id} type="button" onClick={() => setOpenId(st.id)} className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-[#e5ded4] bg-white p-4 text-left hover:bg-[#faf7f2]">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${done ? 'bg-[#e7f3ea] text-[#2f6b3f]' : 'bg-[#fff3df] text-[#9a6412]'}`}>{done ? '已完成' : '盤點中'}</span>
                    <span className="truncate font-semibold">{st.title}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[#8a7f72]">{st.doc_no} · {st.scope} · {fmtTime(done ? st.completed_at : st.created_at)}{st.handler ? ` · ${st.handler}` : ''}</p>
                </div>
                <div className="shrink-0 text-right text-xs leading-5">
                  <p className="text-[#6b6156]">已盤 {s.counted}/{s.total}</p>
                  <p className={s.diffLines ? 'font-semibold text-[#b5452f]' : 'text-[#8a7f72]'}>差異 {s.diffLines} 項</p>
                </div>
                <span className="text-[#b3a897]">›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateStocktake({ categories, onCancel, onCreated }: { categories: Category[]; onCancel: () => void; onCreated: (st: Stocktake) => void }) {
  const [form, setForm] = useState({ category: 'all', title: '', handler: '', note: '' });
  const [saving, setSaving] = useState(false);
  async function submit() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/stocktakes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(data?.error ?? '建立失敗');
      uiToast('已建立盤點單');
      onCreated(data as Stocktake);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className={`${card} space-y-3`}>
      <p className="font-semibold">新增盤點單</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm text-[#8a7f72]">
          盤點範圍
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`${input} mt-1`}>
            <option value="all">全部商品</option>
            {categories.map((c) => <option key={c.id} value={c.slug}>分類:{c.name}</option>)}
          </select>
        </label>
        <label className="block text-sm text-[#8a7f72]">
          盤點名稱(選填)
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如 10 月月底盤點" className={`${input} mt-1`} />
        </label>
        <label className="block text-sm text-[#8a7f72]">
          盤點人員(選填)
          <input value={form.handler} onChange={(e) => setForm({ ...form, handler: e.target.value })} className={`${input} mt-1`} />
        </label>
        <label className="block text-sm text-[#8a7f72]">
          備註(選填)
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={`${input} mt-1`} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btn}>取消</button>
        <button type="button" disabled={saving} onClick={() => void submit()} className={btnDark}>{saving ? '建立中…' : '建立並開始盤點'}</button>
      </div>
    </div>
  );
}

function StocktakeDetail({ stocktake, onBack, onChange, onRemoved, onApplied }: {
  stocktake: Stocktake;
  onBack: () => void;
  onChange: (st: Stocktake) => void;
  onRemoved: (id: string) => void;
  onApplied: (r: StocktakeApplied) => void;
}) {
  const done = stocktake.status === 'done';
  // 本地編輯中的實盤數量(字串,允許空白);dirty 記錄還沒存的
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(stocktake.lines.map((l) => [lineKey(l), l.counted_qty == null ? '' : String(l.counted_qty)])));
  const dirty = useRef<Set<string>>(new Set());
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'diff'>('all');
  const importRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lines: StocktakeLine[] = useMemo(() => stocktake.lines.map((l) => {
    if (done) return l;
    const raw = counts[lineKey(l)] ?? '';
    const n = raw === '' ? null : Math.max(0, Math.floor(Number(raw)));
    return { ...l, counted_qty: n === null || !Number.isFinite(n) ? null : n };
  }), [stocktake.lines, counts, done]);
  const summary = stocktakeSummary(lines);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current.size) return true;
    const keys = [...dirty.current];
    dirty.current.clear();
    const payload: Record<string, number | null> = {};
    for (const k of keys) { const raw = counts[k] ?? ''; payload[k] = raw === '' ? null : Math.max(0, Math.floor(Number(raw)) || 0); }
    setSaving('saving');
    const res = await fetch(`/api/admin/stocktakes/${stocktake.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ counts: payload }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) { keys.forEach((k) => dirty.current.add(k)); setSaving('idle'); void uiAlert(data?.error ?? '儲存失敗'); return false; }
    onChange(data as Stocktake);
    setSaving('saved');
    return true;
  }, [counts, stocktake.id, onChange]);

  // 輸入後 0.8 秒自動儲存
  useEffect(() => {
    if (!dirty.current.size || done) return;
    timer.current = setTimeout(() => void flush(), 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [counts, flush, done]);

  const setCount = (key: string, value: string) => {
    dirty.current.add(key);
    setCounts((c) => ({ ...c, [key]: value.replace(/[^\d]/g, '') }));
  };

  const shown = lines.filter((l) => {
    if (filter === 'pending' && l.counted_qty != null) return false;
    if (filter === 'diff' && (l.counted_qty == null || (done ? (l.adjusted ?? 0) === 0 : l.counted_qty === l.system_qty))) return false;
    const q = query.trim().toLowerCase();
    return !q || [l.product_id, l.name, l.spec, l.location].some((v) => String(v).toLowerCase().includes(q));
  });

  function exportCsv() {
    downloadCsv(`stocktake-${stocktake.doc_no}.csv`, stocktakeCsvRows({ ...stocktake, lines }));
  }

  async function importCsv(file: File) {
    const { counts: imported, skipped, error } = countsFromCsv(await file.text());
    if (error) return void uiAlert(error);
    const known = new Set(stocktake.lines.map(lineKey));
    const matched = [...imported.entries()].filter(([k]) => known.has(k));
    const unknown = imported.size - matched.length;
    if (!matched.length) return void uiAlert('檔案裡沒有對應到這張盤點單的品項(請用「匯出盤點表」的檔案填寫)。');
    if (!(await uiConfirm(`匯入 ${matched.length} 筆實盤數量?${unknown ? `\n${unknown} 筆不在這張盤點單內,會略過。` : ''}${skipped ? `\n${skipped} 筆實盤欄空白或格式不對,會略過。` : ''}`))) return;
    for (const [k] of matched) dirty.current.add(k);
    setCounts((c) => ({ ...c, ...Object.fromEntries(matched.map(([k, v]) => [k, String(v)])) }));
    uiToast(`已匯入 ${matched.length} 筆實盤數量`);
  }

  async function fillPending() {
    const pending = stocktake.lines.filter((l) => (counts[lineKey(l)] ?? '') === '');
    if (!pending.length) return void uiToast('沒有未盤的項目');
    if (!(await uiConfirm(`把 ${pending.length} 個未盤項目的實盤數量,帶入系統庫存(視為沒有差異)?`))) return;
    for (const l of pending) dirty.current.add(lineKey(l));
    setCounts((c) => ({ ...c, ...Object.fromEntries(pending.map((l) => [lineKey(l), String(l.system_qty)])) }));
  }

  async function complete() {
    if (!summary.counted) return void uiAlert('還沒有填任何實盤數量。');
    const msg = `完成盤點後會寫入庫存,不能再修改。\n\n已盤 ${summary.counted} / ${summary.total} 項${summary.pending ? `(${summary.pending} 項未盤,不會調整)` : ''}\n差異 ${summary.diffLines} 項,合計 ${signed(summary.diffQty)} 件,${money(summary.diffValue)}\n\n若建單後有訂單或進出庫,會以「實盤數量」為準重新計算差異。確定完成?`;
    if (!(await uiConfirm(msg))) return;
    setBusy(true);
    try {
      if (!(await flush())) return;
      const res = await fetch(`/api/admin/stocktakes/${stocktake.id}/complete`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(data?.error ?? '完成盤點失敗');
      onChange(data.stocktake as Stocktake);
      onApplied({ products: data.products ?? [], movements: data.movements ?? [] });
      uiToast(`盤點完成,已調整 ${(data.movements ?? []).length} 項庫存`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await uiConfirm('刪除這張盤點單?已填的實盤數量會一起清除,庫存不會變動。', { danger: true }))) return;
    const res = await fetch(`/api/admin/stocktakes/${stocktake.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => null);
    if (!res.ok) return void uiAlert(data?.error ?? '刪除失敗');
    onRemoved(stocktake.id);
  }

  async function back() {
    if (!done && !(await flush())) return;
    onBack();
  }

  const stats: [string, string, string?][] = [
    ['總項目', String(summary.total)],
    ['已盤', String(summary.counted)],
    ['未盤', String(summary.pending), summary.pending ? 'text-[#9a6412]' : ''],
    ['差異項目', String(summary.diffLines), summary.diffLines ? 'text-[#b5452f]' : ''],
    ['差異數量', signed(summary.diffQty), summary.diffQty ? 'text-[#b5452f]' : ''],
    ['差異金額', money(summary.diffValue), summary.diffValue ? 'text-[#b5452f]' : ''],
  ];

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => void back()} className="shrink-0 rounded-full border border-[#e5ded4] px-3 py-1.5 text-sm">← 返回</button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${done ? 'bg-[#e7f3ea] text-[#2f6b3f]' : 'bg-[#fff3df] text-[#9a6412]'}`}>{done ? '已完成' : '盤點中'}</span>
              <h2 className="min-w-0 truncate text-lg font-semibold">{stocktake.title}</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#8a7f72]">
              {stocktake.doc_no} · {stocktake.scope} · 建立 {fmtTime(stocktake.created_at)}{done ? ` · 完成 ${fmtTime(stocktake.completed_at)}` : ''}{stocktake.handler ? ` · ${stocktake.handler}` : ''}
            </p>
          </div>
          {!done && <span className="shrink-0 pt-1.5 text-xs text-[#8a7f72]">{saving === 'saving' ? '儲存中…' : saving === 'saved' ? '已自動儲存' : ''}</span>}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {stats.map(([label, value, cls]) => (
            <div key={label} className="min-w-0 rounded-lg bg-[#faf7f2] px-3 py-2">
              <p className="text-xs text-[#8a7f72]">{label}</p>
              <p className={`truncate font-semibold ${cls ?? ''}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} className={btn}>匯出盤點表</button>
          {!done && (
            <>
              <button type="button" onClick={() => importRef.current?.click()} className={btn}>匯入實盤</button>
              <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importCsv(f); }} />
              <button type="button" onClick={() => void fillPending()} className={btn}>未盤帶入系統數</button>
              <button type="button" onClick={() => void remove()} className={`${btn} text-[#b5452f]`}>刪除</button>
            </>
          )}
        </div>
      </div>

      <div className={card}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋品項編號、品名、規格、儲位" className={`${input} sm:flex-1`} />
          <div className="flex shrink-0 gap-1 rounded-lg border border-[#e5ded4] bg-[#faf7f2] p-1">
            {([['all', '全部'], ['pending', '未盤'], ['diff', '有差異']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${filter === k ? 'bg-[#1f1b19] font-semibold text-white' : 'text-[#6b6156]'}`}>{label}</button>
            ))}
          </div>
        </div>

        <div className="mt-3 divide-y divide-[#f0ebe2]">
          {shown.length === 0 && <p className="py-8 text-center text-sm text-[#a99e8f]">沒有符合的項目</p>}
          {shown.map((l) => {
            const key = lineKey(l);
            const diff = done ? l.adjusted ?? 0 : l.counted_qty == null ? null : l.counted_qty - l.system_qty;
            return (
              <div key={key} className="flex min-w-0 items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.name}</p>
                  <p className="truncate text-xs text-[#8a7f72]">{l.product_id}{l.spec ? ` · ${l.spec}` : ''}{l.location ? ` · 儲位 ${l.location}` : ''}</p>
                  <p className="mt-0.5 text-xs text-[#6b6156]">
                    {done ? `完成時系統 ${l.qty_before ?? l.system_qty}` : `系統 ${l.system_qty}`} {l.unit}
                  </p>
                </div>
                {done ? (
                  <div className="w-20 shrink-0 text-right">
                    <p className="text-xs text-[#8a7f72]">實盤</p>
                    <p className="font-semibold">{l.counted_qty ?? '未盤'}</p>
                  </div>
                ) : (
                  <label className="w-24 shrink-0">
                    <span className="sr-only">實盤數量</span>
                    <input
                      inputMode="numeric"
                      value={counts[key] ?? ''}
                      onChange={(e) => setCount(key, e.target.value)}
                      onBlur={() => void flush()}
                      placeholder="實盤"
                      className={`w-full rounded-lg border px-2 py-2 text-center text-base outline-none focus:border-[#1f1b19]/50 ${counts[key] ? 'border-[#cfc3b5] bg-white' : 'border-dashed border-[#d7c9bd] bg-[#faf7f2]'}`}
                    />
                  </label>
                )}
                <div className="w-14 shrink-0 text-right">
                  <p className="text-xs text-[#8a7f72]">差異</p>
                  <p className={`font-semibold ${diff ? (diff > 0 ? 'text-[#2f6b3f]' : 'text-[#b5452f]') : 'text-[#b9b0a8]'}`}>{diff == null ? '—' : signed(diff)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!done && (
        <div className="sticky bottom-0 z-20 -mx-1 flex items-center gap-3 rounded-xl border border-[#e5ded4] bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
          <p className="min-w-0 flex-1 truncate text-xs text-[#6b6156]">已盤 {summary.counted}/{summary.total} · 差異 {summary.diffLines} 項</p>
          <button type="button" disabled={busy} onClick={() => void complete()} className={`${btnDark} px-6 py-2.5 shadow-lg`}>{busy ? '處理中…' : '完成盤點'}</button>
        </div>
      )}
    </div>
  );
}
