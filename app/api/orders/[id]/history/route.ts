import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import type { OrderStatusHistory } from '@/lib/types';

// GET /api/orders/[id]/history — 取得本人訂單的狀態更新紀錄(依時間排序)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('order_status_history')
    .select('*')
    .eq('order_id', id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 給客人看的紀錄:拿掉庫存回補、金流後台退刷等內部作業說明(後台仍保留完整紀錄)
  const rows = ((data ?? []) as OrderStatusHistory[])
    .filter((h) => !/尚未標記退款/.test(h.note ?? '')) // 內部提醒,不給客人看
    .map((h) => ({ ...h, note: customerNote(h.note) }));
  return NextResponse.json(rows);
}

function customerNote(note?: string) {
  if (!note) return note;
  return note
    .replace(/並?回補庫存/g, '')
    .replace(/[,，]?\s*需退款\s*[(（]請至金流後台退刷[)）]/g, ',將為你辦理退款')
    .replace(/[(（]請至金流後台退刷[)）]/g, '')
    .trim();
}
