'use client';

import { useCallback, useEffect, useState } from 'react';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { formatDateTime } from '@/lib/booking/shared';
import { api, btnSm, card, errMsg, input, type Data } from './ui';

type Sync = {
  business_token: string | null;
  staff: { id: string; name: string; calendar_token: string | null; active: boolean }[];
  calendars: { id: string; staff_id: string | null; label: string; url: string; last_synced_at: string | null; last_error: string; event_count: number }[];
};

// ---------- 行事曆同步(匯出訂閱 + 匯入忙碌時段) ----------
export default function CalendarSync({ data }: { data: Data }) {
  const [s, setS] = useState<Sync | null>(null);
  const [draft, setDraft] = useState({ url: '', staff_id: '', label: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setS(await api<Sync>('/api/mycard/booking/calendar')); } catch (e) { void uiAlert(errMsg(e)); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const feed = (token: string) => `${origin}/api/booking/feed/${token}`;

  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    try { const r = await api<{ events?: number; synced?: number }>('/api/mycard/booking/calendar', { method: 'POST', body: JSON.stringify(body) }); uiToast(ok.replace('{n}', String(r.events ?? r.synced ?? ''))); void load(); return true; }
    catch (e) { void uiAlert(errMsg(e)); return false; }
    finally { setBusy(false); }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); uiToast('已複製訂閱網址'); } catch { void uiAlert(text); }
  }
  if (!s) return null;
  const team = data.staff.length > 1;
  const row = (label: string, token: string | null, staffId: string | null) => (
    <div key={staffId ?? 'all'} className="space-y-1.5 rounded-xl bg-[#faf7f2] p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
        {token ? <button type="button" disabled={busy} onClick={() => void (async () => { if (await uiConfirm('重設後舊的訂閱網址會失效,需要在行事曆重新訂閱。')) await post({ action: 'rotate', staff_id: staffId }, '已重設網址'); })()} className="shrink-0 text-xs text-[#a03b3b]">重設</button> : null}
      </div>
      {token ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-xs text-[#6b6156]">{feed(token)}</span>
          <button type="button" onClick={() => void copy(feed(token))} className={btnSm}>複製</button>
        </div>
      ) : <button type="button" disabled={busy} onClick={() => void post({ action: 'rotate', staff_id: staffId }, '已產生訂閱網址')} className={btnSm}>產生訂閱網址</button>}
    </div>
  );
  return (
    <section className={`${card} space-y-3`}>
      <div>
        <p className="font-semibold">行事曆同步</p>
        <p className="text-xs leading-5 text-[#8a7f72]">把預約放進 Google / Apple 行事曆:複製訂閱網址,在 Google 行事曆選「其他行事曆 → 透過網址新增」(Apple:檔案 → 新增行事曆訂閱)。這是單向訂閱,約 15 分鐘到數小時更新一次,依各行事曆而定;只顯示服務與顧客姓名,不含電話與備註。網址請勿外流。</p>
      </div>
      {row(team ? '全店預約' : '我的預約', s.business_token, null)}
      {team ? s.staff.filter((x) => x.active).map((x) => row(x.name, x.calendar_token, x.id)) : null}

      <div className="pt-1">
        <p className="text-sm font-semibold">匯入外部行事曆的忙碌時段</p>
        <p className="text-xs leading-5 text-[#8a7f72]">在 Google 行事曆的「設定 → 整合行事曆 → iCal 格式的私密網址」複製網址貼到這裡(也支援 iCloud、Outlook)。每 15 分鐘讀取一次,那些時間不會開放預約;標示「空閒」的活動不會擋。</p>
      </div>
      {s.calendars.map((c) => (
        <div key={c.id} className="flex items-start gap-2 rounded-xl bg-[#faf7f2] p-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{c.label || c.url}{c.staff_id ? ` · ${data.staff.find((x) => x.id === c.staff_id)?.name ?? ''}` : team ? ' · 全店' : ''}</p>
            <p className={`text-xs ${c.last_error ? 'text-[#a03b3b]' : 'text-[#8a7f72]'}`}>{c.last_error ? `讀取失敗:${c.last_error}` : c.last_synced_at ? `${formatDateTime(c.last_synced_at)} 更新 · ${c.event_count} 個忙碌時段` : '尚未讀取'}</p>
          </div>
          <button type="button" disabled={busy} onClick={() => void post({ action: 'sync', id: c.id }, '已更新,{n} 個忙碌時段')} className={btnSm}>更新</button>
          <button type="button" disabled={busy} onClick={() => void (async () => { if (await uiConfirm('移除這個外部行事曆?它的忙碌時段會一起移除。', { danger: true })) await post({ action: 'remove', id: c.id }, '已移除'); })()} className="shrink-0 pt-1 text-xs text-[#a03b3b]">移除</button>
        </div>
      ))}
      <div className="space-y-2">
        <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" aria-label="iCal 網址" className={input} />
        <div className="grid grid-cols-2 gap-2">
          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} maxLength={30} placeholder="名稱(選填)" aria-label="名稱" className={`${input} min-w-0`} />
          {team ? (
            <select value={draft.staff_id} onChange={(e) => setDraft({ ...draft, staff_id: e.target.value })} aria-label="套用人員" className={`${input} min-w-0`}>
              <option value="">全店</option>
              {data.staff.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          ) : <span />}
        </div>
        <div className="flex justify-end">
          <button type="button" disabled={busy || !draft.url.trim()} onClick={() => void (async () => { if (await post({ action: 'add', ...draft, staff_id: draft.staff_id || null }, '已連結,讀到 {n} 個忙碌時段')) setDraft({ url: '', staff_id: '', label: '' }); })()} className={`${btnSm} border-[#1f1b19] bg-[#1f1b19] text-white`}>連結行事曆</button>
        </div>
      </div>
    </section>
  );
}
