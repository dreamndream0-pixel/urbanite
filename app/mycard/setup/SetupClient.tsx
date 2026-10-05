'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SLUG_PATTERN } from '@/lib/profile-card';

type Check = { state: 'idle' | 'checking' | 'ok' | 'bad'; message: string };

const inputBox = 'flex items-center rounded-xl border bg-white transition focus-within:border-[#1f1b19]/50';

export default function SetupClient({ name: initialName, slug: initialSlug }: { name: string; slug: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [referrer, setReferrer] = useState('');
  const [check, setCheck] = useState<Check>({ state: 'idle', message: '' });
  const [errors, setErrors] = useState<{ name?: string; slug?: string; ref?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  // 輸入停下來 0.4 秒後檢查網址
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!slug) return setCheck({ state: 'idle', message: '' });
      if (!SLUG_PATTERN.test(slug)) return setCheck({ state: 'bad', message: '只能用小寫英文、數字、點、底線、連字號,2–30 字,開頭結尾要是英數字' });
      setCheck({ state: 'checking', message: '' });
      fetch(`/api/profile-card/setup?slug=${encodeURIComponent(slug)}`)
        .then((r) => r.json())
        .then((d) => setCheck(d.ok ? { state: 'ok', message: '可以使用' } : { state: 'bad', message: d.error }))
        .catch(() => setCheck({ state: 'idle', message: '' }));
    }, 400);
    return () => clearTimeout(timer);
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = '請輸入暱稱';
    if (!slug) next.slug = '請輸入網址';
    else if (check.state === 'bad') next.slug = check.message;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const res = await fetch('/api/profile-card/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name, slug, referrer }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors({ [data.field ?? 'form']: data.error ?? '儲存失敗' });
        setBusy(false);
        return;
      }
      router.replace('/mycard');
      router.refresh();
    } catch {
      setErrors({ form: '網路不穩,請再試一次' });
      setBusy(false);
    }
  }

  const slugError = errors.slug || (check.state === 'bad' ? check.message : '');
  const border = (bad: boolean) => (bad ? 'border-[#d9534f]' : 'border-[#e5ded4]');

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:py-16">
      <h1 className="text-center font-serif-tc text-2xl font-bold tracking-[0.06em]">設定你的個人網址</h1>
      <p className="mt-2 text-center text-sm text-[#8a7f72]">之後都可以在「名片設定」裡修改</p>

      <form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border border-[#e5ded4] bg-white p-5 sm:p-6" noValidate>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">暱稱 <span className="text-[#d9534f]">*</span></span>
          <div className={`${inputBox} ${border(Boolean(errors.name))}`}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="輸入暱稱"
              className="min-w-0 flex-1 rounded-xl bg-transparent px-3.5 py-3 text-sm outline-none"
            />
          </div>
          {errors.name ? <span className="mt-1 block text-xs text-[#d9534f]">{errors.name}</span> : null}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">自訂你的網址 <span className="text-[#d9534f]">*</span></span>
          <div className={`${inputBox} ${border(Boolean(slugError))} pl-3.5`}>
            <span className="shrink-0 text-sm text-[#a99e8f]">urbanite.com.tw/@</span>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30));
                setErrors((x) => ({ ...x, slug: undefined }));
              }}
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-3 pr-3.5 text-sm outline-none"
            />
          </div>
          {slugError ? (
            <span className="mt-1 block text-xs text-[#d9534f]">{slugError}</span>
          ) : check.state === 'ok' ? (
            <span className="mt-1 block text-xs text-[#1f7a44]">可以使用</span>
          ) : check.state === 'checking' ? (
            <span className="mt-1 block text-xs text-[#a99e8f]">檢查中…</span>
          ) : (
            <span className="mt-1 block text-xs text-[#a99e8f]">小寫英文、數字、點、底線、連字號</span>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">推薦人的網址代稱 <span className="font-normal text-[#a99e8f]">(選填)</span></span>
          <div className={`${inputBox} ${border(Boolean(errors.ref))} pl-3.5`}>
            <span className="shrink-0 text-sm text-[#a99e8f]">@</span>
            <input
              value={referrer}
              onChange={(e) => {
                setReferrer(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30));
                setErrors((x) => ({ ...x, ref: undefined }));
              }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-3 pl-1 pr-3.5 text-sm outline-none"
            />
          </div>
          {errors.ref ? <span className="mt-1 block text-xs text-[#d9534f]">{errors.ref}</span> : null}
        </label>

        {errors.form ? <p className="text-sm text-[#d9534f]">{errors.form}</p> : null}

        <button type="submit" disabled={busy} className="w-full rounded-full bg-[#1f1b19] py-3 text-sm font-semibold text-white transition hover:bg-[#3a322e] disabled:opacity-50">
          {busy ? '儲存中…' : '下一步'}
        </button>
      </form>
    </div>
  );
}
