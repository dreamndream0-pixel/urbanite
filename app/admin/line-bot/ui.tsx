'use client';

import type { ReactNode } from 'react';
import type { MessageSet } from '@/lib/line-bot-types';
import { uiAlert } from '@/lib/ui-dialog';

// LINE 機器人後台共用的小元件(與後台其他頁面同一套樣式)
export const inputClass = 'w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#1f1b19]/40';
export const smallBtn = 'rounded-full border border-[#d7c9bd] bg-white px-3.5 py-1.5 text-xs font-medium text-[#1f1b19] transition hover:bg-[#f6f2ec] disabled:opacity-40';
export const primaryBtn = 'rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3a322e] disabled:opacity-40';

export function Card({ title, desc, action, children }: { title: string; desc?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#e5ded4] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[#1f1b19]">{title}</h3>
          {desc ? <p className="mt-1 text-xs leading-5 text-[#8a7f72]">{desc}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-[#8cc97c]' : 'bg-[#ddd6cc]'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[#6b6156]">{label}</span>
        {hint ? <span className="text-[11px] text-[#a99e8f]">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function Pills<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-full px-3.5 py-1.5 text-xs transition ${value === o.key ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] text-[#5f5852] hover:border-[#1f1b19]/30'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// 關鍵字輸入:Enter 或逗號新增
export function TagInput({ value, onChange, placeholder, max = 30 }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number }) {
  function add(raw: string) {
    const items = raw.split(/[,,、\n]/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    onChange([...new Set([...value, ...items])].slice(0, max));
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#e5ded4] bg-white px-2 py-1.5 focus-within:border-[#1f1b19]/40">
      {value.map((k) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-md bg-[#f3eee7] px-2 py-1 text-xs text-[#1f1b19]">
          {k}
          <button type="button" aria-label={`移除 ${k}`} onClick={() => onChange(value.filter((x) => x !== k))} className="text-[#a99e8f] hover:text-[#c0392b]">
            ×
          </button>
        </span>
      ))}
      <input
        placeholder={value.length ? '' : placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
        onBlur={(e) => {
          add(e.currentTarget.value);
          e.currentTarget.value = '';
        }}
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-[#e5ded4] px-4 py-8 text-center text-sm text-[#a99e8f]">{children}</p>;
}

export function Svg({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// 上傳圖片(沿用商品圖片 API),先在瀏覽器縮圖
export async function uploadBotImage(file: File, max = 1600): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error('圖片請小於 10MB');
  const blob = await new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('無法處理圖片'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('圖片處理失敗'))), 'image/jpeg', 0.88);
    };
    img.onerror = () => reject(new Error('圖片讀取失敗'));
    img.src = url;
  });
  return uploadBlob(blob, 'image.jpg');
}

export async function uploadBlob(blob: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', new File([blob], name, { type: blob.type }));
  form.append('productId', 'line');
  form.append('folder', 'line-bot');
  const res = await fetch('/api/products/image', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? '上傳失敗');
  return String(data.image_url);
}

// 傳送給自己(管理員已綁定的 LINE)預覽
export async function sendTest(content: MessageSet) {
  const res = await fetch('/api/admin/line-bot/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
  const data = await res.json();
  void uiAlert(res.ok ? '已傳送到你的 LINE,打開聊天室看看。' : data.error ?? '傳送失敗');
}

// 兩欄:左邊編輯、右邊手機預覽
export function EditorWithPreview({ editor, preview }: { editor: ReactNode; preview: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">{editor}</div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 text-center text-[11px] text-[#a99e8f]">手機預覽(變數以範例顯示)</p>
        {preview}
      </div>
    </div>
  );
}
