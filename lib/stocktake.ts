// 庫存盤點:型別與共用工具(前後台共用,不含伺服器端程式)
import type { Product } from '@/lib/types';

export type StocktakeLine = {
  product_id: string;
  variant_key: string; // 規格組合(options 用 ' / ' 串起),無規格為空
  name: string;
  spec: string;
  unit: string;
  location: string;
  cost: number;
  system_qty: number; // 建單時的系統庫存
  counted_qty: number | null; // 實盤數量;null = 尚未盤點
  qty_before?: number; // 完成時的系統庫存
  adjusted?: number; // 完成時寫入的調整量(實盤 − 完成時系統庫存)
};

export type Stocktake = {
  id: string;
  doc_no: string;
  title: string;
  status: 'draft' | 'done' | 'void';
  scope: string;
  handler: string;
  note: string;
  lines: StocktakeLine[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export const lineKey = (l: Pick<StocktakeLine, 'product_id' | 'variant_key'>) => `${l.product_id}::${l.variant_key}`;

// 由商品產生盤點明細(每個規格一列)
export function linesFromProducts(products: Product[]): StocktakeLine[] {
  return products.flatMap((p) => {
    const base = { product_id: p.id, name: p.name, unit: p.unit || '件' };
    if (p.variants?.length) {
      return p.variants.map((v) => ({
        ...base,
        variant_key: v.options.join(' / '),
        spec: v.options.join(' / '),
        location: v.location ?? '',
        cost: Number(v.cost ?? 0),
        system_qty: Number(v.inventory ?? 0),
        counted_qty: null,
      }));
    }
    return [{ ...base, variant_key: '', spec: '', location: '', cost: 0, system_qty: Number(p.inventory ?? 0), counted_qty: null }];
  });
}

export function stocktakeSummary(lines: StocktakeLine[]) {
  let counted = 0, diffLines = 0, diffQty = 0, diffValue = 0;
  for (const l of lines) {
    if (l.counted_qty == null) continue;
    counted += 1;
    const d = l.counted_qty - l.system_qty;
    if (d !== 0) { diffLines += 1; diffQty += d; diffValue += d * (l.cost || 0); }
  }
  return { total: lines.length, counted, pending: lines.length - counted, diffLines, diffQty, diffValue };
}

// ---------- CSV ----------
export const csvEscape = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const STOCKTAKE_CSV_HEADERS = ['品項編號', '品名', '規格', '單位', '儲位', '系統庫存', '實盤數量', '差異'];

export function stocktakeCsvRows(st: Stocktake) {
  return [
    STOCKTAKE_CSV_HEADERS,
    ...st.lines.map((l) => [
      l.product_id, l.name, l.variant_key, l.unit, l.location, l.system_qty,
      l.counted_qty ?? '', l.counted_qty == null ? '' : l.counted_qty - l.system_qty,
    ]),
  ];
}

// 匯入盤點 CSV:依「品項編號 + 規格」對應,回傳 { key: 實盤數量 },空白的實盤欄不覆蓋
export function countsFromCsv(text: string): { counts: Map<string, number>; skipped: number; error?: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { counts: new Map(), skipped: 0, error: '檔案沒有資料' };
  const headers = rows[0].map((h) => h.trim());
  const idx = (names: string[]) => names.map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;
  const pid = idx(['品項編號', '商品編號', 'product_id']);
  const spec = idx(['規格', 'variant_key']);
  const counted = idx(['實盤數量', '實盤', 'counted_qty']);
  if (pid < 0 || counted < 0) return { counts: new Map(), skipped: 0, error: 'CSV 需要包含「品項編號」與「實盤數量」欄位' };
  const counts = new Map<string, number>();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const id = (r[pid] ?? '').trim();
    const raw = (r[counted] ?? '').trim();
    if (!id || raw === '') { if (id) skipped++; continue; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) { skipped++; continue; }
    counts.set(lineKey({ product_id: id, variant_key: spec >= 0 ? (r[spec] ?? '').trim() : '' }), Math.floor(n));
  }
  return { counts, skipped };
}
