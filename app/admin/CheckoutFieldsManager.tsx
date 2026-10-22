'use client';

import { useEffect, useState } from 'react';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import {
  FIELD_SCOPE_LABEL, FIELD_TYPE_LABEL, MAX_CHECKOUT_FIELDS, resolveCheckoutFields,
  type CheckoutField, type CheckoutFieldScope, type CheckoutFieldType,
} from '@/lib/checkout-fields';

type Cat = { id: string; slug: string; name: string; parent_id: string | null };
type Camp = { id: string; title?: string; name?: string; slug: string };

const blank = (): CheckoutField => ({
  id: `f-${Date.now().toString(36)}`, label: '', type: 'text', options: [], placeholder: '', required: true, active: true,
  scope: 'all', categories: [], campaigns: [], shipping: [],
});
const input = 'w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm';
const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#e5ded4] bg-white text-[#6b6156]'}`;

// 系統設定 → 結帳欄位:收件資料下方的自訂欄位(必填 / 選填、啟用 / 停用、什麼時候出現)
export default function CheckoutFieldsManager() {
  const [fields, setFields] = useState<CheckoutField[] | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [ships, setShips] = useState<string[]>([]);
  const [editing, setEditing] = useState<CheckoutField | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      setFields(resolveCheckoutFields(d?.checkout_fields));
      setShips(((d?.enabled_shipping_methods?.length ? d.enabled_shipping_methods : d?.shipping_methods) ?? []) as string[]);
    }).catch(() => setFields([]));
    fetch('/api/categories', { cache: 'no-store' }).then((r) => r.json()).then((d) => setCats(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/campaigns', { cache: 'no-store' }).then((r) => r.json()).then((d) => setCamps(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function persist(next: CheckoutField[], done = '已儲存') {
    setBusy(true);
    try {
      const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkout_fields: next }) });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? '儲存失敗');
      setFields(resolveCheckoutFields(d?.checkout_fields ?? next));
      setEditing(null);
      void uiAlert(done);
    } catch (e) { void uiAlert(e instanceof Error ? e.message : '儲存失敗'); }
    finally { setBusy(false); }
  }
  function saveEditing() {
    if (!editing || !fields) return;
    if (!editing.label.trim()) return void uiAlert('請填寫欄位名稱');
    if (editing.type === 'select' && !editing.options.length) return void uiAlert('選單至少要有一個選項');
    if (editing.scope === 'categories' && !editing.categories.length) return void uiAlert('請勾選至少一個分類');
    if (editing.scope === 'campaigns' && !editing.campaigns.length) return void uiAlert('請勾選至少一個活動');
    if (editing.scope === 'shipping' && !editing.shipping.length) return void uiAlert('請勾選至少一種配送方式');
    const exists = fields.some((f) => f.id === editing.id);
    void persist(exists ? fields.map((f) => (f.id === editing.id ? editing : f)) : [...fields, editing]);
  }
  async function remove(f: CheckoutField) {
    if (!fields || !(await uiConfirm(`刪除「${f.label}」?已成立的訂單仍會保留顧客填的內容。`, { danger: true }))) return;
    void persist(fields.filter((x) => x.id !== f.id), '已刪除');
  }
  const move = (i: number, d: number) => {
    if (!fields) return;
    const next = [...fields];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    void persist(next, '已調整順序');
  };
  // 勾上層分類時,連同子分類一起(商品可能放在子分類)
  const toggleCat = (c: Cat) => {
    if (!editing) return;
    const family = [c.slug, ...cats.filter((x) => x.parent_id === c.id).map((x) => x.slug)];
    const on = editing.categories.includes(c.slug);
    setEditing({ ...editing, categories: on ? editing.categories.filter((s) => !family.includes(s)) : [...new Set([...editing.categories, ...family])] });
  };
  const scopeText = (f: CheckoutField) => f.scope === 'all' ? '全部訂單'
    : f.scope === 'categories' ? `分類:${f.categories.map((s) => cats.find((c) => c.slug === s)?.name ?? s).join('、')}`
    : f.scope === 'campaigns' ? `活動:${f.campaigns.map((id) => { const c = camps.find((x) => x.id === id); return c?.title || c?.name || c?.slug || '已刪除的活動'; }).join('、')}`
    : `配送:${f.shipping.join('、')}`;

  if (!fields) return <p className="text-sm text-[#8a7f72]">讀取中…</p>;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e5ded4] bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold">結帳欄位</h3>
            <p className="mt-1 text-sm text-[#8a7f72]">在結帳頁「收件資料」下方加自己的欄位,例如身分證字號、希望到貨日、刻字內容。每個欄位可以設必填或選填、隨時停用,也可以只在特定分類、活動或配送方式時出現。</p>
          </div>
          {fields.length < MAX_CHECKOUT_FIELDS ? <button type="button" onClick={() => setEditing(blank())} className="shrink-0 rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white">+ 新增欄位</button> : null}
        </div>

        {editing ? (
          <div className="mt-4 space-y-3 rounded-xl bg-[#faf7f2] p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-[#8a7f72]">欄位名稱<input value={editing.label} maxLength={40} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="例:身分證字號(報關用)" className={`${input} mt-1`} /></label>
              <label className="block text-xs text-[#8a7f72]">類型
                <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as CheckoutFieldType })} className={`${input} mt-1`}>
                  {(Object.keys(FIELD_TYPE_LABEL) as CheckoutFieldType[]).map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
                </select>
              </label>
            </div>
            {editing.type === 'select' ? (
              <label className="block text-xs text-[#8a7f72]">選項(一行一個)
                <textarea rows={3} value={editing.options.join('\n')} onChange={(e) => setEditing({ ...editing, options: e.target.value.split('\n').map((x) => x.trimStart()).slice(0, 30) })} className={`${input} mt-1`} />
              </label>
            ) : editing.type !== 'date' ? (
              <label className="block text-xs text-[#8a7f72]">提示文字(選填)<input value={editing.placeholder} maxLength={80} onChange={(e) => setEditing({ ...editing, placeholder: e.target.value })} placeholder="顯示在欄位裡的灰字" className={`${input} mt-1`} /></label>
            ) : null}
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={editing.required} onChange={(e) => setEditing({ ...editing, required: e.target.checked })} />必填</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />啟用(取消勾選 = 暫時不出現)</label>
            </div>
            <div>
              <p className="text-xs text-[#8a7f72]">什麼時候出現</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(Object.keys(FIELD_SCOPE_LABEL) as CheckoutFieldScope[]).map((k) => <button key={k} type="button" onClick={() => setEditing({ ...editing, scope: k })} className={chip(editing.scope === k)}>{FIELD_SCOPE_LABEL[k]}</button>)}
              </div>
              {editing.scope === 'categories' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">{cats.filter((c) => !c.parent_id).map((c) => <button key={c.id} type="button" onClick={() => toggleCat(c)} className={chip(editing.categories.includes(c.slug))}>{c.name}</button>)}</div>
              ) : editing.scope === 'campaigns' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">{camps.length ? camps.map((c) => { const on = editing.campaigns.includes(c.id); return <button key={c.id} type="button" onClick={() => setEditing({ ...editing, campaigns: on ? editing.campaigns.filter((x) => x !== c.id) : [...editing.campaigns, c.id] })} className={chip(on)}>{c.title || c.name || c.slug}</button>; }) : <span className="text-xs text-[#a99e8f]">還沒有活動頁</span>}</div>
              ) : editing.scope === 'shipping' ? (
                <div className="mt-2 flex flex-wrap gap-1.5">{ships.map((m) => { const on = editing.shipping.includes(m); return <button key={m} type="button" onClick={() => setEditing({ ...editing, shipping: on ? editing.shipping.filter((x) => x !== m) : [...editing.shipping, m] })} className={chip(on)}>{m}</button>; })}</div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-[#d7c9bd] bg-white px-4 py-2 text-sm">取消</button>
              <button type="button" disabled={busy} onClick={saveEditing} className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? '儲存中…' : '儲存欄位'}</button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 divide-y divide-[#f0ebe2]">
          {!fields.length ? <p className="py-6 text-center text-sm text-[#a99e8f]">還沒有自訂欄位,結帳頁只有基本的收件資料。</p> : fields.map((f, i) => (
            <div key={f.id} className={`flex flex-wrap items-center gap-2 py-3 ${f.active ? '' : 'opacity-55'}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{f.label}<span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${f.required ? 'bg-[#fbe9e3] text-[#9a4a36]' : 'bg-[#f3ede4] text-[#6b6156]'}`}>{f.required ? '必填' : '選填'}</span>{!f.active ? <span className="ml-1 rounded-full bg-[#eee] px-2 py-0.5 text-[11px] text-[#777]">停用中</span> : null}</p>
                <p className="truncate text-xs text-[#8a7f72]">{FIELD_TYPE_LABEL[f.type]} · {scopeText(f)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" disabled={busy} onClick={() => void persist(fields.map((x) => (x.id === f.id ? { ...x, required: !x.required } : x)), f.required ? '已改為選填' : '已改為必填')} className="rounded-full border border-[#d7c9bd] bg-white px-3 py-1 text-xs">{f.required ? '改選填' : '改必填'}</button>
                <button type="button" disabled={busy} onClick={() => void persist(fields.map((x) => (x.id === f.id ? { ...x, active: !x.active } : x)), f.active ? '已停用' : '已啟用')} className="rounded-full border border-[#d7c9bd] bg-white px-3 py-1 text-xs">{f.active ? '停用' : '啟用'}</button>
                <button type="button" onClick={() => setEditing({ ...f })} className="rounded-full border border-[#d7c9bd] bg-white px-3 py-1 text-xs">編輯</button>
                <button type="button" disabled={i === 0 || busy} onClick={() => move(i, -1)} aria-label="上移" className="px-1 text-sm disabled:opacity-30">↑</button>
                <button type="button" disabled={i === fields.length - 1 || busy} onClick={() => move(i, 1)} aria-label="下移" className="px-1 text-sm disabled:opacity-30">↓</button>
                <button type="button" onClick={() => void remove(f)} className="px-1 text-xs text-[#a03b3b]">刪除</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
