'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DateField, MonthGrid, dateLabel, monthCells, shiftDate, shiftMonth, weekdayOf } from '@/app/components/BookingDatePicker';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import CardServiceHeader from '@/app/card/CardServiceHeader';
import { useScrollLock } from '@/app/components/useScrollLock';
import { uiAlert, uiConfirm, uiPrompt } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import {
  formatDateLabel, formatDateTime, formatRange, localParts, minutesToHHMM, money, PAY_METHOD_LABEL, PAYMENT_LABEL, paymentReportText,
  statusText, STATUS_COLOR, type BkBooking,
} from '@/lib/booking/shared';
import { api, btn, btnDark, btnSm, btnSmDark, card, errMsg, input, isTeam, staffTone, stylists, type Data } from './ui';
import { HoursTab, ServicesTab, SettingsTab, StaffTab } from './BookingSetup';
import QuotesTab from './QuotesTab';
import CustomersTab from './CustomersTab';
import ReportsTab from './ReportsTab';
import LineSettings from './LineSettings';

type Tab = 'bookings' | 'calendar' | 'quotes' | 'customers' | 'reports' | 'services' | 'staff' | 'hours' | 'settings';
const TABS: Tab[] = ['bookings', 'calendar', 'quotes', 'customers', 'reports', 'services', 'staff', 'hours', 'settings'];
const OPEN = ['pending', 'confirmed', 'checked_in'];

// 名片主人:線上預約管理
export default function BookingManager() {
  const [data, setData] = useState<Data | null>(null);
  // 功能分頁放在右上角漢堡選單,用網址 ?tab= 切換(可以直接分享、重新整理不會跳回預約)
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = TABS.includes(search.get('tab') as Tab) ? (search.get('tab') as Tab) : 'bookings';
  const setTab = (t: Tab) => router.replace(`${pathname}?tab=${t}`, { scroll: false });
  const [loadError, setLoadError] = useState('');
  const [adding, setAdding] = useState(false);
  const [calDate, setCalDate] = useState('');
  useScrollLock(adding);

  const load = useCallback(async () => {
    try { setData(await api<Data>('/api/mycard/booking')); setLoadError(''); }
    catch (e) { setLoadError(errMsg(e, '讀取失敗')); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (!data) return <><CardServiceHeader loggedIn current="booking" title="線上預約管理" /><p className="py-16 text-center text-sm text-[#8a7f72]">{loadError || '讀取中…'}</p></>;
  const pending = data.bookings.filter((b) => b.status === 'pending' && !(b.quote_id && b.approval_status === 'pending')).length;
  const quoteWaiting = data.quotes.filter((q) => q.status === 'requested').length;
  const hasQuote = quoteWaiting > 0 || data.quotes.length > 0 || data.services.some((s) => s.price_mode === 'quote');
  const activeServices = data.services.filter((s) => s.active).length;
  const hasHours = data.hours.length > 0 || data.staffHours.length > 0;
  const ready = activeServices > 0 && hasHours;
  const publicUrl = data.card ? `${typeof window === 'undefined' ? '' : window.location.origin}/@${data.card.slug}/book` : '';

  async function toggleEnabled() {
    if (!data) return;
    if (!data.business.enabled && !ready) return void uiAlert('開放預約前,請先新增至少一項服務,並設定營業時段。');
    try {
      await api('/api/mycard/booking', { method: 'PUT', body: JSON.stringify({ business: { ...data.business, enabled: !data.business.enabled } }) });
      uiToast(data.business.enabled ? '已暫停線上預約' : '已開放線上預約');
      void load();
    } catch (e) { void uiAlert(errMsg(e, '儲存失敗')); }
  }

  const tabs: [Tab, string][] = [
    ['bookings', `預約${pending ? `(${pending})` : ''}`], ['calendar', '日曆'],
    ...(hasQuote ? [['quotes', `詢價${quoteWaiting ? `(${quoteWaiting})` : ''}`] as [Tab, string]] : []),
    ['customers', '顧客'], ['reports', '報表'], ['services', '服務'], ['staff', '人員床位'], ['hours', '營業時段'], ['settings', '設定'],
  ];

  const menu = { title: '線上預約管理', items: tabs.map(([k, label]) => ({ href: `/mycard/booking?tab=${k}`, label, active: k === tab })) };

  return (
    <>
    <CardServiceHeader loggedIn current="booking" title="線上預約管理" appNav={menu} />
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#efe6da] via-[#f6f0e8] to-[#f6f2ec] px-4 py-4">
        <span aria-hidden="true" className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full bg-[#e6d8c6]/60" />
        <div className="relative flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight">{PAGE_TITLE[tab]}</h1>
            <p className="mt-0.5 text-sm text-[#6b6156]">{todayText(data.today)}{tab === 'bookings' && pending ? ` · ${pending} 筆待處理` : ''}</p>
          </div>
          <button type="button" onClick={() => setTab('settings')} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${data.business.enabled ? 'bg-white/80 text-[#2f6b3f]' : 'bg-white/80 text-[#8a7f72]'}`}>{data.business.enabled ? '● 開放預約中' : '○ 尚未開放'}</button>
        </div>
      </div>
      {!data.business.enabled && tab !== 'settings' ? (
        <button type="button" onClick={() => setTab('settings')} className="block w-full rounded-2xl border border-[#e5d6b8] bg-[#fffaf1] p-3 text-left text-sm text-[#9a6412]">線上預約還沒開放,顧客看不到預約按鈕 →<span className="block text-xs text-[#a08550]">到「設定」開啟開關、複製預約連結</span></button>
      ) : null}

      {tab === 'settings' && (
        <>
          <section className={card}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold tracking-[0.2em] text-[#a99e8f]">URBANLINKS × LINE</p>
                <p className="mt-0.5 text-lg font-bold">線上預約開關</p>
                <p className="mt-1 text-xs leading-5 text-[#8a7f72]">顧客從你的名片按「線上預約」,選服務、人員與時段送出;確認、訂金、提醒透過 LINE 通知。</p>
              </div>
              <button type="button" role="switch" aria-checked={data.business.enabled} onClick={() => void toggleEnabled()} className={`relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition ${data.business.enabled ? 'bg-[#2f6b3f]' : 'bg-[#d8d0c8]'}`}>
                <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${data.business.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>
            <p className={`mt-3 text-sm font-semibold ${data.business.enabled ? 'text-[#2f6b3f]' : 'text-[#8a7f72]'}`}>{data.business.enabled ? '● 開放預約中' : '○ 尚未開放'}</p>
            {!ready ? (
              <ul className="mt-3 space-y-1 rounded-xl bg-[#faf7f2] p-3 text-xs text-[#6b6156]">
                <li>{activeServices ? '✓' : '1.'} 新增服務項目 {activeServices ? `(${activeServices} 項)` : ''}</li>
                <li>{hasHours ? '✓' : '2.'} 設定每週營業時段</li>
                <li>3. 開啟上方開關,名片就會出現「線上預約」按鈕</li>
              </ul>
            ) : null}
            {publicUrl ? (
              <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-[#faf7f2] p-2 pl-3">
                <span className="min-w-0 flex-1 truncate text-xs text-[#6b6156]">{publicUrl}</span>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(publicUrl); uiToast('已複製預約連結'); }} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold">複製</button>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold">開啟</a>
              </div>
            ) : <p className="mt-3 text-xs text-[#a03b3b]">請先到「我的名片」建立名片,才有預約入口。</p>}
            <div className="mt-3 flex items-center gap-2 text-xs">
              {data.business.line_own ? <span className="text-[#2f6b3f]">通知由你的官方帳號「{data.business.line_name}」發送(下方設定)</span> : data.line_bound ? <><span className="min-w-0 flex-1 text-[#2f6b3f]">✓ 新預約會用 LINE 通知你</span><button type="button" onClick={() => void unbindPlatformLine(load)} className="shrink-0 rounded-full border border-[#e5ded4] px-3 py-1 text-[#a03b3b]">解除綁定</button></> : (
                <>
                  <span className="text-[#8a7f72]">綁定 LINE,才能收到新預約通知</span>
                  <a href={`/auth/line/start?mode=link&next=${encodeURIComponent('/mycard/booking?tab=settings')}`} className="rounded-full bg-[#06C755] px-3 py-1.5 font-semibold text-white">綁定 LINE</a>
                </>
              )}
            </div>
          </section>
          <LineSettings onChanged={() => void load()} />
        </>
      )}
      {tab === 'bookings' && <BookingsTab data={data} reload={load} />}
      {tab === 'calendar' && <CalendarTab data={data} reload={load} onDate={setCalDate} />}
      {tab === 'quotes' && <QuotesTab data={data} reload={load} />}
      {tab === 'customers' && <CustomersTab data={data} />}
      {tab === 'reports' && <ReportsTab data={data} />}
      {tab === 'services' && <ServicesTab data={data} reload={load} />}
      {tab === 'staff' && <StaffTab data={data} reload={load} />}
      {tab === 'hours' && <HoursTab data={data} reload={load} />}
      {tab === 'settings' && <SettingsTab data={data} reload={load} />}
    </div>

    {/* 底部導覽:預約 / 日曆 / 加單 / 顧客 / 報表(其他功能在右上角選單,目前所在的功能會取代第五格) */}
    <nav aria-label="預約功能" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ece4d9] bg-[#fbf8f4]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid h-16 max-w-3xl grid-cols-5 items-center px-2">
        {navItems(tab, pending).map((it) => it.key === 'add' ? (
          <button key="add" type="button" onClick={() => setAdding(true)} aria-label="新增預約(加單)" className="mx-auto -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#6b4a3a] text-3xl! font-light! leading-none text-white shadow-[0_6px_16px_#6b4a3a55]">+</button>
        ) : (
          <button key={it.key} type="button" onClick={() => setTab(it.key as Tab)} aria-current={tab === it.key ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-0.5 py-1 text-[11px]! ${tab === it.key ? 'font-semibold! text-[#1f1b19]' : 'text-[#8a7f72]'}`}>
            <NavIcon name={it.key} active={tab === it.key} />
            {it.label}
            {it.badge ? <span className="absolute right-[18%] top-0 min-w-4 rounded-full bg-[#b5523f] px-1 text-[10px]! leading-4 text-white">{it.badge}</span> : null}
          </button>
        ))}
      </div>
    </nav>

    {adding ? (
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#1f1b19]/40 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) setAdding(false); }}>
        <div role="dialog" aria-modal="true" aria-label="新增預約" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-3xl bg-[#f6f2ec] p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
          <div aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded-full bg-[#d8cfc4] sm:hidden" />
          <NewBooking data={data} initialDate={tab === 'calendar' && calDate ? calDate : data.today} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void load(); }} />
        </div>
      </div>
    ) : null}
    </>
  );
}

