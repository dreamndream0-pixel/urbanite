'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { POS_BUTTON_COLORS, POS_PERMISSIONS, type PosButton, type PosPermission } from '@/lib/pos';
import type { PosStaff } from '@/lib/pos-auth';
import type { StockLevel, StockLocation, StockTransfer, TransferLine } from '@/lib/stock-locations';
import type { Category, Product } from '@/lib/types';
import { uiAlert, uiConfirm, uiPrompt } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';

const card = 'rounded-xl border border-[#e5ded4] bg-white p-4 sm:p-5';
const input = 'w-full min-w-0 rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-base! sm:text-sm! outline-none focus:border-[#1f1b19]/40';
const select = input.replace('w-full ', '');
const btn = 'rounded-lg border border-[#d7c9bd] bg-white px-3 py-2 text-sm! font-medium! whitespace-nowrap hover:bg-[#f6f2ec] disabled:opacity-40';
const btnDark = 'rounded-lg border border-[#1f1b19] bg-[#1f1b19] px-4 py-2 text-sm! font-semibold! text-white whitespace-nowrap hover:opacity-90 disabled:opacity-40';
const th = 'px-2 py-2 text-left text-xs font-medium text-[#8a7f72] whitespace-nowrap';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `發生錯誤(${res.status})`);
  return data as T;
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : '發生錯誤,請再試一次');
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const vKey = (options: string[]) => options.join(' / ');
const dateTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

type Row = { product: Product; key: string; total: number };
const rowsOf = (p: Product): Row[] => (p.variants?.length ? p.variants.map((v) => ({ product: p, key: vKey(v.options), total: v.inventory ?? 0 })) : [{ product: p, key: '', total: p.inventory ?? 0 }]);

// 各據點數量:非預設據點看 stock_levels;預設據點 = 總庫存 − 其他據點合計
function useStockReader(levels: StockLevel[], locations: StockLocation[]) {
  return useMemo(() => {
    const map = new Map<string, number>();
    const others = new Map<string, number>();
    for (const l of levels) {
      map.set(`${l.location_id}|${l.product_id}|${l.variant_key}`, l.quantity);
      const k = `${l.product_id}|${l.variant_key}`;
      others.set(k, (others.get(k) ?? 0) + l.quantity);
    }
    const defaultId = locations.find((l) => l.is_default)?.id;
    return (locationId: string, row: Row) =>
      locationId === defaultId ? row.total - (others.get(`${row.product.id}|${row.key}`) ?? 0) : map.get(`${locationId}|${row.product.id}|${row.key}`) ?? 0;
  }, [levels, locations]);
}

// 後台「POS・分店」:分店 / 倉庫、各據點庫存、調貨、POS 首頁按鈕
export default function PosAdmin({ products, categories }: { products: Product[]; categories: Category[] }) {
  const [tab, setTab] = useState<'locations' | 'stock' | 'transfer' | 'buttons' | 'staff'>('locations');
  const [locations, setLocations] = useState<StockLocation[] | null>(null);
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const r = await api<{ locations: StockLocation[]; levels: StockLevel[] }>('/api/admin/stock-locations?levels=1');
      setLocations(r.locations); setLevels(r.levels); setError('');
    } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { const t = setTimeout(() => void reload(), 0); return () => clearTimeout(t); }, [reload]);

  const tabs = [['locations', '分店 / 倉庫'], ['stock', '各據點庫存'], ['transfer', '調貨'], ['buttons', 'POS 按鈕'], ['staff', 'POS 員工']] as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#e5ded4] bg-white p-1">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm! whitespace-nowrap ${tab === k ? 'bg-[#1f1b19] font-medium! text-white' : 'text-[#6b6156] hover:bg-[#f6f2ec]'}`}>{label}</button>
          ))}
        </div>
        <a href="/pos" className={btnDark}>開啟 POS →</a>
      </div>
      {error ? <p className="rounded-lg bg-[#fbeef1] px-3 py-2 text-sm text-[#a13552]">{error}</p> : null}
      {!locations ? <p className="text-sm text-[#8a7f72]">讀取中…</p> : (
        <>
          {tab === 'locations' && <Locations locations={locations} onChange={setLocations} />}
          {tab === 'stock' && <StockByLocation products={products} locations={locations} levels={levels} />}
          {tab === 'transfer' && <Transfers products={products} locations={locations} levels={levels} onLevels={setLevels} />}
          {tab === 'buttons' && <Buttons products={products} categories={categories} />}
          {tab === 'staff' && <Staff locations={locations} />}
        </>
      )}
    </div>
  );
}

