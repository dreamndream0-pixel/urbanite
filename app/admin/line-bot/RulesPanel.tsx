'use client';

import { useState } from 'react';
import { VARIABLES, WEEKDAYS, type BotRule, type RuleSchedule } from '@/lib/line-bot-types';
import type { Discount, Product } from '@/lib/types';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import LinePreview from './LinePreview';
import MessageSetEditor from './MessageSetEditor';
import { Card, EditorWithPreview, Empty, Field, inputClass, Pills, primaryBtn, sendTest, smallBtn, Svg, TagInput, Toggle } from './ui';

const scheduleText = (s: RuleSchedule | null) => {
  if (!s) return '全天';
  const days = s.days.length === 0 || s.days.length === 7 ? '每天' : `週${s.days.map((d) => WEEKDAYS[d]).join('、')}`;
  return `${days} ${s.start}–${s.end}`;
};

// 關鍵字自動回覆
export default function RulesPanel({
  rules,
  onChange,
  products,
  coupons,
  logoUrl,
  brand,
}: {
  rules: BotRule[];
  onChange: (r: BotRule[]) => void;
  products: Product[];
  coupons: Discount[];
  logoUrl: string;
  brand: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  async function create() {
    const res = await fetch('/api/admin/line-bot/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', keywords: [], match: 'contains', content: { messages: [{ id: 'm1', type: 'text', text: '' }], quickReplies: [] }, enabled: false }),
    });
    const d = await res.json();
    if (!res.ok) return void uiAlert(d.error ?? '新增失敗');
    onChange([d as BotRule, ...rules]);
    setOpenId(d.id);
  }

  async function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    await fetch('/api/admin/line-bot/rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: next.map((r) => r.id) }) });
  }

  async function toggle(rule: BotRule, enabled: boolean) {
    onChange(rules.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
    await fetch(`/api/admin/line-bot/rules/${rule.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
  }

  return (
    <Card
      title="關鍵字自動回覆"
      desc="客人傳的訊息符合關鍵字時自動回覆。「完全符合」的規則會比內建查詢優先;「包含」的規則排在內建查詢之後。多條規則都符合時,以排在上面的為準。"
      action={<button type="button" onClick={create} className={primaryBtn}>＋ 新增規則</button>}
    >
      {rules.length === 0 ? (
        <Empty>還沒有自動回覆規則。可以先建一條「營業時間」或「運費」的常見問題。</Empty>
      ) : (
        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={r.id} className="overflow-hidden rounded-xl border border-[#ebe4da]">
              <div className="flex items-center gap-3 px-3.5 py-3">
                <div className="flex flex-col text-[#b3a897]">
                  <button type="button" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30"><Svg size={13}><path d="M6 15l6-6 6 6" /></Svg></button>
                  <button type="button" aria-label="下移" disabled={i === rules.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30"><Svg size={13}><path d="M6 9l6 6 6-6" /></Svg></button>
                </div>
                <button type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)} className="min-w-0 flex-1 text-left">
                  <p className={`truncate text-sm ${r.name || r.keywords.length ? 'text-[#1f1b19]' : 'text-[#b3a897]'}`}>{r.name || r.keywords.join('、') || '未命名規則'}</p>
                  <p className="truncate text-[11px] text-[#a99e8f]">
                    {r.match === 'exact' ? '完全符合' : '包含'}・{r.keywords.length ? r.keywords.join('、') : '尚未設定關鍵字'}・{scheduleText(r.schedule)}・觸發 {r.hits} 次
                  </p>
                </button>
                <Toggle on={r.enabled} onChange={(v) => void toggle(r, v)} label="啟用" />
              </div>
              {openId === r.id ? (
                <RuleEditor
                  rule={r}
                  products={products}
                  coupons={coupons}
                  logoUrl={logoUrl}
                  brand={brand}
                  onSaved={(saved) => onChange(rules.map((x) => (x.id === saved.id ? saved : x)))}
                  onDeleted={() => {
                    onChange(rules.filter((x) => x.id !== r.id));
                    setOpenId(null);
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RuleEditor({
  rule,
  products,
  coupons,
  logoUrl,
  brand,
  onSaved,
  onDeleted,
}: {
  rule: BotRule;
  products: Product[];
  coupons: Discount[];
  logoUrl: string;
  brand: string;
  onSaved: (r: BotRule) => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<BotRule>(rule);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rule);

  async function save() {
    if (!draft.keywords.length) return void uiAlert('請至少設定一個關鍵字');
    if (!draft.content.messages.length) return void uiAlert('請至少新增一則回覆訊息');
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/line-bot/rules/${rule.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '儲存失敗');
      onSaved(d as BotRule);
      setDraft(d as BotRule);
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await uiConfirm('確定刪除這條自動回覆?', { danger: true }))) return;
    const res = await fetch(`/api/admin/line-bot/rules/${rule.id}`, { method: 'DELETE' });
    if (!res.ok) return void uiAlert('刪除失敗');
    onDeleted();
  }

  const sched = draft.schedule;
  const setSched = (patch: Partial<RuleSchedule>) => setDraft({ ...draft, schedule: { days: [], start: '18:00', end: '11:00', ...(sched ?? {}), ...patch } });

  return (
    <div className="border-t border-[#f3eee7] bg-[#fcfaf7] p-4">
      <EditorWithPreview
        editor={
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="規則名稱(只有你看得到)">
                <input value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例如:運費說明" className={inputClass} />
              </Field>
              <Field label="比對方式">
                <Pills value={draft.match} options={[{ key: 'contains', label: '包含關鍵字' }, { key: 'exact', label: '完全符合' }]} onChange={(match) => setDraft({ ...draft, match })} />
              </Field>
            </div>
            <Field label="關鍵字" hint="按 Enter 新增,可設定多個">
              <TagInput value={draft.keywords} onChange={(keywords) => setDraft({ ...draft, keywords })} placeholder="例如:運費、免運" />
            </Field>
            <div className="rounded-lg border border-[#ebe4da] bg-white p-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#1f1b19]">只在特定時段回覆</span>
                <Toggle on={Boolean(sched)} onChange={(v) => setDraft({ ...draft, schedule: v ? { days: [], start: '18:00', end: '11:00' } : null })} label="指定時段" />
                <span className="ml-auto text-[11px] text-[#a99e8f]">例:下班時間自動回覆</span>
              </div>
              {sched ? (
                <div className="mt-3 space-y-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((d, i) => {
                      const on = sched.days.includes(i);
                      return (
                        <button key={d} type="button" onClick={() => setSched({ days: on ? sched.days.filter((x) => x !== i) : [...sched.days, i].sort() })} className={`h-8 w-8 rounded-full text-xs transition ${on ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] text-[#6b6156]'}`}>
                          {d}
                        </button>
                      );
                    })}
                    <span className="self-center text-[11px] text-[#a99e8f]">{sched.days.length ? '' : '(不選 = 每天)'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="time" value={sched.start} onChange={(e) => setSched({ start: e.target.value })} className="rounded-lg border border-[#e5ded4] bg-white px-2.5 py-1.5 text-sm" />
                    <span className="text-xs text-[#8a7f72]">到</span>
                    <input type="time" value={sched.end} onChange={(e) => setSched({ end: e.target.value })} className="rounded-lg border border-[#e5ded4] bg-white px-2.5 py-1.5 text-sm" />
                    <span className="text-[11px] text-[#a99e8f]">可跨午夜</span>
                  </div>
                </div>
              ) : null}
            </div>
            <Field label="回覆內容">
              <MessageSetEditor value={draft.content} onChange={(content) => setDraft({ ...draft, content })} variables={VARIABLES} products={products} coupons={coupons} />
            </Field>
            <div className="flex flex-wrap items-center gap-2 border-t border-[#efe8dd] pt-3">
              <button type="button" onClick={remove} className="text-xs text-[#c0392b] hover:underline">刪除規則</button>
              <button type="button" onClick={() => void sendTest(draft.content)} className={`${smallBtn} ml-auto`}>傳送測試給自己</button>
              <button type="button" onClick={save} disabled={saving || !dirty} className={primaryBtn}>{saving ? '儲存中…' : dirty ? '儲存' : '已儲存'}</button>
            </div>
          </div>
        }
        preview={<LinePreview set={draft.content} brand={brand} products={products} coupons={coupons} userText={draft.keywords[0] || '(客人的訊息)'} logoUrl={logoUrl} compact />}
      />
    </div>
  );
}