const PAGE_TITLE: Record<Tab, string> = {
  bookings: '預約', calendar: '日曆', quotes: '詢價', customers: '顧客', reports: '營業報表', services: '服務項目', staff: '服務人員', hours: '每週營業時段', settings: '接單規則',
};
const todayText = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日 週${'日一二三四五六'[weekdayOf(d)]}`;
const NAV_LABEL: Record<Tab, string> = { bookings: '預約', calendar: '日曆', quotes: '詢價', customers: '顧客', reports: '報表', services: '服務', staff: '人員床位', hours: '營業時段', settings: '設定' };
function navItems(tab: Tab, pending: number) {
  const fifth: Tab = ['bookings', 'calendar', 'customers', 'reports'].includes(tab) ? 'reports' : tab;
  return [
    { key: 'bookings', label: '預約', badge: pending },
    { key: 'calendar', label: '日曆', badge: 0 },
    { key: 'add', label: '', badge: 0 },
    { key: 'customers', label: '顧客', badge: 0 },
    { key: fifth, label: NAV_LABEL[fifth], badge: 0 },
  ];
}

// 底部導覽圖示(線條風格)
function NavIcon({ name, active }: { name: string; active: boolean }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: active ? 2 : 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'bookings') return <svg {...p}><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" /></svg>;
  if (name === 'calendar') return <svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>;
  if (name === 'customers') return <svg {...p}><circle cx="9" cy="8.5" r="3.5" /><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M16 5.2a3.4 3.4 0 0 1 0 6.6M18 14.8c1.7.7 2.7 2.4 3 5.2" /></svg>;
  if (name === 'reports') return <svg {...p}><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M8.5 16v-3M12 16V9M15.5 16v-5" /></svg>;
  if (name === 'services') return <svg {...p}><path d="M5 7h14M5 12h14M5 17h9" /></svg>;
  if (name === 'staff') return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c.8-4 3.8-6.5 7.5-6.5s6.7 2.5 7.5 6.5" /></svg>;
  if (name === 'hours') return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
  if (name === 'quotes') return <svg {...p}><path d="M6 3.5h9l3.5 3.5v13.5H6z" /><path d="M9 11h6M9 15h6" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>;
}

// 解除平台 LINE 綁定(會員的 LINE;之後不會再收到平台官方帳號的通知)
async function unbindPlatformLine(reload: () => Promise<void>) {
  if (!(await uiConfirm('解除 LINE 綁定後,新預約通知不會再用 LINE 發給你。確定解除?', { danger: true }))) return;
  const res = await fetch('/api/me/line', { method: 'DELETE' });
  if (!res.ok) return void uiAlert((await res.json().catch(() => null))?.error ?? '解除失敗');
  uiToast('已解除 LINE 綁定');
  void reload();
}

// ---------- 預約清單 ----------
function BookingsTab({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [filter, setFilter] = useState<'pending' | 'upcoming' | 'past' | 'all' | 'waitlist'>(() => (data.bookings.some((b) => b.status === 'pending') ? 'pending' : 'upcoming'));
  const [now] = useState(() => Date.now());
  const list = useMemo(() => data.bookings.filter((b) => {
    const future = new Date(b.end_at).getTime() >= now;
    if (filter === 'pending') return b.status === 'pending';
    if (filter === 'upcoming') return future && OPEN.includes(b.status);
    if (filter === 'past') return !future || !OPEN.includes(b.status);
    return true;
  }).sort((a, b) => (filter === 'past' ? b.start_at.localeCompare(a.start_at) : a.start_at.localeCompare(b.start_at))), [data.bookings, filter, now]);

  let lastDate = '';
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([['pending', '待處理'], ['upcoming', '即將到來'], ['past', '已結束'], ['all', '全部'], ...(data.waitlist.length ? [['waitlist', `候補(${data.waitlist.length})`]] : [])] as [typeof filter, string][]).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${filter === k ? 'bg-[#1f1b19] font-semibold text-white' : 'bg-white text-[#6b6156] shadow-[0_0_0_1px_#e9e1d6]'}`}>{label}</button>
          ))}
        </div>
      </div>
      {filter === 'waitlist' ? <WaitlistList data={data} reload={reload} /> : !list.length ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-[#a99e8f]">沒有預約</p> : list.map((b) => {
        const d = localParts(b.start_at).date;
        const header = d !== lastDate ? (lastDate = d) : '';
        return (
          <div key={b.id}>
            {header ? <p className="mb-1.5 mt-3 text-xs font-semibold text-[#8a7f72]">{d === data.today ? '今天 · ' : ''}{dateLabel(d)}</p> : null}
            <BookingCard booking={b} data={data} reload={reload} />
          </div>
        );
      })}
    </div>
  );
}

