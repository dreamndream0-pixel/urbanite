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
export default function IntegrationSettings() {
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function apply(list: Status[]) {
    setStatus(Object.fromEntries(list.map((item) => [item.key, item])));
    setDraft({});
  }

  useEffect(() => {
    fetch('/api/admin/integrations', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('讀取失敗'))))
      .then(apply)
      .catch(() => void uiAlert('串接設定讀取失敗'))
      .finally(() => setLoading(false));
  }, []);

  async function save(updates: Record<string, string>) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
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

  return (
    <div className="space-y-5">
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
