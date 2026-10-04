'use client';

import { useRef, useState } from 'react';
import {
  blankCard,
  blankMessage,
  MAX_CARD_BUTTONS,
  MAX_CAROUSEL,
  MAX_MESSAGES,
  MAX_QUICK_REPLIES,
  MESSAGE_TYPES,
  PAGE_OPTIONS,
  type BotAction,
  type BotCard,
  type BotMessage,
  type MessageSet,
} from '@/lib/line-bot-types';
import type { Discount, Product } from '@/lib/types';
import { uiAlert } from '@/lib/ui-dialog';
import { Field, inputClass, smallBtn, Svg, TagInput, uploadBotImage } from './ui';

const formatter = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });

// 一組訊息(最多 5 則)+ 快速回覆按鈕的編輯器
export default function MessageSetEditor({
  value,
  onChange,
  products,
  coupons,
  variables = [],
  allowBind = true,
}: {
  value: MessageSet;
  onChange: (v: MessageSet) => void;
  products: Product[];
  coupons: Discount[];
  variables?: string[];
  allowBind?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const setMessages = (messages: BotMessage[]) => onChange({ ...value, messages });
  const update = (i: number, m: BotMessage) => setMessages(value.messages.map((x, j) => (j === i ? m : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.messages.length) return;
    const next = [...value.messages];
    [next[i], next[j]] = [next[j], next[i]];
    setMessages(next);
  };
  const types = MESSAGE_TYPES.filter((t) => allowBind || t.type !== 'bind');

  return (
    <div className="space-y-3">
      {value.messages.map((m, i) => (
        <div key={m.id} className="rounded-xl border border-[#ebe4da] bg-[#fcfaf7]">
          <div className="flex items-center gap-2 border-b border-[#f0eae1] px-3 py-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1f1b19] text-[10px] font-semibold text-white">{i + 1}</span>
            <span className="text-xs font-medium text-[#1f1b19]">{MESSAGE_TYPES.find((t) => t.type === m.type)?.label}</span>
            <span className="ml-auto flex items-center gap-0.5 text-[#8a7f72]">
              <button type="button" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 hover:bg-[#efe8dd] disabled:opacity-30"><Svg size={14}><path d="M6 15l6-6 6 6" /></Svg></button>
              <button type="button" aria-label="下移" disabled={i === value.messages.length - 1} onClick={() => move(i, 1)} className="rounded p-1 hover:bg-[#efe8dd] disabled:opacity-30"><Svg size={14}><path d="M6 9l6 6 6-6" /></Svg></button>
              <button type="button" aria-label="刪除" onClick={() => setMessages(value.messages.filter((_, j) => j !== i))} className="rounded p-1 hover:bg-[#fbeaea] hover:text-[#c0392b]"><Svg size={14}><path d="M5 7h14M9.5 7V5h5v2M7 7l.8 12h8.4L17 7" /></Svg></button>
            </span>
          </div>
          <div className="p-3">
            <MessageBody message={m} onChange={(next) => update(i, next)} products={products} coupons={coupons} variables={variables} />
          </div>
        </div>
      ))}

      {value.messages.length < MAX_MESSAGES ? (
        adding ? (
          <div className="rounded-xl border border-[#e5ded4] bg-white p-2.5">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {types.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    setMessages([...value.messages, blankMessage(t.type)]);
                    setAdding(false);
                  }}
                  className="rounded-lg border border-[#efe8dd] px-2.5 py-2 text-left transition hover:border-[#1f1b19]/30 hover:bg-[#faf7f2]"
                >
                  <span className="block text-xs font-medium text-[#1f1b19]">{t.label}</span>
                  <span className="block text-[10px] text-[#a99e8f]">{t.hint}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setAdding(false)} className="mt-2 w-full text-center text-xs text-[#8a7f72]">取消</button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="w-full rounded-xl border border-dashed border-[#c9bcad] py-2.5 text-sm text-[#1f1b19] transition hover:bg-[#faf7f2]">
            ＋ 新增訊息({value.messages.length}/{MAX_MESSAGES})
          </button>
        )
      ) : (
        <p className="text-center text-[11px] text-[#a99e8f]">LINE 一次最多回覆 5 則訊息</p>
      )}

      <Field label="快速回覆按鈕" hint={`顯示在最後一則訊息下方,點了會送出文字・最多 ${MAX_QUICK_REPLIES} 個`}>
        <TagInput value={value.quickReplies} onChange={(quickReplies) => onChange({ ...value, quickReplies })} placeholder="例如:訂單查詢(按 Enter 新增)" max={MAX_QUICK_REPLIES} />
      </Field>
    </div>
  );
}

function MessageBody({
  message: m,
  onChange,
  products,
  coupons,
  variables,
}: {
  message: BotMessage;
  onChange: (m: BotMessage) => void;
  products: Product[];
  coupons: Discount[];
  variables: string[];
}) {
  if (m.type === 'text') return <TextEditor text={m.text} onChange={(text) => onChange({ ...m, text })} variables={variables} />;
  if (m.type === 'image') {
    return (
      <div className="flex items-center gap-3">
        <ImagePicker url={m.url} onChange={(url) => onChange({ ...m, url })} />
        <p className="text-[11px] leading-5 text-[#a99e8f]">建議寬 1040px 以上,JPG / PNG,10MB 以內</p>
      </div>
    );
  }
  if (m.type === 'card') return <CardEditor card={m.card} onChange={(card) => onChange({ ...m, card })} variables={variables} />;
  if (m.type === 'carousel') {
    return (
      <div className="space-y-3">
        {m.cards.map((c, i) => (
          <div key={i} className="rounded-lg border border-[#ebe4da] bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#8a7f72]">第 {i + 1} 頁</span>
              {m.cards.length > 1 ? (
                <button type="button" onClick={() => onChange({ ...m, cards: m.cards.filter((_, j) => j !== i) })} className="text-[11px] text-[#c0392b]">移除</button>
              ) : null}
            </div>
            <CardEditor card={c} onChange={(card) => onChange({ ...m, cards: m.cards.map((x, j) => (j === i ? card : x)) })} variables={variables} />
          </div>
        ))}
        {m.cards.length < MAX_CAROUSEL ? (
          <button type="button" onClick={() => onChange({ ...m, cards: [...m.cards, blankCard()] })} className={smallBtn}>＋ 新增一頁</button>
        ) : null}
      </div>
    );
  }
  if (m.type === 'products') return <ProductPicker ids={m.productIds} onChange={(productIds) => onChange({ ...m, productIds })} products={products} />;
  if (m.type === 'coupon') {
    const active = coupons.filter((c) => c.active !== false);
    return (
      <Field label="優惠券" hint="客人按「領取優惠券」會到會員中心領取">
        <select value={m.couponId} onChange={(e) => onChange({ ...m, couponId: e.target.value })} className={inputClass}>
          <option value="">選擇優惠券</option>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.code}({c.code})
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return <p className="text-xs leading-5 text-[#8a7f72]">顯示「新會員 LINE 一鍵加入」與「已有官網帳號,綁定」兩個按鈕。已經綁定的會員不會看到這則。</p>;
}

function TextEditor({ text, onChange, variables }: { text: string; onChange: (t: string) => void; variables: string[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function insert(v: string) {
    const el = ref.current;
    if (!el) return onChange(text + v);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    onChange(text.slice(0, start) + v + text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + v.length, start + v.length);
    });
  }
  return (
    <div>
      <textarea ref={ref} value={text} onChange={(e) => onChange(e.target.value)} rows={4} maxLength={5000} placeholder="輸入訊息內容" className={`${inputClass} resize-y leading-6`} />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {variables.map((v) => (
          <button key={v} type="button" onClick={() => insert(v)} className="rounded-md bg-[#f3eee7] px-2 py-0.5 text-[11px] text-[#6b6156] hover:bg-[#ebe3d7]">
            {v}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-[#a99e8f]">{text.length}/5000</span>
      </div>
    </div>
  );
}

function ImagePicker({ url, onChange, wide = false }: { url: string; onChange: (u: string) => void; wide?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#e5ded4] bg-white ${wide ? 'h-16 w-24' : 'h-16 w-16'}`}>
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="text-[10px] text-[#b3a897]">無圖片</span>}
      </span>
      <label className={`${smallBtn} cursor-pointer`}>
        {busy ? '上傳中…' : url ? '更換' : '上傳圖片'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            try {
              onChange(await uploadBotImage(f));
            } catch (err) {
              void uiAlert(err instanceof Error ? err.message : '上傳失敗');
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {url ? <button type="button" onClick={() => onChange('')} className="text-[11px] text-[#8a7f72]">移除</button> : null}
    </div>
  );
}

export function ActionEditor({ action, onChange }: { action: BotAction; onChange: (a: BotAction) => void }) {
  return (
    <div className="flex min-w-0 flex-1 gap-1.5">
      <select
        value={action.type}
        onChange={(e) => {
          const t = e.target.value as BotAction['type'];
          onChange(t === 'page' ? { type: 'page', value: 'home' } : { type: t, value: '' });
        }}
        className="w-[6.5rem] shrink-0 rounded-lg border border-[#e5ded4] bg-white px-2 py-2 text-xs outline-none"
      >
        <option value="page">官網頁面</option>
        <option value="url">網址</option>
        <option value="keyword">傳送文字</option>
      </select>
      {action.type === 'page' ? (
        <select value={action.value} onChange={(e) => onChange({ type: 'page', value: e.target.value as typeof action.value })} className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] bg-white px-2 py-2 text-xs outline-none">
          {PAGE_OPTIONS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      ) : (
        <input
          value={action.value}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
          placeholder={action.type === 'url' ? 'https://…' : '例如:訂單查詢'}
          className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] bg-white px-2.5 py-2 text-xs outline-none focus:border-[#1f1b19]/40"
        />
      )}
    </div>
  );
}

function CardEditor({ card, onChange, variables }: { card: BotCard; onChange: (c: BotCard) => void; variables: string[] }) {
  return (
    <div className="space-y-2.5">
      <Field label="圖片(選填)" hint="比例約 20:13,建議 1040×676">
        <ImagePicker url={card.image} onChange={(image) => onChange({ ...card, image })} wide />
      </Field>
      <Field label="標題" hint={`${card.title.length}/80`}>
        <input value={card.title} maxLength={80} onChange={(e) => onChange({ ...card, title: e.target.value })} placeholder="例如:秋季新品上架" className={inputClass} />
      </Field>
      <Field label="內容" hint={variables.length ? `可用 ${variables.join(' ')}` : undefined}>
        <textarea value={card.body} maxLength={500} rows={2} onChange={(e) => onChange({ ...card, body: e.target.value })} placeholder="簡短說明" className={`${inputClass} resize-y leading-6`} />
      </Field>
      <Field label="按鈕" hint={`最多 ${MAX_CARD_BUTTONS} 個,第一個為主要按鈕`}>
        <div className="space-y-1.5">
          {card.buttons.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap">
              <input
                value={b.label}
                maxLength={20}
                onChange={(e) => onChange({ ...card, buttons: card.buttons.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                placeholder="按鈕文字"
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-2.5 py-2 text-xs outline-none focus:border-[#1f1b19]/40 sm:w-28"
              />
              <ActionEditor action={b.action} onChange={(action) => onChange({ ...card, buttons: card.buttons.map((x, j) => (j === i ? { ...x, action } : x)) })} />
              <button type="button" aria-label="移除按鈕" onClick={() => onChange({ ...card, buttons: card.buttons.filter((_, j) => j !== i) })} className="shrink-0 rounded p-1.5 text-[#a99e8f] hover:text-[#c0392b]">
                <Svg size={14}><path d="M6 6l12 12M18 6L6 18" /></Svg>
              </button>
            </div>
          ))}
          {card.buttons.length < MAX_CARD_BUTTONS ? (
            <button type="button" onClick={() => onChange({ ...card, buttons: [...card.buttons, { label: '', action: { type: 'page', value: 'home' } }] })} className={smallBtn}>＋ 按鈕</button>
          ) : null}
        </div>
      </Field>
    </div>
  );
}

function ProductPicker({ ids, onChange, products }: { ids: string[]; onChange: (ids: string[]) => void; products: Product[] }) {
  const [q, setQ] = useState('');
  const chosen = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[];
  const matches = q.trim()
    ? products.filter((p) => p.status !== '已下架' && !ids.includes(p.id) && `${p.name} ${p.id}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];
  return (
    <div className="space-y-2">
      {chosen.length ? (
        <div className="space-y-1.5">
          {chosen.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-[#ebe4da] bg-white p-2">
              <span className="aspect-[4/5] w-9 shrink-0 overflow-hidden rounded bg-[#f6f2ec]">{p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}</span>
              <span className="min-w-0 flex-1 truncate text-xs">{p.name}</span>
              <span className="text-[11px] text-[#8a7f72]">{formatter.format(p.price)}</span>
              <button type="button" aria-label="上移" disabled={i === 0} onClick={() => { const n = [...ids]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }} className="p-1 text-[#a99e8f] disabled:opacity-30"><Svg size={13}><path d="M6 15l6-6 6 6" /></Svg></button>
              <button type="button" aria-label="移除" onClick={() => onChange(ids.filter((x) => x !== p.id))} className="p-1 text-[#a99e8f] hover:text-[#c0392b]"><Svg size={13}><path d="M6 6l12 12M18 6L6 18" /></Svg></button>
            </div>
          ))}
        </div>
      ) : null}
      {ids.length < 10 ? (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`搜尋商品名稱加入(${ids.length}/10)`} className={inputClass} />
          {matches.length ? (
            <div className="divide-y divide-[#f3eee7] overflow-hidden rounded-lg border border-[#efe8dd] bg-white">
              {matches.map((p) => (
                <button key={p.id} type="button" onClick={() => { onChange([...ids, p.id]); setQ(''); }} className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-xs hover:bg-[#faf7f2]">
                  <span className="aspect-[4/5] w-7 shrink-0 overflow-hidden rounded bg-[#f6f2ec]">{p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-[#8a7f72]">{formatter.format(p.price)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      <p className="text-[11px] text-[#a99e8f]">商品圖、名稱、價格會在傳送時自動帶入最新資料,下架的商品不會顯示</p>
    </div>
  );
}
