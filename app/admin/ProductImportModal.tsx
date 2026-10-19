'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, ChevronDown, ExternalLink, LoaderCircle, PackagePlus, RotateCcw, Square, X } from 'lucide-react';
import { useScrollLock } from '@/app/components/useScrollLock';
import { uiConfirm } from '@/lib/ui-dialog';
import { extractUrl } from '@/lib/extract-url';
import { importProblems, IMPORT_MAX_VARIANTS, type DiscoveryTask, type ImportedProduct, type ProductDiscovery } from '@/lib/product-import-types';
import { loadImportJob, saveImportJob } from '@/lib/product-import-storage';
import type { Category, Product } from '@/lib/types';

type Entry = { url: string; product?: ImportedProduct; error?: string; selected: boolean; reviewed: boolean; category: string; result?: 'created' | 'duplicate'; id?: string; notice?: string };
type Task = DiscoveryTask & { seed?: boolean };
type Job = { version: 1; mode: 'single' | 'store'; url: string; root: string; tasks: Task[]; visited: string[]; urls: string[]; entries: Entry[]; issues: string[]; stock: number | null; category: string; publish: boolean };
const fresh = (): Job => ({ version: 1, mode: 'single', url: '', root: '', tasks: [], visited: [], urls: [], entries: [], issues: [], stock: null, category: '', publish: false });
const input = 'w-full min-w-0 rounded-lg border border-[#ddd8d1] bg-white px-3 py-2 text-sm outline-none focus:border-[#69635a]';
function ImportDescription({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value; }, [value]);
  return <div><span className="mb-1 block text-sm">商品內容</span><div ref={ref} role="textbox" aria-label="商品內容" aria-multiline="true" contentEditable suppressContentEditableWarning
    onInput={(e) => onChange(e.currentTarget.innerHTML)}
    onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}
    onDrop={(e) => { e.preventDefault(); }}
    className={`${input} min-h-28 max-h-64 overflow-auto whitespace-pre-wrap leading-6 [&_img]:h-auto [&_img]:max-w-full`} /></div>;
}
class ImportError extends Error { constructor(message: string, public retryAfter = 0) { super(message); } }
async function api<T>(body: object): Promise<T> {
  const response = await fetch('/api/products/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(125_000) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ImportError(data?.error ?? '讀取失敗，請稍後再試', response.status === 429 ? Number(response.headers.get('retry-after') || 60) : 0);
  return data as T;
}

export default function ProductImportModal({ categories, onClose, onImported }: { categories: Category[]; onClose: () => void; onImported: (product: Product) => void }) {
  useScrollLock(true);
  const [job, setJob] = useState<Job>(fresh);
  const latest = useRef(job);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [rights, setRights] = useState(false);
  const [expanded, setExpanded] = useState('');
  const stop = useRef(false);
  const active = useRef(false);
  const storageKey = useRef('');
  const update = (fn: (job: Job) => Job) => { const next = fn(latest.current); latest.current = next; setJob(next); };
  useEffect(() => {
    let live = true;
    storageKey.current = window.location.host;
    void loadImportJob<Job>(storageKey.current).then((saved) => {
      if (live && saved?.version === 1 && Array.isArray(saved.entries) && Array.isArray(saved.tasks)) { latest.current = saved; setJob(saved); }
    }).catch(() => { if (live) setStorageError(true); }).finally(() => { if (live) setLoaded(true); });
    return () => { live = false; stop.current = true; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => { void saveImportJob(storageKey.current, job).then(() => setStorageError(false)).catch(() => setStorageError(true)); }, 250);
    return () => clearTimeout(timer);
  }, [job, loaded]);
  async function persist() { try { await saveImportJob(storageKey.current, latest.current); setStorageError(false); } catch { setStorageError(true); } }
  async function close() { if (!active.current) { await persist(); onClose(); } }

  const changeEntry = (url: string, fn: (entry: Entry) => Entry) => update((current) => ({ ...current, entries: current.entries.map((entry) => entry.url === url ? fn(entry) : entry) }));
  const changeProduct = (url: string, patch: Partial<ImportedProduct>) => changeEntry(url, (entry) => ({ ...entry, product: { ...entry.product!, ...patch }, error: undefined }));
  const remaining = job.urls.some((url) => !job.entries.some((entry) => entry.url === url)) || job.tasks.length > 0;
  const selected = job.entries.filter((entry) => entry.product && entry.selected && !entry.result);
  const pendingProblems = selected.some((entry) => importProblems(entry.product!, job.stock, entry.reviewed).length > 0 || (job.publish && (entry.product!.variants.length ? entry.product!.variants.every((v) => (v.inventory ?? job.stock ?? 0) === 0) : (entry.product!.inventory ?? job.stock ?? 0) === 0)));

  async function cooldown(reason: ImportError) {
    for (let seconds = Math.min(120, reason.retryAfter); seconds > 0 && !stop.current; seconds--) {
      setMessage(`讀取頻率限制，${seconds} 秒後繼續`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  async function scan() {
    if (active.current) return;
    active.current = true; stop.current = false; setBusy(true); setError('');
    let steps = 0;
    try {
      while (!stop.current) {
        const current = latest.current;
        const nextUrl = current.urls.find((url) => !current.entries.some((entry) => entry.url === url));
        const task = current.tasks[0];
        if (!task && !nextUrl) break;
        if (task && (!nextUrl || steps++ % 4 === 0)) {
          const key = `${task.url}#${task.offset}`;
          if (current.visited.includes(key)) { update((j) => ({ ...j, tasks: j.tasks.slice(1) })); continue; }
          setMessage(`掃描商店：${task.url}`);
          try {
            const result = await api<ProductDiscovery>({ action: 'discover', root: current.root, url: task.url, offset: task.offset, seed: task.seed });
            update((j) => {
              const visited = [...j.visited, key];
              const tasks = [...j.tasks.slice(1)];
              for (const url of result.pages) if (!visited.includes(`${url}#0`) && !tasks.some((t) => t.url === url && t.offset === 0)) tasks.push({ url, offset: 0 });
              if (result.nextOffset !== null && !tasks.some((t) => t.url === task.url && t.offset === result.nextOffset)) tasks.push({ url: task.url, offset: result.nextOffset });
              return { ...j, root: result.root, visited, tasks, urls: [...new Set([...j.urls, ...result.products])], issues: [...new Set([...j.issues, ...result.warnings])].slice(-100) };
            });
          } catch (e) {
            if (e instanceof ImportError && e.retryAfter) { await cooldown(e); continue; }
            update((j) => ({ ...j, tasks: j.tasks.slice(1), visited: [...j.visited, key], issues: [...j.issues, `${task.url}：${e instanceof Error ? e.message : '掃描失敗'}`].slice(-100) }));
          }
        } else if (nextUrl) {
          setMessage(`讀取商品：${nextUrl}`);
          try {
            const product = await api<ImportedProduct>({ action: 'read', url: nextUrl });
            const category = categories.find((c) => c.name === product.category || c.slug === product.category)?.slug ?? '';
            update((j) => ({ ...j, entries: [...j.entries, { url: nextUrl, product, selected: true, reviewed: false, category }] }));
          } catch (e) {
            if (e instanceof ImportError && e.retryAfter) { await cooldown(e); continue; }
            update((j) => ({ ...j, entries: [...j.entries, { url: nextUrl, selected: false, reviewed: false, category: '', error: e instanceof Error ? e.message : '商品讀取失敗' }] }));
          }
        }
      }
      setMessage(stop.current ? '已暫停，可繼續讀取' : '讀取完成');
    } finally { await persist(); active.current = false; setBusy(false); }
  }
  async function start() {
    if (!job.url.trim()) { setError('請填寫商品或商店網址'); return; }
    const url = extractUrl(job.url);
    if (job.entries.length || job.visited.length) {
      if (!await uiConfirm('開始新的搬家會取代這次讀取進度，已匯入的商品不會刪除。繼續嗎？')) return;
    }
    update((j) => ({ ...fresh(), mode: j.mode, url, root: url, tasks: j.mode === 'store' ? [{ url, offset: 0, seed: true }] : [], urls: j.mode === 'single' ? [url] : [], stock: j.stock, category: j.category, publish: j.publish }));
    await scan();
  }
  async function publish() {
    if (active.current || !rights || !selected.length || pendingProblems) return;
    active.current = true; stop.current = false; setBusy(true); setError('');
    const entries = selected.map((e) => e.url);
    try {
      for (const url of entries) {
        if (stop.current) break;
        const current = latest.current;
        const entry = current.entries.find((e) => e.url === url)!;
        setMessage(`${current.publish ? '上架' : '匯入'}：${entry.product!.name}`);
        try {
          const result = await api<{ status: 'created' | 'duplicate'; product: Product; warnings: string[] }>({ action: 'apply', rights: true, product: entry.product, reviewed: entry.reviewed, stock: current.stock, category: current.category || entry.category, publish: current.publish });
          onImported(result.product);
          changeEntry(url, (e) => ({ ...e, selected: false, result: result.status, id: result.product.id, error: undefined, notice: result.warnings.join('；') }));
        } catch (e) {
          if (e instanceof ImportError && e.retryAfter) { await cooldown(e); entries.splice(entries.indexOf(url) + 1, 0, url); continue; }
          changeEntry(url, (entry) => ({ ...entry, error: e instanceof Error ? e.message : '匯入失敗' }));
        }
      }
      const failed = latest.current.entries.filter((e) => entries.includes(e.url) && e.error).length;
      setMessage(stop.current ? '已暫停，已完成的商品不會重複匯入' : failed ? `本次處理完成，${failed} 件失敗，修正後可重試` : '匯入完成');
    } finally { await persist(); active.current = false; setBusy(false); }
  }
  function retry() {
    update((j) => ({ ...j, entries: j.entries.filter((e) => e.product || !e.error) }));
    void scan();
  }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-2 sm:p-5">
    <section role="dialog" aria-modal="true" aria-label="商品一鍵搬家" className="flex max-h-[95dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-[#f8f8f7] text-[#242424] shadow-xl">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#dedbd6] bg-white px-4 py-3">
        <PackagePlus size={21} aria-hidden="true" /><h2 className="flex-1 text-lg font-semibold">商品一鍵搬家</h2>
        <button type="button" disabled={busy || !loaded} onClick={() => void close()} aria-label="關閉商品搬家" title="關閉" className="p-2 disabled:opacity-30"><X size={20} /></button>
      </header>
      {!loaded ? <p className="p-8 text-center">讀取搬家進度中…</p> : <>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <fieldset disabled={busy} className="min-w-0 space-y-3 disabled:opacity-60">
            <div role="group" aria-label="搬家模式" className="inline-flex overflow-hidden rounded-lg border border-[#d9d6d1] bg-white">
              {(['single', 'store'] as const).map((mode) => <button key={mode} type="button" aria-pressed={job.mode === mode} onClick={() => update((j) => ({ ...j, mode }))} className={`px-4 py-2 text-sm ${job.mode === mode ? 'bg-[#242424] text-white' : ''}`}>{mode === 'single' ? '單一商品' : '整間商店'}</button>)}
            </div>
            <div className="flex flex-wrap gap-2"><label className="min-w-0 flex-1"><span className="sr-only">來源網址</span><input className={input} value={job.url} onChange={(e) => update((j) => ({ ...j, url: e.target.value }))} placeholder={job.mode === 'single' ? '貼上公開商品網址' : '貼上商店首頁網址'} /></label><button type="button" onClick={() => void start()} className="rounded-lg bg-[#242424] px-4 py-2 text-sm font-semibold text-white">開始讀取</button></div>
          </fieldset>
          <div role="status" aria-live="polite" className="mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span>已發現 {job.urls.length} 件</span><span>已讀取 {job.entries.filter((e) => e.product).length} 件</span><span>已匯入 {job.entries.filter((e) => e.result === 'created').length} 件</span>
            {busy ? <button type="button" onClick={() => { stop.current = true; setMessage('正在完成目前操作，完成後暫停…'); }} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4d0c9] px-3 py-1.5"><Square size={12} />暫停</button> : remaining ? <button type="button" onClick={() => void scan()} className="rounded-lg border border-[#d4d0c9] px-3 py-1.5">繼續讀取</button> : null}
            {!busy && job.entries.some((e) => e.error && !e.product) ? <button type="button" onClick={retry} className="inline-flex items-center gap-1 text-sm underline"><RotateCcw size={14} />重試失敗商品</button> : null}
          </div>
          {message ? <p className="mt-2 flex min-w-0 items-center gap-2 break-all text-xs text-[#666]">{busy ? <LoaderCircle size={14} className="shrink-0 animate-spin" /> : null}{message}</p> : null}
          {storageError ? <p role="alert" className="mt-2 text-sm text-[#a15d10]">此瀏覽器無法儲存進度，請勿關閉頁面。</p> : null}
          {error ? <p role="alert" className="mt-2 text-sm text-[#a03b3b]">{error}</p> : null}
          {job.issues.length ? <details className="mt-3 text-xs text-[#795b31]"><summary className="cursor-pointer">掃描提醒（{job.issues.length}）</summary><ul className="mt-2 space-y-1 break-all">{job.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></details> : null}
          {job.entries.length ? <>
            <fieldset disabled={busy} className="my-4 grid min-w-0 gap-3 border-y border-[#dedbd6] py-4 sm:grid-cols-3">
              <label className="min-w-0 text-sm">未公開庫存（每個規格）<input type="number" min={0} max={1000000} aria-label="未公開庫存" value={job.stock ?? ''} onChange={(e) => update((j) => ({ ...j, stock: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="自行設定" className={`${input} mt-1`} /></label>
              <label className="min-w-0 text-sm">統一分類<select aria-label="統一分類" value={job.category} onChange={(e) => update((j) => ({ ...j, category: e.target.value }))} className={`${input} mt-1`}><option value="">依可比對的來源分類</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
              <label className="min-w-0 text-sm">匯入後狀態<select aria-label="匯入後狀態" value={job.publish ? 'publish' : 'draft'} onChange={(e) => update((j) => ({ ...j, publish: e.target.value === 'publish' }))} className={`${input} mt-1`}><option value="draft">存為未上架</option><option value="publish">直接上架</option></select></label>
            </fieldset>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={selected.length > 0 && selected.length === job.entries.filter((e) => e.product && !e.result).length} onChange={(e) => update((j) => ({ ...j, entries: j.entries.map((entry) => entry.product && !entry.result ? { ...entry, selected: e.target.checked } : entry) }))} />全選待匯入商品</label><button type="button" disabled={busy} onClick={() => update((j) => ({ ...j, entries: j.entries.map((entry) => ({ ...entry, selected: Boolean(entry.product && !entry.result && !importProblems(entry.product, j.stock, entry.reviewed).length) })) }))} className="text-xs underline">只選資料完整商品</button></div>
            <div className="divide-y divide-[#dedbd6]">
              {job.entries.map((entry) => {
                const product = entry.product;
                const problems = product ? importProblems(product, job.stock, entry.reviewed) : [];
                if (product && job.publish) {
                  const quantities = product.variants.length ? product.variants.map((v) => v.inventory ?? job.stock) : [product.inventory ?? job.stock];
                  if (quantities.every((quantity) => quantity === 0)) problems.push('庫存為 0，請設定庫存或改存未上架');
                }
                return <article key={entry.url} aria-label={product?.name || entry.url} className="py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <input type="checkbox" aria-label={`選取 ${product?.name || entry.url}`} disabled={busy || !product || Boolean(entry.result)} checked={entry.selected} onChange={(e) => changeEntry(entry.url, (v) => ({ ...v, selected: e.target.checked }))} className="mt-6" />
                    {product?.images[0] ? <Image src={product.images[0]} alt="" width={64} height={64} unoptimized className="h-16 w-16 shrink-0 rounded-md bg-white object-contain" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-[#ecebe7] text-xs text-[#777]">無圖片</span>}
                    <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{product?.name || '未能讀取商品'}</h3><a href={entry.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-[#74716a]"><span className="truncate">來源商品</span><ExternalLink size={12} /></a>
                      {entry.result ? <p className="mt-1 flex items-center gap-1 text-xs text-[#367250]"><Check size={13} />{entry.result === 'duplicate' ? '已存在，未覆蓋原商品' : '匯入成功'}</p> : product ? <p className="mt-1 text-xs text-[#777]">{product.price === null ? '售價待確認' : `${product.currency || '幣別待確認'} ${product.price.toLocaleString()}`} · {product.variants.length} 個規格組合</p> : null}
                    </div>
                    {product && !entry.result ? <button type="button" aria-label={`編輯 ${product.name}`} disabled={busy} onClick={() => setExpanded(expanded === entry.url ? '' : entry.url)} className="shrink-0 p-2" title="編輯匯入資料"><ChevronDown size={18} className={expanded === entry.url ? 'rotate-180' : ''} /></button> : null}
                  </div>
                  {entry.error ? <p role="alert" className="mt-2 break-words text-sm text-[#a03b3b]">{entry.error}</p> : null}
                  {entry.notice ? <p className="mt-2 text-xs text-[#93600c]">{entry.notice}</p> : null}
                  {product && !entry.result ? <>
                    {product.warnings.length ? <p className="mt-2 text-xs leading-5 text-[#8b6a34]">{product.warnings.filter((warning) => !(product.currency === 'TWD' && /幣別|新臺幣/.test(warning))).join('；')}</p> : null}
                    {problems.length ? <p className="mt-1 text-xs leading-5 text-[#a03b3b]">{problems.join('；')}</p> : null}
                    {expanded === entry.url ? <fieldset disabled={busy} className="mt-3 min-w-0 space-y-3">
                      <label className="block text-sm">商品名稱<input aria-label="商品名稱" value={product.name} onChange={(e) => changeProduct(entry.url, { name: e.target.value })} className={`${input} mt-1`} /></label>
                      <div className="grid grid-cols-2 gap-3"><label className="min-w-0 text-sm">售價（新臺幣）<input aria-label="商品售價" type="number" min={0} value={product.price ?? ''} onChange={(e) => changeProduct(entry.url, { price: e.target.value === '' ? null : Number(e.target.value) })} className={`${input} mt-1`} /></label><label className="min-w-0 text-sm">公開庫存<input aria-label="商品公開庫存" type="number" min={0} value={product.inventory ?? ''} onChange={(e) => changeProduct(entry.url, { inventory: e.target.value === '' ? null : Number(e.target.value) })} className={`${input} mt-1`} placeholder="未公開" /></label></div>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={product.currency === 'TWD'} onChange={(e) => changeProduct(entry.url, { currency: e.target.checked ? 'TWD' : '' })} />價格已確認為新臺幣</label>
                      <label className="block text-sm">分類<select aria-label="商品分類" value={entry.category} disabled={Boolean(job.category)} onChange={(e) => changeEntry(entry.url, (v) => ({ ...v, category: e.target.value }))} className={`${input} mt-1`}><option value="">未分類</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
                      {product.specs.length ? <div><p className="mb-2 break-words text-xs text-[#777]">{product.specs.map((s) => `${s.name}：${s.options.join('、')}`).join(' / ')}</p>
                        {!product.variants.length && product.specs.reduce((n, s) => n * s.options.length, 1) <= IMPORT_MAX_VARIANTS ? <button type="button" onClick={() => changeProduct(entry.url, { variants: product.specs.reduce<string[][]>((rows, s) => rows.flatMap((row) => s.options.map((o) => [...row, o])), [[]]).map((options) => ({ options, price: product.price, inventory: null })) })} className="rounded-lg border border-[#c9c4bb] px-3 py-2 text-sm">確認組合，所有規格同價</button> : null}
                        {product.variants.length ? <><div className="mb-2 flex items-center justify-between text-xs"><span>規格 / 售價 / 庫存</span><button type="button" onClick={() => changeProduct(entry.url, { variants: product.variants.map((v) => ({ ...v, price: product.price })) })} className="underline">全部沿用基本售價</button></div><div className="space-y-2">{product.variants.map((v, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_80px_80px] items-center gap-2 text-xs"><span className="break-words">{v.options.join(' / ') || '規格不完整'}</span><input type="number" min={0} aria-label={`${v.options.join(' / ')} 售價`} value={v.price ?? ''} onChange={(e) => changeProduct(entry.url, { variants: product.variants.map((value, i) => i === index ? { ...value, price: e.target.value === '' ? null : Number(e.target.value) } : value) })} className={input} /><input type="number" min={0} aria-label={`${v.options.join(' / ')} 庫存`} value={v.inventory ?? ''} placeholder="未公開" onChange={(e) => changeProduct(entry.url, { variants: product.variants.map((value, i) => i === index ? { ...value, inventory: e.target.value === '' ? null : Number(e.target.value) } : value) })} className={input} /></div>)}</div></> : null}
                      </div> : null}
                      <ImportDescription value={product.description} onChange={(description) => changeProduct(entry.url, { description })} />
                      {product.images.length ? <div className="flex flex-wrap gap-2">{product.images.map((image, i) => <div key={image} className="relative h-16 w-16"><Image src={image} alt={`商品照片 ${i + 1}`} width={64} height={64} unoptimized className="h-full w-full rounded-md bg-white object-contain" /><button type="button" aria-label={`移除商品照片 ${i + 1}`} title="移除照片" onClick={() => changeProduct(entry.url, { images: product.images.filter((src) => src !== image) })} className="absolute -right-1 -top-1 rounded-full bg-white p-1 shadow"><X size={12} /></button></div>)}</div> : null}
                      {product.reviewRequired ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entry.reviewed} onChange={(e) => changeEntry(entry.url, (v) => ({ ...v, reviewed: e.target.checked }))} />已核對來源商品與規格資料</label> : null}
                    </fieldset> : null}
                  </> : null}
                </article>;
              })}
            </div>
          </> : null}
        </div>
        <footer className="shrink-0 space-y-3 border-t border-[#dedbd6] bg-white px-4 py-3">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={rights} disabled={busy} onChange={(e) => setRights(e.target.checked)} />我有權使用來源商品的圖片與內容</label>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">已選 {selected.length} 件{pendingProblems ? ' · 部分資料待確認' : ''}</span><button type="button" disabled={busy || !rights || !selected.length || pendingProblems} onClick={() => void publish()} className="inline-flex items-center gap-2 rounded-lg bg-[#242424] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-35"><PackagePlus size={16} />{job.publish ? '確認並上架' : '匯入為未上架'}</button></div>
        </footer>
      </>}
    </section>
  </div>;
}
