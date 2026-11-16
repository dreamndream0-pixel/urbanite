'use client';

import { useState } from 'react';

// POS 登入頁:員工編號 + 密碼(後台「POS・分店調貨」→「POS 員工」建立)
export default function PosLogin({ shopName }: { shopName: string }) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/pos/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, password }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? '登入失敗,請再試一次'); setPassword(''); return; }
      window.location.href = '/pos';
    } catch { setError('連線失敗,請再試一次'); } finally { setBusy(false); }
  }

  const field = 'w-full rounded-xl border border-[#e5ded4] bg-white px-4 py-3 text-lg! text-[#1f1b19] outline-none focus:border-[#1f1b19]/50';
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f6f2ec] p-5 text-[#1f1b19]">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-[#e5ded4] bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.25em] text-[#8a7f72]">{shopName || 'POS'}</p>
        <h1 className="mt-1 text-2xl font-bold">POS 員工登入</h1>
        <label className="mt-5 block">
          <span className="mb-1 block text-sm font-semibold text-[#6b6156]">員工編號</span>
          <input className={field} value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="username" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={20} />
        </label>
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-semibold text-[#6b6156]">密碼</span>
          <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={64} />
        </label>
        {error ? <p className="mt-3 rounded-lg bg-[#fbeef1] px-3 py-2 text-sm text-[#a13552]">{error}</p> : null}
        <button type="submit" disabled={busy || !code.trim() || !password} className="mt-5 w-full rounded-xl bg-[#1f1b19] py-3.5 text-base! font-semibold! text-white disabled:opacity-40">{busy ? '登入中…' : '登入'}</button>
        <p className="mt-4 text-center text-xs text-[#8a7f72]">忘記密碼請找店長重設。<a href="/login?next=/pos" className="ml-1 underline">管理員登入</a></p>
      </form>
    </main>
  );
}
