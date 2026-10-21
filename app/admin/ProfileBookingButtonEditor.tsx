'use client';

import type { ReactNode } from 'react';
import { CalendarCheck, ChevronDown, RotateCcw } from 'lucide-react';
import ProfileBookingButton from '@/app/components/ProfileBookingButton';
import { resolveTheme, type ProfileCard } from '@/lib/profile-card';
import { type BookingButton } from '@/lib/profile-booking-button';

const input = 'mt-1 w-full min-w-0 rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm';

export default function ProfileBookingButtonEditor({ card, value, onChange, onSave, saving, dirty, error, available, customStyle, upgradeHref, handle, toggle, open, onToggleOpen }: {
  card: ProfileCard; value: BookingButton; handle: ReactNode; toggle: ReactNode; open: boolean; onToggleOpen: () => void;
  onChange: (value: BookingButton) => void; onSave: () => void;
  saving: boolean; dirty: boolean; error: string; available: boolean; customStyle: boolean; upgradeHref: string;
}) {
  const set = (patch: Partial<BookingButton>) => onChange({ ...value, ...patch });
  return (
    <section aria-label="線上預約設定" className="flex overflow-hidden rounded-2xl border border-[#ebe4da] bg-white">
      <div className="flex items-stretch border-r border-[#f3eee7] bg-[#fcfaf7] px-1.5">{handle}</div>
      <div className="min-w-0 flex-1">
      <div className="flex items-center gap-3 p-3.5">
        <button type="button" aria-label="編輯線上預約" aria-expanded={open} onClick={onToggleOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f6f2ec] text-[#6b6156]"><CalendarCheck size={19} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm text-[#1f1b19]">{value.label}</span><span className="block text-[11px] text-[#a99e8f]">線上預約 · {available ? '預約已開放' : '預約尚未開放'}{dirty ? ' · 尚未儲存' : ''}</span></span>
          <ChevronDown size={16} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {toggle}
      </div>
      {error ? <p role="alert" className="px-3.5 pb-3 text-sm text-[#a03b3b]">{error}</p> : null}
      {open ? <div className="space-y-4 border-t border-[#f3eee7] p-3.5">
        <a href="/mycard/booking" className="inline-block text-sm font-medium underline underline-offset-4">管理預約</a>
        <fieldset disabled={saving} className="min-w-0 space-y-4 disabled:opacity-60">
          <label className="block text-sm">按鈕文字<input className={input} value={value.label} maxLength={80} onChange={(e) => set({ label: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.showIcon} onChange={(e) => set({ showIcon: e.target.checked })} />顯示日曆圖示</label>
        </fieldset>
        <fieldset disabled={saving || !customStyle} className="grid min-w-0 grid-cols-2 gap-3 disabled:opacity-50">
          <legend className="mb-2 text-sm font-semibold">設計樣式</legend>
          <label className="min-w-0 text-sm">樣式<select aria-label="樣式" className={input} value={value.style} onChange={(e) => set({ style: e.target.value as BookingButton['style'] })}>
            <option value="accent">實色按鈕</option><option value="theme">跟隨名片連結</option><option value="outline">外框按鈕</option><option value="soft">柔和底色</option>
          </select></label>
          <label className="min-w-0 text-sm">圓角<select aria-label="圓角" className={input} value={value.shape} onChange={(e) => set({ shape: e.target.value as BookingButton['shape'] })}>
            <option value="inherit">跟隨名片</option><option value="pill">膠囊</option><option value="rounded">圓角</option><option value="square">直角</option>
          </select></label>
          {(['color', 'textColor'] as const).map((key) => <div key={key} className="min-w-0">
            <label className="block text-sm">{key === 'color' ? '按鈕顏色' : '文字顏色'}<input type="color" aria-label={key === 'color' ? '按鈕顏色' : '文字顏色'} value={value[key] || (key === 'color' ? resolveTheme(card.theme).accentColor : '#ffffff')} onChange={(e) => set({ [key]: e.target.value })} className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-[#e5ded4] bg-white p-1" /></label>
            <button type="button" onClick={() => set({ [key]: '' })} title="恢復自動配色" aria-label={key === 'color' ? '重設按鈕顏色' : '重設文字顏色'} className="mt-1 flex items-center gap-1 text-xs text-[#8a7f72]"><RotateCcw size={12} />自動配色</button>
          </div>)}
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={value.shadow} onChange={(e) => set({ shadow: e.target.checked })} />按鈕陰影</label>
        </fieldset>
        {!customStyle ? <a href={upgradeHref} className="block text-xs text-[#8a7f72] underline">U Plus 自訂設計樣式</a> : null}
        <div aria-label="預約按鈕樣式預覽"><ProfileBookingButton theme={{ ...resolveTheme(card.theme), bookingButton: value }} href={`/@${card.slug}/book`} preview /></div>
        <button type="button" disabled={saving || !dirty} onClick={onSave} className="w-full rounded-lg bg-[#1f1b19] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? '儲存中…' : dirty ? '儲存預約按鈕' : '已儲存'}</button>
      </div> : null}
      </div>
    </section>
  );
}
