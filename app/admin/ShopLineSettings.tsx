'use client';

import { useEffect, useState } from 'react';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

type Status = { configured: boolean; valid: boolean; botName: string; basicId: string; webhookUrl: string };

// 店家後台 系統設定 → 服務設定:店家自己的 LINE 官方帳號(和 URBANITE 主站分開)
export default function ShopLineSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  // 和主站「串接設定」共用密碼,解鎖 30 分鐘
  const [locked, setLocked] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');

  async function load() {
    const res = await fetch('/api/admin/shop-line', { cache: 'no-store' });
    if (res.status === 423) { setLocked(true); return; }
    setLocked(false);
    setStatus(res.ok ? await res.json() : null);
  }
  useEffect(() => {
    fetch('/api/admin/shop-line', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 423) return setLocked(true);
        setLocked(false);
        setStatus(res.ok ? await res.json() : null);
      })
      .catch(() => setLocked(true));
  }, []);

  async function unlock() {
    if (!password || busy) return;
    setBusy(true); setUnlockError('');
    try {
      const res = await fetch('/api/admin/shop-line/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '密碼錯誤');
      setPassword('');
      await load();
    } catch (error) { setUnlockError(error instanceof Error ? error.message : '密碼錯誤'); }
    finally { setBusy(false); }
  }

  async function lock() {
    await fetch('/api/admin/shop-line/unlock', { method: 'DELETE' }).catch(() => {});
    setStatus(null); setLocked(true);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/shop-line', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelSecret: secret, accessToken: token }) });
      const data = await res.json();
      if (res.status === 423) { setLocked(true); throw new Error('已逾時自動上鎖,請重新輸入密碼'); }
      if (!res.ok) throw new Error(data.error ?? '儲存失敗');
      setStatus(data); setSecret(''); setToken('');
      void uiAlert(`已連接 LINE 官方帳號「${data.botName || '已驗證'}」。別忘了把 Webhook 網址貼到 LINE Developers。`);
    } catch (error) { void uiAlert(error instanceof Error ? error.message : '儲存失敗'); }
    finally { setBusy(false); }
  }

  async function clear() {
    if (!(await uiConfirm('解除 LINE 官方帳號連接?解除後不會再用 LINE 通知顧客,顧客也無法在 LINE 查詢訂單。'))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/shop-line', { method: 'DELETE' });
      if (res.ok) setStatus(await res.json());
    } finally { setBusy(false); }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); void uiAlert('已複製 Webhook 網址'); } catch { void uiAlert('無法複製,請長按網址手動複製'); }
  }

  if (locked === null) return <p className="py-10 text-center text-sm text-[#8a7f72]">載入中…</p>;
  if (locked) {
    return (
      <form className="mx-auto max-w-sm space-y-3 py-8 text-center" onSubmit={(e) => { e.preventDefault(); void unlock(); }}>
        <p className="text-sm font-semibold text-[#6b6156]">服務設定需要密碼才能開啟</p>
        <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="請輸入服務設定密碼" className="w-full rounded-lg border border-[#e5ded4] bg-white px-4 py-2.5 text-center tracking-[0.3em]" />
        {unlockError && <p className="text-sm text-[#c0392b]">{unlockError}</p>}
        <button type="submit" disabled={!password || busy} className="w-full rounded-full bg-[#1f1b19] py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? '驗證中…' : '解鎖'}</button>
      </form>
    );
  }
  if (!status) return <p className="py-10 text-center text-sm text-[#8a7f72]">讀取失敗,請重新整理</p>;

  const input = 'mt-1 w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 font-mono text-sm';
  return (
    <div className="space-y-5 rounded-xl border border-[#e5ded4] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">LINE 官方帳號</h2>
          <p className="mt-1 text-sm text-[#8a7f72]">連接你自己的 LINE 官方帳號:顧客綁定會員後,訂單成立、出貨會用 LINE 通知,也能在 LINE 輸入「訂單查詢」。</p>
        </div>
        {status.configured ? (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.valid ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#fdecec] text-[#c0392b]'}`}>
            {status.valid ? `已連接:${status.botName}${status.basicId ? `(${status.basicId})` : ''}` : '金鑰失效,請重新設定'}
          </span>
        ) : <span className="rounded-full bg-[#f6f2ec] px-3 py-1 text-xs font-semibold text-[#a99e8f]">尚未連接</span>}
        <button type="button" onClick={() => void lock()} className="rounded-full border border-[#d9b98a] px-3 py-1 text-xs font-semibold text-[#9a5b13]">上鎖</button>
      </div>

      <ol className="list-decimal space-y-1.5 rounded-lg bg-[#faf7f2] py-3 pl-8 pr-4 text-sm leading-6 text-[#6b6156]">
        <li>到 <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer" className="underline">LINE Developers</a>,選你的官方帳號的 <b>Messaging API</b> channel。</li>
        <li>Basic settings 頁複製 <b>Channel secret</b>;Messaging API 頁最下方發行並複製 <b>Channel access token (long-lived)</b>,貼到下面儲存。</li>
        <li>在 Messaging API 頁的 <b>Webhook URL</b> 貼上下方網址,按 Verify,並打開 <b>Use webhook</b>。</li>
        <li>到 LINE Official Account Manager → 回應設定,把「自動回應訊息」關閉(避免和系統回覆重複)。</li>
      </ol>

      <div>
        <p className="text-sm font-semibold text-[#6b6156]">Webhook 網址</p>
        <div className="mt-1 flex gap-2">
          <input readOnly value={status.webhookUrl} className={input} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" onClick={() => void copy(status.webhookUrl)} className="mt-1 shrink-0 rounded-lg border border-[#d7c9bd] px-3 text-sm">複製</button>
        </div>
      </div>

      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label className="block text-sm text-[#6b6156]">Channel secret
          <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={status.configured ? '已設定(要更換再填)' : '32 碼英數字'} className={input} />
        </label>
        <label className="block text-sm text-[#6b6156]">Channel access token
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={status.configured ? '已設定(要更換再填)' : '長串英數字'} className={input} />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={busy || !secret.trim() || !token.trim()} className="rounded-full bg-[#1f1b19] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? '驗證中…' : '驗證並儲存'}</button>
          {status.configured ? <button type="button" disabled={busy} onClick={() => void clear()} className="rounded-full border border-[#e0b4b4] px-4 py-2 text-sm font-semibold text-[#c0392b]">解除串接</button> : null}
          <span className="text-xs text-[#a99e8f]">金鑰加密保存,儲存後不會再顯示。</span>
        </div>
      </form>
    </div>
  );
}
