import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { URBANITE_SHOP_ID } from '@/lib/shop';
import { buildReport, checkKey, parseRange } from '@/lib/kazu-sales-core.mjs';

// KAZU 唯讀銷售統計:只用 select,不寫入。鑰匙 KAZU_SALES_KEY 與其他 secret 不共用。
// 非 GET 的 405 由 proxy.ts 對這條精確路徑處理;這裡只匯出 GET。

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'no-store' };
const PAGE = 1000;
const IN_BATCH = 200;
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

type Row = Record<string, unknown>;
type Page = PromiseLike<{ data: Row[] | null; error: unknown }>;

// Supabase 一次最多回 1000 列:用 range 分頁,排序鍵必須唯一
async function fetchAll(page: (from: number, to: number) => Page): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error('query failed');
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

export async function GET(request: Request) {
  const key = checkKey(process.env.KAZU_SALES_KEY, request.headers.get('authorization'));
  if (!key.ok) return respond({ error: key.error }, key.status);

  const now = new Date();
  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get('from'), params.get('to'), now);
  if (!range.ok) return respond({ error: range.error }, range.status);

  try {
    const db = createAdminClient();
    const orderCols = 'id, status, paid, payment_status, fulfillment_status, order_status, cancel_status, total, created_at';

    const [inRange, pending, products, subscriptions, payments] = await Promise.all([
      fetchAll((a, b) => db.from('orders').select(orderCols).eq('shop_id', URBANITE_SHOP_ID)
        .gte('created_at', range.startIso).lt('created_at', range.endIso).order('id').range(a, b)),
      // 待出貨候選:不限期間、已付款、尚未出貨且未取消(最終仍由純函式判定)
      fetchAll((a, b) => db.from('orders').select(orderCols).eq('shop_id', URBANITE_SHOP_ID)
        .eq('paid', true).not('status', 'in', '(已出貨,已完成,取消,退貨)').order('id').range(a, b)),
      fetchAll((a, b) => db.from('products').select('id, name, status, inventory, variants').eq('shop_id', URBANITE_SHOP_ID)
        .eq('status', '上架中').order('id').range(a, b)),
      fetchAll((a, b) => db.from('card_subscriptions').select('user_id, plan, expires_at').order('user_id').range(a, b)),
      fetchAll((a, b) => db.from('card_payments').select('id, user_id, tier, amount, paid_at')
        .not('paid_at', 'is', null).gte('paid_at', range.startIso).lt('paid_at', range.endIso).order('id').range(a, b)),
    ]);

    // 首次付款:只查期間內有付款的人,在期間開始前是否已有付款紀錄
    const userIds = [...new Set(payments.map((p) => String(p.user_id)))];
    const priorUserIds = new Set<string>();
    for (let i = 0; i < userIds.length; i += IN_BATCH) {
      const batch = userIds.slice(i, i + IN_BATCH);
      const prior = await fetchAll((a, b) => db.from('card_payments').select('id, user_id')
        .not('paid_at', 'is', null).lt('paid_at', range.startIso).in('user_id', batch).order('id').range(a, b));
      for (const p of prior) priorUserIds.add(String(p.user_id));
    }

    return respond(buildReport({ range, now, orderRows: [...inRange, ...pending], products, subscriptions, payments, priorUserIds }));
  } catch {
    return respond({ error: 'QUERY_FAILED' }, 500);
  }
}