// ---------- 候補名單 ----------
function WaitlistList({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  async function remove(id: string) {
    if (!(await uiConfirm('移除這筆候補?'))) return;
    try { await api(`/api/mycard/booking/waitlist/${id}`, { method: 'DELETE' }); uiToast('已移除'); void reload(); }
    catch (e) { void uiAlert(errMsg(e)); }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs leading-5 text-[#8a7f72]">有人取消或改期空出時段時,系統依登記順序一次邀請一位(LINE 通知),邀請 {data.business.waitlist_invite_minutes} 分鐘內有效;名額不保留,先完成預約的人取得。</p>
      {data.waitlist.map((w) => (
        <div key={w.id} className={`${card} flex items-start gap-3`}>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{formatDateLabel(w.date).md}(週{formatDateLabel(w.date).weekday}) {w.from_min === 0 && w.to_min === 1440 ? '整天' : `${minutesToHHMM(w.from_min)}–${w.to_min === 1440 ? '24:00' : minutesToHHMM(w.to_min)}`}</p>
            <p className="text-[#6b6156]">{data.services.find((s) => s.id === w.service_id)?.name ?? ''}{w.staff_id ? ` · ${data.staff.find((s) => s.id === w.staff_id)?.name ?? ''}` : ''}</p>
            <p className="text-xs text-[#8a7f72]">{w.contact?.name ?? ''}{w.contact?.phone ? ` · ${w.contact.phone}` : ''}</p>
            {w.status === 'invited' ? <p className="text-xs text-[#2f6b3f]">已邀請 {w.invited_slot},{formatDateTime(w.invite_expires_at!)} 前有效</p> : <p className="text-xs text-[#9a6412]">等待空位</p>}
          </div>
          <button type="button" onClick={() => void remove(w.id)} className="shrink-0 text-xs text-[#a03b3b]">移除</button>
        </div>
      ))}
    </div>
  );
}

// ---------- 單筆預約(清單與日曆共用) ----------
function BookingCard({ booking: b, data, reload, defaultOpen = false }: { booking: BkBooking; data: Data; reload: () => Promise<void>; defaultOpen?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [panel, setPanel] = useState<'' | 'pay' | 'move' | 'complete'>('');
  const [now] = useState(() => Date.now());
  const team = isTeam(data);
  const staff = data.staff.find((s) => s.id === b.staff_id);
  const resource = data.resources.find((r) => r.id === b.resource_id);
  const payments = data.payments.filter((p) => p.booking_id === b.id);
  const customer = data.customers.find((c) => c.id === b.customer_id);
  const items = data.items.filter((it) => it.booking_id === b.id).sort((x, y) => x.seq - y.seq);
  const activeItems = items.filter((it) => it.status === 'active').length;
  const total = b.total_price || b.service_snapshot.price;
  const started = new Date(b.start_at).getTime() <= now;
  const soon = new Date(b.start_at).getTime() - now <= 3 * 3600000;
  const waitingPay = b.status === 'pending' && b.approval_status !== 'pending' && b.deposit_amount > b.paid_amount;
  // 顧客回報的付款(訂金或全額),還沒收足才顯示
  const report = b.payment_report?.at && b.payment_report.amount && ['pending', 'confirmed'].includes(b.status) && b.paid_amount < (b.payment_report.kind === 'full' ? b.total_price : b.deposit_amount) ? b.payment_report : null;
  const reportDue = report ? Math.max(0, (report.kind === 'full' ? b.total_price : b.deposit_amount) - b.paid_amount) : 0;

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await api(`/api/mycard/booking/bookings/${b.id}`, { method: 'POST', body: JSON.stringify({ expected_version: b.version, ...body }) });
      uiToast(done);
      setPanel('');
    } catch (e) { void uiAlert(errMsg(e)); }
    finally { setBusy(false); void reload(); }
  }
  async function cancelItem(seq: number, name: string) {
    const r = await uiPrompt(`只取消「${name}」這一項?其他項目照常,總額會重算;已收的款項請另外處理退款。\n原因(選填,顧客看得到):`, { danger: true });
    if (r === null) return;
    await post({ command: 'cancel_item', seq, reason: r }, `已取消「${name}」`);
  }
  async function run(command: string, label: string) {
    let reason = '';
    if (['reject', 'cancel'].includes(command)) {
      const r = await uiPrompt(`確定要「${label}」這筆預約?顧客會收到 LINE 通知。\n原因(選填,顧客看得到):`, { danger: true });
      if (r === null) return;
      reason = r;
    } else if (command === 'no_show' && !(await uiConfirm('確定標記為未到?'))) return;
    await post({ command, reason }, `已${label}`);
  }

  const tone = staffTone(data, b.staff_id);
  const svc = data.services.find((s) => s.id === b.service_id);
  const where = [b.branch_id ? data.branches.find((x) => x.id === b.branch_id)?.name ?? '' : '', resource?.name ?? ''].filter(Boolean).join(' · ');
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#ece4d9] bg-white shadow-[0_1px_3px_#2b1d1408]">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: tone.bar }} />
      <div className="p-3.5 pl-5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
              <p className="shrink-0 text-[17px]! font-bold! tabular-nums tracking-tight">{formatRange(b.start_at, b.end_at).split(' ')[1].replace('–', ' – ')}</p>
              <p className="min-w-0 truncate text-sm! font-semibold!">{b.service_snapshot.name}{b.addons?.length ? ` + ${b.addons.map((x) => x.name).join('、')}` : ''}</p>
            </div>
            {where ? <p className="truncate text-xs! text-[#8a7f72]">{where}</p> : null}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs! font-semibold! ${STATUS_COLOR[b.status]}`}>{statusText(b)}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          {svc?.image
            ? <img src={svc.image} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
            : <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg! font-semibold!" style={{ background: tone.soft, color: tone.text }}>{b.service_snapshot.name.slice(0, 1)}</span>}
          <div className="min-w-0 flex-1">
            {team && staff ? <p className="flex min-w-0 items-center gap-1.5 text-sm! font-semibold!"><span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]!" style={{ background: tone.soft, color: tone.text }}>{staff.name.slice(0, 1)}</span><span className="truncate">{staff.name}</span></p> : null}
            <p className="truncate text-sm! text-[#6b6156]">{b.contact?.name || '—'}{b.contact?.phone ? <> · <a href={`tel:${b.contact.phone}`} className="text-[#1f6f8b]">{b.contact.phone}</a></> : null}{b.created_by === 'owner' ? <span className="ml-1 text-[11px]! text-[#a99e8f]">(人工加單)</span> : null}</p>
            {total || b.paid_amount ? <p className="truncate text-xs! text-[#8a7f72]">{total ? money(total) : '現場報價'}{total > b.paid_amount ? <span className="text-[#b5523f]"> · 未收 {money(total - b.paid_amount)}</span> : <span className="text-[#2f6b3f]"> · 已付清</span>}</p> : null}
          </div>
          <button type="button" aria-expanded={open} aria-label={open ? '收合詳細' : '詳細與更多操作'} onClick={() => setOpen(!open)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg! leading-none ${open ? 'bg-[#1f1b19] text-white' : 'text-[#6b6156] hover:bg-[#f3ede4]'}`}>⋮</button>
        </div>
        {report ? <p className="rounded-lg bg-[#eaf4f7] px-2.5 py-1.5 text-xs! text-[#1f5f7f]">顧客回報已轉帳:{paymentReportText(report)}<span className="block text-[11px]! text-[#5d8597]">請核對入帳後按「收到{report.kind === 'full' ? '全額' : '訂金'}」</span></p> : null}
        {b.status === 'pending' && b.expires_at ? <p className="text-xs! text-[#9a6412]">{b.approval_status === 'pending' ? '請在' : '訂金期限'} {formatDateTime(b.expires_at)}{b.approval_status === 'pending' ? ' 前確認' : ''},逾時自動取消</p> : null}

        <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
        {b.quote_id && b.status === 'pending' && b.approval_status === 'pending' ? <p className="w-full text-xs! text-[#1f5f7f]">報價暫保留中,等顧客接受(到「詢價」修改或取消)</p> : null}
        {b.status === 'pending' && b.approval_status === 'pending' && !b.quote_id && <>
          <button type="button" disabled={busy} onClick={() => void run('approve', '確認')} className={btnDark}>確認預約</button>
          <button type="button" disabled={busy} onClick={() => void run('reject', '婉拒')} className={btn}>婉拒</button>
        </>}
        {report && reportDue > 0 && <button type="button" disabled={busy} onClick={() => void post({ command: 'payment', kind: b.status === 'pending' ? 'deposit' : 'balance', amount: reportDue, method: 'transfer', note: paymentReportText(report) }, b.status === 'pending' ? '已記錄收款,預約成立' : '已記錄收款')} className={btnDark}>收到{report.kind === 'full' ? '全額' : '訂金'} {money(reportDue)}</button>}
        {waitingPay && !report && <button type="button" disabled={busy} onClick={() => void post({ command: 'payment', kind: 'deposit', amount: b.deposit_amount - b.paid_amount, method: 'transfer', note: b.payment_report?.last5 ? `末 5 碼 ${b.payment_report.last5}` : '' }, '已記錄訂金,預約成立')} className={btnDark}>收到訂金 {money(b.deposit_amount - b.paid_amount)}</button>}
        {b.status === 'confirmed' && soon && !started && <button type="button" disabled={busy} onClick={() => void run('check_in', '報到')} className={btnDark}>報到</button>}
        {['confirmed', 'checked_in'].includes(b.status) && (started || b.status === 'checked_in') && <>
          <button type="button" disabled={busy} onClick={() => (total > b.paid_amount ? setPanel(panel === 'complete' ? '' : 'complete') : void run('complete', '完成'))} className={btnDark}>完成服務</button>
          <button type="button" disabled={busy} onClick={() => void run('no_show', '標記未到')} className={btn}>未到</button>
        </>}
        </div>

        {open ? (
          <div className="mt-3 space-y-1 border-t border-[#f0ebe2] pt-3 text-sm text-[#6b6156]">
            {items.length > 1 ? (
              <ul className="mt-1 space-y-1">
                {items.map((it) => (
                  <li key={it.id} className={`flex items-center gap-2 rounded-lg bg-[#faf7f2] px-2 py-1 text-xs ${it.status === 'cancelled' ? 'text-[#a99e8f] line-through' : 'text-[#3d3631]'}`}>
                    <span className="min-w-0 flex-1 truncate">{formatRange(it.start_at, it.end_at).split(' ')[1]} {it.service_snapshot.name}{team ? ` · ${data.staff.find((s) => s.id === it.staff_id)?.name ?? ''}` : ''}{it.amount ? ` · ${money(it.amount)}` : ''}</span>
                    {it.status === 'active' && activeItems > 1 && ['pending', 'confirmed', 'checked_in'].includes(b.status)
                      ? <button type="button" disabled={busy} onClick={() => void cancelItem(it.seq, it.service_snapshot.name)} className="shrink-0 text-[#a03b3b] no-underline">取消此項</button>
                      : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {data.allocations.filter((a) => a.booking_id === b.id && a.role === 'assistant').map((a) => (
              <p key={a.id} className="text-xs text-[#1f4f6e]">助理 {data.staff.find((s) => s.id === a.staff_id)?.name ?? ''} {formatRange(a.start_at, a.end_at).split(' ')[1]}</p>
            ))}
            {b.service_snapshot.steps?.length ? <p className="text-[11px] text-[#a99e8f]">{b.service_snapshot.steps.map((s) => `${s.name} ${s.minutes}`).join(' → ')} 分</p> : null}
  
          {customer?.note || customer?.tags?.length ? <p className="rounded-lg bg-[#fff6e6] px-2.5 py-1.5 text-xs text-[#7a5310]">{customer.tags?.length ? `${customer.tags.join('、')}${customer.note ? ' · ' : ''}` : ''}{customer.note}</p> : null}
          {b.contact?.note ? <p className="whitespace-pre-line rounded-lg bg-[#faf7f2] px-2.5 py-1.5 text-xs">{b.contact.note}</p> : null}
          {total || b.deposit_amount || b.paid_amount ? (
            <p className="text-xs">
              {total ? `總額 ${money(total)}` : '現場報價'}{b.deposit_amount ? ` · 訂金 ${money(b.deposit_amount)}` : ''} · 已收 {money(b.paid_amount)}
              {total > b.paid_amount ? <span className="text-[#9a6412]"> · 未收 {money(total - b.paid_amount)}</span> : null}
              {b.payment_status !== 'none' ? <span className="ml-1 text-[#8a7f72]">({PAYMENT_LABEL[b.payment_status]})</span> : null}
            </p>
          ) : null}
          {b.package_id ? <p className="text-xs text-[#2f5a3a]">使用套票{b.status === 'completed' ? '(已扣次)' : ['cancelled', 'expired', 'no_show'].includes(b.status) ? '(已退回)' : '(保留 1 次)'}</p> : null}
            {b.cancel_reason && ['cancelled', 'expired'].includes(b.status) ? <p className="text-xs text-[#8a7f72]">原因:{b.cancel_reason}</p> : null}
          {payments.length ? (
            <ul className="text-[11px] text-[#a99e8f]">
              {payments.map((p) => <li key={p.id}>{formatDateTime(p.created_at)} {p.kind === 'refund' ? '退款' : p.kind === 'deposit' ? '訂金' : '尾款'} {money(p.amount)}({PAY_METHOD_LABEL[p.method]}){p.note ? ` ${p.note}` : ''}</li>)}
            </ul>
          ) : null}
          <p className="text-[11px] text-[#a99e8f]">{b.booking_no}{b.reschedule_count ? ` · 已改期 ${b.reschedule_count} 次` : ''}</p>
              <div className="flex flex-wrap gap-2 pt-2">
            {['pending', 'confirmed'].includes(b.status) && !started && <button type="button" disabled={busy} onClick={() => setPanel(panel === 'move' ? '' : 'move')} className={btn}>改期</button>}
            {(b.status === 'confirmed' || waitingPay) && !started && <button type="button" disabled={busy} onClick={() => void run('cancel', '取消')} className={`${btn} text-[#a03b3b]`}>取消</button>}
            {b.status !== 'expired' && <button type="button" disabled={busy} onClick={() => setPanel(panel === 'pay' ? '' : 'pay')} className={btn}>收款 / 退款</button>}
            {data.business.reward_enabled && customer && customer.points > 0 && total > b.paid_amount && ['confirmed', 'checked_in', 'completed'].includes(b.status) ? (
              <button type="button" disabled={busy} onClick={() => void (async () => {
                const max = Math.min(customer.points, Math.ceil((total - b.paid_amount) / data.business.point_value));
                const v = await uiPrompt(`用點數折抵(目前 ${customer.points} 點,1 點 = ${money(data.business.point_value)}),最多 ${max} 點:`, { defaultValue: String(max) });
                if (v === null) return;
                await post({ command: 'redeem_points', points: Number(v) || 0 }, '已用點數折抵');
              })()} className={btn}>點數折抵</button>
            ) : null}
                </div>
          </div>
        ) : null}
      {panel === 'complete' && (
        <PaymentForm title="完成服務並收尾款" kinds={['balance']} defaultAmount={total - b.paid_amount} busy={busy} allowSkip
          onCancel={() => setPanel('')} onSubmit={(p) => void post({ command: 'complete', balance: p.amount ? { amount: p.amount, method: p.method } : undefined }, '已完成')} />
      )}
      {panel === 'pay' && (
        <PaymentForm title="記錄收款 / 退款" kinds={b.paid_amount ? ['deposit', 'balance', 'refund'] : ['deposit', 'balance']} defaultAmount={Math.max(0, (b.deposit_amount > b.paid_amount ? b.deposit_amount : total) - b.paid_amount)} busy={busy}
          onCancel={() => setPanel('')} onSubmit={(p) => void post({ command: 'payment', ...p }, p.kind === 'refund' ? '已記錄退款' : '已記錄收款')} />
      )}
      {panel === 'move' && <MovePanel booking={b} data={data} busy={busy} onCancel={() => setPanel('')} onSubmit={(startAt, staffId) => void post({ command: 'reschedule', start_at: startAt, staff_id: staffId }, '已改期,已通知顧客')} />}
      </div>
    </div>
  );
}

function PaymentForm({ title, kinds, defaultAmount, busy, allowSkip, onCancel, onSubmit }: {
  title: string; kinds: ('deposit' | 'balance' | 'refund')[]; defaultAmount: number; busy: boolean; allowSkip?: boolean;
  onCancel: () => void; onSubmit: (p: { kind: string; amount: number; method: string; note: string }) => void;
}) {
  const [kind, setKind] = useState(kinds[0]);
  const [amount, setAmount] = useState(String(Math.max(0, defaultAmount) || ''));
  const [method, setMethod] = useState(kinds[0] === 'balance' ? 'cash' : 'transfer');
  const [note, setNote] = useState('');
  const label = { deposit: '訂金', balance: '尾款 / 現場付款', refund: '退款' };
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-[#faf7f2] p-3">
      <p className="text-sm font-semibold">{title}</p>
      {kinds.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {kinds.map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1 text-xs ${kind === k ? 'bg-[#1f1b19] text-white' : 'border border-[#d7c9bd] bg-white'}`}>{label[k]}</button>)}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="金額" aria-label="金額" className={input} />
        <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="方式" className={input}>
          {Object.entries(PAY_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {!allowSkip ? <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} placeholder="備註(選填,例:末 5 碼)" className={input} /> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnSm}>取消</button>
        {allowSkip ? <button type="button" disabled={busy} onClick={() => onSubmit({ kind, amount: 0, method, note })} className={btnSm}>不收款,直接完成</button> : null}
        <button type="button" disabled={busy || !(Number(amount) > 0)} onClick={() => onSubmit({ kind, amount: Number(amount), method, note })} className={btnSmDark}>{allowSkip ? `收 ${money(Number(amount) || 0)} 並完成` : '記錄'}</button>
      </div>
    </div>
  );
}

// 店家選時段(改期 / 加單共用):日期 + 人員 → 可選時間(不受最短提前限制)
function useOwnerSlots(params: { date: string; service: string; addons: string[]; staff: string; booking?: string; extra?: string[]; branch?: string }) {
  const [slots, setSlots] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const key = `${params.date}|${params.service}|${params.addons.join(',')}|${params.staff}|${params.booking ?? ''}|${(params.extra ?? []).join(',')}|${params.branch ?? ''}`;
  useEffect(() => {
    if (!params.date || (!params.service && !params.booking)) return;
    let alive = true;
    Promise.resolve().then(async () => {
      setSlots(null);
      setError('');
      try {
        const q = new URLSearchParams({ date: params.date, service: params.service, addons: params.addons.join(','), staff: params.staff, booking: params.booking ?? '', extra: (params.extra ?? []).join(','), branch: params.branch ?? '' });
        const day = await api<{ slots: string[] }>(`/api/mycard/booking/bookings?${q}`);
        if (alive) setSlots(day?.slots ?? []);
      } catch (e) { if (alive) { setError(errMsg(e)); setSlots([]); } }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { slots, error };
}

function TimeGrid({ slots, time, onTime, error }: { slots: string[] | null; time: string; onTime: (t: string) => void; error: string }) {
  if (slots === null) return <p className="py-3 text-center text-xs text-[#8a7f72]">讀取時段…</p>;
  if (error) return <p className="text-xs text-[#a03b3b]">{error}</p>;
  if (!slots.length) return <p className="rounded-lg bg-white p-3 text-center text-xs text-[#8a7f72]">這天沒有可用時段(休息、已滿或床位不足)</p>;
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
      {slots.map((t) => <button key={t} type="button" onClick={() => onTime(t)} className={`rounded-lg border py-2 text-sm ${t === time ? 'border-[#1f1b19] bg-[#1f1b19] font-semibold text-white' : 'border-[#e5ded4] bg-white'}`}>{t}</button>)}
    </div>
  );
}

function MovePanel({ booking, data, busy, onCancel, onSubmit }: { booking: BkBooking; data: Data; busy: boolean; onCancel: () => void; onSubmit: (startAt: string, staffId: string | null) => void }) {
  const [date, setDate] = useState(localParts(booking.start_at).date);
  const [staff, setStaff] = useState(booking.staff_id ?? '');
  const [time, setTime] = useState('');
  const team = isTeam(data);
  const { slots, error } = useOwnerSlots({ date, service: '', addons: [], staff, booking: booking.id });
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-[#faf7f2] p-3">
      <p className="text-sm font-semibold">改期{team ? ' / 換人員' : ''}</p>
      <div className={`grid gap-2 ${team ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <DateField value={date} min={localParts(new Date()).date} onChange={(d) => { setDate(d); setTime(''); }} className={team ? 'col-span-2' : ''} />
        {team ? (
          <select value={staff} onChange={(e) => { setStaff(e.target.value); setTime(''); }} aria-label="人員" className={`${input} min-w-0`}>
            <option value="">不指定</option>
            {stylists(data).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : null}
      </div>
      <TimeGrid slots={slots} time={time} onTime={setTime} error={error} />
      <p className="text-[11px] text-[#a99e8f]">改期成功後會通知顧客,原本的 LINE 提醒會改成新時間。</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnSm}>取消</button>
        <button type="button" disabled={busy || !time} onClick={() => onSubmit(new Date(`${date}T${time}:00+08:00`).toISOString(), staff || null)} className={btnSmDark}>{time ? `改到 ${formatDateLabel(date).md} ${time}` : '確認改期'}</button>
      </div>
    </div>
  );
}

// ---------- 人工加單(電話、現場客) ----------
function NewBooking({ data, onClose, onDone, initialDate }: { data: Data; onClose: () => void; onDone: () => void; initialDate?: string }) {
  const services = data.services.filter((s) => s.active);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [staff, setStaff] = useState('');
  const [branch, setBranch] = useState(data.branches.find((b) => b.active)?.id ?? '');
  const [date, setDate] = useState(initialDate ?? data.today);
  const [time, setTime] = useState('');
  const [contact, setContact] = useState({ name: '', phone: '', note: '' });
  const [customerId, setCustomerId] = useState('');
  const [matches, setMatches] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const team = isTeam(data);
  // 輸入姓名或電話時找既有顧客(避免同一人建成兩份檔案)
  useEffect(() => {
    const term = contact.name.trim() || contact.phone.trim();
    if (customerId || term.length < 1) return;
    let alive = true;
    const t = setTimeout(() => {
      void api<{ customers: { id: string; name: string; phone: string }[] }>(`/api/mycard/booking/customers?q=${encodeURIComponent(term)}`)
        .then((r) => { if (alive) setMatches(r.customers.slice(0, 5)); }).catch(() => {});
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [contact.name, contact.phone, customerId]);
  const addons = data.addons.filter((a) => a.service_id === serviceId && a.active);
  const { slots, error } = useOwnerSlots({ date, service: serviceId, addons: addonIds, staff, extra: extraIds, branch });

  async function save() {
    if (!contact.name.trim()) return void uiAlert('請填寫顧客姓名');
    setBusy(true);
    try {
      await api('/api/mycard/booking/bookings', {
        method: 'POST',
        body: JSON.stringify({ service_id: serviceId, addon_ids: addonIds, extra_ids: extraIds, branch_id: branch || null, customer_id: customerId || null, staff_id: staff || null, start_at: new Date(`${date}T${time}:00+08:00`).toISOString(), contact }),
      });
      uiToast('已新增預約');
      onDone();
    } catch (e) { void uiAlert(errMsg(e)); }
    finally { setBusy(false); }
  }

  if (!services.length) return <p className={`${card} text-sm text-[#8a7f72]`}>請先到「服務」新增服務項目。</p>;
  return (
    <div className={`${card} space-y-3`}>
      <div className="flex items-center justify-between">
        <p className="font-semibold">新增預約(電話、現場客)</p>
        <button type="button" onClick={onClose} aria-label="關閉" className="px-2 text-lg text-[#8a7f72]">×</button>
      </div>
      {data.branches.length ? (
        <select value={branch} onChange={(e) => { setBranch(e.target.value); setTime(''); }} aria-label="分店" className={input}>
          {data.branches.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      ) : null}
      <select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setAddonIds([]); setExtraIds((x) => x.filter((id) => id !== e.target.value)); setTime(''); }} aria-label="服務" className={input}>
        {services.map((s) => <option key={s.id} value={s.id}>{s.name}({s.duration_minutes} 分{s.price ? ` · ${money(s.price)}` : ''})</option>)}
      </select>
      {addons.length ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {addons.map((a) => (
            <label key={a.id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={addonIds.includes(a.id)} onChange={(e) => { setAddonIds(e.target.checked ? [...addonIds, a.id] : addonIds.filter((x) => x !== a.id)); setTime(''); }} />
              {a.name}{a.price ? ` +${money(a.price)}` : ''}
            </label>
          ))}
        </div>
      ) : null}
      {services.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[#8a7f72]">接著做:</span>
          {services.filter((s) => s.id !== serviceId).map((s) => {
            const on = extraIds.includes(s.id);
            return <button key={s.id} type="button" aria-pressed={on} disabled={!on && extraIds.length >= 2} onClick={() => { setExtraIds(on ? extraIds.filter((id) => id !== s.id) : [...extraIds, s.id]); setTime(''); }} className={`rounded-full px-2.5 py-1 disabled:opacity-40 ${on ? 'bg-[#1f1b19] text-white' : 'border border-[#d7c9bd] bg-white'}`}>{on ? '✓ ' : '+ '}{s.name}</button>;
          })}
        </div>
      ) : null}
      <div className={`grid gap-2 ${team ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <DateField value={date} min={data.today} onChange={(d) => { setDate(d); setTime(''); }} className={team ? 'col-span-2' : ''} />
        {team ? (
          <select value={staff} onChange={(e) => { setStaff(e.target.value); setTime(''); }} aria-label="人員" className={`${input} min-w-0`}>
            <option value="">不指定</option>
            {stylists(data).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : null}
      </div>
      <TimeGrid slots={slots} time={time} onTime={setTime} error={error} />
      {time ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={contact.name} onChange={(e) => { setContact({ ...contact, name: e.target.value }); setCustomerId(''); }} maxLength={40} placeholder="顧客姓名" aria-label="顧客姓名" autoComplete="off" className={input} />
          <input value={contact.phone} onChange={(e) => { setContact({ ...contact, phone: e.target.value }); setCustomerId(''); }} inputMode="tel" maxLength={20} placeholder="電話(選填)" aria-label="電話" autoComplete="off" className={input} />
          {customerId ? (
            <p className="text-xs text-[#2f6b3f] sm:col-span-2">✓ 已選既有顧客 {contact.name} <button type="button" onClick={() => setCustomerId('')} className="ml-1 text-[#a03b3b]">改為新顧客</button></p>
          ) : matches.length && (contact.name || contact.phone) ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs sm:col-span-2">
              <span className="text-[#8a7f72]">是這位嗎?</span>
              {matches.map((m) => <button key={m.id} type="button" onClick={() => { setCustomerId(m.id); setContact({ ...contact, name: m.name, phone: m.phone }); setMatches([]); }} className="rounded-full border border-[#d7c9bd] bg-white px-2.5 py-1">{m.name}{m.phone ? ` ${m.phone.slice(-3)}` : ''}</button>)}
            </div>
          ) : null}
          <input value={contact.note} onChange={(e) => setContact({ ...contact, note: e.target.value })} maxLength={200} placeholder="備註(選填)" className={`${input} sm:col-span-2`} />
        </div>
      ) : null}
      <p className="text-[11px] text-[#a99e8f]">人工加單直接成立,一樣會檢查人員與床位是否衝突;沒有綁定 LINE 的顧客不會收到通知。</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btn}>取消</button>
        <button type="button" disabled={busy || !time} onClick={() => void save()} className={btnDark}>{busy ? '新增中…' : '新增預約'}</button>
      </div>
    </div>
  );
}


// ---------- 日曆:日 / 週 / 月 / 年;自製月曆(可收合)與預約注記;人員篩選、分店篩選 ----------
// 日視圖:每位人員一欄(或座位視圖每個座位一欄),分段預約畫出每一段與等待空檔
const HOUR_PX = 72;
const WEEK_HOUR_PX = 48;
type Block = { key: string; booking: BkBooking; start: number; end: number; kind: 'main' | 'assistant' | 'seat' | 'wait' };
type CalView = 'day' | 'week' | 'month' | 'year';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function CalendarTab({ data, reload, onDate }: { data: Data; reload: () => Promise<void>; onDate?: (date: string) => void }) {
  const [date, setDateRaw] = useState(data.today);
  const [view, setView] = useState<CalView>('day');
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<'staff' | 'seat'>('staff');
  const [branch, setBranch] = useState('');
  const [onlyStaff, setOnlyStaff] = useState<string[]>([]);
  const setDate = (d: string) => { setDateRaw(d); setSelected(''); onDate?.(d); };
  const team = isTeam(data);
  const people = data.staff.filter((s) => s.active || data.bookings.some((b) => b.staff_id === s.id));

  // 篩選後的預約(不含逾期;取消的只在日視圖統計)
  const visible = data.bookings.filter((b) => b.status !== 'expired' && b.status !== 'cancelled' && (!branch || b.branch_id === branch) && (!onlyStaff.length || onlyStaff.includes(b.staff_id ?? '')));
  const marks: Record<string, number> = {};
  for (const b of visible) { const d = localParts(b.start_at).date; marks[d] = (marks[d] ?? 0) + 1; }
  const byDate = (d: string) => visible.filter((b) => localParts(b.start_at).date === d).sort((x, y) => x.start_at.localeCompare(y.start_at));

  const weekStart = shiftDate(date, -weekdayOf(date));
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));
  const step = (dir: number) => setDate(view === 'day' ? shiftDate(date, dir) : view === 'week' ? shiftDate(date, dir * 7) : view === 'month' ? shiftMonth(date, dir) : shiftMonth(date, dir * 12));
  const title = view === 'year' ? `${date.slice(0, 4)} 年` : `${date.slice(0, 4)} 年 ${Number(date.slice(5, 7))} 月`;
  const sel = data.bookings.find((b) => b.id === selected);

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-[#ece4d9] bg-white p-3 shadow-[0_1px_3px_#2b1d1408]">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => (view === 'day' || view === 'week' ? setExpanded(!expanded) : setView('month'))} aria-expanded={view === 'day' || view === 'week' ? expanded : undefined}
            className="flex min-w-0 items-center gap-1 rounded-full px-2 py-1 text-lg! font-bold!">
            <span className="truncate">{title}</span>
            {view === 'day' || view === 'week' ? <span aria-hidden="true" className={`text-xs! text-[#8a7f72] transition ${expanded ? 'rotate-180' : ''}`}>▾</span> : null}
          </button>
          <span className="flex-1" />
          <button type="button" onClick={() => step(-1)} aria-label="上一段" className="h-9 w-9 shrink-0 rounded-full text-xl! text-[#6b6156] hover:bg-[#f3ede4]">‹</button>
          <button type="button" onClick={() => step(1)} aria-label="下一段" className="h-9 w-9 shrink-0 rounded-full text-xl! text-[#6b6156] hover:bg-[#f3ede4]">›</button>
          <button type="button" onClick={() => setDate(data.today)} className="shrink-0 rounded-full border border-[#e5ded4] px-3 py-1.5 text-xs! font-semibold!">今天</button>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1 rounded-full bg-[#f3ede4] p-1" role="group" aria-label="顯示範圍">
          {([['day', '日'], ['week', '週'], ['month', '月'], ['year', '年']] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => { setView(k); setSelected(''); }} className={`rounded-full py-1.5 text-sm! ${view === k ? 'bg-white font-semibold! text-[#1f1b19] shadow-sm' : 'text-[#6b6156]'}`}>{label}</button>
          ))}
        </div>

        {/* 日 / 週:收合時是一週的日期列,展開是整個月;有預約的日期有注記 */}
        {view === 'day' || view === 'week' ? (
          expanded ? (
            <div className="mt-2"><MonthGrid month={date} value={date} today={data.today} marks={marks} onPick={(d) => { setDate(d); setExpanded(false); }} /></div>
          ) : (
            <div className="mt-2 grid grid-cols-7 text-center">
              {weekDays.map((d) => {
                const on = d === date;
                return (
                  <button key={d} type="button" onClick={() => { setDate(d); if (view === 'week') setView('day'); }} aria-pressed={on} className="flex flex-col items-center gap-1 py-1">
                    <span className="text-[11px]! text-[#a99e8f]">{WEEKDAYS[weekdayOf(d)]}</span>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm! ${on ? 'bg-[#1f1b19] font-semibold! text-white' : d === data.today ? 'font-semibold! text-[#9a3b2e] ring-1 ring-[#e3cfc7]' : 'text-[#3d3631]'}`}>{Number(d.slice(8))}</span>
                    <span className="flex h-1.5 gap-0.5">{Array.from({ length: Math.min(3, marks[d] ?? 0) }, (_, i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#c99a6b]" />)}</span>
                  </button>
                );
              })}
            </div>
          )
        ) : null}

        {/* 人員篩選 + 分店 */}
        {team || data.branches.length ? (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {team ? <>
              <button type="button" aria-pressed={!onlyStaff.length} onClick={() => setOnlyStaff([])} className={`shrink-0 rounded-full border px-3 py-1 text-xs! ${!onlyStaff.length ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#e5ded4] text-[#6b6156]'}`}>全部人員</button>
              {people.filter((s) => s.role !== 'assistant').map((s) => {
                const on = onlyStaff.includes(s.id);
                const tone = staffTone(data, s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on} onClick={() => setOnlyStaff(on ? onlyStaff.filter((x) => x !== s.id) : [...onlyStaff, s.id])}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs! ${on ? 'border-[#1f1b19] font-semibold!' : 'border-[#e5ded4] text-[#6b6156]'}`}>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]! font-semibold!" style={{ background: tone.soft, color: tone.text }}>{s.name.slice(0, 1)}</span>{s.name}
                  </button>
                );
              })}
            </> : null}
            {data.branches.length ? (
              <select value={branch} onChange={(e) => { setBranch(e.target.value); setSelected(''); }} aria-label="分店" className="shrink-0 rounded-full border border-[#e5ded4] bg-white px-2 py-1 text-xs!">
                <option value="">所有分店</option>
                {data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : null}
          </div>
        ) : null}
      </div>

      {view === 'day' ? <DayGrid data={data} date={date} branch={branch} onlyStaff={onlyStaff} mode={mode} setMode={setMode} selected={selected} setSelected={setSelected} /> : null}
      {view === 'week' ? <WeekGrid data={data} days={weekDays} bookings={visible} selected={selected} setSelected={setSelected} onDay={(d) => { setDate(d); setView('day'); }} /> : null}
      {view === 'month' ? <MonthBoard data={data} month={date} byDate={byDate} today={data.today} onDay={(d) => { setDate(d); setView('day'); }} /> : null}
      {view === 'year' ? <YearBoard year={Number(date.slice(0, 4))} marks={marks} today={data.today} onMonth={(d) => { setDate(d); setView('month'); }} /> : null}

      {sel ? <BookingCard key={`${sel.id}-${sel.version}`} booking={sel} data={data} reload={reload} defaultOpen /> : view === 'day' || view === 'week' ? <p className="text-center text-xs! text-[#a99e8f]">點日曆上的預約查看詳細與操作;右下「+」可在這天加單</p> : null}
    </div>
  );
}

// 日視圖
function DayGrid({ data, date, branch, onlyStaff, mode, setMode, selected, setSelected }: {
  data: Data; date: string; branch: string; onlyStaff: string[]; mode: 'staff' | 'seat'; setMode: (m: 'staff' | 'seat') => void; selected: string; setSelected: (id: string) => void;
}) {
  const day = data.bookings.filter((b) => localParts(b.start_at).date === date && b.status !== 'expired' && (!branch || b.branch_id === branch));
  const shown = day.filter((b) => b.status !== 'cancelled' && (!onlyStaff.length || onlyStaff.includes(b.staff_id ?? '')));
  const team = isTeam(data);
  const seatView = mode === 'seat' && data.resources.length > 0;
  const columns = seatView
    ? data.resources.filter((r) => (!branch || !r.branch_id || r.branch_id === branch) && (r.active || shown.some((b) => b.resource_id === r.id))).map((r) => ({ id: r.id, name: r.name }))
    : team
      ? data.staff.filter((s) => (s.active || shown.some((b) => b.staff_id === s.id)) && (!onlyStaff.length || onlyStaff.includes(s.id))).map((s) => ({ id: s.id, name: s.name }))
      : [{ id: '', name: '' }];
  const toMin = (iso: string) => localParts(iso).minutes + (localParts(iso).date > date ? 1440 : 0);

  function blocksFor(colId: string): Block[] {
    const out: Block[] = [];
    for (const b of shown) {
      const allocs = data.allocations.filter((a) => a.booking_id === b.id);
      if (seatView) {
        const mine = allocs.filter((a) => a.resource_id === colId);
        if (mine.length) mine.forEach((a) => out.push({ key: a.id, booking: b, start: toMin(a.start_at), end: toMin(a.end_at), kind: 'seat' }));
        else if (!allocs.length && b.resource_id === colId) out.push({ key: b.id, booking: b, start: toMin(b.start_at), end: toMin(b.end_at), kind: 'seat' });
        continue;
      }
      const mine = allocs.filter((a) => a.staff_id && (!team || a.staff_id === colId));
      if (!mine.length) {
        if (!allocs.length && (!team || b.staff_id === colId)) out.push({ key: b.id, booking: b, start: toMin(b.start_at), end: toMin(b.end_at), kind: 'main' });
        continue;
      }
      const sorted = [...mine].sort((x, y) => x.start_at.localeCompare(y.start_at));
      sorted.forEach((a) => out.push({ key: a.id, booking: b, start: toMin(a.start_at), end: toMin(a.end_at), kind: a.role === 'assistant' ? 'assistant' : 'main' }));
      const mains = sorted.filter((a) => a.role === 'main');
      for (let i = 1; i < mains.length; i++) {
        const gapStart = toMin(mains[i - 1].end_at);
        const gapEnd = toMin(mains[i].start_at);
        if (gapEnd > gapStart) out.push({ key: `${b.id}-w${i}`, booking: b, start: gapStart, end: gapEnd, kind: 'wait' });
      }
    }
    return out;
  }

  // 顯示範圍:當天營業 / 班表時段與預約時間的聯集,至少 10:00–19:00
  const wd = weekdayOf(date);
  const ranges = [...data.hours.filter((h) => h.weekday === wd), ...data.staffHours.filter((h) => h.weekday === wd)];
  const startH = Math.floor(Math.min(10 * 60, ...ranges.map((r) => r.start_min), ...shown.map((b) => toMin(b.start_at))) / 60);
  const endH = Math.min(26, Math.ceil(Math.max(19 * 60, ...ranges.map((r) => r.end_min), ...shown.map((b) => toMin(b.occupy_end_at))) / 60));
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const closedAll = data.exceptions.filter((x) => !x.staff_id && new Date(x.start_at) < new Date(`${date}T23:59:59+08:00`) && new Date(x.end_at) > new Date(`${date}T00:00:00+08:00`));
  const wide = columns.length > 1;

  return (
    <div className="overflow-hidden rounded-3xl border border-[#ece4d9] bg-white shadow-[0_1px_3px_#2b1d1408]">
      <div className="flex items-center gap-2 border-b border-[#f0ebe2] px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-xs! text-[#8a7f72]">{dateLabel(date)} · {shown.length} 筆預約{closedAll.length ? ' · 有休假設定' : ''}{day.length > shown.length ? ` · 已取消 ${day.filter((b) => b.status === 'cancelled').length} 筆` : ''}</p>
        {data.resources.length ? (
          <div className="flex shrink-0 gap-1 rounded-full bg-[#f3ede4] p-0.5" role="group" aria-label="日曆欄位">
            {([['staff', '人員'], ['seat', '座位']] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`rounded-full px-2.5 py-0.5 text-xs! ${mode === k ? 'bg-white font-semibold! text-[#1f1b19]' : 'text-[#6b6156]'}`}>{label}</button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <div className="flex" style={{ minWidth: wide ? `${44 + columns.length * 120}px` : undefined }}>
          <div className="w-11 shrink-0 border-r border-[#f0ebe2]">
            {wide ? <div className="h-8 border-b border-[#f0ebe2]" /> : null}
            {hours.map((h) => <div key={h} style={{ height: HOUR_PX }} className="pr-1 pt-0.5 text-right text-[10px]! text-[#a99e8f]">{String(h % 24).padStart(2, '0')}:00</div>)}
          </div>
          {columns.map((col) => (
            <div key={col.id || 'solo'} className="min-w-0 flex-1 border-r border-[#f0ebe2] last:border-r-0">
              {wide ? <div className="flex h-8 items-center justify-center truncate border-b border-[#f0ebe2] px-1 text-xs! font-semibold!">{col.name}</div> : null}
              <div className="relative" style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-[#f5f1ea]" style={{ top: i * HOUR_PX }} />)}
                {blocksFor(col.id).sort((x, y) => (x.kind === 'wait' ? -1 : 0) - (y.kind === 'wait' ? -1 : 0)).map((blk) => {
                  const b = blk.booking;
                  const top = ((blk.start - startH * 60) / 60) * HOUR_PX;
                  const height = Math.max(blk.kind === 'wait' ? 14 : 22, ((blk.end - blk.start) / 60) * HOUR_PX - 2);
                  const tone = staffTone(data, blk.kind === 'assistant' ? data.allocations.find((a) => a.id === blk.key)?.staff_id : b.staff_id);
                  const who = data.staff.find((s) => s.id === b.staff_id)?.name;
                  const res = data.resources.find((r) => r.id === b.resource_id)?.name;
                  const style = blk.kind === 'wait'
                    ? { top, height, background: '#eef5ee', color: '#2f5a3a', borderColor: 'transparent' }
                    : { top, height, background: b.status === 'pending' ? '#fff6e6' : tone.soft, borderColor: b.status === 'pending' ? '#e7c98f' : tone.bar, color: '#2b2622', opacity: ['completed', 'no_show'].includes(b.status) ? 0.6 : 1 };
                  return (
                    <button key={blk.key} type="button" onClick={() => setSelected(b.id === selected ? '' : b.id)} style={style}
                      className={`absolute inset-x-1 overflow-hidden rounded-xl border-l-4 px-2 ${height < 40 ? 'py-px' : 'py-1'} text-left text-[11px]! leading-4! ${b.id === selected ? 'ring-2 ring-[#1f1b19]' : ''}`}>
                      {blk.kind === 'wait' ? (
                        <span className="block truncate">等待 · 可接其他客人</span>
                      ) : height < 40 ? (
                        <span className="block truncate font-semibold!">{minutesToHHMM(blk.start % 1440)} {b.contact?.name || '—'}<span className="font-normal! text-[#6b6156]"> · {blk.kind === 'assistant' ? '助理' : b.service_snapshot.name}</span></span>
                      ) : (
                        <>
                          <span className="block truncate font-semibold!">{team && who && !wide ? `${who} / ` : ''}{blk.kind === 'assistant' ? '助理 · ' : ''}{b.service_snapshot.name}</span>
                          <span className="block truncate text-[#6b6156]">{b.contact?.name || '—'} · {minutesToHHMM(blk.start % 1440)}–{minutesToHHMM(blk.end % 1440)}</span>
                          {res && height > 60 ? <span className="block truncate text-[#8a7f72]">{res}</span> : null}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 週視圖:七天各一欄,依人員上色
function WeekGrid({ data, days, bookings, selected, setSelected, onDay }: { data: Data; days: string[]; bookings: BkBooking[]; selected: string; setSelected: (id: string) => void; onDay: (d: string) => void }) {
  const inWeek = bookings.filter((b) => days.includes(localParts(b.start_at).date));
  const startH = Math.floor(Math.min(10 * 60, ...data.hours.map((h) => h.start_min), ...inWeek.map((b) => localParts(b.start_at).minutes)) / 60);
  const endH = Math.min(24, Math.ceil(Math.max(19 * 60, ...data.hours.map((h) => h.end_min), ...inWeek.map((b) => localParts(b.end_at).minutes || 1440)) / 60));
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  return (
    <div className="overflow-hidden rounded-3xl border border-[#ece4d9] bg-white shadow-[0_1px_3px_#2b1d1408]">
      <div className="overflow-x-auto">
        <div className="flex min-w-[460px]">
          <div className="w-10 shrink-0 border-r border-[#f0ebe2]">
            <div className="h-11 border-b border-[#f0ebe2]" />
            {hours.map((h) => <div key={h} style={{ height: WEEK_HOUR_PX }} className="pr-1 pt-0.5 text-right text-[10px]! text-[#a99e8f]">{String(h).padStart(2, '0')}</div>)}
          </div>
          {days.map((d) => (
            <div key={d} className="min-w-0 flex-1 border-r border-[#f0ebe2] last:border-r-0">
              <button type="button" onClick={() => onDay(d)} className={`flex h-11 w-full flex-col items-center justify-center border-b border-[#f0ebe2] text-[11px]! ${d === data.today ? 'font-semibold! text-[#9a3b2e]' : 'text-[#6b6156]'}`}>
                <span>{WEEKDAYS[weekdayOf(d)]}</span><span className="text-sm!">{Number(d.slice(8))}</span>
              </button>
              <div className="relative" style={{ height: hours.length * WEEK_HOUR_PX }}>
                {hours.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-[#f5f1ea]" style={{ top: i * WEEK_HOUR_PX }} />)}
                {inWeek.filter((b) => localParts(b.start_at).date === d).map((b) => {
                  const s = localParts(b.start_at).minutes;
                  const e = localParts(b.end_at).date > d ? 1440 : localParts(b.end_at).minutes;
                  const tone = staffTone(data, b.staff_id);
                  const top = ((s - startH * 60) / 60) * WEEK_HOUR_PX;
                  const height = Math.max(18, ((e - s) / 60) * WEEK_HOUR_PX - 2);
                  return (
                    <button key={b.id} type="button" onClick={() => setSelected(b.id === selected ? '' : b.id)} style={{ top, height, background: b.status === 'pending' ? '#fff6e6' : tone.soft, borderColor: b.status === 'pending' ? '#e7c98f' : tone.bar }}
                      className={`absolute inset-x-0.5 overflow-hidden rounded-md border-l-[3px] px-1 text-left text-[10px]! leading-[13px]! text-[#2b2622] ${b.id === selected ? 'ring-2 ring-[#1f1b19]' : ''}`}>
                      <span className="block truncate font-semibold!">{minutesToHHMM(s)}</span>
                      {height > 28 ? <span className="block truncate">{b.contact?.name || b.service_snapshot.name}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 月視圖:每天列出前幾筆(依人員上色),點日期看當天
function MonthBoard({ data, month, byDate, today, onDay }: { data: Data; month: string; byDate: (d: string) => BkBooking[]; today: string; onDay: (d: string) => void }) {
  const [y, m] = month.split('-').map(Number);
  return (
    <div className="rounded-3xl border border-[#ece4d9] bg-white p-2 shadow-[0_1px_3px_#2b1d1408]">
      <div className="grid grid-cols-7 text-center text-[11px]! text-[#a99e8f]">{WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}</div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-[#f0ebe2]">
        {monthCells(y, m).map((d, i) => {
          if (!d) return <span key={`e${i}`} className="min-h-[64px] bg-[#faf7f2]" />;
          const list = byDate(d);
          return (
            <button key={d} type="button" onClick={() => onDay(d)} className="flex min-h-[64px] min-w-0 flex-col items-stretch gap-0.5 bg-white p-0.5 text-left">
              <span className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[11px]! ${d === today ? 'bg-[#1f1b19] font-semibold! text-white' : 'text-[#3d3631]'}`}>{Number(d.slice(8))}</span>
              {list.slice(0, 2).map((b) => {
                const tone = staffTone(data, b.staff_id);
                return <span key={b.id} className="block truncate rounded px-0.5 text-[9px]! leading-[13px]" style={{ background: tone.soft, color: tone.text }}>{minutesToHHMM(localParts(b.start_at).minutes)}</span>;
              })}
              {list.length > 2 ? <span className="text-center text-[9px]! leading-3 text-[#8a7f72]">+{list.length - 2}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 年視圖:12 個月的預約量(顏色越深越多),點月份看那個月
function YearBoard({ year, marks, today, onMonth }: { year: number; marks: Record<string, number>; today: string; onMonth: (d: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
        const cells = monthCells(year, m);
        const count = cells.reduce((n, d) => n + (d ? marks[d] ?? 0 : 0), 0);
        return (
          <button key={m} type="button" onClick={() => onMonth(`${year}-${String(m).padStart(2, '0')}-01`)} className="rounded-2xl border border-[#ece4d9] bg-white p-2 text-left">
            <span className="flex items-baseline justify-between"><span className="text-sm! font-semibold!">{m} 月</span><span className="text-[11px]! text-[#8a7f72]">{count ? `${count} 筆` : ''}</span></span>
            <span className="mt-1 grid grid-cols-7 gap-0.5">
              {cells.map((d, j) => {
                const n = d ? marks[d] ?? 0 : 0;
                return <span key={d ?? `e${j}`} className={`aspect-square rounded-[3px] ${d === today ? 'ring-1 ring-[#1f1b19]' : ''}`} style={{ background: !d ? 'transparent' : n >= 4 ? '#b5523f' : n >= 2 ? '#d99b7c' : n ? '#efcfb6' : '#f5f0e8' }} />;
              })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
