'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, LoaderCircle, Store } from 'lucide-react';

type Tpl = { key: string; name: string; note: string; colors: Record<string, string> };
type Existing = { slug: string; name: string; url: string; adminUrl: string } | null;
type Done = { url: string; adminUrl: string; slug: string };

const card = 'rounded-3xl border border-[#e5ded4] bg-white p-5 sm:p-7';
const input = 'w-full rounded-xl border border-[#e5ded4] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#121b33]';

// 開店精靈:店名 → 網址 → 版型 → 收款帳號 → 完成
export default function ShopWizard({ eligible, promo, existing, rootDomain, templates }: { eligible: boolean; promo: boolean; existing: Existing; rootDomain: string; templates: Tpl[] }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [check, setCheck] = useState<{ state: 'idle' | 'checking' | 'ok' | 'bad'; message: string }>({ state: 'idle', message: '' });
  const [template, setTemplate] = useState(templates[0]?.key ?? 'urbanite');
  const [bank, setBank] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);

  // 網址代稱:輸入後稍等一下再檢查能不能用
  useEffect(() => {
    const s = slug.trim();
    if (!s) return void Promise.resolve().then(() => setCheck({ state: 'idle', message: '' }));
    Promise.resolve().then(() => setCheck({ state: 'checking', message: '' }));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shops?slug=${encodeURIComponent(s)}`, { cache: 'no-store' });
        const d = await res.json();
        setCheck(d.ok ? { state: 'ok', message: '可以使用' } : { state: 'bad', message: d.problem });
      } catch {
        setCheck({ state: 'bad', message: '暫時無法檢查,請稍後再試' });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || check.state !== 'ok' || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/shops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, slug, template, bank }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '開店失敗');
      setDone({ url: d.url, adminUrl: d.adminUrl, slug });
    } catch (err) {
      setError(err instanceof Error ? err.message : '開店失敗');
    } finally {
      setBusy(false);
    }
  }

  if (existing) {
    return (
      <div className={`${card} text-center`}>
        <Store className="mx-auto text-[#121b33]" size={36} />
        <h1 className="mt-3 text-xl font-semibold">你已經有一家店了</h1>
        <p className="mt-1 text-sm text-[#6b6156]">{existing.name} · {existing.slug}.{rootDomain}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href={existing.adminUrl} className="rounded-full bg-[#121b33] px-5 py-2.5 text-sm font-semibold text-[#dcbc84]">前往後台</a>
          <a href={existing.url} target="_blank" rel="noreferrer" className="rounded-full border border-[#d7c9bd] px-5 py-2.5 text-sm">看看官網</a>
        </div>
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className={`${card} text-center`}>
        <Store className="mx-auto text-[#121b33]" size={36} />
        <h1 className="mt-3 text-xl font-semibold">開設官網需要 U Pro 以上方案</h1>
        <p className="mt-2 text-sm leading-6 text-[#6b6156]">U Pro:自己架站、上架商品,用轉帳匯款收款、自行寄件。</p>
        <Link href="/mycard/upgrade" className="mt-6 inline-block rounded-full bg-[#121b33] px-6 py-3 text-sm font-semibold text-[#dcbc84]">查看方案</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className={`${card} text-center`}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e9f7ee] text-[#1f7a44]"><Check size={28} /></span>
        <h1 className="mt-4 text-xl font-semibold">你的官網開好了!</h1>
        <p className="mt-1 text-sm text-[#6b6156]">{done.slug}.{rootDomain}</p>
        <ol className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm leading-6 text-[#5f5852]">
          <li>1. 進後台上傳 Logo、上架第一個商品</li>
          <li>2. 到「系統設定 → 金流設定」確認收款帳號</li>
          <li>3. 把官網網址分享給客人</li>
        </ol>
        <p className="mt-4 text-xs text-[#a99e8f]">第一次進店家後台,需要用同一個帳號再登入一次。</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href={done.adminUrl} className="rounded-full bg-[#121b33] px-6 py-3 text-sm font-semibold text-[#dcbc84]">前往後台</a>
          <a href={done.url} target="_blank" rel="noreferrer" className="rounded-full border border-[#d7c9bd] px-6 py-3 text-sm">看看官網</a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="px-1">
        <p className="text-xs tracking-[0.2em] text-[#a99e8f]">OPEN YOUR SHOP</p>
        <h1 className="mt-1 text-2xl font-semibold">開設你的官網</h1>
        <p className="mt-2 text-sm leading-6 text-[#6b6156]">
          填好下面幾項就能開店。U Pro 用轉帳匯款收款、自行寄件,之後都可以在後台修改。
          {promo ? <span className="ml-1 font-medium text-[#6b4a1f]">現在限時免費!</span> : null}
        </p>
      </div>

      <section className={card}>
        <h2 className="text-sm font-semibold">1. 店名與網址</h2>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs text-[#8a7f72]">店名</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="例如:BON SUCRÉ 甜點" className={input} />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs text-[#8a7f72]">官網網址</span>
          <div className="flex items-center overflow-hidden rounded-xl border border-[#e5ded4] focus-within:border-[#121b33]">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              maxLength={30}
              placeholder="yourshop"
              inputMode="url"
              autoCapitalize="none"
              className="min-w-0 flex-1 bg-white px-4 py-3 text-sm outline-none"
            />
            <span className="shrink-0 bg-[#faf7f2] px-3 py-3 text-sm text-[#8a7f72]">.{rootDomain}</span>
          </div>
          <span className={`mt-1.5 flex items-center gap-1 text-xs ${check.state === 'ok' ? 'text-[#1f7a44]' : check.state === 'bad' ? 'text-[#a33a2b]' : 'text-[#a99e8f]'}`}>
            {check.state === 'checking' ? <LoaderCircle size={12} className="animate-spin" /> : check.state === 'ok' ? <Check size={12} /> : null}
            {check.state === 'idle' ? '小寫英文、數字、連字號,3–30 字' : check.state === 'checking' ? '檢查中…' : check.message}
          </span>
        </label>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold">2. 選一個版型</h2>
        <p className="mt-1 text-xs text-[#8a7f72]">之後可以在後台「系統設定 → 一般設定」換版型、調配色。</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {templates.map((t) => {
            const on = t.key === template;
            return (
              <button key={t.key} type="button" onClick={() => setTemplate(t.key)} className={`overflow-hidden rounded-2xl border-2 text-left transition ${on ? 'border-[#121b33]' : 'border-[#efe8dd] hover:border-[#d7c9bd]'}`}>
                <span className="block p-3" style={{ background: t.colors.bg }}>
                  <span className="block h-3 w-12 rounded" style={{ background: t.colors.header, border: `1px solid ${t.colors.border}` }} />
                  <span className="mt-2 grid grid-cols-2 gap-1.5">
                    {[0, 1].map((i) => <span key={i} className="block h-10 rounded" style={{ background: t.colors.card, border: `1px solid ${t.colors.border}` }} />)}
                  </span>
                  <span className="mt-2 block h-3 w-16 rounded-full" style={{ background: t.colors.button }} />
                </span>
                <span className="block px-3 py-2">
                  <span className="block text-sm font-medium">{t.name}</span>
                  <span className="block truncate text-[11px] text-[#a99e8f]">{t.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold">3. 收款帳號(選填)</h2>
        <p className="mt-1 text-xs text-[#8a7f72]">客人選「轉帳匯款」結帳時會看到這段。之後也可以在後台改。</p>
        <textarea value={bank} onChange={(e) => setBank(e.target.value)} rows={3} maxLength={300} placeholder={'例如:玉山銀行(808)\n戶名:王小明\n帳號:1234-567-890123'} className={`${input} mt-3 resize-none`} />
      </section>

      {error ? <p className="rounded-xl bg-[#fbf3f0] px-4 py-3 text-sm text-[#a33a2b]">{error}</p> : null}
      <button type="submit" disabled={busy || check.state !== 'ok' || !name.trim()} className="w-full rounded-full bg-[#121b33] py-3.5 text-sm font-semibold text-[#dcbc84] transition hover:bg-[#1d2a4d] disabled:opacity-40">
        {busy ? '開店中…' : '建立我的官網'}
      </button>
    </form>
  );
}
