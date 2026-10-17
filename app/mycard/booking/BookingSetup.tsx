'use client';

import { useState } from 'react';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import {
  fromLocal, formatRange, hhmmToMinutes, localParts, minutesToHHMM, money, STEP_WHO_LABEL, WEEKDAYS,
  type BkBooking, type BkBusiness, type BkException, type BkService, type BkStaff,
} from '@/lib/booking/shared';
import { api, btn, btnDark, btnSm, card, errMsg, input, isTeam, stylists, type Data } from './ui';
import { PackageProducts } from './LoyaltyParts';

// ---------- 每週時段編輯(營業時段、人員班表共用) ----------
type DayRange = { start: string; end: string };
type Week = DayRange[][];
type HourRow = { weekday: number; start_min: number; end_min: number };

export const toWeek = (rows: HourRow[]): Week => WEEKDAYS.map((_, d) => rows.filter((h) => h.weekday === d).map((h) => ({ start: minutesToHHMM(h.start_min), end: h.end_min === 1440 ? '24:00' : minutesToHHMM(h.end_min) })));

function fromWeek(week: Week): HourRow[] | string {
  const rows: HourRow[] = [];
  for (let d = 0; d < 7; d++) {
    for (const r of week[d]) {
      const s = hhmmToMinutes(r.start);
      const e = hhmmToMinutes(r.end);
      if (!(e > s)) return `週${WEEKDAYS[d]}的時段結束時間要晚於開始時間`;
      rows.push({ weekday: d, start_min: s, end_min: e });
    }
  }
  return rows;
}

