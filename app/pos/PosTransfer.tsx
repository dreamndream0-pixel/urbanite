'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { findByCode, variantKey, type PosProduct } from '@/lib/pos';
import type { StockTransfer, TransferLine } from '@/lib/stock-locations';
import { uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { Modal } from './PosPanels';
import { api, btnDark, chip, errMsg, input, label, timeLabel } from './ui';

type Place = { id: string; name: string; kind: string; is_default: boolean };
type Data = { transfers: StockTransfer[]; locations: Place[]; stock: Record<string, number> };

// POS 調撥:把商品從本店調到別店(調出),或從別店調進本店(調入)。總庫存不變,只搬動各據點的數量。
export function TransferPanel({ here, products, onDone, onClose }: { here: { id: string; name: string }; products: PosProduct[]; onDone: () => void; onClose: () => void }) {
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [other, setOther] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState('');
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'new' | 'history'>('new');

  const from = direction === 'out' ? here.id : other;
  const to = direction === 'out' ? other : here.id;
  const places = (data?.locations ?? []).filter((l) => l.id !== here.id);
  const name = (id: string) => (data?.locations ?? []).find((l) => l.id === id)?.name ?? '';

  const load = useCallback(async (fromId: string) => {
    try { setData(await api<Data>(`/api/pos/transfers?from=${encodeURIComponent(fromId)}`)); }
    catch (e) { uiToast(errMsg(e)); onClose(); }
  }, [onClose]);
  // 調出據點換了 → 重新讀那邊的數量,已選的品項清掉(數量依據不同)
  useEffect(() => { const t = setTimeout(() => void load(from), 0); return () => clearTimeout(t); }, [load, from]);
  useEffect(() => {
    if (!other && places.length) { const t = setTimeout(() => setOther(places[0].id), 0); return () => clearTimeout(t); }
  }, [other, places]);

  const have = (pid: string, key: string) => data?.stock[`${pid}|${key}`] ?? 0;
  const qtyOf = (pid: string, key: string) => lines.find((l) => l.product_id === pid && l.variant_key === key)?.quantity ?? 0;
  const setQty = (p: PosProduct, key: string, quantity: number) => setLines((list) => {
    const rest = list.filter((l) => !(l.product_id === p.id && l.variant_key === key));
    const n = Math.max(0, Math.min(have(p.id, key), quantity));
    return n > 0 ? [...rest, { product_id: p.id, variant_key: key, name: p.name, quantity: n }] : rest;
  });
  const total = lines.reduce((n, l) => n + l.quantity, 0);

  // 搜尋:名稱 / 貨號 / 條碼;只列調出據點有貨的商品
  const matches = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const withStock = products.filter((p) => (p.variants?.length ? p.variants.map((v) => variantKey(v.options)) : ['']).some((k) => have(p.id, k) > 0));
    const list = kw ? withStock.filter((p) => p.name.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw) || (p.barcode ?? '').toLowerCase().includes(kw) || (p.variants ?? []).some((v) => (v.barcode ?? '').toLowerCase().includes(kw))) : withStock;
    return list.slice(0, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, q, data]);

  // 掃條碼 / 輸入貨號按 Enter:那個品項 +1
  function scan() {
    const hit = findByCode(products, q);
    if (!hit) return;
    if (hit.variant === null) { setOpenId(hit.product.id); return; }
    if (have(hit.product.id, hit.variant) <= qtyOf(hit.product.id, hit.variant)) { uiToast(`「${hit.product.name}」在「${name(from)}」沒有更多了`); return; }
    setQty(hit.product, hit.variant, qtyOf(hit.product.id, hit.variant) + 1);
    setQ('');
  }

  async function submit() {
    if (!(await uiConfirm(`把 ${lines.length} 個品項、共 ${total} 件\n從「${name(from)}」調到「${name(to)}」?`))) return;
    setBusy(true);
    try {
      const r = await api<{ transfer: StockTransfer }>('/api/pos/transfers', { method: 'POST', body: JSON.stringify({ from, to, lines, note }) });
      uiToast(`調撥完成 ${r.transfer.doc_no}`);
      setLines([]); setNote(''); setQ('');
      onDone();
      await load(from);
      setTab('history');
    } catch (e) { uiToast(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Modal wide title="調撥" onClose={onClose} footer={tab === 'new' ? (
      <button type="button" disabled={busy || !lines.length || !other} className={`${btnDark} w-full py-3`} onClick={submit}>
        {busy ? '調撥中…' : lines.length ? `確認調撥:${name(from)} → ${name(to)}(${total} 件)` : '選擇要調撥的商品'}
      </button>
    ) : undefined}>
      <div className="mb-3 flex gap-2">
        {([['new', '新增調撥'], ['history', '調撥紀錄']] as const).map(([k, t]) => <button key={k} type="button" onClick={() => setTab(k)} className={`${chip} ${tab === k ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'}`}>{t}</button>)}
      </div>

      {!data ? <p className="py-8 text-center text-sm! text-[#8a7f72]">讀取中…</p> : tab === 'history' ? (
        <div className="space-y-2">
          {!data.transfers.length ? <p className="py-8 text-center text-sm! text-[#8a7f72]">還沒有調撥紀錄</p> : data.transfers.map((t) => (
            <div key={t.id} className="rounded-xl border border-[#e5ded4] px-3 py-2.5">
              <p className="text-sm! font-semibold!">{t.from_name} → {t.to_name}<span className="ml-2 text-xs! font-normal! text-[#8a7f72]">{t.doc_no}</span></p>
              <p className="text-xs! text-[#8a7f72]">{timeLabel(t.created_at)} · {t.lines.reduce((n, l) => n + l.quantity, 0)} 件 · {t.handler.split('@')[0]}</p>
              <p className="mt-1 text-xs! text-[#5f5852]">{t.lines.map((l) => `${l.name}${l.variant_key ? `(${l.variant_key})` : ''}×${l.quantity}`).join('、')}</p>
              {t.note ? <p className="mt-0.5 text-xs! text-[#8a7f72]">備註:{t.note}</p> : null}
            </div>
          ))}
        </div>
      ) : !places.length ? (
        <p className="py-8 text-center text-sm! text-[#8a7f72]">只有一個據點,沒有地方可以調撥。請先到後台新增分店 / 倉庫。</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-end">
            <div>
              <span className={label}>方向</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setDirection('out'); setLines([]); }} className={`${chip} ${direction === 'out' ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'}`}>調出(本店 → 別店)</button>
                <button type="button" onClick={() => { setDirection('in'); setLines([]); }} className={`${chip} ${direction === 'in' ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'}`}>調入(別店 → 本店)</button>
              </div>
            </div>
            <label>
              <span className={label}>{direction === 'out' ? '調到' : '從哪裡調來'}</span>
              <select className={input} value={other} onChange={(e) => { setOther(e.target.value); setLines([]); }}>
                {places.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          </div>
          <p className="mt-2 rounded-lg bg-[#faf7f2] px-3 py-2 text-sm! text-[#5f5852]">從 <b>{name(from)}</b> 調到 <b>{name(to)}</b>;下面的數量是「{name(from)}」現有的。</p>

          <form className="mt-3" onSubmit={(e) => { e.preventDefault(); scan(); }}>
            <input className={input} value={q} onChange={(e) => { setQ(e.target.value); setOpenId(''); }} placeholder="搜尋商品 / 掃描條碼後按 Enter" enterKeyHint="search" autoComplete="off" />
          </form>

          <div className="mt-2 space-y-2">
            {!matches.length ? <p className="py-6 text-center text-sm! text-[#8a7f72]">{q.trim() ? '找不到商品' : `「${name(from)}」目前沒有庫存`}</p> : null}
            {matches.map((p) => {
              const keys = p.variants?.length ? p.variants.map((v) => variantKey(v.options)) : [''];
              const open = openId === p.id || keys.length === 1;
              const picked = keys.reduce((n, k) => n + qtyOf(p.id, k), 0);
              return (
                <div key={p.id} className={`rounded-xl border ${picked ? 'border-[#1f1b19]' : 'border-[#e5ded4]'}`}>
                  <button type="button" onClick={() => setOpenId(openId === p.id ? '' : p.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                    <span className="min-w-0 truncate text-sm! font-semibold!">{p.name}</span>
                    <span className="shrink-0 text-xs! text-[#8a7f72]">{picked ? `已選 ${picked} · ` : ''}有 {keys.reduce((n, k) => n + have(p.id, k), 0)}{keys.length > 1 ? (open ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                  {open ? (
                    <div className="grid gap-x-4 gap-y-1.5 border-t border-[#efe8dd] px-3 py-2.5 sm:grid-cols-2">
                      {keys.filter((k) => have(p.id, k) > 0).map((k) => (
                        <div key={k} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm!">{k || '數量'} <span className="text-xs! text-[#8a7f72]">(有 {have(p.id, k)})</span></span>
                          <span className="flex shrink-0 items-center gap-1">
                            <button type="button" disabled={!qtyOf(p.id, k)} onClick={() => setQty(p, k, qtyOf(p.id, k) - 1)} className="h-9 w-9 rounded-lg border border-[#d7c9bd] text-lg! disabled:opacity-30">−</button>
                            <input className="h-9 w-12 rounded-lg border border-[#e5ded4] text-center text-base! tabular-nums! outline-none" inputMode="numeric" value={qtyOf(p.id, k) || ''} placeholder="0"
                              onChange={(e) => setQty(p, k, Math.floor(Number(e.target.value.replace(/[^\d]/g, '')) || 0))} />
                            <button type="button" disabled={qtyOf(p.id, k) >= have(p.id, k)} onClick={() => setQty(p, k, qtyOf(p.id, k) + 1)} className="h-9 w-9 rounded-lg border border-[#d7c9bd] text-lg! disabled:opacity-30">+</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {lines.length ? (
            <div className="mt-4 rounded-xl bg-[#faf7f2] p-3">
              <p className="text-sm! font-semibold!">這次調撥({lines.length} 項,共 {total} 件)</p>
              <div className="mt-1.5 space-y-1">
                {lines.map((l) => (
                  <div key={`${l.product_id}|${l.variant_key}`} className="flex items-center justify-between gap-2 text-sm!">
                    <span className="min-w-0 truncate">{l.name}{l.variant_key ? `(${l.variant_key})` : ''}</span>
                    <span className="flex shrink-0 items-center gap-3"><b className="tabular-nums!">× {l.quantity}</b><button type="button" className="text-xs! text-[#c84767]" onClick={() => setLines((list) => list.filter((x) => x !== l))}>移除</button></span>
                  </div>
                ))}
              </div>
              <input className={`${input} mt-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註(選填)" maxLength={200} />
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
