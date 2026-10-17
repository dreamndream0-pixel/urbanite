'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { uiAlert, uiConfirm, uiPrompt } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import {
  addDays, formatDateLabel, formatDateTime, formatRange, localParts, minutesToHHMM, money, PAY_METHOD_LABEL, PAYMENT_LABEL,
  statusText, STATUS_COLOR, type BkBooking,
} from '@/lib/booking/shared';
import { api, btn, btnDark, btnSm, card, errMsg, input, isTeam, stylists, type Data } from './ui';
import { HoursTab, ServicesTab, SettingsTab, StaffTab } from './BookingSetup';
import QuotesTab from './QuotesTab';
import CustomersTab from './CustomersTab';

type Tab = 'bookings' | 'calendar' | 'quotes' | 'customers' | 'services' | 'staff' | 'hours' | 'settings';
const OPEN = ['pending', 'confirmed', 'checked_in'];

// 名片主人:線上預約管理
export default function BookingManager() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('bookings');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api<Data>('/api/mycard/booking')); setLoadError(''); }
    catch (e) { setLoadError(errMsg(e, '讀取失敗')); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (!data) return <p className="py-16 text-center text-sm text-[#8a7f72]">{loadError || '讀取中…'}</p>;
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
    ['customers', '顧客'], ['services', '服務'], ['staff', '人員床位'], ['hours', '營業時段'], ['settings', '設定'],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-24 pt-5 sm:px-6">
      {/* 狀態 */}
      <section className={card}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-[#a99e8f]">URBANLINKS × LINE</p>
            <h1 className="mt-0.5 text-xl font-bold">線上預約</h1>
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
          {data.line_bound ? <span className="text-[#2f6b3f]">✓ 新預約會用 LINE 通知你</span> : (
            <>
              <span className="text-[#8a7f72]">綁定 LINE,才能收到新預約通知</span>
              <a href={`/auth/line/start?mode=link&next=${encodeURIComponent('/mycard/booking')}`} className="rounded-full bg-[#06C755] px-3 py-1.5 font-semibold text-white">綁定 LINE</a>
            </>
          )}
        </div>
      </section>

      <div className={`grid gap-1 rounded-2xl border border-[#e5ded4] bg-white p-1 ${tabs.length > 7 ? 'grid-cols-4 sm:grid-cols-8' : 'grid-cols-4 sm:grid-cols-7'}`}>
        {tabs.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-xl px-1 py-2 text-sm ${tab === k ? 'bg-[#1f1b19] font-semibold text-white' : 'text-[#6b6156]'}`}>{label}</button>
        ))}
      </div>

      {tab === 'bookings' && <BookingsTab data={data} reload={load} />}
      {tab === 'calendar' && <CalendarTab data={data} reload={load} />}
      {tab === 'quotes' && <QuotesTab data={data} reload={load} />}
      {tab === 'customers' && <CustomersTab data={data} />}
      {tab === 'services' && <ServicesTab data={data} reload={load} />}
      {tab === 'staff' && <StaffTab data={data} reload={load} />}
      {tab === 'hours' && <HoursTab data={data} reload={load} />}
      {tab === 'settings' && <SettingsTab data={data} reload={load} />}
    </div>
  );
}

// ---------- 預約清單 ----------
function BookingsTab({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [filter, setFilter] = useState<'pending' | 'upcoming' | 'past' | 'all' | 'waitlist'>(() => (data.bookings.some((b) => b.status === 'pending') ? 'pending' : 'upcoming'));
  const [adding, setAdding] = useState(false);
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
            <button key={k} type="button" onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${filter === k ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] bg-white text-[#6b6156]'}`}>{label}</button>
          ))}
        </div>
        <button type="button" onClick={() => setAdding(true)} className={`${btnDark} shrink-0 px-3`}>+ 加單</button>
      </div>
      {adding ? <NewBooking data={data} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void reload(); }} /> : null}
      {filter === 'waitlist' ? <WaitlistList data={data} reload={reload} /> : !list.length ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-[#a99e8f]">沒有預約</p> : list.map((b) => {
        const d = localParts(b.start_at).date;
        const header = d !== lastDate ? (lastDate = d) : '';
        return (
          <div key={b.id}>
            {header ? <p className="mb-1.5 mt-2 text-xs font-semibold text-[#8a7f72]">{formatDateTime(b.start_at).split(' ')[0]}</p> : null}
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
function BookingCard({ booking: b, data, reload }: { booking: BkBooking; data: Data; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
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

  return (
    <div className={card}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{formatRange(b.start_at, b.end_at).split(' ')[1]}{team && staff ? <span className="ml-2 text-sm font-normal text-[#6b6156]">· {staff.name}</span> : null}</p>
          <p className="text-sm">{b.service_snapshot.name}{b.addons?.length ? ` + ${b.addons.map((a) => a.name).join('、')}` : ''}</p>
          {resource ? <p className="text-xs text-[#8a7f72]">{resource.name}</p> : null}
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
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[b.status]}`}>{statusText(b)}</span>
      </div>
      <div className="mt-2 space-y-0.5 text-sm text-[#6b6156]">
        <p>{b.contact?.name || '—'}{b.contact?.phone ? <> · <a href={`tel:${b.contact.phone}`} className="text-[#1f6f8b] underline-offset-2 hover:underline">{b.contact.phone}</a></> : null}{b.created_by === 'owner' ? <span className="ml-1 text-[11px] text-[#a99e8f]">(人工加單)</span> : null}</p>
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
        {b.payment_status === 'reported' ? <p className="text-xs text-[#1f6f8b]">顧客回報已轉帳,末 5 碼 {b.payment_report?.last5 ?? '—'},請核對後按「收到訂金」</p> : null}
        {b.status === 'pending' && b.expires_at ? <p className="text-xs text-[#9a6412]">{b.approval_status === 'pending' ? '請在' : '訂金期限'} {formatDateTime(b.expires_at)}{b.approval_status === 'pending' ? ' 前確認' : ''},逾時自動取消</p> : null}
        {b.cancel_reason && ['cancelled', 'expired'].includes(b.status) ? <p className="text-xs text-[#8a7f72]">原因:{b.cancel_reason}</p> : null}
        {payments.length ? (
          <ul className="text-[11px] text-[#a99e8f]">
            {payments.map((p) => <li key={p.id}>{formatDateTime(p.created_at)} {p.kind === 'refund' ? '退款' : p.kind === 'deposit' ? '訂金' : '尾款'} {money(p.amount)}({PAY_METHOD_LABEL[p.method]}){p.note ? ` ${p.note}` : ''}</li>)}
          </ul>
        ) : null}
        <p className="text-[11px] text-[#a99e8f]">{b.booking_no}{b.reschedule_count ? ` · 已改期 ${b.reschedule_count} 次` : ''}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {b.quote_id && b.status === 'pending' && b.approval_status === 'pending' ? <p className="w-full text-xs text-[#1f5f7f]">報價暫保留中,等顧客接受(到「詢價」修改或取消)</p> : null}
        {b.status === 'pending' && b.approval_status === 'pending' && !b.quote_id && <>
          <button type="button" disabled={busy} onClick={() => void run('approve', '確認')} className={btnDark}>確認預約</button>
          <button type="button" disabled={busy} onClick={() => void run('reject', '婉拒')} className={btn}>婉拒</button>
        </>}
        {waitingPay && <button type="button" disabled={busy} onClick={() => void post({ command: 'payment', kind: 'deposit', amount: b.deposit_amount - b.paid_amount, method: 'transfer', note: b.payment_report?.last5 ? `末 5 碼 ${b.payment_report.last5}` : '' }, '已記錄訂金,預約成立')} className={btnDark}>收到訂金 {money(b.deposit_amount - b.paid_amount)}</button>}
        {b.status === 'confirmed' && soon && !started && <button type="button" disabled={busy} onClick={() => void run('check_in', '報到')} className={btnDark}>報到</button>}
        {['confirmed', 'checked_in'].includes(b.status) && (started || b.status === 'checked_in') && <>
          <button type="button" disabled={busy} onClick={() => (total > b.paid_amount ? setPanel(panel === 'complete' ? '' : 'complete') : void run('complete', '完成'))} className={btnDark}>完成服務</button>
          <button type="button" disabled={busy} onClick={() => void run('no_show', '標記未到')} className={btn}>未到</button>
        </>}
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
        <button type="button" disabled={busy || !(Number(amount) > 0)} onClick={() => onSubmit({ kind, amount: Number(amount), method, note })} className={`${btnSm} border-[#1f1b19] bg-[#1f1b19] text-white`}>{allowSkip ? `收 ${money(Number(amount) || 0)} 並完成` : '記錄'}</button>
      </div>
    </div>
  );
}

// 店家選時段(改期 / 加單共用):日期 + 人員 → 可選時間(不受最短提前限制)
function useOwnerSlots(params: { date: string; service: string; addons: string[]; staff: string; booking?: string; extra?: string[] }) {
  const [slots, setSlots] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const key = `${params.date}|${params.service}|${params.addons.join(',')}|${params.staff}|${params.booking ?? ''}|${(params.extra ?? []).join(',')}`;
  useEffect(() => {
    if (!params.date || (!params.service && !params.booking)) return;
    let alive = true;
    Promise.resolve().then(async () => {
      setSlots(null);
      setError('');
      try {
        const q = new URLSearchParams({ date: params.date, service: params.service, addons: params.addons.join(','), staff: params.staff, booking: params.booking ?? '', extra: (params.extra ?? []).join(',') });
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
        <input type="date" value={date} min={localParts(new Date()).date} onChange={(e) => { setDate(e.target.value); setTime(''); }} aria-label="日期" className={`${input} min-w-0`} />
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
        <button type="button" disabled={busy || !time} onClick={() => onSubmit(new Date(`${date}T${time}:00+08:00`).toISOString(), staff || null)} className={`${btnSm} border-[#1f1b19] bg-[#1f1b19] text-white`}>{time ? `改到 ${formatDateLabel(date).md} ${time}` : '確認改期'}</button>
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
  const { slots, error } = useOwnerSlots({ date, service: serviceId, addons: addonIds, staff, extra: extraIds });

  async function save() {
    if (!contact.name.trim()) return void uiAlert('請填寫顧客姓名');
    setBusy(true);
    try {
      await api('/api/mycard/booking/bookings', {
        method: 'POST',
        body: JSON.stringify({ service_id: serviceId, addon_ids: addonIds, extra_ids: extraIds, customer_id: customerId || null, staff_id: staff || null, start_at: new Date(`${date}T${time}:00+08:00`).toISOString(), contact }),
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
        <input type="date" value={date} min={data.today} onChange={(e) => { setDate(e.target.value); setTime(''); }} aria-label="日期" className={`${input} min-w-0`} />
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


// ---------- 日曆(日視圖;人員視圖每位人員一欄、座位視圖每個座位一欄;分段預約畫出每一段與等待空檔) ----------
const HOUR_PX = 72;
type Block = { key: string; booking: BkBooking; start: number; end: number; kind: 'main' | 'assistant' | 'seat' | 'wait' };

function CalendarTab({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [date, setDate] = useState(data.today);
  const [selected, setSelected] = useState('');
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'staff' | 'seat'>('staff');
  const { weekday } = formatDateLabel(date);
  const day = data.bookings.filter((b) => localParts(b.start_at).date === date && b.status !== 'expired');
  const shown = day.filter((b) => b.status !== 'cancelled');
  const team = isTeam(data);
  const seatView = view === 'seat' && data.resources.length > 0;
  const columns = seatView
    ? data.resources.filter((r) => r.active || shown.some((b) => b.resource_id === r.id)).map((r) => ({ id: r.id, name: r.name }))
    : team
      ? data.staff.filter((s) => s.active || shown.some((b) => b.staff_id === s.id)).map((s) => ({ id: s.id, name: s.name }))
      : [{ id: '', name: '' }];
  const toMin = (iso: string) => localParts(iso).minutes + (localParts(iso).date > date ? 1440 : 0);

  // 每欄的區塊:有占用區段的用區段(含助理段);已完成等沒有有效區段的用整筆時間
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
      // 主要人員兩段之間的等待:這段時間可以接其他客人
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
  const wd = localParts(new Date(`${date}T12:00:00+08:00`)).weekday;
  const ranges = [...data.hours.filter((h) => h.weekday === wd), ...data.staffHours.filter((h) => h.weekday === wd)];
  const mins = shown.map((b) => toMin(b.start_at));
  const ends = shown.map((b) => toMin(b.occupy_end_at));
  const startH = Math.floor(Math.min(10 * 60, ...ranges.map((r) => r.start_min), ...mins) / 60);
  const endH = Math.min(26, Math.ceil(Math.max(19 * 60, ...ranges.map((r) => r.end_min), ...ends) / 60));
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const sel = data.bookings.find((b) => b.id === selected);
  const closedAll = data.exceptions.filter((x) => !x.staff_id && new Date(x.start_at) < new Date(`${date}T23:59:59+08:00`) && new Date(x.end_at) > new Date(`${date}T00:00:00+08:00`));
  const wide = columns.length > 1;

  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        <button type="button" onClick={() => { setDate(addDays(date, -1)); setSelected(''); }} aria-label="前一天" className={btnSm}>‹</button>
        <input type="date" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setSelected(''); } }} aria-label="日期" className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] px-2 py-1.5 text-base" />
        <button type="button" onClick={() => { setDate(addDays(date, 1)); setSelected(''); }} aria-label="後一天" className={btnSm}>›</button>
        <button type="button" onClick={() => { setDate(data.today); setSelected(''); }} className={btnSm}>今天</button>
        <div className="flex w-full flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-[#8a7f72]">週{weekday} · {shown.length} 筆預約{closedAll.length ? ' · 有休假設定' : ''}{day.length > shown.length ? ` · 已取消 ${day.length - shown.length} 筆` : ''}</p>
          {data.resources.length ? (
            <div className="flex shrink-0 gap-1 rounded-full bg-[#f3ede4] p-1" role="group" aria-label="日曆視圖">
              {([['staff', '人員'], ['seat', '座位']] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`rounded-full px-3 py-1 text-xs ${view === k ? 'bg-white font-semibold text-[#1f1b19]' : 'text-[#6b6156]'}`}>{label}</button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`${card} overflow-hidden p-0 sm:p-0`}>
        <div className="overflow-x-auto">
          <div className="flex" style={{ minWidth: wide ? `${44 + columns.length * 110}px` : undefined }}>
            <div className="w-11 shrink-0 border-r border-[#f0ebe2]">
              {wide ? <div className="h-8 border-b border-[#f0ebe2]" /> : null}
              {hours.map((h) => <div key={h} style={{ height: HOUR_PX }} className="pr-1 pt-0.5 text-right text-[10px] text-[#a99e8f]">{String(h % 24).padStart(2, '0')}:00</div>)}
            </div>
            {columns.map((col) => (
              <div key={col.id || 'solo'} className="min-w-0 flex-1 border-r border-[#f0ebe2] last:border-r-0">
                {wide ? <div className="flex h-8 items-center justify-center truncate border-b border-[#f0ebe2] px-1 text-xs font-semibold">{col.name}</div> : null}
                <div className="relative" style={{ height: hours.length * HOUR_PX }}>
                  {hours.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-[#f5f1ea]" style={{ top: i * HOUR_PX }} />)}
                  {blocksFor(col.id).sort((x, y) => (x.kind === 'wait' ? -1 : 0) - (y.kind === 'wait' ? -1 : 0)).map((blk) => {
                    const b = blk.booking;
                    const top = ((blk.start - startH * 60) / 60) * HOUR_PX;
                    const height = Math.max(blk.kind === 'wait' ? 14 : 22, ((blk.end - blk.start) / 60) * HOUR_PX - 2);
                    const tone = blk.kind === 'wait'
                      ? 'border-transparent bg-[#e3efe5] text-[#2f5a3a]'
                      : blk.kind === 'assistant'
                        ? 'border-[#bcd3e3] bg-[#e6f0f7]'
                        : b.status === 'pending' ? 'border-[#e7c98f] bg-[#fff6e6]' : b.status === 'completed' ? 'border-[#d5d9e3] bg-[#f1f3f7]' : b.status === 'no_show' ? 'border-[#e8c4c4] bg-[#fbeeee]' : 'border-[#b9d8c1] bg-[#eef7f0]';
                    return (
                      <button key={blk.key} type="button" onClick={() => setSelected(b.id === selected ? '' : b.id)} style={{ top, height }}
                        className={`absolute inset-x-1 overflow-hidden rounded-lg border px-1.5 ${height < 40 ? 'py-px' : 'py-1'} text-left text-[11px]! leading-4! ${tone} ${b.id === selected ? 'ring-2 ring-[#1f1b19]' : ''}`}>
                        {blk.kind === 'wait' ? (
                          <span className="block truncate">等待 · 可接其他客人</span>
                        ) : height < 40 ? (
                          <span className="block truncate font-semibold">{minutesToHHMM(blk.start % 1440)} {b.contact?.name || '—'}<span className="font-normal text-[#6b6156]"> · {blk.kind === 'assistant' ? '助理' : b.service_snapshot.name}</span></span>
                        ) : (
                          <>
                            <span className="block truncate font-semibold">{minutesToHHMM(blk.start % 1440)} {b.contact?.name || '—'}</span>
                            <span className="block truncate text-[#6b6156]">{blk.kind === 'assistant' ? '助理 · ' : ''}{b.service_snapshot.name}</span>
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

      <div className="flex justify-end">
        <button type="button" onClick={() => setAdding(true)} className={btnDark}>+ 在這天加單</button>
      </div>
      {adding ? <NewBooking key={date} data={data} initialDate={date} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void reload(); }} /> : null}
      {sel ? <BookingCard key={`${sel.id}-${sel.version}`} booking={sel} data={data} reload={reload} /> : <p className="text-center text-xs text-[#a99e8f]">點日曆上的預約查看詳細與操作</p>}
    </div>
  );
}
