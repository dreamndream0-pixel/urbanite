'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CASH, posMoney, settlePayments, variantKey, type PosDiscount, type PosProduct, type PosSession, type PosSessionSummary, type PosSettings } from '@/lib/pos';
import type { Order } from '@/lib/types';
import { uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { api, btn, btnDanger, btnDark, chip, errMsg, fullTime, input, label, timeLabel, toInt, todayTaipei, type CartLine, type Member, type SessionView } from './ui';

// ---------- 彈窗外框(手機從下方滑出、桌機置中) ----------
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#eee6da] px-4 py-3">
          <h2 className="text-base! font-semibold!">{title}</h2>
          <button type="button" onClick={onClose} aria-label="關閉" className="grid h-9 w-9 place-items-center rounded-full text-xl! text-[#8a7f72] active:bg-[#f3ede4]">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-[#eee6da] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div> : null}
      </div>
    </div>
  );
}

const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <div className={`flex justify-between gap-3 py-0.5 ${strong ? 'font-bold!' : ''}`}><span>{k}</span><span className="tabular-nums!">{v}</span></div>
);

// ---------- 收據(畫面預覽與列印共用) ----------
export function Receipt({ order, settings, shopName }: { order: Order; settings: PosSettings; shopName: string }) {
  const pos = order.pos;
  const coupon = Math.max(0, (order.discount || 0) - (pos?.manual_discount ?? 0));
  return (
    <div className="pos-receipt text-[12px]! leading-[1.5] text-black">
      <p className="text-center text-[15px]! font-bold!">{settings.receiptTitle || shopName}</p>
      {settings.receiptHeader ? <p className="whitespace-pre-line text-center">{settings.receiptHeader}</p> : null}
      <div className="my-1.5 border-t border-dashed border-black" />
      <Row k="單號" v={order.order_no} />
      <Row k="時間" v={fullTime(order.created_at)} />
      {pos?.cashier ? <Row k="收銀" v={pos.cashier.split('@')[0]} /> : null}
      {order.customer_name && order.customer_name !== '門市顧客' ? <Row k="顧客" v={order.customer_name} /> : null}
      <div className="my-1.5 border-t border-dashed border-black" />
      {order.items.map((it, i) => (
        <div key={i} className="py-0.5">
          <p>{it.name}{it.variant && it.variant !== '標準款' ? `(${it.variant})` : ''}{it.returned_qty ? ` ※已退 ${it.returned_qty}` : ''}</p>
          <div className="flex justify-between tabular-nums!"><span>{posMoney(it.price)} × {it.quantity}</span><span>{posMoney(it.price * it.quantity)}</span></div>
        </div>
      ))}
      <div className="my-1.5 border-t border-dashed border-black" />
      <Row k="小計" v={posMoney(order.subtotal)} />
      {pos?.manual_discount ? <Row k={pos.discount_label || '折讓'} v={`-${posMoney(pos.manual_discount)}`} /> : null}
      {coupon ? <Row k={`折扣碼 ${order.discount_code}`} v={`-${posMoney(coupon)}`} /> : null}
      {order.credit_used ? <Row k="回饋金折抵" v={`-${posMoney(order.credit_used)}`} /> : null}
      <Row k="合計" v={posMoney(order.total)} strong />
      {(pos?.payments ?? []).map((p, i) => <Row key={i} k={p.method} v={posMoney(p.method === CASH ? p.amount + (pos?.change ?? 0) : p.amount)} />)}
      {pos?.change ? <Row k="找零" v={posMoney(pos.change)} /> : null}
      {order.refund_amount ? <Row k="已退款" v={`-${posMoney(order.refund_amount)}`} strong /> : null}
      {order.note ? <p className="mt-1">備註:{order.note}</p> : null}
      <div className="my-1.5 border-t border-dashed border-black" />
      {settings.receiptFooter ? <p className="whitespace-pre-line text-center">{settings.receiptFooter}</p> : null}
    </div>
  );
}

