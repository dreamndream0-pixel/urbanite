'use client';

import { useEffect, useState } from 'react';
import { AUDIENCE_OPTIONS, type Broadcast, type BroadcastAudience } from '@/lib/line-bot-types';
import type { Discount, Product } from '@/lib/types';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import LinePreview from './LinePreview';
import MessageSetEditor from './MessageSetEditor';
import type { BotData } from './LineBotManager';
import { Card, EditorWithPreview, Empty, Field, inputClass, primaryBtn, sendTest, smallBtn } from './ui';

const STATUS: Record<Broadcast['status'], { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-[#f3eee7] text-[#8a7f72]' },
  scheduled: { label: '已排程', cls: 'bg-[#eef3fb] text-[#3d6aa8]' },
  sending: { label: '傳送中', cls: 'bg-[#fff6e6] text-[#a8742a]' },
  sent: { label: '已送出', cls: 'bg-[#e9f7ee] text-[#1f7a44]' },
  failed: { label: '失敗', cls: 'bg-[#fbeaea] text-[#c0392b]' },
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// 推播(群發)
export default function BroadcastPanel({
  broadcasts,
  quota,
  followers,
  onChange,
  products,
  coupons,
  logoUrl,
  brand,
}: {
  broadcasts: Broadcast[];
  quota: BotData['quota'];
  followers: BotData['followers'];
  onChange: (b: Broadcast[]) => void;
  products: Product[];
  coupons: Discount[];
  logoUrl: string;
  brand: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  async function create() {
    const res = await fetch('/api/admin/line-bot/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', audience: 'members', content: { messages: [{ id: 'm1', type: 'text', text: '' }], quickReplies: [] } }),
    });
    const d = await res.json();
    if (!res.ok) return void uiAlert(d.error ?? '新增失敗');
    onChange([d as Broadcast, ...broadcasts]);
    setOpenId(d.id);
  }

  const left = quota.limit !== null ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="本月已用" value={`${quota.used} 則`} />
        <Stat label="本月剩餘" value={left === null ? (quota.type === 'none' ? '不限' : '—') : `${left} 則`} />
        <Stat label="好友人數" value={followers ? `${followers.followers - followers.blocks}` : '—'} />
      </div>
      <Card title="推播訊息" desc="主動傳送給好友,每傳給一個人算一則(多則訊息一次送出仍算一則)。推播不支援 {會員姓名} 等個人化變數。" action={<button type="button" onClick={create} className={primaryBtn}>＋ 新增推播</button>}>
        {broadcasts.length === 0 ? (
          <Empty>還沒有推播。新品上架、活動開跑時可以通知好友。</Empty>
        ) : (
          <div className="space-y-2">
            {broadcasts.map((b) => (
              <div key={b.id} className="overflow-hidden rounded-xl border border-[#ebe4da]">
                <button type="button" onClick={() => setOpenId(openId === b.id ? null : b.id)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${b.title ? 'text-[#1f1b19]' : 'text-[#b3a897]'}`}>{b.title || '未命名推播'}</span>
                    <span className="block text-[11px] text-[#a99e8f]">
                      {AUDIENCE_OPTIONS.find((a) => a.key === b.audience)?.label}
                      {b.status === 'scheduled' ? `・${fmt(b.scheduled_at)} 傳送` : ''}
                      {b.status === 'sent' ? `・${fmt(b.sent_at)} 送出・${b.recipients} 人` : ''}
                      {b.status === 'failed' ? `・${b.error}` : ''}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
                </button>
                {openId === b.id ? (
                  <BroadcastEditor
                    broadcast={b}
                    products={products}
                    coupons={coupons}
                    logoUrl={logoUrl}
                    brand={brand}
                    onSaved={(saved) => onChange(broadcasts.map((x) => (x.id === saved.id ? saved : x)))}
                    onDeleted={() => {
                      onChange(broadcasts.filter((x) => x.id !== b.id));
                      setOpenId(null);
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e5ded4] bg-white px-4 py-3">
      <p className="text-[11px] text-[#8a7f72]">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-[#1f1b19]">{value}</p>
    </div>
  );
}

function BroadcastEditor({
  broadcast,
  products,
  coupons,
  logoUrl,
  brand,
  onSaved,
  onDeleted,
}: {
  broadcast: Broadcast;
  products: Product[];
  coupons: Discount[];
  logoUrl: string;
  brand: string;
  onSaved: (b: Broadcast) => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<Broadcast>(broadcast);
  const [mode, setMode] = useState<'now' | 'schedule'>(broadcast.scheduled_at ? 'schedule' : 'now');
  const [estimate, setEstimate] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const locked = broadcast.status === 'sent' || broadcast.status === 'sending';

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/line-bot/estimate?audience=${draft.audience}`)
      .then((r) => r.json())
      .then((d) => alive && setEstimate(typeof d.count === 'number' ? d.count : null))
      .catch(() => alive && setEstimate(null));
    return () => {
      alive = false;
    };
  }, [draft.audience]);

  async function patch(body: Partial<Broadcast>): Promise<Broadcast | null> {
    const res = await fetch(`/api/admin/line-bot/broadcasts/${broadcast.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) {
      void uiAlert(d.error ?? '儲存失敗');
      return null;
    }
    onSaved(d as Broadcast);
    setDraft(d as Broadcast);
    return d as Broadcast;
  }

  async function saveDraft() {
    setBusy('儲存中…');
    await patch({ ...draft, status: 'draft', scheduled_at: mode === 'schedule' ? draft.scheduled_at : null });
    setBusy('');
  }

  async function submit() {
    if (!draft.content.messages.length) return void uiAlert('請先新增訊息內容');
    const who = AUDIENCE_OPTIONS.find((a) => a.key === draft.audience)?.label;
    const count = estimate === null ? '' : `約 ${estimate} 人,會用掉約 ${estimate} 則額度。`;
    if (mode === 'schedule') {
      if (!draft.scheduled_at || new Date(draft.scheduled_at).getTime() < Date.now()) return void uiAlert('請選擇未來的傳送時間');
      if (!(await uiConfirm(`排程在 ${fmt(draft.scheduled_at)} 傳送給「${who}」。${count}`))) return;
      setBusy('排程中…');
      await patch({ ...draft, status: 'scheduled' });
      setBusy('');
      return;
    }
    if (!(await uiConfirm(`現在傳送給「${who}」?${count}送出後無法收回。`, { danger: true }))) return;
    setBusy('傳送中…');
    const saved = await patch({ ...draft, status: 'draft', scheduled_at: null });
    if (!saved) return setBusy('');
    const res = await fetch(`/api/admin/line-bot/broadcasts/${broadcast.id}`, { method: 'POST' });
    const d = await res.json();
    setBusy('');
    if (!res.ok) return void uiAlert(d.error ?? '傳送失敗');
    onSaved(d.broadcast as Broadcast);
    setDraft(d.broadcast as Broadcast);
    void uiAlert(`已送出給 ${d.recipients} 人`);
  }

  async function remove() {
    if (!(await uiConfirm('確定刪除這則推播?', { danger: true }))) return;
    const res = await fetch(`/api/admin/line-bot/broadcasts/${broadcast.id}`, { method: 'DELETE' });
    if (!res.ok) return void uiAlert('刪除失敗');
    onDeleted();
  }

  return (
    <div className="border-t border-[#f3eee7] bg-[#fcfaf7] p-4">
      <EditorWithPreview
        editor={
          <fieldset disabled={locked} className="space-y-4 disabled:opacity-70">
            <Field label="推播名稱(只有你看得到)">
              <input value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="例如:秋季新品上架" className={inputClass} />
            </Field>
            <Field label="傳送對象" hint={estimate === null ? '' : `約 ${estimate} 人`}>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {AUDIENCE_OPTIONS.map((a) => (
                  <label key={a.key} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition ${draft.audience === a.key ? 'border-[#1f1b19] bg-white' : 'border-[#e5ded4] bg-white/60'}`}>
                    <input type="radio" className="mt-0.5 accent-[#1f1b19]" checked={draft.audience === a.key} onChange={() => setDraft({ ...draft, audience: a.key as BroadcastAudience })} />
                    <span>
                      <span className="block text-xs font-medium text-[#1f1b19]">{a.label}</span>
                      <span className="block text-[11px] text-[#a99e8f]">{a.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="訊息內容">
              <MessageSetEditor value={draft.content} onChange={(content) => setDraft({ ...draft, content })} products={products} coupons={coupons} allowBind={false} />
            </Field>
            <Field label="傳送時間">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm"><input type="radio" className="accent-[#1f1b19]" checked={mode === 'now'} onChange={() => setMode('now')} />立即傳送</label>
                <label className="flex items-center gap-1.5 text-sm"><input type="radio" className="accent-[#1f1b19]" checked={mode === 'schedule'} onChange={() => setMode('schedule')} />排程</label>
                {mode === 'schedule' ? (
                  <input type="datetime-local" value={toLocal(draft.scheduled_at)} onChange={(e) => setDraft({ ...draft, scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="rounded-lg border border-[#e5ded4] bg-white px-2.5 py-1.5 text-sm" />
                ) : null}
              </div>
              {mode === 'schedule' ? <p className="mt-1 text-[11px] text-[#a99e8f]">系統每 5 分鐘檢查一次,實際送出可能晚幾分鐘</p> : null}
            </Field>
          </fieldset>
        }
        preview={<LinePreview set={draft.content} brand={brand} products={products} coupons={coupons} logoUrl={logoUrl} compact />}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#efe8dd] pt-3">
        {!locked ? <button type="button" onClick={remove} className="text-xs text-[#c0392b] hover:underline">刪除</button> : null}
        {busy ? <span className="text-xs text-[#8a7f72]">{busy}</span> : null}
        <span className="ml-auto" />
        <button type="button" onClick={() => void sendTest(draft.content)} className={smallBtn}>傳送測試給自己</button>
        {!locked ? (
          <>
            <button type="button" onClick={saveDraft} disabled={Boolean(busy)} className={smallBtn}>{broadcast.status === 'scheduled' ? '取消排程(存草稿)' : '儲存草稿'}</button>
            <button type="button" onClick={submit} disabled={Boolean(busy)} className={primaryBtn}>{mode === 'schedule' ? '排程傳送' : '立即傳送'}</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