function WeekEditor({ week, setWeek }: { week: Week; setWeek: (w: Week) => void }) {
  const setDay = (d: number, ranges: DayRange[]) => setWeek(week.map((r, i) => (i === d ? ranges : r)));
  return (
    <>
      <div className="divide-y divide-[#f0ebe2]">
        {WEEKDAYS.map((label, d) => (
          <div key={d} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:gap-3">
            <label className="flex shrink-0 items-center gap-2 text-sm font-semibold sm:w-16 sm:pt-2">
              <input type="checkbox" checked={week[d].length > 0} onChange={(e) => setDay(d, e.target.checked ? [{ start: '10:00', end: '19:00' }] : [])} />週{label}
            </label>
            <div className="min-w-0 flex-1 space-y-2">
              {!week[d].length ? <p className="pl-6 text-sm text-[#a99e8f] sm:pl-0 sm:pt-2">休息</p> : week[d].map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input type="time" step={900} value={r.start} onChange={(e) => setDay(d, week[d].map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] px-1.5 py-1.5 text-[13px]" />
                  <span className="text-[#a99e8f]">–</span>
                  <input type="time" step={900} value={r.end === '24:00' ? '23:59' : r.end} onChange={(e) => setDay(d, week[d].map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] px-1.5 py-1.5 text-[13px]" />
                  <button type="button" onClick={() => setDay(d, week[d].filter((_, j) => j !== i))} aria-label="移除時段" className="shrink-0 px-1.5 text-lg leading-none text-[#a03b3b]">×</button>
                </div>
              ))}
              {week[d].length > 0 && week[d].length < 4 ? <button type="button" onClick={() => setDay(d, [...week[d], { start: '19:00', end: '21:00' }])} className="text-xs text-[#1f6f8b]">+ 加一段</button> : null}
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setWeek(week.map((r, d) => (d === 0 ? r : week[1].map((x) => ({ ...x })))))} className="mt-2 text-xs text-[#8a7f72] underline-offset-4 hover:underline">把週一的時段套用到週一~週六</button>
    </>
  );
}

// ---------- 服務(含加購、訂金、床位、可做的人員) ----------
const DURATIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360, 480];
const durationLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ''}` : `${m} 分鐘`);
type AddonDraft = { id?: string; name: string; price: number; extra_minutes: number; active: boolean };
type StaffLink = { staff_id: string; duration_minutes: number | null; price: number | null };
type StepDraft = { name: string; minutes: number; who: 'main' | 'assistant' | 'none'; seat: 'keep' | 'release' };
const STEP_MINUTES = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180];
type ServiceDraft = {
  id?: string; name: string; description: string; duration_minutes: number; price: number; price_note: string; active: boolean;
  deposit: number; needs_resource: boolean; addons: AddonDraft[]; staff: StaffLink[]; steps: StepDraft[];
  price_mode: 'fixed' | 'quote'; service_mode: 'in_store' | 'outcall'; revisit_days: number;
};
const blankService: ServiceDraft = { name: '', description: '', duration_minutes: 60, price: 0, price_note: '', active: true, deposit: 0, needs_resource: false, addons: [], staff: [], steps: [], price_mode: 'fixed', service_mode: 'in_store', revisit_days: 0 };
const digits = (v: string) => Number(v.replace(/\D/g, '')) || 0;

export function ServicesTab({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<ServiceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const team = isTeam(data);
  const activeStaff = stylists(data);
  const hasAssistant = data.staff.some((s) => s.active && s.role === 'assistant');

  function edit(s: BkService) {
    setEditing({
      id: s.id, name: s.name, description: s.description, duration_minutes: s.duration_minutes, price: s.price, price_note: s.price_note, active: s.active,
      deposit: s.deposit, needs_resource: s.needs_resource, price_mode: s.price_mode, service_mode: s.service_mode, revisit_days: s.revisit_days ?? 0,
      addons: data.addons.filter((a) => a.service_id === s.id).map((a) => ({ id: a.id, name: a.name, price: a.price, extra_minutes: a.extra_minutes, active: a.active })),
      staff: data.staffServices.filter((x) => x.service_id === s.id).map((x) => ({ staff_id: x.staff_id, duration_minutes: x.duration_minutes, price: x.price })),
      steps: data.steps.filter((x) => x.service_id === s.id).sort((a, b) => a.seq - b.seq).map((x) => ({ name: x.name, minutes: x.minutes, who: x.who, seat: x.seat })),
    });
  }
  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return void uiAlert('請填寫服務名稱');
    if (editing.addons.some((a) => !a.name.trim())) return void uiAlert('請填寫加購名稱,或移除空白的加購');
    if (editing.steps.some((x) => !x.name.trim())) return void uiAlert('請填寫步驟名稱,或移除空白的步驟');
    if (editing.steps.length > 1 && !editing.steps.some((x) => x.who === 'main')) return void uiAlert('至少要有一個步驟由主要人員負責');
    setSaving(true);
    try {
      await api('/api/mycard/booking/services', { method: editing.id ? 'PATCH' : 'POST', body: JSON.stringify(editing) });
      uiToast('已儲存服務');
      setEditing(null);
      void reload();
    } catch (e) { void uiAlert(errMsg(e, '儲存失敗')); }
    finally { setSaving(false); }
  }
  async function remove(s: BkService) {
    if (!(await uiConfirm(`刪除「${s.name}」?已成立的預約不受影響。`, { danger: true }))) return;
    try { await api(`/api/mycard/booking/services?id=${s.id}`, { method: 'DELETE' }); void reload(); }
    catch (e) { void uiAlert(errMsg(e, '刪除失敗')); }
  }
  const setStep = (i: number, patch: Partial<StepDraft>) => editing && setEditing({ ...editing, steps: editing.steps.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const moveStep = (i: number, d: number) => {
    if (!editing || i + d < 0 || i + d >= editing.steps.length) return;
    const next = [...editing.steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setEditing({ ...editing, steps: next });
  };
  const stepTotal = editing?.steps.reduce((n, x) => n + x.minutes, 0) ?? 0;
  const setAddon = (i: number, patch: Partial<AddonDraft>) => editing && setEditing({ ...editing, addons: editing.addons.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const link = (id: string) => editing?.staff.find((x) => x.staff_id === id);
  const setLink = (id: string, patch: Partial<StaffLink> | null) => {
    if (!editing) return;
    const others = editing.staff.filter((x) => x.staff_id !== id);
    setEditing({ ...editing, staff: patch === null ? others : [...others, { staff_id: id, duration_minutes: null, price: null, ...link(id), ...patch }] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#8a7f72]">顧客預約時看到的服務項目。修改後只影響之後的新預約。</p>
        <button type="button" onClick={() => setEditing({ ...blankService })} className={`${btnDark} shrink-0`}>+ 新增服務</button>
      </div>
      {editing && (
        <div className={`${card} space-y-3`}>
          <p className="font-semibold">{editing.id ? '編輯服務' : '新增服務'}</p>
          <div className="grid grid-cols-2 gap-2">
            {([['fixed', '固定價格', '顧客直接選時段預約'], ['quote', '需報價', '新秘、客製:先詢價再報價']] as const).map(([k, title, sub]) => (
              <button key={k} type="button" onClick={() => setEditing({ ...editing, price_mode: k })} className={`rounded-xl border p-2.5 text-left ${editing.price_mode === k ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5ded4]'}`}>
                <span className="block text-sm font-semibold">{title}</span><span className="block text-[11px] text-[#8a7f72]">{sub}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.service_mode === 'outcall'} onChange={(e) => setEditing({ ...editing, service_mode: e.target.checked ? 'outcall' : 'in_store' })} />外出服務(到府、到場,前後加交通時間)</label>
          <label className="block text-xs text-[#8a7f72]">服務名稱
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={60} placeholder="例:單色凝膠美甲" className={`${input} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-[#8a7f72]">服務時間{editing.steps.length > 1 ? '(依步驟)' : ''}
              <select value={editing.steps.length > 1 ? stepTotal : editing.duration_minutes} disabled={editing.steps.length > 1} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} className={`${input} mt-1 disabled:opacity-60`}>
                {editing.steps.length > 1 && !DURATIONS.includes(stepTotal) ? <option value={stepTotal}>{durationLabel(stepTotal)}</option> : null}
                {DURATIONS.map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}
              </select>
            </label>
            <label className="block text-xs text-[#8a7f72]">價格(元)
              <input inputMode="numeric" value={editing.price || ''} onChange={(e) => setEditing({ ...editing, price: digits(e.target.value) })} placeholder="0 = 現場報價" className={`${input} mt-1`} />
            </label>
            <label className="block text-xs text-[#8a7f72]">價格補充(選填)
              <input value={editing.price_note} onChange={(e) => setEditing({ ...editing, price_note: e.target.value })} maxLength={20} placeholder="例:起" className={`${input} mt-1`} />
            </label>
            <label className="block text-xs text-[#8a7f72]">訂金(元)
              <input inputMode="numeric" value={editing.deposit || ''} onChange={(e) => setEditing({ ...editing, deposit: digits(e.target.value) })} placeholder="0 = 不收訂金" className={`${input} mt-1`} />
            </label>
          </div>
          <label className="block text-xs text-[#8a7f72]">回訪提醒(完成後幾天提醒顧客再預約)
            <select value={editing.revisit_days} onChange={(e) => setEditing({ ...editing, revisit_days: Number(e.target.value) })} className={`${input} mt-1`}>
              {[0, 14, 21, 28, 30, 42, 60, 90, 120, 180].map((n) => <option key={n} value={n}>{n ? `${n} 天後` : '不提醒'}</option>)}
            </select>
          </label>
          <label className="block text-xs text-[#8a7f72]">說明(選填)
            <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={3} maxLength={500} className={`${input} mt-1 resize-none`} />
          </label>

          {/* 分段步驟 */}
          <div className="rounded-xl bg-[#faf7f2] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">分段步驟{editing.steps.length > 1 ? `(共 ${durationLabel(stepTotal)})` : ''}</p>
                <p className="text-[11px] text-[#8a7f72]">例:染髮 = 上藥(主要人員)→ 等待上色(不需人員)→ 沖洗(助理)→ 吹整(主要人員)。等待時段主要人員可以接其他客人。</p>
              </div>
              {editing.steps.length === 0 ? (
                <button type="button" onClick={() => setEditing({ ...editing, steps: [{ name: '施作', minutes: 30, who: 'main', seat: 'keep' }, { name: '等待', minutes: 30, who: 'none', seat: 'keep' }, { name: '完成', minutes: 30, who: 'main', seat: 'keep' }] })} className={`${btnSm} shrink-0`}>改成分段</button>
              ) : (
                <button type="button" onClick={() => setEditing({ ...editing, steps: [] })} className={`${btnSm} shrink-0`}>不分段</button>
              )}
            </div>
            {editing.steps.length ? (
              <div className="mt-2 space-y-2">
                {editing.steps.map((x, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-white p-2">
                    <input value={x.name} onChange={(e) => setStep(i, { name: e.target.value })} maxLength={30} placeholder="步驟名稱" aria-label="步驟名稱" className="min-w-0 rounded-lg border border-[#e5ded4] px-2 py-1.5 text-base" />
                    <div className="flex shrink-0 items-center">
                      <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="上移" className="px-1.5 text-[#6b6156] disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => moveStep(i, 1)} disabled={i === editing.steps.length - 1} aria-label="下移" className="px-1.5 text-[#6b6156] disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, j) => j !== i) })} aria-label="移除步驟" className="px-1.5 text-lg leading-none text-[#a03b3b]">×</button>
                    </div>
                    <div className="col-span-2 flex flex-wrap items-center gap-2">
                      <select value={x.minutes} onChange={(e) => setStep(i, { minutes: Number(e.target.value) })} aria-label="分鐘" className="rounded-lg border border-[#e5ded4] px-1 py-1 text-sm">
                        {(STEP_MINUTES.includes(x.minutes) ? STEP_MINUTES : [...STEP_MINUTES, x.minutes].sort((a, b) => a - b)).map((m) => <option key={m} value={m}>{m} 分</option>)}
                      </select>
                      <select value={x.who} onChange={(e) => setStep(i, { who: e.target.value as StepDraft['who'] })} aria-label="負責" className="rounded-lg border border-[#e5ded4] px-1 py-1 text-sm">
                        {(Object.keys(STEP_WHO_LABEL) as StepDraft['who'][]).map((k) => <option key={k} value={k}>{STEP_WHO_LABEL[k]}</option>)}
                      </select>
                      {editing.needs_resource ? <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={x.seat === 'keep'} onChange={(e) => setStep(i, { seat: e.target.checked ? 'keep' : 'release' })} />占座位</label> : null}
                    </div>
                  </div>
                ))}
                {editing.steps.length < 12 ? <button type="button" onClick={() => setEditing({ ...editing, steps: [...editing.steps, { name: '', minutes: 15, who: 'main', seat: 'keep' }] })} className="text-xs text-[#1f6f8b]">+ 新增步驟</button> : null}
                {editing.steps.some((x) => x.who === 'assistant') && !hasAssistant ? <p className="text-[11px] text-[#9a6412]">目前沒有助理,助理步驟會由主要人員自己做。可到「人員床位」新增角色為助理的人員。</p> : null}
                {editing.steps.length === 1 ? <p className="text-[11px] text-[#9a6412]">只有一個步驟等於不分段。</p> : null}
              </div>
            ) : null}
          </div>

          {/* 加購 */}
          <div className="rounded-xl bg-[#faf7f2] p-3">
            <p className="text-sm font-semibold">加購項目</p>
            <p className="text-[11px] text-[#8a7f72]">例:卸甲 +200 元 +20 分鐘。顧客可複選,時間與價格會加總。</p>
            <div className="mt-2 space-y-2">
              {editing.addons.map((a, i) => (
                <div key={a.id ?? `new-${i}`} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-white p-2 sm:grid-cols-[1fr_88px_88px_auto]">
                  <input value={a.name} onChange={(e) => setAddon(i, { name: e.target.value })} maxLength={40} placeholder="加購名稱" aria-label="加購名稱" className="col-span-2 min-w-0 rounded-lg border border-[#e5ded4] px-2 py-1.5 text-base sm:col-span-1" />
                  <div className="col-span-2 flex items-center gap-2 sm:contents">
                    <input inputMode="numeric" value={a.price || ''} onChange={(e) => setAddon(i, { price: digits(e.target.value) })} placeholder="+元" aria-label="加價" className="w-0 min-w-0 flex-1 rounded-lg border border-[#e5ded4] px-2 py-1.5 text-base sm:w-auto" />
                    <select value={a.extra_minutes} onChange={(e) => setAddon(i, { extra_minutes: Number(e.target.value) })} aria-label="加時" className="w-0 min-w-0 flex-1 rounded-lg border border-[#e5ded4] px-1 py-1.5 text-sm sm:w-auto">
                      {[0, 5, 10, 15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m ? `+${m} 分` : '不加時'}</option>)}
                    </select>
                    <button type="button" onClick={() => setEditing({ ...editing, addons: editing.addons.filter((_, j) => j !== i) })} aria-label="移除加購" className="shrink-0 px-1.5 text-lg leading-none text-[#a03b3b]">×</button>
                  </div>
                </div>
              ))}
              {editing.addons.length < 20 ? <button type="button" onClick={() => setEditing({ ...editing, addons: [...editing.addons, { name: '', price: 0, extra_minutes: 0, active: true }] })} className="text-xs text-[#1f6f8b]">+ 新增加購</button> : null}
            </div>
          </div>

          {/* 可做的人員 */}
          {team ? (
            <div className="rounded-xl bg-[#faf7f2] p-3">
              <p className="text-sm font-semibold">可做這項服務的人員</p>
              <p className="text-[11px] text-[#8a7f72]">都不勾 = 所有人員都可做。可個別設定時間與價格(空白 = 用上面的設定)。</p>
              <div className="mt-2 space-y-1.5">
                {activeStaff.map((s) => {
                  const l = link(s.id);
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(l)} onChange={(e) => setLink(s.id, e.target.checked ? {} : null)} /><span className="truncate">{s.name}</span></label>
                      {l ? <>
                        <select value={l.duration_minutes ?? ''} onChange={(e) => setLink(s.id, { duration_minutes: e.target.value ? Number(e.target.value) : null })} aria-label={`${s.name} 時間`} className="w-24 rounded-lg border border-[#e5ded4] px-1 py-1 text-xs">
                          <option value="">同上時間</option>
                          {DURATIONS.map((m) => <option key={m} value={m}>{durationLabel(m)}</option>)}
                        </select>
                        <input inputMode="numeric" value={l.price ?? ''} onChange={(e) => setLink(s.id, { price: e.target.value === '' ? null : digits(e.target.value) })} placeholder="同上價格" aria-label={`${s.name} 價格`} className="w-24 rounded-lg border border-[#e5ded4] px-2 py-1 text-base sm:text-xs" />
                      </> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {data.resources.length ? (
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={editing.needs_resource} onChange={(e) => setEditing({ ...editing, needs_resource: e.target.checked })} className="mt-1" />
              <span>需要床位 / 座位<span className="block text-[11px] text-[#8a7f72]">床位都被占用時,這個時段就不能約(目前 {data.resources.filter((r) => r.active).length} 個)</span></span>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />開放預約</label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className={btn}>取消</button>
            <button type="button" disabled={saving} onClick={() => void save()} className={btnDark}>{saving ? '儲存中…' : '儲存'}</button>
          </div>
        </div>
      )}
      {!data.services.length && !editing ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-[#a99e8f]">還沒有服務,按「新增服務」開始</p> : data.services.map((s) => {
        const addons = data.addons.filter((a) => a.service_id === s.id);
        const staffNames = data.staffServices.filter((x) => x.service_id === s.id).map((x) => data.staff.find((st) => st.id === x.staff_id)?.name).filter(Boolean);
        return (
          <div key={s.id} className={`${card} flex items-center gap-3 ${s.active ? '' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{s.name}{s.active ? '' : '(未開放)'}</p>
              <p className="text-xs text-[#8a7f72]">{s.price_mode === 'quote' ? '需報價 · ' : ''}{s.service_mode === 'outcall' ? '外出 · ' : ''}{s.duration_minutes} 分鐘 · {s.price ? money(s.price) : '現場報價'}{s.price_note ? ` ${s.price_note}` : ''}{s.deposit ? ` · 訂金 ${money(s.deposit)}` : ''}</p>
              {addons.length || (team && staffNames.length) || s.needs_resource ? (
                <p className="truncate text-[11px] text-[#a99e8f]">{[addons.length ? `加購 ${addons.length} 項` : '', team && staffNames.length ? `限 ${staffNames.join('、')}` : '', s.needs_resource ? '需床位' : ''].filter(Boolean).join(' · ')}</p>
              ) : null}
            </div>
            <button type="button" onClick={() => edit(s)} className={btn}>編輯</button>
            <button type="button" onClick={() => void remove(s)} className="shrink-0 px-1 text-sm text-[#a03b3b]">刪除</button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- 人員與床位 ----------
type StaffDraft = { id?: string; name: string; title: string; active: boolean; use_business_hours: boolean; role: 'stylist' | 'assistant'; week: Week };

export function StaffTab({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<StaffDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [resName, setResName] = useState('');

  function edit(s: BkStaff) {
    setEditing({ id: s.id, name: s.name, title: s.title, active: s.active, use_business_hours: s.use_business_hours, role: s.role, week: toWeek(data.staffHours.filter((h) => h.staff_id === s.id)) });
  }
  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return void uiAlert('請填寫人員名稱');
    const hours = editing.use_business_hours ? [] : fromWeek(editing.week);
    if (typeof hours === 'string') return void uiAlert(hours);
    setSaving(true);
    try {
      const res = await api<{ future?: BkBooking[] }>('/api/mycard/booking/staff', { method: editing.id ? 'PATCH' : 'POST', body: JSON.stringify({ ...editing, hours }) });
      if (res.future?.length) void uiAlert(`已停用。這位人員之後還有 ${res.future.length} 筆預約,系統不會自動取消,請到「預約」改期換人或聯絡顧客:\n${res.future.map((b) => `${formatRange(b.start_at, b.end_at)} ${b.contact?.name ?? ''}`).join('\n')}`);
      else uiToast('已儲存人員');
      setEditing(null);
      void reload();
    } catch (e) { void uiAlert(errMsg(e, '儲存失敗')); }
    finally { setSaving(false); }
  }
  async function remove(s: BkStaff) {
    if (!(await uiConfirm(`刪除「${s.name}」?`, { danger: true }))) return;
    try { await api(`/api/mycard/booking/staff?id=${s.id}`, { method: 'DELETE' }); void reload(); }
    catch (e) { void uiAlert(errMsg(e, '刪除失敗')); }
  }
  async function addResource() {
    if (!resName.trim()) return;
    try { await api('/api/mycard/booking/resources', { method: 'POST', body: JSON.stringify({ name: resName }) }); setResName(''); void reload(); }
    catch (e) { void uiAlert(errMsg(e, '新增失敗')); }
  }
  async function toggleResource(id: string, name: string, active: boolean) {
    try { await api('/api/mycard/booking/resources', { method: 'PATCH', body: JSON.stringify({ id, name, active }) }); void reload(); }
    catch (e) { void uiAlert(errMsg(e)); }
  }
  async function removeResource(id: string, name: string) {
    if (!(await uiConfirm(`刪除「${name}」?`, { danger: true }))) return;
    try { await api(`/api/mycard/booking/resources?id=${id}`, { method: 'DELETE' }); void reload(); }
    catch (e) { void uiAlert(errMsg(e, '刪除失敗')); }
  }

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">服務人員</p>
            <p className="text-xs text-[#8a7f72]">一人工作室保留一位即可;多位人員時,顧客可指定人員或選「不指定」。</p>
          </div>
          <button type="button" onClick={() => setEditing({ name: '', title: '', active: true, use_business_hours: true, role: 'stylist', week: toWeek(data.hours) })} className={`${btnDark} shrink-0`}>+ 新增</button>
        </div>
        {editing && (
          <div className="space-y-3 rounded-xl bg-[#faf7f2] p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-[#8a7f72]">名稱
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={30} placeholder="例:Amy" className={`${input} mt-1`} />
              </label>
              <label className="block text-xs text-[#8a7f72]">職稱(選填)
                <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={30} placeholder="例:資深美甲師" className={`${input} mt-1`} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['stylist', 'assistant'] as const).map((r) => (
                <button key={r} type="button" onClick={() => setEditing({ ...editing, role: r })} className={`rounded-xl border bg-white p-2.5 text-left ${editing.role === r ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5ded4]'}`}>
                  <span className="block text-sm font-semibold">{r === 'stylist' ? '設計師 / 主要人員' : '助理'}</span>
                  <span className="block text-[11px] text-[#8a7f72]">{r === 'stylist' ? '顧客可以指定,接主要服務' : '只接分段服務的助理步驟'}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.use_business_hours} onChange={(e) => setEditing({ ...editing, use_business_hours: e.target.checked })} />班表跟營業時段相同</label>
            {!editing.use_business_hours ? <div className="rounded-lg bg-white p-2"><p className="text-xs font-semibold">這位人員的每週班表</p><WeekEditor week={editing.week} setWeek={(w) => setEditing({ ...editing, week: w })} /></div> : null}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />可接預約(離職或暫停請取消勾選,歷史紀錄會保留)</label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={btn}>取消</button>
              <button type="button" disabled={saving} onClick={() => void save()} className={btnDark}>{saving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        )}
        <div className="divide-y divide-[#f0ebe2]">
          {data.staff.map((s) => (
            <div key={s.id} className={`flex items-center gap-3 py-2.5 ${s.active ? '' : 'opacity-60'}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#efe8dd] text-sm font-semibold text-[#6b6156]">{s.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.name}{s.active ? '' : '(停用)'}</p>
                <p className="truncate text-xs text-[#8a7f72]">{[s.role === 'assistant' ? '助理' : '', s.title, s.use_business_hours ? '班表同營業時段' : '自訂班表'].filter(Boolean).join(' · ')}</p>
              </div>
              <button type="button" onClick={() => edit(s)} className={btnSm}>編輯</button>
              {data.staff.length > 1 ? <button type="button" onClick={() => void remove(s)} className="shrink-0 px-1 text-xs text-[#a03b3b]">刪除</button> : null}
            </div>
          ))}
        </div>
      </section>

      <section className={`${card} space-y-3`}>
        <div>
          <p className="font-semibold">床位 / 座位 / 設備</p>
          <p className="text-xs text-[#8a7f72]">有床位數限制時才需要設定(例:美睫床 2 張)。在服務裡勾「需要床位」,床位都占滿時就不能預約。</p>
        </div>
        <div className="flex gap-2">
          <input value={resName} onChange={(e) => setResName(e.target.value)} maxLength={30} placeholder="例:美睫床 A" className={`${input} min-w-0 flex-1`} />
          <button type="button" onClick={() => void addResource()} className={`${btnDark} shrink-0`}>新增</button>
        </div>
        {data.resources.length ? (
          <div className="divide-y divide-[#f0ebe2]">
            {data.resources.map((r) => (
              <div key={r.id} className={`flex items-center gap-2 py-2 text-sm ${r.active ? '' : 'opacity-60'}`}>
                <span className="min-w-0 flex-1 truncate">{r.name}{r.active ? '' : '(停用)'}</span>
                <button type="button" onClick={() => void toggleResource(r.id, r.name, !r.active)} className={btnSm}>{r.active ? '停用' : '啟用'}</button>
                <button type="button" onClick={() => void removeResource(r.id, r.name)} className="shrink-0 px-1 text-xs text-[#a03b3b]">刪除</button>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-[#a99e8f]">尚未設定(不限制床位)</p>}
      </section>
    </div>
  );
}

// ---------- 營業時段與休假 ----------
export function HoursTab({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [week, setWeek] = useState<Week>(() => toWeek(data.hours));
  const [saving, setSaving] = useState(false);
  const [off, setOff] = useState({ date: '', allDay: true, start: '10:00', end: '18:00', reason: '', staff: '' });
  const team = isTeam(data);

  async function save() {
    const rows = fromWeek(week);
    if (typeof rows === 'string') return void uiAlert(rows);
    setSaving(true);
    try { await api('/api/mycard/booking', { method: 'PUT', body: JSON.stringify({ hours: rows }) }); uiToast('已儲存營業時段'); void reload(); }
    catch (e) { void uiAlert(errMsg(e, '儲存失敗')); }
    finally { setSaving(false); }
  }
  async function addOff() {
    if (!off.date) return void uiAlert('請選擇日期');
    const start = off.allDay ? fromLocal(off.date, 0) : fromLocal(off.date, hhmmToMinutes(off.start));
    const end = off.allDay ? fromLocal(off.date, 1440) : fromLocal(off.date, hhmmToMinutes(off.end));
    try {
      const res = await api<{ affected: BkBooking[] }>('/api/mycard/booking/exceptions', { method: 'POST', body: JSON.stringify({ start_at: start.toISOString(), end_at: end.toISOString(), reason: off.reason, staff_id: off.staff || null }) });
      if (res.affected.length) void uiAlert(`已設定休假。\n這段時間已有 ${res.affected.length} 筆預約,系統不會自動取消,請到「預約」改期或聯絡顧客:\n${res.affected.map((b) => `${formatRange(b.start_at, b.end_at)} ${b.contact?.name ?? ''}`).join('\n')}`);
      else uiToast('已設定休假');
      setOff({ ...off, date: '', reason: '' });
      void reload();
    } catch (e) { void uiAlert(errMsg(e, '設定失敗')); }
  }
  async function removeOff(x: BkException) {
    try { await api(`/api/mycard/booking/exceptions?id=${x.id}`, { method: 'DELETE' }); void reload(); }
    catch (e) { void uiAlert(errMsg(e, '刪除失敗')); }
  }

  return (
    <div className="space-y-4">
      <section className={card}>
        <p className="font-semibold">每週營業時段</p>
        <p className="mt-1 text-xs text-[#8a7f72]">顧客只能預約這些時段;同一天可以分成多段(例如中午休息)。{team ? '人員可在「人員床位」設定自己的班表。' : ''}</p>
        <div className="mt-3"><WeekEditor week={week} setWeek={setWeek} /></div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-[#a99e8f]">每 {data.business.slot_interval} 分鐘一個可選開始時間,可在「設定」調整。</p>
          <button type="button" disabled={saving} onClick={() => void save()} className={`${btnDark} shrink-0`}>{saving ? '儲存中…' : '儲存營業時段'}</button>
        </div>
      </section>

      <section className={card}>
        <p className="font-semibold">休假 / 不開放時段</p>
        <p className="mt-1 text-xs text-[#8a7f72]">設定後這段時間不能預約;已成立的預約不會被自動取消。</p>
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="date" value={off.date} min={localParts(new Date()).date} onChange={(e) => setOff({ ...off, date: e.target.value })} className={input} aria-label="日期" />
            {team ? (
              <select value={off.staff} onChange={(e) => setOff({ ...off, staff: e.target.value })} aria-label="適用人員" className={input}>
                <option value="">全店休息</option>
                {data.staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>只有 {s.name} 休假</option>)}
              </select>
            ) : null}
            <input value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} maxLength={60} placeholder="原因(選填,顧客看不到)" className={`${input} ${team ? 'sm:col-span-2' : ''}`} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={off.allDay} onChange={(e) => setOff({ ...off, allDay: e.target.checked })} />整天</label>
            {!off.allDay && <>
              <input type="time" step={900} value={off.start} onChange={(e) => setOff({ ...off, start: e.target.value })} className="w-[104px] rounded-lg border border-[#e5ded4] px-2 py-1.5" />
              <span className="text-[#a99e8f]">–</span>
              <input type="time" step={900} value={off.end} onChange={(e) => setOff({ ...off, end: e.target.value })} className="w-[104px] rounded-lg border border-[#e5ded4] px-2 py-1.5" />
            </>}
            <button type="button" onClick={() => void addOff()} className={`${btnDark} ml-auto`}>新增休假</button>
          </div>
        </div>
        {data.exceptions.length ? (
          <div className="mt-3 divide-y divide-[#f0ebe2]">
            {data.exceptions.map((x) => (
              <div key={x.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{formatRange(x.start_at, x.end_at)}{x.staff_id ? ` · ${data.staff.find((s) => s.id === x.staff_id)?.name ?? ''}` : team ? ' · 全店' : ''}{x.reason ? ` · ${x.reason}` : ''}</span>
                <button type="button" onClick={() => void removeOff(x)} className="shrink-0 text-xs text-[#a03b3b]">移除</button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

// ---------- 設定 ----------
export function SettingsTab({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [b, setB] = useState<BkBusiness>(data.business);
  const [saving, setSaving] = useState(false);
  const team = isTeam(data);
  const hasDeposit = data.services.some((s) => s.deposit > 0);
  async function save() {
    setSaving(true);
    try { await api('/api/mycard/booking', { method: 'PUT', body: JSON.stringify({ business: b }) }); uiToast('已儲存設定'); void reload(); }
    catch (e) { void uiAlert(errMsg(e, '儲存失敗')); }
    finally { setSaving(false); }
  }
  const num = (k: keyof BkBusiness, label: string, opts: [number, string][]) => (
    <label className="block text-xs text-[#8a7f72]">{label}
      <select value={Number(b[k])} onChange={(e) => setB({ ...b, [k]: Number(e.target.value) })} className={`${input} mt-1`}>
        {opts.map(([n, text]) => <option key={n} value={n}>{text}</option>)}
      </select>
    </label>
  );
  const unit = (list: number[], u: string): [number, string][] => list.map((n) => [n, `${n}${u}`]);
  return (
    <div className="space-y-4">
      <section className={`${card} space-y-3`}>
        <p className="font-semibold">基本資料</p>
        <label className="block text-xs text-[#8a7f72]">店名 / 工作室名稱
          <input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} maxLength={60} className={`${input} mt-1`} />
        </label>
        <label className="block text-xs text-[#8a7f72]">服務地點(確認與提醒時告訴顧客)
          <input value={b.address} onChange={(e) => setB({ ...b, address: e.target.value })} maxLength={120} placeholder="例:台北市大安區…(可只寫捷運站)" className={`${input} mt-1`} />
        </label>
        <label className="block text-xs text-[#8a7f72]">預約須知(顯示在送出前)
          <textarea value={b.notice} onChange={(e) => setB({ ...b, notice: e.target.value })} rows={4} maxLength={1000} placeholder="例:請準時到場,遲到 15 分鐘以上需改期…" className={`${input} mt-1 resize-none`} />
        </label>
      </section>
      <section className={`${card} space-y-3`}>
        <p className="font-semibold">接單規則</p>
        <div className="grid grid-cols-2 gap-2">
          {(['manual', 'auto'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setB({ ...b, approval_mode: m })} className={`rounded-xl border p-3 text-left ${b.approval_mode === m ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5ded4]'}`}>
              <span className="block text-sm font-semibold">{m === 'manual' ? '我確認後才成立' : '自動成立'}</span>
              <span className="mt-0.5 block text-[11px] text-[#8a7f72]">{m === 'manual' ? '收到申請後由你確認' : '顧客送出即成立(收訂金的服務付款後成立)'}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {b.approval_mode === 'manual' ? num('approve_hours', '確認期限', unit([1, 2, 4, 6, 12, 24, 48], ' 小時內')) : null}
          {num('slot_interval', '開始時間間隔', unit([15, 30, 60], ' 分鐘'))}
          {num('lead_minutes', '最短提前預約', [0, 60, 120, 180, 360, 720, 1440, 2880].map((n) => [n, n === 0 ? '不限制' : n < 1440 ? `${n / 60} 小時前` : `${n / 1440} 天前`]))}
          {num('advance_days', '最多可約幾天內', unit([7, 14, 30, 60, 90], ' 天'))}
          {num('buffer_minutes', '服務後整理時間', unit([0, 5, 10, 15, 20, 30, 45, 60], ' 分鐘'))}
          {num('cancel_hours', '顧客可自行取消 / 改期到服務前', unit([0, 2, 6, 12, 24, 48, 72], ' 小時'))}
          {num('reschedule_limit', '顧客可線上改期', [[0, '不開放'], [1, '1 次'], [2, '2 次'], [3, '3 次']])}
        </div>
        {team ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.allow_any_staff} onChange={(e) => setB({ ...b, allow_any_staff: e.target.checked })} />顧客可選「不指定人員」(系統安排當天較空的人)</label> : null}
      </section>
      <section className={`${card} space-y-3`}>
        <p className="font-semibold">訂金</p>
        <p className="text-xs leading-5 text-[#8a7f72]">在「服務」設定訂金金額。顧客轉帳後回報末 5 碼,你在預約按「收到訂金」核對後才成立;逾期未付自動釋放時段。訂金是總額的一部分,到店只收尾款。{hasDeposit ? '' : '目前沒有服務收訂金。'}</p>
        <label className="block text-xs text-[#8a7f72]">匯款資訊(顧客要付訂金時看到)
          <textarea value={b.payment_info} onChange={(e) => setB({ ...b, payment_info: e.target.value })} rows={3} maxLength={300} placeholder={'例:國泰世華(013)\n帳號 1234-5678-9012\n戶名 王小美'} className={`${input} mt-1 resize-none`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          {num('deposit_hours', '轉帳期限', unit([1, 2, 6, 12, 24, 48, 72], ' 小時內'))}
        </div>
      </section>
      <section className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">回饋點數</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.reward_enabled} onChange={(e) => setB({ ...b, reward_enabled: e.target.checked })} />開啟</label>
        </div>
        {b.reward_enabled ? (
          <div className="grid grid-cols-2 gap-3">
            {num('reward_rate', '每消費多少元得 1 點', [50, 100, 200, 500, 1000].map((n) => [n, `${n} 元`]))}
            {num('point_value', '1 點折抵', [1, 2, 5, 10].map((n) => [n, `${n} 元`]))}
          </div>
        ) : null}
        <p className="text-[11px] leading-5 text-[#a99e8f]">服務完成且付清後,依實收金額入帳(只付訂金不入帳;點數與套票折抵的部分不再回饋);退款會自動沖銷。購買套票時就入帳,用套票兌換不再重複回饋。完成服務時可用點數折抵。</p>
      </section>
      <PackageProducts data={data} reload={reload} />
      <section className={`${card} space-y-3`}>
        <p className="font-semibold">候補與回訪</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.waitlist_enabled} onChange={(e) => setB({ ...b, waitlist_enabled: e.target.checked })} />額滿時讓顧客登記候補</label>
        {b.waitlist_enabled ? <div className="grid grid-cols-2 gap-3">{num('waitlist_invite_minutes', '候補邀請有效', [15, 30, 60, 120, 240].map((n) => [n, n < 60 ? `${n} 分鐘` : `${n / 60} 小時`]))}</div> : null}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.thanks_enabled} onChange={(e) => setB({ ...b, thanks_enabled: e.target.checked })} />服務完成 3 小時後傳感謝訊息</label>
        {b.thanks_enabled ? <textarea value={b.thanks_message} onChange={(e) => setB({ ...b, thanks_message: e.target.value })} rows={2} maxLength={200} placeholder="例:謝謝你今天的光臨!有任何問題歡迎直接傳訊息給我們。" aria-label="感謝訊息" className={`${input} resize-none`} /> : null}
        <p className="text-[11px] leading-5 text-[#a99e8f]">回訪提醒在「服務」裡設定天數。感謝與回訪屬於行銷訊息,顧客可在預約頁關閉;顧客已再預約就不會收到回訪提醒。</p>
      </section>
      <section className={`${card} space-y-3`}>
        <p className="font-semibold">外出服務</p>
        <div className="grid grid-cols-2 gap-3">
          {num('travel_minutes', '前後交通時間(預設)', [0, 15, 30, 45, 60, 90, 120].map((n) => [n, n ? `各 ${n} 分鐘` : '不需要']))}
        </div>
        <label className="block text-xs text-[#8a7f72]">服務範圍(顯示在詢價表單)
          <input value={b.service_area} onChange={(e) => setB({ ...b, service_area: e.target.value })} maxLength={120} placeholder="例:雙北、桃園;其他地區另計車馬費" className={`${input} mt-1`} />
        </label>
        <p className="text-[11px] text-[#a99e8f]">外出服務的報價會預先帶入交通時間,可在每份報價調整;交通時間內不會排其他預約。</p>
      </section>
      <section className={`${card} space-y-2`}>
        <p className="font-semibold">LINE 提醒顧客</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.reminder_24h} onChange={(e) => setB({ ...b, reminder_24h: e.target.checked })} />服務前 24 小時</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.reminder_2h} onChange={(e) => setB({ ...b, reminder_2h: e.target.checked })} />服務前 2 小時</label>
        <p className="text-[11px] leading-5 text-[#a99e8f]">顧客需用 LINE 登入或綁定 LINE 才會收到;預約改期後提醒會跟著改,取消後不會再發。</p>
      </section>
      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 rounded-2xl border border-[#e5ded4] bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <button type="button" disabled={saving} onClick={() => void save()} className={`${btnDark} px-6 py-2.5`}>{saving ? '儲存中…' : '儲存設定'}</button>
      </div>
    </div>
  );
}