// ---------- 交班表(畫面與列印共用) ----------
export function ShiftReport({ session, summary, shopName }: { session: PosSession; summary: PosSessionSummary; shopName: string }) {
  return (
    <div className="pos-receipt text-[12px]! leading-[1.5] text-black">
      <p className="text-center text-[15px]! font-bold!">{shopName} 交班表</p>
      <div className="my-1.5 border-t border-dashed border-black" />
      <Row k="開班" v={`${fullTime(session.opened_at)}`} />
      <Row k="開班人員" v={session.opened_by.split('@')[0]} />
      {session.closed_at ? <><Row k="交班" v={fullTime(session.closed_at)} /><Row k="交班人員" v={session.closed_by.split('@')[0]} /></> : null}
      <div className="my-1.5 border-t border-dashed border-black" />
      <Row k="成交筆數" v={`${summary.orders} 筆 / ${summary.items} 件`} />
      <Row k="銷售金額" v={posMoney(summary.gross)} />
      <Row k="退款" v={`-${posMoney(summary.refunds)}`} />
      <Row k="淨額" v={posMoney(summary.gross - summary.refunds)} strong />
      <div className="my-1.5 border-t border-dashed border-black" />
      {summary.byMethod.map((m) => <Row key={m.method} k={m.method} v={`${posMoney(m.sales)}${m.refunds ? `(退 ${posMoney(m.refunds)})` : ''}`} />)}
      <div className="my-1.5 border-t border-dashed border-black" />
      <Row k="零用金" v={posMoney(session.opening_cash)} />
      <Row k="現金存入" v={posMoney(summary.cashIn)} />
      <Row k="現金取出" v={`-${posMoney(summary.cashOut)}`} />
      <Row k="應有現金" v={posMoney(summary.expectedCash)} strong />
      {session.counted_cash != null ? <><Row k="點鈔金額" v={posMoney(session.counted_cash)} /><Row k="差額" v={`${(session.difference ?? 0) > 0 ? '+' : ''}${posMoney(session.difference ?? 0)}`} strong /></> : null}
      {session.note ? <p className="mt-1">備註:{session.note}</p> : null}
    </div>
  );
}

