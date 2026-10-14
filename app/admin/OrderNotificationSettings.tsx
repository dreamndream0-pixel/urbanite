'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, Save, RefreshCw } from 'lucide-react';
import { MEMBER_NOTICE_EVENTS, ORDER_NOTICE_EVENTS, resolveOrderNotificationSettings, type OrderNotificationSettings, type OrderNoticeEvent, type NoticeAudience, type NoticeChannel } from '@/lib/order-notification-settings';

type Recent = { id: string; event: string; audience: string; channel: string; status: string; attempts: number; last_error: string | null; created_at: string };
const labels: Record<string, string> = { pending: '待發送', processing: '發送中', sent: '已送出', skipped: '未發送', failed: '發送失敗' };
const channels: NoticeChannel[] = ['email', 'line'];
const events = ORDER_NOTICE_EVENTS.map(event => event.key);
function SelectionCheckbox({ values, label, disabled, onChange }: { values: boolean[]; label: string; disabled?: boolean; onChange: (checked: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const checked = values.length > 0 && values.every(Boolean);
  const mixed = !checked && values.some(Boolean);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" aria-label={label} disabled={disabled || values.length === 0} checked={checked} onChange={e => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-emerald-800 disabled:opacity-30" />;
}
export default function OrderNotificationSettingsPanel() {
  const [settings, setSettings] = useState<OrderNotificationSettings>(resolveOrderNotificationSettings(null));
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [recent, setRecent] = useState<Recent[]>([]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/admin/notifications', { cache: 'no-store', signal: abort.signal })
      .then(async res => { if (!res.ok) throw new Error('無法讀取通知設定'); return res.json(); })
      .then(data => {
        if (abort.signal.aborted) return;
        const loaded = resolveOrderNotificationSettings(data.settings); setSettings({ ...loaded, enabled: { email: true, line: true } }); setReady(data.ready); setConfigured(data.configured); setRecent(data.recent);
      })
      .catch(e => { if (!abort.signal.aborted) { setMessage(e instanceof Error ? e.message : '連線失敗'); setReady(false); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [reload]);
  async function save() {
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/admin/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '儲存失敗');
      setConfigured(true); setMessage('通知設定已儲存');
    } catch (e) { setMessage(e instanceof Error ? e.message : '連線失敗'); }
    finally { setBusy(false); }
  }
  function select(audience: NoticeAudience, selectedEvents: OrderNoticeEvent[], selectedChannels: NoticeChannel[], checked: boolean) {
    setSettings(current => {
      const next = resolveOrderNotificationSettings(current);
      for (const event of selectedEvents) for (const channel of selectedChannels) {
        if (current.enabled[channel]) next.rules[event][audience][channel] = checked;
      }
      return next;
    });
  }
  return <section className="min-w-0 space-y-5" aria-label="通知設定">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Bell size={20} />通知</h2>
      <div className="flex gap-2"><button type="button" title="重新整理通知設定" aria-label="重新整理通知設定" disabled={loading || busy} onClick={() => { setLoading(true); setMessage(''); setReload(n => n + 1); }} className="rounded-md border p-2 disabled:opacity-40"><RefreshCw size={18} /></button>
        <button type="button" disabled={!ready || loading || busy} onClick={save} className="flex items-center gap-2 rounded-md bg-[#1f1b19] px-4 py-2 text-sm text-white disabled:opacity-40"><Save size={16} />{busy ? '儲存中…' : '儲存設定'}</button></div>
    </div>
    {loading ? <p role="status">載入中…</p> : <>
      {!ready && <p role="alert" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm">資料庫尚未啟用訂單通知與手動貨態功能，暫時無法儲存。</p>}
      {!configured && <p className="text-sm text-[#6b6156]">尚未設定；目前維持既有的下單信件與 LINE 通知。儲存後改用以下規則。</p>}
      <fieldset disabled={!ready || busy} className="space-y-4">
        {(['buyer', 'seller'] as const).map(audience => {
          const name = audience === 'buyer' ? '買家' : '賣家';
          return <section key={audience} aria-label={`${name}通知`} className="min-w-0 border-t border-[#e5ded4] pt-5">
            <h3 className="mb-3 font-semibold">{name}通知</h3>
            <table className="w-full table-fixed text-sm">
              <colgroup><col /><col className="w-16 sm:w-24" /><col className="w-16 sm:w-24" /></colgroup>
              <thead className="bg-[#faf7f2]">
                <tr><th scope="col" className="p-2 text-left font-medium">訂單事件</th>
                  {channels.map(channel => <th key={channel} scope="col" className="py-2 font-medium">
                    <label className="flex flex-col items-center gap-2 py-1">
                      {channel === 'email' ? 'Email' : 'LINE'}
                      <SelectionCheckbox label={`${name} ${channel === 'email' ? 'Email' : 'LINE'} 全選`} disabled={!settings.enabled[channel]} values={events.map(event => settings.rules[event][audience][channel])} onChange={checked => select(audience, events, [channel], checked)} />
                    </label>
                  </th>)}
                </tr>
              </thead>
              <tbody>{ORDER_NOTICE_EVENTS.filter(event => audience === 'buyer' || !MEMBER_NOTICE_EVENTS.includes(event.key)).map(event => <tr key={event.key} className="border-b border-[#e5ded4]">
                <th scope="row" className="break-words px-2 py-4 text-left font-medium">{event.label}</th>
                {channels.map(channel => <td key={channel} className="text-center">
                  <label className="flex min-h-12 items-center justify-center">
                    <SelectionCheckbox label={`${event.label} ${name} ${channel === 'email' ? 'Email' : 'LINE'}`} disabled={!settings.enabled[channel]} values={[settings.rules[event.key][audience][channel]]} onChange={checked => select(audience, [event.key], [channel], checked)} />
                  </label>
                </td>)}
              </tr>)}</tbody>
            </table>
          </section>;
        })}
      </fieldset>
      <p className="text-sm text-[#6b6156]">Email 需完成信件串接。LINE 收件人需綁定本商店官方帳號；賣家為店主帳號，主站使用通知信箱對應的會員。訂單狀態更新後會立即發送。</p>
      <h3 className="font-medium">最近通知紀錄</h3>
      {recent.length ? <ul className="divide-y text-sm">{recent.map(row => <li key={row.id} className="space-y-1 py-3"><div className="flex flex-wrap justify-between gap-2"><span>{ORDER_NOTICE_EVENTS.find(e => e.key === row.event)?.label ?? row.event} · {row.audience === 'buyer' ? '買家' : '賣家'} · {row.channel === 'email' ? 'Email' : 'LINE'}</span><span>{labels[row.status] ?? row.status}</span></div><p className="text-xs text-[#6b6156]">{new Date(row.created_at).toLocaleString('zh-TW')}{row.last_error ? ` · ${row.last_error}` : ''}</p></li>)}</ul> : <p className="text-sm text-[#6b6156]">尚無通知紀錄</p>}
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
