'use client';

import { useEffect, useState } from 'react';
import {
  BUILTIN_LABELS,
  VARIABLES,
  type BotConfig,
  type BotRule,
  type Broadcast,
  type BuiltinKey,
  type RichMenu,
} from '@/lib/line-bot-types';
import type { Discount, Product } from '@/lib/types';
import { uiAlert } from '@/lib/ui-dialog';
import LinePreview from './LinePreview';
import ShopLineSettings from '../ShopLineSettings';
import MessageSetEditor from './MessageSetEditor';
import RulesPanel from './RulesPanel';
import MenuPanel from './MenuPanel';
import BroadcastPanel from './BroadcastPanel';
import StatsPanel from './StatsPanel';
import { Card, EditorWithPreview, Field, inputClass, Pills, sendTest, smallBtn, TagInput, Toggle } from './ui';

export type BotData = {
  config: BotConfig;
  rules: BotRule[];
  menus: RichMenu[];
  broadcasts: Broadcast[];
  quota: { type: string; limit: number | null; used: number; error?: string };
  followers: { followers: number; blocks: number } | null;
  ready: boolean;
  notifyStarted: boolean;
};

type Tab = 'connect' | 'welcome' | 'rules' | 'menu' | 'broadcast' | 'stats' | 'settings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'connect', label: '連線設定' },
  { key: 'welcome', label: '歡迎訊息' },
  { key: 'rules', label: '自動回覆' },
  { key: 'menu', label: '圖文選單' },
  { key: 'broadcast', label: '推播' },
  { key: 'stats', label: '數據' },
  { key: 'settings', label: '內建查詢與設定' },
];

