'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { canOptimizeStoreImage } from '@/lib/store-image';
import { findByCode, manualDiscountAmount, posMoney, variantKey, type PosButton, type PosDiscount, type PosProduct, type PosSettings } from '@/lib/pos';
import type { StockLocation } from '@/lib/stock-locations';
import { ButtonGrid, ButtonModal, LocationPicker } from './PosButtons';
import { posSignOut, posSwitchUser } from './PosSignOut';
import type { PosPermission } from '@/lib/pos';
import type { Order } from '@/lib/types';
import { uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { DiscountEditor, DoneModal, LineEditor, MemberPicker, Modal, OrdersPanel, PayModal, Receipt, SessionPanel, SettingsPanel, VariantPicker } from './PosPanels';
import { api, btn, btnDark, chip, errMsg, input, setPosLocation, timeLabel, uid, type Boot, type CartLine, type Hold, type Member, type Quote, type SessionView } from './ui';

type Panel = 'pay' | 'orders' | 'session' | 'settings' | 'holds' | 'member' | 'discount' | 'location' | null;
const LOCATION_KEY = 'pos_location';

const stockOf = (p: PosProduct, variant: string) => (p.variants?.length ? p.variants.find((v) => variantKey(v.options) === variant)?.inventory ?? 0 : p.inventory ?? 0);
const priceOf = (p: PosProduct, variant: string) => p.variants?.find((v) => variantKey(v.options) === variant)?.price ?? p.price;
const priceLabel = (p: PosProduct) => {
  const prices = p.variants?.length ? p.variants.map((v) => v.price ?? p.price) : [p.price];
  const min = Math.min(...prices);
  return `${posMoney(min)}${prices.some((x) => x !== min) ? ' 起' : ''}`;
};

// POS 門市結帳:左邊找商品(搜尋 / 掃條碼 / 分類),右邊購物車與結帳
export default function PosApp() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState<PosDiscount | null>(null);
  const [code, setCode] = useState('');
  const [couponOff, setCouponOff] = useState(0);
  const [member, setMember] = useState<Member | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [useCredit, setUseCredit] = useState(false);
  const [note, setNote] = useState('');
  const [holds, setHolds] = useState<Hold[]>([]);
  const [search, setSearch] = useState('');
  // 首頁:有設定按鈕就先顯示按鈕畫面;「全部商品」才是商品格
  const [view, setView] = useState<'buttons' | 'all'>('buttons');
  const [openButton, setOpenButton] = useState<PosButton | null>(null);
  const locationId = useRef('');
  const [category, setCategory] = useState('all');
  const [panel, setPanel] = useState<Panel>(null);
  const [picker, setPicker] = useState<PosProduct | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [bindCode, setBindCode] = useState('');
  const [unknownCode, setUnknownCode] = useState('');
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<Order | null>(null);
  const [printDoc, setPrintDoc] = useState<ReactNode>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const clientId = useRef(uid());
  const holdsKey = useRef('');

  const load = useCallback(async () => {
    try {
      const data = await api<Boot>(`/api/pos/bootstrap?location=${encodeURIComponent(locationId.current)}`);
      locationId.current = data.location.id;
      setPosLocation(data.location.id);
      setBoot(data);
      setLoadError('');
      return data;
    } catch (e) { setLoadError(errMsg(e)); return null; }
  }, []);

  useEffect(() => {
    try { locationId.current = localStorage.getItem(LOCATION_KEY) ?? ''; } catch { /* 讀不到就用預設據點 */ }
    void load().then((data) => {
      if (!data) return;
      holdsKey.current = `pos_holds:${location.host}`;
      try { setHolds(JSON.parse(localStorage.getItem(holdsKey.current) ?? '[]')); } catch { /* 掛單讀不到就當沒有 */ }
    });
  }, [load]);

  const saveHolds = (next: Hold[]) => { setHolds(next); try { localStorage.setItem(holdsKey.current, JSON.stringify(next)); } catch { /* 無法儲存時只留在這次畫面 */ } };

  const products = useMemo(() => boot?.products ?? [], [boot]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categories = useMemo(() => (boot?.categories ?? []).filter((c) => products.some((p) => p.category === c.slug)), [boot, products]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)
        || (p.variants ?? []).some((v) => (v.barcode ?? '').toLowerCase().includes(q));
    });
  }, [products, search, category]);

  const inCart = (productId: string, variant: string) => lines.filter((l) => l.productId === productId && l.variant === variant).reduce((n, l) => n + l.quantity, 0);

  function addToCart(product: PosProduct, variant: string) {
    const stock = stockOf(product, variant);
    if (!boot?.settings.allowOversell && inCart(product.id, variant) + 1 > stock) {
      uiToast(`「${product.name}」${variant} 庫存不足(剩 ${stock})`);
      return;
    }
    const listPrice = priceOf(product, variant);
    setLines((list) => {
      // 改過價的品項另外一行,不和定價的合併
      const same = list.find((l) => l.productId === product.id && l.variant === variant && l.price === listPrice);
      if (same) return list.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l));
      return [...list, { id: uid(), productId: product.id, variant, name: product.name, image: product.image ?? '', listPrice, price: listPrice, quantity: 1 }];
    });
  }

  async function bindBarcode(product: PosProduct, variant: string) {
    try {
      const updated = await api<PosProduct>('/api/pos/barcode', { method: 'POST', body: JSON.stringify({ product_id: product.id, variant, barcode: bindCode }) });
      setBoot((b) => (b ? { ...b, products: b.products.map((p) => (p.id === updated.id ? { ...p, barcode: updated.barcode, variants: updated.variants } : p)) } : b));
      uiToast(`條碼已綁定到「${product.name}${variant ? ` ${variant}` : ''}」`);
      setBindCode('');
    } catch (e) { uiToast(errMsg(e)); }
  }

  function pickProduct(product: PosProduct) {
    if (product.variants?.length > 1 || (product.variants?.length === 1 && bindCode)) { setPicker(product); return; }
    const variant = product.variants?.length === 1 ? variantKey(product.variants[0].options) : '';
    if (bindCode) void bindBarcode(product, variant);
    else addToCart(product, variant);
  }

  // 掃描槍(或手動輸入後按 Enter):完全符合條碼 / 貨號就直接加入
  function submitCode() {
    const raw = search.trim();
    if (!raw) return;
    const hit = findByCode(products, raw);
    if (hit) {
      if (hit.variant === null) setPicker(hit.product); else addToCart(hit.product, hit.variant);
      setSearch(''); setUnknownCode('');
      return;
    }
    if (shown.length === 1) { pickProduct(shown[0]); setSearch(''); return; }
    if (!shown.length) { setUnknownCode(raw); setSearch(''); }
  }

  const subtotal = lines.reduce((n, l) => n + l.price * l.quantity, 0);
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const manual = manualDiscountAmount(subtotal, discount);
  const coupon = code ? Math.min(couponOff, Math.max(0, subtotal - manual)) : 0;
  const credit = useCredit && quote?.enabled ? quote.max : 0;
  const total = Math.max(0, subtotal - manual - coupon - credit);
  const saleItems = useMemo(() => lines.map((l) => ({ productId: l.productId, variant: l.variant, quantity: l.quantity, ...(l.price !== l.listPrice ? { price: l.price } : {}) })), [lines]);

  // 折扣碼:購物車或會員變動時請伺服器重新驗證、試算折抵金額;不能用就清掉
  useEffect(() => {
    let alive = true;
    const idle = !code || !saleItems.length;
    const t = setTimeout(() => {
      if (idle) { setCouponOff(0); return; }
      api<{ couponDiscount: number }>('/api/pos/checkout', { method: 'POST', body: JSON.stringify({ preview: true, items: saleItems, discount, discount_code: code, customer: member ? { user_id: member.user_id } : null }) })
        .then((r) => { if (alive) setCouponOff(r.couponDiscount); })
        .catch((e) => { if (alive) { uiToast(`折扣碼 ${code}:${errMsg(e)}`); setCode(''); setCouponOff(0); } });
    }, idle ? 0 : 250);
    return () => { alive = false; clearTimeout(t); };
  }, [code, saleItems, discount, member]);

  // 會員回饋金:金額變動時重新試算可折抵上限
  useEffect(() => {
    let alive = true;
    const off = !member || !boot?.loyalty;
    const t = setTimeout(() => {
      if (off) { setQuote(null); setUseCredit(false); return; }
      api<Quote>(`/api/pos/customers?quote=${member.user_id}&amount=${Math.max(0, subtotal - manual - coupon)}`).then((q) => { if (alive) setQuote(q); }).catch(() => { if (alive) setQuote(null); });
    }, off ? 0 : 200);
    return () => { alive = false; clearTimeout(t); };
  }, [member, subtotal, manual, coupon, boot?.loyalty]);

  function resetSale() {
    setLines([]); setDiscount(null); setCode(''); setCouponOff(0); setMember(null); setQuote(null); setUseCredit(false); setNote('');
    clientId.current = uid();
    setCartOpen(false);
  }

  function holdSale() {
    if (!lines.length) return;
    saveHolds([{ id: uid(), at: new Date().toISOString(), lines, discount, code, member, note }, ...holds].slice(0, 30));
    resetSale();
    uiToast('已掛單');
  }

  async function resumeHold(hold: Hold) {
    if (lines.length && !(await uiConfirm('目前購物車還有商品,取回掛單會先把目前這筆掛起來。'))) return;
    const rest = holds.filter((h) => h.id !== hold.id);
    saveHolds(lines.length ? [{ id: uid(), at: new Date().toISOString(), lines, discount, code, member, note }, ...rest] : rest);
    // 定價與庫存以現在為準(品項已刪除的拿掉)
    setLines(hold.lines.filter((l) => byId.has(l.productId)));
    setDiscount(hold.discount); setCode(hold.code); setMember(hold.member); setNote(hold.note); setUseCredit(false);
    clientId.current = uid();
    setPanel(null);
  }

  async function pay(payments: { method: string; amount: number }[], taxId = '') {
    setPaying(true);
    try {
      const order = await api<Order>('/api/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId.current,
          items: saleItems,
          discount, discount_code: code, customer: member ? { user_id: member.user_id } : null, use_credit: credit, payments, note,
          location_id: locationId.current, buyer_tax_id: taxId,
        }),
      });
      setPanel(null);
      resetSale();
      setDone(order);
      void load(); // 更新庫存與班別摘要
    } catch (e) {
      uiToast(errMsg(e));
      void load();
    } finally { setPaying(false); }
  }

  // 列印:把內容放到 body 底下的列印區,畫面其他部分列印時隱藏
  function print(node: ReactNode) {
    setPrintDoc(node);
    setTimeout(() => window.print(), 80);
  }

  if (!boot) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-[#f6f2ec] p-6 text-center text-[#5f5852]">
        {loadError ? <div><p className="font-semibold! text-[#1f1b19]">POS 讀取失敗</p><p className="mt-1 text-sm!">{loadError}</p><button type="button" className={`${btnDark} mt-4`} onClick={() => void load()}>重試</button></div> : <p>POS 載入中…</p>}
      </div>
    );
  }

  const { settings, shop, session, buttons, locations } = boot;
  const here = boot.location;
  // 員工只看得到、用得到被勾選的功能(伺服器也會再檢查一次)
  const can = (p: PosPermission) => boot.me.isAdmin || boot.me.permissions.includes(p);
  const showButtons = buttons.length > 0 && view === 'buttons' && !search.trim() && !bindCode;
  const nextInvoice = boot.features.invoice && here.invoice_enabled ? (here.invoice_next <= here.invoice_end ? `${here.invoice_prefix}${String(here.invoice_next).padStart(8, '0')}` : '號碼已用完') : '';
  const lineQty = (productId: string, variant?: string) => lines.filter((l) => l.productId === productId && (variant === undefined || l.variant === variant)).reduce((n, l) => n + l.quantity, 0);

  async function switchLocation(id: string) {
    if (id === here.id) { setPanel(null); return; }
    if (lines.length && !(await uiConfirm('切換據點會清空目前的購物車,確定切換?'))) return;
    locationId.current = id;
    try { localStorage.setItem(LOCATION_KEY, id); } catch { /* 無法記住時只有這次有效 */ }
    resetSale();
    setPanel(null);
    await load();
  }
  const editingLine = lines.find((l) => l.id === editing) ?? null;

  const cart = (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#eee6da] px-3 py-2.5">
        <button type="button" onClick={() => setPanel('member')} className="min-w-0 flex-1 rounded-xl border border-[#e5ded4] px-3 py-2 text-left active:bg-[#f3ede4]">
          <span className="block truncate text-sm! font-semibold!">{member ? member.name || member.nickname || '會員' : '一般顧客'}</span>
          <span className="block truncate text-xs! text-[#8a7f72]">{member ? [member.phone, quote?.enabled ? `${quote.tier} · 回饋金 ${posMoney(quote.balance)}` : ''].filter(Boolean).join(' · ') || '會員' : '點這裡選會員'}</span>
        </button>
        <button type="button" className="shrink-0 rounded-xl px-2 py-2 text-sm! text-[#8a7f72] lg:hidden" onClick={() => setCartOpen(false)}>收起</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!lines.length ? <p className="px-4 py-12 text-center text-sm! text-[#a99e8f]">還沒有商品<br />點左邊的商品,或掃描條碼加入</p> : null}
        {lines.map((l) => {
          const product = byId.get(l.productId);
          const over = product && !settings.allowOversell && inCart(l.productId, l.variant) > stockOf(product, l.variant);
          return (
            <div key={l.id} className="flex items-center gap-2 border-b border-[#f3ede4] px-3 py-2.5">
              <button type="button" onClick={() => setEditing(l.id)} className="min-w-0 flex-1 text-left">
                <span className="line-clamp-2 text-sm! font-medium! leading-snug">{l.name}</span>
                <span className="block truncate text-xs! text-[#8a7f72]">
                  {l.variant ? `${l.variant} · ` : ''}{l.price !== l.listPrice ? <><s>{posMoney(l.listPrice)}</s> </> : null}<span className={l.price !== l.listPrice ? 'font-semibold! text-[#c84767]' : ''}>{posMoney(l.price)}</span>
                  {over ? <span className="ml-1 text-[#c84767]">庫存不足</span> : null}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" aria-label="減少" onClick={() => setLines((list) => (l.quantity <= 1 ? list.filter((x) => x.id !== l.id) : list.map((x) => (x.id === l.id ? { ...x, quantity: x.quantity - 1 } : x))))} className="h-9 w-9 rounded-lg border border-[#d7c9bd] text-lg! active:bg-[#f3ede4]">−</button>
                <span className="w-7 text-center text-sm! font-semibold! tabular-nums!">{l.quantity}</span>
                <button type="button" aria-label="增加" onClick={() => {
                  if (product && !settings.allowOversell && inCart(l.productId, l.variant) + 1 > stockOf(product, l.variant)) { uiToast(`庫存只剩 ${stockOf(product, l.variant)}`); return; }
                  setLines((list) => list.map((x) => (x.id === l.id ? { ...x, quantity: x.quantity + 1 } : x)));
                }} className="h-9 w-9 rounded-lg border border-[#d7c9bd] text-lg! active:bg-[#f3ede4]">+</button>
              </div>
              <span className="w-[68px] shrink-0 text-right text-sm! font-semibold! tabular-nums!">{posMoney(l.price * l.quantity)}</span>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-[#eee6da] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
        <div className="space-y-1 text-sm!">
          <div className="flex justify-between"><span className="text-[#8a7f72]">小計({count} 件)</span><span className="tabular-nums!">{posMoney(subtotal)}</span></div>
          <button type="button" onClick={() => setPanel('discount')} disabled={!lines.length} className="flex w-full justify-between text-left disabled:opacity-40">
            <span className="text-[#8a7f72] underline decoration-dotted">折扣{discount ? (discount.type === 'percent' ? `(折 ${discount.value}%)` : '(折讓)') : ''}{code ? ` · 碼 ${code}` : ''}</span>
            <span className="tabular-nums!">{manual + coupon ? `-${posMoney(manual + coupon)}` : '設定'}</span>
          </button>
          {member && quote?.enabled && quote.max > 0 ? (
            <label className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[#8a7f72]"><input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />用回饋金折抵</span>
              <span className="tabular-nums!">{useCredit ? `-${posMoney(credit)}` : `可折 ${posMoney(quote.max)}`}</span>
            </label>
          ) : null}
        </div>
        <input className={`${input} mt-2 py-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="訂單備註(選填)" />
        <div className="mt-2 flex items-baseline justify-between"><span className="text-sm! font-semibold!">應收</span><span className="text-2xl! font-bold! tabular-nums!">{posMoney(total)}</span></div>
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={!lines.length} className={btn} onClick={holdSale}>掛單</button>
          <button type="button" disabled={!lines.length} className={btn} onClick={async () => { if (await uiConfirm('清空這筆購物車?')) resetSale(); }}>清空</button>
          <button type="button" disabled={!lines.length} className={`${btnDark} flex-1 py-3 text-base!`} onClick={() => setPanel('pay')}>結帳</button>
        </div>
      </div>
    </div>
  );

  const menu: { key: string; label: string; onClick: () => void }[] = [
    { key: 'holds', label: `取單${holds.length ? `(${holds.length})` : ''}`, onClick: () => setPanel('holds') },
    ...(can('orders') ? [{ key: 'orders', label: can('refund') ? '訂單 / 退貨' : '訂單', onClick: () => setPanel('orders') }] : []),
    ...(can('session') ? [{ key: 'session', label: session ? '班別 / 交班' : '開班', onClick: () => setPanel('session') }] : []),
    ...(can('settings') ? [{ key: 'settings', label: '設定', onClick: () => setPanel('settings') }] : []),
    ...(locations.length > 1 ? [{ key: 'location', label: `據點:${here.name}`, onClick: () => setPanel('location') }] : []),
    // 管理員的裝置:讓員工用自己的編號登入,銷售才會記在員工名下
    ...(boot.me.isAdmin && boot.features.staff ? [{ key: 'switch', label: '員工登入', onClick: () => { void (lines.length ? uiConfirm('換人登入會清空目前的購物車,確定?') : Promise.resolve(true)).then((ok) => { if (ok) posSwitchUser(); }); } }] : []),
    { key: 'logout', label: `登出(${boot.me.name})`, onClick: () => { void uiConfirm(lines.length ? '登出會清空目前的購物車,確定登出?' : `登出 ${boot.me.name}?`).then((ok) => { if (ok) void posSignOut(boot.me.isAdmin); }); } },
  ];

  return (
    <>
      <div className="pos-root fixed inset-0 z-40 flex flex-col bg-[#f6f2ec] text-[#1f1b19]">
        {/* 頂列 */}
        <header className="flex shrink-0 items-center gap-2 border-b border-[#e5ded4] bg-white px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm! font-bold! tracking-wide">{shop.name} <span className="font-medium! text-[#8a7f72]">POS{locations.length > 1 ? ` · ${here.name}` : ''}</span></p>
            <button type="button" onClick={() => { if (can('session')) setPanel('session'); }} className="flex items-center gap-1.5 text-xs! text-[#8a7f72]">
              <span className={`h-2 w-2 rounded-full ${session ? 'bg-[#2fa866]' : 'bg-[#d0c6b8]'}`} />
              {session ? `營業中 · ${session.summary.orders} 筆 · ${posMoney(session.summary.gross - session.summary.refunds)}` : '尚未開班'}
            </button>
          </div>
          <nav className="hidden items-center gap-1.5 md:flex">
            {menu.map((m) => <button key={m.key} type="button" onClick={m.onClick} className="rounded-lg px-3 py-2 text-sm! font-medium! text-[#5f5852] hover:bg-[#f3ede4]">{m.label}</button>)}
            {boot.me.isAdmin ? <a href="/admin" className="rounded-lg px-3 py-2 text-sm! font-medium! text-[#5f5852] hover:bg-[#f3ede4]">後台</a> : null}
          </nav>
          <button type="button" aria-label="選單" onClick={() => setMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#e5ded4] md:hidden">
            <span className="block w-4 space-y-1"><i className="block h-0.5 bg-[#1f1b19]" /><i className="block h-0.5 bg-[#1f1b19]" /><i className="block h-0.5 bg-[#1f1b19]" /></span>
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* 商品區 */}
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="shrink-0 space-y-2 px-3 pt-3">
              <form onSubmit={(e) => { e.preventDefault(); submitCode(); }}>
                <input ref={searchRef} className={input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋商品 / 掃描條碼 / 輸入貨號後按 Enter" enterKeyHint="search" autoComplete="off" />
              </form>
              {bindCode ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-[#fff6e5] px-3 py-2 text-sm! text-[#7a5310]">
                  <span className="min-w-0">綁定條碼 <b className="break-all">{bindCode}</b>:點下面的商品</span>
                  <button type="button" className="shrink-0 underline" onClick={() => setBindCode('')}>取消</button>
                </div>
              ) : unknownCode ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-[#fbeef1] px-3 py-2 text-sm! text-[#a13552]">
                  <span className="min-w-0">找不到 <b className="break-all">{unknownCode}</b></span>
                  <span className="flex shrink-0 gap-3">{can('barcode') ? <button type="button" className="underline" onClick={() => { setBindCode(unknownCode); setUnknownCode(''); }}>綁定到商品</button> : null}<button type="button" className="underline" onClick={() => setUnknownCode('')}>關閉</button></span>
                </div>
              ) : null}
              <div className={`-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] ${showButtons ? 'hidden' : ''}`}>
                {buttons.length ? <button type="button" onClick={() => { setView('buttons'); setSearch(''); }} className={`${chip} border-[#1f1b19] bg-white`}>← 按鈕</button> : null}
                <button type="button" onClick={() => setCategory('all')} className={`${chip} ${category === 'all' ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd] bg-white'}`}>全部</button>
                {categories.map((c) => <button key={c.slug} type="button" onClick={() => setCategory(c.slug)} className={`${chip} ${category === c.slug ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd] bg-white'}`}>{c.name}</button>)}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-24 pt-2 lg:pb-4">
              {showButtons ? <ButtonGrid buttons={buttons} qtyOf={(b) => b.productIds.reduce((n, id) => n + lineQty(id), 0)} onOpen={setOpenButton} onAll={() => setView('all')} /> : null}
              {!showButtons && !shown.length ? <p className="py-16 text-center text-sm! text-[#a99e8f]">{products.length ? '找不到商品' : '還沒有商品,請先到後台新增'}</p> : null}
              <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 ${showButtons ? 'hidden' : ''}`}>
                {shown.map((p) => {
                  const out = (p.inventory ?? 0) <= 0;
                  const qty = lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.quantity, 0);
                  return (
                    <button key={p.id} type="button" onClick={() => pickProduct(p)}
                      className={`relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white text-left active:scale-[0.98] ${qty ? 'border-[#1f1b19]' : 'border-[#e5ded4]'} ${out && !settings.allowOversell ? 'opacity-55' : ''}`}>
                      <span className="relative block aspect-square w-full bg-[#f3ede4]">
                        {p.image ? <Image src={p.image} alt="" fill sizes="(min-width: 1024px) 180px, 45vw" className="object-cover" unoptimized={!canOptimizeStoreImage(p.image)} /> : null}
                        {p.store_only ? <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px]! font-semibold! text-[#6b6156]">門市限定</span> : null}
                        {qty ? <span className="absolute right-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-[#1f1b19] px-1.5 text-xs! font-bold! text-white">{qty}</span> : null}
                      </span>
                      <span className="block px-2 pb-2 pt-1.5">
                        <span className="line-clamp-2 min-h-[2.5em] text-[13px]! font-medium! leading-tight">{p.name}</span>
                        <span className="mt-1 flex items-baseline justify-between gap-1">
                          <span className="truncate text-sm! font-bold! tabular-nums!">{priceLabel(p)}</span>
                          <span className={`shrink-0 text-[11px]! tabular-nums! ${out ? 'text-[#c84767]' : 'text-[#8a7f72]'}`}>{out ? '無庫存' : `庫存 ${p.inventory}`}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 購物車:桌機固定在右邊 */}
          <aside className="hidden w-[380px] shrink-0 border-l border-[#e5ded4] lg:block xl:w-[420px]">{cart}</aside>
        </div>

        {/* 手機 / 平板:底部結帳列,點開購物車 */}
        <div className="shrink-0 border-t border-[#e5ded4] bg-white px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 lg:hidden">
          <button type="button" onClick={() => setCartOpen(true)} className="flex w-full items-center justify-between rounded-xl bg-[#1f1b19] px-4 py-3 text-white active:opacity-85">
            <span className="text-sm! font-semibold!">購物車 · {count} 件</span>
            <span className="text-lg! font-bold! tabular-nums!">{posMoney(total)}</span>
          </button>
        </div>
        {cartOpen ? <div className="fixed inset-0 z-[45] lg:hidden">{cart}</div> : null}

        {/* 手機選單 */}
        {menuOpen ? (
          <div className="fixed inset-0 z-[46] bg-black/40 md:hidden" onClick={() => setMenuOpen(false)}>
            <div className="absolute right-0 top-0 flex h-full w-64 max-w-[80vw] flex-col gap-1 bg-white p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <p className="truncate px-3 py-2 text-xs! text-[#8a7f72]">{boot.me.name} · {boot.me.isAdmin ? '管理員' : `員工 ${boot.me.code}`}</p>
              {menu.map((m) => <button key={m.key} type="button" onClick={() => { setMenuOpen(false); m.onClick(); }} className="rounded-lg px-3 py-3 text-left text-sm! font-medium! active:bg-[#f3ede4]">{m.label}</button>)}
              {boot.me.isAdmin ? <a href="/admin" className="rounded-lg px-3 py-3 text-sm! font-medium! active:bg-[#f3ede4]">回後台</a> : null}
            </div>
          </div>
        ) : null}

        {/* 彈窗 */}
        {picker ? <VariantPicker product={picker} binding={bindCode} onClose={() => setPicker(null)} onPick={(v) => { if (bindCode) void bindBarcode(picker, v); else addToCart(picker, v); setPicker(null); }} /> : null}
        {editingLine ? <LineEditor line={editingLine} canPrice={can('discount')} onClose={() => setEditing(null)} onRemove={() => { setLines((l) => l.filter((x) => x.id !== editingLine.id)); setEditing(null); }}
          onSave={(patch) => {
            const product = byId.get(editingLine.productId);
            const others = inCart(editingLine.productId, editingLine.variant) - editingLine.quantity;
            const max = product && !settings.allowOversell ? Math.max(0, stockOf(product, editingLine.variant) - others) : Infinity;
            const quantity = Math.min(patch.quantity ?? editingLine.quantity, max);
            if (quantity < (patch.quantity ?? 0)) uiToast(`庫存只夠 ${quantity} 件`);
            setLines((l) => (quantity <= 0 ? l.filter((x) => x.id !== editingLine.id) : l.map((x) => (x.id === editingLine.id ? { ...x, ...patch, quantity } : x))));
            setEditing(null);
          }} /> : null}
        {panel === 'discount' ? <DiscountEditor subtotal={subtotal} discount={discount} code={code} canManual={can('discount')} onClose={() => setPanel(null)} onSave={(d, c) => { setDiscount(d); setCode(c); setPanel(null); }} /> : null}
        {panel === 'member' ? <MemberPicker current={member} onClose={() => setPanel(null)} onPick={(m) => { setMember(m); setUseCredit(false); setPanel(null); }} /> : null}
        {panel === 'pay' ? <PayModal total={total} methods={settings.paymentMethods} busy={paying} invoice={nextInvoice} onPay={pay} onClose={() => { if (!paying) setPanel(null); }} /> : null}
        {panel === 'orders' ? <OrdersPanel settings={settings} shopName={shop.name} canRefund={can('refund')} onClose={() => setPanel(null)} onChanged={() => void load()} onPrint={(o) => print(<Receipt order={o} settings={settings} shopName={shop.name} />)} /> : null}
        {panel === 'session' ? <SessionPanel session={session} shopName={shop.name} onClose={() => setPanel(null)} onPrint={print} onChange={(s: SessionView | null) => setBoot((b) => (b ? { ...b, session: s } : b))} /> : null}
        {openButton ? <ButtonModal button={openButton} products={openButton.productIds.map((id) => byId.get(id)).filter((p): p is PosProduct => Boolean(p))} lineQty={lineQty} onAdd={addToCart} onClose={() => setOpenButton(null)} /> : null}
        {panel === 'location' ? <LocationPicker locations={locations} current={here.id} onClose={() => setPanel(null)} onPick={(id) => void switchLocation(id)} /> : null}
        {panel === 'settings' ? <SettingsPanel settings={settings} location={here} invoiceEnabled={boot.features.invoice} onLocations={(list: StockLocation[]) => setBoot((b) => (b ? { ...b, locations: list.filter((l) => l.active), location: list.find((l) => l.id === b.location.id) ?? b.location } : b))} onClose={() => setPanel(null)} onSaved={(s: PosSettings) => setBoot((b) => (b ? { ...b, settings: s } : b))} /> : null}
        {panel === 'holds' ? (
          <Modal title="掛單" onClose={() => setPanel(null)}>
            {!holds.length ? <p className="py-8 text-center text-sm! text-[#8a7f72]">沒有掛單。購物車按「掛單」可以先保留這筆,先幫下一位結帳。</p> : null}
            <div className="space-y-2">
              {holds.map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded-xl border border-[#e5ded4] px-3 py-2.5">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void resumeHold(h)}>
                    <span className="block truncate text-sm! font-semibold!">{timeLabel(h.at)} · {h.lines.reduce((n, l) => n + l.quantity, 0)} 件 · {posMoney(h.lines.reduce((n, l) => n + l.price * l.quantity, 0))}</span>
                    <span className="block truncate text-xs! text-[#8a7f72]">{h.member?.name ? `${h.member.name} · ` : ''}{h.lines.map((l) => l.name).join('、')}</span>
                  </button>
                  <button type="button" className="shrink-0 text-sm! text-[#c84767]" onClick={async () => { if (await uiConfirm('刪除這筆掛單?')) saveHolds(holds.filter((x) => x.id !== h.id)); }}>刪除</button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs! text-[#a99e8f]">掛單只存在這台裝置的瀏覽器,換裝置看不到。</p>
          </Modal>
        ) : null}
        {done ? <DoneModal order={done} settings={settings} shopName={shop.name} onPrint={() => print(<Receipt order={done} settings={settings} shopName={shop.name} />)} onClose={() => { setDone(null); searchRef.current?.focus(); }} /> : null}
      </div>

      {/* 列印區:平常隱藏,列印時只印這一塊 */}
      {typeof document !== 'undefined' ? createPortal(<div className="pos-print" style={{ width: `${settings.receiptWidth}mm` }}>{printDoc}</div>, document.body) : null}
      <style>{`
        .pos-print { display: none; }
        @media print {
          @page { margin: 0; }
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
          body > *:not(.pos-print) { display: none !important; }
          .pos-print { display: block !important; padding: 3mm; font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif; }
        }
      `}</style>
    </>
  );
}
