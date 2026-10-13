'use client';

import { useEffect, useState } from 'react';
import { Bell, Save, RefreshCw } from 'lucide-react';
import { ORDER_NOTICE_EVENTS, resolveOrderNotificationSettings, type OrderNotificationSettings, type NoticeAudience, type NoticeChannel } from '@/lib/order-notification-settings';

type Recent = { id: string; event: string; audience: string; channel: string; status: string; attempts: number; last_error: string | null; created_at: string };
const labels: Record<string, string> = { pending: '待發送', processing: '發送中', sent: '已送出', skipped: '未發送', failed: '發送失敗' };
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
        setSettings(resolveOrderNotificationSettings(data.settings)); setReady(data.ready); setConfigured(data.configured); setRecent(data.recent);
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
  const columns: { audience: NoticeAudience; channel: NoticeChannel; label: string }[] = [
    { audience: 'buyer', channel: 'email', label: '買家 Email' }, { audience: 'buyer', channel: 'line', label: '買家 LINE' },
    { audience: 'seller', channel: 'email', label: '賣家 Email' }, { audience: 'seller', channel: 'line', label: '賣家 LINE' },
  ];
  return <section className="min-w-0 space-y-5" aria-label="通知設定">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Bell size={20} />通知</h2>
      <div className="flex gap-2"><button type="button" title="重新整理通知設定" aria-label="重新整理通知設定" disabled={loading || busy} onClick={() => { setLoading(true); setMessage(''); setReload(n => n + 1); }} className="rounded-md border p-2 disabled:opacity-40"><RefreshCw size={18} /></button>
        <button type="button" disabled={!ready || loading || busy} onClick={save} className="flex items-center gap-2 rounded-md bg-[#1f1b19] px-4 py-2 text-sm text-white disabled:opacity-40"><Save size={16} />{busy ? '儲存中…' : '儲存設定'}</button></div>
    </div>
    {loading ? <p role="status">載入中…</p> : <>
      {!ready && <p role="alert" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm">資料庫尚未啟用訂單通知與手動貨態功能，暫時無法儲存。</p>}
      {!configured && <p className="text-sm text-[#6b6156]">尚未設定；目前維持既有的下單信件與 LINE 通知。儲存後改用以下規則。</p>}
      <fieldset disabled={!ready || busy} className="space-y-4">
        <legend className="mb-2 font-medium">通知管道</legend>
        <div className="flex flex-wrap gap-6">{(['email', 'line'] as const).map(channel => <label key={channel} className="flex items-center gap-2"><input type="checkbox" checked={settings.enabled[channel]} onChange={e => setSettings(s => ({ ...s, enabled: { ...s.enabled, [channel]: e.target.checked } }))} className="h-5 w-5 accent-emerald-800" />{channel === 'email' ? '信件通知' : 'LINE 通知'}</label>)}</div>
        <div className="divide-y border-y border-[#e5ded4]">
          <div className="hidden grid-cols-[minmax(100px,1fr)_repeat(4,minmax(72px,1fr))] gap-2 bg-[#faf7f2] p-3 text-center text-sm sm:grid"><span className="text-left">訂單事件</span>{columns.map(c => <span key={c.label}>{c.label}</span>)}</div>
          {ORDER_NOTICE_EVENTS.map(event => <div key={event.key} className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-[minmax(100px,1fr)_repeat(4,minmax(72px,1fr))] sm:items-center sm:gap-2 sm:px-3">
            <span className="col-span-2 text-sm font-medium sm:col-span-1">{event.label}</span>
            {columns.map(c => <label key={c.label} className="flex items-center justify-between gap-2 text-sm sm:justify-center"><span className="sm:sr-only">{c.label}</span>
              <input type="checkbox" aria-label={`${event.label} ${c.label}`} disabled={!settings.enabled[c.channel]} checked={settings.rules[event.key][c.audience][c.channel]} onChange={e => setSettings(s => ({ ...s, rules: { ...s.rules, [event.key]: { ...s.rules[event.key], [c.audience]: { ...s.rules[event.key][c.audience], [c.channel]: e.target.checked } } } }))} className="h-5 w-5 accent-emerald-800 disabled:opacity-30" />
            </label>)}
          </div>)}
        </div>
      </fieldset>
      <p className="text-sm text-[#6b6156]">Email 需完成信件串接。LINE 收件人需綁定本商店官方帳號；賣家為店主帳號，主站使用通知信箱對應的會員。通知由排程發送。</p>
      <h3 className="font-medium">最近通知紀錄</h3>
      {recent.length ? <ul className="divide-y text-sm">{recent.map(row => <li key={row.id} className="space-y-1 py-3"><div className="flex flex-wrap justify-between gap-2"><span>{ORDER_NOTICE_EVENTS.find(e => e.key === row.event)?.label ?? row.event} · {row.audience === 'buyer' ? '買家' : '賣家'} · {row.channel === 'email' ? 'Email' : 'LINE'}</span><span>{labels[row.status] ?? row.status}</span></div><p className="text-xs text-[#6b6156]">{new Date(row.created_at).toLocaleString('zh-TW')}{row.last_error ? ` · ${row.last_error}` : ''}</p></li>)}</ul> : <p className="text-sm text-[#6b6156]">尚無通知紀錄</p>}
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