// ---------- 分店 / 倉庫 ----------
function Locations({ locations, onChange }: { locations: StockLocation[]; onChange: (l: StockLocation[]) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'store' | 'warehouse'>('store');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ locations: StockLocation[] }>, done?: string) => {
    setBusy(true);
    try { onChange((await fn()).locations); if (done) uiToast(done); } catch (e) { void uiAlert(errMsg(e)); } finally { setBusy(false); }
  };
  const patch = (id: string, body: Record<string, unknown>, done?: string) => run(() => api('/api/admin/stock-locations', { method: 'PATCH', body: JSON.stringify({ id, ...body }) }), done);
  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-sm font-semibold">新增據點</p>
        <p className="mt-1 text-xs text-[#8a7f72]">每個分店、倉庫各自有庫存。商品頁上的庫存是全部據點加總;官網賣的是加總數量。「預設」據點(總倉)放的是還沒分到其他據點的數量,進貨、盤點、官網訂單都算在預設據點。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className={`${input} max-w-xs flex-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="名稱(例:台中店、北區倉庫)" maxLength={30} />
          <select className={`${select}`} value={kind} onChange={(e) => setKind(e.target.value as 'store' | 'warehouse')}><option value="store">分店</option><option value="warehouse">倉庫</option></select>
          <button type="button" className={btnDark} disabled={busy || !name.trim()} onClick={() => run(async () => { const r = await api<{ locations: StockLocation[] }>('/api/admin/stock-locations', { method: 'POST', body: JSON.stringify({ name, kind }) }); setName(''); return r; }, '已新增')}>新增</button>
        </div>
      </div>
      <div className="space-y-2">
        {locations.map((l) => (
          <div key={l.id} className={`${card} ${l.active ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${input} max-w-[220px] flex-1 font-semibold!`} defaultValue={l.name} maxLength={30} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== l.name) void patch(l.id, { name: v }, '已改名'); else e.target.value = l.name; }} />
              <select className={`${select}`} value={l.kind} onChange={(e) => void patch(l.id, { kind: e.target.value })}><option value="store">分店</option><option value="warehouse">倉庫</option></select>
              {l.is_default ? <span className="rounded bg-[#f3ede4] px-2 py-1 text-xs font-medium text-[#6b6156]">預設</span> : (
                <>
                  <button type="button" className={btn} disabled={busy} onClick={() => void patch(l.id, { active: !l.active }, l.active ? '已停用' : '已啟用')}>{l.active ? '停用' : '啟用'}</button>
                  <button type="button" className={`${btn} text-[#c84767]`} disabled={busy} onClick={async () => { if (await uiConfirm(`刪除「${l.name}」?還有庫存的據點不能刪除。`)) void run(() => api(`/api/admin/stock-locations?id=${l.id}`, { method: 'DELETE' }), '已刪除'); }}>刪除</button>
                </>
              )}
            </div>
            <p className="mt-2 text-xs text-[#8a7f72]">
              發票號碼:{l.invoice_enabled ? `${l.invoice_prefix}${String(l.invoice_next).padStart(8, '0')} 起,到 ${l.invoice_prefix}${String(l.invoice_end).padStart(8, '0')}(剩 ${Math.max(0, l.invoice_end - l.invoice_next + 1)} 張)` : '未啟用'}
              <span className="ml-1">— 在 POS 的「設定」裡修改</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 各據點庫存 ----------
function StockByLocation({ products, locations, levels }: { products: Product[]; locations: StockLocation[]; levels: StockLevel[] }) {
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('all');
  const read = useStockReader(levels, locations);
  const shown = locations.filter((l) => l.active || levels.some((x) => x.location_id === l.id));
  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const list = products.filter((p) => !kw || p.name.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw)).flatMap(rowsOf);
    return only === 'all' ? list : list.filter((r) => read(only, r) !== 0);
  }, [products, q, only, read]);
  const LIMIT = 300;
  return (
    <div className={card}>
      <div className="flex flex-wrap gap-2">
        <input className={`${input} max-w-xs flex-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋商品名稱 / 貨號" />
        <select className={`${select}`} value={only} onChange={(e) => setOnly(e.target.value)}>
          <option value="all">全部品項</option>
          {shown.map((l) => <option key={l.id} value={l.id}>只看「{l.name}」有庫存的</option>)}
        </select>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead><tr className="border-b border-[#e5ded4]"><th className={th}>商品</th><th className={th}>規格</th><th className={`${th} text-right`}>總庫存</th>{shown.map((l) => <th key={l.id} className={`${th} text-right`}>{l.name}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, LIMIT).map((r) => (
              <tr key={`${r.product.id}|${r.key}`} className="border-b border-[#efe8dd] last:border-0">
                <td className="max-w-[220px] truncate px-2 py-2">{r.product.name}</td>
                <td className="px-2 py-2 text-[#6b6156]">{r.key || '—'}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">{r.total}</td>
                {shown.map((l) => { const n = read(l.id, r); return <td key={l.id} className={`px-2 py-2 text-right tabular-nums ${n < 0 ? 'font-semibold text-[#c84767]' : n === 0 ? 'text-[#c9bfb1]' : ''}`}>{n}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[#8a7f72]">{rows.length > LIMIT ? `共 ${rows.length} 個品項,只顯示前 ${LIMIT} 個,請用搜尋縮小範圍。` : `共 ${rows.length} 個品項。`}紅色負數 = 官網賣掉的量超過預設據點的數量,需要從分店調回。</p>
    </div>
  );
}

// ---------- 調貨 ----------
function Transfers({ products, locations, levels, onLevels }: { products: Product[]; locations: StockLocation[]; levels: StockLevel[]; onLevels: (l: StockLevel[]) => void }) {
  const active = locations.filter((l) => l.active);
  const [from, setFrom] = useState(active[0]?.id ?? '');
  const [to, setTo] = useState(active[1]?.id ?? '');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState('');
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<StockTransfer[] | null>(null);
  const [detail, setDetail] = useState('');
  const read = useStockReader(levels, locations);
  const name = (id: string) => locations.find((l) => l.id === id)?.name ?? '';

  useEffect(() => { const t = setTimeout(() => { api<StockTransfer[]>('/api/admin/stock-transfers').then(setHistory).catch(() => setHistory([])); }, 0); return () => clearTimeout(t); }, []);

  const matches = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return [];
    return products.filter((p) => p.name.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw)).slice(0, 8);
  }, [products, q]);
  const qtyOf = (r: Row) => lines.find((l) => l.product_id === r.product.id && l.variant_key === r.key)?.quantity ?? 0;
  const setQty = (r: Row, quantity: number) => setLines((list) => {
    const rest = list.filter((l) => !(l.product_id === r.product.id && l.variant_key === r.key));
    return quantity > 0 ? [...rest, { product_id: r.product.id, variant_key: r.key, name: r.product.name, quantity }] : rest;
  });
  const totalQty = lines.reduce((n, l) => n + l.quantity, 0);

  async function submit() {
    if (!(await uiConfirm(`把 ${lines.length} 個品項、共 ${totalQty} 件,從「${name(from)}」調到「${name(to)}」?`))) return;
    setBusy(true);
    try {
      const r = await api<{ transfer: StockTransfer; levels: StockLevel[] }>('/api/admin/stock-transfers', { method: 'POST', body: JSON.stringify({ from, to, lines, note }) });
      onLevels(r.levels); setHistory((h) => [r.transfer, ...(h ?? [])]); setLines([]); setNote(''); setQ(''); setOpenId('');
      uiToast(`調貨完成 ${r.transfer.doc_no}`);
    } catch (e) { void uiAlert(errMsg(e)); } finally { setBusy(false); }
  }

  if (active.length < 2) return <div className={card}><p className="text-sm text-[#6b6156]">要有兩個以上的據點才能調貨。請先到「分店 / 倉庫」新增。</p></div>;
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">調出(從哪裡)<select className={`${input} mt-1`} value={from} onChange={(e) => { setFrom(e.target.value); setLines([]); }}>{active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="text-sm">調入(到哪裡)<select className={`${input} mt-1`} value={to} onChange={(e) => setTo(e.target.value)}>{active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        </div>
        {from === to ? <p className="mt-2 text-sm text-[#c84767]">調出與調入不能是同一個據點</p> : null}

        <p className="mt-4 text-sm font-semibold">加入商品</p>
        <input className={`${input} mt-1`} value={q} onChange={(e) => { setQ(e.target.value); setOpenId(''); }} placeholder="搜尋商品名稱 / 貨號" />
        <div className="mt-2 space-y-2">
          {matches.map((p) => {
            const rows = rowsOf(p);
            const open = openId === p.id || rows.length === 1;
            return (
              <div key={p.id} className="rounded-lg border border-[#e5ded4]">
                <button type="button" onClick={() => setOpenId(openId === p.id ? '' : p.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm!">
                  <span className="min-w-0 truncate font-medium!">{p.name}</span>
                  <span className="shrink-0 text-xs! text-[#8a7f72]">「{name(from)}」有 {rows.reduce((n, r) => n + Math.max(0, read(from, r)), 0)} 件{rows.length > 1 ? (open ? ' ▲' : ' ▼') : ''}</span>
                </button>
                {open ? (
                  <div className="grid gap-x-4 gap-y-1 border-t border-[#efe8dd] px-3 py-2 sm:grid-cols-2">
                    {rows.map((r) => {
                      const have = Math.max(0, read(from, r));
                      return (
                        <label key={r.key} className={`flex items-center justify-between gap-2 text-sm ${have ? '' : 'text-[#b3a99b]'}`}>
                          <span className="min-w-0 truncate">{r.key || '數量'} <span className="text-xs text-[#8a7f72]">(有 {have})</span></span>
                          <input type="number" min={0} max={have} disabled={!have} className={`${select} w-20 shrink-0 text-right`} value={qtyOf(r) || ''} placeholder="0"
                            onChange={(e) => setQty(r, Math.min(have, Math.max(0, Math.floor(Number(e.target.value) || 0))))} />
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
          {q.trim() && !matches.length ? <p className="text-sm text-[#8a7f72]">找不到商品</p> : null}
        </div>

        {lines.length ? (
          <div className="mt-4 rounded-lg bg-[#faf7f2] p-3">
            <p className="text-sm font-semibold">這張調貨單({lines.length} 個品項,共 {totalQty} 件)</p>
            <div className="mt-2 space-y-1">
              {lines.map((l) => (
                <div key={`${l.product_id}|${l.variant_key}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{l.name}{l.variant_key ? `(${l.variant_key})` : ''}</span>
                  <span className="flex shrink-0 items-center gap-3"><b className="tabular-nums">× {l.quantity}</b><button type="button" className="text-xs! text-[#c84767]" onClick={() => setLines((list) => list.filter((x) => x !== l))}>移除</button></span>
                </div>
              ))}
            </div>
            <input className={`${input} mt-3`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註(選填)" maxLength={200} />
            <button type="button" className={`${btnDark} mt-3 w-full`} disabled={busy || from === to} onClick={submit}>{busy ? '調貨中…' : `確認調貨:${name(from)} → ${name(to)}`}</button>
          </div>
        ) : null}
      </div>

      <div className={card}>
        <p className="text-sm font-semibold">調貨紀錄</p>
        {!history ? <p className="mt-2 text-sm text-[#8a7f72]">讀取中…</p> : !history.length ? <p className="mt-2 text-sm text-[#8a7f72]">還沒有調貨紀錄</p> : (
          <div className="mt-2 divide-y divide-[#efe8dd]">
            {history.map((t) => (
              <div key={t.id} className="py-2">
                <button type="button" onClick={() => setDetail(detail === t.id ? '' : t.id)} className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 text-left text-sm!">
                  <span className="font-medium!">{t.doc_no} · {t.from_name} → {t.to_name}</span>
                  <span className="text-xs! text-[#8a7f72]">{dateTime(t.created_at)} · {t.lines.length} 項 {t.lines.reduce((n, l) => n + l.quantity, 0)} 件 · {t.handler.split('@')[0]}</span>
                </button>
                {detail === t.id ? (
                  <div className="mt-1 space-y-0.5 text-sm text-[#6b6156]">
                    {t.lines.map((l, i) => <p key={i}>{l.name}{l.variant_key ? `(${l.variant_key})` : ''} × {l.quantity}</p>)}
                    {t.note ? <p className="text-xs text-[#8a7f72]">備註:{t.note}</p> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- POS 首頁按鈕 ----------
function Buttons({ products, categories }: { products: Product[]; categories: Category[] }) {
  const [buttons, setButtons] = useState<PosButton[] | null>(null);
  const [sel, setSel] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => { api<PosButton[]>('/api/pos/buttons').then((b) => { setButtons(b); setSel(b[0]?.id ?? ''); }).catch(() => setButtons([])); }, 0); return () => clearTimeout(t); }, []);

  const change = (next: PosButton[]) => { setButtons(next); setDirty(true); };
  const current = buttons?.find((b) => b.id === sel) ?? null;
  const patch = (p: Partial<PosButton>) => current && change((buttons ?? []).map((b) => (b.id === current.id ? { ...b, ...p } : b)));
  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;
  const usedCats = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products]);
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return products.filter((p) => (cat === 'all' || p.category === cat) && (!kw || p.name.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw)));
  }, [products, q, cat]);

  function add() {
    const b: PosButton = { id: uid(), name: `按鈕 ${(buttons?.length ?? 0) + 1}`, color: POS_BUTTON_COLORS[(buttons?.length ?? 0) % POS_BUTTON_COLORS.length], productIds: [] };
    change([...(buttons ?? []), b]); setSel(b.id);
  }
  async function fromCategories() {
    if (buttons?.length && !(await uiConfirm('依商品分類建立按鈕,會加在現有按鈕後面(同名的不重複建立)。'))) return;
    const have = new Set((buttons ?? []).map((b) => b.name));
    const made = usedCats.filter((slug) => !have.has(catName(slug))).map((slug, i) => ({
      id: uid(), name: catName(slug).slice(0, 20), color: POS_BUTTON_COLORS[((buttons?.length ?? 0) + i) % POS_BUTTON_COLORS.length], productIds: products.filter((p) => p.category === slug).map((p) => p.id),
    }));
    if (!made.length) return void uiAlert('沒有可以新增的分類');
    change([...(buttons ?? []), ...made]); setSel((s) => s || made[0].id);
  }
  function move(dir: -1 | 1) {
    if (!buttons || !current) return;
    const i = buttons.indexOf(current), j = i + dir;
    if (j < 0 || j >= buttons.length) return;
    const next = [...buttons]; [next[i], next[j]] = [next[j], next[i]]; change(next);
  }
  async function save() {
    setBusy(true);
    try { const saved = await api<PosButton[]>('/api/pos/buttons', { method: 'PUT', body: JSON.stringify(buttons) }); setButtons(saved); setDirty(false); uiToast('已儲存,POS 重新整理後生效'); }
    catch (e) { void uiAlert(errMsg(e)); } finally { setBusy(false); }
  }

  if (!buttons) return <p className="text-sm text-[#8a7f72]">讀取中…</p>;
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">POS 首頁按鈕</p>
            <p className="mt-1 text-xs text-[#8a7f72]">POS 一打開就是這些按鈕(例如一個品牌一顆)。按下去會跳出這顆按鈕底下的商品,選型號後再選顏色、尺寸。沒有設定按鈕時,POS 首頁顯示全部商品。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => void fromCategories()}>依商品分類建立</button>
            <button type="button" className={btn} onClick={add}>＋ 新增按鈕</button>
            <button type="button" className={btnDark} disabled={!dirty || busy} onClick={save}>{busy ? '儲存中…' : dirty ? '儲存' : '已儲存'}</button>
          </div>
        </div>
        {/* 預覽:點一顆來編輯 */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {buttons.map((b) => (
            <button key={b.id} type="button" onClick={() => setSel(b.id)} style={{ background: b.color }}
              className={`flex min-h-[76px] min-w-0 flex-col justify-between rounded-xl p-3 text-left text-white ${sel === b.id ? 'ring-2 ring-[#1f1b19] ring-offset-2' : ''}`}>
              <span className="line-clamp-2 break-words text-base! font-bold! leading-tight">{b.name}</span>
              <span className="text-xs! opacity-75">{b.productIds.length} 款</span>
            </button>
          ))}
          {!buttons.length ? <p className="col-span-full py-6 text-center text-sm text-[#8a7f72]">還沒有按鈕。按「＋ 新增按鈕」或「依商品分類建立」。</p> : null}
        </div>
      </div>

      {current ? (
        <div className={card}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[160px] flex-1 text-sm">按鈕名稱<input className={`${input} mt-1`} value={current.name} maxLength={20} onChange={(e) => patch({ name: e.target.value })} /></label>
            <div className="text-sm">顏色
              <div className="mt-1 flex gap-1.5">
                {POS_BUTTON_COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => patch({ color: c })} style={{ background: c }} className={`h-8 w-8 rounded-full ${current.color === c ? 'ring-2 ring-[#1f1b19] ring-offset-2' : ''}`} />)}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className={btn} onClick={() => move(-1)}>← 往前</button>
              <button type="button" className={btn} onClick={() => move(1)}>往後 →</button>
              <button type="button" className={`${btn} text-[#c84767]`} onClick={async () => { if (await uiConfirm(`刪除按鈕「${current.name}」?`)) { change(buttons.filter((b) => b.id !== current.id)); setSel(buttons.find((b) => b.id !== current.id)?.id ?? ''); } }}>刪除</button>
            </div>
          </div>

          <p className="mt-5 text-sm font-semibold">這顆按鈕底下的商品(已選 {current.productIds.length} 款)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className={`${input} max-w-xs flex-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋商品名稱 / 貨號" />
            <select className={`${select}`} value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">全部分類</option>{usedCats.map((c) => <option key={c} value={c}>{catName(c)}</option>)}</select>
            <button type="button" className={btn} onClick={() => patch({ productIds: [...new Set([...current.productIds, ...list.map((p) => p.id)])].slice(0, 500) })}>全選目前列表</button>
            <button type="button" className={btn} onClick={() => { const drop = new Set(list.map((p) => p.id)); patch({ productIds: current.productIds.filter((id) => !drop.has(id)) }); }}>取消目前列表</button>
          </div>
          <div className="mt-3 grid max-h-[50vh] gap-x-4 overflow-y-auto sm:grid-cols-2">
            {list.map((p) => {
              const on = current.productIds.includes(p.id);
              return (
                <label key={p.id} className="flex items-center gap-2 border-b border-[#efe8dd] py-2 text-sm">
                  <input type="checkbox" checked={on} onChange={(e) => patch({ productIds: e.target.checked ? [...current.productIds, p.id] : current.productIds.filter((id) => id !== p.id) })} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-[#8a7f72]">{catName(p.category)}</span>
                </label>
              );
            })}
            {!list.length ? <p className="py-4 text-sm text-[#8a7f72]">找不到商品</p> : null}
          </div>
          <p className="mt-2 text-xs text-[#8a7f72]">彈窗裡的商品順序 = 勾選的先後順序。改完記得按上方「儲存」。</p>
        </div>
      ) : null}
    </div>
  );
}

// ---------- POS 員工:員工編號、密碼與權限 ----------
function Staff({ locations }: { locations: StockLocation[] }) {
  const [list, setList] = useState<PosStaff[] | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => { api<PosStaff[]>('/api/admin/pos-staff').then(setList).catch(() => setList([])); }, 0); return () => clearTimeout(t); }, []);
  const run = async (fn: () => Promise<PosStaff[]>, done?: string) => {
    setBusy(true);
    try { setList(await fn()); if (done) uiToast(done); return true; } catch (e) { void uiAlert(errMsg(e)); return false; } finally { setBusy(false); }
  };
  const patch = (id: string, body: Record<string, unknown>, done?: string) => run(() => api('/api/admin/pos-staff', { method: 'PATCH', body: JSON.stringify({ id, ...body }) }), done);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const places = locations.filter((l) => l.active);
  const money = (n: number) => `NT$${Math.round(n).toLocaleString('en-US')}`;

  async function resetPassword(staff: PosStaff) {
    const next = await uiPrompt(`幫「${staff.name || staff.code}」設定新密碼(至少 4 個字)`);
    if (next === null) return;
    void patch(staff.id, { password: next }, '密碼已更新');
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-sm font-semibold">新增 POS 員工</p>
        <p className="mt-1 text-xs text-[#8a7f72]">在這裡幫員工建立「員工編號」和「密碼」。員工打開 <b>/pos</b>,用員工編號和密碼登入就能結帳,不需要會員帳號,也進不了後台。每一筆 POS 訂單都會記下是哪位員工賣的。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className={`${input} max-w-[160px] flex-1`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="員工編號(例:A01)" maxLength={20} autoComplete="off" />
          <input className={`${input} max-w-[180px] flex-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名(印在收據)" maxLength={30} autoComplete="off" />
          <input className={`${input} max-w-[180px] flex-1`} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密碼(至少 4 個字)" maxLength={64} autoComplete="new-password" />
          <button type="button" className={btnDark} disabled={busy || !code.trim() || password.length < 4} onClick={async () => { if (await run(() => api('/api/admin/pos-staff', { method: 'POST', body: JSON.stringify({ code, name, password, permissions: ['orders'] }) }), '已新增')) { setCode(''); setName(''); setPassword(''); } }}>新增</button>
        </div>
        <p className="mt-2 text-xs text-[#8a7f72]">密碼存進系統後就看不到了;員工忘記密碼時,按「重設密碼」幫他設新的。連續輸錯 5 次會鎖 5 分鐘,重設密碼可以馬上解鎖。</p>
      </div>

      {!list ? <p className="text-sm text-[#8a7f72]">讀取中…</p> : !list.length ? <div className={card}><p className="text-sm text-[#6b6156]">還沒有 POS 員工。沒有員工時,只有能進後台的管理員可以用 POS。</p></div> : list.map((s) => (
        <div key={s.id} className={`${card} ${s.active ? '' : 'opacity-60'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[#8a7f72]">編號<input className={`${input} w-24 font-semibold!`.replace('w-full ', '')} defaultValue={s.code} maxLength={20} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.code) void patch(s.id, { code: v }, '已更新').then((ok) => { if (!ok) e.target.value = s.code; }); else e.target.value = s.code; }} /></label>
            <label className="flex min-w-[140px] flex-1 items-center gap-1.5 text-xs text-[#8a7f72]">姓名<input className={`${input} font-semibold!`} defaultValue={s.name} placeholder="姓名" maxLength={30} onBlur={(e) => { const v = e.target.value.trim(); if (v !== s.name) void patch(s.id, { name: v }, '已更新'); }} /></label>
            <button type="button" className={btn} disabled={busy} onClick={() => void resetPassword(s)}>重設密碼</button>
            <button type="button" className={btn} disabled={busy} onClick={() => void patch(s.id, { active: !s.active }, s.active ? '已停用' : '已啟用')}>{s.active ? '停用' : '啟用'}</button>
            <button type="button" className={`${btn} text-[#c84767]`} disabled={busy} onClick={async () => { if (await uiConfirm(`移除「${s.name || s.code}」?移除後他馬上不能再登入 POS;已經賣出的訂單仍會保留銷售人員。`)) void run(() => api(`/api/admin/pos-staff?id=${s.id}`, { method: 'DELETE' }), '已移除'); }}>移除</button>
          </div>
          <p className="mt-2 text-xs text-[#8a7f72]">本月銷售 {s.stats?.orders ?? 0} 筆 · {money(s.stats?.net ?? 0)}{s.last_login_at ? ` · 上次登入 ${dateTime(s.last_login_at)}` : ' · 還沒登入過'}</p>
          <p className="mt-4 text-xs font-medium text-[#8a7f72]">可以做的事(結帳、找會員、掛單不用勾,每個員工都可以)</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {POS_PERMISSIONS.map((p) => (
              <label key={p.key} className="flex items-start gap-2 rounded-lg border border-[#efe8dd] px-3 py-2 text-sm">
                <input type="checkbox" className="mt-0.5" disabled={busy} checked={s.permissions.includes(p.key)} onChange={() => void patch(s.id, { permissions: toggle<PosPermission>(s.permissions, p.key) })} />
                <span>{p.label}<span className="block text-xs text-[#8a7f72]">{p.hint}</span></span>
              </label>
            ))}
          </div>
          {places.length > 1 ? (
            <>
              <p className="mt-4 text-xs font-medium text-[#8a7f72]">可以用的據點(都不勾 = 全部據點)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {places.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 rounded-lg border border-[#efe8dd] px-3 py-2 text-sm">
                    <input type="checkbox" disabled={busy} checked={s.location_ids.includes(l.id)} onChange={() => void patch(s.id, { location_ids: toggle(s.location_ids, l.id) })} />{l.name}
                  </label>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
