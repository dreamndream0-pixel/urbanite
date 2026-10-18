'use client';

import { useCallback, useEffect, useState } from 'react';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { api, btn, btnDark, btnSm, card, errMsg, input } from './ui';

type Status = { own: boolean; name: string; basic_id: string; webhook_url: string; owner_bound: boolean };

// 設定:連接名片主人自己的 LINE 官方帳號(通知改由自己的官方帳號發送,和 URBANITE / 平台帳號分開)
export default function LineSettings({ onChanged }: { onChanged: () => void }) {
  const [st, setSt] = useState<Status | null>(null);
  const [form, setForm] = useState({ channel_secret: '', access_token: '' });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<{ text: string; url: string } | null>(null);
  const load = useCallback(async () => {
    try { setSt(await api<Status>('/api/mycard/booking/line')); } catch (e) { void uiAlert(errMsg(e)); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function save() {
    setBusy(true);
    try {
      const r = await api<{ name: string }>('/api/mycard/booking/line', { method: 'PUT', body: JSON.stringify(form) });
      uiToast(`已連接「${r.name}」`);
      setForm({ channel_secret: '', access_token: '' });
      setEditing(false);
      await load();
      onChanged();
    } catch (e) { void uiAlert(errMsg(e)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!(await uiConfirm('移除連線後,預約通知會改回由 URBANLINKS 平台的官方帳號發送,顧客與你的綁定也會清除。確定移除?', { danger: true }))) return;
    try { await api('/api/mycard/booking/line', { method: 'DELETE' }); uiToast('已移除'); await load(); onChanged(); }
    catch (e) { void uiAlert(errMsg(e)); }
  }
  async function bindSelf() {
    try {
      const d = await api<{ text: string; url: string }>('/api/mycard/booking/line', { method: 'POST' });
      setCode(d);
      window.location.href = d.url;
    } catch (e) { void uiAlert(errMsg(e)); }
  }
  async function unbindSelf() {
    if (!(await uiConfirm('解除後,新預約通知不會再從官方帳號發給你。確定解除?', { danger: true }))) return;
    try { await api('/api/mycard/booking/line', { method: 'POST', body: JSON.stringify({ action: 'unlink' }) }); uiToast('已解除綁定'); setCode(null); await load(); }
    catch (e) { void uiAlert(errMsg(e)); }
  }
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); uiToast('已複製'); };

  if (!st) return <section className={card}><p className="text-sm text-[#8a7f72]">讀取中…</p></section>;
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#06C755] text-xs font-bold text-white">LINE</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">我的 LINE 官方帳號</p>
          <p className="text-xs leading-5 text-[#8a7f72]">{st.own ? '預約確認、提醒、付款與取消通知,都會從你的官方帳號發送。' : '連接後,顧客的預約通知會從你自己的官方帳號發送;沒有連接時使用 URBANLINKS 平台的官方帳號。'}</p>
        </div>
      </div>

      {st.own && !editing ? (
        <>
          <div className="rounded-xl bg-[#eef8f1] p-3 text-sm">
            <p className="font-semibold text-[#1f5a35]">✓ 已連接「{st.name}」</p>
            <p className="text-xs text-[#4c6b55]">LINE ID {st.basic_id}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-[#8a7f72]">Webhook 網址(貼到 LINE Developers → Messaging API → Webhook URL,並開啟 Use webhook)</p>
            <div className="flex min-w-0 items-center gap-2 rounded-xl bg-[#faf7f2] p-2 pl-3">
              <span className="min-w-0 flex-1 truncate text-xs text-[#6b6156]">{st.webhook_url}</span>
              <button type="button" onClick={() => copy(st.webhook_url)} className={btnSm}>複製</button>
            </div>
          </div>
          <div className="rounded-xl border border-[#e5ded4] p-3">
            <p className="text-sm font-semibold">我自己接收新預約通知</p>
            {st.owner_bound
              ? <div className="mt-1 flex items-center gap-2"><p className="min-w-0 flex-1 text-xs text-[#2f6b3f]">✓ 已綁定,新預約、付款回報、取消會從「{st.name}」通知你</p><button type="button" onClick={() => void unbindSelf()} className={`${btnSm} shrink-0 text-[#a03b3b]`}>解除綁定</button></div>
              : <>
                  <p className="mt-1 text-xs text-[#8a7f72]">按下後開啟 LINE 並帶入綁定碼,在你的官方帳號聊天室按傳送即可(要先把自己的官方帳號加為好友)。</p>
                  <button type="button" onClick={() => void bindSelf()} className="mt-2 w-full rounded-full bg-[#06C755] py-2.5 text-sm font-semibold text-white">用 LINE 綁定我自己</button>
                  {code ? <p className="mt-2 text-xs text-[#4c6b55]">沒有自動開啟?在官方帳號傳送:<span className="font-semibold tracking-wider text-[#1f1b19]">{code.text}</span>(30 分鐘內有效),完成後重新整理此頁。</p> : null}
                </>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className={btn}>更換金鑰</button>
            <button type="button" onClick={() => void remove()} className={`${btn} text-[#a03b3b]`}>移除連線</button>
          </div>
        </>
      ) : (
        <div className="space-y-2.5 rounded-xl bg-[#faf7f2] p-3">
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-[#6b6156]">
            <li>到 <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="text-[#1f6f8b] underline">LINE Developers</a>,選你的官方帳號的 Messaging API channel(沒有的話先到 LINE Official Account Manager 啟用 Messaging API)。</li>
            <li>Basic settings 複製 <b>Channel secret</b>;Messaging API 分頁最下方發行並複製 <b>Channel access token(長期)</b>。</li>
            <li>貼到下面儲存,系統會自動驗證。</li>
            <li>儲存後把畫面上的 Webhook 網址貼回 LINE Developers,開啟 Use webhook;官方帳號後台的「自動回應訊息」建議關閉。</li>
          </ol>
          <label className="block text-xs text-[#8a7f72]">Channel secret
            <input value={form.channel_secret} onChange={(e) => setForm({ ...form, channel_secret: e.target.value.trim() })} autoComplete="off" spellCheck={false} placeholder="32 碼英數字" className={`${input} mt-1 font-mono`} />
          </label>
          <label className="block text-xs text-[#8a7f72]">Channel access token(長期)
            <textarea value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value.trim() })} autoComplete="off" spellCheck={false} rows={3} className={`${input} mt-1 font-mono text-xs`} />
          </label>
          <p className="text-[11px] text-[#a99e8f]">金鑰會加密保存,之後不會再顯示。</p>
          <div className="flex justify-end gap-2">
            {st.own ? <button type="button" onClick={() => setEditing(false)} className={btn}>取消</button> : null}
            <button type="button" disabled={busy || !form.channel_secret || !form.access_token} onClick={() => void save()} className={btnDark}>{busy ? '驗證中…' : '連接官方帳號'}</button>
          </div>
        </div>
      )}
    </section>
  );
}