// ---------- 規格選擇(兩個以上的規格維度:先選第一個,例如顏色,再選其餘) ----------
export function VariantPicker({ product, binding, onPick, onClose }: { product: PosProduct; binding: string; onPick: (variant: string) => void; onClose: () => void }) {
  const twoStep = product.variants.length > 6 && product.variants.every((v) => v.options.length >= 2);
  const firsts = useMemo(() => [...new Set(product.variants.map((v) => v.options[0]))], [product]);
  const [first, setFirst] = useState(twoStep && firsts.length > 1 ? '' : firsts[0] ?? '');
  const list = twoStep ? product.variants.filter((v) => v.options[0] === first) : product.variants;
  const dim = product.specs?.[0]?.name || '規格';
  return (
    <Modal title={binding ? `綁定條碼到:${product.name}` : product.name} onClose={onClose}>
      {binding ? <p className="mb-3 text-sm! text-[#8a7f72]">條碼 {binding} 要綁到哪個規格?</p> : null}
      {twoStep ? (
        <>
          <p className={label}>{dim}</p>
          <div className="mb-4 flex max-h-[30dvh] flex-wrap gap-2 overflow-y-auto overscroll-contain">
            {firsts.map((o) => {
              const stock = product.variants.filter((v) => v.options[0] === o).reduce((n, v) => n + (v.inventory ?? 0), 0);
              return <button key={o} type="button" onClick={() => setFirst(o)} className={`${chip} ${first === o ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : stock <= 0 ? 'border-[#eee6da] text-[#b3a99b]' : 'border-[#d7c9bd]'}`}>{o}</button>;
            })}
          </div>
          {first ? <p className={label}>{product.specs?.slice(1).map((d) => d.name).join(' / ') || '規格'}</p> : <p className="text-sm! text-[#8a7f72]">先選{dim}</p>}
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((v) => {
          const key = variantKey(v.options);
          const out = (v.inventory ?? 0) <= 0;
          return (
            <button key={key} type="button" onClick={() => onPick(key)}
              className={`rounded-xl border px-3 py-3 text-left active:bg-[#f3ede4] ${out ? 'border-[#eee6da] text-[#b3a99b]' : 'border-[#d7c9bd]'}`}>
              <span className="block text-sm! font-semibold!">{twoStep ? v.options.slice(1).join(' / ') : key}</span>
              <span className="mt-0.5 flex justify-between gap-1 text-xs! tabular-nums!"><span>{posMoney(v.price ?? product.price)}</span><span className={out ? 'text-[#c84767]' : 'text-[#8a7f72]'}>庫存 {v.inventory ?? 0}</span></span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------- 單一品項:改數量 / 改價 ----------
export function LineEditor({ line, onSave, onRemove, onClose }: { line: CartLine; onSave: (patch: Partial<CartLine>) => void; onRemove: () => void; onClose: () => void }) {
  const [price, setPrice] = useState(String(line.price));
  const [qty, setQty] = useState(String(line.quantity));
  const off = (pct: number) => setPrice(String(Math.round((line.listPrice * (100 - pct)) / 100)));
  return (
    <Modal title={line.name} onClose={onClose} footer={
      <div className="flex gap-2">
        <button type="button" className={btnDanger} onClick={onRemove}>移除</button>
        <button type="button" className={`${btnDark} flex-1`} onClick={() => onSave({ price: toInt(price), quantity: Math.max(1, toInt(qty)) })}>確定</button>
      </div>
    }>
      {line.variant ? <p className="mb-3 text-sm! text-[#8a7f72]">{line.variant}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <label><span className={label}>數量</span><input className={input} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} onFocus={(e) => e.target.select()} /></label>
        <label><span className={label}>單價(定價 {posMoney(line.listPrice)})</span><input className={input} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} onFocus={(e) => e.target.select()} /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[5, 10, 15, 20, 30, 50].map((p) => <button key={p} type="button" className={`${chip} border-[#d7c9bd]`} onClick={() => off(p)}>{100 - p === 50 ? '5 折' : `${(100 - p) / 10} 折`}</button>)}
        <button type="button" className={`${chip} border-[#d7c9bd]`} onClick={() => setPrice(String(line.listPrice))}>原價</button>
        <button type="button" className={`${chip} border-[#d7c9bd]`} onClick={() => setPrice('0')}>贈品</button>
      </div>
    </Modal>
  );
}

// ---------- 整筆折扣 / 折扣碼 ----------
export function DiscountEditor({ subtotal, discount, code, onSave, onClose }: { subtotal: number; discount: PosDiscount | null; code: string; onSave: (d: PosDiscount | null, code: string) => void; onClose: () => void }) {
  const [type, setType] = useState<PosDiscount['type']>(discount?.type ?? 'amount');
  const [value, setValue] = useState(discount ? String(discount.value) : '');
  const [coupon, setCoupon] = useState(code);
  const n = Number(value) || 0;
  return (
    <Modal title="整筆折扣" onClose={onClose} footer={
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={() => onSave(null, '')}>清除</button>
        <button type="button" className={`${btnDark} flex-1`} onClick={() => onSave(n > 0 ? { type, value: type === 'percent' ? Math.min(100, n) : Math.floor(n) } : null, coupon.trim().toUpperCase())}>套用</button>
      </div>
    }>
      <div className="mb-3 flex gap-2">
        <button type="button" className={`${chip} ${type === 'amount' ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'}`} onClick={() => setType('amount')}>折金額</button>
        <button type="button" className={`${chip} ${type === 'percent' ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'}`} onClick={() => setType('percent')}>折 %</button>
      </div>
      <label><span className={label}>{type === 'amount' ? '折讓金額(元)' : '折掉幾 %(例:10 = 九折)'}</span>
        <input className={input} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" autoFocus /></label>
      {type === 'percent' ? <div className="mt-2 flex flex-wrap gap-2">{[5, 10, 15, 20, 30].map((p) => <button key={p} type="button" className={`${chip} border-[#d7c9bd]`} onClick={() => setValue(String(p))}>{(100 - p) / 10} 折</button>)}</div> : null}
      <p className="mt-2 text-xs! text-[#8a7f72]">小計 {posMoney(subtotal)}</p>
      <label className="mt-4 block"><span className={label}>折扣碼(選填)</span>
        <input className={input} value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="輸入折扣碼" autoCapitalize="characters" /></label>
    </Modal>
  );
}

// ---------- 找會員 ----------
export function MemberPicker({ current, onPick, onClose }: { current: Member | null; onPick: (m: Member | null) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const short = q.trim().length < 2;
    const t = setTimeout(() => {
      if (short) { setList([]); setBusy(false); return; }
      setBusy(true);
      api<Member[]>(`/api/pos/customers?q=${encodeURIComponent(q.trim())}`).then((r) => { if (alive) setList(r); }).catch(() => {}).finally(() => { if (alive) setBusy(false); });
    }, short ? 0 : 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  return (
    <Modal title="選擇會員" onClose={onClose} footer={current ? <button type="button" className={`${btn} w-full`} onClick={() => onPick(null)}>取消選擇(改回一般顧客)</button> : undefined}>
      <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="輸入姓名、手機或 Email(至少 2 個字)" autoFocus />
      <div className="mt-3 space-y-2">
        {busy ? <p className="text-sm! text-[#8a7f72]">搜尋中…</p> : null}
        {!busy && q.trim().length >= 2 && !list.length ? <p className="text-sm! text-[#8a7f72]">找不到會員。顧客要先在官網註冊才會出現在這裡。</p> : null}
        {list.map((m) => (
          <button key={m.user_id} type="button" onClick={() => onPick(m)} className="block w-full rounded-xl border border-[#e5ded4] px-3 py-2.5 text-left active:bg-[#f3ede4]">
            <span className="block text-sm! font-semibold!">{m.name || m.nickname || '(未填姓名)'}</span>
            <span className="block truncate text-xs! text-[#8a7f72]">{[m.phone, m.email].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------- 收款 ----------
export function PayModal({ total, methods, busy, onPay, onClose }: { total: number; methods: string[]; busy: boolean; onPay: (payments: { method: string; amount: number }[]) => void; onClose: () => void }) {
  const [amounts, setAmounts] = useState<Record<string, string>>({ [CASH]: '' });
  const [active, setActive] = useState(CASH);
  const payments = useMemo(() => methods.map((m) => ({ method: m, amount: toInt(amounts[m] ?? '') })), [methods, amounts]);
  const settle = settlePayments(total, payments);
  const others = (m: string) => payments.filter((p) => p.method !== m).reduce((n, p) => n + p.amount, 0);
  const set = (m: string, v: number) => setAmounts((a) => ({ ...a, [m]: v > 0 ? String(v) : '' }));
  const pick = (m: string) => { setActive(m); if (!toInt(amounts[m] ?? '')) set(m, Math.max(0, total - others(m))); };
  const quick = [...new Set([100, 500, 1000].map((unit) => Math.ceil(Math.max(1, total - others(CASH)) / unit) * unit))].filter((v) => v > total - others(CASH));
  const press = (key: string) => setAmounts((a) => {
    const cur = a[active] ?? '';
    return { ...a, [active]: key === 'C' ? '' : key === '←' ? cur.slice(0, -1) : `${cur}${key}`.replace(/^0+(?=\d)/, '').slice(0, 8) };
  });
  const ok = total === 0 || !settle.error;
  return (
    <Modal title="收款" onClose={onClose} footer={
      <button type="button" disabled={busy || !ok} className={`${btnDark} w-full py-3.5 text-base!`} onClick={() => onPay(settle.list)}>
        {busy ? '結帳中…' : settle.change > 0 ? `完成結帳(找零 ${posMoney(settle.change)})` : '完成結帳'}
      </button>
    }>
      <div className="rounded-2xl bg-[#1f1b19] px-4 py-3 text-white">
        <div className="flex items-baseline justify-between"><span className="text-sm! opacity-70">應收</span><span className="text-3xl! font-bold! tabular-nums!">{posMoney(total)}</span></div>
        <div className="mt-1 flex justify-between text-sm! tabular-nums!">
          <span className="opacity-70">已收 {posMoney(settle.tendered)}</span>
          <span className={settle.remaining > 0 ? 'text-[#ffb4c2]' : 'text-[#b9f3cd]'}>{settle.remaining > 0 ? `還差 ${posMoney(settle.remaining)}` : `找零 ${posMoney(settle.change)}`}</span>
        </div>
      </div>
      {total > 0 ? (
        <>
          <div className="mt-3 space-y-2">
            {methods.map((m) => (
              <div key={m} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${active === m ? 'border-[#1f1b19]' : 'border-[#e5ded4]'}`} onClick={() => pick(m)}>
                <span className="w-20 shrink-0 text-sm! font-semibold!">{m}</span>
                <input className="min-w-0 flex-1 bg-transparent text-right text-lg! tabular-nums! outline-none" inputMode="numeric" placeholder="0"
                  value={amounts[m] ?? ''} onFocus={() => setActive(m)} onChange={(e) => setAmounts((a) => ({ ...a, [m]: e.target.value.replace(/[^\d]/g, '').slice(0, 8) }))} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={`${chip} border-[#d7c9bd]`} onClick={() => set(active, Math.max(0, total - others(active)))}>剛好</button>
            {quick.map((v) => <button key={v} type="button" className={`${chip} border-[#d7c9bd]`} onClick={() => { setActive(CASH); set(CASH, v); }}>現金 {v.toLocaleString('en-US')}</button>)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '←'].map((k) => (
              <button key={k} type="button" onClick={() => press(k)} className="rounded-xl border border-[#e5ded4] py-3 text-lg! font-semibold! tabular-nums! active:bg-[#f3ede4]">{k}</button>
            ))}
          </div>
          {settle.error && settle.tendered > 0 && settle.error !== '收款金額不足' ? <p className="mt-2 text-sm! text-[#c84767]">{settle.error}</p> : null}
        </>
      ) : <p className="mt-3 text-sm! text-[#8a7f72]">這筆不需要收款,直接完成結帳。</p>}
    </Modal>
  );
}

// ---------- 結帳完成 ----------
export function DoneModal({ order, settings, shopName, onPrint, onClose }: { order: Order; settings: PosSettings; shopName: string; onPrint: () => void; onClose: () => void }) {
  return (
    <Modal title="結帳完成" onClose={onClose} footer={
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={onPrint}>列印收據</button>
        <button type="button" className={`${btnDark} flex-1`} onClick={onClose} autoFocus>下一筆</button>
      </div>
    }>
      {order.pos?.change ? <div className="mb-3 rounded-2xl bg-[#e9f7ee] px-4 py-3 text-center"><p className="text-sm! text-[#1f7a44]">找零</p><p className="text-3xl! font-bold! tabular-nums! text-[#1f7a44]">{posMoney(order.pos.change)}</p></div> : null}
      <div className="mx-auto max-w-[300px] rounded-xl border border-[#eee6da] bg-white p-3"><Receipt order={order} settings={settings} shopName={shopName} /></div>
    </Modal>
  );
}

// ---------- 退貨 / 作廢 ----------
function RefundModal({ order, methods, onDone, onClose }: { order: Order; methods: string[]; onDone: (o: Order) => void; onClose: () => void }) {
  const left = (i: number) => order.items[i].quantity - (order.items[i].returned_qty ?? 0);
  const [qty, setQty] = useState<number[]>(() => order.items.map(() => 0));
  const [method, setMethod] = useState(order.pos?.payments?.[0]?.method ?? CASH);
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const all = order.items.every((_, i) => qty[i] === left(i));
  const goods = order.items.reduce((n, it, i) => n + it.price * qty[i], 0);
  const refundable = order.total - (order.refund_amount ?? 0);
  const estimate = Math.min(refundable, all ? refundable : Math.round(goods * (order.subtotal > 0 ? order.total / order.subtotal : 0)));
  const options = [...new Set([...(order.pos?.payments ?? []).map((p) => p.method), ...methods])];
  async function submit() {
    if (!(await uiConfirm(`確定退貨並退款 ${posMoney(estimate)}(${method})?${restock ? '\n商品會加回庫存。' : '\n商品不加回庫存。'}`))) return;
    setBusy(true);
    try {
      const r = await api<{ order: Order; amount: number }>(`/api/pos/orders/${order.id}/refund`, { method: 'POST', body: JSON.stringify({ items: qty.map((quantity, index) => ({ index, quantity })).filter((x) => x.quantity > 0), method, restock, reason }) });
      uiToast(`已退款 ${posMoney(r.amount)}`);
      onDone(r.order);
    } catch (e) { uiToast(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title={`退貨 ${order.order_no}`} onClose={onClose} footer={
      <button type="button" disabled={busy || !qty.some((q) => q > 0)} className={`${btnDark} w-full`} onClick={submit}>{busy ? '處理中…' : `退款 ${posMoney(estimate)}`}</button>
    }>
      <button type="button" className={`${btn} mb-3 w-full`} onClick={() => setQty(order.items.map((_, i) => left(i)))}>全部退(整筆作廢)</button>
      <div className="space-y-2">
        {order.items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl border border-[#e5ded4] px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm! font-medium!">{it.name}</p>
              <p className="text-xs! text-[#8a7f72]">{it.variant} · {posMoney(it.price)} · 可退 {left(i)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" disabled={qty[i] <= 0} onClick={() => setQty((q) => q.map((v, j) => (j === i ? v - 1 : v)))} className="h-9 w-9 rounded-lg border border-[#d7c9bd] text-lg! disabled:opacity-30">−</button>
              <span className="w-7 text-center tabular-nums!">{qty[i]}</span>
              <button type="button" disabled={qty[i] >= left(i)} onClick={() => setQty((q) => q.map((v, j) => (j === i ? v + 1 : v)))} className="h-9 w-9 rounded-lg border border-[#d7c9bd] text-lg! disabled:opacity-30">+</button>
            </div>
          </div>
        ))}
      </div>
      <p className={`${label} mt-4`}>退款方式</p>
      <div className="flex flex-wrap gap-2">
        {options.map((m) => <button key={m} type="button" onClick={() => setMethod(m)} className={`${chip} ${method === m ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'}`}>{m}</button>)}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm!"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />商品加回庫存(瑕疵品不加回請取消勾選)</label>
      <label className="mt-3 block"><span className={label}>原因(選填)</span><input className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例:尺寸不合" /></label>
    </Modal>
  );
}

// ---------- POS 訂單(今日 / 指定日期 / 搜尋) ----------
export function OrdersPanel({ settings, shopName, onPrint, onChanged, onClose }: { settings: PosSettings; shopName: string; onPrint: (o: Order) => void; onChanged: () => void; onClose: () => void }) {
  const [date, setDate] = useState(todayTaipei());
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [refund, setRefund] = useState<Order | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      setOrders(null);
      api<Order[]>(q.trim() ? `/api/pos/orders?q=${encodeURIComponent(q.trim())}` : `/api/pos/orders?date=${date}`).then((r) => { if (alive) setOrders(r); }).catch((e) => { if (alive) { setOrders([]); uiToast(errMsg(e)); } });
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [date, q]);
  const net = (orders ?? []).reduce((n, o) => n + o.total - (o.refund_amount ?? 0), 0);
  return (
    <Modal wide title="POS 訂單" onClose={onClose}>
      <div className="flex flex-wrap gap-2">
        <input type="date" className={`${input} w-auto flex-1`} value={date} max={todayTaipei()} onChange={(e) => { setQ(''); setDate(e.target.value || todayTaipei()); }} />
        <input className={`${input} flex-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋單號 / 電話 / 姓名" />
      </div>
      <p className="mt-2 text-sm! text-[#8a7f72]">{orders ? `${orders.length} 筆,淨額 ${posMoney(net)}` : '讀取中…'}</p>
      <div className="mt-2 space-y-2">
        {orders?.length === 0 ? <p className="py-8 text-center text-sm! text-[#8a7f72]">沒有訂單</p> : null}
        {(orders ?? []).map((o) => {
          const returned = o.status === '退貨' || o.status === '取消';
          return (
            <div key={o.id} className="rounded-xl border border-[#e5ded4]">
              <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm! font-semibold!">{o.order_no}{returned ? <span className="ml-2 rounded bg-[#fbeef1] px-1.5 py-0.5 text-[11px]! text-[#c84767]">已退貨</span> : o.refund_amount ? <span className="ml-2 rounded bg-[#fff6e5] px-1.5 py-0.5 text-[11px]! text-[#9a6412]">部分退</span> : null}</p>
                  <p className="truncate text-xs! text-[#8a7f72]">{timeLabel(o.created_at)} · {o.payment_method} · {o.items.reduce((n, i) => n + i.quantity, 0)} 件{o.customer_name && o.customer_name !== '門市顧客' ? ` · ${o.customer_name}` : ''}</p>
                </div>
                <span className={`shrink-0 text-sm! font-semibold! tabular-nums! ${returned ? 'text-[#b3a99b] line-through' : ''}`}>{posMoney(o.total)}</span>
              </button>
              {open === o.id ? (
                <div className="border-t border-[#eee6da] px-3 py-3">
                  <div className="mx-auto max-w-[300px]"><Receipt order={o} settings={settings} shopName={shopName} /></div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className={`${btn} flex-1`} onClick={() => onPrint(o)}>重印收據</button>
                    <button type="button" disabled={returned} className={`${btnDanger} flex-1`} onClick={() => setRefund(o)}>退貨 / 作廢</button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {refund ? <RefundModal order={refund} methods={settings.paymentMethods} onClose={() => setRefund(null)} onDone={(u) => { setRefund(null); setOrders((l) => (l ?? []).map((x) => (x.id === u.id ? u : x))); onChanged(); }} /> : null}
    </Modal>
  );
}

// ---------- 班別:開班 / 現金收支 / 交班 ----------
export function SessionPanel({ session, shopName, onChange, onPrint, onClose }: { session: SessionView | null; shopName: string; onChange: (s: SessionView | null) => void; onPrint: (node: ReactNode) => void; onClose: () => void }) {
  const [opening, setOpening] = useState('');
  const [move, setMove] = useState<{ type: 'in' | 'out'; amount: string; note: string } | null>(null);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<PosSession | null>(null);
  const [history, setHistory] = useState<PosSession[] | null>(null);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { uiToast(errMsg(e)); } finally { setBusy(false); } };

  if (closed?.summary) {
    return (
      <Modal title="交班完成" onClose={onClose} footer={<div className="flex gap-2"><button type="button" className={btn} onClick={() => onPrint(<ShiftReport session={closed} summary={closed.summary!} shopName={shopName} />)}>列印交班表</button><button type="button" className={`${btnDark} flex-1`} onClick={onClose}>完成</button></div>}>
        <div className="mx-auto max-w-[300px]"><ShiftReport session={closed} summary={closed.summary} shopName={shopName} /></div>
      </Modal>
    );
  }

  if (!session) {
    return (
      <Modal title="開班" onClose={onClose} footer={<button type="button" disabled={busy} className={`${btnDark} w-full`} onClick={() => run(async () => { const r = await api<{ session: SessionView }>('/api/pos/session', { method: 'POST', body: JSON.stringify({ opening_cash: toInt(opening) }) }); onChange(r.session); uiToast('已開班'); onClose(); })}>開始營業</button>}>
        <p className="mb-3 text-sm! text-[#8a7f72]">開班後,每一筆 POS 銷售都會記在這一班,交班時核對現金。不開班也可以結帳,只是不會有交班表。</p>
        <label><span className={label}>錢櫃零用金(元)</span><input className={input} inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" autoFocus /></label>
        <button type="button" className="mt-4 text-sm! text-[#8a7f72] underline" onClick={() => run(async () => { const r = await api<{ history: PosSession[] }>('/api/pos/session?history=1'); setHistory(r.history); })}>查看過去的交班紀錄</button>
        {history ? <HistoryList history={history} shopName={shopName} onPrint={onPrint} /> : null}
      </Modal>
    );
  }

  const s = session.summary;
  const diff = toInt(counted) - s.expectedCash;
  return (
    <Modal title="班別" onClose={onClose} footer={closing ? (
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={() => setClosing(false)}>返回</button>
        <button type="button" disabled={busy || counted === ''} className={`${btnDark} flex-1`} onClick={() => run(async () => {
          if (!(await uiConfirm(`確定交班?\n應有現金 ${posMoney(s.expectedCash)},點鈔 ${posMoney(toInt(counted))},差額 ${diff > 0 ? '+' : ''}${posMoney(diff)}`))) return;
          const r = await api<{ closed: PosSession }>('/api/pos/session', { method: 'PATCH', body: JSON.stringify({ action: 'close', counted_cash: toInt(counted), note }) });
          onChange(null); setClosed(r.closed);
        })}>確認交班</button>
      </div>
    ) : (
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={() => onPrint(<ShiftReport session={session} summary={s} shopName={shopName} />)}>列印</button>
        <button type="button" className={`${btnDark} flex-1`} onClick={() => setClosing(true)}>交班</button>
      </div>
    )}>
      <div className="mx-auto max-w-[300px] rounded-xl border border-[#eee6da] p-3"><ShiftReport session={session} summary={s} shopName={shopName} /></div>
      {closing ? (
        <div className="mt-4 space-y-3">
          <label className="block"><span className={label}>實際點鈔金額(元)</span><input className={input} inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder={String(s.expectedCash)} autoFocus /></label>
          {counted !== '' ? <p className={`text-sm! font-semibold! ${diff === 0 ? 'text-[#1f7a44]' : 'text-[#c84767]'}`}>{diff === 0 ? '金額相符' : `差額 ${diff > 0 ? '+' : ''}${posMoney(diff)}(${diff > 0 ? '多' : '少'})`}</p> : null}
          <label className="block"><span className={label}>備註(選填)</span><input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例:找錯 50 元" /></label>
        </div>
      ) : move ? (
        <div className="mt-4 space-y-3 rounded-xl border border-[#e5ded4] p-3">
          <p className="text-sm! font-semibold!">{move.type === 'in' ? '現金存入錢櫃' : '從錢櫃取出現金'}</p>
          <input className={input} inputMode="numeric" value={move.amount} onChange={(e) => setMove({ ...move, amount: e.target.value })} placeholder="金額" autoFocus />
          <input className={input} value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} placeholder={move.type === 'in' ? '原因(例:補零錢)' : '原因(例:買文具、存銀行)'} />
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={() => setMove(null)}>取消</button>
            <button type="button" disabled={busy || !toInt(move.amount)} className={`${btnDark} flex-1`} onClick={() => run(async () => { const r = await api<{ session: SessionView }>('/api/pos/session', { method: 'PATCH', body: JSON.stringify({ action: 'move', type: move.type, amount: toInt(move.amount), note: move.note }) }); onChange(r.session); setMove(null); uiToast('已記錄'); })}>記錄</button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-2">
            <button type="button" className={`${btn} flex-1`} onClick={() => setMove({ type: 'in', amount: '', note: '' })}>現金存入</button>
            <button type="button" className={`${btn} flex-1`} onClick={() => setMove({ type: 'out', amount: '', note: '' })}>現金取出</button>
          </div>
          {session.cash_moves.length ? (
            <div className="mt-3 space-y-1 text-sm!">
              {session.cash_moves.map((m, i) => <div key={i} className="flex justify-between gap-2 text-[#5f5852]"><span className="min-w-0 truncate">{timeLabel(m.at)} {m.type === 'in' ? '存入' : '取出'}{m.note ? ` · ${m.note}` : ''}</span><span className="shrink-0 tabular-nums!">{m.type === 'in' ? '+' : '-'}{posMoney(m.amount)}</span></div>)}
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}

function HistoryList({ history, shopName, onPrint }: { history: PosSession[]; shopName: string; onPrint: (node: ReactNode) => void }) {
  if (!history.length) return <p className="mt-3 text-sm! text-[#8a7f72]">還沒有交班紀錄</p>;
  return (
    <div className="mt-3 space-y-2">
      {history.map((h) => (
        <button key={h.id} type="button" disabled={!h.summary} onClick={() => h.summary && onPrint(<ShiftReport session={h} summary={h.summary} shopName={shopName} />)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#e5ded4] px-3 py-2 text-left text-sm! active:bg-[#f3ede4]">
          <span className="min-w-0"><span className="block truncate font-medium!">{timeLabel(h.opened_at)} → {timeLabel(h.closed_at)}</span><span className="block truncate text-xs! text-[#8a7f72]">{h.summary ? `${h.summary.orders} 筆 · ${posMoney(h.summary.gross - h.summary.refunds)}` : ''} · 差額 {posMoney(h.difference ?? 0)}</span></span>
          <span className="shrink-0 text-xs! text-[#8a7f72]">列印</span>
        </button>
      ))}
    </div>
  );
}

// ---------- POS 設定 ----------
export function SettingsPanel({ settings, onSaved, onClose }: { settings: PosSettings; onSaved: (s: PosSettings) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(settings);
  const [methods, setMethods] = useState(settings.paymentMethods.filter((m) => m !== CASH).join('、'));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const saved = await api<PosSettings>('/api/pos/settings', { method: 'PUT', body: JSON.stringify({ ...draft, paymentMethods: [CASH, ...methods.split(/[、,,\n]/).map((m) => m.trim()).filter(Boolean)] }) });
      onSaved(saved); uiToast('已儲存'); onClose();
    } catch (e) { uiToast(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal title="POS 設定" onClose={onClose} footer={<button type="button" disabled={busy} className={`${btnDark} w-full`} onClick={save}>儲存</button>}>
      <div className="space-y-4">
        <label className="block"><span className={label}>現金以外的付款方式(用「、」分開)</span><input className={input} value={methods} onChange={(e) => setMethods(e.target.value)} placeholder="刷卡、LINE Pay、轉帳" /></label>
        <label className="flex items-start gap-2 text-sm!"><input type="checkbox" className="mt-1" checked={draft.allowOversell} onChange={(e) => setDraft({ ...draft, allowOversell: e.target.checked })} /><span>庫存不足也可以賣<span className="block text-xs! text-[#8a7f72]">沒勾:系統庫存不夠時不能結帳。勾了:照樣結帳,庫存扣到 0 為止。</span></span></label>
        <label className="block"><span className={label}>收據抬頭(空白 = 店名)</span><input className={input} value={draft.receiptTitle} onChange={(e) => setDraft({ ...draft, receiptTitle: e.target.value })} /></label>
        <label className="block"><span className={label}>抬頭下方文字(地址、電話、統編)</span><textarea className={input} rows={3} value={draft.receiptHeader} onChange={(e) => setDraft({ ...draft, receiptHeader: e.target.value })} /></label>
        <label className="block"><span className={label}>收據頁尾</span><textarea className={input} rows={2} value={draft.receiptFooter} onChange={(e) => setDraft({ ...draft, receiptFooter: e.target.value })} /></label>
        <div><span className={label}>收據紙寬</span><div className="flex gap-2">{([58, 80] as const).map((w) => <button key={w} type="button" onClick={() => setDraft({ ...draft, receiptWidth: w })} className={`${chip} ${draft.receiptWidth === w ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'}`}>{w} mm</button>)}</div></div>
      </div>
    </Modal>
  );
}