// 後台「LINE 機器人」:主站與店家共用(資料依網域分店家)。店家多一個「連線設定」分頁(自己的 LINE 金鑰)
// 訂單通知統一在「系統設定 → 通知」設定
export default function LineBotManager({ products, coupons, logoUrl, platform = true }: { products: Product[]; coupons: Discount[]; logoUrl: string; platform?: boolean }) {
  const [data, setData] = useState<BotData | null>(null);
  const [draft, setDraft] = useState<BotConfig | null>(null);
  const [tab, setTab] = useState<Tab>(platform ? 'welcome' : 'connect');
  const tabs = TABS.filter((t) => platform ? t.key !== 'connect' : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/line-bot', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? '讀取失敗');
        setData(d);
        setDraft(d.config);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '讀取失敗'));
  }, []);

  // 店家:讀不到機器人資料時(例如資料庫尚未更新)仍可以先做連線設定
  if (error && !platform) return <div className="space-y-4"><p className="rounded-xl border border-[#f0d9b5] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5a1c]">{error}</p><ShopLineSettings /></div>;
  if (error) return <p className="rounded-xl border border-[#e5ded4] bg-white p-6 text-sm text-[#c0392b]">{error}</p>;
  if (!data || !draft) return <p className="rounded-xl border border-[#e5ded4] bg-white p-6 text-sm text-[#8a7f72]">讀取中…</p>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.config);
  const configTab = tab === 'welcome' || tab === 'settings';

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/line-bot', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: draft }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '儲存失敗');
      setData((x) => (x ? { ...x, config: d.config } : x));
      setDraft(d.config);
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  const shared = { products, coupons, logoUrl, brand: draft.brandColor };

  return (
    <div className="space-y-4 pb-20">
      {!data.ready && tab !== 'connect' ? (
        <p className="rounded-xl border border-[#f0d9b5] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5a1c]">
          {platform ? 'LINE 官方帳號還沒串接。請到「系統設定 → 串接設定」填入 Messaging API 的 Channel secret 與 Channel access token。' : 'LINE 官方帳號還沒串接。請先到「連線設定」填入你的官方帳號金鑰。'}
        </p>
      ) : null}

      <div className="flex gap-1 overflow-x-auto overflow-y-hidden rounded-xl border border-[#e5ded4] bg-white p-1 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm transition ${tab === t.key ? 'bg-[#1f1b19] font-medium text-white' : 'text-[#6b6156] hover:bg-[#f6f2ec]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'connect' ? <ShopLineSettings /> : null}
      {tab === 'welcome' ? <WelcomePanel draft={draft} setDraft={setDraft} {...shared} /> : null}
      {tab === 'rules' ? <RulesPanel rules={data.rules} onChange={(rules) => setData({ ...data, rules })} {...shared} /> : null}
      {tab === 'menu' ? <MenuPanel menus={data.menus} onChange={(menus) => setData({ ...data, menus })} /> : null}
      {tab === 'broadcast' ? (
        <BroadcastPanel broadcasts={data.broadcasts} quota={data.quota} followers={data.followers} onChange={(broadcasts) => setData({ ...data, broadcasts })} {...shared} />
      ) : null}
      {tab === 'stats' ? <StatsPanel /> : null}
      {tab === 'settings' ? <SettingsPanel draft={draft} setDraft={setDraft} ready={data.ready} platform={platform} {...shared} /> : null}

      {configTab ? (
        <div className="sticky bottom-3 z-10 flex justify-center pt-2">
          <button type="button" onClick={saveConfig} disabled={saving || !dirty} className="w-full max-w-xs rounded-full bg-[#1f1b19] py-3 text-sm font-semibold text-white shadow-lg transition disabled:bg-[#a8a29b]">
            {saving ? '儲存中…' : dirty ? '儲存設定' : '已儲存'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type Shared = { products: Product[]; coupons: Discount[]; logoUrl: string; brand: string };

function WelcomePanel({ draft, setDraft, ...shared }: { draft: BotConfig; setDraft: (c: BotConfig) => void } & Shared) {
  const [who, setWho] = useState<'guest' | 'member'>('guest');
  const key = who === 'guest' ? 'welcomeGuest' : 'welcomeMember';
  const value = draft[key];
  return (
    <Card
      title="加好友歡迎訊息"
      desc="有人加入官方 LINE 時自動傳送。還沒綁定會員和已是會員的人,可以收到不同內容。"
      action={<button type="button" onClick={() => void sendTest(value)} className={smallBtn}>傳送測試給自己</button>}
    >
      <div className="mb-4">
        <Pills value={who} options={[{ key: 'guest', label: '還沒綁定會員' }, { key: 'member', label: '已是會員' }]} onChange={setWho} />
      </div>
      <EditorWithPreview
        editor={<MessageSetEditor value={value} onChange={(v) => setDraft({ ...draft, [key]: v })} variables={VARIABLES} products={shared.products} coupons={shared.coupons} allowBind={who === 'guest'} />}
        preview={<LinePreview set={value} brand={shared.brand} products={shared.products} coupons={shared.coupons} logoUrl={shared.logoUrl} />}
      />
    </Card>
  );
}

function SettingsPanel({ draft, setDraft, ready, platform, ...shared }: { draft: BotConfig; setDraft: (c: BotConfig) => void; ready: boolean; platform: boolean } & Shared) {
  const setBuiltin = (k: BuiltinKey, patch: Partial<BotConfig['builtins'][BuiltinKey]>) => setDraft({ ...draft, builtins: { ...draft.builtins, [k]: { ...draft.builtins[k], ...patch } } });
  const webhook = 'https://www.urbanite.com.tw/api/line/webhook';
  return (
    <div className="space-y-4">
      <Card title="訂單通知" desc="訂單成立、出貨、到貨等 LINE 與 Email 通知,統一在「系統設定 → 通知」設定,通知會以訂單卡片傳送。">
        <p className="text-xs text-[#a99e8f]">下方「按鈕顏色」也會套用到訂單查詢的卡片。</p>
      </Card>

      {platform ? <Card title="串接狀態">
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${ready ? 'bg-[#2fb36b]' : 'bg-[#d9a04a]'}`} />
            {ready ? 'Messaging API 已串接' : '尚未串接(系統設定 → 串接設定)'}
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-[#faf7f2] px-3 py-2">
            <span className="shrink-0 text-xs text-[#8a7f72]">Webhook 網址</span>
            <code className="min-w-0 flex-1 truncate text-xs text-[#1f1b19]">{webhook}</code>
            <button type="button" onClick={() => navigator.clipboard?.writeText(webhook).then(() => uiAlert('已複製'))} className={smallBtn}>複製</button>
          </div>
          <p className="text-[11px] leading-5 text-[#a99e8f]">貼到 LINE Developers → Messaging API → Webhook URL,並開啟 Use webhook;LINE Official Account Manager 的「自動回應訊息」請關閉,避免重複回覆。</p>
        </div>
      </Card> : null}

      <Card title="內建查詢" desc="會員綁定後可直接在 LINE 查詢自己的資料。關鍵字只要「包含」就會觸發(會員綁定需完全符合)。">
        <div className="divide-y divide-[#f3eee7]">
          {(Object.keys(BUILTIN_LABELS) as BuiltinKey[]).map((k) => {
            const b = draft.builtins[k];
            return (
              <div key={k} className="space-y-2.5 py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#1f1b19]">{BUILTIN_LABELS[k].label}</p>
                    <p className="text-[11px] text-[#a99e8f]">{BUILTIN_LABELS[k].hint}</p>
                  </div>
                  <Toggle on={b.enabled} onChange={(v) => setBuiltin(k, { enabled: v })} label={BUILTIN_LABELS[k].label} />
                </div>
                {b.enabled ? (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Field label="觸發關鍵字"><TagInput value={b.keywords} onChange={(keywords) => setBuiltin(k, { keywords })} placeholder="按 Enter 新增" /></Field>
                    <Field label={k === 'bind' ? '未綁定時的說明' : '開頭文字(選填)'}><input value={b.intro} onChange={(e) => setBuiltin(k, { intro: e.target.value })} className={inputClass} placeholder="留空使用預設" /></Field>
                  </div>
                ) : null}
              </div>
            );
          })}
          <div className="pt-4">
            <Field label="已是會員又傳「綁定」時的回覆" hint="可用 {會員姓名}">
              <input value={draft.alreadyMember} onChange={(e) => setDraft({ ...draft, alreadyMember: e.target.value })} className={inputClass} />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        title="沒有對到關鍵字時"
        desc="關閉時不自動回覆,訊息會留給你在 LINE Official Account Manager 由真人回覆。"
        action={<Toggle on={draft.defaultReply.enabled} onChange={(v) => setDraft({ ...draft, defaultReply: { ...draft.defaultReply, enabled: v } })} label="預設回覆" />}
      >
        {draft.defaultReply.enabled ? (
          <EditorWithPreview
            editor={<MessageSetEditor value={draft.defaultReply} onChange={(v) => setDraft({ ...draft, defaultReply: { ...v, enabled: true } })} variables={VARIABLES} products={shared.products} coupons={shared.coupons} />}
            preview={<LinePreview set={draft.defaultReply} brand={shared.brand} products={shared.products} coupons={shared.coupons} userText="請問有現貨嗎?" logoUrl={shared.logoUrl} compact />}
          />
        ) : (
          <p className="text-xs text-[#a99e8f]">目前不自動回覆</p>
        )}
      </Card>

      <Card title="按鈕顏色" desc="訊息卡片的主要按鈕、優惠券金額使用的顏色。">
        <label className="flex items-center gap-3">
          <input type="color" value={draft.brandColor} onChange={(e) => setDraft({ ...draft, brandColor: e.target.value })} className="h-9 w-9 cursor-pointer rounded-lg border border-[#e5ded4] bg-white p-0.5" />
          <span className="font-mono text-xs uppercase text-[#8a7f72]">{draft.brandColor}</span>
          <span className="rounded-md px-4 py-1.5 text-xs font-semibold text-white" style={{ background: draft.brandColor }}>按鈕樣式</span>
        </label>
      </Card>
      <p className="text-center text-[11px] text-[#a99e8f]">修改後記得按下方「儲存設定」</p>
    </div>
  );
}
