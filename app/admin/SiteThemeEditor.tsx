'use client';

import { useState, type CSSProperties } from 'react';
import {
  COLOR_FIELDS,
  LAYOUT_OPTIONS,
  resolveSiteTheme,
  SITE_TEMPLATES,
  type ColorKey,
  type SiteLayout,
  type SiteTheme,
} from '@/lib/site-theme';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

// 後台 系統設定 → 一般設定 → 網站外觀:6 種樣板+全部顏色選擇器+版面配置,即時預覽
export default function SiteThemeEditor({ initial }: { initial: unknown }) {
  const [saved, setSaved] = useState<SiteTheme>(() => resolveSiteTheme(initial));
  const [draft, setDraft] = useState<SiteTheme>(saved);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const setColor = (key: ColorKey, value: string) => setDraft({ ...draft, template: 'custom', colors: { ...draft.colors, [key]: value } });
  const setLayout = (patch: Partial<SiteLayout>) => setDraft({ ...draft, template: 'custom', layout: { ...draft.layout, ...patch } });

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_theme: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '儲存失敗');
      const next = resolveSiteTheme(data.site_theme);
      setSaved(next);
      setDraft(next);
      void uiAlert('網站外觀已更新,前台重新整理後就會套用。');
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!(await uiConfirm('恢復成預設的經典米白配色與版面?'))) return;
    const t = SITE_TEMPLATES[0];
    setDraft({ template: t.key, colors: { ...t.colors }, layout: { ...t.layout } });
  }

  return (
    <section className="rounded-xl border border-[#e5ded4] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">網站外觀</h2>
          <p className="mt-1 text-xs text-[#8a7f72]">選一個樣板快速套用,或自行調整每一個顏色與版面。儲存後前台全站套用。</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={reset} className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm text-[#6b6156] hover:bg-[#f6f2ec]">恢復預設</button>
          <button type="button" onClick={save} disabled={saving || !dirty} className="rounded-full bg-[#1f1b19] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {saving ? '儲存中…' : dirty ? '儲存外觀' : '已儲存'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* 樣板 */}
          <div>
            <p className="mb-2 text-sm font-semibold">樣板</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {SITE_TEMPLATES.map((t) => {
                const selected = draft.template === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setDraft({ template: t.key, colors: { ...t.colors }, layout: { ...t.layout } })}
                    className={`overflow-hidden rounded-xl border text-left transition ${selected ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/15' : 'border-[#e5ded4] hover:border-[#1f1b19]/30'}`}
                  >
                    <div className="pointer-events-none h-36 overflow-hidden">
                      <div className="origin-top-left scale-[0.5]" style={{ width: '200%' }}>
                        <StorePreview theme={{ template: t.key, colors: t.colors, layout: t.layout }} compact />
                      </div>
                    </div>
                    <div className="border-t border-[#efe8dd] bg-white px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t.name}</span>
                        {selected ? <span className="text-xs text-[#1f7a44]">使用中</span> : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#a99e8f]">{t.note}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {draft.template === 'custom' ? <p className="mt-2 text-xs text-[#8a7f72]">目前為自訂配色</p> : null}
          </div>

          {/* 版面配置 */}
          <div className="space-y-4">
            <p className="text-sm font-semibold">版面配置</p>
            <OptionRow label="商品卡樣式" value={draft.layout.card} options={LAYOUT_OPTIONS.card} onChange={(v) => setLayout({ card: v })} />
            <OptionRow label="商品欄數" value={draft.layout.columns} options={LAYOUT_OPTIONS.columns} onChange={(v) => setLayout({ columns: v })} />
            <OptionRow label="圓角" value={draft.layout.radius} options={LAYOUT_OPTIONS.radius} onChange={(v) => setLayout({ radius: v })} />
            <OptionRow label="標題字體" value={draft.layout.heading} options={LAYOUT_OPTIONS.heading} onChange={(v) => setLayout({ heading: v })} />
          </div>

          {/* 顏色 */}
          <div>
            <p className="mb-2 text-sm font-semibold">配色</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {COLOR_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-3 rounded-xl border border-[#efe8dd] px-3 py-2">
                  <input
                    type="color"
                    value={draft.colors[f.key]}
                    onChange={(e) => setColor(f.key, e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-[#e5ded4] bg-white p-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{f.label}</span>
                    <span className="block truncate text-[11px] text-[#a99e8f]">{f.hint}</span>
                  </span>
                  <span className="font-mono text-xs uppercase text-[#a99e8f]">{draft.colors[f.key]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* 即時預覽 */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-center text-xs text-[#a99e8f]">即時預覽</p>
          <div className="overflow-hidden rounded-[28px] border-[8px] border-[#1f1b19]">
            <StorePreview theme={draft} />
          </div>
        </div>
      </div>
    </section>
  );
}

function OptionRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-[#8a7f72]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition ${value === o.key ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] text-[#5f5852] hover:border-[#1f1b19]/30'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 前台縮小示意:頁首、分類列、商品卡(依配色與版面配置)
function StorePreview({ theme, compact = false }: { theme: SiteTheme; compact?: boolean }) {
  const c = theme.colors;
  const l = theme.layout;
  const cols = l.columns === '1-3' ? 1 : 2;
  const cardRadius = l.radius === 'square' ? 0 : l.radius === 'round' ? 18 : 8;
  const imgRadius = l.radius === 'square' ? 0 : l.radius === 'round' ? 12 : 6;
  const serif = l.heading === 'serif' ? { fontFamily: "'Noto Serif TC', serif" } : undefined;
  const cardStyle: CSSProperties =
    l.card === 'plain'
      ? { background: 'transparent', padding: 0 }
      : l.card === 'bordered'
        ? { background: c.card, border: `1px solid ${c.border}`, padding: 8, borderRadius: cardRadius }
        : l.card === 'elevated'
          ? { background: c.card, boxShadow: '0 10px 24px rgba(0,0,0,0.1)', padding: 8, borderRadius: cardRadius }
          : { background: c.card, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: 8, borderRadius: cardRadius };
  const items = compact ? [0, 1] : cols === 1 ? [0, 1] : [0, 1, 2, 3];
  const swatch = ['#d9cbb8', '#b7c4cf', '#d8b4b4', '#c9d3bf'];
  return (
    <div style={{ background: c.bg, color: c.text }}>
      <div className="flex items-center justify-between px-3 py-2.5" style={{ background: c.header, borderBottom: `1px solid ${c.border}` }}>
        <span className="text-[13px]" style={{ color: c.text }}>☰</span>
        <span className="text-sm font-bold tracking-[0.08em]" style={serif}>urbanite</span>
        <span className="text-[13px]" style={{ color: c.text }}>⌂</span>
      </div>
      <div className="flex gap-3 px-3 py-2 text-[10px]" style={{ background: c.header, borderBottom: `1px solid ${c.border}`, color: c.text2 }}>
        <span className="border-b-2 pb-0.5 font-semibold" style={{ color: c.brand, borderColor: c.brand }}>全部商品</span>
        <span>上衣</span>
        <span>褲裝</span>
        <span>配件</span>
      </div>
      <div className="px-3 pb-4 pt-3">
        <p className="mb-2 text-sm font-semibold" style={serif}>全部商品</p>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {items.map((i) => (
            <div key={i} style={cardStyle}>
              <div className={cols === 1 ? 'aspect-[4/3]' : 'aspect-[4/5]'} style={{ background: c.surface, borderRadius: imgRadius }}>
                <div className="h-full w-full opacity-80" style={{ background: `radial-gradient(circle at 50% 55%, ${swatch[i % 4]} 0 34%, transparent 35%)` }} />
              </div>
              <p className="mt-1.5 truncate text-[10px] font-semibold" style={serif}>城市印花 T-shirt</p>
              <p className="truncate text-[9px]" style={{ color: c.muted }}>純棉 · 寬鬆版型</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold">
                  NT$590 <span className="font-normal line-through" style={{ color: c.muted }}>790</span>
                </span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px]" style={{ background: c.button, color: c.buttonText }}>＋</span>
              </div>
            </div>
          ))}
        </div>
        {!compact ? (
          <div className="mt-3 space-y-2">
            <div className="rounded-full py-2 text-center text-[11px] font-semibold" style={{ background: c.button, color: c.buttonText }}>加入購物車</div>
            <div className="rounded-full py-2 text-center text-[11px]" style={{ border: `1px solid ${c.borderStrong}`, color: c.text, background: c.surface }}>查看全部</div>
            <p className="text-center text-[10px]">
              <span style={{ color: c.sale }}>限時特價</span> · <span style={{ color: c.gold }}>會員優惠</span> · <span style={{ color: c.text2 }}>免運門檻 NT$1,500</span>
            </p>
          </div>
        ) : null}
      </div>
      <div className="px-3 py-2 text-center text-[9px]" style={{ background: c.header, borderTop: `1px solid ${c.border}`, color: c.muted }}>© Urbanite</div>
    </div>
  );
}
