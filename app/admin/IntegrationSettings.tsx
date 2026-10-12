'use client';

import { useEffect, useState } from 'react';
import { INTEGRATION_GROUPS, type IntegrationField } from '@/lib/integration-fields';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

type Status = { key: string; source: 'admin' | 'env' | 'none'; value: string };

const SOURCE_LABEL: Record<Status['source'], { text: string; className: string }> = {
  admin: { text: '後台設定', className: 'bg-[#e9f7ee] text-[#1f7a44]' },
  env: { text: '主機設定', className: 'bg-[#eef2fb] text-[#3b5bab]' },
  none: { text: '未設定', className: 'bg-[#f6f2ec] text-[#a99e8f]' },
};

// 後台「串接設定」:金流 / 物流 / LINE 金鑰改在這裡設定,不必到 Vercel
const NOTICE = '串接資料請勿更動，若有問題，請聯絡客服人員。';

export default function IntegrationSettings() {
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 串接設定需另外輸入專用密碼才能開啟。
  const [unlocked, setUnlocked] = useState(false);
  const [defaultPassword, setDefaultPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  function apply(list: Status[]) {
    setStatus(Object.fromEntries(list.map((item) => [item.key, item])));
    setDraft({});
  }

  async function loadSettings() {
    const res = await fetch('/api/admin/integrations', { cache: 'no-store' });
    if (res.status === 423) {
      setUnlocked(false);
      return;
    }
    if (!res.ok) throw new Error('讀取失敗');
    apply(await res.json());
  }

  useEffect(() => {
    fetch('/api/admin/integrations/unlock', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { unlocked: false }))
      .then(async (data: { unlocked?: boolean; defaultPassword?: boolean }) => {
        setUnlocked(Boolean(data.unlocked));
        setDefaultPassword(Boolean(data.defaultPassword));
        if (data.unlocked) await loadSettings();
      })
      .catch(() => void uiAlert('串接設定讀取失敗'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock() {
    if (!password || unlocking) return;
    setUnlocking(true);
    setUnlockError('');
    try {
      const res = await fetch('/api/admin/integrations/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '密碼錯誤');
      setUnlocked(true);
      setDefaultPassword(Boolean(data.defaultPassword));
      setPassword('');
      await loadSettings();
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : '密碼錯誤');
    } finally {
      setUnlocking(false);
    }
  }

  async function lock() {
    await fetch('/api/admin/integrations/unlock', { method: 'DELETE' }).catch(() => {});
    setUnlocked(false);
    setStatus({});
    setDraft({});
  }

  async function save(updates: Record<string, string>) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (res.status === 423) {
        setUnlocked(false);
        throw new Error('已逾時自動上鎖，請重新輸入密碼');
      }
      if (!res.ok) throw new Error(data.error ?? '儲存失敗');
      apply(data as Status[]);
      void uiAlert('串接設定已儲存');
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function clearField(field: IntegrationField) {
    if (!await uiConfirm(`清除後台的「${field.label}」設定?\n清除後會改用主機(Vercel)的設定;主機也沒設定就會停用此功能。`)) return;
    await save({ [field.key]: '' });
  }

  const dirtyKeys = Object.keys(draft).filter((key) => draft[key] !== undefined);

  if (loading) return <p className="py-10 text-center text-sm text-[#8a7f72]">載入中…</p>;

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-sm py-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f6f2ec] text-[#6b6156]">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <p className="mt-4 rounded-lg bg-[#fdf3e7] px-4 py-3 text-sm font-semibold leading-6 text-[#9a5b13]">{NOTICE}</p>
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="請輸入串接設定密碼"
            className="w-full rounded-lg border border-[#e5ded4] bg-white px-4 py-2.5 text-center tracking-[0.3em]"
          />
          {unlockError && <p className="text-sm text-[#c0392b]">{unlockError}</p>}
          <button
            type="submit"
            disabled={!password || unlocking}
            className="w-full rounded-full bg-[#1f1b19] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {unlocking ? '驗證中…' : '解鎖'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 rounded-xl border border-[#f0d9b5] bg-[#fdf3e7] p-4">
        <p className="text-sm font-semibold leading-6 text-[#9a5b13]">{NOTICE}</p>
        <button type="button" onClick={lock} className="shrink-0 rounded-full border border-[#d9b98a] bg-white px-3 py-1 text-xs font-semibold text-[#9a5b13]">
          上鎖
        </button>
      </div>
      {defaultPassword && (
        <p className="rounded-lg bg-[#fdecec] px-4 py-2.5 text-sm text-[#c0392b]">目前使用環境設定的初始密碼，請到最下方設定專用密碼（至少 12 碼）。</p>
      )}
      <div className="rounded-xl border border-[#e5ded4] bg-[#faf7f2] p-4 text-sm leading-6 text-[#6b6156]">
        金流、物流、LINE 的金鑰都可以在這裡設定，存檔後立即生效，不需要到 Vercel。
        <br />
        金鑰會加密保存，存好之後只顯示末四碼。後台沒填的項目會沿用主機設定。
      </div>

      {INTEGRATION_GROUPS.map((group) => (
        <section key={group.title} className="rounded-xl border border-[#e5ded4] bg-white p-4 sm:p-5">
          <h3 className="font-semibold">{group.title}</h3>
          {group.description && <p className="mt-1 text-xs leading-5 text-[#8a7f72]">{group.description}</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => {
              const current = status[field.key] ?? { key: field.key, source: 'none' as const, value: '' };
              const badge = SOURCE_LABEL[current.source];
              const value = draft[field.key] ?? (field.secret ? '' : current.value);
              const onChange = (next: string) => setDraft((prev) => ({ ...prev, [field.key]: next }));
              const inputClass = 'w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm';
              return (
                <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#6b6156]">{field.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.text}</span>
                  </div>
                  {field.type === 'select' ? (
                    <select value={value || 'stage'} onChange={(e) => onChange(e.target.value)} className={inputClass}>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className={inputClass} />
                  ) : (
                    <input
                      type={field.secret ? 'password' : 'text'}
                      autoComplete="off"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder={field.secret ? (current.value ? `目前:${current.value}(輸入新值才會更換)` : '尚未設定') : field.placeholder}
                      className={inputClass}
                    />
                  )}
                  <div className="mt-1 flex items-start justify-between gap-2">
                    {field.hint ? <p className="text-xs leading-5 text-[#a99e8f]">{field.hint}</p> : <span />}
                    {current.source === 'admin' && (
                      <button type="button" onClick={() => clearField(field)} className="shrink-0 text-xs text-[#c0392b] hover:underline">
                        清除
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <ChangePassword onChanged={() => setDefaultPassword(false)} onLocked={() => setUnlocked(false)} />

      <div className="sticky bottom-3 flex justify-end">
        <button
          type="button"
          disabled={saving || dirtyKeys.length === 0}
          onClick={() => save(Object.fromEntries(dirtyKeys.filter((key) => draft[key].trim() !== '').map((key) => [key, draft[key]])))}
          className="rounded-full bg-[#1f1b19] px-6 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-40"
        >
          {saving ? '儲存中…' : `儲存串接設定${dirtyKeys.length ? `(${dirtyKeys.length})` : ''}`}
        </button>
      </div>
    </div>
  );
}

function ChangePassword({ onChanged, onLocked }: { onChanged: () => void; onLocked: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (next.length < 12 || next.length > 256) return void uiAlert('新密碼需為 12 至 256 碼');
    if (next !== confirm) return void uiAlert('兩次輸入的新密碼不一致');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/integrations/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json();
      if (res.status === 423) {
        onLocked();
        throw new Error('已逾時自動上鎖，請重新輸入密碼');
      }
      if (!res.ok) throw new Error(data.error ?? '修改失敗');
      setCurrent('');
      setNext('');
      setConfirm('');
      onChanged();
      void uiAlert('串接設定密碼已更新');
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '修改失敗');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm';
  return (
    <section className="rounded-xl border border-[#e5ded4] bg-white p-4 sm:p-5">
      <h3 className="font-semibold">修改串接設定密碼</h3>
      <p className="mt-1 text-xs leading-5 text-[#8a7f72]">開啟本頁時需輸入的密碼，需為 12 至 256 碼。</p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input type="password" autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="目前密碼" className={inputClass} />
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="新密碼" className={inputClass} />
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="再次輸入新密碼" className={inputClass} />
        <div className="sm:col-span-3 flex justify-end">
          <button type="submit" disabled={busy || !current || !next || !confirm} className="rounded-full border border-[#1f1b19] px-5 py-2 text-sm font-semibold disabled:opacity-40">
            {busy ? '更新中…' : '更新密碼'}
          </button>
        </div>
      </form>
    </section>
  );
}
