'use client';

import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LinkIcon, { LINK_ICONS } from '@/app/components/LinkIcon';
import {
  DEFAULT_MENU_DESIGN,
  defaultCells,
  MENU_LAYOUTS,
  MENU_SIZE,
  type MenuCell,
  type MenuSize,
  type RichMenu,
} from '@/lib/line-bot-types';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { ActionEditor } from './MessageSetEditor';
import { Card, Field, inputClass, Pills, primaryBtn, smallBtn, uploadBlob } from './ui';

const AUDIENCES = [
  { key: 'guest' as const, label: '非會員選單', hint: '還沒綁定會員的好友看到的選單' },
  { key: 'member' as const, label: '會員選單', hint: '綁定會員後自動換成這個選單' },
];

// 圖文選單(聊天室下方)
export default function MenuPanel({ menus, onChange }: { menus: RichMenu[]; onChange: (m: RichMenu[]) => void }) {
  const [editing, setEditing] = useState<string | null>(null);

  async function create(audience: 'guest' | 'member') {
    const layout = MENU_LAYOUTS.find((l) => l.key === 'l6')!;
    const res = await fetch('/api/admin/line-bot/menus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: audience === 'member' ? '會員選單' : '非會員選單',
        audience,
        size: 'large',
        layout: layout.key,
        areas: defaultCells(layout.areas.length, audience),
        design: DEFAULT_MENU_DESIGN,
        chat_bar_text: '選單',
      }),
    });
    const d = await res.json();
    if (!res.ok) return void uiAlert(d.error ?? '新增失敗');
    onChange([...menus, d as RichMenu]);
    setEditing(d.id);
  }

  return (
    <div className="space-y-4">
      {AUDIENCES.map((a) => {
        const list = menus.filter((m) => m.audience === a.key);
        return (
          <Card key={a.key} title={a.label} desc={a.hint} action={<button type="button" onClick={() => create(a.key)} className={smallBtn}>＋ 新增選單</button>}>
            {list.length === 0 ? (
              <p className="text-xs text-[#a99e8f]">還沒有選單</p>
            ) : (
              <div className="space-y-2">
                {list.map((m) =>
                  editing === m.id ? (
                    <MenuEditor
                      key={m.id}
                      menu={m}
                      onClose={() => setEditing(null)}
                      onSaved={(saved) => onChange(menus.map((x) => (x.id === saved.id ? saved : x)))}
                      onMenus={onChange}
                      onDeleted={() => {
                        onChange(menus.filter((x) => x.id !== m.id));
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <button key={m.id} type="button" onClick={() => setEditing(m.id)} className="flex w-full items-center gap-3 rounded-xl border border-[#ebe4da] p-2.5 text-left transition hover:bg-[#faf7f2]">
                      <span className={`shrink-0 overflow-hidden rounded-md bg-[#f6f2ec] ${m.size === 'large' ? 'h-[54px] w-20' : 'h-[27px] w-20'}`}>
                        {m.image_url ? <img src={m.image_url} alt="" className="h-full w-full object-cover" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-[#1f1b19]">{m.name || '未命名選單'}</span>
                        <span className="block text-[11px] text-[#a99e8f]">
                          {MENU_SIZE[m.size].label}・{MENU_LAYOUTS.find((l) => l.key === m.layout)?.label}
                        </span>
                      </span>
                      {m.line_rich_menu_id ? (
                        <span className="rounded-full bg-[#e9f7ee] px-2.5 py-1 text-[11px] font-semibold text-[#1f7a44]">使用中</span>
                      ) : (
                        <span className="rounded-full bg-[#f3eee7] px-2.5 py-1 text-[11px] text-[#8a7f72]">草稿</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// 用樣板產生選單圖片:每格放圖示+文字(2500 寬,JPEG 1MB 以內)
async function renderMenuImage(menu: RichMenu): Promise<Blob> {
  const size = MENU_SIZE[menu.size];
  const layout = MENU_LAYOUTS.find((l) => l.key === menu.layout)!;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d')!;
  const { bg, fg, line } = menu.design;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size.width, size.height);
  const font = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif';

  for (let i = 0; i < layout.areas.length; i++) {
    const a = layout.areas[i];
    const cell = menu.areas[i];
    // 分隔線
    ctx.strokeStyle = line;
    ctx.lineWidth = 4;
    ctx.strokeRect(a.x + 2, a.y + 2, a.width - 4, a.height - 4);
    if (!cell) continue;
    const unit = Math.min(a.width, a.height);
    const iconSize = Math.round(unit * 0.26);
    const fontSize = Math.round(Math.min(unit * 0.105, a.width / Math.max(cell.label.length, 4) * 0.8));
    const hasIcon = Boolean(cell.icon);
    const blockH = (hasIcon ? iconSize + fontSize * 0.7 : 0) + fontSize;
    let top = a.y + (a.height - blockH) / 2;
    if (hasIcon) {
      const svg = renderToStaticMarkup(<LinkIcon value={`icon:${cell.icon}`} size={iconSize} />).replace(/currentColor/g, fg);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}`;
      await img.decode().catch(() => {});
      ctx.drawImage(img, a.x + (a.width - iconSize) / 2, top, iconSize, iconSize);
      top += iconSize + fontSize * 0.7;
    }
    ctx.fillStyle = fg;
    ctx.font = `600 ${fontSize}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(cell.label, a.x + a.width / 2, top, a.width * 0.86);
  }
  return toJpeg(canvas);
}

async function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const q of [0.9, 0.82, 0.72, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size < 1000 * 1024) return blob;
  }
  throw new Error('圖片太大,請換一張較單純的圖');
}

// 自己設計的圖:裁成選單尺寸並壓縮到 1MB 內
async function fitUpload(file: File, menuSize: MenuSize): Promise<Blob> {
  const size = MENU_SIZE[menuSize];
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  URL.revokeObjectURL(url);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.max(size.width / img.naturalWidth, size.height / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (size.width - w) / 2, (size.height - h) / 2, w, h);
  return toJpeg(canvas);
}

const ICON_CHOICES = LINK_ICONS.slice(0, 60);

function MenuEditor({
  menu,
  onClose,
  onSaved,
  onMenus,
  onDeleted,
}: {
  menu: RichMenu;
  onClose: () => void;
  onSaved: (m: RichMenu) => void;
  onMenus: (m: RichMenu[]) => void;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<RichMenu>({ ...menu, design: { ...DEFAULT_MENU_DESIGN, ...(menu.design ?? {}) } });
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(menu.image_url);
  const [iconFor, setIconFor] = useState<number | null>(null);
  const layout = MENU_LAYOUTS.find((l) => l.key === draft.layout)!;
  const size = MENU_SIZE[draft.size];

  const setLayout = (key: string) => {
    const next = MENU_LAYOUTS.find((l) => l.key === key)!;
    const fallback = defaultCells(6, draft.audience);
    const areas = next.areas.map((_, i) => draft.areas[i] ?? fallback[i] ?? { label: '', icon: '', action: { type: 'page' as const, value: 'home' as const } });
    setDraft({ ...draft, layout: key, size: next.size, areas });
  };
  const setCell = (i: number, patch: Partial<MenuCell>) => setDraft({ ...draft, areas: draft.areas.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  async function generate() {
    setBusy('產生圖片中…');
    try {
      const blob = await renderMenuImage(draft);
      setPreview(URL.createObjectURL(blob));
      const url = await uploadBlob(blob, 'richmenu.jpg');
      setDraft((d) => ({ ...d, image_url: url, design: { ...d.design, mode: 'template' } }));
      setPreview(url);
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '產生失敗');
    } finally {
      setBusy('');
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy('上傳中…');
    try {
      const blob = await fitUpload(file, draft.size);
      const url = await uploadBlob(blob, 'richmenu.jpg');
      setDraft((d) => ({ ...d, image_url: url, design: { ...d.design, mode: 'upload' } }));
      setPreview(url);
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '上傳失敗');
    } finally {
      setBusy('');
    }
  }

  async function save(): Promise<RichMenu | null> {
    setBusy('儲存中…');
    try {
      const res = await fetch(`/api/admin/line-bot/menus/${menu.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '儲存失敗');
      onSaved(d as RichMenu);
      return d as RichMenu;
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '儲存失敗');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function publish(action: 'publish' | 'unpublish') {
    if (action === 'publish' && !draft.image_url) return void uiAlert('請先產生或上傳選單圖片');
    if (action === 'publish' && !(await uiConfirm(`上線後,${draft.audience === 'member' ? '所有已綁定會員' : '還沒綁定的好友'}都會看到這個選單(同類型的舊選單會被取代)。確定上線?`))) return;
    if (!(await save())) return;
    setBusy(action === 'publish' ? '上線中…' : '下架中…');
    try {
      const res = await fetch(`/api/admin/line-bot/menus/${menu.id}?action=${action}`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? '操作失敗');
      onMenus(d.menus as RichMenu[]);
      const mine = (d.menus as RichMenu[]).find((m) => m.id === menu.id);
      if (mine) setDraft((x) => ({ ...x, line_rich_menu_id: mine.line_rich_menu_id, published_at: mine.published_at }));
      void uiAlert(action === 'publish' ? '選單已上線,LINE 聊天室重新打開就會看到。' : '選單已下架');
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '操作失敗');
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    if (!(await uiConfirm('確定刪除這個選單?', { danger: true }))) return;
    const res = await fetch(`/api/admin/line-bot/menus/${menu.id}`, { method: 'DELETE' });
    if (!res.ok) return void uiAlert('刪除失敗');
    onDeleted();
  }

  return (
    <div className="space-y-5 rounded-xl border border-[#1f1b19]/20 bg-[#fcfaf7] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="選單名稱(只有你看得到)" className={`${inputClass} max-w-xs`} />
        {draft.line_rich_menu_id ? <span className="rounded-full bg-[#e9f7ee] px-2.5 py-1 text-[11px] font-semibold text-[#1f7a44]">使用中</span> : null}
        <button type="button" onClick={onClose} className="ml-auto text-xs text-[#8a7f72]">收合</button>
      </div>

      <Field label="格局" hint="大選單 2500×1686、小選單 2500×843">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {MENU_LAYOUTS.map((l) => {
            const s = MENU_SIZE[l.size];
            return (
              <button key={l.key} type="button" onClick={() => setLayout(l.key)} className={`rounded-lg border p-2 transition ${draft.layout === l.key ? 'border-[#1f1b19] bg-white' : 'border-[#e5ded4] bg-white/60 hover:border-[#1f1b19]/30'}`}>
                <svg viewBox={`0 0 ${s.width} ${s.height}`} className="w-full" aria-hidden="true">
                  <rect width={s.width} height={s.height} fill="#efe8dd" />
                  {l.areas.map((a, i) => <rect key={i} x={a.x + 30} y={a.y + 30} width={a.width - 60} height={a.height - 60} rx="60" fill="#d8cdbf" />)}
                </svg>
                <span className="mt-1 block text-center text-[11px] text-[#6b6156]">{l.size === 'large' ? '大' : '小'}・{l.label}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="每一格" hint="文字、圖示會畫在樣板圖片上;動作是點了之後做什麼">
        <div className="space-y-2">
          {draft.areas.slice(0, layout.areas.length).map((c, i) => (
            <div key={i} className="rounded-lg border border-[#ebe4da] bg-white p-2.5">
              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f3eee7] text-[11px] text-[#6b6156]">{i + 1}</span>
                <button type="button" onClick={() => setIconFor(iconFor === i ? null : i)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5ded4] text-[#1f1b19]" aria-label="選擇圖示">
                  {c.icon ? <LinkIcon value={`icon:${c.icon}`} size={18} /> : <span className="text-[10px] text-[#b3a897]">圖示</span>}
                </button>
                <input value={c.label} maxLength={12} onChange={(e) => setCell(i, { label: e.target.value })} placeholder="文字" className="w-full rounded-lg border border-[#e5ded4] px-2.5 py-2 text-xs outline-none focus:border-[#1f1b19]/40 sm:w-28" />
                <ActionEditor action={c.action} onChange={(action) => setCell(i, { action })} />
              </div>
              {iconFor === i ? (
                <div className="mt-2 grid grid-cols-10 gap-1">
                  <button type="button" onClick={() => { setCell(i, { icon: '' }); setIconFor(null); }} className="flex aspect-square items-center justify-center rounded border border-[#efe8dd] text-[10px] text-[#a99e8f]">無</button>
                  {ICON_CHOICES.map((ic) => (
                    <button key={ic.key} type="button" title={ic.label} onClick={() => { setCell(i, { icon: ic.key }); setIconFor(null); }} className={`flex aspect-square items-center justify-center rounded border ${c.icon === ic.key ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#efe8dd] text-[#3d3935]'}`}>
                      <LinkIcon value={`icon:${ic.key}`} size={15} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Field>

      <Field label="選單圖片" hint={`${size.width}×${size.height}・1MB 以內`}>
        <div className="space-y-3">
          <Pills value={draft.design.mode} options={[{ key: 'template', label: '用樣板產生' }, { key: 'upload', label: '上傳自己的設計' }]} onChange={(mode) => setDraft({ ...draft, design: { ...draft.design, mode } })} />
          {draft.design.mode === 'template' ? (
            <div className="flex flex-wrap items-center gap-3">
              {([['bg', '底色'], ['fg', '文字'], ['line', '分隔線']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5 text-xs text-[#6b6156]">
                  <input type="color" value={draft.design[k]} onChange={(e) => setDraft({ ...draft, design: { ...draft.design, [k]: e.target.value } })} className="h-8 w-8 cursor-pointer rounded border border-[#e5ded4] bg-white p-0.5" />
                  {l}
                </label>
              ))}
              <button type="button" onClick={generate} disabled={Boolean(busy)} className={smallBtn}>{preview ? '重新產生圖片' : '產生圖片'}</button>
            </div>
          ) : (
            <label className={`${smallBtn} inline-block cursor-pointer`}>
              {busy === '上傳中…' ? '上傳中…' : '選擇圖片'}
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          )}
          {draft.design.mode === 'upload' ? <p className="text-[11px] text-[#a99e8f]">請依上面的格局設計,尺寸不同會自動裁切置中。每一格的位置就是可以點的範圍。</p> : null}
          <div className="relative overflow-hidden rounded-lg border border-[#e5ded4] bg-white" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
            {preview ? <img src={preview} alt="選單預覽" className="h-full w-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-xs text-[#a99e8f]">尚未產生圖片</span>}
            {/* 點擊範圍 */}
            <svg viewBox={`0 0 ${size.width} ${size.height}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              {layout.areas.map((a, i) => (
                <g key={i}>
                  <rect x={a.x + 6} y={a.y + 6} width={a.width - 12} height={a.height - 12} fill="none" stroke="#1f1b19" strokeOpacity="0.25" strokeWidth="6" strokeDasharray="24 18" />
                  <text x={a.x + 40} y={a.y + 110} fontSize="80" fill="#1f1b19" fillOpacity="0.35">{i + 1}</text>
                </g>
              ))}
            </svg>
          </div>
          {draft.design.mode === 'template' && preview ? <p className="text-[11px] text-[#a99e8f]">改了文字、圖示或顏色後,記得按「重新產生圖片」</p> : null}
        </div>
      </Field>

      <Field label="選單按鈕文字" hint="聊天室下方收合時顯示,14 字內">
        <input value={draft.chat_bar_text} maxLength={14} onChange={(e) => setDraft({ ...draft, chat_bar_text: e.target.value })} className={`${inputClass} max-w-[12rem]`} />
      </Field>

      <div className="flex flex-wrap items-center gap-2 border-t border-[#efe8dd] pt-3">
        <button type="button" onClick={remove} className="text-xs text-[#c0392b] hover:underline">刪除選單</button>
        {busy ? <span className="text-xs text-[#8a7f72]">{busy}</span> : null}
        <span className="ml-auto" />
        {draft.line_rich_menu_id ? <button type="button" onClick={() => publish('unpublish')} disabled={Boolean(busy)} className={smallBtn}>下架</button> : null}
        <button type="button" onClick={() => void save()} disabled={Boolean(busy)} className={smallBtn}>儲存草稿</button>
        <button type="button" onClick={() => publish('publish')} disabled={Boolean(busy)} className={primaryBtn}>{draft.line_rich_menu_id ? '更新上線' : '上線'}</button>
      </div>
    </div>
  );
}
